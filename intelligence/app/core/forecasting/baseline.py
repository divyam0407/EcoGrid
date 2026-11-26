"""Simple, leakage-safe demand forecasting baselines."""
from __future__ import annotations

from typing import Iterable
import numpy as np
import pandas as pd


def predict_baseline(name: str, train: pd.DataFrame, target: pd.DataFrame) -> np.ndarray:
    """Predict target rows from training history and target timestamps only."""
    name = name.lower()
    if train.empty:
        raise ValueError("Baseline requires training observations.")
    history = train.set_index("timestamp")["consumption_kwh"].sort_index()
    values = []
    for ts in pd.to_datetime(target["timestamp"], utc=True):
        available = history[history.index < ts]
        if name == "last":
            value = available.iloc[-1] if len(available) else np.nan
        elif name == "previous_day":
            value = history.get(ts - pd.Timedelta(hours=24), np.nan)
        elif name == "previous_week":
            value = history.get(ts - pd.Timedelta(hours=168), np.nan)
        elif name == "seasonal_median":
            local_hour = ts.hour
            same_hour = available[available.index.hour == local_hour]
            value = same_hour.median() if len(same_hour) else history.median()
        else:
            raise ValueError(f"Unknown baseline: {name}")
        values.append(float(value) if pd.notna(value) else float(available.median()) if len(available) else float(history.median()))
    return np.asarray(values)
