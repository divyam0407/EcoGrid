ALTER TABLE "EnergyReading"
ADD CONSTRAINT "EnergyReading_organizationId_meterId_timestamp_key"
UNIQUE ("organizationId", "meterId", "timestamp");

ALTER TABLE "OccupancyRecord"
ADD COLUMN "sourceLocalTime" TEXT;

ALTER TABLE "DataImportBatch"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'UPLOADED',
ADD COLUMN "progressPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "currentStage" TEXT,
ADD COLUMN "requestFingerprint" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "errorMessage" TEXT;

CREATE TABLE "ImportFile" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mediaType" TEXT,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportFile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DataImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ImportRejectedRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fileField" TEXT,
    "rowNumber" INTEGER NOT NULL,
    "externalBuildingId" TEXT,
    "externalMeterId" TEXT,
    "rawTimestamp" TEXT,
    "rawValue" TEXT,
    "reason" TEXT NOT NULL,
    "qualityStatus" TEXT NOT NULL DEFAULT 'INVALID_REJECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportRejectedRow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportRejectedRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DataImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DataImportBatch_organizationId_status_importedAt_idx" ON "DataImportBatch"("organizationId", "status", "importedAt");
CREATE UNIQUE INDEX "DataImportBatch_organizationId_requestFingerprint_key" ON "DataImportBatch"("organizationId", "requestFingerprint");
CREATE INDEX "ImportFile_batchId_idx" ON "ImportFile"("batchId");
CREATE INDEX "ImportFile_sha256_idx" ON "ImportFile"("sha256");
CREATE INDEX "ImportRejectedRow_batchId_rowNumber_idx" ON "ImportRejectedRow"("batchId", "rowNumber");
