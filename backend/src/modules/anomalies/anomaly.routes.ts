import { Router } from 'express';
import { detectAnomalies, getAnomalies, updateAnomalyStatus } from './anomaly.controller';
import { authenticate, requireOrg } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireOrg, async (req, res, next) => {
  try {
    const { prisma } = await import('../../config');
    const member = await prisma.organizationMember.findFirst({ where: { userId: req.user!.id, organizationId: req.user!.organizationId } });
    if (!member) return res.status(403).json({ error: 'Active organization membership is required.' });
    next();
  } catch (error) { next(error); }
});

router.post('/detect', detectAnomalies);
router.get('/', getAnomalies);
router.put('/:id/status', updateAnomalyStatus);

export default router;
