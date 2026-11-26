import unittest
from datetime import datetime, timedelta, timezone

from intelligence.app.core.anomaly_detection.statistical import AnomalyDetectionEngine
from intelligence.app.core.forecasting.ml_forecasting import DemandForecastingEngine


class TestModelSafety(unittest.TestCase):
    def _readings(self, count=24 * 45):
        start = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return [
            {
                "timestamp": (start + timedelta(hours=index)).isoformat(),
                "consumption_kwh": 10 + (index % 6),
                "power_kw": 10 + (index % 6),
            }
            for index in range(count)
        ]

    def test_forecast_requires_observed_history(self):
        with self.assertRaisesRegex(ValueError, "28 days"):
            DemandForecastingEngine("baseline").train_and_evaluate(self._readings(47))

    def test_forecast_does_not_infer_occupancy_or_weather(self):
        readings = self._readings()
        engine = DemandForecastingEngine("baseline")
        metrics, _ = engine.train_and_evaluate(readings)
        forecasts = engine.generate_forecast(__import__("pandas").DataFrame(readings), horizon_hours=24)
        self.assertGreater(metrics["test_size"], 0)
        self.assertTrue(all("model" in item["factors"] for item in forecasts))

    def test_anomaly_does_not_label_nighttime_as_unscheduled_without_schedule(self):
        start = datetime(2024, 1, 1, 1, tzinfo=timezone.utc)
        readings = [
            {
                "timestamp": (start + timedelta(days=index)).isoformat(),
                "consumption_kwh": 10 if index < 35 else 1000,
                "building_id": "test-building",
                "meter_id": "test-meter",
            }
            for index in range(36)
        ]
        anomalies = AnomalyDetectionEngine("z_score", sensitivity=2.0).detect(readings)
        self.assertTrue(anomalies)
        self.assertNotIn("unscheduled_surge", {item["anomaly_type"] for item in anomalies})


if __name__ == "__main__":
    unittest.main()
