import pulp
from typing import List, Dict, Any
from intelligence.app.api.schemas.optimization_schemas import OptimizationRequest, OptimizationResponse, OptimizationIntervalResult

class MathematicalEnergyOptimizer:
    def __init__(self):
        pass

    def optimize(self, req: OptimizationRequest) -> OptimizationResponse:
        T = len(req.timestamps)
        if T == 0:
            raise ValueError("No timestamps provided for optimization.")

        prob = pulp.LpProblem("EcoGrid_Cost_Optimization", pulp.LpMinimize)

        # Decision Variables for each hour t in 0..T-1
        grid = [pulp.LpVariable(f"grid_{t}", lowBound=0.0) for t in range(T)]
        solar_used = [pulp.LpVariable(f"solar_used_{t}", lowBound=0.0) for t in range(T)]
        solar_to_batt = [pulp.LpVariable(f"solar_to_batt_{t}", lowBound=0.0) for t in range(T)]
        grid_to_batt = [pulp.LpVariable(f"grid_to_batt_{t}", lowBound=0.0) for t in range(T)]
        batt_discharge = [pulp.LpVariable(f"batt_discharge_{t}", lowBound=0.0, upBound=req.max_discharge_kw) for t in range(T)]
        soc = [pulp.LpVariable(f"soc_{t}", lowBound=req.min_soc_kwh, upBound=req.max_soc_kwh) for t in range(T)]
        
        # Peak demand variable
        peak_grid = pulp.LpVariable("peak_grid_demand", lowBound=0.0)

        # Objective Function:
        # Minimize Grid import cost + Battery cycling degradation cost + Peak demand charge
        cost_terms = []
        for t in range(T):
            tariff = req.tariffs[t]
            # Total grid import at t is to meet load + grid charging battery
            total_grid_t = grid[t] + grid_to_batt[t]
            cost_terms.append(total_grid_t * tariff)
            
            # Degradation cost per kWh charged
            charge_t = solar_to_batt[t] + grid_to_batt[t]
            cost_terms.append(charge_t * req.battery_degradation_cost_per_kwh)

        # Peak demand penalty
        if req.peak_demand_charge_per_kw:
            cost_terms.append(peak_grid * req.peak_demand_charge_per_kw)

        prob += pulp.lpSum(cost_terms)

        # Constraints
        for t in range(T):
            demand = req.predicted_demand_kw[t]
            solar_avail = req.solar_generation_kw[t]

            # 1. Demand Satisfaction: Grid + Solar to load + Battery discharge == Demand
            prob += grid[t] + solar_used[t] + batt_discharge[t] == demand

            # 2. Solar Generation Limit: Solar used + Solar to battery <= Solar available
            prob += solar_used[t] + solar_to_batt[t] <= solar_avail

            # 3. Battery Max Charge limit
            charge_t = solar_to_batt[t] + grid_to_batt[t]
            prob += charge_t <= req.max_charge_kw

            # 4. State of Charge dynamics (interval = 1 hour)
            # SOC[t] = SOC[t-1] + charge * eta_ch - discharge / eta_dis
            prev_soc = req.initial_soc_kwh if t == 0 else soc[t - 1]
            prob += soc[t] == prev_soc + (charge_t * req.charge_efficiency) - (batt_discharge[t] / req.discharge_efficiency)

            # 5. Peak demand tracker
            total_grid_t = grid[t] + grid_to_batt[t]
            prob += peak_grid >= total_grid_t

            # 6. Peak demand limit constraint if configured
            if req.peak_demand_limit_kw and req.peak_demand_limit_kw > 0:
                prob += total_grid_t <= req.peak_demand_limit_kw

        # Solve with CBC solver
        solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=15)
        status = prob.solve(solver)
        solver_status_str = pulp.LpStatus[status]

        # Extract Results and Baseline Comparison
        schedule_results: List[OptimizationIntervalResult] = []
        total_baseline_cost = 0.0
        total_optimized_cost = 0.0
        total_grid_import = 0.0
        total_solar_used = 0.0
        total_batt_discharged = 0.0
        peak_baseline_kw = 0.0
        peak_optimized_kw = 0.0

        for t in range(T):
            demand = req.predicted_demand_kw[t]
            solar_avail = req.solar_generation_kw[t]
            tariff = req.tariffs[t]

            # In unoptimized baseline: solar satisfies whatever load it can, remainder from grid, battery unused
            baseline_solar_used = min(solar_avail, demand)
            baseline_grid_import = max(0.0, demand - baseline_solar_used)
            baseline_interval_cost = baseline_grid_import * tariff
            total_baseline_cost += baseline_interval_cost
            if baseline_grid_import > peak_baseline_kw:
                peak_baseline_kw = baseline_grid_import

            # Optimized values
            if solver_status_str in ["Optimal", "Feasible"]:
                g_load = pulp.value(grid[t]) or 0.0
                g_batt = pulp.value(grid_to_batt[t]) or 0.0
                g_total = round(max(0.0, g_load + g_batt), 2)
                s_used = round(max(0.0, pulp.value(solar_used[t]) or 0.0), 2)
                s_batt = round(max(0.0, pulp.value(solar_to_batt[t]) or 0.0), 2)
                b_charge = round(max(0.0, s_batt + g_batt), 2)
                b_disch = round(max(0.0, pulp.value(batt_discharge[t]) or 0.0), 2)
                s_curtailed = round(max(0.0, solar_avail - (s_used + s_batt)), 2)
                soc_val = round(max(req.min_soc_kwh, min(req.max_soc_kwh, pulp.value(soc[t]) or req.initial_soc_kwh)), 2)
            else:
                # Fallback heuristics if solver fails
                g_total = baseline_grid_import
                s_used = baseline_solar_used
                b_charge = 0.0
                b_disch = 0.0
                s_curtailed = max(0.0, solar_avail - s_used)
                soc_val = req.initial_soc_kwh

            opt_interval_cost = round(g_total * tariff + b_charge * req.battery_degradation_cost_per_kwh, 2)
            total_optimized_cost += opt_interval_cost
            total_grid_import += g_total
            total_solar_used += s_used + (s_batt if solver_status_str in ["Optimal", "Feasible"] else 0.0)
            total_batt_discharged += b_disch

            if g_total > peak_optimized_kw:
                peak_optimized_kw = g_total

            interval_savings = round(baseline_interval_cost - opt_interval_cost, 2)
            soc_percent = round((soc_val / req.battery_capacity_kwh) * 100, 1)

            schedule_results.append(OptimizationIntervalResult(
                timestamp=req.timestamps[t],
                demand_kw=round(demand, 2),
                tariff_per_kwh=round(tariff, 4),
                solar_available_kw=round(solar_avail, 2),
                solar_used_kw=s_used,
                solar_curtailed_kw=s_curtailed,
                grid_import_kw=g_total,
                battery_charge_kw=b_charge,
                battery_discharge_kw=b_disch,
                battery_soc_kwh=soc_val,
                battery_soc_percent=soc_percent,
                cost_baseline=round(baseline_interval_cost, 2),
                cost_optimized=opt_interval_cost,
                savings=interval_savings
            ))

        # Peak charges added to baseline and optimized
        if req.peak_demand_charge_per_kw:
            total_baseline_cost += peak_baseline_kw * req.peak_demand_charge_per_kw
            total_optimized_cost += peak_optimized_kw * req.peak_demand_charge_per_kw

        savings = max(0.0, round(total_baseline_cost - total_optimized_cost, 2))
        pct_savings = round((savings / total_baseline_cost) * 100, 1) if total_baseline_cost > 0 else 0.0

        return OptimizationResponse(
            solver_status=solver_status_str,
            optimization_type="MILP (PuLP / CBC)",
            total_baseline_cost=round(total_baseline_cost, 2),
            total_optimized_cost=round(total_optimized_cost, 2),
            total_estimated_savings=savings,
            savings_percentage=pct_savings,
            total_demand_kwh=round(sum(req.predicted_demand_kw), 2),
            total_solar_used_kwh=round(total_solar_used, 2),
            total_grid_import_kwh=round(total_grid_import, 2),
            total_battery_discharged_kwh=round(total_batt_discharged, 2),
            peak_demand_baseline_kw=round(peak_baseline_kw, 2),
            peak_demand_optimized_kw=round(peak_optimized_kw, 2),
            peak_demand_reduction_kw=round(max(0.0, peak_baseline_kw - peak_optimized_kw), 2),
            schedule=schedule_results
        )
