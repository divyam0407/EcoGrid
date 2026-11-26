import { Router } from 'express';
import { getEnergyReport } from './report.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/energy', getEnergyReport);

export default router;
