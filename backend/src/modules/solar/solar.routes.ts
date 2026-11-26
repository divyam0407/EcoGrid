import { Router } from 'express';
import { getSolarOverview, createSolarInstallation } from './solar.controller';
import { authenticate, requireOrganizationMembership, requireRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireOrganizationMembership);

router.get('/', getSolarOverview);
router.post('/', requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), createSolarInstallation);

export default router;
