from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Dict, Any


class ScenarioModifications(BaseModel):
    shift_operating_hours_start: Optional[int] = Field(default=None, ge=0, le=23)
    shift_operating_hours_end: Optional[int] = Field(default=None, ge=1, le=24)
    occupancy_scaling_factor: Optional[float] = Field(default=1.0, gt=0, le=2)
    fixed_load_fraction: Optional[float] = Field(default=None, ge=0, le=1)
    idle_load_fraction: Optional[float] = Field(default=None, ge=0, le=1)
    solar_capacity_multiplier: Optional[float] = Field(default=1.0, ge=0, le=3)
    additional_solar_kw: Optional[float] = Field(default=0, ge=0)
    battery_capacity_kwh: Optional[float] = Field(default=None, gt=0)
    battery_max_charge_kw: Optional[float] = Field(default=None, gt=0)
    battery_max_discharge_kw: Optional[float] = Field(default=None, gt=0)
    battery_initial_soc_kwh: Optional[float] = Field(default=None, ge=0)
    battery_min_soc_kwh: Optional[float] = Field(default=None, ge=0)
    battery_max_soc_kwh: Optional[float] = Field(default=None, gt=0)
    battery_charge_efficiency: Optional[float] = Field(default=None, gt=0, le=1)
    battery_discharge_efficiency: Optional[float] = Field(default=None, gt=0, le=1)
    battery_degradation_cost_per_kwh: Optional[float] = Field(default=None, ge=0)
    allow_grid_charging: bool = False
    tariff_increase_percent: Optional[float] = Field(default=0.0, ge=-100, le=500)
    shift_lab_sessions_to_solar_peak: bool = False
    shifted_lab_load_kw: Optional[float] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_assumptions(self):
        battery = [self.battery_capacity_kwh, self.battery_max_charge_kw, self.battery_max_discharge_kw,
                   self.battery_initial_soc_kwh, self.battery_min_soc_kwh, self.battery_max_soc_kwh,
                   self.battery_charge_efficiency, self.battery_discharge_efficiency,
                   self.battery_degradation_cost_per_kwh]
        if self.battery_capacity_kwh is not None and any(x is None for x in battery):
            raise ValueError("battery scenarios require complete physical limits, efficiencies and degradation cost")
        if self.battery_capacity_kwh is not None and not (0 <= self.battery_min_soc_kwh <= self.battery_initial_soc_kwh <= self.battery_max_soc_kwh <= self.battery_capacity_kwh):
            raise ValueError("battery SOC and capacity limits are inconsistent")
        if self.occupancy_scaling_factor != 1 and self.fixed_load_fraction is None:
            raise ValueError("occupancy scaling requires an explicit fixed-load fraction")
        if (self.shift_operating_hours_start is not None or self.shift_operating_hours_end is not None) and self.idle_load_fraction is None:
            raise ValueError("operating-hour changes require an explicit idle-load fraction")
        if self.shift_lab_sessions_to_solar_peak and self.shifted_lab_load_kw is None:
            raise ValueError("lab-session shifts require explicit shifted load in kW")
        if self.additional_solar_kw not in (None, 0):
            raise ValueError("additional installed solar capacity requires a corresponding generation profile")
        return self


class ScenarioSimulationRequest(BaseModel):
    scenario_name: str
    scenario_description: Optional[str] = ""
    modifications: ScenarioModifications
    baseline_timestamps: List[str] = Field(min_length=1, max_length=336)
    baseline_demand_kw: List[float]
    baseline_solar_kw: List[float]
    baseline_tariffs: List[float]
    current_battery_capacity_kwh: Optional[float] = None

    @model_validator(mode="after")
    def equal_intervals(self):
        n = len(self.baseline_timestamps)
        if any(len(values) != n for values in (self.baseline_demand_kw, self.baseline_solar_kw, self.baseline_tariffs)):
            raise ValueError("scenario inputs must contain one demand, solar and tariff value per timestamp")
        if any(x < 0 for x in self.baseline_demand_kw + self.baseline_solar_kw + self.baseline_tariffs):
            raise ValueError("scenario demand, solar and tariff inputs cannot be negative")
        return self


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
