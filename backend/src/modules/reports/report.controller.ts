import { Request, Response } from 'express';
import { prisma } from '../../config';

export const getEnergyReport = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, period = 'monthly', emissionFactor = '0.42' } = req.query;

    const factor = parseFloat(String(emissionFactor)) || 0.42; // kg CO2e per kWh

    const where: any = { organizationId: orgId };
    if (buildingId) where.buildingId = String(buildingId);

    const readings = await prisma.energyReading.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    const solar = await prisma.solarReading.findMany({
      where: { organizationId: orgId },
      take: 1000,
    });

    const anomalies = await prisma.anomaly.findMany({
      where: { organizationId: orgId },
      take: 50,
      orderBy: { detectedAt: 'desc' },
    });

    const recommendations = await prisma.recommendation.findMany({
      where: { organizationId: orgId },
    });

    const tariff = await prisma.electricityTariff.findFirst({ where: { organizationId: orgId } });
    const rate = tariff?.pricePerKwh || 0.15;

    const totalKwh = readings.reduce((sum, r) => sum + r.consumptionKwh, 0);
    const solarKwh = solar.reduce((sum, s) => sum + s.generationKwh, 0);
    const gridKwh = Math.max(0, totalKwh - solarKwh);

    // Carbon emissions calculation
    const totalEmissionsKgCo2 = Math.round(gridKwh * factor);
    const emissionsSavedBySolarKgCo2 = Math.round(solarKwh * factor);

    const totalCost = Math.round(gridKwh * rate);
    const potentialSavingsCost = recommendations.reduce((sum, r) => sum + r.estimatedCostSaving, 0);

    return res.json({
      reportTitle: `Campus Operational Energy & Carbon Report (${String(period).toUpperCase()})`,
      generatedAt: new Date().toISOString(),
      gridEmissionFactor: factor,
      metrics: {
        totalEnergyConsumedKwh: Math.round(totalKwh),
        solarEnergyGeneratedKwh: Math.round(solarKwh),
        gridElectricityPurchasedKwh: Math.round(gridKwh),
        solarFractionPercent: totalKwh > 0 ? Math.round((solarKwh / totalKwh) * 1000) / 10 : 0,
        totalElectricityExpenditure: totalCost,
        potentialCostSavingsIdentified: potentialSavingsCost,
        carbonEmissions: {
          estimatedGridEmissionsKgCo2e: totalEmissionsKgCo2,
          estimatedGridEmissionsMetricTons: Math.round((totalEmissionsKgCo2 / 1000) * 10) / 10,
          emissionsAvoidedViaSolarKgCo2e: emissionsSavedBySolarKgCo2,
          emissionsNotice: 'Estimated emissions are calculated from grid consumption using regional grid factor. Clearly distinguished from verified Scope 2 market-based accounting.',
        },
        anomalySummary: {
          totalFlagged: anomalies.length,
          criticalSeverity: anomalies.filter((a) => a.severity === 'CRITICAL').length,
          highSeverity: anomalies.filter((a) => a.severity === 'HIGH').length,
          resolved: anomalies.filter((a) => a.status === 'RESOLVED').length,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
