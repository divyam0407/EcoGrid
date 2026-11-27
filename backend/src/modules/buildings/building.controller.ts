import { Request, Response } from 'express';
import { prisma } from '../../config';

export const getBuildings = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId;
    const buildings = await prisma.building.findMany({
      where: { organizationId: orgId },
      include: {
        departments: true,
        rooms: true,
        meters: true,
        solar: true,
        batteries: true,
        _count: {
          select: { energyReadings: true, anomalies: true }
        }
      }
    });
    return res.json({ buildings });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createBuilding = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId;
    const { name, buildingType, address, totalArea } = req.body;
    if (!name) return res.status(400).json({ error: 'Building name is required' });

    const building = await prisma.building.create({
      data: {
        organizationId: orgId!,
        name,
        buildingType: buildingType || 'ACADEMIC',
        address,
        totalArea: totalArea ? parseFloat(totalArea) : null
      }
    });
    return res.status(201).json({ building });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getBuildingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const building = await prisma.building.findFirst({
      where: { id, organizationId: req.user?.organizationId },
      include: {
        departments: { include: { rooms: true } },
        rooms: { include: { meters: true } },
        meters: true,
        solar: true,
        batteries: true,
      }
    });
    if (!building) return res.status(404).json({ error: 'Building not found' });
    return res.json({ building });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, buildingType, address, totalArea } = req.body;
    const result = await prisma.building.updateMany({
      where: { id, organizationId: req.user?.organizationId },
      data: {
        name,
        buildingType,
        address,
        totalArea: totalArea ? parseFloat(totalArea) : undefined
      }
    });
    if (!result.count) return res.status(404).json({ error: 'Building not found' });
    const building = await prisma.building.findFirst({ where: { id, organizationId: req.user?.organizationId } });
    return res.json({ building });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await prisma.building.deleteMany({ where: { id, organizationId: req.user?.organizationId } });
    if (!result.count) return res.status(404).json({ error: 'Building not found' });
    return res.json({ message: 'Building deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createBuildingMeter = async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const buildingId = req.params.id;
    const meterName = typeof req.body.meterName === 'string' ? req.body.meterName.trim() : '';
    const meterType = typeof req.body.meterType === 'string' ? req.body.meterType : 'MAIN_FEEDER';
    const meterTypes = ['MAIN_FEEDER', 'SUB_METER', 'HVAC', 'LIGHTING', 'PLUG_LOAD'];
    if (!meterName || meterName.length > 120 || !meterTypes.includes(meterType)) {
      return res.status(400).json({ error: 'Enter a meter name and supported meter type.' });
    }
    const building = await prisma.building.findFirst({ where: { id: buildingId, organizationId }, select: { id: true } });
    if (!building) return res.status(404).json({ error: 'Building not found.' });
    const meter = await prisma.meter.create({ data: {
      organizationId: organizationId!, buildingId, meterName, meterType, dataSource: 'UNSPECIFIED',
    } });
    return res.status(201).json({ meter });
  } catch {
    return res.status(500).json({ error: 'Meter could not be created.' });
  }
};
