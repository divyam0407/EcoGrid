import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { config } from './config';
import { prisma } from './config';
import { rateLimit } from './middleware/rate-limit';
import { getForecastWorkerHealth } from './modules/forecasts/forecast-training.worker';

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
import importRoutes from './modules/imports/import.routes';

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  maxAge: 600,
}));
app.use((req, res, next) => {
  const supplied = req.header('x-request-id');
  req.requestId = supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (config.nodeEnv === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const started = Date.now();
  res.on('finish', () => process.stdout.write(`${JSON.stringify({ level: 'info', event: 'http_request', requestId: req.requestId,
    method: req.method, path: req.path, statusCode: res.statusCode, durationMs: Date.now() - started })}\n`));
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ecogrid-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: 'ready', dependencies: { database: 'available' } });
  } catch {
    return res.status(503).json({ status: 'not_ready', dependencies: { database: 'unavailable' } });
  }
});

app.get('/health/worker', (_req, res) => {
  const worker = getForecastWorkerHealth();
  const healthy = worker.state === 'RUNNING' && (!worker.lastFailureAt || (worker.lastPollAt && worker.lastPollAt > worker.lastFailureAt));
  return res.status(healthy ? 200 : 503).json({ status: healthy ? 'healthy' : 'unavailable', worker });
});

// API Routes
app.use('/api/v1/auth', rateLimit({ windowMs: 60_000, max: 60 }), authRoutes);
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
app.use('/api/v1/imports', importRoutes);

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  process.stderr.write(`${JSON.stringify({ level: 'error', event: 'unhandled_api_error', requestId: req.requestId,
    method: req.method, path: req.path, errorType: err?.name || 'Error' })}\n`);
  res.status(500).json({ error: 'Internal server error.', requestId: req.requestId });
});

export default app;
