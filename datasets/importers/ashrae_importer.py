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

PREPROCESSING_VERSION = "v1.0.0-ashrae"

# Published ASHRAE GEPIII site timezone alignment (approximate local timezones for sites 0-15)
ASHRAE_SITE_TIMEZONES: Dict[int, str] = {
    0: "America/New_York",
    1: "Europe/London",
    2: "America/Phoenix",
    3: "America/New_York",
    4: "America/Los_Angeles",
    5: "Europe/London",
    6: "America/New_York",
    7: "America/Toronto",
    8: "America/New_York",
    9: "America/Chicago",
    10: "America/Denver",
    11: "America/Toronto",
    12: "Europe/Dublin",
    13: "America/Chicago",
    14: "America/New_York",
    15: "America/New_York",
}


class AshraeImporter:
    """
    Importer for ASHRAE Great Energy Predictor III (GEPIII).
    Filters electricity meters (meter == 0) and preserves building metadata and site timezones.
    """

    def parse_metadata(self, metadata_filepath: str) -> Dict[str, NormalizedBuilding]:
        if not os.path.exists(metadata_filepath):
            raise FileNotFoundError(f"ASHRAE building_metadata.csv not found: {metadata_filepath}")

        df = pd.read_csv(metadata_filepath)
        buildings: Dict[str, NormalizedBuilding] = {}

        for _, row in df.iterrows():
            b_id = str(int(row["building_id"]))
            site_id = int(row["site_id"]) if pd.notna(row.get("site_id")) else None
            primary_use = str(row.get("primary_use", "Other")).strip() if pd.notna(row.get("primary_use")) else "Other"
            sqft = float(row["square_feet"]) if pd.notna(row.get("square_feet")) else None
            year_built = int(row["year_built"]) if pd.notna(row.get("year_built")) else None
            floor_count = int(row["floor_count"]) if pd.notna(row.get("floor_count")) else None

            use_lower = primary_use.lower()
            if "education" in use_lower:
                b_type = "ACADEMIC"
            elif "office" in use_lower:
                b_type = "OFFICE"
            elif "lodging" in use_lower or "residential" in use_lower:
                b_type = "RESIDENTIAL"
            else:
                b_type = "COMMERCIAL"

            buildings[b_id] = NormalizedBuilding(
                external_id=b_id,
                name=f"ASHRAE_Building_{b_id}",
                building_type=b_type,
                data_source=DataSourceType.ASHRAE_GEPIII,
                site_id=f"Site_{site_id}" if site_id is not None else None,
                total_area_sqft=sqft,
                year_built=year_built,
                floor_count=floor_count,
                primary_space_usage=primary_use,
            )
        return buildings

    def parse_weather(self, weather_filepath: str) -> Dict[Tuple[int, str], float]:
        """Returns lookup {(site_id, utc_iso): air_temperature_c}."""
        if not os.path.exists(weather_filepath):
            return {}

        df = pd.read_csv(weather_filepath)
        weather_map: Dict[Tuple[int, str], float] = {}

        for _, row in df.iterrows():
            if pd.isna(row.get("site_id")) or pd.isna(row.get("timestamp")) or pd.isna(row.get("air_temperature")):
                continue
            site_id = int(row["site_id"])
            tz_name = ASHRAE_SITE_TIMEZONES.get(site_id, "UTC")
            try:
                _, utc_iso, _ = parse_and_convert_to_utc(str(row["timestamp"]), tz_name, reject_ambiguous=True)[:3]
                weather_map[(site_id, utc_iso)] = float(row["air_temperature"])
            except ValueError:
                continue
        return weather_map

    def import_train_csv(
        self,
        train_filepath: str,
        metadata_filepath: str,
        weather_filepath: Optional[str] = None,
        building_filter: Optional[List[str]] = None,
        raw_unit: str = "kWh",
        explicit_site_0_kbtu_override: bool = False,
    ) -> Tuple[List[NormalizedBuilding], List[NormalizedReading], ImportBatchSummary]:
        # Official ASHRAE GEPIII source unit for meter=0 (electricity) is kWh.
        # Reject unsupported or incorrectly labelled units unless explicitly documented.
        allowed_elec_units = {"kwh", "wh", "mwh"}
        unit_norm = raw_unit.strip().lower()
        if unit_norm == "kbtu":
            if not explicit_site_0_kbtu_override:
                raise ValueError(
                    "Unit 'kBTU' is not valid for ASHRAE electricity (meter=0) without explicit_site_0_kbtu_override=True."
                )
        elif unit_norm not in allowed_elec_units:
            raise ValueError(
                f"Unsupported or invalid unit '{raw_unit}' for ASHRAE electricity (meter=0). Expected kWh, Wh, or MWh."
            )

        if not os.path.exists(train_filepath):
            raise FileNotFoundError(f"ASHRAE train.csv not found: {train_filepath}")

        buildings_map = self.parse_metadata(metadata_filepath)
        weather_map = self.parse_weather(weather_filepath) if weather_filepath else {}

        df = pd.read_csv(train_filepath)
        file_hash = compute_file_sha256(train_filepath)

        summary = ImportBatchSummary(
            dataset_name="ASHRAE_GEPIII_Electricity",
            data_source=DataSourceType.ASHRAE_GEPIII,
            license="ASHRAE / Kaggle Competition Open Dataset",
            source_url="https://www.kaggle.com/c/ashrae-energy-prediction",
            original_filename=os.path.basename(train_filepath),
            file_sha256=file_hash,
            source_timezone="MULTI_SITE_LOCAL",
            raw_unit="kWh",
            preprocessing_ver=PREPROCESSING_VERSION,
            total_rows_processed=len(df),
        )

        # Filter exclusively for electricity meter (meter == 0)
        elec_df = df[df["meter"] == 0]
        filtered_out = len(df) - len(elec_df)
        if filtered_out > 0:
            summary.warnings.append(
                f"Filtered out {filtered_out} non-electricity meter rows (chilledwater/steam/hotwater)."
            )

        readings: List[NormalizedReading] = []
        rejected: List[RejectedRow] = []
        selected_buildings: Dict[str, NormalizedBuilding] = {}

        for idx, row in elec_df.iterrows():
            b_id = str(int(row["building_id"]))
            if building_filter and b_id not in building_filter:
                continue

            b_meta = buildings_map.get(b_id)
            site_num = int(b_meta.site_id.replace("Site_", "")) if (b_meta and b_meta.site_id) else 0
            tz_name = ASHRAE_SITE_TIMEZONES.get(site_num, "UTC")

            if b_meta and b_id not in selected_buildings:
                selected_buildings[b_id] = b_meta

            raw_ts = row.get("timestamp")
            raw_val = row.get("meter_reading")

            if pd.isna(raw_ts) or pd.isna(raw_val):
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=b_id,
                        external_meter_id=f"ashrae_{b_id}_m0",
                        raw_timestamp=None if pd.isna(raw_ts) else str(raw_ts),
                        raw_value=None if pd.isna(raw_val) else str(raw_val),
                        reason="Missing timestamp or meter_reading in ASHRAE train.csv.",
                    )
                )
                continue

            try:
                _, utc_iso, local_iso, tz_warn = parse_and_convert_to_utc(str(raw_ts), tz_name, reject_ambiguous=True)
                val_float = float(raw_val)
            except ValueError as e:
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=b_id,
                        external_meter_id=f"ashrae_{b_id}_m0",
                        raw_timestamp=str(raw_ts),
                        raw_value=str(raw_val),
                        reason=f"Parse error: {e}",
                    )
                )
                continue

            if val_float < 0:
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=b_id,
                        external_meter_id=f"ashrae_{b_id}_m0",
                        raw_timestamp=local_iso,
                        raw_value=str(val_float),
                        reason=f"Negative ASHRAE meter_reading ({val_float}) rejected.",
                    )
                )
                continue

            if site_num == 0 and explicit_site_0_kbtu_override and unit_norm == "kbtu":
                effective_raw_unit = "kBTU"
                # 1 kWh = 3.41214 kBTU -> kWh = kBTU * 0.293071
                kwh = val_float * 0.293071
            elif unit_norm == "kbtu":
                # Do not apply kBTU conversion to non-Site-0 electricity meters
                rejected.append(
                    RejectedRow(
                        row_number=int(idx) + 2,
                        external_building_id=b_id,
                        external_meter_id=f"ashrae_{b_id}_m0",
                        raw_timestamp=local_iso,
                        raw_value=str(val_float),
                        reason=f"kBTU unit not permitted for ASHRAE Site {site_num} electricity meter.",
                    )
                )
                continue
            else:
                effective_raw_unit = raw_unit
                kwh = convert_to_kwh(val_float, raw_unit, interval_minutes=60)

            temp_c = weather_map.get((site_num, utc_iso))
            status = DataQualityStatus.FLAGGED_OUTLIER if tz_warn else DataQualityStatus.MEASURED
            note = f"Site={site_num}, TZ={tz_name}" + (f"; {tz_warn}" if tz_warn else "")

            readings.append(
                NormalizedReading(
                    external_building_id=b_id,
                    external_meter_id=f"ashrae_{b_id}_m0",
                    timestamp_utc=utc_iso,
                    source_local_time=local_iso,
                    consumption_kwh=round(kwh, 6),
                    power_kw=round(kwh, 4),
                    raw_reading=val_float,
                    raw_unit=effective_raw_unit,
                    interval_minutes=60,
                    data_source=DataSourceType.ASHRAE_GEPIII,
                    quality_status=status,
                    temperature_c=temp_c,
                    notes=note,
                )
            )

        clean, dups, missing_cnt = detect_duplicates_and_gaps(readings, expected_interval_minutes=60)
        rejected.extend(dups)
        summary.duplicate_count += len(dups)
        finalize_batch_summary(summary, clean, rejected, missing_cnt)
        return list(selected_buildings.values()), clean, summary
