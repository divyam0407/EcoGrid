-- A7 additive recommendation evidence, workflow, and outcome measurement.
ALTER TABLE "OperationalInsight"
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "generatorVersion" TEXT;

ALTER TABLE "Recommendation"
  ALTER COLUMN "estimatedEnergySavingKwh" TYPE DECIMAL(18,6) USING round("estimatedEnergySavingKwh"::numeric, 6),
  ALTER COLUMN "estimatedEnergySavingKwh" DROP NOT NULL,
  ALTER COLUMN "estimatedCostSaving" TYPE DECIMAL(18,4) USING round("estimatedCostSaving"::numeric, 4),
  ALTER COLUMN "estimatedCostSaving" DROP NOT NULL,
  ADD COLUMN "roomId" TEXT,
  ADD COLUMN "meterId" TEXT,
  ADD COLUMN "operationalInsightId" TEXT,
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "generationSource" TEXT NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
  ADD COLUMN "financialEstimateAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "savingsPeriod" TEXT,
  ADD COLUMN "calculationPeriodStart" TIMESTAMP(3),
  ADD COLUMN "calculationPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "calculationMethod" TEXT,
  ADD COLUMN "assumptionsJson" TEXT,
  ADD COLUMN "limitationsJson" TEXT,
  ADD COLUMN "priorityReason" TEXT,
  ADD COLUMN "effortLevel" TEXT,
  ADD COLUMN "assignedUserId" TEXT,
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedReason" TEXT,
  ADD COLUMN "implementedAt" TIMESTAMP(3),
  ADD COLUMN "completionDetails" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Recommendation" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "RecommendationEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "reason" TEXT,
  "note" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecommendationMeasurement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "meterId" TEXT NOT NULL,
  "baselinePeriodStart" TIMESTAMP(3) NOT NULL,
  "baselinePeriodEnd" TIMESTAMP(3) NOT NULL,
  "comparisonPeriodStart" TIMESTAMP(3) NOT NULL,
  "comparisonPeriodEnd" TIMESTAMP(3) NOT NULL,
  "baselineExpectedKwh" DECIMAL(18,6),
  "postActionMeasuredKwh" DECIMAL(18,6),
  "estimatedRealizedSavingsKwh" DECIMAL(18,6),
  "savingsStatus" TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
  "methodology" TEXT NOT NULL,
  "limitationsJson" TEXT NOT NULL,
  "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  CONSTRAINT "RecommendationMeasurement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalInsight_organizationId_sourceKey_key" ON "OperationalInsight"("organizationId", "sourceKey");
CREATE UNIQUE INDEX "Recommendation_organizationId_sourceKey_key" ON "Recommendation"("organizationId", "sourceKey");
CREATE INDEX "Recommendation_organizationId_generationSource_createdAt_idx" ON "Recommendation"("organizationId", "generationSource", "createdAt");
CREATE INDEX "Recommendation_organizationId_buildingId_priority_status_idx" ON "Recommendation"("organizationId", "buildingId", "priority", "status");
CREATE INDEX "Recommendation_meterId_calculationPeriodStart_calculationPeriodEnd_idx" ON "Recommendation"("meterId", "calculationPeriodStart", "calculationPeriodEnd");
CREATE INDEX "RecommendationEvent_organizationId_recommendationId_createdAt_idx" ON "RecommendationEvent"("organizationId", "recommendationId", "createdAt");
CREATE INDEX "RecommendationMeasurement_organizationId_recommendationId_measuredAt_idx" ON "RecommendationMeasurement"("organizationId", "recommendationId", "measuredAt");

ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_operationalInsightId_fkey" FOREIGN KEY ("operationalInsightId") REFERENCES "OperationalInsight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationMeasurement" ADD CONSTRAINT "RecommendationMeasurement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationMeasurement" ADD CONSTRAINT "RecommendationMeasurement_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationMeasurement" ADD CONSTRAINT "RecommendationMeasurement_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationMeasurement" ADD CONSTRAINT "RecommendationMeasurement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
