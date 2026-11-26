import React, { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarClock, CalendarDays, Download, FileUp, RefreshCw, ShieldAlert, UploadCloud } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../../services/api';

type Building = { id: string; name: string };
type Room = { id: string; roomNumber: string; buildingId: string };
type Batch = { id: string; dataSource: string; originalFilename: string; status: string; totalRowsProcessed: number; validRecordsCount: number; rejectedCount: number; importedAt: string; files?: { sha256: string }[] };

export const OperationalIntelligence: React.FC = () => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [history, setHistory] = useState<Batch[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [buildingId, setBuildingId] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [tab, setTab] = useState<'insights' | 'timetable' | 'calendar'>('insights');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [scheduleForm, setScheduleForm] = useState({ buildingId: '', roomId: '', activityName: '', dayOfWeek: '0', startTime: '09:00', endTime: '10:00', timezone: 'UTC' });
  const [eventForm, setEventForm] = useState({ title: '', eventType: 'HOLIDAY', startDatetime: '', endDatetime: '', timezone: 'UTC', buildingId: '' });

  const refresh = useCallback(async () => {
    const [b, s, c, h, src, a] = await Promise.all([
      api.get('/buildings'), api.get('/schedules'), api.get('/schedules/calendar'), api.get('/schedules/history'), api.get('/schedules/sources'),
      api.get('/schedules/analysis', { params: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z`, ...(buildingId ? { buildingId } : {}), ...(dataSource ? { dataSource } : {}) } }),
    ]);
    setBuildings(b.data.buildings || []); setSchedules(s.data.schedules || []); setEvents(c.data.events || []); setHistory(h.data.batches || []); setAnalysis(a.data);
    setSources(src.data.sources || []);
    if (!scheduleForm.buildingId && b.data.buildings?.[0]) setScheduleForm(value => ({ ...value, buildingId: b.data.buildings[0].id }));
  }, [from, to, buildingId, dataSource, scheduleForm.buildingId]);

  useEffect(() => { refresh().catch(() => setMessage('Could not load operational data. Check the API connection and try again.')); }, [refresh]);
  useEffect(() => { if (scheduleForm.buildingId) api.get('/rooms', { params: { buildingId: scheduleForm.buildingId } }).then(r => setRooms(r.data.rooms || [])).catch(() => setRooms([])); }, [scheduleForm.buildingId]);

  const upload = async (kind: 'timetable' | 'calendar', file?: File) => {
    if (!file) return;
    setBusy(true); setMessage('Validating and importing CSV…');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await api.post(`/schedules/${kind}/import`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const batch = response.data.batch;
      setMessage(`${response.data.importedCount ?? batch?.validRecordsCount ?? 0} rows imported; ${response.data.rejectedCount ?? batch?.rejectedCount ?? 0} rejected. ${response.data.duplicate ? 'This file was already imported.' : ''}`);
      await refresh();
    } catch (e: any) { setMessage(e.response?.data?.error || 'Import failed. No partial records were applied.'); }
    finally { setBusy(false); }
  };

  const downloadTemplate = async (kind: 'timetable' | 'calendar') => {
    const response = await api.get(`/schedules/${kind}/template`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ecogrid-${kind}-template.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const downloadRejected = async (id: string) => {
    const response = await api.get(`/schedules/imports/${id}/rejected.csv`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `rejected-${id}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const cancelSchedule = async (id: string) => { await api.put(`/schedules/${id}`, { status: 'CANCELLED' }); await refresh(); };
  const editSchedule = async (schedule: any) => {
    const activityName = window.prompt('Activity name', schedule.activityName);
    if (activityName === null) return;
    const startTime = window.prompt('Start time (HH:mm)', schedule.startTime);
    if (startTime === null) return;
    const endTime = window.prompt('End time (HH:mm)', schedule.endTime);
    if (endTime === null) return;
    try { await api.put(`/schedules/${schedule.id}`, { activityName, startTime, endTime }); setMessage('Timetable entry updated.'); await refresh(); }
    catch (e: any) { setMessage(e.response?.data?.error || 'Could not update schedule.'); }
  };
  const cancelEvent = async (id: string) => { await api.patch(`/schedules/calendar/${id}`, { status: 'CANCELLED' }); await refresh(); };
  const saveSchedule = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await api.post('/schedules', { ...scheduleForm, dayOfWeek: Number(scheduleForm.dayOfWeek), recurrenceRule: 'WEEKLY' }); setMessage('Weekly timetable entry saved. Scheduled activity is not an occupancy observation.'); await refresh(); } catch (e: any) { setMessage(e.response?.data?.error || 'Could not save timetable entry.'); } finally { setBusy(false); } };
  const saveEvent = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await api.post('/schedules/calendar', eventForm); setMessage('Calendar event saved.'); await refresh(); } catch (e: any) { setMessage(e.response?.data?.error || 'Could not save calendar event.'); } finally { setBusy(false); } };

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-emerald-400"/><h1 className="text-xl font-bold text-white">Operational Intelligence</h1></div>
        <p className="mt-1 text-sm text-slate-400">Measured energy with timetable, calendar, meter-scope and occupancy evidence.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-400">From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ml-1 rounded border border-slate-700 bg-slate-900 p-2 text-white"/></label>
        <label className="text-xs text-slate-400">To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ml-1 rounded border border-slate-700 bg-slate-900 p-2 text-white"/></label>
        <select aria-label="Building filter" value={buildingId} onChange={e => setBuildingId(e.target.value)} className="rounded border border-slate-700 bg-slate-900 p-2 text-sm text-white"><option value="">All buildings</option>{buildings.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select>
        <select aria-label="Data source filter" value={dataSource} onChange={e => setDataSource(e.target.value)} className="rounded border border-slate-700 bg-slate-900 p-2 text-sm text-white"><option value="">All data sources</option>{sources.map(s => <option value={s} key={s}>{s}</option>)}</select>
        <button onClick={() => refresh()} className="rounded border border-slate-700 p-2 text-slate-300" title="Refresh"><RefreshCw size={16}/></button>
      </div>
    </header>
    {message && <div role="status" className="rounded border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</div>}
    <nav className="flex gap-2 border-b border-slate-800">{([['insights','Insights'],['timetable','Timetable'],['calendar','Academic calendar']] as const).map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-sm ${tab===key?'border-b-2 border-emerald-400 text-emerald-300':'text-slate-400'}`}>{label}</button>)}</nav>

    {tab === 'insights' && <section className="space-y-5">
      {!analysis?.summary?.readingsAnalyzed ? <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center"><ShieldAlert className="mx-auto mb-3 text-amber-300"/><h2 className="font-semibold text-white">No measured energy in this range</h2><p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">Select a different period or import validated meter readings. Timetables alone do not create energy or occupancy estimates.</p></div> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          ['Validated readings',analysis.summary.readingsAnalyzed],['Energy during timetable windows',`${analysis.summary.scheduledEnergyKwh} kWh`],['Energy outside timetable windows',`${analysis.summary.outsideScheduledEnergyKwh} kWh`],['Energy on holidays / vacations',`${analysis.summary.holidayEnergyKwh} kWh`],
        ].map(([label,value])=><div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="text-xs uppercase text-slate-400">{label}</div><div className="mt-2 text-xl font-semibold text-white">{value}</div></div>)}</div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h2 className="mb-3 text-sm font-semibold text-white">Measured energy by meter scope (kWh)</h2><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={analysis.groups.map((g:any)=>({ scope: g.room ? `${g.building} · ${g.room}` : `${g.building} · building`, measured: g.observedEnergyKwh, scheduled: g.scheduledKwh, outsideSchedule: g.outsideScheduledKwh, holiday: g.holidayKwh, afterHours: g.afterHoursKwh }))} margin={{ top: 8, right: 12, left: 0, bottom: 32 }}><CartesianGrid strokeDasharray="3 3" stroke="#263244"/><XAxis dataKey="scope" interval={0} angle={-18} textAnchor="end" height={58} tick={{ fill: '#94a3b8', fontSize: 10 }}/><YAxis tick={{ fill: '#94a3b8', fontSize: 10 }}/><Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} formatter={(value:any)=>[`${Number(value).toFixed(2)} kWh`]}/><Legend/><Bar dataKey="measured" name="Measured total" fill="#34d399"/><Bar dataKey="scheduled" name="During scheduled windows" fill="#60a5fa"/><Bar dataKey="outsideSchedule" name="Outside schedule" fill="#fbbf24"/><Bar dataKey="holiday" name="Holiday / vacation" fill="#c084fc"/><Bar dataKey="afterHours" name="Outside stored room hours" fill="#fb7185"/></BarChart></ResponsiveContainer></div><p className="mt-2 text-xs text-slate-500">Holiday and schedule categories are contextual subsets and can overlap; they are not stacked or additive.</p></div>
        <div className="space-y-3">{analysis.groups.map((g:any)=><article key={`${g.buildingId}-${g.roomId||'building'}`} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold text-white">{g.room ? `${g.building} · ${g.room}` : `${g.building} · building meter`}</h2><p className="mt-1 text-xs text-slate-400">{g.granularity} · {g.readingCount} readings · {g.sources.join(', ')}</p></div><div className="flex gap-2"><span className="rounded bg-indigo-950 px-2 py-1 text-xs text-indigo-200">{String(g.dataClassification).replace(/_/g,' ')}</span><span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{g.confidence.replace(/_/g,' ')}</span></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="text-sm text-slate-300">Measured energy<strong className="ml-2 text-white">{g.observedEnergyKwh} kWh</strong></div><div className="text-sm text-slate-300">Scheduled window<strong className="ml-2 text-white">{g.scheduledKwh} kWh</strong></div><div className="text-sm text-slate-300">Outside schedule<strong className="ml-2 text-white">{g.outsideScheduledKwh} kWh</strong></div><div className="text-sm text-slate-300">Outside stored room hours<strong className="ml-2 text-white">{g.afterHoursKwh} kWh{g.operatingHours ? ` (${g.operatingHours})` : ' — no room hours available'}</strong></div></div>
          <div className="mt-3 border-t border-slate-800 pt-3 text-sm text-slate-300"><span className="text-slate-400">Occupancy evidence:</span> {g.occupancy.classification}{g.occupancy.count ? ` (${g.occupancy.count} records; ${g.occupancy.sourceTypes.join(', ')})` : ` — ${g.occupancy.note}`}<p className="mt-1 text-xs text-slate-500">Scheduled activity is contextual evidence, not proof that people were present. Meter resolution: {g.granularity.toLowerCase()}.</p></div>
          {g.expectedVsObservedOccupancy && <p className="mt-2 text-sm text-slate-300">Paired expected/observed occupancy: {g.expectedVsObservedOccupancy.expectedAverage} expected vs {g.expectedVsObservedOccupancy.observedAverage} observed average ({g.expectedVsObservedOccupancy.pairedObservations} paired records; {g.expectedVsObservedOccupancy.observedSources.join(', ')}). <span className="text-xs text-slate-500">{g.expectedVsObservedOccupancy.note}</span></p>}
          {(g.insight || g.afterHoursInsight) && <p className="mt-3 rounded-lg bg-amber-950/30 p-3 text-sm text-amber-100">{g.insight && <><strong>{g.insight.title}.</strong> {g.insight.reason} {g.insight.recommendation}</>}{g.afterHoursInsight && <><strong>{g.insight ? ' ' : ''}{g.afterHoursInsight.title}.</strong> {g.afterHoursInsight.reason} {g.afterHoursInsight.recommendation}</>}</p>}
          {g.limitations?.map((l:string)=><p key={l} className="mt-1 text-xs text-slate-500">Limitation: {l}</p>)}
        </article>)}</div>
      </>}
      <div className="rounded-lg border border-slate-800 p-3 text-xs text-slate-400">Potential investigation signals only: measured energy outside a timetable is not proof of waste. Savings and financial impacts are not estimated without a validated baseline.</div>
    </section>}

    {tab === 'timetable' && <section className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Import academic timetable</h2><p className="mt-1 text-sm text-slate-400">Weekly recurrence or dated one-off sessions. Uploads are tenant scoped and retained with SHA-256 provenance.</p></div><button onClick={() => downloadTemplate('timetable')} className="inline-flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-sm text-slate-200"><Download size={15}/>Template</button></div>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded bg-emerald-700 px-4 py-2 text-sm text-white"><UploadCloud size={16}/>Choose timetable CSV<input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={e=>upload('timetable',e.target.files?.[0])}/></label>
        <p className="mt-3 text-xs text-slate-500">Required: building_id or exact building name, room_id or room number, activity_name, day_of_week (Monday=0 to Sunday=6), start_time/end_time (HH:mm), timezone (IANA). recurrence is WEEKLY or NONE; NONE also requires date. Blank expected_occupancy means unknown; it is never treated as observed occupancy.</p>
        <form onSubmit={saveSchedule} className="mt-5 grid gap-2 border-t border-slate-800 pt-4 md:grid-cols-4"><strong className="md:col-span-4 text-sm text-white">Add a weekly session</strong><select required value={scheduleForm.buildingId} onChange={e=>setScheduleForm({...scheduleForm,buildingId:e.target.value,roomId:''})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"><option value="">Building</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select required value={scheduleForm.roomId} onChange={e=>setScheduleForm({...scheduleForm,roomId:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"><option value="">Room</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.roomNumber}</option>)}</select><input required placeholder="Activity name" value={scheduleForm.activityName} onChange={e=>setScheduleForm({...scheduleForm,activityName:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><select value={scheduleForm.dayOfWeek} onChange={e=>setScheduleForm({...scheduleForm,dayOfWeek:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white">{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i)=><option value={i} key={d}>{d}</option>)}</select><input type="time" value={scheduleForm.startTime} onChange={e=>setScheduleForm({...scheduleForm,startTime:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><input type="time" value={scheduleForm.endTime} onChange={e=>setScheduleForm({...scheduleForm,endTime:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><input required placeholder="IANA timezone" value={scheduleForm.timezone} onChange={e=>setScheduleForm({...scheduleForm,timezone:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><button disabled={busy} className="rounded bg-emerald-700 p-2 text-sm text-white">Save schedule</button></form></div>
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="p-3">Day</th><th className="p-3">Time</th><th className="p-3">Building / Room</th><th className="p-3">Activity</th><th className="p-3">Recurrence</th><th className="p-3">Action</th></tr></thead><tbody>{schedules.map(s=><tr key={s.id} className="border-t border-slate-800 text-slate-200"><td className="p-3">{s.dayOfWeek===null?'Dated': ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][s.dayOfWeek]}</td><td className="p-3">{s.startTime}–{s.endTime}</td><td className="p-3">{s.building?.name} / {s.room?.roomNumber}</td><td className="p-3">{s.activityName}<div className="text-xs text-slate-500">Expected {s.expectedOccupancy || 'unknown'}; not observed</div></td><td className="p-3">{s.recurrenceRule} · {s.timezone}</td><td className="space-x-3 p-3"><button onClick={()=>editSchedule(s)} className="text-xs text-emerald-300">Edit</button><button onClick={()=>cancelSchedule(s.id)} className="text-xs text-rose-300">Cancel</button></td></tr>)}{!schedules.length&&<tr><td colSpan={6} className="p-6 text-center text-slate-400">No active timetable records.</td></tr>}</tbody></table></div>
    </section>}

    {tab === 'calendar' && <section className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Academic calendar</h2><p className="mt-1 text-sm text-slate-400">Holidays, vacations, examinations and special events with optional building/department/room scope.</p></div><button onClick={() => downloadTemplate('calendar')} className="inline-flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-sm text-slate-200"><Download size={15}/>Template</button></div>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded bg-emerald-700 px-4 py-2 text-sm text-white"><FileUp size={16}/>Choose calendar CSV<input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={e=>upload('calendar',e.target.files?.[0])}/></label>
        <p className="mt-3 text-xs text-slate-500">Required: title, event_type (HOLIDAY, EXAMINATION, VACATION, SPECIAL_EVENT), start_datetime, end_datetime and timezone. Dates may include an explicit UTC offset; local timestamps reject daylight-saving gaps and folds unless an offset is provided.</p>
        <form onSubmit={saveEvent} className="mt-5 grid gap-2 border-t border-slate-800 pt-4 md:grid-cols-3"><strong className="md:col-span-3 text-sm text-white">Add calendar event</strong><input required placeholder="Title" value={eventForm.title} onChange={e=>setEventForm({...eventForm,title:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><select value={eventForm.eventType} onChange={e=>setEventForm({...eventForm,eventType:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"><option>HOLIDAY</option><option>VACATION</option><option>EXAMINATION</option><option>SPECIAL_EVENT</option></select><select value={eventForm.buildingId} onChange={e=>setEventForm({...eventForm,buildingId:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"><option value="">Organization-wide</option>{buildings.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select><input required placeholder="IANA timezone" value={eventForm.timezone} onChange={e=>setEventForm({...eventForm,timezone:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><input required type="datetime-local" value={eventForm.startDatetime} onChange={e=>setEventForm({...eventForm,startDatetime:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><input required type="datetime-local" value={eventForm.endDatetime} onChange={e=>setEventForm({...eventForm,endDatetime:e.target.value})} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"/><button disabled={busy} className="rounded bg-emerald-700 p-2 text-sm text-white">Save event</button></form></div>
      <div className="grid gap-3">{events.map(e=><article key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"><div><div className="flex items-center gap-2 text-white"><CalendarDays size={16} className="text-emerald-400"/><strong>{e.title}</strong><span className="rounded bg-slate-800 px-2 py-1 text-xs">{e.eventType}</span></div><p className="mt-1 text-xs text-slate-400">{e.building?.name || 'Organization-wide'}{e.room ? ` · ${e.room.roomNumber}` : ''} · {new Date(e.startDatetime).toLocaleString()} – {new Date(e.endDatetime).toLocaleString()} · {e.timezone}</p></div><button onClick={()=>cancelEvent(e.id)} className="text-xs text-rose-300">Cancel</button></article>)}{!events.length&&<div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">No calendar events. Upload a calendar template to add holiday and event context.</div>}</div>
    </section>}

    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h2 className="mb-3 font-semibold text-white">Operational import history</h2>{history.length===0?<p className="text-sm text-slate-400">No timetable or calendar imports yet.</p>:<div className="space-y-2">{history.map(batch=><div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 p-3 text-sm"><div><strong className="text-slate-200">{batch.originalFilename}</strong><span className="ml-2 text-xs text-slate-400">{batch.dataSource} · {batch.status} · {batch.validRecordsCount}/{batch.totalRowsProcessed} accepted · {new Date(batch.importedAt).toLocaleString()}</span><p className="mt-1 break-all text-[10px] text-slate-500">SHA-256 {batch.files?.[0]?.sha256 || 'recorded'}</p></div>{batch.rejectedCount>0&&<button onClick={()=>downloadRejected(batch.id)} className="inline-flex items-center gap-1 text-xs text-amber-300"><Download size={14}/>Rejected rows ({batch.rejectedCount})</button>}</div>)}</div>}</section>
  </div>;
};
