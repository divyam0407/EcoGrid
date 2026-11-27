import { Request, Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, config } from '../../config';

const roles = ['ORG_ADMIN', 'ENERGY_MANAGER', 'FACILITY_MANAGER', 'ANALYST', 'VIEWER', 'DEPT_MANAGER'];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const accessToken = (user: any, organizationId: string, role: string) => jwt.sign({ id: user.id, email: user.email, name: user.name,
  organizationId, role, tokenVersion: user.tokenVersion, typ: 'access' }, config.jwtSecret,
  { expiresIn: config.accessTokenSeconds, issuer: 'ecogrid-api', audience: 'ecogrid-client' });
const scopeMatches = (req: Request) => req.user?.role === 'SUPER_ADMIN' || req.user?.organizationId === req.params.id;

export const listOrganizationMembers = async (req: Request, res: Response) => {
  if (!scopeMatches(req)) return res.status(404).json({ error: 'Organization not found.' });
  const members = await prisma.organizationMember.findMany({ where: { organizationId: req.params.id }, include: {
    user: { select: { id: true, name: true, email: true, status: true, createdAt: true } },
  }, orderBy: { createdAt: 'asc' } });
  return res.json({ members: members.map(({ user, ...membership }) => ({ ...membership, user })) });
};

export const changeMemberRole = async (req: Request, res: Response) => {
  if (!scopeMatches(req)) return res.status(404).json({ error: 'Organization not found.' });
  const role = String(req.body.role || '');
  if (!roles.includes(role) || role === 'SUPER_ADMIN') return res.status(400).json({ error: 'Choose a supported organization role.' });
  const membership = await prisma.organizationMember.findFirst({ where: { id: req.params.memberId, organizationId: req.params.id } });
  if (!membership) return res.status(404).json({ error: 'Membership not found.' });
  if (membership.role === 'ORG_ADMIN' && role !== 'ORG_ADMIN') {
    const admins = await prisma.organizationMember.count({ where: { organizationId: req.params.id, role: 'ORG_ADMIN', status: 'ACTIVE' } });
    if (admins <= 1) return res.status(409).json({ error: 'An organization must retain at least one active administrator.' });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organizationMember.update({ where: { id: membership.id }, data: { role } });
    await tx.auditLog.create({ data: { organizationId: req.params.id, userId: req.user!.id, action: 'MEMBER_ROLE_CHANGED',
      entityType: 'ORGANIZATION_MEMBER', entityId: row.id, requestId: req.requestId,
      metadataJson: JSON.stringify({ priorRole: membership.role, assignedRole: role }) } });
    return row;
  });
  return res.json({ membership: updated });
};

export const deactivateOrganizationMember = async (req: Request, res: Response) => {
  if (!scopeMatches(req)) return res.status(404).json({ error: 'Organization not found.' });
  const membership = await prisma.organizationMember.findFirst({ where: { id: req.params.memberId, organizationId: req.params.id } });
  if (!membership) return res.status(404).json({ error: 'Membership not found.' });
  if (membership.role === 'ORG_ADMIN' && membership.status === 'ACTIVE') {
    const admins = await prisma.organizationMember.count({ where: { organizationId: req.params.id, role: 'ORG_ADMIN', status: 'ACTIVE' } });
    if (admins <= 1) return res.status(409).json({ error: 'An organization must retain at least one active administrator.' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({ where: { id: membership.id }, data: { status: 'INACTIVE' } });
    await tx.auditLog.create({ data: { organizationId: req.params.id, userId: req.user!.id, action: 'MEMBER_ACCESS_REVOKED',
      entityType: 'ORGANIZATION_MEMBER', entityId: membership.id, requestId: req.requestId } });
  });
  return res.status(204).end();
};

export const createOrganizationInvitation = async (req: Request, res: Response) => {
  if (!scopeMatches(req)) return res.status(404).json({ error: 'Organization not found.' });
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const role = String(req.body.role || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !roles.includes(role) || role === 'SUPER_ADMIN') {
    return res.status(400).json({ error: 'A valid email and supported organization role are required.' });
  }
  const existing = await prisma.organizationMember.findFirst({ where: { organizationId: req.params.id, user: { email }, status: 'ACTIVE' } });
  if (existing) return res.status(409).json({ error: 'This user is already an active organization member.' });
  const pending = await prisma.organizationInvitation.findFirst({ where: { organizationId: req.params.id, email, acceptedAt: null,
    revokedAt: null, expiresAt: { gt: new Date() } } });
  if (pending) return res.status(409).json({ error: 'A pending invitation already exists for this email.' });
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const invitation = await prisma.$transaction(async (tx) => {
    const created = await tx.organizationInvitation.create({ data: { organizationId: req.params.id, email, role,
      tokenHash: hash(token), invitedById: req.user!.id, expiresAt } });
    await tx.auditLog.create({ data: { organizationId: req.params.id, userId: req.user!.id, action: 'MEMBER_INVITED',
      entityType: 'ORGANIZATION_INVITATION', entityId: created.id, requestId: req.requestId, metadataJson: JSON.stringify({ email, role, expiresAt }) } });
    return created;
  });
  // The one-time token is returned only to an authorized administrator because no mail provider is configured.
  return res.status(201).json({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role,
    expiresAt: invitation.expiresAt, token, delivery: 'MANUAL_SECURE_DELIVERY_REQUIRED' } });
};

