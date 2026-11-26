import { Request, Response } from 'express';
import { prisma } from '../../config';

export const getBatteries = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const batteries = await prisma.battery.findMany({
      where: { organizationId: orgId },
      include: {
        building: { select: { id: true, name: true } },
        readings: {
          orderBy: { timestamp: 'desc' },
          take: 24,
        },
      },
    });

    return res.json({ batteries });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createBattery = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const {
      buildingId,
      name,
      capacityKwh,
      maxChargeKw,
      maxDischargeKw,
      minSoc,
      maxSoc,
      initialSoc,
      chargingEfficiency,
      dischargingEfficiency,
      degradationCost,
    } = req.body;

    if (!buildingId || !capacityKwh) {
      return res.status(400).json({ error: 'Building ID and capacity are required.' });
    }

    const cap = parseFloat(capacityKwh);
    const battery = await prisma.battery.create({
      data: {
        organizationId: orgId,
        buildingId,
        name: name || 'Battery Energy Storage Unit',
        capacityKwh: cap,
        maxChargeKw: maxChargeKw ? parseFloat(maxChargeKw) : cap * 0.3,
        maxDischargeKw: maxDischargeKw ? parseFloat(maxDischargeKw) : cap * 0.3,
        minSoc: minSoc ? parseFloat(minSoc) : cap * 0.1,
        maxSoc: maxSoc ? parseFloat(maxSoc) : cap * 0.95,
        initialSoc: initialSoc ? parseFloat(initialSoc) : cap * 0.25,
        chargingEfficiency: chargingEfficiency ? parseFloat(chargingEfficiency) : 0.92,
        dischargingEfficiency: dischargingEfficiency ? parseFloat(dischargingEfficiency) : 0.92,
        degradationCost: degradationCost ? parseFloat(degradationCost) : 0.015,
      },
    });

    return res.status(201).json({ battery });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateBattery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await prisma.battery.update({
      where: { id },
      data,
    });
    return res.json({ battery: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
