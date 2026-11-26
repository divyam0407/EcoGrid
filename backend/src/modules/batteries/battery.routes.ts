import { Router } from 'express';
import { getBatteries, createBattery, updateBattery } from './battery.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', getBatteries);
router.post('/', createBattery);
router.put('/:id', updateBattery);

export default router;
