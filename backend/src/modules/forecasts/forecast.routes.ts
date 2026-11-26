import { Router } from 'express';
import { runForecast, getForecastHistory } from './forecast.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/run', runForecast);
router.get('/', getForecastHistory);

export default router;
