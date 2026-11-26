-- Keep existing tariff prices unchanged; require explicit prices for new rows.
ALTER TABLE "ElectricityTariff" ALTER COLUMN "pricePerKwh" DROP DEFAULT;
