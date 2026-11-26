from pydantic import BaseModel
from typing import List, Optional

class ScheduleItem(BaseModel):
    building_id: str
    room_id: str
    day_of_week: Optional[int] = None  # 0=Monday, 6=Sunday
    start_time: str  # "09:00" or ISO timestamp
    end_time: str    # "11:00" or ISO timestamp
    activity_name: str
    activity_type: str = "lecture"  # lecture, lab, exam, event
    expected_occupancy: int = 30

class RoomReading(BaseModel):
    timestamp: str
    building_id: str
    room_id: str
    consumption_kwh: float
    power_kw: Optional[float] = None
    observed_occupancy: Optional[int] = None

class OperationalCorrelationRequest(BaseModel):
    schedules: List[ScheduleItem]
    readings: List[RoomReading]
    default_tariff: float = 0.15  # $ or local currency per kWh
    idle_threshold_kwh: Optional[float] = 2.0

class InefficiencyFinding(BaseModel):
    building_id: str
    room_id: str
    start_time: str
    end_time: str
    inefficiency_type: str  # unscheduled_high_consumption, equipment_overrun, low_occupancy_waste, abnormal_peak
    expected_status: str
    actual_consumption_kwh: float
    idle_baseline_kwh: float
    excess_kwh: float
    estimated_cost_impact: float
    confidence: float
    severity: str
    suggested_investigation: str

class OperationalCorrelationResponse(BaseModel):
    total_hours_analyzed: int
    scheduled_hours: int
    unscheduled_hours: int
    total_inefficiency_instances: int
    total_excess_kwh: float
    total_estimated_waste_cost: float
    findings: List[InefficiencyFinding]
