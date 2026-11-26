import React, { useEffect, useState } from 'react';
import { BatteryCharging, AlertCircle } from 'lucide-react';
import api from '../../services/api';

export const BatteryManagement: React.FC = () => {
  const [batteries, setBatteries] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ buildingId: '', name: '', capacityKwh: '', maxChargeKw: '', maxDischargeKw: '', minSoc: '', maxSoc: '', initialSoc: '', chargingEfficiency: '', dischargingEfficiency: '', degradationCost: '', reserveSocKwh: '', finalSocKwh: '', allowGridCharging: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { const [b, f] = await Promise.all([api.get('/batteries'), api.get('/buildings')]); setBatteries(b.data.batteries || []); setBuildings(f.data.buildings || []); if (!form.buildingId && f.data.buildings?.length) setForm((old: any) => ({ ...old, buildingId: f.data.buildings[0].id })); }
    catch { setError('Could not load battery configuration.'); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const saveBattery = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try { const body = { ...form, capacityKwh: Number(form.capacityKwh), maxChargeKw: Number(form.maxChargeKw), maxDischargeKw: Number(form.maxDischargeKw), minSoc: Number(form.minSoc), maxSoc: Number(form.maxSoc), initialSoc: Number(form.initialSoc), chargingEfficiency: Number(form.chargingEfficiency), dischargingEfficiency: Number(form.dischargingEfficiency), degradationCost: Number(form.degradationCost), reserveSocKwh: form.reserveSocKwh === '' ? null : Number(form.reserveSocKwh), finalSocKwh: form.finalSocKwh === '' ? null : Number(form.finalSocKwh) };
      await api.post('/batteries', body); setForm((old: any) => ({ ...old, name: '', capacityKwh: '', maxChargeKw: '', maxDischargeKw: '', minSoc: '', maxSoc: '', initialSoc: '', chargingEfficiency: '', dischargingEfficiency: '', degradationCost: '', reserveSocKwh: '', finalSocKwh: '' })); await load();
    } catch (e: any) { setError(e.response?.data?.error || 'Battery configuration could not be saved.'); }
  };

  return <div className="space-y-6">
    <header><h1 className="text-xl font-bold text-white">Battery Management</h1><p className="mt-1 text-xs text-slate-400">Configured equipment limits and reported state of charge.</p></header>
    {error && <div className="flex gap-2 rounded-lg border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200"><AlertCircle className="h-4 w-4" />{error}</div>}
    <form onSubmit={saveBattery} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold text-white">Configure battery equipment</h2><p className="mt-1 text-xs text-slate-400">Enter equipment nameplate values and operating limits. No ratings are prefilled.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select required value={form.buildingId} onChange={e => setForm({ ...form, buildingId: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white">{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <input required placeholder="Equipment name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
        {([['capacityKwh','Capacity kWh',true],['maxChargeKw','Max charge kW',true],['maxDischargeKw','Max discharge kW',true],['minSoc','Minimum SOC kWh',true],['initialSoc','Initial SOC kWh',true],['maxSoc','Maximum SOC kWh',true],['chargingEfficiency','Charge efficiency 0–1',true],['dischargingEfficiency','Discharge efficiency 0–1',true],['degradationCost','Cycle penalty / kWh',true],['reserveSocKwh','Optional reserve SOC kWh',false],['finalSocKwh','Optional final SOC kWh',false]] as const).map(([key,label,required]) => <input key={key} required={required} type="number" step="any" min="0" placeholder={label} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />)}
      </div><label className="mt-3 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={form.allowGridCharging} onChange={e => setForm({ ...form, allowGridCharging: e.target.checked })} />Allow grid charging</label>
      <button type="submit" className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Save battery configuration</button>
    </form>
    {loading && <p className="text-sm text-slate-400">Loading battery equipment…</p>}
    {!loading && !error && batteries.length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">No battery equipment is configured. Optimization will not assume storage capacity or efficiency.</div>}
    <div className="grid gap-4 xl:grid-cols-2">{batteries.map(b => {
      const latest = b.readings?.[0];
      const soc = typeof latest?.stateOfChargeKwh === 'number' ? latest.stateOfChargeKwh : null;
      const percent = soc !== null && b.capacityKwh > 0 ? Math.min(100, Math.max(0, soc / b.capacityKwh * 100)) : null;
      return <article key={b.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-start gap-3"><BatteryCharging className="h-6 w-6 text-purple-400" /><div><h2 className="font-semibold text-white">{b.name}</h2><p className="text-xs text-slate-400">{b.building?.name} · {b.status}</p></div></div>
        <div className="mt-5"><div className="flex justify-between text-xs text-slate-300"><span>Latest reported state of charge</span><strong>{soc === null ? 'Unavailable' : `${soc.toFixed(2)} kWh (${percent?.toFixed(1)}%)`}</strong></div>
          {percent !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-purple-500" style={{ width: `${percent}%` }} /></div>}
          <p className="mt-1 text-[10px] text-slate-500">{latest ? new Date(latest.timestamp).toLocaleString() : 'No battery state readings recorded.'}</p></div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Capacity</dt><dd className="mt-1 text-white">{b.capacityKwh} kWh</dd></div><div><dt className="text-slate-500">SOC range</dt><dd className="mt-1 text-white">{b.minSoc}–{b.maxSoc} kWh</dd></div><div><dt className="text-slate-500">Max charge</dt><dd className="mt-1 text-white">{b.maxChargeKw} kW</dd></div><div><dt className="text-slate-500">Max discharge</dt><dd className="mt-1 text-white">{b.maxDischargeKw} kW</dd></div><div><dt className="text-slate-500">Charge efficiency</dt><dd className="mt-1 text-white">{(b.chargingEfficiency * 100).toFixed(1)}%</dd></div><div><dt className="text-slate-500">Discharge efficiency</dt><dd className="mt-1 text-white">{(b.dischargingEfficiency * 100).toFixed(1)}%</dd></div><div><dt className="text-slate-500">Grid charging</dt><dd className="mt-1 text-white">{b.allowGridCharging ? 'Enabled' : 'Disabled'}</dd></div><div><dt className="text-slate-500">Cycle penalty</dt><dd className="mt-1 text-white">{b.degradationCost} / kWh</dd></div></dl>
      </article>;
    })}</div>
  </div>;
};
