import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Settings as SettingsIcon,
  Building2,
  DollarSign,
  Users,
  Plus,
  Save,
  CheckCircle2,
  Layers,
  MapPin,
  Clock,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'buildings' | 'tariffs'>('profile');

  // Profile Form
  const [orgName, setOrgName] = useState(user?.organization?.name || 'ABC University (DEMO)');
  const [industry, setIndustry] = useState(user?.organization?.industryType || 'HIGHER_EDUCATION');
  const [timezone, setTimezone] = useState(user?.organization?.timezone || 'America/New_York');
  const [currency, setCurrency] = useState(user?.organization?.currency || 'USD');

  // Buildings list
  const [buildings, setBuildings] = useState<any[]>([]);
  const [newBldgName, setNewBldgName] = useState('');
  const [newBldgType, setNewBldgType] = useState('ACADEMIC');
  const [newBldgArea, setNewBldgArea] = useState('');

  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchBuildings();
  }, []);

  const fetchBuildings = async () => {
    try {
      const res = await api.get('/buildings');
      setBuildings(res.data.buildings || []);
    } catch (err) {
      console.error('Failed to load buildings:', err);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (user?.organization?.id) {
        await api.put(`/organizations/${user.organization.id}`, {
          name: orgName,
          industryType: industry,
          timezone,
          currency,
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save profile:', err);
    }
  };

  const handleAddBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBldgName) return;
    try {
      await api.post('/buildings', {
        name: newBldgName,
        buildingType: newBldgType,
        totalArea: newBldgArea ? parseFloat(newBldgArea) : null,
      });
      setNewBldgName('');
      setNewBldgArea('');
      fetchBuildings();
    } catch (err) {
      console.error('Failed to add building:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Organization & Infrastructure Settings</h1>
        <p className="text-xs text-slate-400">
          Configure organization profiles, multi-tier building hierarchies, electricity tariffs and role policies
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'profile'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Organization Profile</span>
        </button>

        <button
          onClick={() => setActiveTab('buildings')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'buildings'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Buildings & Hierarchy ({buildings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tariffs')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'tariffs'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Electricity Tariffs</span>
        </button>
      </div>

      {/* Tab 1: Profile */}
      {activeTab === 'profile' && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-2xl space-y-4">
          <h3 className="text-sm font-bold text-white">General Information</h3>

          {saveSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-lg flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Organization settings updated successfully.</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 block mb-1 font-semibold">Organization Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
              />
            </div>

            <div>
              <label className="text-slate-300 block mb-1 font-semibold">Industry Vertical</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
              >
                <option value="HIGHER_EDUCATION">Colleges and Universities</option>
                <option value="MANUFACTURING">Manufacturing and Industrial</option>
                <option value="HOSPITAL">Hospitals and Healthcare</option>
                <option value="COMMERCIAL">Commercial Buildings and Offices</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Accounting Currency</label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Buildings */}
      {activeTab === 'buildings' && (
        <div className="space-y-6">
          {/* Add Building Form */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Register New Building / Facility
            </h3>
            <form onSubmit={handleAddBuilding} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <input
                  type="text"
                  placeholder="Building Name"
                  required
                  value={newBldgName}
                  onChange={(e) => setNewBldgName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <select
                  value={newBldgType}
                  onChange={(e) => setNewBldgType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="ACADEMIC">Academic Block</option>
                  <option value="LAB">Laboratory / Research</option>
                  <option value="LIBRARY">Library</option>
                  <option value="RESIDENTIAL">Hostel / Residential</option>
                  <option value="AUDITORIUM">Auditorium / Hall</option>
                </select>
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Area (sq ft)"
                  value={newBldgArea}
                  onChange={(e) => setNewBldgArea(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold p-2 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Building</span>
                </button>
              </div>
            </form>
          </div>

          {/* Buildings List */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {buildings.map((b) => (
              <div key={b.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">{b.name}</h4>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded uppercase">
                    {b.buildingType}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Total Floor Area: <strong className="text-slate-200 font-mono">{b.totalArea?.toLocaleString() || '45,000'} sq ft</strong>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                  <span>{b.rooms?.length || 0} Sub-Rooms</span>
                  <span>{b.meters?.length || 1} Meters</span>
                  <span>{b.solar?.length ? 'Solar Active' : 'No Solar'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Tariffs */}
      {activeTab === 'tariffs' && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4 max-w-2xl">
          <h3 className="text-sm font-bold text-white">Configured Electricity Tariff Structure</h3>
          <p className="text-xs text-slate-400">
            Time-of-Use (TOU) billing periods driving the mathematical cost optimization solver
          </p>

          <div className="space-y-2 text-xs font-mono">
            <div className="bg-slate-850 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-blue-400 font-bold block">OFF_PEAK NIGHT</span>
                <span className="text-slate-400 text-[11px]">00:00 - 06:00 (All Days)</span>
              </div>
              <span className="text-emerald-400 font-bold text-sm">$0.08 / kWh</span>
            </div>

            <div className="bg-slate-850 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-emerald-400 font-bold block">STANDARD DAY</span>
                <span className="text-slate-400 text-[11px]">06:00 - 14:00 (All Days)</span>
              </div>
              <span className="text-slate-200 font-bold text-sm">$0.15 / kWh</span>
            </div>

            <div className="bg-slate-850 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-rose-400 font-bold block">PEAK DEMAND WINDOW</span>
                <span className="text-slate-400 text-[11px]">14:00 - 20:00 (Highest Grid Rate)</span>
              </div>
              <span className="text-rose-400 font-bold text-sm">$0.28 / kWh</span>
            </div>

            <div className="bg-slate-850 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-emerald-400 font-bold block">STANDARD EVENING</span>
                <span className="text-slate-400 text-[11px]">20:00 - 24:00 (All Days)</span>
              </div>
              <span className="text-slate-200 font-bold text-sm">$0.14 / kWh</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
