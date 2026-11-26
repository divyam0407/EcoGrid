from pydantic import BaseModel
from typing import List, Optional

class AnomalyReading(BaseModel):
    timestamp: str
    consumption_kwh: float
    power_kw: Optional[float] = None
    building_id: Optional[str] = "unknown"
    room_id: Optional[str] = None
    meter_id: Optional[str] = None
    expected_baseline_kwh: Optional[float] = None
    is_scheduled_period: Optional[bool] = True
    quality_status: Optional[str] = None
    interval_minutes: Optional[int] = None
    is_holiday: Optional[bool] = None
    is_exam_period: Optional[bool] = None
    scheduled_classes: Optional[int] = None
    schedule_data_available: Optional[bool] = None
    calendar_data_available: Optional[bool] = None

class AnomalyDetectionRequest(BaseModel):
    method: str = "combined"  # z_score, isolation_forest, combined
    sensitivity: float = 2.0  # z-score threshold or contamination factor
    timezone: str = "UTC"
    readings: List[AnomalyReading]

class DetectedAnomaly(BaseModel):
    timestamp: str
    building_id: str
    room_id: Optional[str] = None
    meter_id: Optional[str] = None
    anomaly_type: str  # spike, high_idle, unscheduled_surge, sudden_drop
    severity: str      # low, medium, high, critical
    expected_value: float
    observed_value: float
    deviation_percent: float
    deviation_kwh: float
    confidence: Optional[float] = None
    baseline_sample_count: Optional[int] = None
    quality_status: Optional[str] = None
    interval_minutes: Optional[int] = None
    operational_context: Optional[dict] = None
    detection_method: str
    description: str
    suggested_action: Optional[str] = None

class AnomalyDetectionResponse(BaseModel):
    total_analyzed: int
    anomalies_found: int
    anomalies: List[DetectedAnomaly]
