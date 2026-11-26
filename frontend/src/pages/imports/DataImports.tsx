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
    <header className="flex items-start justify-between gap-4">
      <div><h1 className="text-xl font-bold text-white">Dataset imports</h1><p className="text-xs text-slate-400 mt-1">Upload source files, map them to one campus meter and review provenance and validation outcomes.</p></div>
      <button onClick={() => void load()} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
    </header>
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Start an import</h2>
      <form id="dataset-import-form" onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs text-slate-300">Dataset source<select value={datasetType} onChange={(event) => setDatasetType(event.target.value as DatasetType)} className="mt-1 w-full rounded bg-slate-800 border border-slate-700 p-2">
          <option value="IBLEND_REAL_WORLD">I-BLEND real-world</option><option value="BDG2_BENCHMARK">BDG2 benchmark</option><option value="ASHRAE_GEPIII">ASHRAE GEPIII benchmark</option>
        </select></label>
        <label className="text-xs text-slate-300">EcoGrid building<select value={buildingId} onChange={(event) => setBuildingId(event.target.value)} className="mt-1 w-full rounded bg-slate-800 border border-slate-700 p-2"><option value="">Choose building</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}</select></label>
        <label className="text-xs text-slate-300">EcoGrid meter<select value={meterId} onChange={(event) => setMeterId(event.target.value)} className="mt-1 w-full rounded bg-slate-800 border border-slate-700 p-2"><option value="">Choose meter</option>{meters.map((meter) => <option key={meter.id} value={meter.id}>{meter.meterName}</option>)}</select></label>
        {datasetType !== 'IBLEND_REAL_WORLD' && <label className="text-xs text-slate-300">Source building ID<input required value={externalBuildingId} onChange={(event) => setExternalBuildingId(event.target.value)} className="mt-1 w-full rounded bg-slate-800 border border-slate-700 p-2" placeholder="Must match metadata" /></label>}
        <label className="text-xs text-slate-300">Meter reading unit<select value={datasetType === 'IBLEND_REAL_WORLD' ? powerUnit : rawUnit} onChange={(event) => datasetType === 'IBLEND_REAL_WORLD' ? setPowerUnit(event.target.value) : setRawUnit(event.target.value)} className="mt-1 w-full rounded bg-slate-800 border border-slate-700 p-2"><option value="kWh">kWh</option><option value="Wh">Wh</option><option value="W">W</option><option value="kW">kW</option></select></label>
        <label className="text-xs text-slate-300">Readings CSV (required)<input required type="file" accept=".csv,text/csv" onChange={(event) => setReadings(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-slate-400" /></label>
        {datasetType !== 'IBLEND_REAL_WORLD' && <label className="text-xs text-slate-300">Building metadata CSV (required)<input required type="file" accept=".csv,text/csv" onChange={(event) => setMetadata(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-slate-400" /></label>}
        <label className="text-xs text-slate-300">Weather CSV (optional)<input type="file" accept=".csv,text/csv" onChange={(event) => setWeather(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-slate-400" /></label>
        {datasetType === 'IBLEND_REAL_WORLD' && <label className="text-xs text-slate-300">Building-level occupancy CSV (optional)<input type="file" accept=".csv,text/csv" onChange={(event) => setOccupancy(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-slate-400" /></label>}
        <p className="md:col-span-2 rounded-lg bg-slate-950 p-3 text-[11px] text-slate-400">Each batch maps one source building to one EcoGrid meter. Occupancy is imported only when the source provides it. Missing values and DST ambiguity are reported by validation; measurements are never generated to fill gaps.</p>
        <div className="md:col-span-2 flex items-center gap-3"><button disabled={busy} className="flex items-center gap-2 rounded-lg bg-emerald-600 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"><UploadCloud className="h-4 w-4" />{busy ? 'Processing…' : 'Upload and validate'}</button><span role="status" className="text-xs text-slate-300">{message}</span></div>
      </form>
    </section>
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Import history</h2><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="rounded bg-slate-800 border border-slate-700 p-2 text-xs text-slate-300"><option value="all">All sources</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs text-slate-300"><thead className="text-[10px] uppercase text-slate-500"><tr><th className="p-2">Dataset / files</th><th className="p-2">Status</th><th className="p-2">Records</th><th className="p-2">Provenance and mapping</th><th className="p-2">Imported</th><th className="p-2">Report</th></tr></thead><tbody className="divide-y divide-slate-800">{batches.map((batch) => { let mapping: any = {}; try { mapping = JSON.parse(batch.mappingJson || '{}'); } catch {} return <tr key={batch.id} className="align-top"><td className="p-2"><div className="font-semibold text-white">{labels[batch.dataSource] || batch.datasetName}</div><div className="text-slate-500">{batch.originalFilename}</div></td><td className="p-2"><div>{batch.status} · {batch.progressPercent}%</div><div className="text-slate-500">{batch.currentStage || batch.errorMessage || ''}</div></td><td className="p-2">{batch.validRecordsCount} valid<br /><span className="text-slate-500">{batch.rejectedCount} rejected / {batch.totalRowsProcessed} processed</span></td><td className="p-2"><div>{batch.license || 'License not recorded'}</div><div>{batch.sourceTimezone} · {batch.rawUnit}</div><div className="text-slate-400">Mapped to building/meter IDs: {mapping.buildingId || '—'} / {mapping.meterId || '—'}</div>{mapping.externalBuildingId && <div>Source building: {mapping.externalBuildingId}</div>}<div className="font-mono text-[10px] text-slate-500" title={batch.fileSha256}>{batch.fileSha256?.slice(0, 16)}…</div>{batch.sourceUrl && <a href={batch.sourceUrl} target="_blank" rel="noreferrer" className="text-emerald-400 underline">Source</a>}{batch.files?.length ? <div>{batch.files.length} hashed input file(s)</div> : null}</td><td className="p-2">{new Date(batch.importedAt).toLocaleString()}</td><td className="p-2">{batch.rejectedCount > 0 && <button onClick={() => void downloadRejections(batch)} className="inline-flex items-center gap-1 text-emerald-400"><Download className="h-3 w-3" />CSV</button>}</td></tr>;})}{batches.length === 0 && <tr><td className="p-4 text-center text-slate-500" colSpan={6}>No imports for this source yet.</td></tr>}</tbody></table></div>
    </section>
  </div>;
};
