import { Router } from 'express';
import { getRooms, createRoom, updateRoom } from './room.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', getRooms);
router.post('/', createRoom);
router.put('/:id', updateRoom);

export default router;
