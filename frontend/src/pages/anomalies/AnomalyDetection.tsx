import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  Filter,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export const AnomalyDetection: React.FC = () => {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [method, setMethod] = useState<string>('combined');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAnomalies();
  }, [statusFilter, severityFilter]);

  const fetchAnomalies = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (severityFilter) params.append('severity', severityFilter);

      const res = await api.get(`/anomalies?${params.toString()}`);
      setAnomalies(res.data.anomalies || []);
    } catch (err) {
      console.error('Error fetching anomalies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunDetection = async () => {
    setLoading(true);
    try {
      await api.post('/anomalies/detect', { method, sensitivity: 2.2 });
      await fetchAnomalies();
    } catch (err) {
      console.error('Error running detection:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await api.put(`/anomalies/${id}/status`, { status: newStatus });
      setAnomalies((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
      );
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st.toUpperCase()) {
      case 'OPEN':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'INVESTIGATING':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'RESOLVED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'FALSE_POSITIVE':
        return 'bg-slate-700/50 text-slate-400 border-slate-600/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Abnormal Consumption & Anomaly Detection</h1>
          <p className="text-xs text-slate-400">
            Automated outlier discovery using statistical baseline Z-scores and Scikit-learn Isolation Forests
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-semibold"
          >
            <option value="combined">Combined (Z-Score + IsoForest)</option>
            <option value="isolation_forest">Isolation Forest Only</option>
            <option value="z_score">Statistical Z-Score Only</option>
          </select>

          <button
            onClick={handleRunDetection}
            disabled={loading}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Scan Telemetry</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-300">Filters:</span>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
            <option value="FALSE_POSITIVE">False Positive</option>
          </select>
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="font-semibold text-white">{anomalies.length}</span> detected anomalies
        </div>
      </div>

      {/* Anomalies List */}
      <div className="space-y-3.5">
        {anomalies.map((a) => (
          <div
            key={a.id}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 p-4 rounded-xl transition-all"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center space-x-2.5">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getSeverityBadge(
                    a.severity
                  )}`}
                >
                  {a.severity}
                </span>

                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getStatusBadge(
                    a.status
                  )}`}
                >
                  {a.status}
                </span>

                <span className="text-xs font-bold text-white">{a.anomalyType.replace(/_/g, ' ')}</span>
                <span className="text-xs text-slate-400 font-sans">
                  at {a.building?.name} {a.room ? `(${a.room.roomNumber})` : ''}
                </span>
              </div>

              <div className="text-xs font-mono text-slate-400">
                Detected: {new Date(a.detectedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-3">{a.description}</p>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-850 p-2.5 rounded-lg border border-slate-800 text-xs mb-3 font-mono">
              <div>
                <span className="text-[10px] uppercase text-slate-400 block font-sans">Observed Load</span>
                <span className="font-bold text-rose-400">{a.observedValue} kWh</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 block font-sans">Expected Baseline</span>
                <span className="font-bold text-slate-300">{a.expectedValue} kWh</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 block font-sans">Deviation</span>
                <span className="font-bold text-amber-400">
                  +{a.deviation} kWh ({a.deviationPercent}%)
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 block font-sans">Action</span>
                <span className="text-slate-300 truncate block font-sans text-[11px]">{a.suggestedAction || 'Audit equipment'}</span>
              </div>
            </div>

            {/* Status Workflow Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-400">
                Investigate and update resolution status:
              </span>

              <div className="flex items-center space-x-2">
                {a.status !== 'INVESTIGATING' && a.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleUpdateStatus(a.id, 'INVESTIGATING')}
                    disabled={updatingId === a.id}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/20 transition-colors"
                  >
                    Mark Investigating
                  </button>
                )}

                {a.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleUpdateStatus(a.id, 'RESOLVED')}
                    disabled={updatingId === a.id}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/20 transition-colors"
                  >
                    Resolve Alert
                  </button>
                )}

                {a.status !== 'FALSE_POSITIVE' && (
                  <button
                    onClick={() => handleUpdateStatus(a.id, 'FALSE_POSITIVE')}
                    disabled={updatingId === a.id}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-colors"
                  >
                    False Positive
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {anomalies.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-xl text-center text-slate-400 text-xs">
            No active anomalies matching current filters. All building meters are running within nominal bounds.
          </div>
        )}
      </div>
    </div>
  );
};
