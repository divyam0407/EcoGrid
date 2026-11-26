import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Lightbulb,
  CheckCircle2,
  XCircle,
  TrendingDown,
  DollarSign,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Filter,
} from 'lucide-react';

export const Recommendations: React.FC = () => {
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
  }, [statusFilter]);

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/recommendations${q}`);
      setRecommendations(res.data.recommendations || []);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await api.put(`/recommendations/${id}/status`, { status: newStatus });
      setRecommendations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
      );
    } catch (err) {
      console.error('Failed to update recommendation status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const totalMonthlySavings = recommendations
    .filter((r) => r.status !== 'REJECTED')
    .reduce((sum, r) => sum + r.estimatedCostSaving, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">AI & Operational Recommendations</h1>
          <p className="text-xs text-slate-400">
            Actionable energy interventions translated directly from operational timetables, telemetry & solvers
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-lg flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-300">Total Potential Savings:</span>
            <span className="text-sm font-bold text-emerald-400 font-mono">
              ${totalMonthlySavings.toLocaleString()}/mo
            </span>
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-300">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
          >
            <option value="">All Recommendations</option>
            <option value="PENDING">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="IMPLEMENTED">Implemented</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          {recommendations.length} Actionable Items
        </div>
      </div>

      {/* Recommendations Cards */}
      <div className="space-y-4">
        {recommendations.map((r) => (
          <div
            key={r.id}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-5 rounded-xl transition-all"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center space-x-2.5">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    r.priority === 'CRITICAL'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      : r.priority === 'HIGH'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  }`}
                >
                  {r.priority} Priority
                </span>

                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    r.status === 'APPROVED'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : r.status === 'IMPLEMENTED'
                      ? 'bg-purple-500/20 text-purple-300'
                      : r.status === 'REJECTED'
                      ? 'bg-slate-800 text-slate-500'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {r.status}
                </span>

                <h3 className="text-sm font-bold text-white">{r.title}</h3>
              </div>

              <div className="flex items-center space-x-4 text-xs font-mono">
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px] uppercase font-sans">Estimated Savings</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    ${r.estimatedCostSaving.toFixed(2)}/mo
                  </span>
                  <span className="text-slate-400 text-[10px] block">
                    ({r.estimatedEnergySavingKwh?.toLocaleString()} kWh)
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-3">{r.description}</p>

            {/* Evidence block */}
            <div className="bg-slate-850 p-3 rounded-lg border border-slate-800 text-xs mb-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                Supporting Telemetry Evidence & Rationale:
              </span>
              <p className="text-slate-300 font-mono text-[11px]">{r.evidence}</p>
            </div>

            {/* Human-in-the-loop Approval actions (PRD Section 16 Rule 19) */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Confidence Score: {(r.confidence * 100).toFixed(0)}% (Verified by operational correlation)</span>
              </span>

              <div className="flex items-center space-x-2">
                {r.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(r.id, 'APPROVED')}
                      disabled={updatingId === r.id}
                      className="flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve Measure</span>
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(r.id, 'REJECTED')}
                      disabled={updatingId === r.id}
                      className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </>
                )}

                {r.status === 'APPROVED' && (
                  <button
                    onClick={() => handleUpdateStatus(r.id, 'IMPLEMENTED')}
                    disabled={updatingId === r.id}
                    className="flex items-center space-x-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <span>Mark Implemented</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
