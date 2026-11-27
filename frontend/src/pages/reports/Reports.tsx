import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  DollarSign,
  Zap,
  Activity,
  Leaf,
  ShieldAlert,
  Info,
} from 'lucide-react';

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<string>('monthly');
  const [emissionFactor, setEmissionFactor] = useState<number>(0.42); // kg CO2e / kWh

  useEffect(() => {
    fetchReport();
  }, [period, emissionFactor]);

  const fetchReport = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/reports/energy?period=${period}&emissionFactor=${emissionFactor}`);
      setReport(res.data);
    } catch (err) {
      console.error('Failed to load report:', err);
      setError('The report could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!report) return;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Metric,Value\n' +
      `Report Period,${period}\n` +
      `Total Consumption kWh,${report.metrics?.totalEnergyConsumedKwh}\n` +
      `Solar Generation kWh,${report.metrics?.solarEnergyGeneratedKwh}\n` +
      `Grid Purchases kWh,${report.metrics?.gridElectricityPurchasedKwh}\n` +
      `Electricity Expenditure ${report.metrics?.currency || 'currency'},${report.metrics?.totalElectricityExpenditure ?? 'Unavailable'}\n` +
      `Potential Cost Savings ${report.metrics?.currency || 'currency'},${report.metrics?.potentialCostSavingsIdentified ?? 'Unavailable'}\n` +
      `Grid Emissions kg CO2e,${report.metrics?.carbonEmissions?.estimatedGridEmissionsKgCo2e}\n` +
      `Emissions Metric Tons,${report.metrics?.carbonEmissions?.estimatedGridEmissionsMetricTons}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ecogrid_energy_report_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Executive Reporting & Carbon Analytics</h1>
          <p className="text-xs text-slate-400">
            Energy audit summaries, expenditure verification, anomaly logs and Scope 2 carbon estimations
          </p>
        </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Report period"
            className="min-h-10 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-semibold"
          >
            <option value="daily">Daily Report</option>
            <option value="weekly">Weekly Report</option>
            <option value="monthly">Monthly Report</option>
          </select>

          <button
            onClick={handleExportCsv}
            type="button"
            className="flex min-h-10 items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            type="button"
            className="flex min-h-10 items-center space-x-1.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Main Printable Report Sheet */}
      {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      <div aria-busy={loading} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {loading ? 'Loading energy report…' : report?.reportTitle || 'Campus Operational Energy & Carbon Report'}
            </h2>
            <div className="text-xs text-slate-400 mt-1">
              {report?.generatedAt ? `Generated: ${new Date(report.generatedAt).toLocaleString()}` : 'Report time unavailable'}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Target Facility</span>
            <span className="text-sm font-semibold text-emerald-300">{user?.organization?.name || 'Current organization'}</span>
          </div>
        </div>

        {/* Primary Accounting Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Total Consumption</span>
            <span className="text-xl font-bold text-white font-mono">
              {report?.metrics?.totalEnergyConsumedKwh == null ? 'Unavailable' : `${report.metrics.totalEnergyConsumedKwh.toLocaleString()} kWh`}
            </span>
          </div>

          <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Solar Self-Consumption</span>
            <span className="text-xl font-bold text-amber-400 font-mono">
              {report?.metrics?.solarEnergyGeneratedKwh == null ? 'Unavailable' : `${report.metrics.solarEnergyGeneratedKwh.toLocaleString()} kWh`}
            </span>
          </div>

          <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Grid Electricity Ingest</span>
            <span className="text-xl font-bold text-blue-400 font-mono">
              {report?.metrics?.gridElectricityPurchasedKwh == null ? 'Unavailable' : `${report.metrics.gridElectricityPurchasedKwh.toLocaleString()} kWh`}
            </span>
          </div>

          <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Total Expenditure</span>
            <span className="text-xl font-bold text-white font-mono">
              {report?.metrics?.totalElectricityExpenditure == null ? 'Unavailable' : `${report?.metrics?.currency || ''} ${report.metrics.totalElectricityExpenditure.toLocaleString()}`}
            </span>
          </div>
        </div>

        {/* Carbon Analytics Box (PRD Module 13) */}
        <div className="bg-gradient-to-r from-emerald-950/30 to-teal-950/20 border border-emerald-500/30 p-5 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Leaf className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Carbon Footprint & Emissions Impact</h3>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <label htmlFor="report-emission-factor">Emission factor</label>
              <input
                id="report-emission-factor"
                type="number"
                min="0"
                step="0.01"
                value={emissionFactor}
                onChange={(e) => setEmissionFactor(parseFloat(e.target.value))}
                className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono"
              />
              <span className="text-[11px] text-slate-400">kg CO2e/kWh · review for your region</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-sans text-slate-400 block mb-1">Estimated Grid Emissions</span>
              <span className="text-base font-bold text-white">
                {report?.metrics?.carbonEmissions?.estimatedGridEmissionsKgCo2e == null ? 'Unavailable' : `${report.metrics.carbonEmissions.estimatedGridEmissionsKgCo2e.toLocaleString()} kg CO2e`}
              </span>
              <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                ({report?.metrics?.carbonEmissions?.estimatedGridEmissionsMetricTons ?? 'Unavailable'} Metric Tons)
              </span>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-sans text-slate-400 block mb-1">Emissions Avoided via Solar</span>
              <span className="text-base font-bold text-emerald-400">
                {report?.metrics?.carbonEmissions?.emissionsAvoidedViaSolarKgCo2e == null ? 'Unavailable' : `${report.metrics.carbonEmissions.emissionsAvoidedViaSolarKgCo2e.toLocaleString()} kg CO2e`}
              </span>
              <span className="text-[10px] text-slate-400 font-sans block mt-0.5">Clean rooftop generation</span>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-sans text-slate-400 block mb-1">Renewable Offset Share</span>
              <span className="text-base font-bold text-amber-400">
                {report?.metrics?.solarFractionPercent == null ? 'Unavailable' : `${report.metrics.solarFractionPercent}%`}
              </span>
              <span className="text-[10px] text-slate-400 font-sans block mt-0.5">Total generation ratio</span>
            </div>
          </div>

          <div className="flex items-start space-x-2 text-[11px] text-slate-400 pt-1">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{report?.metrics?.carbonEmissions?.emissionsNotice || 'Emissions are estimates based on the selected factor, not verified market-based accounting.'}</span>
          </div>
        </div>

        {/* Inefficiencies & Anomalies Audit Digest */}
        <div className="border border-slate-800 rounded-xl p-4 bg-slate-850">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
            Facility Telemetry Integrity & Anomaly Audit
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-sans">Total Outliers Flagged</span>
              <span className="font-bold text-white">{report?.metrics?.anomalySummary?.totalFlagged ?? 'Unavailable'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-sans">Critical Anomalies</span>
              <span className="font-bold text-rose-400">{report?.metrics?.anomalySummary?.criticalSeverity ?? 'Unavailable'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-sans">High Severity</span>
              <span className="font-bold text-amber-400">{report?.metrics?.anomalySummary?.highSeverity ?? 'Unavailable'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-sans">Resolved Outliers</span>
              <span className="font-bold text-emerald-400">{report?.metrics?.anomalySummary?.resolved ?? 'Unavailable'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
