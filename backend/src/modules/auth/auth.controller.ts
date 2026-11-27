import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, createHmac, randomBytes } from 'crypto';
import { prisma, config } from '../../config';

const REFRESH_COOKIE = 'ecogrid_refresh';
const REFRESH_TTL_MS = config.refreshTokenDays * 24 * 60 * 60 * 1000;
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
const ipHash = (req: Request) => req.ip ? createHmac('sha256', config.jwtSecret).update(req.ip).digest('hex') : null;
const issueAccessToken = (user: { id: string; email: string; name: string; tokenVersion: number }, organizationId: string, role: string) => jwt.sign({
  id: user.id, email: user.email, name: user.name, organizationId, role, tokenVersion: user.tokenVersion,
  typ: 'access',
}, config.jwtSecret, { expiresIn: config.accessTokenSeconds, issuer: 'ecogrid-api', audience: 'ecogrid-client' });
const readCookie = (req: Request, name: string) => {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
};
const setRefreshCookie = (res: Response, token: string) => res.cookie(REFRESH_COOKIE, token, {
  httpOnly: true, secure: config.nodeEnv === 'production', sameSite: config.cookieSameSite,
  path: '/api/v1/auth', maxAge: REFRESH_TTL_MS,
});
const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, {
  httpOnly: true, secure: config.nodeEnv === 'production', sameSite: config.cookieSameSite, path: '/api/v1/auth',
});
const newRefreshToken = () => randomBytes(48).toString('base64url');
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const validPassword = (password: string) => password.length >= 12 && password.length <= 128;

async function logSecurityEvent(req: Request, organizationId: string, userId: string, action: string) {
  await prisma.auditLog.create({ data: { organizationId, userId, action, entityType: 'AUTHENTICATION',
    requestId: req.requestId, ipHash: ipHash(req) } });
}

export const register = async (req: Request, res: Response) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const organizationName = typeof req.body.organizationName === 'string' ? req.body.organizationName.trim() : '';
    const industryType = typeof req.body.industryType === 'string' ? req.body.industryType : 'HIGHER_EDUCATION';
    if (!name || name.length > 120 || !validEmail(email) || !organizationName || organizationName.length > 160) {
      return res.status(400).json({ error: 'Enter a valid name, email and organization name.' });
    }
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be between 12 and 128 characters.' });
    if (!['HIGHER_EDUCATION', 'MANUFACTURING', 'HOSPITAL', 'COMMERCIAL'].includes(industryType)) return res.status(400).json({ error: 'Unsupported organization type.' });
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return res.status(409).json({ error: 'Registration could not be completed.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const refreshToken = newRefreshToken();
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: organizationName, industryType, currency: 'USD', timezone: 'UTC' } });
      const user = await tx.user.create({ data: { name, email, passwordHash, status: 'ACTIVE' } });
      const member = await tx.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'ORG_ADMIN', status: 'ACTIVE' } });
      const subscription = await tx.organizationSubscription.create({ data: { organizationId: org.id, planKey: 'STARTER', status: 'TRIALING', trialEndsAt } });
      await tx.subscriptionEvent.create({ data: { organizationId: org.id, subscriptionId: subscription.id, actorUserId: user.id, eventType: 'TRIAL_STARTED' } });
      await tx.refreshSession.create({ data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) } });
      await tx.auditLog.create({ data: { organizationId: org.id, userId: user.id, action: 'AUTH_REGISTER', entityType: 'ORGANIZATION', entityId: org.id,
        requestId: req.requestId, ipHash: ipHash(req) } });
      return { org, user, member };
    });
    setRefreshCookie(res, refreshToken);
    const token = issueAccessToken(result.user, result.org.id, result.member.role);
    return res.status(201).json({ message: 'Registration successful.', token, user: {
      id: result.user.id, name: result.user.name, email: result.user.email, role: result.member.role,
      organization: { id: result.org.id, name: result.org.name, industryType: result.org.industryType,
        currency: result.org.currency, timezone: result.org.timezone, tier: result.org.tier, isBenchmark: result.org.isBenchmark },
      organizations: [{ id: result.org.id, name: result.org.name, role: result.member.role }],
    } });
  } catch {
    return res.status(500).json({ error: 'Registration could not be completed.', requestId: req.requestId });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!validEmail(email) || !password || password.length > 128) return res.status(400).json({ error: 'Email or password is invalid.' });
    const user = await prisma.user.findUnique({ where: { email }, include: {
      memberships: { where: { status: 'ACTIVE' }, include: { organization: true }, orderBy: { createdAt: 'asc' } },
    } });
    if (!user || user.status !== 'ACTIVE' || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const membership = user.memberships[0];
    if (!membership) return res.status(403).json({ error: 'User does not belong to an active organization.' });
    const refreshToken = newRefreshToken();
    await prisma.$transaction([
      prisma.refreshSession.create({ data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) } }),
      prisma.auditLog.create({ data: { organizationId: membership.organizationId, userId: user.id, action: 'AUTH_LOGIN', entityType: 'USER', entityId: user.id,
        requestId: req.requestId, ipHash: ipHash(req) } }),
    ]);
    setRefreshCookie(res, refreshToken);
    const role = user.isPlatformAdmin ? 'SUPER_ADMIN' : membership.role;
    return res.json({ message: 'Login successful.', token: issueAccessToken(user, membership.organizationId, role), user: {
      id: user.id, name: user.name, email: user.email, role,
      organization: { id: membership.organization.id, name: membership.organization.name, industryType: membership.organization.industryType,
        currency: membership.organization.currency, timezone: membership.organization.timezone, tier: membership.organization.tier,
        isBenchmark: membership.organization.isBenchmark },
      organizations: user.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: user.isPlatformAdmin ? 'SUPER_ADMIN' : m.role })),
    } });
  } catch {
    return res.status(500).json({ error: 'Login could not be completed.', requestId: req.requestId });
  }
};

