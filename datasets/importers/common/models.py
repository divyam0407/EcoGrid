from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any
from .enums import DataSourceType, DataQualityStatus, OccupancyGranularity


@dataclass
class NormalizedBuilding:
    external_id: str
    name: str
    building_type: str
    data_source: DataSourceType
    site_id: Optional[str] = None
    total_area_sqft: Optional[float] = None
    year_built: Optional[int] = None
    floor_count: Optional[int] = None
    primary_space_usage: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["data_source"] = self.data_source.value
        return d


@dataclass
class NormalizedReading:
    external_building_id: str
    external_meter_id: str
    timestamp_utc: str          # Canonical UTC ISO-8601
    source_local_time: str      # Original timestamp string preserved verbatim
    consumption_kwh: float      # Interval energy in kWh
    power_kw: Optional[float]   # Average interval active power in kW
    raw_reading: Optional[float]
    raw_unit: str
    interval_minutes: int
    data_source: DataSourceType
    quality_status: DataQualityStatus
    voltage_v: Optional[float] = None
    current_a: Optional[float] = None
    frequency_hz: Optional[float] = None
    power_factor: Optional[float] = None
    apparent_power_va: Optional[float] = None
    reactive_power_var: Optional[float] = None
    temperature_c: Optional[float] = None
    notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["data_source"] = self.data_source.value
        d["quality_status"] = self.quality_status.value
        return d


@dataclass
class NormalizedOccupancy:
    external_building_id: str
    timestamp_utc: str
    source_local_time: str
    occupancy_count: int
    source_type: str            # e.g., "WIFI_ASSOCIATION"
    granularity: OccupancyGranularity
    data_source: DataSourceType
    confidence: float = 0.85

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["granularity"] = self.granularity.value
        d["data_source"] = self.data_source.value
        return d


@dataclass
class RejectedRow:
    row_number: int
    external_building_id: Optional[str]
    external_meter_id: Optional[str]
    raw_timestamp: Optional[str]
    raw_value: Optional[str]
    reason: str
    quality_status: DataQualityStatus = DataQualityStatus.INVALID_REJECTED

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["quality_status"] = self.quality_status.value
        return d


@dataclass
class ImportBatchSummary:
    dataset_name: str
    data_source: DataSourceType
    license: str
    source_url: Optional[str]
    original_filename: str
    file_sha256: str
    source_timezone: str
    raw_unit: str
    preprocessing_ver: str
    total_rows_processed: int = 0
    valid_records_count: int = 0
    calculated_interval_count: int = 0
    imputed_count: int = 0
    flagged_count: int = 0
    rollover_count: int = 0
    duplicate_count: int = 0
    missing_interval_count: int = 0
    rejected_count: int = 0
    min_timestamp_utc: Optional[str] = None
    max_timestamp_utc: Optional[str] = None
    rejected_rows: List[RejectedRow] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dataset_name": self.dataset_name,
            "data_source": self.data_source.value,
            "license": self.license,
            "source_url": self.source_url,
            "original_filename": self.original_filename,
            "file_sha256": self.file_sha256,
            "source_timezone": self.source_timezone,
            "raw_unit": self.raw_unit,
            "preprocessing_ver": self.preprocessing_ver,
            "total_rows_processed": self.total_rows_processed,
            "valid_records_count": self.valid_records_count,
            "calculated_interval_count": self.calculated_interval_count,
            "imputed_count": self.imputed_count,
            "flagged_count": self.flagged_count,
            "rollover_count": self.rollover_count,
            "duplicate_count": self.duplicate_count,
            "missing_interval_count": self.missing_interval_count,
            "rejected_count": self.rejected_count,
            "min_timestamp_utc": self.min_timestamp_utc,
            "max_timestamp_utc": self.max_timestamp_utc,
            "warnings": self.warnings,
            "rejected_rows": [r.to_dict() for r in self.rejected_rows],
        }
