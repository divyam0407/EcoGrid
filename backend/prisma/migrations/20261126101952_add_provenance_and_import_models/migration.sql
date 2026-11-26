-- CreateTable
CREATE TABLE "DataImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "datasetName" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "originalFilename" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "sourceTimezone" TEXT NOT NULL,
    "rawUnit" TEXT NOT NULL,
    "preprocessingVer" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRowsProcessed" INTEGER NOT NULL,
    "validRecordsCount" INTEGER NOT NULL,
    "imputedCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "minTimestamp" DATETIME,
    "maxTimestamp" DATETIME,
    "errorLogJson" TEXT,
    CONSTRAINT "DataImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenchmarkEvaluationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "horizonHours" INTEGER NOT NULL,
    "trainStart" DATETIME NOT NULL,
    "trainEnd" DATETIME NOT NULL,
    "valStart" DATETIME,
    "valEnd" DATETIME,
    "testStart" DATETIME NOT NULL,
    "testEnd" DATETIME NOT NULL,
    "mae" REAL,
    "rmse" REAL,
    "mape" REAL,
    "baselineMae" REAL,
    "improvementPct" REAL,
    "configurationJson" TEXT NOT NULL,
    "metricsReportJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenchmarkEvaluationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Building" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "buildingType" TEXT NOT NULL DEFAULT 'ACADEMIC',
    "address" TEXT,
    "totalArea" REAL,
    "externalId" TEXT,
    "siteId" TEXT,
    "yearBuilt" INTEGER,
    "floorCount" INTEGER,
    "primarySpaceUsage" TEXT,
    "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Building_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Building" ("address", "buildingType", "createdAt", "id", "name", "organizationId", "totalArea") SELECT "address", "buildingType", "createdAt", "id", "name", "organizationId", "totalArea" FROM "Building";
DROP TABLE "Building";
ALTER TABLE "new_Building" RENAME TO "Building";
CREATE TABLE "new_EnergyReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT,
    "batchId" TEXT,
    "timestamp" DATETIME NOT NULL,
    "sourceLocalTime" TEXT,
    "consumptionKwh" REAL NOT NULL,
    "powerKw" REAL,
    "rawReading" REAL,
    "rawUnit" TEXT,
    "voltageV" REAL,
    "currentA" REAL,
    "frequencyHz" REAL,
    "powerFactor" REAL,
    "apparentPowerVa" REAL,
    "reactivePowerVar" REAL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    "source" TEXT NOT NULL DEFAULT 'CSV_UPLOAD',
    "qualityStatus" TEXT NOT NULL DEFAULT 'VALIDATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnergyReading_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnergyReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnergyReading_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnergyReading_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EnergyReading_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DataImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EnergyReading" ("buildingId", "consumptionKwh", "createdAt", "id", "meterId", "organizationId", "powerKw", "qualityStatus", "roomId", "source", "timestamp") SELECT "buildingId", "consumptionKwh", "createdAt", "id", "meterId", "organizationId", "powerKw", "qualityStatus", "roomId", "source", "timestamp" FROM "EnergyReading";
DROP TABLE "EnergyReading";
ALTER TABLE "new_EnergyReading" RENAME TO "EnergyReading";
CREATE INDEX "EnergyReading_organizationId_timestamp_idx" ON "EnergyReading"("organizationId", "timestamp");
CREATE INDEX "EnergyReading_buildingId_timestamp_idx" ON "EnergyReading"("buildingId", "timestamp");
CREATE INDEX "EnergyReading_meterId_timestamp_idx" ON "EnergyReading"("meterId", "timestamp");
CREATE INDEX "EnergyReading_batchId_idx" ON "EnergyReading"("batchId");
CREATE INDEX "EnergyReading_organizationId_dataSource_timestamp_idx" ON "EnergyReading"("organizationId", "dataSource", "timestamp");
CREATE TABLE "new_Meter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT,
    "meterName" TEXT NOT NULL,
    "meterType" TEXT NOT NULL DEFAULT 'MAIN_FEEDER',
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL_CSV',
    "unit" TEXT NOT NULL DEFAULT 'kWh',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "externalMeterId" TEXT,
    "physicalLocation" TEXT,
    "multiplier" REAL NOT NULL DEFAULT 1.0,
    "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    CONSTRAINT "Meter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Meter_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Meter_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Meter" ("buildingId", "id", "meterName", "meterType", "organizationId", "roomId", "sourceType", "status", "unit") SELECT "buildingId", "id", "meterName", "meterType", "organizationId", "roomId", "sourceType", "status", "unit" FROM "Meter";
DROP TABLE "Meter";
ALTER TABLE "new_Meter" RENAME TO "Meter";
CREATE TABLE "new_OccupancyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT,
    "roomId" TEXT,
    "batchId" TEXT,
    "timestamp" DATETIME NOT NULL,
    "occupancyCount" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "granularity" TEXT NOT NULL DEFAULT 'BUILDING_LEVEL',
    "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    "confidence" REAL NOT NULL DEFAULT 0.9,
    CONSTRAINT "OccupancyRecord_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OccupancyRecord_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OccupancyRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DataImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OccupancyRecord" ("confidence", "id", "occupancyCount", "organizationId", "roomId", "sourceType", "timestamp") SELECT "confidence", "id", "occupancyCount", "organizationId", "roomId", "sourceType", "timestamp" FROM "OccupancyRecord";
DROP TABLE "OccupancyRecord";
ALTER TABLE "new_OccupancyRecord" RENAME TO "OccupancyRecord";
CREATE INDEX "OccupancyRecord_roomId_timestamp_idx" ON "OccupancyRecord"("roomId", "timestamp");
CREATE INDEX "OccupancyRecord_buildingId_timestamp_idx" ON "OccupancyRecord"("buildingId", "timestamp");
CREATE INDEX "OccupancyRecord_batchId_idx" ON "OccupancyRecord"("batchId");
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "industryType" TEXT NOT NULL DEFAULT 'HIGHER_EDUCATION',
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "tier" TEXT NOT NULL DEFAULT 'COMMERCIAL_PRODUCTION',
    "isBenchmark" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("address", "createdAt", "currency", "id", "industryType", "name", "timezone", "updatedAt") SELECT "address", "createdAt", "currency", "id", "industryType", "name", "timezone", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DataImportBatch_organizationId_dataSource_idx" ON "DataImportBatch"("organizationId", "dataSource");

-- CreateIndex
CREATE INDEX "DataImportBatch_fileSha256_idx" ON "DataImportBatch"("fileSha256");

-- CreateIndex
CREATE INDEX "BenchmarkEvaluationRun_organizationId_modelType_idx" ON "BenchmarkEvaluationRun"("organizationId", "modelType");
