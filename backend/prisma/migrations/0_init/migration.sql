-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "industryType" TEXT NOT NULL DEFAULT 'HIGHER_EDUCATION',
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ENERGY_MANAGER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "buildingType" TEXT NOT NULL DEFAULT 'ACADEMIC',
    "address" TEXT,
    "totalArea" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Building_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentType" TEXT NOT NULL DEFAULT 'ACADEMIC',
    CONSTRAINT "Department_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "departmentId" TEXT,
    "roomNumber" TEXT NOT NULL,
    "roomType" TEXT NOT NULL DEFAULT 'CLASSROOM',
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "expectedOperatingHours" TEXT NOT NULL DEFAULT '08:00-18:00',
    CONSTRAINT "Room_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Room_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Meter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT,
    "meterName" TEXT NOT NULL,
    "meterType" TEXT NOT NULL DEFAULT 'MAIN_FEEDER',
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL_CSV',
    "unit" TEXT NOT NULL DEFAULT 'kWh',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "Meter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Meter_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Meter_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnergyReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT,
    "timestamp" DATETIME NOT NULL,
    "consumptionKwh" REAL NOT NULL,
    "powerKw" REAL,
    "source" TEXT NOT NULL DEFAULT 'CSV_UPLOAD',
    "qualityStatus" TEXT NOT NULL DEFAULT 'VALIDATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnergyReading_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnergyReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnergyReading_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnergyReading_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationalSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "activityType" TEXT NOT NULL DEFAULT 'LECTURE',
    "startDatetime" DATETIME,
    "endDatetime" DATETIME,
    "dayOfWeek" INTEGER,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "expectedOccupancy" INTEGER NOT NULL DEFAULT 30,
    "sourceType" TEXT NOT NULL DEFAULT 'TIMETABLE_CSV',
    CONSTRAINT "OperationalSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperationalSchedule_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperationalSchedule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OccupancyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "occupancyCount" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "confidence" REAL NOT NULL DEFAULT 0.9,
    CONSTRAINT "OccupancyRecord_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ElectricityTariff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "tariffName" TEXT NOT NULL,
    "tariffType" TEXT NOT NULL DEFAULT 'TIME_OF_USE',
    "pricePerKwh" REAL NOT NULL DEFAULT 0.15,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" DATETIME,
    CONSTRAINT "ElectricityTariff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TariffPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tariffId" TEXT NOT NULL,
    "periodName" TEXT NOT NULL DEFAULT 'STANDARD',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "pricePerKwh" REAL NOT NULL,
    "dayType" TEXT NOT NULL DEFAULT 'ALL',
    CONSTRAINT "TariffPeriod_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "ElectricityTariff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SolarInstallation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "capacityKw" REAL NOT NULL DEFAULT 100.0,
    "installationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "SolarInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SolarInstallation_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SolarReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "generationKwh" REAL NOT NULL,
    "powerKw" REAL,
    CONSTRAINT "SolarReading_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "SolarInstallation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Battery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main Storage Bank',
    "capacityKwh" REAL NOT NULL DEFAULT 150.0,
    "maxChargeKw" REAL NOT NULL DEFAULT 40.0,
    "maxDischargeKw" REAL NOT NULL DEFAULT 40.0,
    "minSoc" REAL NOT NULL DEFAULT 15.0,
    "maxSoc" REAL NOT NULL DEFAULT 140.0,
    "initialSoc" REAL NOT NULL DEFAULT 30.0,
    "chargingEfficiency" REAL NOT NULL DEFAULT 0.92,
    "dischargingEfficiency" REAL NOT NULL DEFAULT 0.92,
    "degradationCost" REAL NOT NULL DEFAULT 0.015,
    CONSTRAINT "Battery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Battery_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BatteryReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "stateOfCharge" REAL NOT NULL,
    "chargePowerKw" REAL NOT NULL DEFAULT 0,
    "dischargePowerKw" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "BatteryReading_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Battery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1.2-operational-aware',
    "predictionType" TEXT NOT NULL DEFAULT '24_HOUR_DEMAND',
    "forecastTimestamp" DATETIME NOT NULL,
    "predictedKwh" REAL NOT NULL,
    "actualKwh" REAL,
    "confidenceLower" REAL,
    "confidenceUpper" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prediction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prediction_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "meterId" TEXT,
    "roomId" TEXT,
    "anomalyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "expectedValue" REAL NOT NULL,
    "observedValue" REAL NOT NULL,
    "deviation" REAL NOT NULL,
    "deviationPercent" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Anomaly_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Anomaly_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Anomaly_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Anomaly_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "recommendationType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT,
    "estimatedEnergySavingKwh" REAL NOT NULL,
    "estimatedCostSaving" REAL NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "confidence" REAL NOT NULL DEFAULT 0.85,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "optimizationType" TEXT NOT NULL DEFAULT 'MILP_TARIFF_BATTERY',
    "baselineCost" REAL NOT NULL,
    "optimizedCost" REAL NOT NULL,
    "estimatedSavings" REAL NOT NULL,
    "solverStatus" TEXT NOT NULL DEFAULT 'OPTIMAL',
    "configuration" TEXT NOT NULL,
    "resultData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptimizationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OptimizationRun_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "configuration" TEXT NOT NULL,
    "resultData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Scenario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE INDEX "OperationalSchedule_organizationId_buildingId_roomId_idx" ON "OperationalSchedule"("organizationId", "buildingId", "roomId");

-- CreateIndex
CREATE INDEX "OccupancyRecord_roomId_timestamp_idx" ON "OccupancyRecord"("roomId", "timestamp");

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

