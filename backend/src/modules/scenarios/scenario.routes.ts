import { Router } from 'express';
import { getScenarios, createScenario, updateScenario, duplicateScenario, runScenario, compareScenarios } from './scenario.controller';
import { authenticate, requireOrganizationMembership, requireRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireOrganizationMembership);

router.get('/', getScenarios);
router.post('/', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), createScenario);
router.post('/compare', compareScenarios);
router.post('/:id/duplicate', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), duplicateScenario);
router.post('/:id/run', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), runScenario);
router.put('/:id', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), updateScenario);

export default router;
