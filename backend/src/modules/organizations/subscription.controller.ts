import { Request, Response } from 'express';
import { prisma } from '../../config';
import { getUsage, plans } from './subscription.service';

const inScope = (req: Request) => req.user?.role === 'SUPER_ADMIN' || req.params.id === req.user?.organizationId;

export const getOrganizationSubscription = async (req: Request, res: Response) => {
  if (!inScope(req)) return res.status(404).json({ error: 'Organization not found.' });
  const subscription = await prisma.organizationSubscription.findUnique({ where: { organizationId: req.params.id } });
  if (!subscription) return res.status(404).json({ error: 'Subscription is not configured.' });
  const plan = plans[subscription.planKey as keyof typeof plans];
  if (!plan) return res.status(500).json({ error: 'Subscription plan configuration is invalid.' });
  return res.json({ subscription: { planKey: subscription.planKey, status: subscription.status, trialEndsAt: subscription.trialEndsAt,
    currentPeriodStart: subscription.currentPeriodStart, currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, canceledAt: subscription.canceledAt,
    billingProvider: subscription.billingProvider, invoiceReference: subscription.invoiceReference },
    entitlements: plan, usage: await getUsage(req.params.id), billingIntegration: 'NOT_CONFIGURED' });
};

export const scheduleSubscriptionCancellation = async (req: Request, res: Response) => {
  if (!inScope(req)) return res.status(404).json({ error: 'Organization not found.' });
  const subscription = await prisma.organizationSubscription.findUnique({ where: { organizationId: req.params.id } });
  if (!subscription) return res.status(404).json({ error: 'Subscription is not configured.' });
  if (subscription.status === 'CANCELED') return res.status(409).json({ error: 'Subscription is already canceled.' });
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organizationSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true } });
    await tx.subscriptionEvent.create({ data: { organizationId: req.params.id, subscriptionId: row.id, actorUserId: req.user!.id,
      eventType: 'CANCELLATION_SCHEDULED' } });
    await tx.auditLog.create({ data: { organizationId: req.params.id, userId: req.user!.id, action: 'SUBSCRIPTION_CANCELLATION_SCHEDULED',
      entityType: 'ORGANIZATION_SUBSCRIPTION', entityId: row.id, requestId: req.requestId } });
    return row;
  });
  return res.json({ subscription: { status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    currentPeriodEnd: updated.currentPeriodEnd }, billingIntegration: 'NOT_CONFIGURED' });
};
