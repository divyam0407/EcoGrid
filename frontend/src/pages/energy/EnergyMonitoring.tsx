import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  Filter,
  Search,
  Activity,
  Layers,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export const EnergyMonitoring: React.FC = () => {
  const [readings, setReadings] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [columnMapping, setColumnMapping] = useState<any>({});
  const [uploadStatus, setUploadStatus] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedBuilding, selectedSource]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBuilding) params.set('buildingId', selectedBuilding);
      if (selectedSource !== 'all') params.set('dataSource', selectedSource);
      const query = params.toString() ? `?${params.toString()}` : '';
      const [readingsRes, bldgsRes, sourcesRes] = await Promise.all([
        api.get(`/energy/readings${query}`),
        api.get('/buildings'),
        api.get('/energy/sources'),
      ]);
      setReadings(readingsRes.data.readings || []);
      setBuildings(bldgsRes.data.buildings || []);
      setDataSources(sourcesRes.data.sources || []);
    } catch (err) {
      console.error('Failed to load readings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setUploadStatus(null);

      // Trigger preview
      const formData = new FormData();
      formData.append('file', selected);
      try {
        const res = await api.post('/energy/preview', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setPreviewData(res.data);
        setColumnMapping(res.data.suggestedMappings || {});
      } catch (err: any) {
        setUploadStatus({ error: err.response?.data?.error || 'Failed to preview CSV' });
      }
    }
  };

  const handleConfirmUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(columnMapping));
    if (selectedBuilding) formData.append('defaultBuildingId', selectedBuilding);

    try {
      const res = await api.post('/energy/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadStatus(res.data);
      fetchData();
    } catch (err: any) {
      setUploadStatus({ error: err.response?.data?.error || 'Upload error occurred.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Energy Telemetry & Data Management</h1>
          <p className="text-xs text-slate-400">
            Validated meter intervals, CSV ingest pipelines, and sub-meter consumption breakdown
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href="data:text/csv;charset=utf-8,Timestamp,Building,Meter,Consumption%20kWh,Power%20kW%0A2026-11-24%2009:00,Academic%20Block,M001,45.2,45.2%0A2026-11-24%2010:00,Academic%20Block,M001,58.0,58.0%0A2026-11-24%2011:00,Computer%20Science%20Block,M002,62.5,62.5"
            download="ecogrid_sample_meter_readings.csv"
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs px-3 py-2 rounded-lg border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Sample CSV</span>
          </a>

          <Link to="/imports" className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm"><Upload className="w-3.5 h-3.5" /><span>Import a dataset</span></Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-300">Filter Infrastructure:</span>
          <select
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200">
            <option value="all">All data sources</option>
            {dataSources.map((source) => <option key={source} value={source}>{source === 'SYNTHETIC_DEMO' ? 'ABC University demo' : source}</option>)}
          </select>
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="font-semibold text-white">{readings.length}</span> validated historical telemetry readings
        </div>
      </div>

      {/* Telemetry Readings Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Meter Readings Telemetry Log</span>
          </h3>
          <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-mono">
            Source-provided intervals
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp (UTC)</th>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Meter Name</th>
                <th className="px-4 py-3">Consumption (kWh)</th>
                <th className="px-4 py-3">Power (kW)</th>
                <th className="px-4 py-3">Data Quality</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {readings.slice(0, 25).map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-2.5 text-slate-300">
                    {new Date(r.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-4 py-2.5 font-sans font-medium text-white">{r.building?.name}</td>
                  <td className="px-4 py-2.5 text-slate-400 font-sans">{r.meter?.meterName || 'Main Feeder'}</td>
                  <td className="px-4 py-2.5 text-emerald-400 font-bold">{r.consumptionKwh.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-slate-300">{r.powerKw == null ? '—' : r.powerKw.toFixed(1)}</td>
                  <td className="px-4 py-2.5 font-sans">
                    <span className="inline-flex items-center space-x-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{r.qualityStatus}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 font-sans text-[11px]">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV Upload & Column Mapping Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <span>Upload Historical Energy Telemetry (CSV)</span>
              </h3>
              <button
                onClick={() => setIsUploadOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Upload raw electricity readings. The system validates timestamps, detects missing intervals, checks for duplicate meter rows, and flags negative readings without silent corruption.
            </p>

            <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-850">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csvInput"
              />
              <label htmlFor="csvInput" className="cursor-pointer flex flex-col items-center">
                <Upload className="w-8 h-8 text-emerald-400 mb-2" />
                <span className="text-xs font-semibold text-slate-200">
                  {file ? file.name : 'Click to select CSV file'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1">Accepts standard .csv exports</span>
              </label>
            </div>

            {/* Column Mapping Preview */}
            {previewData && (
              <div className="space-y-3 bg-slate-850 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Column Header Mapping & Validation
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Timestamp Column</label>
                    <select
                      value={columnMapping.timestamp || ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, timestamp: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white"
                    >
                      {previewData.headers.map((h: string) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Consumption (kWh) Column</label>
                    <select
                      value={columnMapping.consumptionKwh || ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, consumptionKwh: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white"
                    >
                      {previewData.headers.map((h: string) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-[11px] text-emerald-400 flex items-center space-x-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Preview detected {previewData.previewRows.length} sample rows ready for import.</span>
                </div>
              </div>
            )}

            {uploadStatus && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  uploadStatus.error
                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                }`}
              >
                {uploadStatus.error ? (
                  uploadStatus.error
                ) : (
                  <div>
                    Import completed: {uploadStatus.importedCount} valid rows ingested into database.
                    {uploadStatus.errorCount > 0 && ` (${uploadStatus.errorCount} invalid rows rejected)`}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsUploadOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={!previewData || uploading}
                onClick={handleConfirmUpload}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
              >
                {uploading ? 'Validating & Importing...' : 'Confirm Ingest'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
