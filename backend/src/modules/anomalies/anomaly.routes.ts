import { Router } from 'express';
import { detectAnomalies, getAnomalies, updateAnomalyStatus } from './anomaly.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/detect', detectAnomalies);
router.get('/', getAnomalies);
router.put('/:id/status', updateAnomalyStatus);

export default router;
