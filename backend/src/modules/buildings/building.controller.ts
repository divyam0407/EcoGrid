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
    const building = await prisma.building.findUnique({
      where: { id },
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
    const building = await prisma.building.update({
      where: { id },
      data: {
        name,
        buildingType,
        address,
        totalArea: totalArea ? parseFloat(totalArea) : undefined
      }
    });
    return res.json({ building });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.building.delete({ where: { id } });
    return res.json({ message: 'Building deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
