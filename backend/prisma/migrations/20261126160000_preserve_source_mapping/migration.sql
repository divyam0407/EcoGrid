ALTER TABLE "EnergyReading"
ADD COLUMN "sourceExternalBuildingId" TEXT,
ADD COLUMN "sourceExternalMeterId" TEXT;

ALTER TABLE "OccupancyRecord"
ADD COLUMN "sourceExternalBuildingId" TEXT;

ALTER TABLE "DataImportBatch"
ADD COLUMN "mappingJson" TEXT;
