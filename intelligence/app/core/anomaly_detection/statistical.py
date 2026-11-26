"""Seasonal anomaly detection with strictly historical robust baselines."""
from __future__ import annotations

from typing import List, Dict, Any
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


class AnomalyDetectionEngine:
    def __init__(self, method: str = "combined", sensitivity: float = 2.5, timezone: str = "UTC"):
        self.method = method.lower()
        self.sensitivity = sensitivity
        self.timezone = timezone

    def detect(self, readings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not readings:
            return []
        df = pd.DataFrame(readings)
        df["datetime"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
        df["consumption_kwh"] = pd.to_numeric(df["consumption_kwh"], errors="coerce")
        df = df.dropna(subset=["datetime", "consumption_kwh"]).sort_values("datetime").reset_index(drop=True)
        df = df[np.isfinite(df.consumption_kwh) & (df.consumption_kwh >= 0)]
        if "quality_status" in df:
            df = df[df.quality_status.isin(["VALIDATED", "MEASURED", "CALCULATED_INTERVAL"])]
        group_col = next((c for c in ("meter_id", "room_id", "building_id") if c in df and df[c].notna().any()), None)
        local = df.datetime.dt.tz_convert(self.timezone)
        df["local_hour"] = local.dt.hour
        df["local_dow"] = local.dt.dayofweek
        anomalies = []
        for idx, row in df.iterrows():
            prior = df.iloc[:idx]
            if group_col:
                prior = prior[prior[group_col] == row[group_col]]
            seasonal = prior[(prior.local_hour == row.local_hour) & (prior.local_dow == row.local_dow)]
            for context_column in ("calendar_data_available", "schedule_data_available", "is_holiday", "is_exam_period", "scheduled_classes"):
                if context_column in df and pd.notna(row.get(context_column)):
                    seasonal = seasonal[seasonal[context_column] == row.get(context_column)]
            if len(seasonal) < 4:
                continue
            vals = seasonal.consumption_kwh.to_numpy(dtype=float)
            median = float(np.median(vals))
            mad = float(np.median(np.abs(vals - median)))
            robust_sigma = 1.4826 * mad
            observed = float(row.consumption_kwh)
            deviation = observed - median
            score = abs(deviation) / robust_sigma if robust_sigma > 1e-9 else (float("inf") if abs(deviation) >= 3 else 0.0)
            is_iso = False
            if self.method in ("isolation_forest", "combined") and len(seasonal) >= 20:
                model = IsolationForest(contamination="auto", random_state=42)
                model.fit(seasonal[["consumption_kwh"]])
                is_iso = model.predict([[observed]])[0] == -1
            flagged = (self.method in ("z_score", "robust") and score >= self.sensitivity) or \
                      (self.method == "isolation_forest" and is_iso) or \
                      (self.method == "combined" and (score >= self.sensitivity or (score >= 2.0 and is_iso)))
            if not flagged or abs(deviation) < 3:
                continue
            pct = deviation / max(abs(median), 0.1) * 100
            kind = "consumption_spike" if deviation > 0 else "sudden_drop"
            severity = "critical" if abs(pct) > 100 else "high" if abs(pct) > 50 else "medium" if abs(pct) > 25 else "low"
            anomalies.append({
                "timestamp": row.datetime.isoformat(), "building_id": str(row.get("building_id", "")),
                "room_id": str(row.get("room_id")) if pd.notna(row.get("room_id")) else None,
                "meter_id": str(row.get("meter_id")) if pd.notna(row.get("meter_id")) else None,
                "anomaly_type": kind, "severity": severity, "expected_value": round(median, 2),
                "observed_value": round(observed, 2), "deviation_percent": round(pct, 1),
                "deviation_kwh": round(deviation, 2), "confidence": None,
                "detection_method": "seasonal_median_mad" + ("+isolation_forest" if is_iso else ""),
                "baseline_sample_count": int(len(seasonal)),
                "quality_status": str(row.get("quality_status", "UNKNOWN")),
                "interval_minutes": int(row.get("interval_minutes") or 60),
                "operational_context": {
                    "is_holiday": bool(row.get("is_holiday")) if pd.notna(row.get("is_holiday")) else None,
                    "is_exam_period": bool(row.get("is_exam_period")) if pd.notna(row.get("is_exam_period")) else None,
                    "scheduled_classes": int(row.get("scheduled_classes")) if pd.notna(row.get("scheduled_classes")) else None,
                    "calendar_data_available": bool(row.get("calendar_data_available")) if pd.notna(row.get("calendar_data_available")) else None,
                    "schedule_data_available": bool(row.get("schedule_data_available")) if pd.notna(row.get("schedule_data_available")) else None,
                },
                "description": f"Observed {observed:.2f} kWh vs prior same-local-hour weekday median {median:.2f} kWh; robust deviation {score:.2f} MAD units using {len(seasonal)} historical readings.",
                "suggested_action": None,
            })
        return anomalies
