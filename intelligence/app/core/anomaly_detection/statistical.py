import numpy as np
import pandas as pd
from typing import List, Dict, Any
from sklearn.ensemble import IsolationForest

class AnomalyDetectionEngine:
    def __init__(self, method: str = "combined", sensitivity: float = 2.5):
        self.method = method.lower()
        self.sensitivity = sensitivity  # Z-score cutoff (e.g. 2.5 or 3.0)

    def detect(self, readings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not readings:
            return []

        df = pd.DataFrame(readings)
        df['datetime'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('datetime').reset_index(drop=True)
        
        anomalies = []

        # Group by building or room to compute contextual hourly baselines
        if 'meter_id' in df.columns and df['meter_id'].notna().any():
            group_col = 'meter_id'
        elif 'room_id' in df.columns and df['room_id'].notna().any():
            group_col = 'room_id'
        else:
            group_col = 'building_id'
        df['hour'] = df['datetime'].dt.hour
        df['dow'] = df['datetime'].dt.dayofweek

        # 1. Statistical baseline per group, dow, hour
        baselines = df.groupby([group_col, 'dow', 'hour'])['consumption_kwh'].agg(['mean', 'std']).reset_index()
        merged = pd.merge(df, baselines, on=[group_col, 'dow', 'hour'], how='left')
        merged['std'] = merged['std'].fillna(2.0).replace(0.0, 1.0)
        merged['z_score'] = (merged['consumption_kwh'] - merged['mean']) / merged['std']

        # 2. Isolation Forest (if requested or combined)
        iso_scores = np.ones(len(df))
        if self.method in ["isolation_forest", "combined"] and len(df) >= 30:
            features = merged[['consumption_kwh', 'hour', 'dow']].fillna(0)
            iso = IsolationForest(contamination=0.03, random_state=42)
            iso_scores = iso.fit_predict(features) # -1 is anomaly

        for idx, row in merged.iterrows():
            z = abs(row['z_score'])
            is_iso_anomaly = (iso_scores[idx] == -1)
            observed = float(row['consumption_kwh'])
            expected = max(1.0, float(row['mean']))
            deviation_kwh = round(observed - expected, 2)
            dev_pct = round((deviation_kwh / expected) * 100, 1)

            # Trigger condition based on method
            flagged = False
            detect_method = ""
            if self.method == "z_score" and z >= self.sensitivity:
                flagged = True
                detect_method = f"Z-Score ({round(z, 2)})"
            elif self.method == "isolation_forest" and is_iso_anomaly:
                flagged = True
                detect_method = "Isolation Forest"
            elif self.method == "combined" and (z >= self.sensitivity or (z >= 2.0 and is_iso_anomaly)):
                flagged = True
                detect_method = f"Combined (Z={round(z, 2)}, IsoForest={is_iso_anomaly})"

            if flagged and abs(deviation_kwh) >= 3.0:
                # Classify type
                if deviation_kwh > 0:
                    if row.get('is_scheduled_period') is False:
                        atype = "unscheduled_surge"
                        desc = f"Excessive energy consumption of {observed} kWh detected during unscheduled/off-hours period."
                        action = "Check if HVAC or lab computers were left running overnight."
                    else:
                        atype = "consumption_spike"
                        desc = f"Consumption spike: observed {observed} kWh vs baseline {round(expected, 1)} kWh (+{dev_pct}%)."
                        action = "Inspect high-power equipment or simultaneous compressor cycles."
                else:
                    atype = "sudden_drop"
                    desc = f"Abnormal drop: observed {observed} kWh vs baseline {round(expected, 1)} kWh ({dev_pct}%)."
                    action = "Verify sub-meter connectivity or unexpected circuit trip."

                # Severity classification
                if abs(dev_pct) > 100 or abs(deviation_kwh) > 50:
                    severity = "critical"
                elif abs(dev_pct) > 50 or abs(deviation_kwh) > 25:
                    severity = "high"
                elif abs(dev_pct) > 25 or abs(deviation_kwh) > 10:
                    severity = "medium"
                else:
                    severity = "low"

                confidence = min(0.98, max(0.65, round(0.6 + (z / 10.0), 2)))

                anomalies.append({
                    "timestamp": row['timestamp'],
                    "building_id": str(row.get('building_id', 'Main')),
                    "room_id": str(row.get('room_id', '')) if pd.notna(row.get('room_id')) else None,
                    "meter_id": str(row.get('meter_id', '')) if pd.notna(row.get('meter_id')) else None,
                    "anomaly_type": atype,
                    "severity": severity,
                    "expected_value": round(expected, 2),
                    "observed_value": round(observed, 2),
                    "deviation_percent": dev_pct,
                    "deviation_kwh": deviation_kwh,
                    "confidence": confidence,
                    "detection_method": detect_method,
                    "description": desc,
                    "suggested_action": action
                })

        return anomalies
