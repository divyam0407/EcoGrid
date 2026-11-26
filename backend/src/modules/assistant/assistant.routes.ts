import { Router } from 'express';
import { queryEnergyAssistant } from './assistant.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/query', queryEnergyAssistant);

export default router;
