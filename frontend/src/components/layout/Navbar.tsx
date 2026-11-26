import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Sparkles, Building2, User, LogOut, Bell, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  onOpenAssistant: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAssistant }) => {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
          <Building2 className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-300">
            {user?.organization?.name || 'ABC University (DEMO)'}
          </span>
          <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">
            Higher Ed
          </span>
        </div>

        <div className="hidden sm:flex items-center space-x-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>DEMO DATASET ACTIVE</span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* AI Energy Assistant button */}
        <button
          onClick={onOpenAssistant}
          className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-sm shadow-emerald-900/40 transition-all duration-150"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Energy Assistant</span>
        </button>

        {/* User profile dropdown / info */}
        <div className="flex items-center space-x-3 pl-3 border-l border-slate-800">
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
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
