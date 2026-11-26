import { Router } from 'express';
import { getSolarOverview, createSolarInstallation } from './solar.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', getSolarOverview);
router.post('/', createSolarInstallation);

export default router;
