import { Router } from 'express';
import { runForecast, getForecastHistory, getForecastOptions, requestForecastTraining, listForecastModels, getForecastModel, retryForecastTraining, activateForecastModel, getPredictionMonitoring } from './forecast.controller';
import { authenticate, requireOrg } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireOrg, async (req, res, next) => {
  try {
    const { prisma } = await import('../../config');
    const member = await prisma.organizationMember.findFirst({ where: { userId: req.user!.id, organizationId: req.user!.organizationId } });
    if (!member) return res.status(403).json({ error: 'Active organization membership is required.' });
    next();
  } catch (error) { next(error); }
});

router.get('/options', getForecastOptions);
router.post('/models/train', requestForecastTraining);
router.get('/models', listForecastModels);
router.get('/models/:modelId', getForecastModel);
router.post('/models/:modelId/retry', retryForecastTraining);
router.post('/models/:modelId/activate', activateForecastModel);
router.get('/monitoring', getPredictionMonitoring);
router.post('/run', runForecast);
router.get('/', getForecastHistory);

export default router;
