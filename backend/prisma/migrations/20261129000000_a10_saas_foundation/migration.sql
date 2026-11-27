-- A10 SaaS foundation. Additive only: existing users, memberships and data remain.
ALTER TABLE "User"
  ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Preserve the pre-A10 platform administrator capability while separating it
-- from organization role assignment.
UPDATE "User" u SET "isPlatformAdmin" = true
WHERE EXISTS (
  SELECT 1 FROM "OrganizationMember" m
  WHERE m."userId" = u."id" AND m."role" = 'SUPER_ADMIN'
);

ALTER TABLE "OrganizationMember" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "AuditLog"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "ipHash" TEXT,
  ADD COLUMN "metadataJson" TEXT;

CREATE TABLE "RefreshSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedFromId" TEXT,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");
CREATE INDEX "RefreshSession_userId_expiresAt_idx" ON "RefreshSession"("userId", "expiresAt");
CREATE INDEX "RefreshSession_revokedAt_expiresAt_idx" ON "RefreshSession"("revokedAt", "expiresAt");

CREATE TABLE "OrganizationInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");
CREATE INDEX "OrganizationInvitation_organizationId_email_expiresAt_idx" ON "OrganizationInvitation"("organizationId", "email", "expiresAt");
CREATE INDEX "OrganizationInvitation_invitedById_createdAt_idx" ON "OrganizationInvitation"("invitedById", "createdAt");

CREATE TABLE "OrganizationSubscription" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "planKey" TEXT NOT NULL DEFAULT 'STARTER',
  "status" TEXT NOT NULL DEFAULT 'TRIALING',
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "billingProvider" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
  "providerCustomerRef" TEXT,
  "providerSubscriptionRef" TEXT,
  "invoiceReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");
CREATE INDEX "OrganizationSubscription_status_trialEndsAt_idx" ON "OrganizationSubscription"("status", "trialEndsAt");

CREATE TABLE "SubscriptionEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "detailsJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "OrganizationSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SubscriptionEvent_organizationId_createdAt_idx" ON "SubscriptionEvent"("organizationId", "createdAt");
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");

-- Grandfather current organizations without assigning a price or claiming a
-- payment. Limits are marked LEGACY until an administrator configures a plan.
INSERT INTO "OrganizationSubscription" ("id", "organizationId", "planKey", "status", "billingProvider", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", 'LEGACY', 'ACTIVE', 'UNCONFIGURED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "OrganizationSubscription" s WHERE s."organizationId" = o."id"
);
