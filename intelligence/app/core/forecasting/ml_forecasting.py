import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import xgboost as xgb
from intelligence.app.core.forecasting.baseline import BaselineForecaster

class DemandForecastingEngine:
    def __init__(self, model_type: str = "xgboost"):
        self.model_type = model_type.lower()
        self.model = None
        self.baseline = BaselineForecaster()
        self.feature_columns = [
            'hour', 'day_of_week', 'month', 'is_weekend',
            'lag_1h', 'lag_24h', 'rolling_mean_24h'
        ]

    def _prepare_training_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df['datetime'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('datetime').reset_index(drop=True)
        
        df['hour'] = df['datetime'].dt.hour
        df['day_of_week'] = df['datetime'].dt.dayofweek
        df['month'] = df['datetime'].dt.month
        df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
        
        # Lags and rolling features
        df['lag_1h'] = df['consumption_kwh'].shift(1)
        df['lag_24h'] = df['consumption_kwh'].shift(24)
        df['rolling_mean_24h'] = df['consumption_kwh'].rolling(24, min_periods=1).mean()

        return df

    def train_and_evaluate(self, raw_readings: List[Dict[str, Any]]) -> Tuple[Dict[str, float], Dict[str, Any]]:
        df = pd.DataFrame(raw_readings)
        if len(df) < 48:
            raise ValueError("At least 48 observed readings are required for forecasting.")

        processed = self._prepare_training_features(df).dropna(subset=['lag_1h', 'lag_24h'])
        # Chronological split: last 20% for testing, never random shuffling for time-series!
        split_idx = int(len(processed) * 0.8)
        train_df = processed.iloc[:split_idx]
        test_df = processed.iloc[split_idx:]
        self.baseline.fit(train_df)

        X_train = train_df[self.feature_columns]
        y_train = train_df['consumption_kwh']
        X_test = test_df[self.feature_columns]
        y_test = test_df['consumption_kwh']

        if self.model_type == "random_forest":
            self.model = RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42)
            self.model.fit(X_train, y_train)
        elif self.model_type == "xgboost":
            self.model = xgb.XGBRegressor(n_estimators=120, max_depth=5, learning_rate=0.08, random_state=42)
            self.model.fit(X_train, y_train)
        else: # baseline
            self.model = None

        if self.model is not None and len(test_df) > 0:
            y_pred = self.model.predict(X_test)
            mae = float(mean_absolute_error(y_test, y_pred))
            rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
            # Safe MAPE calculation
            mask = y_test > 0.1
            if mask.sum() > 0:
                mape = float(np.mean(np.abs((y_test[mask] - y_pred[mask]) / y_test[mask])) * 100)
            else:
                mape = None
        else:
            baseline_preds = np.array([p['predicted_consumption_kwh'] for p in self.baseline.predict(test_df)])
            mae = float(mean_absolute_error(y_test, baseline_preds)) if len(test_df) > 0 else None
            rmse = float(np.sqrt(mean_squared_error(y_test, baseline_preds))) if len(test_df) > 0 else None
            mask = y_test > 0.1
            mape = float(np.mean(np.abs((y_test[mask] - baseline_preds[mask]) / y_test[mask])) * 100) if mask.sum() else None

        metrics = {
            "mae": round(mae, 2) if mae is not None else None,
            "rmse": round(rmse, 2) if rmse is not None else None,
            "mape": round(mape, 2) if mape is not None else None,
            "train_size": len(train_df),
            "test_size": len(test_df)
        }
        return metrics, {"processed_df": processed}

    def generate_forecast(
        self,
        historical_df: pd.DataFrame,
        horizon_hours: int = 24,
        future_ops: List[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        if len(historical_df) == 0:
            return []

        last_timestamp = pd.to_datetime(historical_df['timestamp'].iloc[-1])
        future_ops_map = {}
        if future_ops:
            for op in future_ops:
                dt_key = pd.to_datetime(op['timestamp']).strftime('%Y-%m-%d %H:00:00')
                future_ops_map[dt_key] = op

        last_known_kwh = float(historical_df['consumption_kwh'].iloc[-1])
        recent_24h_mean = float(historical_df['consumption_kwh'].tail(24).mean())

        predictions = []
        current_time = last_timestamp

        for step in range(1, horizon_hours + 1):
            future_time = current_time + timedelta(hours=step)
            dt_str = future_time.strftime('%Y-%m-%d %H:00:00')
            op_info = future_ops_map.get(dt_str, {})
            
            hr = future_time.hour
            dow = future_time.weekday()
            month = future_time.month
            is_wknd = 1 if dow in [5, 6] else 0
            # Historical lag estimates
            lag_1 = last_known_kwh if step == 1 else predictions[-1]['predicted_consumption_kwh']
            lag_24 = historical_df['consumption_kwh'].iloc[-24 + (step % 24)] if len(historical_df) >= 24 else recent_24h_mean
            lag_168 = historical_df['consumption_kwh'].iloc[-168 + (step % 168)] if len(historical_df) >= 168 else lag_24

            feat_row = pd.DataFrame([{
                'hour': hr,
                'day_of_week': dow,
                'month': month,
                'is_weekend': is_wknd,
                'lag_1h': lag_1,
                'lag_24h': lag_24,
                'lag_168h': lag_168,
                'rolling_mean_24h': recent_24h_mean
            }])

            if self.model is not None:
                val = float(self.model.predict(feat_row[self.feature_columns])[0])
            else:
                base_pred = self.baseline.predict(feat_row)[0]
                val = base_pred['predicted_consumption_kwh']

            # Ensure positive, sensible value
            val = max(0.0, round(val, 2))
            uncertainty = val * 0.08  # ~8% confidence bounds
            
            predictions.append({
                'timestamp': future_time.isoformat(),
                'predicted_demand_kw': val,
                'predicted_consumption_kwh': val,
                'confidence_lower': max(0.0, round(val - 1.96 * uncertainty, 2)),
                'confidence_upper': round(val + 1.96 * uncertainty, 2),
                'factors': {
                    'is_weekend': bool(is_wknd),
                }
            })

        return predictions
