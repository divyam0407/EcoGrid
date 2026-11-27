import { Router } from 'express';
import { getOrganizations, getOrganizationById, updateOrganization } from './organization.controller';
import { createTariff, updateTariff } from './tariff.controller';
import { changeMemberRole, createOrganizationInvitation, deactivateOrganizationMember, listOrganizationInvitations,
  listOrganizationMembers, revokeOrganizationInvitation } from './membership.controller';
import { getOrganizationSubscription, scheduleSubscriptionCancellation } from './subscription.controller';
import { requireEntitlement } from './subscription.service';
import { authenticate, requireOrganizationMembership, requireRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireOrganizationMembership);

router.get('/', getOrganizations);
router.get('/:id', getOrganizationById);
router.put('/:id', updateOrganization);
router.post('/:id/tariffs', requireRole(['ORG_ADMIN']), createTariff);
router.put('/:id/tariffs/:tariffId', requireRole(['ORG_ADMIN']), updateTariff);
router.get('/:id/members', requireRole(['ORG_ADMIN']), listOrganizationMembers);
router.patch('/:id/members/:memberId', requireRole(['ORG_ADMIN']), changeMemberRole);
router.delete('/:id/members/:memberId', requireRole(['ORG_ADMIN']), deactivateOrganizationMember);
router.get('/:id/invitations', requireRole(['ORG_ADMIN']), listOrganizationInvitations);
router.post('/:id/invitations', requireRole(['ORG_ADMIN']), requireEntitlement('users'), createOrganizationInvitation);
router.delete('/:id/invitations/:invitationId', requireRole(['ORG_ADMIN']), revokeOrganizationInvitation);
router.get('/:id/subscription', getOrganizationSubscription);
router.post('/:id/subscription/cancel', requireRole(['ORG_ADMIN']), scheduleSubscriptionCancellation);

export default router;
