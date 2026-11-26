import os
import pandas as pd
from typing import List, Dict, Optional, Tuple
from .common.enums import DataSourceType, DataQualityStatus
from .common.models import (
    NormalizedBuilding,
    NormalizedReading,
    RejectedRow,
    ImportBatchSummary,
)
from .common.timezone_utils import parse_and_convert_to_utc
from .common.physics import convert_to_kwh
from .common.validator import (
    compute_file_sha256,
    detect_duplicates_and_gaps,
    finalize_batch_summary,
)

PREPROCESSING_VERSION = "v1.0.0-bdg2"

# Standard BDG2 site timezone lookup (North America & Europe)
BDG2_SITE_TIMEZONES: Dict[str, str] = {
    "Panther": "America/New_York",
    "Robin": "Europe/London",
    "Fox": "America/Los_Angeles",
    "Rat": "America/New_York",
    "Bear": "America/Los_Angeles",
    "Lamb": "Europe/London",
    "Eagle": "America/New_York",
    "Moose": "America/Toronto",
    "Gator": "America/New_York",
    "Bull": "America/Chicago",
    "Bobcat": "America/Denver",
    "Peacock": "America/New_York",
    "Wolf": "Europe/Dublin",
    "Cockatoo": "Australia/Sydney",
    "Crow": "America/Toronto",
    "Swan": "Europe/London",
    "Hog": "America/Chicago",
    "Shrew": "Europe/London",
    "Gnat": "America/New_York",
}


