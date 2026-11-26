from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class ScenarioModifications(BaseModel):
    shift_operating_hours_start: Optional[int] = None  # e.g., start at 8 instead of 9
    shift_operating_hours_end: Optional[int] = None    # e.g., end at 17 instead of 21
    occupancy_scaling_factor: Optional[float] = 1.0     # e.g., 0.5 for 50% occupancy
    solar_capacity_multiplier: Optional[float] = 1.0    # e.g., 2.0 for doubling solar
    additional_solar_kw: Optional[float] = 0.0
    battery_capacity_kwh: Optional[float] = None
    tariff_increase_percent: Optional[float] = 0.0      # e.g., 20% tariff hike
    shift_lab_sessions_to_solar_peak: Optional[bool] = False

class ScenarioSimulationRequest(BaseModel):
    scenario_name: str
    scenario_description: Optional[str] = ""
    modifications: ScenarioModifications
    baseline_timestamps: List[str]
    baseline_demand_kw: List[float]
    baseline_solar_kw: List[float]
    baseline_tariffs: List[float]
    current_battery_capacity_kwh: float = 100.0

class ScenarioComparisonResult(BaseModel):
    scenario_name: str
    baseline_cost: float
    scenario_cost: float
    cost_difference: float
    percentage_savings: float
    baseline_total_kwh: float
    scenario_total_kwh: float
    kwh_difference: float
    baseline_peak_kw: float
    scenario_peak_kw: float
    peak_reduction_kw: float
    solar_utilization_baseline_percent: float
    solar_utilization_scenario_percent: float
    hourly_comparison: List[Dict[str, Any]]
    recommendation_summary: str
