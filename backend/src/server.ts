import app from './app';
import { config } from './config';
import { startForecastTrainingWorker } from './modules/forecasts/forecast-training.worker';

const PORT = config.port;

app.listen(PORT, () => {
  startForecastTrainingWorker();
  console.log(`===============================================`);
  console.log(` EcoGrid Backend Service running on port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Python Service: ${config.pythonServiceUrl}`);
  console.log(` Health endpoint: http://localhost:${PORT}/health`);
  console.log(`===============================================`);
});
