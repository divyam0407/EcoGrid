import { Request, Response } from 'express';
import { prisma } from '../../config';

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId;
    const { buildingId } = req.query;
    const departments = await prisma.department.findMany({
      where: {
        organizationId: orgId!,
        ...(buildingId ? { buildingId: String(buildingId) } : {})
      },
      include: {
        rooms: true,
        building: { select: { id: true, name: true } }
      }
    });
    return res.json({ departments });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId;
    const { buildingId, name, departmentType } = req.body;
    if (!buildingId || !name) {
      return res.status(400).json({ error: 'Building ID and department name are required' });
    }
    const dept = await prisma.department.create({
      data: {
        organizationId: orgId!,
        buildingId,
        name,
        departmentType: departmentType || 'ACADEMIC'
      }
    });
    return res.status(201).json({ department: dept });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
