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
  const [modelType, setModelType] = useState<string>('auto');
  const [horizon, setHorizon] = useState<number>(24);
  const [forecastData, setForecastData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState('SYNTHETIC_DEMO');
  const [error, setError] = useState('');
  const [meters, setMeters] = useState<any[]>([]);
  const [meterId, setMeterId] = useState('');
  const [models, setModels] = useState<any[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [monitoring, setMonitoring] = useState<any>(null);
  const [forecastHistory, setForecastHistory] = useState<any[]>([]);
  const [training, setTraining] = useState(false);
  const chartData = [
    ...(forecastData?.history || []).map((point: any) => ({ ...point, observed_demand_kw: point.actual_kwh, predicted_demand_kw: null })),
    ...(forecastData?.forecasts || []).map((point: any) => ({ ...point, observed_demand_kw: null, series: 'Forecast' })),
  ];

  useEffect(() => {
    api.get('/forecast/options').then((response) => {
      const items = response.data.meters || [];
      setMeters(items);
      if (items.length) { setMeterId(items[0].id); setDataSource(items[0].dataSource); }
    }).catch(() => setMeters([]));
  }, []);

  const refreshModels = async () => {
    if (!meterId) return;
    const result = await api.get('/forecast/models', { params: { meterId } });
    const items = result.data.models || [];
    setModels(items);
    if (!selectedModelId || !items.some((item: any) => item.id === selectedModelId)) {
      setSelectedModelId(items.find((item: any) => item.isActive)?.id || items[0]?.id || '');
    }
  };

  const refreshForecastHistory = async () => {
    if (!meterId) return;
    const result = await api.get('/forecast', { params: { meterId, limit: 168 } });
    setForecastHistory((result.data.predictions || []).slice().reverse());
  };

  useEffect(() => { refreshModels().catch(() => setModels([])); }, [meterId]);
  useEffect(() => {
    if (!meterId) return;
    api.get('/forecast/monitoring', { params: { meterId, ...(selectedModelId ? { modelId: selectedModelId } : {}) } })
      .then((result) => setMonitoring(result.data)).catch(() => setMonitoring(null))
      .finally(() => refreshForecastHistory().catch(() => setForecastHistory([])));
  }, [meterId, selectedModelId]);
  useEffect(() => {
    const chosen = models.find((item) => item.id === selectedModelId);
    if (!chosen || !['QUEUED', 'TRAINING'].includes(chosen.status)) return;
    const timer = setInterval(() => { refreshModels().catch(() => undefined); }, 2500);
    return () => clearInterval(timer);
  }, [models, selectedModelId, meterId]);

  const queueTraining = async () => {
    setTraining(true); setError('');
    try {
      const result = await api.post('/forecast/models/train', { meterId, dataSource, modelType });
      setSelectedModelId(result.data.model.id);
      await refreshModels();
    } catch (err) { setError((err as any)?.response?.data?.error || 'Training could not be queued.'); }
    finally { setTraining(false); }
  };

  const activateModel = async () => {
    if (!selectedModelId) return;
    try { await api.post(`/forecast/models/${selectedModelId}/activate`); await refreshModels(); }
    catch (err) { setError((err as any)?.response?.data?.error || 'Model could not be activated.'); }
  };

  const runModelForecast = async () => {
    setLoading(true);
    try {
      const res = await api.post('/forecast/run', {
        meterId,
        modelId: selectedModelId,
        horizonHours: horizon,
        modelType,
        dataSource,
      });
      setForecastData(res.data);
      const result = await api.get('/forecast/monitoring', { params: { meterId, modelId: selectedModelId } });
      setMonitoring(result.data);
      await refreshForecastHistory();
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
          <p className="text-xs text-slate-400">Meter-level demand forecasts trained and evaluated from observed readings, with explicit model versions.</p>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3">
          <select value={meterId} onChange={(e) => { const next = meters.find((item) => item.id === e.target.value); setMeterId(e.target.value); if (next) setDataSource(next.dataSource); setForecastData(null); }} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200">
            <option value="">Select a meter</option>
            {meters.map((meter) => <option key={meter.id} value={meter.id}>{meter.building.name} · {meter.meterName} · {meter.dataSource}</option>)}
          </select>
          {/* Model Type */}
          <select
            value={modelType}
            onChange={(e) => setModelType(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-semibold"
          >
            <option value="auto">Select by validation</option>
            <option value="xgboost">XGBoost (optional)</option>
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
            <option value={168} disabled={!models.find((item) => item.id === selectedModelId)?.metrics?.horizon_metrics?.['168']?.available}>Next 7 Days (168h)</option>
          </select>

          <button
            onClick={queueTraining}
            disabled={training || !meterId}
            className="flex items-center space-x-1.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
          ><span>{training ? 'Queueing…' : 'Train new version'}</span></button>
          <button
            onClick={runModelForecast}
            disabled={loading || !meterId || !models.some((item) => item.id === selectedModelId && item.isActive && item.status === 'READY')}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Forecasting…' : 'Forecast'}</span>
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-200">{error}</div>}

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-white">Model registry</h2><p className="text-xs text-slate-400">Training runs in a background worker; activate a ready version explicitly.</p></div>
          <div className="flex gap-2">
            <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
              <option value="">Select a model</option>
              {models.map((model) => <option key={model.id} value={model.id}>v{model.version} · {model.algorithm} · {model.status}{model.isActive ? ' · active' : ''}</option>)}
            </select>
            <button onClick={activateModel} disabled={!selectedModelId || models.find((m) => m.id === selectedModelId)?.status !== 'READY'} className="bg-emerald-700 disabled:opacity-40 rounded px-3 py-1 text-xs text-white">Activate version</button>
          </div>
        </div>
        {selectedModelId && (() => { const model = models.find((item) => item.id === selectedModelId); return model && <div className="grid sm:grid-cols-4 gap-2 text-xs text-slate-300">
          <div>Status: <b>{model.status}</b> · {model.stage} ({model.progressPercent}%)</div>
          <div>Version: <b>v{model.version}</b> · {model.algorithm}</div>
          <div>Train/validation/test: {model.trainingRows}/{model.validationRows}/{model.testRows}</div>
          <div>{model.errorMessage || (model.artifactSha256 ? `Artifact SHA-256 ${model.artifactSha256.slice(0, 12)}…` : 'Artifact pending')}</div>
        </div>; })()}
      </section>

      {forecastData?.metrics?.comparison && <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h2 className="text-sm font-bold text-white">Validation selection and held-out comparison</h2>
        <p className="mt-1 mb-3 text-xs text-slate-400">Selection is based on validation MAE. Test results are reported after selection and are not used to choose the model.</p>
        <div className="overflow-auto"><table className="w-full text-xs text-slate-300"><thead><tr className="text-left text-slate-500"><th className="py-1">Candidate</th><th>Validation MAE</th><th>Test MAE</th><th>Test RMSE</th><th>Test WAPE</th></tr></thead><tbody>
          {Object.entries(forecastData.metrics.comparison).map(([name, values]: [string, any]) => <tr key={name} className="border-t border-slate-800"><td className="py-2">{name}{name === forecastData.metrics.selected_model ? ' · selected' : ''}</td><td>{values.validation?.mae?.toFixed?.(2) ?? '—'}</td><td>{values.test?.mae?.toFixed?.(2) ?? '—'}</td><td>{values.test?.rmse?.toFixed?.(2) ?? '—'}</td><td>{values.test?.wape?.toFixed?.(1) ?? '—'}%</td></tr>)}
        </tbody></table></div>
        <div className="mt-3 grid sm:grid-cols-2 gap-2">{[24, 168].map((hours) => { const result = forecastData.metrics.horizon_metrics?.[String(hours)]; return <div key={hours} className="rounded border border-slate-800 p-2 text-xs text-slate-300">{hours}-hour fixed-origin held-out check: {result?.available ? `MAE ${result.metrics.mae.toFixed(2)} kWh · RMSE ${result.metrics.rmse.toFixed(2)} kWh · ${result.origins} origin` : result?.reason || 'Not evaluated'}</div>; })}</div>
      </section>}

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h2 className="text-sm font-bold text-white">Prediction monitoring</h2>
        <p className="mt-1 text-xs text-slate-400">Only matched, quality-approved actual intervals contribute. Unobserved intervals remain pending.</p>
        <div className="mt-3 flex gap-6 text-xs text-slate-300"><span>Compared intervals: <b>{monitoring?.metrics?.n ?? '—'}</b></span><span>MAE: <b>{monitoring?.metrics?.mae?.toFixed?.(2) ?? '—'} kWh</b></span><span>RMSE: <b>{monitoring?.metrics?.rmse?.toFixed?.(2) ?? '—'} kWh</b></span><span>WAPE: <b>{monitoring?.metrics?.wape?.toFixed?.(1) ?? '—'}%</b></span></div>
        <div className="mt-4 h-56">
          {forecastHistory.some((point) => point.actualKwh != null) ? <ResponsiveContainer width="100%" height="100%"><LineChart data={forecastHistory.filter((point) => point.actualKwh != null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#26364b" /><XAxis dataKey="forecastTimestamp" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} stroke="#718096" tick={{ fontSize: 10 }} />
            <YAxis stroke="#718096" tick={{ fontSize: 10 }} tickFormatter={(value) => Number(value).toLocaleString()} /><Tooltip contentStyle={{ backgroundColor: '#111b2b', border: '1px solid #334155', borderRadius: '10px', fontSize: '12px' }} labelFormatter={(v) => new Date(v).toLocaleString()} formatter={(value: any, name: string) => [`${Number(value).toLocaleString()} kWh`, name]} />
            <Legend /><Line dataKey="predictedKwh" name="Predicted kWh" stroke="#10b981" dot={false} /><Line dataKey="actualKwh" name="Actual kWh" stroke="#38bdf8" dot={false} />
          </LineChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-xs text-slate-500">Forecasts will appear here once matching actual readings arrive.</div>}
        </div>
        <p className="text-[10px] text-slate-500">Stored forecasts: {forecastHistory.length}. Error metrics exclude forecasts without a compatible observed interval.</p>
      </section>

      {/* Model Performance & Evaluation Metrics (Module 5.4) */}
      <p className="text-[11px] text-slate-500">Metrics use a chronological holdout from this selected source. They are not a claim of commercial accuracy or energy savings.</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">Active Model</div>
          <div className="text-sm font-bold text-emerald-400 truncate">
            {forecastData?.model_name || '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            {forecastData?.model?.modelVersion || (models.find((item) => item.id === selectedModelId)?.isActive ? 'Active registry version' : 'Train and activate a model')}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">Mean Absolute Error</div>
          <div className="text-xl font-bold text-white">
            {forecastData?.metrics?.mae ?? '—'} <span className="text-xs font-normal text-slate-400">kWh</span>
          </div>
            <div className="text-[10px] text-emerald-400 mt-1">Chronological held-out test</div>
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
              Historical readings and registered model forecast
            </h3>
            <p className="text-[11px] text-slate-400">
              Forecast for the selected meter from {dataSource}; no occupancy or weather values are inferred.
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
              data={chartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#26364b" />
              <XAxis
                dataKey="timestamp"
                stroke="#64748b"
                tickFormatter={(t) => { const date = new Date(t); return Number.isNaN(date.getTime()) ? t : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }); }}
                tick={{ fontSize: 10 }}
              />
              <YAxis stroke="#718096" tick={{ fontSize: 10 }} tickFormatter={(value) => Number(value).toLocaleString()} />
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
                name="Forecast Demand (kW)"
              />
              <Line type="monotone" dataKey="observed_demand_kw" stroke="#38bdf8" strokeWidth={1.8} dot={false} name="Observed Demand (kW)" />
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
                <th className="px-4 py-2.5">Empirical P90 Error Range</th>
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
