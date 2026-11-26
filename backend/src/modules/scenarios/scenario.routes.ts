import { Router } from 'express';
import { getScenarios, createAndRunScenario } from './scenario.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', getScenarios);
router.post('/run', createAndRunScenario);

export default router;