export const refresh = async (req: Request, res: Response) => {
  const rawToken = readCookie(req, REFRESH_COOKIE);
  if (!rawToken) { clearRefreshCookie(res); return res.status(401).json({ error: 'Refresh session is unavailable.' }); }
  try {
    const existing = await prisma.refreshSession.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: {
      user: { include: { memberships: { where: { status: 'ACTIVE' }, include: { organization: true }, orderBy: { createdAt: 'asc' } } } },
    } });
    if (!existing || existing.revokedAt || existing.expiresAt <= new Date() || existing.user.status !== 'ACTIVE') {
      if (existing?.userId) await prisma.refreshSession.updateMany({ where: { userId: existing.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Refresh session is invalid or expired.' });
    }
    const nextToken = newRefreshToken();
    const rotated = await prisma.$transaction(async (tx) => {
      const claim = await tx.refreshSession.updateMany({ where: { id: existing.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
      if (!claim.count) return false;
      await tx.refreshSession.create({ data: { userId: existing.userId, tokenHash: hashToken(nextToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), rotatedFromId: existing.id } });
      return true;
    });
    const membership = existing.user.memberships[0];
    if (!rotated || !membership) { clearRefreshCookie(res); return res.status(401).json({ error: 'Refresh session is invalid or expired.' }); }
    setRefreshCookie(res, nextToken);
    const role = existing.user.isPlatformAdmin ? 'SUPER_ADMIN' : membership.role;
    return res.json({ token: issueAccessToken(existing.user, membership.organizationId, role), user: {
      id: existing.user.id, name: existing.user.name, email: existing.user.email, role,
      organization: { id: membership.organization.id, name: membership.organization.name, industryType: membership.organization.industryType,
        currency: membership.organization.currency, timezone: membership.organization.timezone },
      organizations: existing.user.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: existing.user.isPlatformAdmin ? 'SUPER_ADMIN' : m.role })),
    } });
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh session is invalid or expired.' });
  }
};

export const logout = async (req: Request, res: Response) => {
  const rawToken = readCookie(req, REFRESH_COOKIE);
  if (rawToken) await prisma.refreshSession.updateMany({ where: { tokenHash: hashToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  clearRefreshCookie(res);
  return res.status(204).end();
};

export const switchOrganization = async (req: Request, res: Response) => {
  const organizationId = typeof req.body.organizationId === 'string' ? req.body.organizationId : '';
  if (!organizationId || !req.user) return res.status(400).json({ error: 'An organization is required.' });
  const [user, organization, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, tokenVersion: true, isPlatformAdmin: true, status: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, industryType: true, currency: true, timezone: true, tier: true, isBenchmark: true } }),
    prisma.organizationMember.findFirst({ where: { userId: req.user.id, organizationId, status: 'ACTIVE' } }),
  ]);
  if (!user || user.status !== 'ACTIVE' || !organization || (!membership && !user.isPlatformAdmin)) return res.status(404).json({ error: 'Organization is unavailable.' });
  const role = user.isPlatformAdmin ? 'SUPER_ADMIN' : membership!.role;
  return res.json({ token: issueAccessToken(user, organization.id, role), user: {
    id: user.id, name: user.name, email: user.email, role, organization,
  } });
};

