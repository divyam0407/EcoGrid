from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class OptimizationRequest(BaseModel):
    """Interval-average power (kW), interval energy (kWh), price / kWh and hours."""
    building_id: Optional[str] = None
    timestamps: List[str] = Field(min_length=1, max_length=336)
    interval_hours: float = Field(default=1.0, gt=0, le=24)
    predicted_demand_kw: List[float]
    solar_generation_kw: List[float]
    tariffs: List[float]
    tariff_periods: List[str] = Field(default_factory=list)
    battery_capacity_kwh: Optional[float] = Field(default=None, gt=0)
    initial_soc_kwh: Optional[float] = Field(default=None, ge=0)
    min_soc_kwh: Optional[float] = Field(default=None, ge=0)
    max_soc_kwh: Optional[float] = Field(default=None, gt=0)
    max_charge_kw: Optional[float] = Field(default=None, ge=0)
    max_discharge_kw: Optional[float] = Field(default=None, ge=0)
    charge_efficiency: float = Field(default=1.0, gt=0, le=1)
    discharge_efficiency: float = Field(default=1.0, gt=0, le=1)
    battery_degradation_cost_per_kwh: float = Field(default=0, ge=0)
    reserve_soc_kwh: Optional[float] = Field(default=None, ge=0)
    final_soc_kwh: Optional[float] = Field(default=None, ge=0)
    battery_available: bool = False
    allow_grid_charging: bool = False
    allow_grid_export: bool = False
    export_price_per_kwh: Optional[float] = Field(default=None, ge=0)
    demand_charge_per_kw: Optional[float] = Field(default=None, ge=0)
    demand_window_hours: float = Field(default=1.0, gt=0, le=24)
    peak_demand_limit_kw: Optional[float] = Field(default=None, gt=0)
    fixed_charge: float = Field(default=0, ge=0)
    carbon_emission_kg_per_kwh: Optional[float] = Field(default=None, ge=0)
    data_status: str = "SIMULATED"

    @model_validator(mode="after")
    def validate_inputs(self):
        n = len(self.timestamps)
        if len(self.predicted_demand_kw) != n or len(self.solar_generation_kw) != n or len(self.tariffs) != n:
            raise ValueError("timestamps, demand, solar and tariff arrays must have equal lengths")
        if self.tariff_periods and len(self.tariff_periods) != n:
            raise ValueError("tariff period labels must be empty or have one value per interval")
        parsed = []
        for value in self.timestamps:
            try:
                stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if stamp.utcoffset() is None:
                    raise ValueError()
                parsed.append(stamp)
            except (TypeError, ValueError):
                raise ValueError("timestamps must be valid timezone-aware ISO 8601 values")
        for previous, current in zip(parsed, parsed[1:]):
            seconds = (current - previous).total_seconds()
            if abs(seconds - self.interval_hours * 3600) > 0.001:
                raise ValueError("timestamps must be strictly contiguous at the configured interval")
        if any(x < 0 for x in self.predicted_demand_kw + self.solar_generation_kw):
            raise ValueError("demand and solar generation cannot be negative")
        if any(x < 0 for x in self.tariffs):
            raise ValueError("import tariff cannot be negative")
        battery_values = [self.battery_capacity_kwh, self.initial_soc_kwh, self.min_soc_kwh,
                          self.max_soc_kwh, self.max_charge_kw, self.max_discharge_kw]
        has_battery_parameters = any(x is not None for x in battery_values)
        if self.battery_available and not has_battery_parameters:
            raise ValueError("an available battery requires complete configured capacity, SOC and power limits")
        if self.battery_available and any(x is not None for x in battery_values) and any(x is None for x in battery_values):
            raise ValueError("all battery capacity, SOC and power limits are required when battery parameters are supplied")
        if self.battery_available and self.allow_grid_charging and not all(x is not None for x in battery_values):
            raise ValueError("grid charging requires complete battery configuration")
        if self.battery_available and all(x is not None for x in battery_values):
            if not (0 <= self.min_soc_kwh <= self.initial_soc_kwh <= self.max_soc_kwh <= self.battery_capacity_kwh):
                raise ValueError("battery SOC bounds, initial SOC and capacity are inconsistent")
            if self.reserve_soc_kwh is not None and not self.min_soc_kwh <= self.reserve_soc_kwh <= self.max_soc_kwh:
                raise ValueError("battery reserve SOC must be within configured SOC bounds")
            if self.final_soc_kwh is not None and not self.min_soc_kwh <= self.final_soc_kwh <= self.max_soc_kwh:
                raise ValueError("final SOC must be within configured SOC bounds")
        elif not self.battery_available and (self.allow_grid_charging or has_battery_parameters):
            raise ValueError("battery parameters and grid charging cannot be supplied when the battery is unavailable")
        if self.allow_grid_export and self.export_price_per_kwh is None:
            raise ValueError("export requires an explicitly configured export compensation rate")
        if self.demand_window_hours > self.interval_hours:
            raise ValueError("demand aggregation window cannot exceed the input interval")
        if self.demand_charge_per_kw is not None and self.demand_window_hours != self.interval_hours:
            raise ValueError("demand charge requires matching demand window and input interval lengths")
        return self


class OptimizationIntervalResult(BaseModel):
    timestamp: str
    interval_hours: float
    demand_kw: float
    solar_available_kw: float
    solar_to_load_kw: float
    solar_to_battery_kw: float
    solar_export_kw: float
    solar_curtailed_kw: float
    grid_import_kw: float
    grid_to_battery_kw: float
    grid_export_kw: float
    battery_charge_kw: float
    battery_discharge_kw: float
    battery_soc_kwh: Optional[float]
    tariff_per_kwh: float
    energy_cost: float
    demand_cost: float
    degradation_cost: float
    export_credit: float
    total_cost: float


class OptimizationResponse(BaseModel):
    solver_status: str
    solver_message: str
    optimization_type: str
    feasible: bool
    objective_value: Optional[float]
    data_status: str
    total_baseline_cost: Optional[float]
    total_optimized_cost: Optional[float]
    total_estimated_savings: Optional[float]
    savings_percentage: Optional[float]
    total_demand_kwh: float
    solar_generation_kwh: float
    solar_self_consumption_kwh: float
    solar_export_kwh: float
    solar_curtailed_kwh: float
    total_grid_import_kwh: float
    total_grid_export_kwh: float
    total_grid_emissions_kg: Optional[float]
    total_battery_charge_kwh: float
    total_battery_discharged_kwh: float
    peak_demand_baseline_kw: float
    peak_demand_optimized_kw: float
    constraints_binding: List[str]
    tariff_periods_used: List[str]
    explanations: List[str]
    limitations: List[str]
    schedule: List[OptimizationIntervalResult]
