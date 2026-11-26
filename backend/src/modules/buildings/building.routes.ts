import { Router } from 'express';
import { getBuildings, createBuilding, getBuildingById, updateBuilding, deleteBuilding } from './building.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', getBuildings);
router.post('/', createBuilding);
router.get('/:id', getBuildingById);
router.put('/:id', updateBuilding);
router.delete('/:id', deleteBuilding);

export default router;