export const me = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    const [user, membership] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, isPlatformAdmin: true, status: true,
        memberships: { where: { status: 'ACTIVE' }, include: { organization: true }, orderBy: { createdAt: 'asc' } } } }),
      prisma.organizationMember.findFirst({ where: { userId: req.user.id, organizationId: req.user.organizationId, status: 'ACTIVE' }, include: { organization: true } }),
    ]);
    if (!user || user.status !== 'ACTIVE') return res.status(404).json({ error: 'User not found.' });
    const active = membership?.organization || (user.isPlatformAdmin ? await prisma.organization.findUnique({ where: { id: req.user.organizationId } }) : null);
    if (!active) return res.status(403).json({ error: 'Active organization membership is required.' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: req.user.role, organization: active,
      organizations: user.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: user.isPlatformAdmin ? 'SUPER_ADMIN' : m.role })) } });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch user profile.', requestId: req.requestId });
  }
};

export const updatePlatformAccount = async (req: Request, res: Response) => {
  const userId = String(req.params.userId || '');
  const hasPlatformFlag = typeof req.body.isPlatformAdmin === 'boolean';
  const hasStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');
  if ((!hasPlatformFlag && !hasStatus) || (hasStatus && !['ACTIVE', 'DEACTIVATED'].includes(String(req.body.status)))) {
    return res.status(400).json({ error: 'Provide a platform-admin flag or an ACTIVE/DEACTIVATED account status.' });
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, include: { memberships: { where: { status: 'ACTIVE' } } } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const demotingLastPlatformAdmin = req.body.isPlatformAdmin === false && target.isPlatformAdmin &&
    await prisma.user.count({ where: { isPlatformAdmin: true, status: 'ACTIVE' } }) <= 1;
  if (demotingLastPlatformAdmin || (req.body.status === 'DEACTIVATED' && target.isPlatformAdmin &&
    await prisma.user.count({ where: { isPlatformAdmin: true, status: 'ACTIVE' } }) <= 1)) {
    return res.status(409).json({ error: 'At least one active platform administrator must remain.' });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: target.id }, data: {
      ...(typeof req.body.isPlatformAdmin === 'boolean' ? { isPlatformAdmin: req.body.isPlatformAdmin } : {}),
      ...(req.body.status ? { status: req.body.status } : {}), tokenVersion: { increment: 1 },
    }, select: { id: true, name: true, email: true, status: true, isPlatformAdmin: true, tokenVersion: true } });
    await tx.refreshSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
    for (const membership of target.memberships) await tx.auditLog.create({ data: { organizationId: membership.organizationId,
      userId: req.user!.id, action: 'PLATFORM_ACCOUNT_CHANGED', entityType: 'USER', entityId: target.id, requestId: req.requestId,
      metadataJson: JSON.stringify({ status: user.status, isPlatformAdmin: user.isPlatformAdmin }) } });
    return user;
  });
  return res.json({ user: { id: updated.id, name: updated.name, email: updated.email, status: updated.status, isPlatformAdmin: updated.isPlatformAdmin } });
};
