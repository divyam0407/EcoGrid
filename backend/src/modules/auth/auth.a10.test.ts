import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, config } from '../../config';
import { authenticate, requireRole } from '../../middleware/auth';
import { login, logout, refresh, register, switchOrganization, updatePlatformAccount } from './auth.controller';
import { acceptInvitationForNewUser, changeMemberRole, createOrganizationInvitation, deactivateOrganizationMember } from '../organizations/membership.controller';
import { getOrganizationSubscription } from '../organizations/subscription.controller';
import { getUsage, requireEntitlement } from '../organizations/subscription.service';

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (!url || url.hostname !== '127.0.0.1' || url.pathname.replace(/^\//, '') !== 'ecogrid_a10_test') {
  throw new Error('A10 tests only run against local ecogrid_a10_test.');
}
let organizationId = '', otherOrganizationId = '', adminId = '', memberId = '', otherUserId = '', memberRecordId = '';
const invoke = async (handler: any, req: any) => {
  let status = 200; let body: any; const cookies: any[] = []; let ended = false;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; },
    cookie(name: string, value: string, options: any) { cookies.push({ name, value, options }); return this; },
    clearCookie(name: string) { cookies.push({ name, clear: true }); return this; }, end() { ended = true; return this; },
    setHeader() { return this; } };
  await handler(req, res);
  return { status, body, cookies, ended };
};

before(async () => {
  const org = await prisma.organization.create({ data: { name: 'A10 security test', timezone: 'UTC' } }); organizationId = org.id;
  const other = await prisma.organization.create({ data: { name: 'A10 isolation test', timezone: 'UTC' } }); otherOrganizationId = other.id;
  const passwordHash = await bcrypt.hash('correct horse battery staple', 12);
  const admin = await prisma.user.create({ data: { name: 'A10 Admin', email: 'a10-admin@example.invalid', passwordHash } }); adminId = admin.id;
  const member = await prisma.user.create({ data: { name: 'A10 Member', email: 'a10-member@example.invalid', passwordHash } }); memberId = member.id;
  const otherUser = await prisma.user.create({ data: { name: 'Other Tenant', email: 'a10-other@example.invalid', passwordHash } }); otherUserId = otherUser.id;
  await prisma.organizationMember.createMany({ data: [
    { organizationId, userId: adminId, role: 'ORG_ADMIN', status: 'ACTIVE' },
    { organizationId, userId: memberId, role: 'ANALYST', status: 'ACTIVE' },
    { organizationId: otherOrganizationId, userId: otherUserId, role: 'ORG_ADMIN', status: 'ACTIVE' },
  ] });
  memberRecordId = (await prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId, userId: memberId } } })).id;
  await prisma.organizationSubscription.createMany({ data: [
    { organizationId, planKey: 'STARTER', status: 'ACTIVE', billingProvider: 'UNCONFIGURED' },
    { organizationId: otherOrganizationId, planKey: 'STARTER', status: 'ACTIVE', billingProvider: 'UNCONFIGURED' },
  ] });
});

after(async () => {
  if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
  if (otherOrganizationId) await prisma.organization.delete({ where: { id: otherOrganizationId } });
  for (const id of [adminId, memberId, otherUserId]) if (id) await prisma.user.delete({ where: { id } });
  await prisma.$disconnect();
});

test('registration validates strong passwords and creates a time-limited trial', async () => {
  const weak = await invoke(register, { body: { name: 'New Admin', email: 'new@example.invalid', password: 'short', organizationName: 'New Campus' } });
  assert.equal(weak.status, 400);
  const created = await invoke(register, { body: { name: 'New Admin', email: 'new@example.invalid', password: 'a sufficiently long passphrase', organizationName: 'New Campus' }, requestId: 'a10-registration' });
  assert.equal(created.status, 201);
  assert.ok(created.cookies.some((c) => c.name === 'ecogrid_refresh' && c.options.httpOnly));
  const membership = await prisma.organizationMember.findFirstOrThrow({ where: { user: { email: 'new@example.invalid' }, status: 'ACTIVE' } });
  const subscription = await prisma.organizationSubscription.findUniqueOrThrow({ where: { organizationId: membership.organizationId } });
  assert.equal(subscription.status, 'TRIALING');
  assert.ok(subscription.trialEndsAt && subscription.trialEndsAt > new Date());
  await prisma.organization.delete({ where: { id: membership.organizationId } });
  await prisma.user.delete({ where: { email: 'new@example.invalid' } });
});

