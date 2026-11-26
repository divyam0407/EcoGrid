import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

type Building = { id: string; name: string; solar: { id: string }[]; batteries: { id: string }[] };
type Result = { feasible: boolean; solver_status: string; data_status: string; currency: string | null;
  total_baseline_cost: number | null; total_optimized_cost: number | null; total_estimated_savings: number | null;
  savings_percentage: number | null; peak_demand_baseline_kw: number; peak_demand_optimized_kw: number;
  solar_self_consumption_kwh: number; solar_export_kwh: number; solar_curtailed_kwh: number;
  total_grid_import_kwh: number; constraints_binding: string[]; explanations: string[]; limitations: string[];
  total_grid_emissions_kg: number | null;
  tariff_periods_used: string[];
  schedule: { timestamp: string; demand_kw: number; solar_to_load_kw: number; solar_to_battery_kw: number;
    solar_export_kw: number; solar_curtailed_kw: number; grid_import_kw: number; battery_charge_kw: number;
    battery_discharge_kw: number; battery_soc_kwh: number | null; tariff_per_kwh: number }[] };

const panel = 'bg-slate-900 border border-slate-800 rounded-xl';

export const EnergyOptimization: React.FC = () => {
  const { user } = useAuth();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [tariffId, setTariffId] = useState('');
  const [horizon, setHorizon] = useState(24);
  const [solarInput, setSolarInput] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { Promise.all([api.get('/buildings'), user?.organization?.id ? api.get(`/organizations/${user.organization.id}`) : Promise.resolve({ data: { organization: { tariffs: [] } } })]).then(([b, o]) => {
    const rows = b.data.buildings || []; setBuildings(rows); if (rows.length) setBuildingId(rows[0].id);
    const configured = o.data.organization?.tariffs || []; setTariffs(configured); if (configured.length) setTariffId(configured[0].id);
  }).catch(() => setError('Could not load organization buildings or tariffs.')); }, [user?.organization?.id]);

  const selected = buildings.find(b => b.id === buildingId);
  const run = async () => {
    setError(''); setResult(null); setLoading(true);
    try {
      const solarGenerationKw = solarInput.trim() ? solarInput.split(',').map(v => Number(v.trim())) : undefined;
      if (solarGenerationKw?.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Solar forecast values must be non-negative numbers separated by commas.');
      if (!tariffId) throw new Error('Select an applicable configured tariff.');
      const response = await api.post('/optimization/run', { buildingId, tariffId, horizonHours: horizon, solarGenerationKw });
      setResult(response.data);
    } catch (e: any) { setError(e.response?.data?.error || e.message || 'Optimization could not run.'); }
    finally { setLoading(false); }
  };

  const money = (value: number | null | undefined) => value == null ? 'Unavailable' : `${result?.currency || ''} ${value.toFixed(2)}`.trim();

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-xl font-bold text-white">Energy Optimization</h1>
        <p className="text-xs text-slate-400 mt-1">Tariff-aware dispatch using the selected building’s active forecast and configured equipment.</p></div>
      <button onClick={run} disabled={loading || !buildingId} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-lg">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Solving…' : 'Run optimization'}
      </button>
    </header>

    <section className={`${panel} p-5 grid gap-4 md:grid-cols-4`}>
      <label className="text-xs text-slate-300">Building<select value={buildingId} onChange={e => setBuildingId(e.target.value)} className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white">
        {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-xs text-slate-300">Forecast horizon<select value={horizon} onChange={e => setHorizon(Number(e.target.value))} className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"><option value={24}>24 hours</option><option value={168}>7 days</option></select></label>
      <label className="text-xs text-slate-300">Configured tariff<select value={tariffId} onChange={e => setTariffId(e.target.value)} className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white">{tariffs.map(t => <option key={t.id} value={t.id}>{t.tariffName}</option>)}</select></label>
      {selected?.solar?.length ? <label className="text-xs text-slate-300">Hourly solar forecast (kW)<input value={solarInput} onChange={e => setSolarInput(e.target.value)} placeholder={`Enter ${horizon} comma-separated forecast values`} className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white" />
        <span className="block mt-1 text-[10px] text-amber-300">Explicit scenario assumption; EcoGrid has no configured solar forecast source yet.</span></label> : <div className="text-xs text-slate-400 flex items-center">{selected ? 'No active solar installation. Solar input is zero.' : 'Select a building to view its equipment.'}</div>}
    </section>

    {error && <div className="bg-rose-950/50 border border-rose-800 rounded-lg p-4 text-sm text-rose-200 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
    {!result && !error && <div className={`${panel} p-8 text-center text-sm text-slate-400`}><Activity className="mx-auto mb-3 w-6 h-6" />Run an optimization after selecting a building with a ready forecast model and configured tariff.</div>}

    {result && <>
      <div className={`${panel} p-3 flex flex-wrap items-center gap-2 text-xs text-slate-300`}><ShieldCheck className="w-4 h-4 text-emerald-400" />Solver: <b>{result.solver_status}</b><span className="mx-2 text-slate-600">•</span>Result: <b>{result.data_status}</b><span className="ml-auto text-amber-300">Estimated only; not verified savings.</span></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[['Baseline cost', money(result.total_baseline_cost)], ['Optimized cost', money(result.total_optimized_cost)], ['Estimated change', money(result.total_estimated_savings)], ['Grid import', `${result.total_grid_import_kwh.toFixed(2)} kWh`]].map(([label, value]) => <div key={label} className={`${panel} p-4`}><div className="text-[11px] uppercase text-slate-400">{label}</div><div className="mt-2 text-lg font-semibold text-white">{value}</div></div>)}
      </div>
      {!result.feasible && <div className="text-rose-300 text-sm">No dispatch schedule was produced because the constraints are infeasible.</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${panel} p-5`}><h2 className="text-sm font-semibold text-white mb-3">Why this schedule</h2><p className="mb-2 text-xs text-slate-400">Tariff periods used: {result.tariff_periods_used.join(', ') || 'Unavailable'}</p><ul className="space-y-2 text-xs text-slate-300">{result.explanations.map(x => <li key={x}>• {x}</li>)}</ul><h3 className="mt-4 text-xs font-semibold text-white">Limitations</h3><ul className="mt-2 space-y-2 text-xs text-amber-300">{result.limitations.map(x => <li key={x}>• {x}</li>)}</ul></section>
        <section className={`${panel} p-5`}><h2 className="text-sm font-semibold text-white mb-3">Energy and peak summary</h2><div className="grid grid-cols-2 gap-3 text-xs text-slate-300"><div>Solar self-consumption <b className="block mt-1">{result.solar_self_consumption_kwh.toFixed(2)} kWh</b></div><div>Solar export <b className="block mt-1">{result.solar_export_kwh.toFixed(2)} kWh</b></div><div>Solar curtailed <b className="block mt-1">{result.solar_curtailed_kwh.toFixed(2)} kWh</b></div><div>Grid emissions <b className="block mt-1">{result.total_grid_emissions_kg == null ? 'Unavailable' : `${result.total_grid_emissions_kg.toFixed(2)} kg CO₂`}</b></div><div>Peak baseline → optimized <b className="block mt-1">{result.peak_demand_baseline_kw.toFixed(2)} → {result.peak_demand_optimized_kw.toFixed(2)} kW</b></div><div className="col-span-2">Binding constraints <b className="block mt-1">{result.constraints_binding.join(', ') || 'None reported'}</b></div></div></section>
      </div>
      <section className={`${panel} overflow-x-auto`}><h2 className="p-4 text-sm font-semibold text-white">Dispatch schedule · kW average power</h2><table className="w-full text-left text-xs"><thead className="bg-slate-950 text-slate-400"><tr>{['Interval','Demand','Solar → load','Solar → battery','Grid import','Charge','Discharge','SOC kWh','Tariff / kWh'].map(x => <th className="px-3 py-2" key={x}>{x}</th>)}</tr></thead><tbody>{result.schedule.map(row => <tr key={row.timestamp} className="border-t border-slate-800 text-slate-300"><td className="px-3 py-2 whitespace-nowrap">{new Date(row.timestamp).toLocaleString()}</td><td className="px-3 py-2">{row.demand_kw.toFixed(2)}</td><td className="px-3 py-2">{row.solar_to_load_kw.toFixed(2)}</td><td className="px-3 py-2">{row.solar_to_battery_kw.toFixed(2)}</td><td className="px-3 py-2">{row.grid_import_kw.toFixed(2)}</td><td className="px-3 py-2">{row.battery_charge_kw.toFixed(2)}</td><td className="px-3 py-2">{row.battery_discharge_kw.toFixed(2)}</td><td className="px-3 py-2">{row.battery_soc_kwh?.toFixed(2) ?? '—'}</td><td className="px-3 py-2">{row.tariff_per_kwh.toFixed(4)}</td></tr>)}</tbody></table></section>
    </>}
  </div>;
};
