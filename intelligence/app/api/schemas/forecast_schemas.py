from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class HistoricalReading(BaseModel):
    timestamp: str  # ISO 8601 string
    consumption_kwh: float
    power_kw: Optional[float] = None
    temperature_c: Optional[float] = 22.0
    is_holiday: Optional[bool] = False
    scheduled_occupancy: Optional[int] = 0
    scheduled_classes: Optional[int] = 0

class OperationalFeature(BaseModel):
    timestamp: str
    scheduled_classes: int = 0
    scheduled_occupancy: int = 0
    is_holiday: bool = False
    temperature_c: Optional[float] = 22.0

class ForecastRequest(BaseModel):
    building_id: Optional[str] = "all"
    horizon_hours: int = 24  # 24 or 168 (7 days)
    model_type: str = "xgboost"  # baseline, random_forest, xgboost
    historical_data: List[HistoricalReading]
    future_operational_data: Optional[List[OperationalFeature]] = []

class ForecastPoint(BaseModel):
    timestamp: str
    predicted_demand_kw: float
    predicted_consumption_kwh: float
    confidence_lower: float
    confidence_upper: float
    factors: Dict[str, Any] = {}

class ForecastMetrics(BaseModel):
    mae: float
    rmse: float
    mape: float
    train_size: int
    test_size: int

class ForecastResponse(BaseModel):
    model_name: str
    model_version: str
    forecast_generated_at: str
    horizon_hours: int
    metrics: Optional[ForecastMetrics] = None
    forecasts: List[ForecastPoint]