class BDG2Importer:
    """
    Importer for Building Data Genome Project 2 (BDG2).
    Handles non-residential buildings across North America and Europe.
    """

    def parse_metadata(self, metadata_filepath: str) -> Dict[str, NormalizedBuilding]:
        if not os.path.exists(metadata_filepath):
            raise FileNotFoundError(f"BDG2 metadata.csv not found: {metadata_filepath}")

        df = pd.read_csv(metadata_filepath)
        buildings: Dict[str, NormalizedBuilding] = {}

        for _, row in df.iterrows():
            b_id = str(row["building_id"]).strip()
            site_id = str(row.get("site_id", "")).strip() if pd.notna(row.get("site_id")) else None
            usage = str(row.get("primaryspaceusage", "NonResidential")).strip() if pd.notna(row.get("primaryspaceusage")) else "NonResidential"

            sqft = None
            if pd.notna(row.get("sqft")):
                sqft = float(row["sqft"])
            elif pd.notna(row.get("sqm")):
                sqft = round(float(row["sqm"]) * 10.7639, 2)

            year_built = int(row["yearbuilt"]) if pd.notna(row.get("yearbuilt")) else None

            # Map space usage honestly without assuming every building is educational
            usage_lower = usage.lower()
            if "education" in usage_lower or "classroom" in usage_lower:
                b_type = "ACADEMIC"
            elif "lab" in usage_lower:
                b_type = "LAB"
            elif "office" in usage_lower:
                b_type = "OFFICE"
            elif "lodging" in usage_lower or "dorm" in usage_lower:
                b_type = "RESIDENTIAL"
            else:
                b_type = "COMMERCIAL"

            buildings[b_id] = NormalizedBuilding(
                external_id=b_id,
                name=b_id,
                building_type=b_type,
                data_source=DataSourceType.BDG2_BENCHMARK,
                site_id=site_id,
                total_area_sqft=sqft,
                year_built=year_built,
                primary_space_usage=usage,
            )
        return buildings

    def parse_weather(self, weather_filepath: str, site_tz_map: Optional[Dict[str, str]] = None) -> Dict[Tuple[str, str], float]:
        """Returns lookup {(site_id, utc_iso): air_temperature_c}."""
        if not os.path.exists(weather_filepath):
            return {}

        tz_lookup = {**BDG2_SITE_TIMEZONES, **(site_tz_map or {})}
        df = pd.read_csv(weather_filepath)
        weather_map: Dict[Tuple[str, str], float] = {}

        for _, row in df.iterrows():
            site_id = str(row.get("site_id", "")).strip()
            raw_ts = row.get("timestamp")
            temp = row.get("airTemperature")
            if pd.isna(raw_ts) or pd.isna(temp) or not site_id:
                continue
            tz_name = tz_lookup.get(site_id, "UTC")
            try:
                _, utc_iso, _ = parse_and_convert_to_utc(str(raw_ts), tz_name)[:3]
                weather_map[(site_id, utc_iso)] = float(temp)
            except ValueError:
                continue
        return weather_map

    def import_electricity_csv(
        self,
        electricity_filepath: str,
        metadata_filepath: str,
        weather_filepath: Optional[str] = None,
        building_filter: Optional[List[str]] = None,
        raw_unit: str = "kWh",
    ) -> Tuple[List[NormalizedBuilding], List[NormalizedReading], ImportBatchSummary]:
        if raw_unit.strip().lower() not in {"kwh", "wh", "mwh"}:
            raise ValueError(
                f"Unsupported or invalid electricity energy unit '{raw_unit}' for BDG2 electricity.csv. Expected kWh, Wh, or MWh."
            )

        if not os.path.exists(electricity_filepath):
            raise FileNotFoundError(f"BDG2 electricity.csv not found: {electricity_filepath}")

        buildings_map = self.parse_metadata(metadata_filepath)
        weather_map = self.parse_weather(weather_filepath) if weather_filepath else {}

        df = pd.read_csv(electricity_filepath)
        file_hash = compute_file_sha256(electricity_filepath)

        meter_cols = [c for c in df.columns if c != "timestamp"]
        if building_filter:
            meter_cols = [c for c in meter_cols if c in building_filter]

        summary = ImportBatchSummary(
            dataset_name="BDG2_Electricity",
            data_source=DataSourceType.BDG2_BENCHMARK,
            license="MIT / Open Data (Building Data Genome Project 2)",
            source_url="https://github.com/buds-lab/building-data-genome-project-2",
            original_filename=os.path.basename(electricity_filepath),
            file_sha256=file_hash,
            source_timezone="MULTI_SITE_LOCAL",
            raw_unit=raw_unit,
            preprocessing_ver=PREPROCESSING_VERSION,
            total_rows_processed=len(df) * len(meter_cols),
        )

        readings: List[NormalizedReading] = []
        rejected: List[RejectedRow] = []
        selected_buildings: Dict[str, NormalizedBuilding] = {}

        for row_idx, row in df.iterrows():
            raw_ts = row.get("timestamp")
            if pd.isna(raw_ts):
                rejected.append(
                    RejectedRow(
                        row_number=int(row_idx) + 2,
                        external_building_id=None,
                        external_meter_id=None,
                        raw_timestamp=None,
                        raw_value=None,
                        reason="Missing timestamp in BDG2 electricity.csv.",
                    )
                )
                continue

            for b_id in meter_cols:
                b_meta = buildings_map.get(b_id)
                site_id = b_meta.site_id if b_meta else None
                tz_name = BDG2_SITE_TIMEZONES.get(site_id, "UTC") if site_id else "UTC"

                if b_meta and b_id not in selected_buildings:
                    selected_buildings[b_id] = b_meta

                raw_val = row.get(b_id)
                if pd.isna(raw_val):
                    rejected.append(
                        RejectedRow(
                            row_number=int(row_idx) + 2,
                            external_building_id=b_id,
                            external_meter_id=f"{b_id}_electricity",
                            raw_timestamp=str(raw_ts),
                            raw_value=None,
                            reason="Missing reading (NaN) — preserved as missing without silent interpolation.",
                        )
                    )
                    continue

                try:
                    _, utc_iso, local_iso, _tz_warn = parse_and_convert_to_utc(str(raw_ts), tz_name)
                    val_float = float(raw_val)
                except ValueError as e:
                    rejected.append(
                        RejectedRow(
                            row_number=int(row_idx) + 2,
                            external_building_id=b_id,
                            external_meter_id=f"{b_id}_electricity",
                            raw_timestamp=str(raw_ts),
                            raw_value=str(raw_val),
                            reason=f"Parse error: {e}",
                        )
                    )
                    continue

                if val_float < 0:
                    rejected.append(
                        RejectedRow(
                            row_number=int(row_idx) + 2,
                            external_building_id=b_id,
                            external_meter_id=f"{b_id}_electricity",
                            raw_timestamp=local_iso,
                            raw_value=str(val_float),
                            reason=f"Negative energy reading ({val_float} {raw_unit}) rejected.",
                        )
                    )
                    continue

                kwh = convert_to_kwh(val_float, raw_unit, interval_minutes=60)
                temp_c = weather_map.get((site_id, utc_iso)) if site_id else None

                readings.append(
                    NormalizedReading(
                        external_building_id=b_id,
                        external_meter_id=f"{b_id}_electricity",
                        timestamp_utc=utc_iso,
                        source_local_time=local_iso,
                        consumption_kwh=round(kwh, 6),
                        power_kw=round(kwh, 4),
                        raw_reading=val_float,
                        raw_unit=raw_unit,
                        interval_minutes=60,
                        data_source=DataSourceType.BDG2_BENCHMARK,
                        quality_status=DataQualityStatus.MEASURED,
                        temperature_c=temp_c,
                        notes=f"Site={site_id or 'Unknown'}, TZ={tz_name}",
                    )
                )

        clean, dups, missing_cnt = detect_duplicates_and_gaps(readings, expected_interval_minutes=60)
        rejected.extend(dups)
        summary.duplicate_count += len(dups)
        finalize_batch_summary(summary, clean, rejected, missing_cnt)
        return list(selected_buildings.values()), clean, summary
