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

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
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
    <>
      {isOpen && <button type="button" aria-label="Close navigation menu" onClick={onClose} className="fixed inset-0 z-30 bg-slate-950/70 md:hidden" />}
      <aside aria-label="Primary navigation" className={`w-64 max-w-[85vw] bg-slate-950 border-r border-slate-800/90 flex flex-col h-screen fixed left-0 top-0 z-40 select-none transition-transform duration-200 ${isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible md:translate-x-0 md:visible'}`}>
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800/90 space-x-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-lg font-semibold tracking-tight text-white flex items-center">
            Eco<span className="text-emerald-400">Grid</span>
          </span>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-medium">
            Operational Intelligence
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold px-3 pb-2">
          Workspace
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-400/10 text-emerald-300 font-semibold border border-emerald-400/15'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
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
      <div className="p-3 border-t border-slate-800/90">
        <div className="rounded-lg p-3 border border-slate-800/80 bg-slate-900/70">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
            <span>Campus energy workspace</span>
          </div>
          <div className="mt-1 text-[10px] leading-4 text-slate-500">
            Meter data, operations and optimization
          </div>
        </div>
      </div>
      </aside>
    </>
  );
};