export const listOrganizationInvitations = async (req: Request, res: Response) => {
  if (!scopeMatches(req)) return res.status(404).json({ error: 'Organization not found.' });
  const invitations = await prisma.organizationInvitation.findMany({ where: { organizationId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true } });
  return res.json({ invitations });
};

export const revokeOrganizationInvitation = async (req: Request, res: Response) => {
  if (!scopeMatches(req)) return res.status(404).json({ error: 'Organization not found.' });
  const result = await prisma.organizationInvitation.updateMany({ where: { id: req.params.invitationId, organizationId: req.params.id,
    acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!result.count) return res.status(404).json({ error: 'Pending invitation not found.' });
  await prisma.auditLog.create({ data: { organizationId: req.params.id, userId: req.user!.id, action: 'INVITATION_REVOKED',
    entityType: 'ORGANIZATION_INVITATION', entityId: req.params.invitationId, requestId: req.requestId } });
  return res.status(204).end();
};

async function acceptInvitation(token: string, userId: string, email: string, res: Response) {
  const invitation = await prisma.organizationInvitation.findUnique({ where: { tokenHash: hash(token) } });
  if (!invitation || invitation.email !== email || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    return res.status(400).json({ error: 'Invitation is invalid or expired.' });
  }
  try {
    const membership = await prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (!claimed.count) throw new Error('Invitation is invalid or expired.');
      const member = await tx.organizationMember.upsert({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
        update: { role: invitation.role, status: 'ACTIVE' }, create: { organizationId: invitation.organizationId, userId, role: invitation.role, status: 'ACTIVE' } });
      await tx.auditLog.create({ data: { organizationId: invitation.organizationId, userId, action: 'INVITATION_ACCEPTED',
        entityType: 'ORGANIZATION_INVITATION', entityId: invitation.id } });
      return member;
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, tokenVersion: true } });
    return res.json({ token: accessToken(user, invitation.organizationId, membership.role), organizationId: invitation.organizationId });
  } catch {
    return res.status(400).json({ error: 'Invitation is invalid or expired.' });
  }
}

export const acceptInvitationForExistingUser = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (typeof req.body.token !== 'string') return res.status(400).json({ error: 'Invitation token is required.' });
  return acceptInvitation(req.body.token, req.user.id, req.user.email.toLowerCase(), res);
};

export const acceptInvitationForNewUser = async (req: Request, res: Response) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!token || !name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: 'Valid invitation, name, email and a 12-character password are required.' });
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return res.status(409).json({ error: 'Sign in first to accept this invitation.' });
  const invitation = await prisma.organizationInvitation.findUnique({ where: { tokenHash: hash(token) } });
  if (!invitation || invitation.email !== email || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    return res.status(400).json({ error: 'Invitation is invalid or expired.' });
  }
  const userId = randomUUID();
  const refreshToken = randomBytes(48).toString('base64url');
  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (!claimed.count) throw new Error('Invitation is invalid or expired.');
      const user = await tx.user.create({ data: { id: userId, name, email, passwordHash: await bcrypt.hash(password, 12) } });
      await tx.organizationMember.create({ data: { organizationId: invitation.organizationId, userId, role: invitation.role, status: 'ACTIVE' } });
      await tx.refreshSession.create({ data: { userId, tokenHash: hash(refreshToken), expiresAt: new Date(Date.now() + config.refreshTokenDays * 86400000) } });
      await tx.auditLog.create({ data: { organizationId: invitation.organizationId, userId, action: 'INVITATION_ACCEPTED', entityType: 'ORGANIZATION_INVITATION', entityId: invitation.id } });
      return user;
    });
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: invitation.organizationId }, select: { id: true, name: true, industryType: true, currency: true, timezone: true, tier: true, isBenchmark: true } });
    res.cookie('ecogrid_refresh', refreshToken, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: config.cookieSameSite,
      path: '/api/v1/auth', maxAge: config.refreshTokenDays * 86400000 });
    return res.status(201).json({ token: accessToken(result, invitation.organizationId, invitation.role), user: {
      id: result.id, name: result.name, email: result.email, role: invitation.role, organization, organizations: [{ id: organization.id, name: organization.name, role: invitation.role }],
    } });
  } catch {
    return res.status(400).json({ error: 'Invitation is invalid or expired.' });
  }
};
