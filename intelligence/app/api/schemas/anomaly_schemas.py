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

class AnomalyDetectionRequest(BaseModel):
    method: str = "combined"  # z_score, isolation_forest, combined
    sensitivity: float = 2.0  # z-score threshold or contamination factor
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
    confidence: float
    detection_method: str
    description: str
    suggested_action: str

class AnomalyDetectionResponse(BaseModel):
    total_analyzed: int
    anomalies_found: int
    anomalies: List[DetectedAnomaly]
