import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowUpRight, BatteryCharging, CalendarClock, CheckCircle2, CirclePause, CirclePlay, CircleStop, Clock3, Loader2, Radio, RefreshCw, SunMedium, TrendingUp, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../../services/api';

type Meter = { id: string; meterName: string; buildingId: string; building: { name: string } };
type Reading = { timestamp: string; consumptionKwh: number; powerKw: number | null; meterId?: string; meterName?: string; buildingName?: string; source?: string };
type TelemetryStatus = { enabled: boolean; synthetic: boolean; timezone: string; intervalMinutes: number; meters: Meter[]; latestCampusTimestamp: string | null; lastIngestedAt: string | null; historicalReadings: Reading[]; recentReadings: Reading[] };

const tickIntervalMs = 15_000;
const median = (numbers: number[]) => {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const localParts = (timestamp: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp));
const localHour = (timestamp: string) => Number(localParts(timestamp).find((part) => part.type === 'hour')?.value || 0);
const localWeekday = (timestamp: string) => localParts(timestamp).find((part) => part.type === 'weekday')?.value || '';
const formatTimestamp = (timestamp?: string | null) => timestamp ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)) + ' IST' : 'Waiting for a reading';

function stableNoise(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967295;
}

function simulatedKwh(meter: Meter, timestamp: string, tick: number) {
  const localHourValue = localHour(timestamp);
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(localWeekday(timestamp));
  const name = `${meter.building.name} ${meter.meterName}`.toLowerCase();
  const profiles = name.includes('research') ? { base: 66, active: 150 } : name.includes('academic') ? { base: 92, active: 115 } : name.includes('library') ? { base: 48, active: 62 } : name.includes('residence') ? { base: 72, active: 35 } : { base: 20, active: 48 };
  const open = weekday && localHourValue >= 8 && localHourValue < 19;
  const residenceBusy = name.includes('residence') && ((localHourValue >= 6 && localHourValue < 10) || (localHourValue >= 17 && localHourValue < 23));
  const seed = 0.96 + stableNoise(`${meter.id}:${timestamp}`) * 0.08;
  let value = (profiles.base + (open || residenceBusy ? profiles.active : 0)) * seed;
  // One reproducible high-load interval every six simulated hours makes the
  // existing seasonal anomaly detector evaluate a real persisted observation.
  if (name.includes('research') && tick % 6 === 0) value *= 2.6;
  return Math.round(value * 1000) / 1000;
}

