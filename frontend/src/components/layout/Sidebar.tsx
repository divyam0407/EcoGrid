import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  CalendarClock,
  TrendingUp,
  AlertTriangle,
  Cpu,
  SunMedium,
  BatteryCharging,
  Lightbulb,
  Boxes,
  FileSpreadsheet,
  Upload,
  Settings,
  Zap,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { label: 'Overview', to: '/', icon: LayoutDashboard },
    { label: 'Energy Monitoring', to: '/energy', icon: Activity },
    { label: 'Dataset Imports', to: '/imports', icon: Upload },
    { label: 'Operational Intelligence', to: '/operations', icon: CalendarClock, highlight: true },
    { label: 'Demand Forecasting', to: '/forecasting', icon: TrendingUp },
    { label: 'Anomaly Detection', to: '/anomalies', icon: AlertTriangle },
    { label: 'Energy Optimization', to: '/optimization', icon: Cpu },
    { label: 'Solar Management', to: '/solar', icon: SunMedium },
    { label: 'Battery Management', to: '/batteries', icon: BatteryCharging },
    { label: 'Recommendations', to: '/recommendations', icon: Lightbulb },
    { label: 'Campus Digital Twin', to: '/digital-twin', icon: Boxes },
    { label: 'Reports & Carbon', to: '/reports', icon: FileSpreadsheet },
    { label: 'Settings', to: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-40 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-950">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-lg font-bold tracking-tight text-white flex items-center">
            Eco<span className="text-emerald-400">Grid</span>
          </span>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-medium">
            Operational Intelligence
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-3 pb-2">
          Platform Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/20 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.highlight && (
                <span className="ml-auto text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded uppercase">
                  Core
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer System Status */}
      <div className="p-3 border-t border-slate-800">
        <div className="bg-slate-850 rounded-lg p-2.5 border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Engines Online</span>
            </span>
            <span className="text-emerald-400 font-mono text-[10px]">MILP + XGB</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Postgres + FastAPI Intelligence Connected
          </div>
        </div>
      </div>
    </aside>
  );
};
