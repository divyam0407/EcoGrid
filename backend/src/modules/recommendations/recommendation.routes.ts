import { Router } from 'express';
import { prisma } from '../../config';
import { authenticate, requireOrg, requireRole } from '../../middleware/auth';
import { addRecommendationNote, assignRecommendation, completeRecommendation, getRecommendation, listMeasurements, listRecommendationAssignees, listRecommendations, measureRecommendation, recommendationHistory, recommendationSummary, recordImplementation, refreshRecommendations, updateStatus } from './recommendation.controller';

const router = Router();
router.use(authenticate, requireOrg, async (req, res, next) => {
  if (req.user?.role === 'SUPER_ADMIN') return next();
  try {
    const member = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: req.user!.organizationId, userId: req.user!.id } }, select: { role: true } });
    if (!member) return res.status(403).json({ error: 'Active organization membership is required.' });
    req.user!.role = member.role;
    next();
  } catch { res.status(500).json({ error: 'Organization authorization could not be verified.' }); }
});
router.get('/summary', recommendationSummary);
router.get('/assignees', listRecommendationAssignees);
router.post('/refresh', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), refreshRecommendations);
router.get('/', listRecommendations);
router.get('/:id/history', recommendationHistory);
router.get('/:id/measurements', listMeasurements);
router.post('/:id/measurements', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), measureRecommendation);
router.get('/:id', getRecommendation);
router.put('/:id/status', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), updateStatus);
router.patch('/:id/assignment', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), assignRecommendation);
router.patch('/:id/implementation', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), recordImplementation);
router.post('/:id/notes', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), addRecommendationNote);
router.patch('/:id/completion', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), completeRecommendation);
export default router;
