import os
import pandas as pd
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional, Tuple
from .common.enums import DataSourceType, DataQualityStatus, OccupancyGranularity
from .common.models import (
    NormalizedReading,
    NormalizedOccupancy,
    RejectedRow,
    ImportBatchSummary,
)
from .common.timezone_utils import parse_and_convert_to_utc
from .common.physics import integrate_power_series_to_kwh, compute_cumulative_delta
from .common.validator import (
    compute_file_sha256,
    validate_electrical_parameters,
    detect_duplicates_and_gaps,
    finalize_batch_summary,
)

PREPROCESSING_VERSION = "v1.0.0-iblend-trapz"
IBLEND_TIMEZONE = "Asia/Kolkata"


class IBlendImporter:
    """
    Importer for I-BLEND (IIIT Delhi Campus Electricity & Occupancy Dataset).

    Features:
      - Preserves original IST timestamps while normalizing to UTC ISO-8601.
      - Integrates 1-minute active power (Watts) into hourly interval energy (kWh)
        via trapezoidal integration, preserving electrical quality metrics (V, A, Hz, PF).
      - Supports cumulative energy counter columns with rollover detection.
      - Processes building-level Wi-Fi occupancy without inventing classroom schedules.
    """

    def __init__(
        self,
        target_interval_minutes: int = 60,
        max_gap_minutes: Optional[float] = 15.0,
        single_sample_minutes: float = 1.0,
    ):
        self.target_interval_minutes = target_interval_minutes
        self.max_gap_minutes = max_gap_minutes
        self.single_sample_minutes = single_sample_minutes

    def import_electrical_csv(
        self,
        filepath: str,
        building_id: str,
        meter_id: str,
        power_unit: str = "W",
        cumulative_limit_kwh: Optional[float] = None,
    ) -> Tuple[List[NormalizedReading], ImportBatchSummary]:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"I-BLEND file not found: {filepath}")

        df = pd.read_csv(filepath)
        file_hash = compute_file_sha256(filepath)

        summary = ImportBatchSummary(
            dataset_name=f"I-BLEND_{building_id}",
            data_source=DataSourceType.IBLEND_REAL_WORLD,
            license="CC-BY-4.0 (IIIT Delhi / ACM BuildSys)",
            source_url="https://repository.iiitd.edu.in/xmlui/handle/123456789/759",
            original_filename=os.path.basename(filepath),
            file_sha256=file_hash,
            source_timezone=IBLEND_TIMEZONE,
            raw_unit=power_unit,
            preprocessing_ver=PREPROCESSING_VERSION,
            total_rows_processed=len(df),
        )

        # Normalize column names case-insensitively
        col_map = {c.lower().strip(): c for c in df.columns}
        ts_col = col_map.get("timestamp") or col_map.get("time") or col_map.get("date")
        p_col = (
            col_map.get("power_w")
            or col_map.get("power")
            or col_map.get("w")
            or col_map.get("active_power")
        )
        cum_col = col_map.get("energy_kwh") or col_map.get("cumulative_kwh") or col_map.get("kwh")
        v_col = col_map.get("voltage") or col_map.get("voltage_v") or col_map.get("v")
        i_col = col_map.get("current") or col_map.get("current_a") or col_map.get("a")
        f_col = col_map.get("frequency") or col_map.get("frequency_hz") or col_map.get("hz")
        pf_col = col_map.get("power_factor") or col_map.get("pf")

        if not ts_col or (not p_col and not cum_col):
            raise ValueError(
                f"I-BLEND CSV missing required timestamp or power/energy columns. Found: {list(df.columns)}"
            )

        parsed_rows: List[Dict[str, Any]] = []
        rejected: List[RejectedRow] = []
        seen_raw_ts = set()

        for idx, row in df.iterrows():
            raw_ts = row.get(ts_col)
            raw_val = row.get(p_col) if p_col else row.get(cum_col)

            if pd.isna(raw_ts) or pd.isna(raw_val):
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=building_id,
                        external_meter_id=meter_id,
                        raw_timestamp=None if pd.isna(raw_ts) else str(raw_ts),
                        raw_value=None if pd.isna(raw_val) else str(raw_val),
                        reason="Missing timestamp or electrical measurement (never silently imputed).",
                    )
                )
                continue

            try:
                dt_utc, utc_iso, local_iso, tz_warn = parse_and_convert_to_utc(str(raw_ts), IBLEND_TIMEZONE)
            except ValueError as e:
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=building_id,
                        external_meter_id=meter_id,
                        raw_timestamp=str(raw_ts),
                        raw_value=str(raw_val),
                        reason=f"Timestamp parse error: {e}",
                    )
                )
                continue

            try:
                num_val = float(raw_val)
            except (TypeError, ValueError):
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=building_id,
                        external_meter_id=meter_id,
                        raw_timestamp=str(raw_ts),
                        raw_value=str(raw_val),
                        reason=f"Non-numeric reading: '{raw_val}'",
                    )
                )
                continue

            if num_val < 0 and p_col:
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=building_id,
                        external_meter_id=meter_id,
                        raw_timestamp=str(raw_ts),
                        raw_value=str(raw_val),
                        reason=f"Negative instantaneous power ({num_val} {power_unit}) rejected.",
                    )
                )
                continue

            if utc_iso in seen_raw_ts:
                summary.duplicate_count += 1
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=building_id,
                        external_meter_id=meter_id,
                        raw_timestamp=local_iso,
                        raw_value=str(raw_val),
                        reason=f"Duplicate raw timestamp at UTC '{utc_iso}'.",
                    )
                )
                continue
            seen_raw_ts.add(utc_iso)

            # Optional electrical telemetry
            v_val = float(row[v_col]) if v_col and pd.notna(row.get(v_col)) else None
            i_val = float(row[i_col]) if i_col and pd.notna(row.get(i_col)) else None
            f_val = float(row[f_col]) if f_col and pd.notna(row.get(f_col)) else None
            pf_val = float(row[pf_col]) if pf_col and pd.notna(row.get(pf_col)) else None

            elec_warn = validate_electrical_parameters(v_val, pf_val, f_val)
            combined_warn = "; ".join(w for w in [elec_warn, tz_warn] if w) or None

            parsed_rows.append(
                {
                    "row_num": int(idx) + 2,
                    "dt_utc": dt_utc,
                    "dt_local": dt_utc.astimezone(ZoneInfo(IBLEND_TIMEZONE)),
                    "utc_iso": utc_iso,
                    "local_iso": local_iso,
                    "val": num_val,
                    "v": v_val,
                    "i": i_val,
                    "f": f_val,
                    "pf": pf_val,
                    "warn": combined_warn,
                }
            )

        parsed_rows.sort(key=lambda x: x["dt_utc"])
        readings: List[NormalizedReading] = []

        if p_col:
            # Group 1-minute power readings into target_interval_minutes buckets in local IST time
            # (prevents IST +05:30 half-hour offset from splitting a local hour across two UTC hours)
            buckets: Dict[datetime, List[Dict[str, Any]]] = {}
            for r in parsed_rows:
                dt_loc = r["dt_local"]
                minute_bucket = (dt_loc.minute // self.target_interval_minutes) * self.target_interval_minutes
                bucket_loc = dt_loc.replace(minute=minute_bucket, second=0, microsecond=0)
                bucket_utc = bucket_loc.astimezone(timezone.utc)
                buckets.setdefault(bucket_utc, []).append(r)

            for bucket_dt in sorted(buckets.keys()):
                group = buckets[bucket_dt]
                ts_list = [g["dt_utc"] for g in group]
                watts_list = [
                    g["val"] * 1000.0 if power_unit.lower() == "kw" else g["val"]
                    for g in group
                ]

                (
                    energy_kwh,
                    avg_kw,
                    integrated_minutes,
                    skipped_gaps,
                    skipped_gap_min,
                ) = integrate_power_series_to_kwh(
                    ts_list,
                    watts_list,
                    method="trapezoidal",
                    max_gap_minutes=self.max_gap_minutes,
                    single_sample_minutes=self.single_sample_minutes,
                )

                if integrated_minutes <= 0:
                    rejected.append(
                        RejectedRow(
                            row_number=group[0]["row_num"],
                            external_building_id=building_id,
                            external_meter_id=meter_id,
                            raw_timestamp=group[0]["local_iso"],
                            raw_value=str(group[0]["val"]),
                            reason=(
                                f"All {skipped_gaps} interval(s) in bucket exceeded max_gap_minutes "
                                f"({self.max_gap_minutes}m); skipped {skipped_gap_min}m without silent interpolation."
                            ),
                        )
                    )
                    continue

                mean_raw = sum(g["val"] for g in group) / len(group)

                # Aggregate electrical power quality averages
                v_vals = [g["v"] for g in group if g["v"] is not None]
                i_vals = [g["i"] for g in group if g["i"] is not None]
                f_vals = [g["f"] for g in group if g["f"] is not None]
                pf_vals = [g["pf"] for g in group if g["pf"] is not None]
                warns = [g["warn"] for g in group if g["warn"]]

                actual_interval_min = max(1, int(round(integrated_minutes)))
                is_partial = actual_interval_min < self.target_interval_minutes

                notes_parts = [f"Integrated {integrated_minutes:.1f}m/{self.target_interval_minutes}m from {len(group)} sample(s)"]
                if is_partial:
                    notes_parts.append(f"Partial coverage ({actual_interval_min}m of {self.target_interval_minutes}m)")
                if skipped_gaps > 0:
                    notes_parts.append(f"Skipped {skipped_gaps} gap(s) ({skipped_gap_min:.1f}m) without interpolation")
                if warns:
                    notes_parts.extend(sorted(set(warns)))

                status = (
                    DataQualityStatus.FLAGGED_OUTLIER
                    if (warns or is_partial or skipped_gaps > 0)
                    else DataQualityStatus.CALCULATED_INTERVAL
                )
                bucket_utc_iso = bucket_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

                readings.append(
                    NormalizedReading(
                        external_building_id=building_id,
                        external_meter_id=meter_id,
                        timestamp_utc=bucket_utc_iso,
                        source_local_time=group[0]["local_iso"],
                        consumption_kwh=energy_kwh,
                        power_kw=avg_kw,
                        raw_reading=round(mean_raw, 4),
                        raw_unit=power_unit,
                        interval_minutes=actual_interval_min,
                        data_source=DataSourceType.IBLEND_REAL_WORLD,
                        quality_status=status,
                        voltage_v=round(sum(v_vals) / len(v_vals), 2) if v_vals else None,
                        current_a=round(sum(i_vals) / len(i_vals), 2) if i_vals else None,
                        frequency_hz=round(sum(f_vals) / len(f_vals), 2) if f_vals else None,
                        power_factor=round(sum(pf_vals) / len(pf_vals), 3) if pf_vals else None,
                        notes="; ".join(notes_parts),
                    )
                )
        else:
            # Cumulative energy counter processing
            for i in range(1, len(parsed_rows)):
                prev = parsed_rows[i - 1]
                curr = parsed_rows[i]
                delta_kwh, status, note = compute_cumulative_delta(
                    curr["val"],
                    prev["val"],
                    counter_rollover_limit=cumulative_limit_kwh,
                )
                if delta_kwh is None:
                    rejected.append(
                        RejectedRow(
                            row_number=curr["row_num"],
                            external_building_id=building_id,
                            external_meter_id=meter_id,
                            raw_timestamp=curr["local_iso"],
                            raw_value=str(curr["val"]),
                            reason=note or "Invalid cumulative meter difference.",
                            quality_status=status,
                        )
                    )
                    continue

                dt_hours = max(1e-6, (curr["dt_utc"] - prev["dt_utc"]).total_seconds() / 3600.0)
                readings.append(
                    NormalizedReading(
                        external_building_id=building_id,
                        external_meter_id=meter_id,
                        timestamp_utc=curr["utc_iso"],
                        source_local_time=curr["local_iso"],
                        consumption_kwh=delta_kwh,
                        power_kw=round(delta_kwh / dt_hours, 4),
                        raw_reading=curr["val"],
                        raw_unit=power_unit,
                        interval_minutes=int(round(dt_hours * 60)),
                        data_source=DataSourceType.IBLEND_REAL_WORLD,
                        quality_status=status,
                        notes=note,
                    )
                )

        clean, dups, missing_cnt = detect_duplicates_and_gaps(readings, self.target_interval_minutes)
        rejected.extend(dups)
        summary.duplicate_count += len(dups)
        finalize_batch_summary(summary, clean, rejected, missing_cnt)
        return clean, summary

    def import_building_occupancy_csv(
        self,
        filepath: str,
        building_id: str,
    ) -> Tuple[List[NormalizedOccupancy], List[RejectedRow]]:
        """
        Imports building-level Wi-Fi derived occupancy from I-BLEND.
        Enforces OccupancyGranularity.BUILDING_LEVEL and NEVER invents classroom-level occupancy.
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"I-BLEND occupancy file not found: {filepath}")

        df = pd.read_csv(filepath)
        col_map = {c.lower().strip(): c for c in df.columns}
        ts_col = col_map.get("timestamp") or col_map.get("time") or col_map.get("date")
        occ_col = (
            col_map.get("occupancy")
            or col_map.get("occupancy_count")
            or col_map.get("wifi_count")
            or col_map.get("count")
        )

        if not ts_col or not occ_col:
            raise ValueError(f"Missing timestamp or occupancy columns in {filepath}")

        records: List[NormalizedOccupancy] = []
        rejected: List[RejectedRow] = []

        for idx, row in df.iterrows():
            raw_ts = row.get(ts_col)
            raw_occ = row.get(occ_col)
            if pd.isna(raw_ts) or pd.isna(raw_occ):
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=building_id,
                        external_meter_id=None,
                        raw_timestamp=None if pd.isna(raw_ts) else str(raw_ts),
                        raw_value=None if pd.isna(raw_occ) else str(raw_occ),
                        reason="Missing occupancy timestamp or count.",
                    )
                )
                continue

            try:
                _, utc_iso, local_iso, _ = parse_and_convert_to_utc(str(raw_ts), IBLEND_TIMEZONE)
                count = int(round(float(raw_occ)))
                if count < 0:
                    raise ValueError("Negative occupancy count")
            except ValueError as e:
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=building_id,
                        external_meter_id=None,
                        raw_timestamp=str(raw_ts),
                        raw_value=str(raw_occ),
                        reason=f"Invalid occupancy record: {e}",
                    )
                )
                continue

            records.append(
                NormalizedOccupancy(
                    external_building_id=building_id,
                    timestamp_utc=utc_iso,
                    source_local_time=local_iso,
                    occupancy_count=count,
                    source_type="WIFI_ASSOCIATION",
                    granularity=OccupancyGranularity.BUILDING_LEVEL,
                    data_source=DataSourceType.IBLEND_REAL_WORLD,
                    confidence=0.85,
                )
            )

        return records, rejected
