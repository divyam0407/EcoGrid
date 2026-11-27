import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Sparkles, Building2, LogOut, ShieldCheck, Menu } from 'lucide-react';

interface NavbarProps {
  onOpenAssistant: () => void;
  onToggleNavigation: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAssistant, onToggleNavigation }) => {
  const { user, logout, switchOrganization } = useAuth();
  const [switching, setSwitching] = useState(false);
  const changeOrganization = async (organizationId: string) => {
    if (!organizationId || organizationId === user?.organization?.id) return;
    setSwitching(true);
    try { await switchOrganization(organizationId); } finally { setSwitching(false); }
  };

  return (
    <header className="min-w-0 h-16 bg-slate-950/95 backdrop-blur border-b border-slate-800/90 flex items-center justify-between gap-2 px-3 sm:px-6 sticky top-0 z-30">
      <div className="min-w-0 flex items-center space-x-2 sm:space-x-3">
        <button type="button" onClick={onToggleNavigation} aria-label="Toggle navigation menu" className="md:hidden shrink-0 rounded-lg p-2 text-slate-300 hover:bg-slate-800">
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0 h-10 flex items-center space-x-2 bg-slate-900 border border-slate-800 px-2.5 sm:px-3 rounded-lg">
          <Building2 className="w-4 h-4 shrink-0 text-emerald-400" />
          {user?.organizations && user.organizations.length > 1 ? (
            <select aria-label="Active organization" value={user.organization?.id || ''} disabled={switching}
              onChange={(event) => void changeOrganization(event.target.value)}
              className="max-w-40 sm:max-w-56 bg-transparent text-xs font-medium text-slate-200 focus:outline-none">
              {user.organizations.map((organization) => <option key={organization.id} value={organization.id} className="bg-slate-900">{organization.name}</option>)}
            </select>
          ) : <span className="max-w-32 sm:max-w-none truncate text-xs font-medium text-slate-200">{user?.organization?.name || 'Organization'}</span>}
        </div>

        {(user?.organization?.isBenchmark || user?.organization?.tier === 'DEMO_SANDBOX' || user?.organization?.tier === 'RESEARCH_BENCHMARK') && <div className="hidden sm:flex items-center space-x-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-md">
          <span>{user.organization.isBenchmark ? 'BENCHMARK DATA' : 'DEMO DATA'}</span>
        </div>}
      </div>

      <div className="shrink-0 flex items-center space-x-2 sm:space-x-4">
        {/* AI Energy Assistant button */}
        <button
          onClick={onOpenAssistant}
          aria-label="Open AI Energy Assistant"
          className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold px-2.5 sm:px-3.5 py-2 rounded-lg transition-colors duration-150"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">AI Energy Assistant</span>
        </button>

        {/* User profile dropdown / info */}
        <div className="flex items-center space-x-2 sm:space-x-3 pl-2 sm:pl-3 border-l border-slate-800">
          <div aria-hidden="true" className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-[11px] font-semibold text-slate-200">
            {(user?.name || 'U').trim().slice(0, 1).toUpperCase()}
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200">{user?.name || 'User'}</div>
            <div className="text-[11px] text-slate-400 flex items-center justify-end space-x-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>{user?.role || 'ENERGY_MANAGER'}</span>
            </div>
          </div>

          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out of EcoGrid"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
