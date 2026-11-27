"""Chronological, quality-aware demand forecasting without fabricated ranges."""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Tuple
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

from intelligence.app.core.forecasting.baseline import predict_baseline
from intelligence.app.core.forecasting.preprocessing import KNOWN_FUTURE_FEATURES, make_supervised, prepare_hourly

BASELINES = ("last", "previous_day", "previous_week", "seasonal_median")
MIN_HISTORY_HOURS = 24 * 28


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> Dict[str, Any]:
    mask = np.isfinite(actual) & np.isfinite(predicted)
    y, p = actual[mask], predicted[mask]
    if not len(y):
        return {"mae": None, "rmse": None, "mape": None, "wape": None, "n": 0}
    denom = np.abs(y).sum()
    positive = np.abs(y) > 0.1
    return {
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(np.sqrt(mean_squared_error(y, p))),
        "mape": float(np.mean(np.abs((y[positive] - p[positive]) / y[positive])) * 100) if positive.any() else None,
        "wape": float(np.abs(y - p).sum() / denom * 100) if denom > 1e-8 else None,
        "n": int(len(y)),
    }


class DemandForecastingEngine:
    """Compare baseline candidates and optional Random Forest chronologically."""

    def __init__(self, model_type: str = "auto", timezone: str = "UTC"):
        self.model_type = model_type.lower()
        self.timezone = timezone
        self.model = None
        self.feature_columns: List[str] = []
        self.training_rows: pd.DataFrame | None = None
        self.interval: Dict[str, Any] | None = None
        self.metrics: Dict[str, Any] = {}
        self.selected_model = "seasonal_median"
        self.validation_interval: float | None = None

    def _split(self, data: pd.DataFrame):
        n = len(data)
        if n < 300:
            raise ValueError("Insufficient usable hourly history; at least 28 days of valid history are required.")
        train_end, val_end = int(n * .70), int(n * .85)
        return data.iloc[:train_end], data.iloc[train_end:val_end], data.iloc[val_end:]

    def train_and_evaluate(self, raw_readings: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        hourly, quality = prepare_hourly(raw_readings, self.timezone)
        usable, features = make_supervised(hourly)
        train, validation, test = self._split(usable)
        self.feature_columns = features
        comparison = {}
        candidate_validation = {}
        for name in BASELINES:
            candidate_validation[name] = predict_baseline(name, usable, validation)
            comparison[name] = {"validation": _metrics(validation.consumption_kwh.to_numpy(), candidate_validation[name])}

        candidates = list(BASELINES)
        if self.model_type in ("auto", "random_forest"):
            rf = RandomForestRegressor(n_estimators=160, max_depth=14, min_samples_leaf=2, n_jobs=-1, random_state=42)
            rf.fit(train[features], train.consumption_kwh)
            candidate_validation["random_forest"] = rf.predict(validation[features])
            comparison["random_forest"] = {"validation": _metrics(validation.consumption_kwh.to_numpy(), candidate_validation["random_forest"])}
            candidates.append("random_forest")
        elif self.model_type == "xgboost":
            try:
                from xgboost import XGBRegressor
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    xgb = XGBRegressor(n_estimators=160, max_depth=5, learning_rate=.05, objective="reg:squarederror", n_jobs=2, random_state=42)
                    xgb.fit(train[features], train.consumption_kwh)
                candidate_validation["xgboost"] = xgb.predict(validation[features])
                comparison["xgboost"] = {"validation": _metrics(validation.consumption_kwh.to_numpy(), candidate_validation["xgboost"])}
                self._xgb = xgb
                candidates.append("xgboost")
            except Exception as exc:
                comparison["xgboost"] = {"available": False, "reason": type(exc).__name__}
        elif self.model_type not in ("baseline", "seasonal_median", "last", "previous_day", "previous_week"):
            raise ValueError("model_type must be auto, baseline, random_forest, or xgboost.")

        # Select by validation MAE. The test segment is not consulted until selection is frozen.
        requested = "seasonal_median" if self.model_type == "baseline" else self.model_type
        selectable = candidates if requested == "auto" else ([requested] if requested in candidates else ["seasonal_median"])
        self.selected_model = min(selectable, key=lambda name: comparison[name]["validation"]["mae"] if comparison[name]["validation"]["mae"] is not None else float("inf"))
        fit_rows = pd.concat([train, validation])
        fitted_candidates = {}
        # Freeze selection before evaluating every candidate once on the untouched test period.
        for candidate in candidates:
            if candidate in BASELINES:
                test_predictions = predict_baseline(candidate, usable, test)
            elif candidate == "random_forest":
                fitted_candidates[candidate] = RandomForestRegressor(n_estimators=160, max_depth=14, min_samples_leaf=2, n_jobs=-1, random_state=42)
                fitted_candidates[candidate].fit(fit_rows[features], fit_rows.consumption_kwh)
                test_predictions = fitted_candidates[candidate].predict(test[features])
            else:
                from xgboost import XGBRegressor
                fitted_candidates[candidate] = XGBRegressor(n_estimators=160, max_depth=5, learning_rate=.05, objective="reg:squarederror", n_jobs=2, random_state=42)
                fitted_candidates[candidate].fit(fit_rows[features], fit_rows.consumption_kwh)
                test_predictions = fitted_candidates[candidate].predict(test[features])
            comparison[candidate]["test"] = _metrics(test.consumption_kwh.to_numpy(), test_predictions)
        self.model = fitted_candidates.get(self.selected_model)

        self.validation_interval = float(np.quantile(np.abs(validation.consumption_kwh.to_numpy() - candidate_validation[self.selected_model]), .9)) if len(validation) else None
        self.training_rows = fit_rows.sort_values("timestamp").copy()
        horizon_metrics = {}
        for horizon in (24, 168):
            if len(test) < horizon:
                horizon_metrics[str(horizon)] = {"available": False, "reason": "The chronological test segment is shorter than this horizon."}
                continue
            operational_columns = [column for column in KNOWN_FUTURE_FEATURES if column in self.feature_columns]
            future_ops = []
            for _, row in test.iloc[:horizon].iterrows():
                item = {"timestamp": row.timestamp.isoformat()}
                for column in operational_columns:
                    if column not in row or pd.isna(row[column]):
                        item = {}
                        break
                    item[column] = row[column]
                if not item:
                    break
                future_ops.append(item)
            try:
                if operational_columns and len(future_ops) != horizon:
                    raise ValueError("Required future operational features are unavailable for this held-out period.")
                points = self.generate_forecast(pd.DataFrame(), horizon, future_ops)
                actual_by_time = test.set_index("timestamp").consumption_kwh
                actuals = np.asarray([float(actual_by_time.loc[pd.Timestamp(point["timestamp"])]) for point in points])
                predicted = np.asarray([float(point["predicted_consumption_kwh"]) for point in points])
                horizon_metrics[str(horizon)] = {"available": True, "origin": test.timestamp.iloc[0].isoformat(), "origins": 1,
                    "metrics": _metrics(actuals, predicted), "evaluation": "single fixed origin in chronological test; exploratory, not a coverage guarantee"}
            except (ValueError, KeyError) as exc:
                horizon_metrics[str(horizon)] = {"available": False, "reason": str(exc)}
        self.training_rows = usable
        self.interval = quality
        selected_test = comparison[self.selected_model]["test"]
        self.metrics = {**selected_test, "comparison": comparison, "selected_model": self.selected_model,
                        "train_size": len(train), "validation_size": len(validation), "test_size": len(test),
                        "train_period": [train.timestamp.iloc[0].isoformat(), train.timestamp.iloc[-1].isoformat()],
                        "validation_period": [validation.timestamp.iloc[0].isoformat(), validation.timestamp.iloc[-1].isoformat()],
                        "test_period": [test.timestamp.iloc[0].isoformat(), test.timestamp.iloc[-1].isoformat()],
                        "quality": quality, "horizon_metrics": horizon_metrics}
        return self.metrics, {"processed_df": usable, "features": features, "comparison": comparison}

    def generate_forecast(self, historical_df: pd.DataFrame, horizon_hours: int = 24, future_ops=None,
                          forecast_start=None) -> List[Dict[str, Any]]:
        if horizon_hours not in (24, 168):
            raise ValueError("Supported forecast horizons are 24 or 168 hours.")
        if self.metrics and not self.metrics.get("horizon_metrics", {}).get(str(horizon_hours), {}).get("available", False):
            raise ValueError(f"The {horizon_hours}-hour horizon is not supported by this model's held-out evaluation data.")
        if self.training_rows is None:
            raise ValueError("Train and evaluate before requesting a forecast.")
        history = self.training_rows.sort_values("timestamp").copy()
        if historical_df is not None and len(historical_df) and {"timestamp", "consumption_kwh"}.issubset(historical_df.columns):
            recent, _ = prepare_hourly(historical_df.to_dict("records"), self.timezone)
            recent, _ = make_supervised(recent)
            if recent.empty:
                raise ValueError("Recent observed history is insufficient for this model's lag features.")
            history = recent.sort_values("timestamp").copy()
        last = pd.to_datetime(history.timestamp.iloc[-1], utc=True)
        start = last + timedelta(hours=1) if forecast_start is None else pd.to_datetime(forecast_start, utc=True)
        if pd.isna(start):
            raise ValueError("Forecast start must be a valid UTC timestamp.")
        if start.minute or start.second or start.microsecond:
            raise ValueError("Forecast start must align to a UTC hour.")
        bridge_hours = int((start - last).total_seconds() // 3600) - 1
        if bridge_hours < 0 or (start - last).total_seconds() % 3600:
            raise ValueError("Forecast start must follow the latest usable historical hour.")
        if bridge_hours > 24:
            raise ValueError("Latest usable history is more than 24 hours behind the requested forecast window.")
        future_map = {}
        for item in future_ops or []:
            stamp = pd.to_datetime(item.get("timestamp"), utc=True, errors="coerce")
            if pd.notna(stamp):
                future_map[stamp.floor("h").isoformat()] = item
        results = []
        for step in range(1, bridge_hours + horizon_hours + 1):
            ts = last + timedelta(hours=step)
            row = {"timestamp": ts, "consumption_kwh": np.nan}
            frame = pd.concat([history, pd.DataFrame([row])], ignore_index=True)
            frame["lag_1h"] = frame.consumption_kwh.shift(1)
            frame["lag_24h"] = frame.consumption_kwh.shift(24)
            frame["lag_168h"] = frame.consumption_kwh.shift(168)
            prior = frame.consumption_kwh.shift(1)
            frame["rolling_mean_24h"] = prior.rolling(24, min_periods=24).mean()
            frame["rolling_mean_168h"] = prior.rolling(168, min_periods=168).mean()
            local = pd.DatetimeIndex([ts]).tz_convert(self.timezone)
            h, d, m = local.hour[0], local.dayofweek[0], local.month[0]
            features = {"hour_sin": np.sin(2*np.pi*h/24), "hour_cos": np.cos(2*np.pi*h/24),
                        "dow_sin": np.sin(2*np.pi*d/7), "dow_cos": np.cos(2*np.pi*d/7),
                        "month_sin": np.sin(2*np.pi*(m-1)/12), "month_cos": np.cos(2*np.pi*(m-1)/12),
                        "is_weekend": int(d >= 5), "is_dst": int(bool(local[0].dst())),
                        "lag_1h": frame.lag_1h.iloc[-1], "lag_24h": frame.lag_24h.iloc[-1], "lag_168h": frame.lag_168h.iloc[-1],
                        "rolling_mean_24h": frame.rolling_mean_24h.iloc[-1], "rolling_mean_168h": frame.rolling_mean_168h.iloc[-1]}
            operational = future_map.get(ts.floor("h").isoformat(), {})
            for column in ("is_holiday", "is_exam_period", "calendar_data_available", "scheduled_classes", "schedule_data_available"):
                if column in self.feature_columns:
                    if column not in operational:
                        raise ValueError(f"The selected model requires future operational feature '{column}', but that feature is unavailable.")
                    features[column] = operational[column]
            for col in self.feature_columns:
                features.setdefault(col, 0.0)
            if any(pd.isna(features[c]) for c in self.feature_columns):
                raise ValueError("Forecast history has gaps at the requested horizon; refusing to invent lag values.")
            if self.model is not None:
                pred = float(self.model.predict(pd.DataFrame([features])[self.feature_columns])[0])
            else:
                pred = float(predict_baseline(self.selected_model, history, pd.DataFrame([{"timestamp": ts}]))[0])
            pred = max(0.0, pred)
            if ts >= start:
                results.append({"timestamp": ts.isoformat(), "predicted_consumption_kwh": pred,
                                "predicted_demand_kw": pred, "confidence_lower": max(0.0, pred-self.validation_interval) if self.validation_interval is not None else None,
                                "confidence_upper": pred+self.validation_interval if self.validation_interval is not None else None,
                                "interval_type": "empirical_validation_abs_error_p90" if self.validation_interval is not None else None,
                                "factors": {"model": self.selected_model, "timezone": self.timezone,
                                            "scheduled_classes": operational.get("scheduled_classes") if operational else None,
                                            "is_holiday": operational.get("is_holiday") if operational else None,
                                            "is_exam_period": operational.get("is_exam_period") if operational else None}})
            history = pd.concat([history, pd.DataFrame([{**row, "consumption_kwh": pred, **features}])], ignore_index=True)
        return results
