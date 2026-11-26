-- Preserve source batch and file-hash provenance for each registered model.
ALTER TABLE "ForecastModel" ADD COLUMN "dataProvenanceJson" TEXT;
ALTER TABLE "Prediction" ADD COLUMN "leadHours" INTEGER NOT NULL DEFAULT 1;
