import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  BatteryCharging,
  Zap,
  ShieldCheck,
  TrendingDown,
  Activity,
  Layers,
  Sliders,
} from 'lucide-react';

export const BatteryManagement: React.FC = () => {
  const [batteries, setBatteries] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchBatteries();
  }, []);

  const fetchBatteries = async () => {
    setLoading(true);
    try {
      const res = await api.get('/batteries');
      setBatteries(res.data.batteries || []);
    } catch (err) {
      console.error('Failed to load batteries:', err);
    } finally {
      setLoading(false);
    }
  };

  const primaryBatt = batteries[0] || {
    name: 'Main Campus Tesla Megapack Bank',
    capacityKwh: 200,
    maxChargeKw: 50,
    maxDischargeKw: 50,
    minSoc: 20,
    maxSoc: 190,
    chargingEfficiency: 0.94,
    dischargingEfficiency: 0.94,
    degradationCost: 0.012,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Battery Energy Storage Management</h1>
        <p className="text-xs text-slate-400">
          Electrochemical storage dispatch, state of charge bounds, cycle degradation tracking & peak load shaving
        </p>
      </div>

      {/* Main Battery Status Card */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <BatteryCharging className="w-7 h-7 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{primaryBatt.name}</h2>
              <p className="text-xs text-slate-400">Integrated Lithium Iron Phosphate (LFP) Storage</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Online & Automated</span>
            </span>
          </div>
        </div>

        {/* State of Charge Large Gauge */}
        <div className="bg-slate-850 p-5 rounded-xl border border-slate-800 mb-6">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-2">
            <span>Current State of Charge (SOC)</span>
            <span className="text-emerald-400 font-mono text-base font-bold">78.5% (157.0 kWh)</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-3 rounded-full transition-all duration-500" style={{ width: '78.5%' }}></div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-mono">
            <span>Min Safe Limit: {primaryBatt.minSoc} kWh (10%)</span>
            <span>Current Reserve: 157 kWh</span>
            <span>Max Capacity: {primaryBatt.capacityKwh} kWh (100%)</span>
          </div>
        </div>

        {/* Technical Operating Parameters Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-sans text-slate-400 block mb-1">Max Charge Power</span>
            <span className="text-sm font-bold text-white">{primaryBatt.maxChargeKw} kW</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-sans text-slate-400 block mb-1">Max Discharge Power</span>
            <span className="text-sm font-bold text-white">{primaryBatt.maxDischargeKw} kW</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-sans text-slate-400 block mb-1">Round-Trip Efficiency</span>
            <span className="text-sm font-bold text-emerald-400">
              {(primaryBatt.chargingEfficiency * primaryBatt.dischargingEfficiency * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-sans text-slate-400 block mb-1">Degradation Cost</span>
            <span className="text-sm font-bold text-slate-300">${primaryBatt.degradationCost}/kWh</span>
          </div>
        </div>
      </div>
    </div>
  );
};
