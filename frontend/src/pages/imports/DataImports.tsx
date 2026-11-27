import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, UploadCloud } from 'lucide-react';
import api from '../../services/api';

type DatasetType = 'IBLEND_REAL_WORLD' | 'BDG2_BENCHMARK' | 'ASHRAE_GEPIII';
type Building = { id: string; name: string; meters: { id: string; meterName: string }[] };
type Batch = {
  id: string; dataSource: string; datasetName: string; license: string; sourceUrl?: string | null;
  sourceTimezone: string; rawUnit: string; originalFilename: string; fileSha256: string;
  status: string; progressPercent: number; currentStage?: string | null; errorMessage?: string | null;
  mappingJson?: string | null;
  totalRowsProcessed: number; validRecordsCount: number; rejectedCount: number; importedAt: string;
  files?: { id: string; fieldName: string; originalFilename: string; sha256: string; sizeBytes: number }[];
};

const labels: Record<string, string> = {
  IBLEND_REAL_WORLD: 'I-BLEND real-world',
  BDG2_BENCHMARK: 'Building Data Genome 2 benchmark',
  ASHRAE_GEPIII: 'ASHRAE GEPIII benchmark',
  SYNTHETIC_DEMO: 'ABC University demo',
};

const statusStyle = (status: string) => {
  if (status === 'COMPLETED') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';
  if (status === 'COMPLETED_WITH_WARNINGS') return 'border-amber-400/20 bg-amber-400/10 text-amber-200';
  if (status === 'FAILED') return 'border-rose-400/20 bg-rose-400/10 text-rose-200';
  return 'border-sky-400/20 bg-sky-400/10 text-sky-200';
};

const displayStatus = (status: string) => status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const mappedBuilding = (mapping: any) => mapping.buildingName || mapping.buildingId || (Array.isArray(mapping.buildingMeterMapping) ? `${mapping.buildingMeterMapping.length} buildings` : '—');
const mappedMeter = (mapping: any) => mapping.meterName || mapping.meterId || (Array.isArray(mapping.buildingMeterMapping) ? `${mapping.buildingMeterMapping.length} mapped meters` : '—');

