import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  Zap,
  Activity,
  DollarSign,
  SunMedium,
  BatteryCharging,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Building,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const sourceLabel = (source: string) => source === 'SYNTHETIC_DEMO'
  ? 'ABC demo'
  : source === 'BDG2_BENCHMARK'
    ? 'BDG2 benchmark'
    : source === 'ASHRAE_GEPIII'
      ? 'ASHRAE GEPIII benchmark'
      : source === 'IBLEND_REAL_WORLD'
        ? 'I-BLEND real-world'
        : source;

export const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [buildingComp, setBuildingComp] = useState<any[]>([]);
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('all');

  useEffect(() => {
    fetchDashboardData();
  }, [selectedBuilding, timeRange, selectedSource]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const filters = new URLSearchParams();
      if (selectedBuilding !== 'all') filters.set('buildingId', selectedBuilding);
      filters.set('dataSource', selectedSource);
      const filterParam = filters.toString() ? `&${filters.toString()}` : '';
      const [sumRes, trendRes, compRes, sourcesRes] = await Promise.all([
        api.get(`/energy/summary?days=${timeRange}${filterParam}`),
        api.get(`/energy/trends?interval=daily${filterParam}`),
        api.get(`/energy/building-comparison?${selectedSource === 'all' ? '' : `dataSource=${encodeURIComponent(selectedSource)}`}`),
        api.get('/energy/sources'),
      ]);

      setSummary(sumRes.data);
      setTrends(trendRes.data.trends || []);
      setBuildingComp(compRes.data.comparison || []);
      setDataSources(sourcesRes.data.sources || []);
    } catch (err) {
      console.error('Error fetching dashboard telemetry:', err);
      setError('Campus energy data could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

  return (
    <div className="space-y-7">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Executive Energy Intelligence</h1>
          <p className="text-xs text-slate-400">
            Real-time campus energy telemetry, solar utilization, battery dispatch & operational efficiency
          </p>
        </div>

        {/* Global Dashboard Filters */}
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3 sm:gap-3">
          <label className="min-w-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">Data source<select aria-label="Filter by data source" value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200">
            <option value="all">All data sources</option>
            {dataSources.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}
          </select></label>
          <label className="min-w-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">Building<select
            aria-label="Filter by building"
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className="mt-1 w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Campus Buildings</option>
            {buildingComp.map((b) => (
              <option key={b.buildingId} value={b.buildingId}>
                {b.buildingName}
              </option>
            ))}
          </select></label>

          <label className="min-w-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">Time period<select
            aria-label="Filter by time period"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="mt-1 w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="all">All Available History</option>
          </select></label>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {/* Primary KPI Grid (PRD Module 4) */}
      <div className="grid grid-cols-1 min-[430px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* Card 1: Total Consumption */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Consumed</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white">
            {loading ? 'Loading…' : summary?.totalConsumptionKwh?.toLocaleString() ?? '—'} <span className="text-xs font-normal text-slate-400">kWh</span>
          </div>
          <div className="text-[10px] text-emerald-400 mt-1 flex items-center">
            <ArrowDownRight className="w-3 h-3 mr-0.5" />
            <span>Recorded in selected period</span>
          </div>
        </div>

        {/* Card 2: Peak Demand */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Peak Demand</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white">
            {loading ? 'Loading…' : summary?.peakDemandKw?.toLocaleString() ?? '—'} <span className="text-xs font-normal text-slate-400">kW</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Peak across available readings</div>
        </div>

        {/* Card 3: Electricity Expenditure */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Expenditure</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white">
            {summary?.totalExpenditure != null ? `${summary?.currency || ''} ${summary.totalExpenditure.toLocaleString()}` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Based on configured tariff</div>
        </div>

        {/* Card 4: Solar Generation */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Solar Generated</span>
            <SunMedium className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white">
            {loading ? 'Loading…' : summary?.solarGenerationKwh?.toLocaleString() ?? '—'} <span className="text-xs font-normal text-slate-400">kWh</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Recorded solar readings</div>
        </div>

        {/* Card 5: Potential Savings */}
        <div className="bg-emerald-950/20 border border-emerald-500/25 p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Identified Savings</span>
            <Lightbulb className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">
            {summary?.currency ? `${summary.currency} ` : ''}{summary?.potentialSavingsCost?.toLocaleString() ?? '—'}
          </div>
          <div className="text-[10px] text-emerald-300/80 mt-1">Priced A7 potential for its observed evidence window; not monthly</div>
        </div>
      </div>

      {/* Secondary Quick-Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <BatteryCharging className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-slate-300 font-medium">Battery telemetry</span>
              <Link to="/batteries" className="text-indigo-400 underline">View battery records</Link>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-slate-300">Organization-wide Active Anomalies</div>
            <div className="text-[11px] text-rose-400 font-semibold mt-0.5">
              {summary?.activeAnomaliesCount ?? '—'} Anomalies Require Investigation
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-teal-400" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-slate-300">Next 24-Hour Forecast</div>
            <div className="text-[11px] text-teal-400 font-semibold mt-0.5">
              Forecast results require evaluation on held-out data
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts: Consumption vs Solar Trend (AreaChart) & Building Comparison (BarChart) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Energy Profile Trend */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 p-5 sm:p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Daily Consumption & Solar Generation Profile</h3>
              <p className="text-[11px] text-slate-400">Total load vs on-site solar renewable offset (kWh)</p>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center space-x-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Consumption</span>
              </span>
              <span className="flex items-center space-x-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <span>Solar Generation</span>
              </span>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full">
            {loading ? <div className="h-full animate-pulse rounded-lg bg-slate-800/40" aria-label="Loading energy trend" /> : trends.length === 0 ? <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/80 px-5 text-center"><Activity className="mb-3 h-7 w-7 text-slate-500"/><p className="text-sm font-medium text-slate-300">No measured energy for this selection</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Import readings for a campus meter to see the energy trend. Forecasts and estimates are not included here.</p><Link to="/imports" className="mt-3 text-xs font-semibold text-emerald-300 hover:text-emerald-200">Open dataset imports <span aria-hidden="true">→</span></Link></div> :
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCons" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(value) => Number(value).toLocaleString()} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111b2b', borderColor: '#334155', borderRadius: '10px', fontSize: '12px' }}
                  formatter={(value: any, name: string) => [`${Number(value).toLocaleString()} kWh`, name]}
                />
                <Area type="monotone" dataKey="consumptionKwh" stroke="#10b981" fillOpacity={1} fill="url(#colorCons)" name="Load (kWh)" />
                <Area type="monotone" dataKey="solarKwh" stroke="#f59e0b" fillOpacity={1} fill="url(#colorSolar)" name="Solar (kWh)" />
              </AreaChart>
            </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Right: Building-Wise Share Pie Chart */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 sm:p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white mb-1">Building Consumption Distribution</h3>
            <p className="text-[11px] text-slate-400 mb-3">Facility share across campus infrastructure</p>
          </div>

          <div className="h-56 w-full">
            {loading ? <div className="h-full animate-pulse rounded-lg bg-slate-800/40" aria-label="Loading building comparison" /> : buildingComp.length === 0 ? <div className="flex h-full flex-col items-center justify-center text-center"><Building className="mb-2 h-7 w-7 text-slate-500"/><p className="text-xs font-medium text-slate-300">Building comparison unavailable</p><p className="mt-1 max-w-56 text-[11px] leading-4 text-slate-500">There are no measured readings for the selected source yet.</p></div> :
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={buildingComp}
                  dataKey="totalConsumptionKwh"
                  nameKey="buildingName"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                >
                  {buildingComp.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#111b2b', borderColor: '#334155', borderRadius: '10px', fontSize: '12px' }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()} kWh`, 'Consumption']}
                />
              </PieChart>
            </ResponsiveContainer>
            }
          </div>

          <div className="space-y-1.5 mt-2">
            {buildingComp.slice(0, 4).map((b, idx) => (
              <div key={b.buildingId} className="flex items-center justify-between text-xs">
                <span className="flex items-center space-x-1.5 text-slate-300 truncate max-w-[150px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                  <span className="truncate">{b.buildingName}</span>
                </span>
                <span className="font-mono text-slate-400 font-semibold">{b.totalConsumptionKwh?.toLocaleString()} kWh</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
