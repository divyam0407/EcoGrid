import { Router } from 'express';
import { runOptimization, getOptimizationHistory, getOptimizationRunById } from './optimization.controller';
import { authenticate, requireOrganizationMembership, requireRole } from '../../middleware/auth';
import { requireEntitlement } from '../organizations/subscription.service';

const router = Router();
router.use(authenticate, requireOrganizationMembership);

router.post('/run', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), requireEntitlement('optimizationRunsPerMonth'), runOptimization);
router.get('/history', getOptimizationHistory);
router.get('/:id', getOptimizationRunById);

export default router;