export const DataImports: React.FC = () => {
  const [datasetType, setDatasetType] = useState<DatasetType>('IBLEND_REAL_WORLD');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [meterId, setMeterId] = useState('');
  const [externalBuildingId, setExternalBuildingId] = useState('');
  const [rawUnit, setRawUnit] = useState('kWh');
  const [powerUnit, setPowerUnit] = useState('W');
  const [readings, setReadings] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<File | null>(null);
  const [weather, setWeather] = useState<File | null>(null);
  const [occupancy, setOccupancy] = useState<File | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  const meters = useMemo(() => buildings.find((item) => item.id === buildingId)?.meters || [], [buildings, buildingId]);

  const load = useCallback(async () => {
    try {
      const [buildingResponse, batchResponse] = await Promise.all([
        api.get('/buildings'),
        api.get('/imports', { params: { limit: 100, dataSource: sourceFilter === 'all' ? undefined : sourceFilter } }),
      ]);
      const nextBuildings = buildingResponse.data.buildings || [];
      setBuildings(nextBuildings);
      setBuildingId((current) => current || nextBuildings[0]?.id || '');
      setMeterId((current) => current || nextBuildings[0]?.meters?.[0]?.id || '');
      setBatches(batchResponse.data.batches || []);
    } catch {
      setMessage('Could not load buildings or import history. Check your session and API connection.');
    }
  }, [sourceFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => { void load(); }, 2500);
    return () => window.clearInterval(timer);
  }, [busy, load]);

  useEffect(() => {
    if (!meters.some((meter) => meter.id === meterId)) setMeterId(meters[0]?.id || '');
  }, [meters, meterId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!readings || !buildingId || !meterId) {
      setMessage('Choose a readings CSV, an EcoGrid building and a meter.');
      return;
    }
    const body = new FormData();
    body.set('datasetType', datasetType);
    body.set('buildingId', buildingId);
    body.set('meterId', meterId);
    body.set('externalBuildingId', externalBuildingId);
    body.set('rawUnit', rawUnit);
    body.set('powerUnit', powerUnit);
    body.set('readings', readings);
    if (metadata) body.set('metadata', metadata);
    if (weather) body.set('weather', weather);
    if (occupancy && datasetType === 'IBLEND_REAL_WORLD') body.set('occupancy', occupancy);

    setBusy(true);
    setMessage('Upload received. Validation and processing status will appear in import history.');
    try {
      const response = await api.post('/imports', body, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 240000 });
      setMessage(response.data.duplicate ? 'This exact dataset and mapping were already imported; existing batch returned.' : 'Import finished.');
      setReadings(null); setMetadata(null); setWeather(null); setOccupancy(null);
      const form = document.getElementById('dataset-import-form') as HTMLFormElement | null;
      form?.reset();
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Import failed. Check the batch status and try again after resolving the issue.');
    } finally {
      setBusy(false);
      await load();
    }
  };

  const downloadRejections = async (batch: Batch) => {
    try {
      const response = await api.get(`/imports/${batch.id}/rejections.csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ecogrid-${batch.id}-rejections.csv`; anchor.click();
      URL.revokeObjectURL(url);
    } catch { setMessage('Could not download the rejection report.'); }
  };

  return <div className="space-y-6">
    <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div><h1 className="text-xl font-bold text-white">Dataset imports</h1><p className="text-xs text-slate-400 mt-1">Upload source files, map them to one campus meter and review provenance and validation outcomes.</p></div>
      <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" />Refresh history</button>
    </header>
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-300">New dataset</p><h2 className="mt-1 text-base font-semibold text-white">Start an import</h2></div>
        <span className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-400">1. Identify · 2. Map · 3. Validate</span>
      </div>
      <form id="dataset-import-form" onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs font-medium text-slate-300">Dataset source<select value={datasetType} onChange={(event) => setDatasetType(event.target.value as DatasetType)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2.5 text-sm">
          <option value="IBLEND_REAL_WORLD">I-BLEND real-world</option><option value="BDG2_BENCHMARK">BDG2 benchmark</option><option value="ASHRAE_GEPIII">ASHRAE GEPIII benchmark</option>
        </select></label>
        <label className="text-xs font-medium text-slate-300">EcoGrid building<select value={buildingId} onChange={(event) => setBuildingId(event.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2.5 text-sm"><option value="">Choose building</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-300">EcoGrid meter<select value={meterId} onChange={(event) => setMeterId(event.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2.5 text-sm"><option value="">Choose meter</option>{meters.map((meter) => <option key={meter.id} value={meter.id}>{meter.meterName}</option>)}</select></label>
        {datasetType !== 'IBLEND_REAL_WORLD' && <label className="text-xs text-slate-300">Source building ID<input required value={externalBuildingId} onChange={(event) => setExternalBuildingId(event.target.value)} className="mt-1 w-full rounded bg-slate-800 border border-slate-700 p-2" placeholder="Must match metadata" /></label>}
        <label className="text-xs font-medium text-slate-300">Meter reading unit<select value={datasetType === 'IBLEND_REAL_WORLD' ? powerUnit : rawUnit} onChange={(event) => datasetType === 'IBLEND_REAL_WORLD' ? setPowerUnit(event.target.value) : setRawUnit(event.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2.5 text-sm"><option value="kWh">kWh</option><option value="Wh">Wh</option><option value="W">W</option><option value="kW">kW</option></select></label>
        <label className="text-xs font-medium text-slate-300">Readings CSV <span className="text-rose-300">· required</span><input required type="file" accept=".csv,text/csv" onChange={(event) => setReadings(event.target.files?.[0] || null)} className="mt-1.5 block min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-700" /></label>
        {datasetType !== 'IBLEND_REAL_WORLD' && <label className="text-xs font-medium text-slate-300">Building metadata CSV <span className="text-rose-300">· required</span><input required type="file" accept=".csv,text/csv" onChange={(event) => setMetadata(event.target.files?.[0] || null)} className="mt-1.5 block min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-700" /></label>}
        <label className="text-xs font-medium text-slate-300">Weather CSV <span className="text-slate-500">· optional</span><input type="file" accept=".csv,text/csv" onChange={(event) => setWeather(event.target.files?.[0] || null)} className="mt-1.5 block min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-700" /></label>
        {datasetType === 'IBLEND_REAL_WORLD' && <label className="text-xs font-medium text-slate-300">Building-level occupancy CSV <span className="text-slate-500">· optional</span><input type="file" accept=".csv,text/csv" onChange={(event) => setOccupancy(event.target.files?.[0] || null)} className="mt-1.5 block min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-700" /></label>}
        <p className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs leading-5 text-slate-400">One batch maps one source building to one EcoGrid meter. Occupancy is imported only when the source provides it. Missing values and daylight-saving ambiguity are reported; readings are never generated to fill gaps. Dataset terms and attribution remain attached to the import record.</p>
        <div className="md:col-span-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center"><button type="submit" disabled={busy || !buildingId || !meterId || !readings} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"><UploadCloud className="h-4 w-4" />{busy ? 'Processing…' : 'Upload and validate'}</button>{message && <span role={message.startsWith('Import failed') || message.startsWith('Could not') ? 'alert' : 'status'} aria-live="polite" className={`text-xs ${message.startsWith('Import failed') || message.startsWith('Could not') ? 'text-rose-300' : 'text-slate-300'}`}>{message}</span>}</div>
      </form>
    </section>
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-semibold text-white">Import history</h2><p className="mt-1 text-xs text-slate-500">Source files, processing results and provenance records.</p></div><label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Filter source<select aria-label="Filter import history by source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="mt-1 block min-w-48 rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-slate-200"><option value="all">All sources</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {batches.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 px-5 py-10 text-center"><UploadCloud className="mx-auto h-7 w-7 text-slate-500"/><p className="mt-3 text-sm font-medium text-slate-200">No imports for this source yet</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">Choose a dataset and meter above to start. Imported readings and provenance will appear here after validation.</p></div> : <>
      <div className="hidden overflow-x-auto lg:block"><table className="min-w-[920px] w-full text-left text-xs text-slate-300"><thead className="text-[10px] uppercase text-slate-500"><tr><th className="p-3">Dataset / files</th><th className="p-3">Status</th><th className="p-3">Records</th><th className="p-3">Provenance and mapping</th><th className="p-3">Imported</th><th className="p-3">Report</th></tr></thead><tbody className="divide-y divide-slate-800">{batches.map((batch) => { let mapping: any = {}; try { mapping = JSON.parse(batch.mappingJson || '{}'); } catch {} return <tr key={batch.id} className="align-top"><td className="p-3"><div className="font-semibold text-white">{labels[batch.dataSource] || batch.datasetName}</div><div className="mt-1 text-slate-500">{batch.originalFilename}</div></td><td className="p-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusStyle(batch.status)}`}>{displayStatus(batch.status)}</span><div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label={`${displayStatus(batch.status)} progress`} aria-valuenow={batch.progressPercent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald-400" style={{width:`${Math.max(0,Math.min(100,batch.progressPercent))}%`}}/></div><div className="mt-1 text-slate-500">{batch.currentStage || batch.errorMessage || `${batch.progressPercent}%`}</div></td><td className="p-3">{batch.validRecordsCount} valid<br /><span className="text-slate-500">{batch.rejectedCount} rejected / {batch.totalRowsProcessed} processed</span></td><td className="max-w-xs p-3"><div>{batch.license || 'License not recorded'}</div><div className="mt-1 text-slate-400">{batch.sourceTimezone} · {batch.rawUnit}</div><div className="mt-1 break-all text-[10px] text-slate-400">EcoGrid building/meter: {mappedBuilding(mapping)} / {mappedMeter(mapping)}</div>{mapping.externalBuildingId && <div className="mt-1 text-slate-400">Source building: {mapping.externalBuildingId}</div>}<div className="mt-1 break-all text-[10px] text-slate-500" title={batch.fileSha256}>SHA-256 {batch.fileSha256?.slice(0, 20)}…</div>{batch.sourceUrl && <a href={batch.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-emerald-300 underline">Source attribution</a>}{batch.files?.length ? <div className="mt-1 text-slate-400">{batch.files.length} hashed input file(s)</div> : null}</td><td className="whitespace-nowrap p-3">{new Date(batch.importedAt).toLocaleString()}</td><td className="p-3">{batch.rejectedCount > 0 && <button type="button" onClick={() => void downloadRejections(batch)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-700 px-2.5 text-emerald-300 hover:bg-slate-800"><Download className="h-3 w-3" />Rejected rows</button>}</td></tr>;})}</tbody></table></div>
      <div className="space-y-3 lg:hidden">{batches.map((batch) => { let mapping: any = {}; try { mapping = JSON.parse(batch.mappingJson || '{}'); } catch {} return <article key={batch.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{labels[batch.dataSource] || batch.datasetName}</h3><p className="mt-1 break-all text-xs text-slate-400">{batch.originalFilename}</p></div><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusStyle(batch.status)}`}>{displayStatus(batch.status)}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><span className="block text-[10px] uppercase tracking-wide text-slate-500">Records</span><span className="mt-1 block text-slate-200">{batch.validRecordsCount} valid · {batch.rejectedCount} rejected</span></div><div><span className="block text-[10px] uppercase tracking-wide text-slate-500">Source settings</span><span className="mt-1 block text-slate-200">{batch.sourceTimezone} · {batch.rawUnit}</span></div></div><div className="mt-3 border-t border-slate-800 pt-3 text-[11px] leading-5 text-slate-400"><div>{batch.license || 'License not recorded'} · {batch.files?.length || 0} hashed input file(s)</div><div className="break-all text-[10px] text-slate-400">EcoGrid building/meter: {mappedBuilding(mapping)} / {mappedMeter(mapping)}</div>{mapping.externalBuildingId && <div>Source building: {mapping.externalBuildingId}</div>}<div className="break-all font-mono text-[10px] text-slate-500">SHA-256 {batch.fileSha256?.slice(0, 20)}…</div>{batch.sourceUrl && <a href={batch.sourceUrl} target="_blank" rel="noreferrer" className="text-emerald-300 underline">Source attribution</a>}</div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] text-slate-500">{new Date(batch.importedAt).toLocaleString()}</span>{batch.rejectedCount > 0 && <button type="button" onClick={() => void downloadRejections(batch)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-700 px-2.5 text-xs text-emerald-300 hover:bg-slate-800"><Download className="h-3.5 w-3.5" />Rejected rows</button>}</div></article>;})}</div>
      </>}
    </section>
  </div>;
};
