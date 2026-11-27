import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../config';

export const plans = {
  STARTER: { buildings: 3, meters: 10, users: 10, importsPerMonth: 20, forecastsPerMonth: 100, optimizationRunsPerMonth: 100, storageBytes: 5 * 1024 ** 3 },
  PROFESSIONAL: { buildings: 25, meters: 100, users: 100, importsPerMonth: 500, forecastsPerMonth: 2000, optimizationRunsPerMonth: 1000, storageBytes: 100 * 1024 ** 3 },
  ENTERPRISE: { buildings: null, meters: null, users: null, importsPerMonth: null, forecastsPerMonth: null, optimizationRunsPerMonth: null, storageBytes: null },
  LEGACY: { buildings: null, meters: null, users: null, importsPerMonth: null, forecastsPerMonth: null, optimizationRunsPerMonth: null, storageBytes: null },
} as const;

export type Entitlement = keyof typeof plans.STARTER;
const monthStart = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); };

export async function getUsage(organizationId: string) {
  const since = monthStart();
  const [buildings, meters, activeUsers, pendingInvitations, importsPerMonth, forecastsPerMonth, optimizationRunsPerMonth, stored] = await Promise.all([
    prisma.building.count({ where: { organizationId } }), prisma.meter.count({ where: { organizationId } }),
    prisma.organizationMember.count({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.organizationInvitation.count({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.dataImportBatch.count({ where: { organizationId, importedAt: { gte: since } } }),
    prisma.forecastModel.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.optimizationRun.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.importFile.aggregate({ where: { batch: { organizationId } }, _sum: { sizeBytes: true } }),
  ]);
  return { buildings, meters, users: activeUsers + pendingInvitations, importsPerMonth, forecastsPerMonth, optimizationRunsPerMonth, storageBytes: stored._sum.sizeBytes || 0 };
}

export function requireEntitlement(entitlement: Entitlement) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) return res.status(401).json({ error: 'Organization context is required.' });
      const subscription = await prisma.organizationSubscription.findUnique({ where: { organizationId } });
      const trialAllowed = subscription?.status === 'TRIALING' && Boolean(subscription.trialEndsAt && subscription.trialEndsAt > new Date());
      if (!subscription || (!['ACTIVE', 'LEGACY'].includes(subscription.status) && !trialAllowed)) {
        return res.status(402).json({ error: 'An active subscription or trial is required.', code: 'SUBSCRIPTION_REQUIRED' });
      }
      const plan = plans[subscription.planKey as keyof typeof plans];
      if (!plan) return res.status(402).json({ error: 'The subscription plan is not configured.', code: 'PLAN_UNAVAILABLE' });
      const limit = plan[entitlement];
      if (limit === null) return next();
      const usage = await getUsage(organizationId);
      if (usage[entitlement] >= limit) return res.status(429).json({ error: 'The organization has reached its plan limit.', code: 'ENTITLEMENT_LIMIT_REACHED', entitlement, limit, used: usage[entitlement] });
      return next();
    } catch { return res.status(503).json({ error: 'Subscription entitlement could not be verified.' }); }
  };
}
