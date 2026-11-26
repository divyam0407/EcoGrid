-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industryType" TEXT NOT NULL DEFAULT 'HIGHER_EDUCATION',
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "tier" TEXT NOT NULL DEFAULT 'COMMERCIAL_PRODUCTION',
    "isBenchmark" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ENERGY_MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "buildingType" TEXT NOT NULL DEFAULT 'ACADEMIC',
    "address" TEXT,
    "totalArea" DOUBLE PRECISION,
    "externalId" TEXT,
    "siteId" TEXT,
    "yearBuilt" INTEGER,
    "floorCount" INTEGER,
    "primarySpaceUsage" TEXT,
    "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentType" TEXT NOT NULL DEFAULT 'ACADEMIC',

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "departmentId" TEXT,
    "roomNumber" TEXT NOT NULL,
    "roomType" TEXT NOT NULL DEFAULT 'CLASSROOM',
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "expectedOperatingHours" TEXT NOT NULL DEFAULT '08:00-18:00',

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meter" (
    "id" TEXT NOT NULL,
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
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',

    CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnergyReading" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT,
    "batchId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "sourceLocalTime" TEXT,
    "consumptionKwh" DOUBLE PRECISION NOT NULL,
    "powerKw" DOUBLE PRECISION,
    "rawReading" DOUBLE PRECISION,
    "rawUnit" TEXT,
    "voltageV" DOUBLE PRECISION,
    "currentA" DOUBLE PRECISION,
    "frequencyHz" DOUBLE PRECISION,
    "powerFactor" DOUBLE PRECISION,
    "apparentPowerVa" DOUBLE PRECISION,
    "reactivePowerVar" DOUBLE PRECISION,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    "source" TEXT NOT NULL DEFAULT 'CSV_UPLOAD',
    "qualityStatus" TEXT NOT NULL DEFAULT 'VALIDATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnergyReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "activityType" TEXT NOT NULL DEFAULT 'LECTURE',
    "startDatetime" TIMESTAMP(3),
    "endDatetime" TIMESTAMP(3),
    "dayOfWeek" INTEGER,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "expectedOccupancy" INTEGER NOT NULL DEFAULT 30,
    "sourceType" TEXT NOT NULL DEFAULT 'TIMETABLE_CSV',

    CONSTRAINT "OperationalSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupancyRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT,
    "roomId" TEXT,
    "batchId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "occupancyCount" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "granularity" TEXT NOT NULL DEFAULT 'BUILDING_LEVEL',
    "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,

    CONSTRAINT "OccupancyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricityTariff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tariffName" TEXT NOT NULL,
    "tariffType" TEXT NOT NULL DEFAULT 'TIME_OF_USE',
    "pricePerKwh" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "ElectricityTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffPeriod" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "periodName" TEXT NOT NULL DEFAULT 'STANDARD',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "pricePerKwh" DOUBLE PRECISION NOT NULL,
    "dayType" TEXT NOT NULL DEFAULT 'ALL',

    CONSTRAINT "TariffPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolarInstallation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "capacityKw" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "installationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "SolarInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolarReading" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "generationKwh" DOUBLE PRECISION NOT NULL,
    "powerKw" DOUBLE PRECISION,

    CONSTRAINT "SolarReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main Storage Bank',
    "capacityKwh" DOUBLE PRECISION NOT NULL DEFAULT 150.0,
    "maxChargeKw" DOUBLE PRECISION NOT NULL DEFAULT 40.0,
    "maxDischargeKw" DOUBLE PRECISION NOT NULL DEFAULT 40.0,
    "minSoc" DOUBLE PRECISION NOT NULL DEFAULT 15.0,
    "maxSoc" DOUBLE PRECISION NOT NULL DEFAULT 140.0,
    "initialSoc" DOUBLE PRECISION NOT NULL DEFAULT 30.0,
    "chargingEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
    "dischargingEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
    "degradationCost" DOUBLE PRECISION NOT NULL DEFAULT 0.015,

    CONSTRAINT "Battery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryReading" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "stateOfCharge" DOUBLE PRECISION NOT NULL,
    "chargePowerKw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dischargePowerKw" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "BatteryReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1.2-operational-aware',
    "predictionType" TEXT NOT NULL DEFAULT '24_HOUR_DEMAND',
    "forecastTimestamp" TIMESTAMP(3) NOT NULL,
    "predictedKwh" DOUBLE PRECISION NOT NULL,
    "actualKwh" DOUBLE PRECISION,
    "confidenceLower" DOUBLE PRECISION,
    "confidenceUpper" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "meterId" TEXT,
    "roomId" TEXT,
    "anomalyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "expectedValue" DOUBLE PRECISION NOT NULL,
    "observedValue" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "deviationPercent" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "recommendationType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT,
    "estimatedEnergySavingKwh" DOUBLE PRECISION NOT NULL,
    "estimatedCostSaving" DOUBLE PRECISION NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "optimizationType" TEXT NOT NULL DEFAULT 'MILP_TARIFF_BATTERY',
    "baselineCost" DOUBLE PRECISION NOT NULL,
    "optimizedCost" DOUBLE PRECISION NOT NULL,
    "estimatedSavings" DOUBLE PRECISION NOT NULL,
    "solverStatus" TEXT NOT NULL DEFAULT 'OPTIMAL',
    "configuration" TEXT NOT NULL,
    "resultData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "configuration" TEXT NOT NULL,
    "resultData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportBatch" (
    "id" TEXT NOT NULL,
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
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRowsProcessed" INTEGER NOT NULL,
    "validRecordsCount" INTEGER NOT NULL,
    "imputedCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "minTimestamp" TIMESTAMP(3),
    "maxTimestamp" TIMESTAMP(3),
    "errorLogJson" TEXT,

    CONSTRAINT "DataImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkEvaluationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "horizonHours" INTEGER NOT NULL,
    "trainStart" TIMESTAMP(3) NOT NULL,
    "trainEnd" TIMESTAMP(3) NOT NULL,
    "valStart" TIMESTAMP(3),
    "valEnd" TIMESTAMP(3),
    "testStart" TIMESTAMP(3) NOT NULL,
    "testEnd" TIMESTAMP(3) NOT NULL,
    "mae" DOUBLE PRECISION,
    "rmse" DOUBLE PRECISION,
    "mape" DOUBLE PRECISION,
    "baselineMae" DOUBLE PRECISION,
    "improvementPct" DOUBLE PRECISION,
    "configurationJson" TEXT NOT NULL,
    "metricsReportJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkEvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "EnergyReading_organizationId_timestamp_idx" ON "EnergyReading"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "EnergyReading_buildingId_timestamp_idx" ON "EnergyReading"("buildingId", "timestamp");

-- CreateIndex
CREATE INDEX "EnergyReading_meterId_timestamp_idx" ON "EnergyReading"("meterId", "timestamp");

-- CreateIndex
CREATE INDEX "EnergyReading_batchId_idx" ON "EnergyReading"("batchId");

-- CreateIndex
CREATE INDEX "EnergyReading_organizationId_dataSource_timestamp_idx" ON "EnergyReading"("organizationId", "dataSource", "timestamp");

-- CreateIndex
CREATE INDEX "OperationalSchedule_organizationId_buildingId_roomId_idx" ON "OperationalSchedule"("organizationId", "buildingId", "roomId");

-- CreateIndex
CREATE INDEX "OccupancyRecord_roomId_timestamp_idx" ON "OccupancyRecord"("roomId", "timestamp");

-- CreateIndex
CREATE INDEX "OccupancyRecord_buildingId_timestamp_idx" ON "OccupancyRecord"("buildingId", "timestamp");

-- CreateIndex
CREATE INDEX "OccupancyRecord_batchId_idx" ON "OccupancyRecord"("batchId");

-- CreateIndex
CREATE INDEX "SolarReading_installationId_timestamp_idx" ON "SolarReading"("installationId", "timestamp");

-- CreateIndex
CREATE INDEX "BatteryReading_batteryId_timestamp_idx" ON "BatteryReading"("batteryId", "timestamp");

-- CreateIndex
CREATE INDEX "Prediction_organizationId_forecastTimestamp_idx" ON "Prediction"("organizationId", "forecastTimestamp");

-- CreateIndex
CREATE INDEX "Anomaly_organizationId_detectedAt_idx" ON "Anomaly"("organizationId", "detectedAt");

-- CreateIndex
CREATE INDEX "Recommendation_organizationId_status_idx" ON "Recommendation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OptimizationRun_organizationId_createdAt_idx" ON "OptimizationRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "DataImportBatch_organizationId_dataSource_idx" ON "DataImportBatch"("organizationId", "dataSource");

-- CreateIndex
CREATE INDEX "DataImportBatch_fileSha256_idx" ON "DataImportBatch"("fileSha256");

-- CreateIndex
CREATE INDEX "BenchmarkEvaluationRun_organizationId_modelType_idx" ON "BenchmarkEvaluationRun"("organizationId", "modelType");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DataImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalSchedule" ADD CONSTRAINT "OperationalSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalSchedule" ADD CONSTRAINT "OperationalSchedule_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalSchedule" ADD CONSTRAINT "OperationalSchedule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyRecord" ADD CONSTRAINT "OccupancyRecord_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyRecord" ADD CONSTRAINT "OccupancyRecord_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyRecord" ADD CONSTRAINT "OccupancyRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DataImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityTariff" ADD CONSTRAINT "ElectricityTariff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffPeriod" ADD CONSTRAINT "TariffPeriod_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "ElectricityTariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolarInstallation" ADD CONSTRAINT "SolarInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolarInstallation" ADD CONSTRAINT "SolarInstallation_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolarReading" ADD CONSTRAINT "SolarReading_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "SolarInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battery" ADD CONSTRAINT "Battery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battery" ADD CONSTRAINT "Battery_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryReading" ADD CONSTRAINT "BatteryReading_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Battery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationRun" ADD CONSTRAINT "OptimizationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationRun" ADD CONSTRAINT "OptimizationRun_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImportBatch" ADD CONSTRAINT "DataImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkEvaluationRun" ADD CONSTRAINT "BenchmarkEvaluationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
