import app from './app';
import { config, prisma } from './config';
import { startForecastTrainingWorker } from './modules/forecasts/forecast-training.worker';

const PORT = config.port;
let stopWorker: (() => Promise<void>) | null = null;

const server = app.listen(PORT, () => {
  const worker = startForecastTrainingWorker();
  stopWorker = worker.stop;
  console.log(`===============================================`);
  console.log(` EcoGrid Backend Service running on port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Python Service: ${config.pythonServiceUrl}`);
  console.log(` Health endpoint: http://localhost:${PORT}/health`);
  console.log(`===============================================`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'shutdown_started', signal })}\n`);
  const forceTimer = setTimeout(() => process.exit(1), 25_000);
  forceTimer.unref();
  server.close(async () => {
    try {
      if (stopWorker) await stopWorker();
      await prisma.$disconnect();
      clearTimeout(forceTimer);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
