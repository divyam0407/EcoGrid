import pandas as pd
import numpy as np
from typing import List, Dict, Any
from intelligence.app.api.schemas.digital_twin_schemas import ScenarioSimulationRequest, ScenarioComparisonResult
from intelligence.app.api.schemas.optimization_schemas import OptimizationRequest
from intelligence.app.core.optimization.energy_optimizer import MathematicalEnergyOptimizer

class CampusEnergyDigitalTwinSimulator:
    def __init__(self):
        self.optimizer = MathematicalEnergyOptimizer()

    def simulate(self, req: ScenarioSimulationRequest) -> ScenarioComparisonResult:
        T = len(req.baseline_timestamps)
        if T == 0 or any(len(x) != T for x in (req.baseline_demand_kw, req.baseline_solar_kw, req.baseline_tariffs)):
            raise ValueError("Scenario timestamp, demand, solar and tariff inputs must be non-empty and have equal lengths.")

        dts = pd.to_datetime(req.baseline_timestamps)
        mods = req.modifications

        # 1. Modify demand profile according to scenario operational hypothesis
        modified_demand = []
        for i, dt in enumerate(dts):
            hr = dt.hour
            orig_d = req.baseline_demand_kw[i]
            d = orig_d

            # A. Change operating hours (e.g. earlier closing or compressed hours)
            if mods.shift_operating_hours_end is not None and hr > mods.shift_operating_hours_end:
                d = orig_d * mods.idle_load_fraction
            elif mods.shift_operating_hours_start is not None and hr < mods.shift_operating_hours_start:
                d = orig_d * mods.idle_load_fraction

            # B. Occupancy scaling (e.g. 50% hybrid schedule: base load stays, variable load scales)
            if mods.occupancy_scaling_factor is not None and mods.occupancy_scaling_factor != 1.0:
                base_load = orig_d * mods.fixed_load_fraction
                variable_load = orig_d * (1.0 - mods.fixed_load_fraction)
                d = base_load + variable_load * mods.occupancy_scaling_factor

            # C. Shift lab sessions to solar peak hours (11:00 - 14:00) from evening hours (17:00 - 19:00)
            if mods.shift_lab_sessions_to_solar_peak:
                if 17 <= hr <= 19:
                    d = max(d - mods.shifted_lab_load_kw, 0.0)
                elif 11 <= hr <= 13:
                    d = d + mods.shifted_lab_load_kw

            modified_demand.append(round(d, 2))

        # 2. Modify solar profile
        modified_solar = []
        solar_mult = mods.solar_capacity_multiplier or 1.0
        additional_solar_kw = mods.additional_solar_kw or 0.0
        if additional_solar_kw:
            raise ValueError("Additional solar kW cannot be translated into generation without an explicit generation profile. Supply a solar capacity multiplier against measured/forecast data instead.")
        for i, orig_s in enumerate(req.baseline_solar_kw):
            s = orig_s * solar_mult
            modified_solar.append(round(s, 2))

        # 3. Modify tariffs (e.g. 20% tariff increase)
        tariff_factor = 1.0 + (mods.tariff_increase_percent / 100.0 if mods.tariff_increase_percent else 0.0)
        modified_tariffs = [round(t * tariff_factor, 4) for t in req.baseline_tariffs]

        # 4. Battery sizing
        battery_cap = mods.battery_capacity_kwh

        # 5. Run baseline unoptimized simulation
        baseline_cost = 0.0
        baseline_total_kwh = sum(req.baseline_demand_kw)
        baseline_solar_used = 0.0
        baseline_peak_kw = 0.0
        for i in range(T):
            b_dem = req.baseline_demand_kw[i]
            b_sol = req.baseline_solar_kw[i]
            b_tar = req.baseline_tariffs[i]
            s_used = min(b_sol, b_dem)
            baseline_solar_used += s_used
            g_import = max(0.0, b_dem - s_used)
            baseline_cost += g_import * b_tar
            if g_import > baseline_peak_kw:
                baseline_peak_kw = g_import

        # 6. Run Scenario with Mathematical Optimization
        opt_req = OptimizationRequest(
            building_id="scenario",
            timestamps=req.baseline_timestamps,
            predicted_demand_kw=modified_demand,
            solar_generation_kw=modified_solar,
            tariffs=modified_tariffs,
            battery_available=battery_cap is not None,
            battery_capacity_kwh=battery_cap,
            initial_soc_kwh=mods.battery_initial_soc_kwh,
            min_soc_kwh=mods.battery_min_soc_kwh,
            max_soc_kwh=mods.battery_max_soc_kwh,
            max_charge_kw=mods.battery_max_charge_kw,
            max_discharge_kw=mods.battery_max_discharge_kw,
            charge_efficiency=mods.battery_charge_efficiency or 1.0,
            discharge_efficiency=mods.battery_discharge_efficiency or 1.0,
            battery_degradation_cost_per_kwh=mods.battery_degradation_cost_per_kwh or 0.0,
            allow_grid_charging=mods.allow_grid_charging,
            data_status="SIMULATED"
        )
        opt_res = self.optimizer.optimize(opt_req)
        if not opt_res.feasible:
            raise ValueError(f"Scenario optimization is infeasible: {opt_res.solver_message}")

        scenario_cost = opt_res.total_optimized_cost
        cost_diff = round(baseline_cost - scenario_cost, 2)
        pct_savings = round((cost_diff / baseline_cost) * 100, 1) if baseline_cost > 0 else 0.0
        scenario_total_kwh = sum(modified_demand)
        kwh_diff = round(baseline_total_kwh - scenario_total_kwh, 2)
        peak_red = round(max(0.0, baseline_peak_kw - opt_res.peak_demand_optimized_kw), 2)

        tot_baseline_solar = sum(req.baseline_solar_kw)
        solar_base_pct = round((baseline_solar_used / tot_baseline_solar) * 100, 1) if tot_baseline_solar > 0 else 0.0
        tot_scen_solar = sum(modified_solar)
        solar_scen_pct = round((opt_res.solar_self_consumption_kwh / tot_scen_solar) * 100, 1) if tot_scen_solar > 0 else 0.0

        hourly_comp = []
        for i in range(T):
            hourly_comp.append({
                "timestamp": req.baseline_timestamps[i],
                "baseline_demand_kw": req.baseline_demand_kw[i],
                "scenario_demand_kw": modified_demand[i],
                "baseline_solar_kw": req.baseline_solar_kw[i],
                "scenario_solar_kw": modified_solar[i],
                "optimized_grid_kw": opt_res.schedule[i].grid_import_kw,
                "battery_soc_kwh": opt_res.schedule[i].battery_soc_kwh
            })

        summary = (f"Simulated scenario '{req.scenario_name}' estimates a cost change of {cost_diff:,.2f} "
                   f"in the supplied currency units ({pct_savings}%) and a peak grid demand change of {peak_red} kW. "
                   "These are hypothetical inputs, not measured or verified savings.")

        return ScenarioComparisonResult(
            scenario_name=req.scenario_name,
            baseline_cost=round(baseline_cost, 2),
            scenario_cost=round(scenario_cost, 2),
            cost_difference=cost_diff,
            percentage_savings=pct_savings,
            baseline_total_kwh=round(baseline_total_kwh, 2),
            scenario_total_kwh=round(scenario_total_kwh, 2),
            kwh_difference=kwh_diff,
            baseline_peak_kw=round(baseline_peak_kw, 2),
            scenario_peak_kw=round(opt_res.peak_demand_optimized_kw, 2),
            peak_reduction_kw=peak_red,
            solar_utilization_baseline_percent=solar_base_pct,
            solar_utilization_scenario_percent=solar_scen_pct,
            hourly_comparison=hourly_comp,
            recommendation_summary=summary
        )
