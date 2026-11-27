import { Router } from 'express';
import { getBuildings, createBuilding, getBuildingById, updateBuilding, deleteBuilding, createBuildingMeter } from './building.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { requireEntitlement } from '../organizations/subscription.service';

const router = Router();
router.use(authenticate);

router.get('/', getBuildings);
router.post('/', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER', 'FACILITY_MANAGER']), requireEntitlement('buildings'), createBuilding);
router.get('/:id', getBuildingById);
router.put('/:id', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER', 'FACILITY_MANAGER']), updateBuilding);
router.delete('/:id', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER', 'FACILITY_MANAGER']), deleteBuilding);
router.post('/:id/meters', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER', 'FACILITY_MANAGER']), requireEntitlement('meters'), createBuildingMeter);

export default router;
