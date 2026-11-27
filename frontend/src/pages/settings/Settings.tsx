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
  ShieldCheck,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'buildings' | 'tariffs' | 'members' | 'subscription'>('profile');

  // Profile Form
  const [orgName, setOrgName] = useState(user?.organization?.name || 'Organization');
  const [industry, setIndustry] = useState(user?.organization?.industryType || 'HIGHER_EDUCATION');
  const [timezone, setTimezone] = useState(user?.organization?.timezone || 'UTC');
  const [currency, setCurrency] = useState(user?.organization?.currency || 'USD');

  // Buildings list
  const [buildings, setBuildings] = useState<any[]>([]);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [newBldgName, setNewBldgName] = useState('');
  const [newBldgType, setNewBldgType] = useState('ACADEMIC');
  const [newBldgArea, setNewBldgArea] = useState('');
  const [newMeterNames, setNewMeterNames] = useState<Record<string, string>>({});
  const [newMeterTypes, setNewMeterTypes] = useState<Record<string, string>>({});
  const [meterMessages, setMeterMessages] = useState<Record<string, string>>({});

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [tariffEditor, setTariffEditor] = useState<any>({ tariffName: '', tariffType: 'FLAT', pricePerKwh: '', demandChargePerKw: '', demandWindowMinutes: 60, allowGridExport: false, exportPricePerKwh: '', fixedCharge: '', carbonEmissionKgPerKwh: '', periods: [] as any[] });
  const [editingTariffId, setEditingTariffId] = useState('');
  const [tariffMessage, setTariffMessage] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'VIEWER' });
  const [inviteToken, setInviteToken] = useState('');
  const [memberMessage, setMemberMessage] = useState('');
  const [subscription, setSubscription] = useState<any>(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const isOrgAdmin = ['ORG_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const canManageInfrastructure = ['ORG_ADMIN', 'ENERGY_MANAGER', 'FACILITY_MANAGER', 'SUPER_ADMIN'].includes(user?.role || '');

  useEffect(() => {
    fetchBuildings();
    fetchTariffs();
  }, []);

  useEffect(() => {
    if (activeTab === 'members') void fetchMembers();
    if (activeTab === 'subscription') void fetchSubscription();
  }, [activeTab, user?.organization?.id]);

  const fetchMembers = async () => {
    if (!user?.organization?.id) return;
    try {
      const [memberResponse, invitationResponse] = await Promise.all([
        api.get(`/organizations/${user.organization.id}/members`),
        isOrgAdmin ? api.get(`/organizations/${user.organization.id}/invitations`) : Promise.resolve({ data: { invitations: [] } }),
      ]);
      setMembers(memberResponse.data.members || []);
      setInvitations(invitationResponse.data.invitations || []);
    } catch (err: any) { setMemberMessage(err.response?.data?.error || 'Organization members could not be loaded.'); }
  };

  const inviteMember = async (event: React.FormEvent) => {
    event.preventDefault(); setInviteToken(''); setMemberMessage('');
    try {
      const result = await api.post(`/organizations/${user?.organization?.id}/invitations`, inviteForm);
      setInviteToken(result.data.invitation.token);
      setMemberMessage('Invitation created. Send this one-time token to the invitee using a secure channel.');
      setInviteForm({ email: '', role: 'VIEWER' }); await fetchMembers();
    } catch (err: any) { setMemberMessage(err.response?.data?.error || 'Invitation could not be created.'); }
  };

  const updateMemberRole = async (memberId: string, role: string) => {
    try { await api.patch(`/organizations/${user?.organization?.id}/members/${memberId}`, { role }); await fetchMembers(); }
    catch (err: any) { setMemberMessage(err.response?.data?.error || 'Role could not be updated.'); }
  };

  const deactivateMember = async (memberId: string) => {
    try { await api.delete(`/organizations/${user?.organization?.id}/members/${memberId}`); await fetchMembers(); }
    catch (err: any) { setMemberMessage(err.response?.data?.error || 'Membership could not be deactivated.'); }
  };

  const fetchSubscription = async () => {
    if (!user?.organization?.id) return;
    try { setSubscription((await api.get(`/organizations/${user.organization.id}/subscription`)).data); }
    catch (err: any) { setSubscriptionMessage(err.response?.data?.error || 'Subscription details could not be loaded.'); }
  };

  const scheduleCancellation = async () => {
    try {
      await api.post(`/organizations/${user?.organization?.id}/subscription/cancel`);
      setSubscriptionMessage('Cancellation scheduled. No payment provider is connected, so no payment was taken.');
      await fetchSubscription();
    } catch (err: any) { setSubscriptionMessage(err.response?.data?.error || 'Cancellation could not be scheduled.'); }
  };

  const fetchTariffs = async () => {
    if (!user?.organization?.id) return;
    try { const res = await api.get(`/organizations/${user.organization.id}`); setTariffs(res.data.organization?.tariffs || []); }
    catch (err) { console.error('Failed to load tariffs:', err); }
  };

  const selectTariffForEdit = (tariff: any) => {
    setEditingTariffId(tariff.id);
    setTariffEditor({ tariffName: tariff.tariffName, tariffType: tariff.tariffType, pricePerKwh: String(tariff.pricePerKwh),
      demandChargePerKw: tariff.demandChargePerKw == null ? '' : String(tariff.demandChargePerKw), demandWindowMinutes: tariff.demandWindowMinutes,
      allowGridExport: tariff.allowGridExport, exportPricePerKwh: tariff.exportPricePerKwh == null ? '' : String(tariff.exportPricePerKwh),
      fixedCharge: String(tariff.fixedCharge ?? 0), carbonEmissionKgPerKwh: tariff.carbonEmissionKgPerKwh == null ? '' : String(tariff.carbonEmissionKgPerKwh),
      periods: tariff.periods || [] });
  };

  const saveTariff = async (event: React.FormEvent) => {
    event.preventDefault(); setTariffMessage('');
    try {
      const payload = { ...tariffEditor, pricePerKwh: Number(tariffEditor.pricePerKwh),
        demandChargePerKw: tariffEditor.demandChargePerKw === '' ? null : Number(tariffEditor.demandChargePerKw),
        exportPricePerKwh: tariffEditor.allowGridExport ? Number(tariffEditor.exportPricePerKwh) : null,
        fixedCharge: Number(tariffEditor.fixedCharge || 0),
        carbonEmissionKgPerKwh: tariffEditor.carbonEmissionKgPerKwh === '' ? null : Number(tariffEditor.carbonEmissionKgPerKwh),
        periods: tariffEditor.tariffType === 'FLAT' ? [] : tariffEditor.periods.map((p: any) => ({ periodName: p.periodName, startTime: p.startTime, endTime: p.endTime, dayType: p.dayType, pricePerKwh: Number(p.pricePerKwh) })) };
      if (!user?.organization?.id) throw new Error('Organization context is unavailable.');
      if (editingTariffId) await api.put(`/organizations/${user.organization.id}/tariffs/${editingTariffId}`, payload);
      else await api.post(`/organizations/${user.organization.id}/tariffs`, payload);
      setTariffMessage('Tariff saved.'); setEditingTariffId(''); await fetchTariffs();
      setTariffEditor({ tariffName: '', tariffType: 'FLAT', pricePerKwh: '', demandChargePerKw: '', demandWindowMinutes: 60, allowGridExport: false, exportPricePerKwh: '', fixedCharge: '', carbonEmissionKgPerKwh: '', periods: [] });
    } catch (err: any) { setTariffMessage(err.response?.data?.error || err.message || 'Tariff could not be saved.'); }
  };

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

  const handleAddMeter = async (event: React.FormEvent, buildingId: string) => {
    event.preventDefault();
    const meterName = (newMeterNames[buildingId] || '').trim();
    if (!meterName) return;
    setMeterMessages((messages) => ({ ...messages, [buildingId]: '' }));
    try {
      await api.post(`/buildings/${buildingId}/meters`, { meterName, meterType: newMeterTypes[buildingId] || 'MAIN_FEEDER' });
      setNewMeterNames((names) => ({ ...names, [buildingId]: '' }));
      setMeterMessages((messages) => ({ ...messages, [buildingId]: 'Meter added. Select it in Dataset Imports to map source readings.' }));
      await fetchBuildings();
    } catch (err: any) {
      setMeterMessages((messages) => ({ ...messages, [buildingId]: err.response?.data?.error || 'Meter could not be added.' }));
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
      <nav aria-label="Organization settings" className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          aria-pressed={activeTab === 'profile'}
          onClick={() => setActiveTab('profile')}
          className={`flex min-h-10 items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'profile'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Organization Profile</span>
        </button>

        <button
          aria-pressed={activeTab === 'buildings'}
          onClick={() => setActiveTab('buildings')}
          className={`flex min-h-10 items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'buildings'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Buildings & Hierarchy ({buildings.length})</span>
        </button>

        <button
          aria-pressed={activeTab === 'tariffs'}
          onClick={() => setActiveTab('tariffs')}
          className={`flex min-h-10 items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'tariffs'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Electricity Tariffs</span>
        </button>

        <button aria-pressed={activeTab === 'members'} onClick={() => setActiveTab('members')}
          className={`flex min-h-10 items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'members' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
          <Users className="w-4 h-4" /><span>Users & Roles</span>
        </button>

        <button aria-pressed={activeTab === 'subscription'} onClick={() => setActiveTab('subscription')}
          className={`flex min-h-10 items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'subscription' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
          <DollarSign className="w-4 h-4" /><span>Plan & Usage</span>
        </button>
      </nav>

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
            {canManageInfrastructure && <form onSubmit={handleAddBuilding} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
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
            </form>}
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
                  <span>{b.meters?.length || 0} Meters</span>
                  <span>{b.solar?.length ? 'Solar Active' : 'No Solar'}</span>
                </div>
                {b.meters?.length > 0 && <ul className="space-y-1 text-[11px] text-slate-400">
                  {b.meters.map((meter: any) => <li key={meter.id}>{meter.meterName} · {meter.meterType}</li>)}
                </ul>}
                {canManageInfrastructure && <form onSubmit={(event) => void handleAddMeter(event, b.id)} className="grid grid-cols-[1fr_auto] gap-2 border-t border-slate-800 pt-3">
                  <input aria-label={`Meter name for ${b.name}`} required maxLength={120} value={newMeterNames[b.id] || ''}
                    onChange={(event) => setNewMeterNames((names) => ({ ...names, [b.id]: event.target.value }))}
                    placeholder="Meter name" className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
                  <select aria-label={`Meter type for ${b.name}`} value={newMeterTypes[b.id] || 'MAIN_FEEDER'}
                    onChange={(event) => setNewMeterTypes((types) => ({ ...types, [b.id]: event.target.value }))}
                    className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white">
                    <option value="MAIN_FEEDER">Main feeder</option><option value="SUB_METER">Sub-meter</option>
                    <option value="HVAC">HVAC</option><option value="LIGHTING">Lighting</option><option value="PLUG_LOAD">Plug load</option>
                  </select>
                  <button type="submit" className="col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-xs text-emerald-300 hover:bg-slate-700">Add meter</button>
                  {meterMessages[b.id] && <p role="status" className="col-span-2 text-[11px] text-emerald-300">{meterMessages[b.id]}</p>}
                </form>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Tariffs */}
      {activeTab === 'tariffs' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">Organization-configured import, export, demand and emissions terms. Optimization only uses rates effective across the selected forecast.</p>
          <form onSubmit={saveTariff} className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">{editingTariffId ? 'Edit tariff' : 'Add configured tariff'}</h3>{editingTariffId && <button type="button" onClick={() => { setEditingTariffId(''); setTariffEditor({ tariffName: '', tariffType: 'FLAT', pricePerKwh: '', demandChargePerKw: '', demandWindowMinutes: 60, allowGridExport: false, exportPricePerKwh: '', fixedCharge: '', carbonEmissionKgPerKwh: '', periods: [] }); }} className="text-xs text-slate-400">Cancel edit</button>}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input required value={tariffEditor.tariffName} onChange={e => setTariffEditor({ ...tariffEditor, tariffName: e.target.value })} placeholder="Tariff name" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
              <select value={tariffEditor.tariffType} onChange={e => setTariffEditor({ ...tariffEditor, tariffType: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value="FLAT">Flat</option><option value="TIME_OF_USE">Time of use</option><option value="DEMAND_PEAK">Demand peak</option></select>
              <input required type="number" min="0" step="any" value={tariffEditor.pricePerKwh} onChange={e => setTariffEditor({ ...tariffEditor, pricePerKwh: e.target.value })} placeholder={`Base price / ${currency} / kWh`} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
              <input type="number" min="0" step="any" value={tariffEditor.demandChargePerKw} onChange={e => setTariffEditor({ ...tariffEditor, demandChargePerKw: e.target.value })} placeholder={`Demand charge / ${currency} / kW`} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
              <select value={tariffEditor.demandWindowMinutes} onChange={e => setTariffEditor({ ...tariffEditor, demandWindowMinutes: Number(e.target.value) })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value={15}>15-minute demand window</option><option value={30}>30-minute demand window</option><option value={60}>60-minute demand window</option></select>
              <input type="number" min="0" step="any" value={tariffEditor.fixedCharge} onChange={e => setTariffEditor({ ...tariffEditor, fixedCharge: e.target.value })} placeholder={`Fixed charge / ${currency}`} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
              <input type="number" min="0" step="any" value={tariffEditor.carbonEmissionKgPerKwh} onChange={e => setTariffEditor({ ...tariffEditor, carbonEmissionKgPerKwh: e.target.value })} placeholder="Grid emissions kg / kWh" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={tariffEditor.allowGridExport} onChange={e => setTariffEditor({ ...tariffEditor, allowGridExport: e.target.checked })} />Grid export permitted by contract</label>
            {tariffEditor.allowGridExport && <input required type="number" min="0" step="any" value={tariffEditor.exportPricePerKwh} onChange={e => setTariffEditor({ ...tariffEditor, exportPricePerKwh: e.target.value })} placeholder={`Export compensation / ${currency} / kWh`} className="max-w-sm rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />}
            {tariffEditor.tariffType !== 'FLAT' && <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-xs text-slate-300">Tariff periods (organization local time)</span><button type="button" onClick={() => setTariffEditor({ ...tariffEditor, periods: [...tariffEditor.periods, { periodName: '', startTime: '00:00', endTime: '23:59', dayType: 'ALL', pricePerKwh: '' }] })} className="text-xs text-emerald-300">Add period</button></div>{tariffEditor.periods.map((period: any, index: number) => <div key={index} className="grid gap-2 sm:grid-cols-5"><input required value={period.periodName} onChange={e => setTariffEditor({ ...tariffEditor, periods: tariffEditor.periods.map((p: any, i: number) => i === index ? { ...p, periodName: e.target.value } : p) })} placeholder="Period name" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" /><input required type="time" value={period.startTime} onChange={e => setTariffEditor({ ...tariffEditor, periods: tariffEditor.periods.map((p: any, i: number) => i === index ? { ...p, startTime: e.target.value } : p) })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" /><input required type="text" placeholder="23:59 or 24:00" value={period.endTime} onChange={e => setTariffEditor({ ...tariffEditor, periods: tariffEditor.periods.map((p: any, i: number) => i === index ? { ...p, endTime: e.target.value } : p) })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" /><select value={period.dayType} onChange={e => setTariffEditor({ ...tariffEditor, periods: tariffEditor.periods.map((p: any, i: number) => i === index ? { ...p, dayType: e.target.value } : p) })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option>ALL</option><option>WEEKDAY</option><option>WEEKEND</option></select><div className="flex gap-1"><input required type="number" min="0" step="any" value={period.pricePerKwh} onChange={e => setTariffEditor({ ...tariffEditor, periods: tariffEditor.periods.map((p: any, i: number) => i === index ? { ...p, pricePerKwh: e.target.value } : p) })} placeholder="Price/kWh" className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" /><button type="button" onClick={() => setTariffEditor({ ...tariffEditor, periods: tariffEditor.periods.filter((_: any, i: number) => i !== index) })} className="px-2 text-rose-300">×</button></div></div>)}</div>}
            {tariffMessage && <p className="text-xs text-amber-300">{tariffMessage}</p>}
            <button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Save tariff</button>
          </form>
          {!tariffs.length && <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl text-sm text-slate-400">No tariff is configured. Cost optimization is unavailable until tariff values are provided.</div>}
          {tariffs.map(tariff => <div key={tariff.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
            <div className="flex justify-between"><h3 className="text-sm font-bold text-white">{tariff.tariffName}</h3><button onClick={() => selectTariffForEdit(tariff)} className="text-xs text-emerald-300">Edit</button></div><span className="text-xs text-emerald-300">{tariff.tariffType}</span>
            <div className="text-xs text-slate-300">Base rate: {currency} {tariff.pricePerKwh} / kWh · Effective from {new Date(tariff.effectiveFrom).toLocaleDateString()}{tariff.effectiveTo ? ` to ${new Date(tariff.effectiveTo).toLocaleDateString()}` : ''}</div>
            {tariff.periods?.map((period: any) => <div key={period.id} className="flex justify-between border-t border-slate-800 pt-2 text-xs"><span className="text-slate-300">{period.periodName} · {period.startTime}–{period.endTime} · {period.dayType}</span><span className="text-white">{currency} {period.pricePerKwh} / kWh</span></div>)}
            <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-3 text-xs text-slate-400"><span>Grid export: {tariff.allowGridExport ? `${currency} ${tariff.exportPricePerKwh}/kWh` : 'Not allowed'}</span><span>Demand charge: {tariff.demandChargePerKw == null ? 'Not configured' : `${currency} ${tariff.demandChargePerKw}/kW`}</span><span>Demand window: {tariff.demandWindowMinutes} min</span><span>Fixed charge: {currency} {tariff.fixedCharge}</span><span>Emissions factor: {tariff.carbonEmissionKgPerKwh == null ? 'Not configured' : `${tariff.carbonEmissionKgPerKwh} kg/kWh`}</span></div>
          </div>)}
        </div>
      )}

      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><h3 className="text-sm font-semibold text-white">Organization membership</h3></div>
            <p className="mb-4 text-xs text-slate-400">Roles apply only to this organization. Organization administrators cannot grant platform administration.</p>
            {memberMessage && <p className="mb-3 text-xs text-amber-300">{memberMessage}</p>}
            {inviteToken && <div className="mb-4 break-all rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-xs text-amber-200">One-time invitation token: {inviteToken}<br />It expires after 72 hours. Deliver it through a trusted channel.</div>}
            {isOrgAdmin && <form onSubmit={inviteMember} className="mb-5 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
              <input required type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="colleague@university.edu" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
              <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white">
                {['ENERGY_MANAGER', 'FACILITY_MANAGER', 'ANALYST', 'VIEWER'].map(role => <option key={role}>{role}</option>)}
              </select>
              <button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Create invitation</button>
            </form>}
            <div className="divide-y divide-slate-800">
              {members.map(member => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><div className="text-xs font-semibold text-white">{member.user.name}</div><div className="text-[11px] text-slate-400">{member.user.email} · {member.status}</div></div>
                <div className="flex items-center gap-2">
                  {isOrgAdmin ? <select aria-label={`Role for ${member.user.email}`} value={member.role} disabled={member.status !== 'ACTIVE'} onChange={e => void updateMemberRole(member.id, e.target.value)} className="rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white">
                    {['ORG_ADMIN', 'ENERGY_MANAGER', 'FACILITY_MANAGER', 'ANALYST', 'VIEWER', 'DEPT_MANAGER'].map(role => <option key={role}>{role}</option>)}
                  </select> : <span className="text-xs text-slate-300">{member.role}</span>}
                  {isOrgAdmin && member.status === 'ACTIVE' && <button onClick={() => void deactivateMember(member.id)} className="text-xs text-rose-300">Revoke</button>}
                </div>
              </div>)}
            </div>
          </div>
          {isOrgAdmin && invitations.length > 0 && <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">Invitations</h3>
            {invitations.map(invite => <div key={invite.id} className="flex justify-between border-t border-slate-800 py-3 text-xs"><span className="text-slate-300">{invite.email} · {invite.role} · expires {new Date(invite.expiresAt).toLocaleString()}</span><span className="text-slate-400">{invite.acceptedAt ? 'Accepted' : invite.revokedAt ? 'Revoked' : 'Pending'}</span></div>)}
          </div>}
        </div>
      )}

      {activeTab === 'subscription' && (
        <div className="max-w-3xl rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-2 text-sm font-semibold text-white">Subscription and usage</h3>
          <p className="mb-4 text-xs text-slate-400">Plan limits are enforced by the API. Billing is not connected; no charge or payment is simulated.</p>
          {subscriptionMessage && <p className="mb-3 text-xs text-amber-300">{subscriptionMessage}</p>}
          {subscription ? <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-950 p-3"><div className="text-[10px] uppercase text-slate-400">Plan</div><div className="mt-1 text-sm font-semibold text-white">{subscription.subscription.planKey}</div></div>
              <div className="rounded-lg bg-slate-950 p-3"><div className="text-[10px] uppercase text-slate-400">Status</div><div className="mt-1 text-sm font-semibold text-white">{subscription.subscription.status}</div></div>
              <div className="rounded-lg bg-slate-950 p-3"><div className="text-[10px] uppercase text-slate-400">Trial ends</div><div className="mt-1 text-sm font-semibold text-white">{subscription.subscription.trialEndsAt ? new Date(subscription.subscription.trialEndsAt).toLocaleDateString() : '—'}</div></div>
            </div>
            <div className="mt-4 divide-y divide-slate-800">
              {Object.entries(subscription.usage).map(([key, used]: [string, any]) => { const limit = subscription.entitlements[key]; return <div key={key} className="flex justify-between py-2 text-xs"><span className="text-slate-300">{key.replace(/([A-Z])/g, ' $1')}</span><span className="font-mono text-white">{used}{limit == null ? ' / unlimited' : ` / ${limit}`}</span></div>; })}
            </div>
            {isOrgAdmin && !subscription.subscription.cancelAtPeriodEnd && subscription.subscription.status !== 'CANCELED' && <button onClick={() => void scheduleCancellation()} className="mt-4 rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-300">Schedule cancellation</button>}
            {subscription.billingIntegration !== 'NOT_CONFIGURED' && <p className="mt-3 text-xs text-slate-400">Billing provider: {subscription.subscription.billingProvider}</p>}
          </> : <p className="text-xs text-slate-400">{subscriptionMessage || 'Loading subscription details…'}</p>}
        </div>
      )}
    </div>
  );
};
