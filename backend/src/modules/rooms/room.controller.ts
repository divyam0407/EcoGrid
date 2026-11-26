import { Request, Response } from 'express';
import { prisma } from '../../config';

export const getRooms = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId;
    const { buildingId, departmentId } = req.query;
    const rooms = await prisma.room.findMany({
      where: {
        organizationId: orgId!,
        ...(buildingId ? { buildingId: String(buildingId) } : {}),
        ...(departmentId ? { departmentId: String(departmentId) } : {})
      },
      include: {
        building: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        meters: true
      }
    });
    return res.json({ rooms });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createRoom = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId;
    const { buildingId, departmentId, roomNumber, roomType, capacity, floor, expectedOperatingHours } = req.body;
    if (!buildingId || !roomNumber) {
      return res.status(400).json({ error: 'Building ID and room number are required' });
    }
    const room = await prisma.room.create({
      data: {
        organizationId: orgId!,
        buildingId,
        departmentId: departmentId || null,
        roomNumber,
        roomType: roomType || 'CLASSROOM',
        capacity: capacity ? parseInt(capacity, 10) : 30,
        floor: floor ? parseInt(floor, 10) : 1,
        expectedOperatingHours: expectedOperatingHours || '08:00-18:00'
      }
    });
    return res.status(201).json({ room });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateRoom = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { roomNumber, roomType, capacity, floor, expectedOperatingHours } = req.body;
    const room = await prisma.room.update({
      where: { id },
      data: {
        roomNumber,
        roomType,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
        floor: floor ? parseInt(floor, 10) : undefined,
        expectedOperatingHours
      }
    });
    return res.json({ room });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
