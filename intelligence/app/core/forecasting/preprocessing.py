"""Quality-aware hourly preparation shared by training, evaluation and inference."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Tuple
import numpy as np
import pandas as pd

VALID_QUALITY = {"VALIDATED", "MEASURED", "CALCULATED_INTERVAL"}
BASE_FEATURES = [
    "hour_sin", "hour_cos", "dow_sin", "dow_cos", "month_sin", "month_cos",
    "is_weekend", "is_dst", "lag_1h", "lag_24h", "lag_168h",
    "rolling_mean_24h", "rolling_mean_168h",
]
KNOWN_FUTURE_FEATURES = ["is_holiday", "is_exam_period", "calendar_data_available", "scheduled_classes", "schedule_data_available"]


def prepare_hourly(raw_readings: Iterable[Dict[str, Any]], timezone: str) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Normalize validated meter interval energy into a sparse UTC hourly series.

    Missing hours remain NaN. The output never forward-fills consumption.
    The timezone is used for calendar features; UTC remains the canonical index,
    so DST gaps and folds map to distinct physical hours.
    """
    rows = list(raw_readings)
    if not rows:
        raise ValueError("No readings were supplied.")
    frame = pd.DataFrame(rows)
    if "timestamp" not in frame or "consumption_kwh" not in frame:
        raise ValueError("Each reading must include timestamp and consumption_kwh.")
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True, errors="coerce")
    frame["consumption_kwh"] = pd.to_numeric(frame["consumption_kwh"], errors="coerce")
    invalid_time = int(frame["timestamp"].isna().sum())
    frame = frame.dropna(subset=["timestamp", "consumption_kwh"])
    frame = frame[np.isfinite(frame["consumption_kwh"]) & (frame["consumption_kwh"] >= 0)]
    if "quality_status" in frame:
        frame = frame[frame["quality_status"].isin(VALID_QUALITY)]
    input_count = len(frame)
    frame = frame.sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    duplicates = input_count - len(frame)
    if frame.empty:
        raise ValueError("No valid, non-negative readings remain after quality filtering.")

    if "interval_minutes" not in frame:
        frame["interval_minutes"] = 60
    frame["interval_minutes"] = pd.to_numeric(frame["interval_minutes"], errors="coerce")
    frame = frame[frame["interval_minutes"].between(1, 60)]
    if frame.empty:
        raise ValueError("No readings have a supported interval duration (1–60 minutes).")
    interval = int(frame["interval_minutes"].mode().iloc[0])
    mixed_intervals = int((frame["interval_minutes"] != interval).sum())
    frame = frame[frame["interval_minutes"] == interval]
    expected_per_hour = max(1, int(round(60 / interval)))
    frame["timestamp"] = frame["timestamp"].dt.floor("h")

    frame["interval_count"] = 1
    aggregation: Dict[str, Any] = {"consumption_kwh": "sum", "interval_count": "sum"}
    for column in ["is_holiday", "calendar_data_available", "scheduled_classes", "schedule_data_available"]:
        if column in frame.columns:
            aggregation[column] = "max"
    if "temperature_c" in frame.columns:
        aggregation["temperature_c"] = "mean"
    hourly = frame.set_index("timestamp").resample("1h").agg(aggregation)
    full_index = pd.date_range(hourly.index.min(), hourly.index.max(), freq="1h", tz="UTC")
    hourly = hourly.reindex(full_index)
    hourly.index.name = "timestamp"
    counts = hourly["interval_count"].fillna(0)
    min_intervals = int(np.ceil(expected_per_hour * 0.75))
    hourly.loc[counts < min_intervals, "consumption_kwh"] = np.nan
    hourly["interval_count"] = counts.astype(int)
    if "is_holiday" in hourly:
        hourly["is_holiday"] = hourly["is_holiday"].fillna(0).astype(float)
    if "calendar_data_available" in hourly:
        hourly["calendar_data_available"] = hourly["calendar_data_available"].fillna(0).astype(float)
    if "scheduled_classes" in hourly:
        hourly["scheduled_classes"] = hourly["scheduled_classes"].fillna(0).astype(float)
    if "schedule_data_available" in hourly:
        hourly["schedule_data_available"] = hourly["schedule_data_available"].fillna(0).astype(float)

    local = hourly.index.tz_convert(timezone)
    hour = local.hour + local.minute / 60.0
    dow = local.dayofweek
    month = local.month
    hourly["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    hourly["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    hourly["dow_sin"] = np.sin(2 * np.pi * dow / 7)
    hourly["dow_cos"] = np.cos(2 * np.pi * dow / 7)
    hourly["month_sin"] = np.sin(2 * np.pi * (month - 1) / 12)
    hourly["month_cos"] = np.cos(2 * np.pi * (month - 1) / 12)
    hourly["is_weekend"] = (dow >= 5).astype(int)
    hourly["is_dst"] = np.array([int(bool(ts.dst())) for ts in local])
    hourly["local_hour"] = local.hour
    hourly["day_of_week"] = dow
    hourly["month"] = month
    hourly["is_missing_reading"] = hourly["consumption_kwh"].isna().astype(int)
    hourly["lag_1h"] = hourly["consumption_kwh"].shift(1)
    hourly["lag_24h"] = hourly["consumption_kwh"].shift(24)
    hourly["lag_168h"] = hourly["consumption_kwh"].shift(168)
    prior = hourly["consumption_kwh"].shift(1)
    hourly["rolling_mean_24h"] = prior.rolling(24, min_periods=24).mean()
    hourly["rolling_mean_168h"] = prior.rolling(168, min_periods=168).mean()
    hourly = hourly.reset_index()
    metadata = {
        "input_readings": len(rows),
        "valid_readings": len(frame),
        "duplicate_timestamps_removed": duplicates,
        "invalid_timestamps": invalid_time,
        "mixed_interval_rows_excluded": mixed_intervals,
        "interval_minutes": interval,
        "expected_intervals_per_hour": expected_per_hour,
        "missing_hours": int(hourly["consumption_kwh"].isna().sum()),
        "timezone": timezone,
        "dst_policy": "Canonical UTC bins; local feature clock preserves distinct DST fold hours and skips nonexistent local hours.",
    }
    return hourly, metadata


def make_supervised(hourly: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    feature_columns = BASE_FEATURES.copy()
    for column in KNOWN_FUTURE_FEATURES:
        if column in hourly.columns and hourly[column].notna().any() and hourly[column].nunique(dropna=True) > 1:
            feature_columns.append(column)
    required = ["consumption_kwh", "lag_1h", "lag_24h", "lag_168h", "rolling_mean_24h", "rolling_mean_168h"]
    result = hourly.dropna(subset=required).copy()
    return result, feature_columns
