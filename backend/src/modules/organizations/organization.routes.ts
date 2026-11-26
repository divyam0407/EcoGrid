import { Router } from 'express';
import { getOrganizations, getOrganizationById, updateOrganization } from './organization.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', getOrganizations);
router.get('/:id', getOrganizationById);
router.put('/:id', updateOrganization);

export default router;