export const LiveMonitoring: React.FC = () => {
  const [status, setStatus] = useState<TelemetryStatus | null>(null);
  const [selectedMeterId, setSelectedMeterId] = useState('');
  const [simulatorState, setSimulatorState] = useState<'stopped' | 'running' | 'paused'>('stopped');
  const [successfulTicks, setSuccessfulTicks] = useState(0);
  const [lastTickMessage, setLastTickMessage] = useState('No simulated reading has been sent in this session.');
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [busyAction, setBusyAction] = useState('');
  const [insightMessage, setInsightMessage] = useState('');
  const timerRef = useRef<number | null>(null);
  const baseTimestampRef = useRef<number | null>(null);
  const tickRef = useRef(0);
  const sendingRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const params = selectedMeterId ? `?meterId=${encodeURIComponent(selectedMeterId)}` : '';
      const response = await api.get(`/energy/telemetry/status${params}`);
      const next = response.data as TelemetryStatus;
      setStatus(next);
      setConnection('available');
      setError('');
      if (!selectedMeterId && next.meters.length) {
        const academicMeter = next.meters.find((meter) => meter.building.name.toLowerCase().includes('academic'));
        setSelectedMeterId(academicMeter?.id || next.meters[0].id);
      }
    } catch (requestError: any) {
      setConnection('unavailable');
      setError(requestError?.response?.data?.error || 'The local ingestion API is unavailable.');
    }
  }, [selectedMeterId]);

  useEffect(() => {
    void refreshStatus();
    const poll = window.setInterval(() => void refreshStatus(), 5_000);
    return () => window.clearInterval(poll);
  }, [refreshStatus]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const sendSimulatedInterval = useCallback(async () => {
    if (!status?.meters.length || baseTimestampRef.current === null || sendingRef.current) return;
    sendingRef.current = true;
    const nextTick = tickRef.current + 1;
    const timestamp = new Date(baseTimestampRef.current + nextTick * 60 * 60 * 1000).toISOString();
    try {
      const readings = status.meters.map((meter) => ({ meterId: meter.id, timestamp, value: simulatedKwh(meter, timestamp, nextTick), unit: 'kWh', measurementType: 'INTERVAL_ENERGY' }));
      const result = await api.post('/energy/telemetry', { readings });
      tickRef.current = nextTick;
      setSuccessfulTicks((count) => count + 1);
      setLastTickMessage(`${result.data.insertedCount} new hourly intervals accepted; ${result.data.duplicateCount} safe retries ignored.`);
      await refreshStatus();
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error || 'The simulator could not submit its readings.';
      setLastTickMessage(message);
      setError(message);
    } finally {
      sendingRef.current = false;
    }
  }, [refreshStatus, status]);

  const start = () => {
    if (!status?.enabled || !status.latestCampusTimestamp || !status.meters.length) return;
    if (simulatorState === 'paused') {
      setSimulatorState('running');
      timerRef.current = window.setInterval(() => void sendSimulatedInterval(), tickIntervalMs);
      return;
    }
    const latestCampus = new Date(status.latestCampusTimestamp).getTime();
    const currentHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    baseTimestampRef.current = Math.max(latestCampus, currentHour);
    tickRef.current = 0;
    setSuccessfulTicks(0);
    setSimulatorState('running');
    void sendSimulatedInterval();
    timerRef.current = window.setInterval(() => void sendSimulatedInterval(), tickIntervalMs);
  };
  const pause = () => { stopTimer(); setSimulatorState('paused'); };
  const stop = () => { stopTimer(); baseTimestampRef.current = null; tickRef.current = 0; setSimulatorState('stopped'); };

  const selectedMeter = status?.meters.find((meter) => meter.id === selectedMeterId);
  const selectedLiveReadings = (status?.recentReadings || []).filter((reading) => reading.meterId === selectedMeterId);
  const latestSelectedReading = selectedLiveReadings[selectedLiveReadings.length - 1];
  const expectedKwh = latestSelectedReading ? median((status?.historicalReadings || []).filter((reading) => localHour(reading.timestamp) === localHour(latestSelectedReading.timestamp)).map((reading) => reading.consumptionKwh)) : null;
  const chartData = useMemo(() => {
    const historical = (status?.historicalReadings || []).map((reading) => ({ timestamp: reading.timestamp, historicalKwh: reading.consumptionKwh, simulatedKwh: undefined as number | undefined }));
    const current = selectedLiveReadings.map((reading) => ({ timestamp: reading.timestamp, historicalKwh: undefined as number | undefined, simulatedKwh: reading.consumptionKwh }));
    return [...historical, ...current].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-96).map((row) => ({ ...row, label: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', hourCycle: 'h23' }).format(new Date(row.timestamp)) }));
  }, [selectedLiveReadings, status?.historicalReadings]);

  const runAnomalyAnalysis = async () => {
    const labMeter = status?.meters.find((meter) => meter.building.name.toLowerCase().includes('research'));
    if (!labMeter) return setInsightMessage('The research-lab meter is unavailable.');
    setBusyAction('anomaly'); setInsightMessage('Running the existing seasonal anomaly analysis over stored lab readings…');
    try {
      const result = await api.post('/anomalies/detect', { method: 'combined', sensitivity: 2.2, buildingId: labMeter.buildingId, dataSource: 'SYNTHETIC_DEMO' });
      const latestSyntheticTime = status?.latestCampusTimestamp ? new Date(status.latestCampusTimestamp).getTime() : 0;
      const newEvents = (result.data.anomalies || []).filter((item: any) => new Date(item.timestamp).getTime() > latestSyntheticTime - 6 * 60 * 60 * 1000);
      setInsightMessage(`Analysis evaluated stored campus readings and returned ${result.data.anomalies?.length || 0} anomaly candidates; ${newEvents.length} are in the recent simulator window. See Anomaly Detection for persisted evidence.`);
    } catch (requestError: any) { setInsightMessage(requestError?.response?.data?.error || 'Anomaly analysis failed.'); }
    finally { setBusyAction(''); }
  };

  const runForecast = async () => {
    const academicMeter = status?.meters.find((meter) => meter.building.name.toLowerCase().includes('academic'));
    if (!academicMeter) return setInsightMessage('The Academic Block meter is unavailable.');
    setBusyAction('forecast'); setInsightMessage('Calling the active hourly forecast model…');
    try {
      const result = await api.post('/forecast/run', { meterId: academicMeter.id, horizonHours: 24 });
      setInsightMessage(`The existing ${result.data.model?.algorithm || 'active'} model returned ${result.data.forecasts?.length || 0} hourly forecast intervals. No retraining was started.`);
    } catch (requestError: any) { setInsightMessage(requestError?.response?.data?.error || 'Forecast inference failed.'); }
    finally { setBusyAction(''); }
  };

  const refreshRecommendations = async () => {
    setBusyAction('recommendations'); setInsightMessage('Refreshing evidence-based recommendations from the stored operating history…');
    try {
      const result = await api.post('/recommendations/refresh', { analysisDays: 30, baselineDays: 60, minimumBaselineSamples: 4, minimumOccurrenceDays: 2 });
      setInsightMessage(`${result.data.generated || 0} recommendations were generated or refreshed using measured history, configured tariff and available timetable evidence. Estimates remain unverified.`);
    } catch (requestError: any) { setInsightMessage(requestError?.response?.data?.error || 'Recommendation refresh failed.'); }
    finally { setBusyAction(''); }
  };

  return <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Live Campus Monitoring</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-amber-200"><Radio className="h-3 w-3" /> SIMULATED TELEMETRY</span>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Synthetic 60-minute meter intervals are generated locally and sent through the authenticated ingestion API. No physical smart meters are connected.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={start} disabled={!status?.enabled || simulatorState === 'running' || !status?.latestCampusTimestamp} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><CirclePlay className="h-4 w-4" />{simulatorState === 'paused' ? 'Resume' : 'Start'} simulator</button>
        <button onClick={pause} disabled={simulatorState !== 'running'} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"><CirclePause className="h-4 w-4" />Pause</button>
        <button onClick={stop} disabled={simulatorState === 'stopped'} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"><CircleStop className="h-4 w-4" />Stop</button>
      </div>
    </header>

    {error && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">{error}{connection === 'unavailable' && <span className="mt-1 block text-amber-100/70">For local F4 demos, set DEMO_TELEMETRY_ENABLED=true in backend/.env and restart the backend. The endpoint is disabled in production.</span>}</div>}
    {!error && <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between"><span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${connection === 'available' ? 'bg-emerald-400' : 'animate-pulse bg-slate-500'}`} />{connection === 'available' ? 'Ingestion API and demo database reachable' : 'Checking ingestion API…'}</span><span className="text-slate-500">Simulator: {simulatorState.toUpperCase()} · 15 sec wall interval · 1 simulated hour per tick</span></div>}

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">Selected meter <Zap className="h-4 w-4 text-emerald-400" /></div><select aria-label="Select a demo meter" value={selectedMeterId} onChange={(event) => setSelectedMeterId(event.target.value)} className="mt-3 w-full truncate rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" disabled={!status?.meters.length}>{status?.meters.map((meter) => <option key={meter.id} value={meter.id}>{meter.building.name} · {meter.meterName}</option>)}</select><div className="mt-2 text-[10px] text-slate-500">{selectedMeter?.building.name || 'Waiting for organization meter list'}</div></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">Latest interval <Activity className="h-4 w-4 text-cyan-400" /></div><div className="mt-3 text-2xl font-bold text-white">{latestSelectedReading?.consumptionKwh.toFixed(2) ?? '—'} <span className="text-xs font-medium text-slate-400">kWh</span></div><div className="mt-1 truncate text-[10px] text-slate-500">{formatTimestamp(latestSelectedReading?.timestamp || status?.latestCampusTimestamp)}</div></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">Same-hour history <TrendingUp className="h-4 w-4 text-indigo-400" /></div><div className="mt-3 text-2xl font-bold text-white">{expectedKwh === null ? '—' : expectedKwh.toFixed(2)} <span className="text-xs font-medium text-slate-400">kWh median</span></div><div className="mt-1 text-[10px] text-slate-500">{latestSelectedReading ? `Measured ${latestSelectedReading.consumptionKwh >= (expectedKwh || 0) ? '+' : ''}${(latestSelectedReading.consumptionKwh - (expectedKwh || 0)).toFixed(2)} kWh vs historical same-hour median` : 'Compares measured history at the local hour'}</div></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">Last successful ingestion <Clock3 className="h-4 w-4 text-amber-300" /></div><div className="mt-3 text-sm font-semibold text-white">{formatTimestamp(status?.lastIngestedAt)}</div><div className="mt-2 text-[10px] text-slate-500">{successfulTicks} accepted simulator tick{successfulTicks === 1 ? '' : 's'} this session</div></div>
    </section>

    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(270px,0.8fr)]">
      <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-white">Historical and simulated intervals</h2><p className="mt-1 text-[10px] text-slate-500">Hourly kWh; timestamps shown in Asia/Kolkata. Historical values are synthetic demo records.</p></div><span className="mt-2 w-fit rounded-md bg-amber-400/10 px-2 py-1 text-[9px] font-bold tracking-wide text-amber-200 sm:mt-0">SIMULATION · NOT PHYSICAL METER DATA</span></div>
        <div className="mt-4 h-64 w-full sm:h-80">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}><CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="label" minTickGap={30} tick={{ fill: '#64748b', fontSize: 10 }} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 10, fontSize: 11 }} labelStyle={{ color: '#cbd5e1' }} /><Line name="Historical synthetic" type="monotone" dataKey="historicalKwh" stroke="#64748b" strokeWidth={1.6} dot={false} connectNulls={false} /><Line name="Simulated live" type="monotone" dataKey="simulatedKwh" stroke="#34d399" strokeWidth={2.4} dot={{ r: 3 }} connectNulls={false} /></LineChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-xs text-slate-500">Historical readings load when the local demo API is enabled.</div>}</div>
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5"><div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-sky-400" /><h2 className="text-sm font-semibold text-white">Operating context</h2></div><p className="mt-3 text-xs leading-5 text-slate-400">Schedules and campus calendar are interpreted in <strong className="text-slate-200">Asia/Kolkata (UTC+05:30)</strong>. Meter timestamps remain UTC. India has no daylight-saving transition.</p><p className="mt-2 text-[10px] leading-4 text-slate-500">Timetable headcounts are expected attendance only. EcoGrid does not create occupancy observations.</p></div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/15 p-4 sm:p-5"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /><h2 className="text-sm font-semibold text-white">Existing intelligence workflows</h2></div><div className="mt-3 grid gap-2"><button disabled={!!busyAction || !status?.enabled} onClick={runAnomalyAnalysis} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-left text-xs font-medium text-slate-200 disabled:opacity-50"><span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" />Analyze research-lab readings</span>{busyAction === 'anomaly' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}</button><button disabled={!!busyAction || !status?.enabled} onClick={runForecast} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-left text-xs font-medium text-slate-200 disabled:opacity-50"><span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4 text-cyan-300" />Run existing 24-hour forecast</span>{busyAction === 'forecast' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}</button><button disabled={!!busyAction || !status?.enabled} onClick={refreshRecommendations} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-left text-xs font-medium text-slate-200 disabled:opacity-50"><span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 text-emerald-300" />Refresh evidence-based recommendations</span>{busyAction === 'recommendations' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}</button></div>{insightMessage && <p role="status" className="mt-3 text-[10px] leading-4 text-slate-400">{insightMessage}</p>}</div>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Link to="/operations" className="rounded-xl border border-slate-800 bg-slate-900 p-4 transition hover:border-sky-500/40"><CalendarClock className="h-4 w-4 text-sky-400" /><div className="mt-2 text-xs font-semibold text-white">Schedules & operations</div><div className="mt-1 text-[10px] text-slate-500">Show timetable evidence and operating context</div></Link><Link to="/solar" className="rounded-xl border border-slate-800 bg-slate-900 p-4 transition hover:border-amber-500/40"><SunMedium className="h-4 w-4 text-amber-300" /><div className="mt-2 text-xs font-semibold text-white">Solar & storage assumptions</div><div className="mt-1 text-[10px] text-slate-500">Illustrative campus solar and battery setup</div></Link><Link to="/digital-twin" className="rounded-xl border border-slate-800 bg-slate-900 p-4 transition hover:border-indigo-500/40"><BatteryCharging className="h-4 w-4 text-indigo-300" /><div className="mt-2 text-xs font-semibold text-white">Run Digital Twin</div><div className="mt-1 text-[10px] text-slate-500">Use the existing optimization workflow</div></Link></section>
    <p className="text-[10px] leading-4 text-slate-600">Demo clock note: the simulator advances one simulated hour per 15-second wall-clock interval so the existing hourly forecast and anomaly workflows receive compatible data. This is a presentation aid, not a real-time meter cadence.</p>
  </div>;
};
