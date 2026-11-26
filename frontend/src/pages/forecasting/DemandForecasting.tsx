import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  TrendingUp,
  Cpu,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export const DemandForecasting: React.FC = () => {
  const [modelType, setModelType] = useState<string>('xgboost');
  const [horizon, setHorizon] = useState<number>(24);
  const [forecastData, setForecastData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState('SYNTHETIC_DEMO');
  const [error, setError] = useState('');

  useEffect(() => { api.get('/energy/sources').then((response) => setDataSources(response.data.sources || [])).catch(() => setDataSources([])); }, []);

  useEffect(() => {
    runModelForecast();
  }, [modelType, horizon, dataSource]);

  const runModelForecast = async () => {
    setLoading(true);
    try {
      const res = await api.post('/forecast/run', {
        horizonHours: horizon,
        modelType,
        dataSource,
      });
      setForecastData(res.data);
      setError('');
    } catch (err) {
      setForecastData(null);
      setError((err as any)?.response?.data?.error || 'Forecast could not be produced for this source.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Machine Learning Demand Forecasting</h1>
          <p className="text-xs text-slate-400">
            Multi-horizon energy demand predictions leveraging time series lag features, academic schedules & weather
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3">
          <select value={dataSource} onChange={(e) => setDataSource(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200">
            <option value="SYNTHETIC_DEMO">ABC University demo</option>
            {dataSources.filter((source) => source !== 'SYNTHETIC_DEMO').map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
          {/* Model Type */}
          <select
            value={modelType}
            onChange={(e) => setModelType(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-semibold"
          >
            <option value="xgboost">XGBoost Regressor (Recommended)</option>
            <option value="random_forest">Random Forest Regressor</option>
            <option value="baseline">Baseline Seasonal Naive</option>
          </select>

          {/* Horizon */}
          <select
            value={horizon}
            onChange={(e) => setHorizon(parseInt(e.target.value, 10))}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-semibold"
          >
            <option value={24}>Next 24 Hours</option>
            <option value={168}>Next 7 Days (168h)</option>
          </select>

          <button
            onClick={runModelForecast}
            disabled={loading}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Inferring...' : 'Re-Run'}</span>
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-200">{error}</div>}

      {/* Model Performance & Evaluation Metrics (Module 5.4) */}
      <p className="text-[11px] text-slate-500">Metrics use a chronological holdout from this selected source. They are not a claim of commercial accuracy or energy savings.</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">Active Model</div>
          <div className="text-sm font-bold text-emerald-400 truncate">
            {forecastData?.model_name || '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            {forecastData?.model_version || 'Selected source: ' + dataSource}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">Mean Absolute Error</div>
          <div className="text-xl font-bold text-white">
            {forecastData?.metrics?.mae ?? '—'} <span className="text-xs font-normal text-slate-400">kWh</span>
          </div>
          <div className="text-[10px] text-emerald-400 mt-1">Evaluated on test slice</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">RMSE</div>
          <div className="text-xl font-bold text-white">
            {forecastData?.metrics?.rmse ?? '—'} <span className="text-xs font-normal text-slate-400">kWh</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Root Mean Square Error</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">MAPE</div>
          <div className="text-xl font-bold text-emerald-400">
            {forecastData?.metrics?.mape == null ? '—' : `${forecastData.metrics.mape}%`}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Mean Absolute % Error</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">Chronological Split</div>
          <div className="text-sm font-bold text-white font-mono">
            {forecastData?.metrics ? `${forecastData.metrics.train_size} / ${forecastData.metrics.test_size}` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Strict time-series split (No shuffle)</div>
        </div>
      </div>

      {/* Main Forecast Chart with Confidence Intervals */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">
              Predicted Load and Indicative Model Range
            </h3>
            <p className="text-[11px] text-slate-400">
              Forecast from observed readings in {dataSource}; no occupancy, timetable or weather values are inferred.
            </p>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center space-x-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>Predicted Demand</span>
            </span>
            <span className="flex items-center space-x-1.5 text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500/40"></span>
                <span>Indicative range (uncalibrated)</span>
            </span>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={forecastData?.forecasts || []}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="timestamp"
                stroke="#64748b"
                tickFormatter={(t) => t.slice(11, 16)}
                tick={{ fontSize: 10 }}
              />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                formatter={(val: any) => [`${val} kW`, 'Demand']}
                labelFormatter={(l) => new Date(l).toLocaleString()}
              />
              <Area
                type="monotone"
                dataKey="confidence_upper"
                stroke="transparent"
                fill="url(#colorConfidence)"
                name="Confidence Upper"
              />
              <Area
                type="monotone"
                dataKey="confidence_lower"
                stroke="transparent"
                fill="#0f172a"
                name="Confidence Lower"
              />
              <Line
                type="monotone"
                dataKey="predicted_demand_kw"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
                name="Predicted Demand (kW)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly Predictions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Granular Prediction Schedule</h3>
          <span className="text-[10px] text-slate-400 font-mono">
            {forecastData?.forecasts?.length || 0} Hourly Intervals
          </span>
        </div>

        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0">
              <tr>
                <th className="px-4 py-2.5">Forecast Time (UTC)</th>
                <th className="px-4 py-2.5">Predicted Demand (kW)</th>
                <th className="px-4 py-2.5">95% Bound Range</th>
                <th className="px-4 py-2.5">Calendar Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {forecastData?.forecasts?.slice(0, 24).map((f: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-300">
                    {new Date(f.timestamp).toISOString().replace('T', ' ').slice(0, 16)}
                  </td>
                  <td className="px-4 py-2 text-emerald-400 font-bold">{f.predicted_demand_kw} kW</td>
                  <td className="px-4 py-2 text-slate-400">
                    [{f.confidence_lower} kW - {f.confidence_upper} kW]
                  </td>
                  <td className="px-4 py-2 font-sans text-slate-400">{f.factors?.is_weekend ? 'Weekend calendar feature' : 'Weekday calendar feature'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
