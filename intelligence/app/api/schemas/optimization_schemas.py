from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class TariffPeriodInput(BaseModel):
    start_hour: int
    end_hour: int
    price_per_kwh: float
    period_name: str = "standard"  # off_peak, standard, peak

class OptimizationRequest(BaseModel):
    building_id: Optional[str] = "all"
    timestamps: List[str]
    predicted_demand_kw: List[float]
    solar_generation_kw: List[float]
    tariffs: List[float]  # tariff per kWh for each interval
    battery_capacity_kwh: float = 100.0
    initial_soc_kwh: float = 20.0
    min_soc_kwh: float = 10.0
    max_soc_kwh: float = 95.0
    max_charge_kw: float = 30.0
    max_discharge_kw: float = 30.0
    charge_efficiency: float = 0.92
    discharge_efficiency: float = 0.92
    battery_degradation_cost_per_kwh: float = 0.015
    peak_demand_limit_kw: Optional[float] = None
    peak_demand_charge_per_kw: Optional[float] = 12.0

class OptimizationIntervalResult(BaseModel):
    timestamp: str
    demand_kw: float
    tariff_per_kwh: float
    solar_available_kw: float
    solar_used_kw: float
    solar_curtailed_kw: float
    grid_import_kw: float
    battery_charge_kw: float
    battery_discharge_kw: float
    battery_soc_kwh: float
    battery_soc_percent: float
    cost_baseline: float
    cost_optimized: float
    savings: float

class OptimizationResponse(BaseModel):
    solver_status: str  # Optimal, Feasible, Infeasible
    optimization_type: str
    total_baseline_cost: float
    total_optimized_cost: float
    total_estimated_savings: float
    savings_percentage: float
    total_demand_kwh: float
    total_solar_used_kwh: float
    total_grid_import_kwh: float
    total_battery_discharged_kwh: float
    peak_demand_baseline_kw: float
    peak_demand_optimized_kw: float
    peak_demand_reduction_kw: float
    schedule: List[OptimizationIntervalResult]
