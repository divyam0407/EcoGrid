-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN     "forecastModelId" TEXT,
ADD COLUMN     "horizonHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "meterId" TEXT,
ADD COLUMN     "sourcePredictionKey" TEXT;

-- CreateTable
CREATE TABLE "ForecastModel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'QUEUED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "featureSetJson" TEXT NOT NULL,
    "trainingConfigJson" TEXT NOT NULL,
    "qualityReportJson" TEXT,
    "metricsJson" TEXT,
    "trainStart" TIMESTAMP(3),
    "trainEnd" TIMESTAMP(3),
    "validationStart" TIMESTAMP(3),
    "validationEnd" TIMESTAMP(3),
    "testStart" TIMESTAMP(3),
    "testEnd" TIMESTAMP(3),
    "trainingRows" INTEGER NOT NULL DEFAULT 0,
    "validationRows" INTEGER NOT NULL DEFAULT 0,
    "testRows" INTEGER NOT NULL DEFAULT 0,
    "artifactPath" TEXT,
    "artifactSha256" TEXT,
    "errorMessage" TEXT,
    "retryOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ForecastModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForecastModel_organizationId_meterId_status_createdAt_idx" ON "ForecastModel"("organizationId", "meterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ForecastModel_organizationId_meterId_dataSource_isActive_idx" ON "ForecastModel"("organizationId", "meterId", "dataSource", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastModel_organizationId_meterId_dataSource_version_key" ON "ForecastModel"("organizationId", "meterId", "dataSource", "version");

-- CreateIndex
CREATE INDEX "Prediction_organizationId_meterId_forecastTimestamp_idx" ON "Prediction"("organizationId", "meterId", "forecastTimestamp");

-- CreateIndex
CREATE INDEX "Prediction_organizationId_forecastModelId_horizonHours_idx" ON "Prediction"("organizationId", "forecastModelId", "horizonHours");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_organizationId_sourcePredictionKey_key" ON "Prediction"("organizationId", "sourcePredictionKey");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_forecastModelId_fkey" FOREIGN KEY ("forecastModelId") REFERENCES "ForecastModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastModel" ADD CONSTRAINT "ForecastModel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastModel" ADD CONSTRAINT "ForecastModel_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastModel" ADD CONSTRAINT "ForecastModel_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

