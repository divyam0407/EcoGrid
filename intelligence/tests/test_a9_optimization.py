import unittest
from datetime import datetime, timedelta, timezone
from pydantic import ValidationError
from intelligence.app.api.schemas.optimization_schemas import OptimizationRequest
from intelligence.app.core.optimization.energy_optimizer import MathematicalEnergyOptimizer
from intelligence.app.api.schemas.digital_twin_schemas import ScenarioModifications, ScenarioSimulationRequest
from intelligence.app.core.digital_twin.simulator import CampusEnergyDigitalTwinSimulator
from intelligence.app.core.solar.solar_model import SolarGenerationModel


class A9OptimizationTests(unittest.TestCase):
    def setUp(self):
        self.optimizer = MathematicalEnergyOptimizer()

    def request(self, **overrides):
        interval = overrides.get("interval_hours", 1.0)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        timestamps = [(start + timedelta(hours=interval * i)).isoformat().replace('+00:00', 'Z') for i in range(3)]
        data = dict(timestamps=timestamps,
                    predicted_demand_kw=[4, 4, 8], solar_generation_kw=[0, 6, 0],
                    tariffs=[0.1, 0.1, 0.5], data_status="SIMULATED")
        data.update(overrides)
        return OptimizationRequest(**data)

    def test_grid_only_balances_demand_without_invented_battery(self):
        result = self.optimizer.optimize(self.request())
        self.assertTrue(result.feasible)
        self.assertAlmostEqual(result.total_grid_import_kwh, 12, places=5)
        for row in result.schedule:
            self.assertAlmostEqual(row.grid_import_kw + row.solar_to_load_kw + row.battery_discharge_kw,
                                   row.demand_kw + row.grid_to_battery_kw, places=5)
            self.assertAlmostEqual(row.solar_to_load_kw + row.solar_to_battery_kw + row.grid_export_kw + row.solar_curtailed_kw,
                                   row.solar_available_kw, places=5)

    def test_tariff_energy_cost_matches_interval_rates(self):
        result = self.optimizer.optimize(self.request(predicted_demand_kw=[2, 2, 2], solar_generation_kw=[0, 0, 0],
            tariffs=[0.1, 0.2, 0.3]))
        self.assertTrue(result.feasible)
        self.assertAlmostEqual(result.total_optimized_cost, 1.2, places=5)
        self.assertAlmostEqual(sum(row.energy_cost for row in result.schedule), 1.2, places=5)

    def test_solar_used_for_load_and_surplus_is_curtailment_without_export(self):
        result = self.optimizer.optimize(self.request())
        middle = result.schedule[1]
        self.assertAlmostEqual(middle.solar_to_load_kw, 4, places=5)
        self.assertAlmostEqual(middle.solar_curtailed_kw, 2, places=5)
        self.assertEqual(result.total_grid_export_kwh, 0)

    def test_export_requires_explicit_compensation(self):
        with self.assertRaises(ValidationError):
            self.request(allow_grid_export=True)
        result = self.optimizer.optimize(self.request(predicted_demand_kw=[1, 1, 1],
            solar_generation_kw=[4, 0, 0], allow_grid_export=True, export_price_per_kwh=0.2))
        self.assertGreater(result.total_grid_export_kwh, 0)

    def test_battery_dispatch_respects_soc_efficiency_and_no_simultaneous_flow(self):
        result = self.optimizer.optimize(self.request(
            battery_available=True,
            battery_capacity_kwh=8, initial_soc_kwh=2, min_soc_kwh=1, max_soc_kwh=8,
            max_charge_kw=4, max_discharge_kw=4, charge_efficiency=0.9,
            discharge_efficiency=0.8, battery_degradation_cost_per_kwh=0.001,
            final_soc_kwh=2))
        self.assertTrue(result.feasible)
        for row in result.schedule:
            self.assertFalse(row.battery_charge_kw > 1e-5 and row.battery_discharge_kw > 1e-5)
            self.assertGreaterEqual(row.battery_soc_kwh, 1 - 1e-5)
            self.assertLessEqual(row.battery_soc_kwh, 8 + 1e-5)
        self.assertAlmostEqual(result.schedule[-1].battery_soc_kwh, 2, places=5)

    def test_infeasible_constraints_return_no_fabricated_schedule(self):
        result = self.optimizer.optimize(self.request(peak_demand_limit_kw=1))
        self.assertFalse(result.feasible)
        self.assertEqual(result.schedule, [])
        self.assertIsNone(result.total_optimized_cost)

    def test_length_mismatch_and_invalid_battery_are_rejected(self):
        with self.assertRaises(ValidationError):
            self.request(tariffs=[0.1])
        with self.assertRaises(ValidationError):
            self.request(battery_capacity_kwh=10, initial_soc_kwh=9, min_soc_kwh=2,
                         max_soc_kwh=8, max_charge_kw=2, max_discharge_kw=2)

    def test_demand_charge_reduces_peak_using_configured_cost(self):
        result = self.optimizer.optimize(self.request(
            battery_available=True,
            battery_capacity_kwh=8, initial_soc_kwh=8, min_soc_kwh=1, max_soc_kwh=8,
            max_charge_kw=2, max_discharge_kw=4, demand_charge_per_kw=3,
            battery_degradation_cost_per_kwh=0.001, final_soc_kwh=1))
        self.assertTrue(result.feasible)
        self.assertLess(result.peak_demand_optimized_kw, result.peak_demand_baseline_kw)

    def test_interval_energy_uses_interval_duration(self):
        result = self.optimizer.optimize(self.request(interval_hours=0.5, demand_window_hours=0.5))
        self.assertAlmostEqual(result.total_demand_kwh, 8, places=5)

    def test_digital_twin_uses_explicit_scenario_arrays_and_no_default_battery(self):
        times = [f"2026-01-01T0{i}:00:00Z" for i in range(3)]
        request = ScenarioSimulationRequest(scenario_name="explicit", modifications=ScenarioModifications(),
            baseline_timestamps=times, baseline_demand_kw=[2, 3, 4], baseline_solar_kw=[0, 1, 0],
            baseline_tariffs=[0.1, 0.2, 0.3])
        result = CampusEnergyDigitalTwinSimulator().simulate(request)
        self.assertIn("Simulated scenario", result.recommendation_summary)
        self.assertIsNone(result.hourly_comparison[0]["battery_soc_kwh"])

    def test_digital_twin_rejects_unconfigured_operational_and_battery_assumptions(self):
        with self.assertRaises(ValidationError):
            ScenarioModifications(occupancy_scaling_factor=0.8)
        with self.assertRaises(ValidationError):
            ScenarioModifications(battery_capacity_kwh=100)

    def test_solar_shape_requires_explicit_weather_and_derating(self):
        model = SolarGenerationModel(capacity_kw=10, derating_factor=0.8)
        with self.assertRaises(TypeError):
            model.calculate_generation(["2026-01-01T12:00:00Z"])
        with self.assertRaises(ValueError):
            model.calculate_generation(["2026-01-01T12:00:00Z"], [])
        output = model.calculate_generation(["2026-01-01T12:00:00Z"], [0])
        self.assertEqual(len(output), 1)


if __name__ == "__main__":
    unittest.main()
