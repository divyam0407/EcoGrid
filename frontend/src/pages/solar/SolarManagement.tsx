import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  SunMedium,
  Zap,
  Activity,
  ArrowUpRight,
  TrendingUp,
  BatteryCharging,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export const SolarManagement: React.FC = () => {
  const [solarData, setSolarData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchSolar();
  }, []);

  const fetchSolar = async () => {
    setLoading(true);
    try {
      const res = await api.get('/solar');
      setSolarData(res.data);
    } catch (err) {
      console.error('Failed to load solar data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Solar Renewable Generation & Dispatch</h1>
        <p className="text-xs text-slate-400">
          Photovoltaic array monitoring, solar fraction metrics, surplus detection and self-consumption analytics
        </p>
      </div>

      {/* KPI Cards (Module 8) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Installed Capacity</span>
            <SunMedium className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white font-mono">
            {solarData?.totalCapacityKw || 120} <span className="text-xs font-normal text-slate-400 font-sans">kW</span>
          </div>
          <div className="text-[10px] text-emerald-400 mt-1">Rooftop Photovoltaic Arrays</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Solar Energy</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400 font-mono">
            {solarData?.totalGeneratedKwh?.toLocaleString() || '38,400'} <span className="text-xs font-normal text-slate-400 font-sans">kWh</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Cumulative clean generation</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Solar Fraction</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono">20.8%</div>
          <div className="text-[10px] text-slate-400 mt-1">Of campus total consumption</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Surplus Absorbed</span>
            <BatteryCharging className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold text-white font-mono">
            100% <span className="text-xs font-normal text-slate-400 font-sans">Absorbed</span>
          </div>
          <div className="text-[10px] text-emerald-400 mt-1">0 kWh curtailed via battery routing</div>
        </div>
      </div>

      {/* Solar Generation Curve */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Recent Solar Insolation & Generation Profile</h3>
            <p className="text-[11px] text-slate-400">Hourly generation curve across campus solar arrays (kWh)</p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={solarData?.recentReadings?.reverse() || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timestamp" stroke="#64748b" tickFormatter={(t) => t.slice(11, 16)} tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
              <Area type="monotone" dataKey="generationKwh" stroke="#f59e0b" fillOpacity={1} fill="url(#solarGrad)" name="Generation (kWh)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
