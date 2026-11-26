from typing import List
import math
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
from scipy.sparse import coo_matrix
from intelligence.app.api.schemas.optimization_schemas import (
    OptimizationRequest, OptimizationResponse, OptimizationIntervalResult,
)


class MathematicalEnergyOptimizer:
    """Cost-minimizing MILP for interval-average kW and interval kWh accounting."""

    def optimize(self, req: OptimizationRequest) -> OptimizationResponse:
        n = len(req.timestamps)
        dt = req.interval_hours
        has_battery = req.battery_available and req.battery_capacity_kwh is not None
        names = ["grid", "solar_load", "solar_charge", "solar_export", "curtailed", "grid_charge", "discharge", "soc", "charge_mode"]
        index = {name: [i * len(names) + j for i in range(n)] for j, name in enumerate(names)}
        peak_idx = n * len(names)
        variable_count = peak_idx + 1
        lower = np.zeros(variable_count)
        upper = np.full(variable_count, np.inf)
        integrality = np.zeros(variable_count, dtype=int)
        upper[peak_idx] = np.inf
        for t in range(n):
            upper[index["solar_load"][t]] = req.solar_generation_kw[t]
            upper[index["solar_charge"][t]] = req.solar_generation_kw[t] if has_battery else 0
            upper[index["solar_export"][t]] = req.solar_generation_kw[t] if req.allow_grid_export else 0
            upper[index["curtailed"][t]] = req.solar_generation_kw[t]
            upper[index["grid_charge"][t]] = req.max_charge_kw if has_battery and req.allow_grid_charging else 0
            upper[index["discharge"][t]] = req.max_discharge_kw if has_battery else 0
            if has_battery:
                lower[index["soc"][t]] = max(req.min_soc_kwh, req.reserve_soc_kwh or req.min_soc_kwh)
                upper[index["soc"][t]] = req.max_soc_kwh
            else:
                upper[index["soc"][t]] = 0
            upper[index["charge_mode"][t]] = 1
            integrality[index["charge_mode"][t]] = 1
        objective = np.zeros(variable_count)
        for t in range(n):
            objective[index["grid"][t]] = req.tariffs[t] * dt
            objective[index["solar_export"][t]] = -(req.export_price_per_kwh or 0) * dt
            objective[index["solar_charge"][t]] = req.battery_degradation_cost_per_kwh * dt
            objective[index["grid_charge"][t]] = req.battery_degradation_cost_per_kwh * dt
            objective[index["discharge"][t]] = req.battery_degradation_cost_per_kwh * dt
        if req.demand_charge_per_kw is not None:
            objective[peak_idx] = req.demand_charge_per_kw
        rows, cols, vals, lows, highs = [], [], [], [], []

        def constraint(coefficients, low=-np.inf, high=np.inf):
            row = len(lows)
            for col, coefficient in coefficients.items():
                if coefficient:
                    rows.append(row); cols.append(col); vals.append(coefficient)
            lows.append(low); highs.append(high)

        for t in range(n):
            demand = req.predicted_demand_kw[t]
            pv = req.solar_generation_kw[t]
            # Sources for facility demand: grid supply (excluding grid charging), PV, battery.
            g, sl, sc, se, cu, gc, bd, state, mode = [index[k][t] for k in names]
            constraint({g: 1, gc: -1, sl: 1, bd: 1}, demand, demand)
            constraint({sl: 1, sc: 1, se: 1, cu: 1}, pv, pv)
            if has_battery:
                # Binary mode prevents charging and discharging at the same time.
                constraint({sc: 1, gc: 1}, high=req.max_charge_kw)
                constraint({sc: 1, gc: 1, mode: -req.max_charge_kw}, high=0)
                constraint({bd: 1}, high=req.max_discharge_kw)
                constraint({bd: 1, mode: req.max_discharge_kw}, high=req.max_discharge_kw)
                previous = {state: 1, sc: -req.charge_efficiency * dt, gc: -req.charge_efficiency * dt, bd: dt / req.discharge_efficiency}
                if t:
                    previous[index["soc"][t - 1]] = -1
                    constraint(previous, 0, 0)
                else:
                    constraint(previous, req.initial_soc_kwh, req.initial_soc_kwh)
            else:
                pass
            constraint({g: 1, peak_idx: -1}, high=0)
            if req.peak_demand_limit_kw is not None:
                constraint({g: 1}, high=req.peak_demand_limit_kw)

        if has_battery and req.final_soc_kwh is not None:
            constraint({index["soc"][-1]: 1}, req.final_soc_kwh, req.final_soc_kwh)

        matrix = coo_matrix((vals, (rows, cols)), shape=(len(lows), variable_count)).tocsc()
        solved = milp(objective, integrality=integrality, bounds=Bounds(lower, upper),
                      constraints=LinearConstraint(matrix, np.asarray(lows), np.asarray(highs)),
                      options={"time_limit": 30})
        status = "OPTIMAL" if solved.status == 0 and solved.success else ("INFEASIBLE" if solved.status == 2 else "NOT_SOLVED")
        if status != "OPTIMAL":
            return OptimizationResponse(
                solver_status=status, solver_message=f"SciPy HiGHS MILP solver returned: {solved.message}; no schedule was produced.",
                optimization_type="MILP (SciPy HiGHS)", feasible=False, objective_value=None,
                data_status=req.data_status, total_baseline_cost=None, total_optimized_cost=None,
                total_estimated_savings=None, savings_percentage=None,
                total_demand_kwh=sum(req.predicted_demand_kw) * dt,
                solar_generation_kwh=sum(req.solar_generation_kw) * dt,
                solar_self_consumption_kwh=0, solar_export_kwh=0, solar_curtailed_kwh=0,
                total_grid_import_kwh=0, total_grid_export_kwh=0, total_battery_charge_kwh=0,
                total_grid_emissions_kg=None, total_battery_discharged_kwh=0, peak_demand_baseline_kw=0,
                peak_demand_optimized_kw=0, constraints_binding=[], tariff_periods_used=[],
                explanations=["The requested constraints are infeasible or the solver did not finish optimally."],
                limitations=["No fallback schedule or financial estimate is returned when the solver fails."], schedule=[])

        def val(var_index):
            return max(0.0, float(solved.x[var_index] or 0.0))

        schedule: List[OptimizationIntervalResult] = []
        solar_self = solar_out = curtail_out = grid_in = grid_out = charged = discharged = 0.0
        baseline_cost = req.fixed_charge
        peak_baseline = 0.0
        binding = set()
        for t in range(n):
            pv = req.solar_generation_kw[t]
            d = req.predicted_demand_kw[t]
            g, sl, sc, se, cu = map(val, (index["grid"][t], index["solar_load"][t], index["solar_charge"][t], index["solar_export"][t], index["curtailed"][t]))
            gc, bd = val(index["grid_charge"][t]), val(index["discharge"][t])
            state = val(index["soc"][t]) if has_battery else None
            import_baseline = max(0.0, d - min(d, pv))
            baseline_export = max(0.0, pv - d) if req.allow_grid_export else 0.0
            baseline_cost += import_baseline * req.tariffs[t] * dt - baseline_export * (req.export_price_per_kwh or 0) * dt
            peak_baseline = max(peak_baseline, import_baseline)
            e_cost = g * req.tariffs[t] * dt
            x_credit = se * (req.export_price_per_kwh or 0) * dt
            deg_cost = (sc + gc + bd) * req.battery_degradation_cost_per_kwh * dt
            schedule.append(OptimizationIntervalResult(
                timestamp=req.timestamps[t], interval_hours=dt, demand_kw=d, solar_available_kw=pv,
                solar_to_load_kw=sl, solar_to_battery_kw=sc, solar_export_kw=se, solar_curtailed_kw=cu,
                grid_import_kw=g, grid_to_battery_kw=gc, grid_export_kw=se,
                battery_charge_kw=sc + gc, battery_discharge_kw=bd, battery_soc_kwh=state,
                tariff_per_kwh=req.tariffs[t], energy_cost=e_cost,
                demand_cost=(val(peak_idx) * req.demand_charge_per_kw if req.demand_charge_per_kw else 0) / n,
                degradation_cost=deg_cost, export_credit=x_credit,
                total_cost=e_cost + deg_cost - x_credit + req.fixed_charge / n))
            solar_self += (sl + sc) * dt
            solar_out += se * dt
            curtail_out += cu * dt
            grid_in += g * dt
            grid_out += se * dt
            charged += (sc + gc) * dt
            discharged += bd * dt
            if abs(g - (req.peak_demand_limit_kw or math.inf)) < 1e-4 and req.peak_demand_limit_kw:
                binding.add("contracted_peak_demand_limit")
            if has_battery and abs(state - max(req.min_soc_kwh, req.reserve_soc_kwh or req.min_soc_kwh)) < 1e-4:
                binding.add("minimum_state_of_charge_or_reserve")
            if has_battery and abs(state - req.max_soc_kwh) < 1e-4:
                binding.add("maximum_state_of_charge")
            if has_battery and abs(sc + gc - req.max_charge_kw) < 1e-4:
                binding.add("maximum_battery_charge_power")
            if has_battery and abs(bd - req.max_discharge_kw) < 1e-4:
                binding.add("maximum_battery_discharge_power")
            if abs(sl + sc + se + cu - pv) < 1e-4 and pv > 0:
                binding.add("solar_generation_allocation")

        optimized = float(solved.fun or 0) + req.fixed_charge
        baseline_cost += peak_baseline * (req.demand_charge_per_kw or 0)
        savings = baseline_cost - optimized
        explanations = ["Grid import, available solar and battery discharge balance facility demand in every interval.",
                       "Solar is allocated to demand, charging and permitted exports; remaining generation is explicitly curtailed."]
        if has_battery:
            explanations.append("Battery state of charge includes charge/discharge efficiency and is constrained by configured SOC and power limits.")
        if req.allow_grid_charging:
            explanations.append("Grid charging is enabled by the supplied configuration.")
        if req.allow_grid_export:
            explanations.append("Grid export is enabled with the explicitly supplied compensation rate.")
        period_labels = sorted(set(req.tariff_periods))
        if period_labels:
            explanations.append("Configured tariff periods considered: " + ", ".join(period_labels) + ".")
        if charged > 0 or discharged > 0:
            explanations.append("Battery dispatch was selected using interval import prices, solar availability, throughput penalty and SOC constraints across the horizon.")
        limitations = []
        if req.demand_charge_per_kw is None:
            limitations.append("No demand charge was configured; demand-charge savings are unavailable.")
        elif req.interval_hours != req.demand_window_hours:
            limitations.append("Demand-charge aggregation does not match the supplied interval length.")
        else:
            limitations.append("Demand charge is a selected-horizon peak proxy; billing-cycle peaks, ratchets and prior peak demand are not modeled.")
        if req.carbon_emission_kg_per_kwh is None:
            limitations.append("Grid emissions are unavailable because no organization emissions factor is configured.")
        if req.data_status != "MEASURED":
            limitations.append("Results use scenario or forecast inputs and are simulated/estimated, not measured savings.")
        return OptimizationResponse(
            solver_status="OPTIMAL", solver_message="HiGHS found an optimal feasible MILP schedule.",
            optimization_type="MILP (SciPy HiGHS)", feasible=True, objective_value=round(optimized, 6),
            data_status=req.data_status, total_baseline_cost=round(baseline_cost, 6),
            total_optimized_cost=round(optimized, 6), total_estimated_savings=round(savings, 6),
            savings_percentage=round(savings / baseline_cost * 100, 3) if baseline_cost > 0 else None,
            total_demand_kwh=round(sum(req.predicted_demand_kw) * dt, 6),
            solar_generation_kwh=round(sum(req.solar_generation_kw) * dt, 6),
            solar_self_consumption_kwh=round(solar_self, 6), solar_export_kwh=round(solar_out, 6),
            solar_curtailed_kwh=round(curtail_out, 6), total_grid_import_kwh=round(grid_in, 6),
            total_grid_export_kwh=round(grid_out, 6), total_battery_charge_kwh=round(charged, 6),
            total_grid_emissions_kg=round(grid_in * req.carbon_emission_kg_per_kwh, 6) if req.carbon_emission_kg_per_kwh is not None else None,
            total_battery_discharged_kwh=round(discharged, 6),
            peak_demand_baseline_kw=round(peak_baseline, 6), peak_demand_optimized_kw=round(val(peak_idx), 6),
            constraints_binding=sorted(binding), tariff_periods_used=period_labels,
            explanations=explanations, limitations=limitations, schedule=schedule)
