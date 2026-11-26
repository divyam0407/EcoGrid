import { Router } from 'express';
import { getBatteries, createBattery, updateBattery, recordBatteryReading } from './battery.controller';
import { authenticate, requireOrganizationMembership, requireRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireOrganizationMembership);

router.get('/', getBatteries);
router.post('/', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), createBattery);
router.post('/:id/readings', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), recordBatteryReading);
router.put('/:id', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), updateBattery);

export default router;
