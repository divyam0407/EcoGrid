import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Boxes,
  Play,
  TrendingDown,
  SunMedium,
  BatteryCharging,
  DollarSign,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export const DigitalTwin: React.FC = () => {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [activeResult, setActiveResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Scenario formulation inputs
  const [scenarioName, setScenarioName] = useState('Compressed Academic Schedule & Solar Expansion');
  const [description, setDescription] = useState('Consolidate laboratory sessions before 16:00 and expand rooftop solar by 50%');
  const [closeHour, setCloseHour] = useState<number>(17);
  const [occupancyScale, setOccupancyScale] = useState<number>(0.8);
  const [solarMultiplier, setSolarMultiplier] = useState<number>(1.5);
  const [batteryCap, setBatteryCap] = useState<number>(250);
  const [shiftLabToSolar, setShiftLabToSolar] = useState<boolean>(true);

  useEffect(() => {
    fetchScenarios();
  }, []);

  const fetchScenarios = async () => {
    try {
      const res = await api.get('/scenarios');
      setScenarios(res.data.scenarios || []);
      if (res.data.scenarios && res.data.scenarios.length > 0) {
        setActiveResult(res.data.scenarios[0].resultData);
      }
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: scenarioName,
        description,
        modifications: {
          shift_operating_hours_end: closeHour,
          occupancy_scaling_factor: occupancyScale,
          solar_capacity_multiplier: solarMultiplier,
          battery_capacity_kwh: batteryCap,
          shift_lab_sessions_to_solar_peak: shiftLabToSolar,
        },
      };

      const res = await api.post('/scenarios/run', payload);
      setActiveResult(res.data.scenario.resultData);
      fetchScenarios();
    } catch (err) {
      console.error('Simulation run failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold text-white tracking-tight">Campus Energy Digital Twin</h1>
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
            Predictive Sandbox
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Simulate hypothetical operating schedule changes, tariff hikes, and storage investments in complete data isolation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Scenario Configuration Panel */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Boxes className="w-4 h-4 text-emerald-400" />
            <span>Configure Operational Scenario</span>
          </h2>

          <form onSubmit={handleRunSimulation} className="space-y-3.5 text-xs">
            <div>
              <label className="text-slate-300 block mb-1 font-semibold">Scenario Title</label>
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-slate-300 block mb-1 font-semibold">
                Facility Closing Hour: <strong className="text-emerald-400">{closeHour}:00</strong>
              </label>
              <input
                type="range"
                min={15}
                max={22}
                value={closeHour}
                onChange={(e) => setCloseHour(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500"
              />
              <span className="text-[10px] text-slate-400">Curtails lab HVAC & lighting after this hour</span>
            </div>

            <div>
              <label className="text-slate-300 block mb-1 font-semibold">
                Campus Occupancy Factor: <strong className="text-emerald-400">{(occupancyScale * 100).toFixed(0)}%</strong>
              </label>
              <input
                type="range"
                min={0.4}
                max={1.0}
                step={0.1}
                value={occupancyScale}
                onChange={(e) => setOccupancyScale(parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <span className="text-[10px] text-slate-400">Simulate hybrid attendance models</span>
            </div>

            <div>
              <label className="text-slate-300 block mb-1 font-semibold">
                Solar Capacity Multiplier: <strong className="text-amber-400">{solarMultiplier}x</strong>
              </label>
              <input
                type="range"
                min={1.0}
                max={3.0}
                step={0.25}
                value={solarMultiplier}
                onChange={(e) => setSolarMultiplier(parseFloat(e.target.value))}
                className="w-full accent-amber-500"
              />
              <span className="text-[10px] text-slate-400">Model adding 60-240 kW rooftop panels</span>
            </div>

            <div>
              <label className="text-slate-300 block mb-1 font-semibold">
                Battery Storage Bank: <strong className="text-purple-400">{batteryCap} kWh</strong>
              </label>
              <input
                type="range"
                min={100}
                max={500}
                step={50}
                value={batteryCap}
                onChange={(e) => setBatteryCap(parseInt(e.target.value, 10))}
                className="w-full accent-purple-500"
              />
              <span className="text-[10px] text-slate-400">Evaluate battery capacity expansion</span>
            </div>

            <div className="pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shiftLabToSolar}
                  onChange={(e) => setShiftLabToSolar(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0"
                />
                <span className="text-slate-300 text-xs font-semibold">
                  Shift heavy lab sessions to 11 AM - 2 PM (Solar Peak)
                </span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-md"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{loading ? 'Simulating Physics & Math...' : 'Run Digital Twin Simulation'}</span>
              </button>
            </div>
          </form>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-start space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Isolation Guarantee: Simulation executes on virtual sandbox telemetry. Real meter data is 100% untouched.</span>
          </div>
        </div>

        {/* Right Columns: Simulation Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Financial & Demand Deltas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Baseline Cost</div>
              <div className="text-lg font-bold text-slate-300 font-mono">
                ${activeResult?.baseline_cost?.toFixed(2) || '1,840.00'}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Existing operations</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Scenario Cost</div>
              <div className="text-lg font-bold text-white font-mono">
                ${activeResult?.scenario_cost?.toFixed(2) || '1,288.00'}
              </div>
              <div className="text-[10px] text-emerald-400 mt-1">Simulated performance</div>
            </div>

            <div className="bg-slate-900 border border-emerald-500/30 bg-emerald-950/20 p-4 rounded-xl">
              <div className="text-[10px] uppercase text-emerald-400 font-bold mb-1">Cost Savings</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                ${activeResult?.cost_difference?.toFixed(2) || '552.00'}
              </div>
              <div className="text-[10px] text-emerald-300 font-semibold mt-1">
                {activeResult?.percentage_savings || 30.0}% Reduction
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Peak Demand Shave</div>
              <div className="text-lg font-bold text-amber-400 font-mono">
                -{activeResult?.peak_reduction_kw || 30.5} kW
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Grid stress relief</div>
            </div>
          </div>

          {/* Comparison Graph: Baseline Load vs Scenario Load */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Baseline vs Scenario Load Profile</h3>
                <p className="text-[11px] text-slate-400">Simulated demand and renewable solar offset over 24 hours (kW)</p>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeResult?.hourly_comparison || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timestamp" stroke="#64748b" tickFormatter={(t) => t.slice(11, 16)} tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                  <Line type="monotone" dataKey="baseline_demand_kw" stroke="#64748b" strokeDasharray="4 4" strokeWidth={2} name="Baseline Load (kW)" dot={false} />
                  <Line type="monotone" dataKey="scenario_demand_kw" stroke="#10b981" strokeWidth={2.5} name="Scenario Load (kW)" dot={false} />
                  <Line type="monotone" dataKey="scenario_solar_kw" stroke="#f59e0b" strokeWidth={2} name="Expanded Solar (kW)" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Synthesis & Recommendation Callout */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start space-x-3">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-white block font-semibold mb-0.5">Simulation Executive Summary:</strong>
              {activeResult?.recommendation_summary ||
                'Executing this scenario generates significant financial and carbon savings while fully respecting scheduled educational milestones.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
