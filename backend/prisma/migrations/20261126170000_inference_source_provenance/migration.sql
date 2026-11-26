ALTER TABLE "Prediction"
ADD COLUMN "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO';

ALTER TABLE "Anomaly"
ADD COLUMN "dataSource" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO';

CREATE INDEX "Prediction_organizationId_dataSource_forecastTimestamp_idx"
ON "Prediction"("organizationId", "dataSource", "forecastTimestamp");

CREATE INDEX "Anomaly_organizationId_dataSource_detectedAt_idx"
ON "Anomaly"("organizationId", "dataSource", "detectedAt");
