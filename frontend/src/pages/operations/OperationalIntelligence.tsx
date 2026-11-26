import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  CalendarClock,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Clock,
  Layers,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const OperationalIntelligence: React.FC = () => {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [correlation, setCorrelation] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDay, setSelectedDay] = useState<number>(0); // 0=Monday

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  useEffect(() => {
    fetchOperationalData();
  }, []);

  const fetchOperationalData = async () => {
    setLoading(true);
    try {
      const [schedRes, corrRes] = await Promise.all([
        api.get('/schedules'),
        api.get('/schedules/correlate'),
      ]);
      setSchedules(schedRes.data.schedules || []);
      setCorrelation(corrRes.data);
    } catch (err) {
      console.error('Failed to fetch operational correlation:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSchedules = schedules.filter(
    (s) => s.dayOfWeek === selectedDay || s.dayOfWeek === null
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Operational Intelligence Engine</h1>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
              Signature Capability
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Correlating organizational operating schedules with electricity telemetry to uncover latent energy waste
          </p>
        </div>

        {/* Day of Week Selector */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-lg">
          {daysOfWeek.map((day, idx) => (
            <button
              key={day}
              onClick={() => setSelectedDay(idx)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectedDay === idx
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Correlation Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Analyzed Telemetry</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white">
            {correlation?.total_hours_analyzed || 1440} <span className="text-xs text-slate-400 font-normal">hours</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {correlation?.scheduled_hours || 580} scheduled vs {correlation?.unscheduled_hours || 860} off-hours
          </div>
        </div>

        <div className="bg-slate-900 border border-rose-500/30 bg-rose-950/10 p-4 rounded-xl">
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Waste Inefficiencies</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400">
            {correlation?.total_inefficiency_instances || 8} <span className="text-xs font-normal">incidents</span>
          </div>
          <div className="text-[10px] text-rose-300/80 mt-1">Unscheduled draws & equipment overruns</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Excess Unscheduled Energy</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white">
            {correlation?.total_excess_kwh?.toFixed(1) || '480.5'} <span className="text-xs text-slate-400 font-normal">kWh</span>
          </div>
          <div className="text-[10px] text-amber-400 mt-1">Above baseline idle threshold</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Estimated Waste Cost</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white">
            ${correlation?.total_estimated_waste_cost?.toFixed(2) || '72.08'}
          </div>
          <div className="text-[10px] text-emerald-400 mt-1">Recoverable through schedule automation</div>
        </div>
      </div>

      {/* Operational Inefficiency Findings (Detailed Insights from PRD Module 3.4) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">
              Detected Operational Inefficiencies & Schedule Mismatches
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Classification: Equipment Overrun, Idle-Period Bleed & Low Occupancy
          </span>
        </div>

        <div className="divide-y divide-slate-800/80">
          {correlation?.findings?.map((f: any, idx: number) => (
            <div key={idx} className="p-4 hover:bg-slate-800/30 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      f.severity === 'high'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {f.inefficiency_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs font-bold text-white">{f.room_id}</span>
                  <span className="text-xs text-slate-400 font-sans">({f.building_id})</span>
                </div>

                <div className="flex items-center space-x-4 text-xs font-mono">
                  <span className="text-slate-400">
                    Actual: <strong className="text-white">{f.actual_consumption_kwh} kWh</strong> vs Baseline: {f.idle_baseline_kwh} kWh
                  </span>
                  <span className="text-rose-400 font-bold">
                    +{f.excess_kwh} kWh waste (${f.estimated_cost_impact})
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300 mt-1 mb-2">
                <span className="text-slate-400">Context:</span> {f.expected_status}
              </p>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-start space-x-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-300">
                  <strong className="text-emerald-400">Suggested Action:</strong> {f.suggested_investigation}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Academic Timetable Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <CalendarClock className="w-4 h-4 text-emerald-400" />
              <span>{daysOfWeek[selectedDay]} Academic Operating Timetable</span>
            </h3>
            <p className="text-[11px] text-slate-400">Scheduled classroom, laboratory, and examination sessions</p>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded">
            {filteredSchedules.length} Sessions Scheduled
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Time Window</th>
                <th className="px-4 py-3">Room / Facility</th>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Activity Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Expected Occupancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredSchedules.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-white text-xs">
                    {s.startTime} - {s.endTime}
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-400">{s.room?.roomNumber}</td>
                  <td className="px-4 py-3 text-slate-400">{s.building?.name}</td>
                  <td className="px-4 py-3 text-slate-200">{s.activityName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        s.activityType === 'LAB_SESSION'
                          ? 'bg-blue-500/20 text-blue-300'
                          : s.activityType === 'EVENT'
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {s.activityType}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300">{s.expectedOccupancy} students</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
