import { Router } from 'express';
import { getRecommendations, updateRecommendationStatus } from './recommendation.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', getRecommendations);
router.put('/:id/status', updateRecommendationStatus);

export default router;
