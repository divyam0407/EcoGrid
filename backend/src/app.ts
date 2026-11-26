import express from 'express';
import cors from 'cors';
import { config } from './config';

import authRoutes from './modules/auth/auth.routes';
import organizationRoutes from './modules/organizations/organization.routes';
import buildingRoutes from './modules/buildings/building.routes';
import departmentRoutes from './modules/departments/department.routes';
import roomRoutes from './modules/rooms/room.routes';
import energyRoutes from './modules/energy/energy.routes';
import scheduleRoutes from './modules/schedules/schedule.routes';
import forecastRoutes from './modules/forecasts/forecast.routes';
import anomalyRoutes from './modules/anomalies/anomaly.routes';
import optimizationRoutes from './modules/optimization/optimization.routes';
import solarRoutes from './modules/solar/solar.routes';
import batteryRoutes from './modules/batteries/battery.routes';
import recommendationRoutes from './modules/recommendations/recommendation.routes';
import scenarioRoutes from './modules/scenarios/scenario.routes';
import reportRoutes from './modules/reports/report.routes';
import assistantRoutes from './modules/assistant/assistant.routes';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ecogrid-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/buildings', buildingRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/energy', energyRoutes);
app.use('/api/v1/schedules', scheduleRoutes);
app.use('/api/v1/forecast', forecastRoutes);
app.use('/api/v1/anomalies', anomalyRoutes);
app.use('/api/v1/optimization', optimizationRoutes);
app.use('/api/v1/solar', solarRoutes);
app.use('/api/v1/batteries', batteryRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/api/v1/scenarios', scenarioRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/assistant', assistantRoutes);

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

export default app;
