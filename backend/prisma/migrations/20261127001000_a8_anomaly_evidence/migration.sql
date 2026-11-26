-- Additive anomaly provenance and idempotency fields.
ALTER TABLE "Anomaly" ADD COLUMN "detectionMethod" TEXT;
ALTER TABLE "Anomaly" ADD COLUMN "baselineSampleCount" INTEGER;
ALTER TABLE "Anomaly" ADD COLUMN "qualityReportJson" TEXT;
ALTER TABLE "Anomaly" ADD COLUMN "operationalContextJson" TEXT;
ALTER TABLE "Anomaly" ADD COLUMN "sourceKey" TEXT;
CREATE UNIQUE INDEX "Anomaly_organizationId_sourceKey_key" ON "Anomaly"("organizationId", "sourceKey");
