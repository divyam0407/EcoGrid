-- A9 configuration fields are additive and retain all existing organization data.
ALTER TABLE "ElectricityTariff"
  ADD COLUMN "allowGridExport" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "exportPricePerKwh" DECIMAL(12,6),
  ADD COLUMN "demandChargePerKw" DECIMAL(12,6),
  ADD COLUMN "demandWindowMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "fixedCharge" DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN "carbonEmissionKgPerKwh" DECIMAL(12,6);

ALTER TABLE "Battery"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "allowGridCharging" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reserveSocKwh" DOUBLE PRECISION,
  ADD COLUMN "finalSocKwh" DOUBLE PRECISION;

-- Legacy stateOfCharge has no unit. Keep it intact and add an explicitly unitized field.
ALTER TABLE "BatteryReading" ADD COLUMN "stateOfChargeKwh" DOUBLE PRECISION;

ALTER TABLE "Scenario"
  ADD COLUMN "buildingId" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Scenario_organizationId_buildingId_createdAt_idx"
  ON "Scenario"("organizationId", "buildingId", "createdAt");

ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_buildingId_fkey"
  FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Infeasible solver runs are retained with diagnostics, without fake financial values.
ALTER TABLE "OptimizationRun"
  ALTER COLUMN "baselineCost" DROP NOT NULL,
  ALTER COLUMN "optimizedCost" DROP NOT NULL,
  ALTER COLUMN "estimatedSavings" DROP NOT NULL;