test('login, refresh rotation, logout and database-backed role revocation work', async () => {
  const loggedIn = await invoke(login, { body: { email: 'A10-ADMIN@example.invalid', password: 'correct horse battery staple' }, requestId: 'a10-login' });
  assert.equal(loggedIn.status, 200);
  const access = loggedIn.body.token;
  const firstRefresh = loggedIn.cookies.find((c) => c.name === 'ecogrid_refresh')?.value;
  assert.ok(firstRefresh);
  assert.ok((jwt.decode(access) as any).exp - (jwt.decode(access) as any).iat <= 900);
  let nextCalled = false;
  await authenticate({ headers: { authorization: `Bearer ${access}` } } as any, { status: (code: number) => ({ json: () => { throw new Error(`auth rejected ${code}`); } }) } as any, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  const rotated = await invoke(refresh, { headers: { cookie: `ecogrid_refresh=${firstRefresh}` } });
  assert.equal(rotated.status, 200);
  const secondRefresh = rotated.cookies.find((c) => c.name === 'ecogrid_refresh')?.value;
  assert.ok(secondRefresh && secondRefresh !== firstRefresh);
  const replay = await invoke(refresh, { headers: { cookie: `ecogrid_refresh=${firstRefresh}` } });
  assert.equal(replay.status, 401);
  const loggedOut = await invoke(logout, { headers: { cookie: `ecogrid_refresh=${secondRefresh}` } });
  assert.equal(loggedOut.status, 204);
  assert.equal(loggedOut.ended, true);
});

test('platform account updates reject unsupported status values', async () => {
  const response = await invoke(updatePlatformAccount, { params: { userId: adminId }, user: { id: adminId, role: 'SUPER_ADMIN' },
    body: { isPlatformAdmin: true, status: 'SUSPENDED_FOREVER' } });
  assert.equal(response.status, 400);
});

test('read-only members cannot invoke energy-manager operations', async () => {
  let status = 200; let nextCalled = false;
  requireRole(['ORG_ADMIN', 'ENERGY_MANAGER'])({ user: { id: memberId, role: 'VIEWER' } } as any,
    { status(code: number) { status = code; return this; }, json() { return this; } } as any, () => { nextCalled = true; });
  assert.equal(status, 403);
  assert.equal(nextCalled, false);
});

test('organization switching and access checks enforce membership and current database role', async () => {
  const denied = await invoke(switchOrganization, { user: { id: memberId, organizationId, role: 'ANALYST' }, body: { organizationId: otherOrganizationId } });
  assert.equal(denied.status, 404);
  await prisma.organizationMember.create({ data: { organizationId: otherOrganizationId, userId: memberId, role: 'VIEWER', status: 'ACTIVE' } });
  const switched = await invoke(switchOrganization, { user: { id: memberId, organizationId, role: 'ANALYST' }, body: { organizationId: otherOrganizationId } });
  assert.equal(switched.status, 200);
  assert.equal((jwt.decode(switched.body.token) as any).organizationId, otherOrganizationId);
  const changed = await invoke(changeMemberRole, { user: { id: adminId, organizationId, role: 'ORG_ADMIN' }, params: { id: organizationId, memberId: memberRecordId }, body: { role: 'FACILITY_MANAGER' } });
  assert.equal(changed.status, 200);
  const token = jwt.sign({ id: memberId, organizationId, tokenVersion: 0 }, config.jwtSecret, { expiresIn: '2m', issuer: 'ecogrid-api', audience: 'ecogrid-client' });
  let derivedRole = '';
  const authorizedRequest: any = { headers: { authorization: `Bearer ${token}` } };
  await authenticate(authorizedRequest, {} as any, () => { derivedRole = authorizedRequest.user.role; });
  assert.equal(derivedRole, 'FACILITY_MANAGER');
  await invoke(deactivateOrganizationMember, { user: { id: adminId, organizationId, role: 'ORG_ADMIN' }, params: { id: organizationId, memberId: memberRecordId } });
  let status = 200;
  await authenticate({ headers: { authorization: `Bearer ${token}` } } as any, { status: (code: number) => { status = code; return { json: () => undefined }; } } as any, () => { throw new Error('Inactive membership authenticated.'); });
  assert.equal(status, 401);
  const privilegeEscalation = await invoke(changeMemberRole, { user: { id: adminId, organizationId, role: 'ORG_ADMIN' }, params: { id: organizationId, memberId: memberRecordId }, body: { role: 'SUPER_ADMIN' } });
  assert.equal(privilegeEscalation.status, 400);
});

test('invitation tokens are hashed, time-limited, single-use and cannot cross organizations', async () => {
  const invite = await invoke(createOrganizationInvitation, { user: { id: adminId, organizationId, role: 'ORG_ADMIN' }, params: { id: organizationId },
    body: { email: 'invited@example.invalid', role: 'VIEWER' }, requestId: 'a10-invite' });
  assert.equal(invite.status, 201);
  const rawToken = invite.body.invitation.token;
  const saved = await prisma.organizationInvitation.findUniqueOrThrow({ where: { id: invite.body.invitation.id } });
  assert.notEqual(saved.tokenHash, rawToken);
  const pendingUsage = await getUsage(organizationId);
  assert.equal(pendingUsage.users, 2, 'a pending invite reserves a user seat');
  const accepted = await invoke(acceptInvitationForNewUser, { body: { token: rawToken, email: 'invited@example.invalid', name: 'Invited User', password: 'another long passphrase here' } });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.user.role, 'VIEWER');
  const replay = await invoke(acceptInvitationForNewUser, { body: { token: rawToken, email: 'invited@example.invalid', name: 'Invited User', password: 'another long passphrase here' } });
  assert.equal(replay.status, 409);
  const crossTenant = await invoke(createOrganizationInvitation, { user: { id: otherUserId, organizationId: otherOrganizationId, role: 'ORG_ADMIN' }, params: { id: organizationId },
    body: { email: 'x@example.invalid', role: 'ORG_ADMIN' } });
  assert.equal(crossTenant.status, 404);
  await prisma.user.delete({ where: { email: 'invited@example.invalid' } });
});

test('subscription usage and entitlements are organization-scoped and enforce limits', async () => {
  await prisma.building.createMany({ data: Array.from({ length: 3 }, (_, i) => ({ organizationId, name: `Limit ${i}` })) });
  let nextCalled = false; let status = 200; let body: any;
  await requireEntitlement('buildings')({ user: { organizationId } } as any, { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } } as any, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(status, 429);
  assert.equal(body.code, 'ENTITLEMENT_LIMIT_REACHED');
  const own = await invoke(getOrganizationSubscription, { user: { id: adminId, organizationId, role: 'ORG_ADMIN' }, params: { id: organizationId } });
  assert.equal(own.status, 200);
  assert.equal(own.body.subscription.planKey, 'STARTER');
  const crossTenant = await invoke(getOrganizationSubscription, { user: { id: adminId, organizationId, role: 'ORG_ADMIN' }, params: { id: otherOrganizationId } });
  assert.equal(crossTenant.status, 404);
});
