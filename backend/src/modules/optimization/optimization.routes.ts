import { Router } from 'express';
import { runOptimization, getOptimizationHistory, getOptimizationRunById } from './optimization.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/run', runOptimization);
router.get('/history', getOptimizationHistory);
router.get('/:id', getOptimizationRunById);

export default router;
