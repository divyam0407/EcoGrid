import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';

import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { Dashboard } from './pages/dashboard/Dashboard';
import { EnergyMonitoring } from './pages/energy/EnergyMonitoring';
import { LiveMonitoring } from './pages/energy/LiveMonitoring';
import { OperationalIntelligence } from './pages/operations/OperationalIntelligence';
import { DemandForecasting } from './pages/forecasting/DemandForecasting';
import { AnomalyDetection } from './pages/anomalies/AnomalyDetection';
import { EnergyOptimization } from './pages/optimization/EnergyOptimization';
import { SolarManagement } from './pages/solar/SolarManagement';
import { BatteryManagement } from './pages/batteries/BatteryManagement';
import { Recommendations } from './pages/recommendations/Recommendations';
import { DigitalTwin } from './pages/digital-twin/DigitalTwin';
import { Reports } from './pages/reports/Reports';
import { Settings } from './pages/settings/Settings';
import { DataImports } from './pages/imports/DataImports';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping mr-2"></span>
        Loading EcoGrid Workspace...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="energy" element={<EnergyMonitoring />} />
            <Route path="live-monitoring" element={<LiveMonitoring />} />
            <Route path="imports" element={<DataImports />} />
            <Route path="operations" element={<OperationalIntelligence />} />
            <Route path="forecasting" element={<DemandForecasting />} />
            <Route path="anomalies" element={<AnomalyDetection />} />
            <Route path="optimization" element={<EnergyOptimization />} />
            <Route path="solar" element={<SolarManagement />} />
            <Route path="batteries" element={<BatteryManagement />} />
            <Route path="recommendations" element={<Recommendations />} />
            <Route path="digital-twin" element={<DigitalTwin />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
