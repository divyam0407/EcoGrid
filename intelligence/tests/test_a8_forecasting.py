import unittest
import os
import tempfile
import uuid
import numpy as np
import pandas as pd

from intelligence.app.core.forecasting.preprocessing import prepare_hourly, make_supervised
from intelligence.app.core.forecasting.baseline import predict_baseline
from intelligence.app.core.forecasting.ml_forecasting import DemandForecastingEngine
from intelligence.app.main import train_forecast_model, predict_registered_model, _import_service_token


class A8ForecastingTests(unittest.TestCase):
    def readings(self, days=45):
        timestamps = pd.date_range("2025-01-01", periods=24 * days, freq="h", tz="UTC")
        return [{"timestamp": t.isoformat(), "consumption_kwh": 30 + 4*np.sin(2*np.pi*t.hour/24) + (t.dayofweek >= 5),
                 "interval_minutes": 60, "quality_status": "VALIDATED"} for t in timestamps]

    def test_missing_and_duplicate_are_retained_as_quality_information(self):
        rows = self.readings(2)
        rows.extend([rows[4], {"timestamp": "broken", "consumption_kwh": 2}])
        hourly, quality = prepare_hourly(rows, "America/New_York")
        self.assertEqual(quality["duplicate_timestamps_removed"], 1)
        self.assertEqual(quality["invalid_timestamps"], 1)
        self.assertTrue(hourly.consumption_kwh.notna().all())

    def test_dst_fold_uses_distinct_utc_hours(self):
        readings = [{"timestamp": t.isoformat(), "consumption_kwh": 1, "interval_minutes": 60}
                    for t in pd.date_range("2025-11-02 04:00", periods=5, freq="h", tz="UTC")]
        hourly, _ = prepare_hourly(readings, "America/New_York")
        self.assertEqual(len(hourly), 5)
        self.assertEqual(hourly.local_hour.tolist().count(1), 2)

    def test_lag_features_exclude_current_target(self):
        hourly, _ = prepare_hourly(self.readings(), "UTC")
        row = hourly.iloc[200]
        self.assertEqual(row.lag_1h, hourly.iloc[199].consumption_kwh)
        self.assertEqual(row.rolling_mean_24h, hourly.iloc[176:200].consumption_kwh.mean())

    def test_chronological_evaluation_and_supported_forecast(self):
        engine = DemandForecastingEngine("random_forest", "UTC")
        metrics, _ = engine.train_and_evaluate(self.readings())
        self.assertLess(metrics["train_period"][1], metrics["validation_period"][0])
        self.assertLess(metrics["validation_period"][1], metrics["test_period"][0])
        self.assertEqual(metrics["selected_model"], "random_forest")
        self.assertEqual(len(engine.generate_forecast(pd.DataFrame(), 24)), 24)
        with self.assertRaisesRegex(ValueError, "held-out evaluation"):
            engine.generate_forecast(pd.DataFrame(), 168)
        with self.assertRaises(ValueError):
            engine.generate_forecast(pd.DataFrame(), 48)

    def test_forecast_window_bridges_missing_hour_and_returns_future_horizon_only(self):
        engine = DemandForecastingEngine("baseline", "UTC")
        engine.train_and_evaluate(self.readings())
        last_history_hour = pd.to_datetime(engine.training_rows.timestamp.iloc[-1], utc=True)
        requested_start = last_history_hour + pd.Timedelta(hours=3)
        points = engine.generate_forecast(pd.DataFrame(), 24, forecast_start=requested_start)
        self.assertEqual(len(points), 24)
        self.assertEqual(pd.Timestamp(points[0]["timestamp"]), requested_start)
        self.assertEqual(pd.Timestamp(points[-1]["timestamp"]), requested_start + pd.Timedelta(hours=23))
        with self.assertRaisesRegex(ValueError, "more than 24 hours"):
            engine.generate_forecast(pd.DataFrame(), 24, forecast_start=last_history_hour + pd.Timedelta(hours=26))

    def test_invalid_quality_excluded_and_insufficient_history_rejected(self):
        rows = self.readings(5)
        rows[10]["quality_status"] = "METER_RESET_ROLLOVER"
        hourly, _ = prepare_hourly(rows, "UTC")
        self.assertTrue(pd.isna(hourly.loc[10, "consumption_kwh"]))
        with self.assertRaises(ValueError):
            DemandForecastingEngine().train_and_evaluate(self.readings(5))

    def test_model_artifact_is_versioned_and_organization_scoped(self):
        token = _import_service_token()
        if not token:
            self.skipTest("Service token is not configured in this test environment.")
        org_id, model_id = str(uuid.uuid4()), str(uuid.uuid4())
        with tempfile.TemporaryDirectory(prefix="ecogrid-a8-models-") as directory:
            previous = os.environ.get("MODEL_ARTIFACT_DIR")
            os.environ["MODEL_ARTIFACT_DIR"] = directory
            try:
                result = train_forecast_model({"model_id": model_id, "organization_id": org_id,
                    "model_type": "baseline", "timezone": "UTC", "historical_data": self.readings()}, token)
                self.assertTrue(os.path.isfile(result["artifact_path"]))
                self.assertEqual(len(result["artifact_sha256"]), 64)
                prediction = predict_registered_model(model_id, {"organization_id": org_id, "horizon_hours": 24,
                    "historical_data": self.readings()}, token)
                self.assertEqual(len(prediction["forecasts"]), 24)
                with self.assertRaises(Exception):
                    predict_registered_model(model_id, {"organization_id": str(uuid.uuid4()), "horizon_hours": 24,
                        "historical_data": self.readings()}, token)
            finally:
                if previous is None:
                    os.environ.pop("MODEL_ARTIFACT_DIR", None)
                else:
                    os.environ["MODEL_ARTIFACT_DIR"] = previous


if __name__ == "__main__":
    unittest.main()
