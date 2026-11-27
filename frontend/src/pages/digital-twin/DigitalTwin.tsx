import React, { useEffect, useMemo, useState } from 'react';
import { Copy, GitCompareArrows, Play, Save, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const DigitalTwin: React.FC = () => {
  const { user } = useAuth();
  const [buildings, setBuildings] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [forecastModelId, setForecastModelId] = useState('');
  const [tariffId, setTariffId] = useState('');
  const [horizonHours, setHorizonHours] = useState(24);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [demandMultiplier, setDemandMultiplier] = useState(1);
  const [solarMultiplier, setSolarMultiplier] = useState(1);
  const [solarProfile, setSolarProfile] = useState('');
  const [useBattery, setUseBattery] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<any>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [b, s, f, org] = await Promise.all([api.get('/buildings'), api.get('/scenarios'), api.get('/forecast/models'), user?.organization?.id ? api.get(`/organizations/${user.organization.id}`) : Promise.resolve({ data: { organization: { tariffs: [] } } })]);
      const buildingsResult = b.data.buildings || [];
      setBuildings(buildingsResult); setScenarios(s.data.scenarios || []);
      setModels((f.data.models || []).filter((m: any) => m.status === 'READY' && m.isActive));
      setTariffs((org.data.organization?.tariffs || []).filter((t: any) => !t.effectiveTo || new Date(t.effectiveTo) > new Date()));
      if (!buildingId && buildingsResult.length) setBuildingId(buildingsResult[0].id);
      if (!tariffId && org.data.organization?.tariffs?.length) setTariffId(org.data.organization.tariffs[0].id);
    } catch { setError('Could not load building, tariff, forecast or scenario data.'); }
  };
  useEffect(() => { void load(); }, [user?.organization?.id]);

  const building = buildings.find(b => b.id === buildingId);
  const modelOptions = useMemo(() => models.filter(m => m.buildingId === buildingId), [models, buildingId]);
  useEffect(() => { if (forecastModelId && !modelOptions.some(m => m.id === forecastModelId)) setForecastModelId(''); }, [buildingId, modelOptions]);

  const configuration = () => {
    const solarGenerationKw = solarProfile.trim() ? solarProfile.split(',').map(v => Number(v.trim())) : undefined;
    if (solarGenerationKw?.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Solar profile must be non-negative numeric kW values separated by commas.');
    if (building?.solar?.length && (!solarGenerationKw || solarGenerationKw.length !== horizonHours)) throw new Error(`Enter exactly ${horizonHours} solar forecast values for this building.`);
    return { horizonHours, forecastModelId, tariffId, demandMultiplier, solarMultiplier,
      ...(solarGenerationKw ? { solarGenerationKw } : {}), useConfiguredBattery: useBattery };
  };

  const save = async (run: boolean) => {
    setError(''); setBusy(true);
    try {
      const config = configuration();
      if (!name.trim() || !buildingId || !tariffId) throw new Error('Name, building and tariff are required.');
      if (!forecastModelId) throw new Error('Select an active forecast model. Run demand forecasting first if none is available.');
      const payload = { name, description, buildingId, configuration: config };
      const response = selectedScenario && ['DRAFT', 'FAILED'].includes(selectedScenario.status)
        ? await api.put(`/scenarios/${selectedScenario.id}`, payload)
        : await api.post('/scenarios', payload);
      let scenario = response.data.scenario;
      if (run) scenario = (await api.post(`/scenarios/${scenario.id}/run`)).data.scenario;
      setSelectedScenario(scenario); await load();
    } catch (e: any) { setError(e.response?.data?.error || e.message || 'Scenario could not be saved.'); }
    finally { setBusy(false); }
  };

  const duplicate = async (id: string) => { setError(''); try { const r = await api.post(`/scenarios/${id}/duplicate`); setSelectedScenario(r.data.scenario); setName(r.data.scenario.name); await load(); } catch (e: any) { setError(e.response?.data?.error || 'Could not duplicate scenario.'); } };
  const runSaved = async (id: string) => { setBusy(true); setError(''); try { const r = await api.post(`/scenarios/${id}/run`); setSelectedScenario(r.data.scenario); await load(); } catch (e: any) { setError(e.response?.data?.error || 'Scenario could not run.'); } finally { setBusy(false); } };
  const compare = async () => { setError(''); try { const r = await api.post('/scenarios/compare', { scenarioIds: compareIds }); setComparison(r.data.comparison); } catch (e: any) { setError(e.response?.data?.error || 'Scenarios could not be compared.'); } };
  const selectScenario = (s: any) => {
    setSelectedScenario(s); setName(s.name); setDescription(s.description || ''); setBuildingId(s.buildingId || '');
    const c = s.configuration || {}; setForecastModelId(c.forecastModelId || ''); setTariffId(c.tariffId || '');
    setHorizonHours(Number(c.horizonHours || 24)); setDemandMultiplier(Number(c.demandMultiplier || 1));
    setSolarMultiplier(Number(c.solarMultiplier || 1)); setSolarProfile((c.solarGenerationKw || []).join(', '));
    setUseBattery(c.useConfiguredBattery !== false);
  };

  return <div className="space-y-6">
    <header><h1 className="text-xl font-bold text-white">Energy Digital Twin</h1><p className="mt-1 text-xs text-slate-400">Compare explicitly configured scenarios using active forecasts, organization tariffs and equipment settings.</p></header>
    {error && <div className="flex gap-2 rounded-lg border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <h2 className="font-semibold text-white">Scenario assumptions</h2>
        <label className="block text-xs text-slate-300">Name<input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /></label>
        <label className="block text-xs text-slate-300">Description<input value={description} onChange={e => setDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /></label>
        <label className="block text-xs text-slate-300">Building<select value={buildingId} onChange={e => setBuildingId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="block text-xs text-slate-300">Active demand forecast<select value={forecastModelId} onChange={e => setForecastModelId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"><option value="">Choose model</option>{modelOptions.map(m => <option key={m.id} value={m.id}>{m.algorithm} v{m.version} · {m.dataSource}</option>)}</select></label>
        <label className="block text-xs text-slate-300">Configured tariff<select value={tariffId} onChange={e => setTariffId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">{tariffs.map(t => <option key={t.id} value={t.id}>{t.tariffName} · {t.tariffType}</option>)}</select></label>
        <label className="block text-xs text-slate-300">Horizon<select value={horizonHours} onChange={e => setHorizonHours(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"><option value={24}>24 hours</option><option value={168}>7 days</option></select></label>
        <label className="block text-xs text-slate-300">Demand scenario multiplier<input type="number" min="0.1" max="3" step="0.05" value={demandMultiplier} onChange={e => setDemandMultiplier(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /><span className="text-[10px] text-slate-500">Applied to forecast demand as a simulated assumption.</span></label>
        <label className="block text-xs text-slate-300">Solar scenario multiplier<input type="number" min="0" max="3" step="0.05" value={solarMultiplier} onChange={e => setSolarMultiplier(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /><span className="text-[10px] text-slate-500">Applied to the supplied solar profile.</span></label>
        {building?.solar?.length > 0 && <label className="block text-xs text-slate-300">Hourly solar forecast (kW)<textarea value={solarProfile} onChange={e => setSolarProfile(e.target.value)} rows={3} placeholder={`Enter ${horizonHours} comma-separated forecast values`} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /><span className="text-[10px] text-amber-300">Explicit simulated input; no weather or generation is invented.</span></label>}
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={useBattery} onChange={e => setUseBattery(e.target.checked)} />Use configured active battery, if present</label>
        <div className="flex gap-2"><button disabled={busy} onClick={() => void save(false)} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-white disabled:opacity-50"><Save className="h-4 w-4" />Save draft</button><button disabled={busy} onClick={() => void save(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Play className="h-4 w-4" />{busy ? 'Running…' : 'Save and run'}</button></div>
      </section>
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold text-white">Saved scenarios</h2><div className="mt-3 space-y-2">{scenarios.map(s => <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 p-3 text-xs"><input type="checkbox" checked={compareIds.includes(s.id)} onChange={e => setCompareIds(old => e.target.checked ? [...old, s.id] : old.filter(x => x !== s.id))} /><button onClick={() => selectScenario(s)} className="min-w-0 flex-1 text-left text-white">{s.name}<span className="ml-2 text-slate-500">{s.status}</span></button><button onClick={() => void duplicate(s.id)} title="Duplicate" className="text-slate-400 hover:text-white"><Copy className="h-4 w-4" /></button>{['DRAFT', 'FAILED', 'INFEASIBLE'].includes(s.status) && <button onClick={() => void runSaved(s.id)} className="text-emerald-400">Run</button>}</div>)}</div><button onClick={() => void compare()} disabled={compareIds.length < 2} className="mt-3 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-40"><GitCompareArrows className="h-4 w-4" />Compare selected</button></div>
        {selectedScenario?.resultData && <div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="flex justify-between"><h2 className="font-semibold text-white">{selectedScenario.name}</h2><span className="text-xs text-amber-300">SIMULATED</span></div><p className="mt-1 text-xs text-slate-400">{selectedScenario.resultData.solver_status} · {selectedScenario.resultData.solver_message}</p><div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-300"><div>Total optimized cost<strong className="mt-1 block text-white">{selectedScenario.resultData.currency || ''} {selectedScenario.resultData.total_optimized_cost ?? 'Unavailable'}</strong></div><div>Estimated comparison<strong className="mt-1 block text-white">{selectedScenario.resultData.currency || ''} {selectedScenario.resultData.total_estimated_savings ?? 'Unavailable'}</strong><span className="mt-1 block text-[10px] text-amber-300">{selectedScenario.resultData.savingsStatus || 'ESTIMATED_UNVERIFIED'}</span></div><div>Grid import<strong className="mt-1 block text-white">{selectedScenario.resultData.total_grid_import_kwh} kWh</strong></div><div>Peak demand<strong className="mt-1 block text-white">{selectedScenario.resultData.peak_demand_optimized_kw} kW</strong></div></div><ul className="mt-3 space-y-1 text-xs text-amber-300">{(selectedScenario.resultData.limitations || []).map((x: string) => <li key={x}>• {x}</li>)}</ul></div>}
        {comparison.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold text-white">Scenario comparison · simulated</h2><table className="mt-3 w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="py-2">Scenario</th><th>Cost</th><th>Grid kWh</th><th>Solar self-use kWh</th><th>Peak kW</th><th>Grid emissions kg</th></tr></thead><tbody>{comparison.map(c => <tr key={c.id} className="border-t border-slate-800 text-slate-200"><td className="py-2">{c.name}</td><td>{c.currency} {c.totalCost}</td><td>{c.gridImportKwh}</td><td>{c.solarSelfConsumptionKwh}</td><td>{c.peakDemandKw}</td><td>{c.gridEmissionsKg ?? 'Unavailable'}</td></tr>)}</tbody></table></div>}
        <p className="text-[11px] text-slate-500">Scenario costs and savings are simulated estimates. They are not measured or verified savings.</p>
      </section>
    </div>
  </div>;
};
