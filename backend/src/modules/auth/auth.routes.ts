import { Router } from 'express';
import { register, login, me, logout, refresh, switchOrganization, updatePlatformAccount } from './auth.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rate-limit';
import { acceptInvitationForExistingUser, acceptInvitationForNewUser } from '../organizations/membership.controller';

const router = Router();

router.post('/register', rateLimit({ windowMs: 60 * 60_000, max: 5 }), register);
router.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 10 }), login);
router.post('/refresh', rateLimit({ windowMs: 60_000, max: 30 }), refresh);
router.post('/logout', logout);
router.post('/switch-organization', authenticate, switchOrganization);
router.patch('/platform/users/:userId', authenticate, requireRole(['SUPER_ADMIN']), updatePlatformAccount);
router.post('/invitations/accept', authenticate, acceptInvitationForExistingUser);
router.post('/invitations/accept-new', rateLimit({ windowMs: 60 * 60_000, max: 5 }), acceptInvitationForNewUser);
router.get('/me', authenticate, me);

export default router;
