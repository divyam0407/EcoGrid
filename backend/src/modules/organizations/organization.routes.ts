import { Router } from 'express';
import { getOrganizations, getOrganizationById, updateOrganization } from './organization.controller';
import { createTariff, updateTariff } from './tariff.controller';
import { authenticate, requireOrganizationMembership, requireRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireOrganizationMembership);

router.get('/', getOrganizations);
router.get('/:id', getOrganizationById);
router.put('/:id', updateOrganization);
router.post('/:id/tariffs', requireRole(['ORG_ADMIN']), createTariff);
router.put('/:id/tariffs/:tariffId', requireRole(['ORG_ADMIN']), updateTariff);

export default router;
