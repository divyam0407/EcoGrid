import { Request, Response } from 'express';
import { prisma } from '../../config';
import '../../middleware/auth';

export const getSolarOverview = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const installations = await prisma.solarInstallation.findMany({
      where: { organizationId: orgId },
      include: { building: true },
    });

    const readings = await prisma.solarReading.findMany({
      where: { organizationId: orgId },
      orderBy: { timestamp: 'desc' },
      take: 168,
    });

    const totalCapacityKw = installations.reduce((sum, i) => sum + i.capacityKw, 0);
    const totalGeneratedKwh = readings.reduce((sum, r) => sum + r.generationKwh, 0);

    return res.json({
      totalInstallations: installations.length,
      totalCapacityKw,
      totalGeneratedKwh: Math.round(totalGeneratedKwh),
      installations,
      recentReadings: readings.slice(0, 48),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createSolarInstallation = async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { buildingId, capacityKw } = req.body;
    const capacity = Number(capacityKw);
    if (!buildingId || !Number.isFinite(capacity) || capacity <= 0) return res.status(400).json({ error: 'Building ID and a positive configured capacity in kW are required.' });
    const building = await prisma.building.findFirst({ where: { id: String(buildingId), organizationId: orgId } });
    if (!building) return res.status(404).json({ error: 'Building not found in this organization.' });

    const installation = await prisma.solarInstallation.create({
      data: {
        organizationId: orgId,
        buildingId: building.id,
        capacityKw: capacity,
        status: 'ACTIVE',
      },
    });

    return res.status(201).json({ installation });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
