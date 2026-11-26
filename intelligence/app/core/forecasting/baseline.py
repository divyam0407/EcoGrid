import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple

class BaselineForecaster:
    """
    Seasonal Naive and Historical Hourly/Day-of-Week Average Forecaster.
    Used as an honest, deterministic baseline to benchmark ML models against.
    """
    def __init__(self):
        self.profile = {}

    def fit(self, df: pd.DataFrame):
        """
        df must contain: 'hour', 'day_of_week', 'consumption_kwh'
        """
        grouped = df.groupby(['day_of_week', 'hour'])['consumption_kwh'].agg(['mean', 'std']).reset_index()
        self.profile = {}
        for _, row in grouped.iterrows():
            dow = int(row['day_of_week'])
            hr = int(row['hour'])
            self.profile[(dow, hr)] = {
                'mean': float(row['mean']),
                'std': float(row['std']) if not np.isnan(row['std']) else 2.0
            }
        self.global_mean = float(df['consumption_kwh'].mean()) if len(df) > 0 else 50.0

    def predict(self, future_df: pd.DataFrame) -> List[Dict[str, float]]:
        predictions = []
        for _, row in future_df.iterrows():
            dow = int(row['day_of_week'])
            hr = int(row['hour'])
            stat = self.profile.get((dow, hr), {'mean': self.global_mean, 'std': 5.0})
            mean_val = max(1.0, stat['mean'])
            std_val = max(0.5, stat['std'])
            predictions.append({
                'predicted_consumption_kwh': mean_val,
                'predicted_demand_kw': mean_val, # for 1-hour interval
                'confidence_lower': max(0.0, mean_val - 1.96 * std_val),
                'confidence_upper': mean_val + 1.96 * std_val
            })
        return predictions
