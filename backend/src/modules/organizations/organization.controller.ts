import { Request, Response } from 'express';
import { prisma } from '../../config';

export const getOrganizations = async (req: Request, res: Response) => {
  try {
    const orgs = await prisma.organization.findMany({
      where: req.user?.role === 'SUPER_ADMIN' ? {} : {
        members: {
          some: { userId: req.user?.id }
        }
      },
      include: {
        buildings: {
          select: { id: true, name: true, buildingType: true }
        },
        _count: {
          select: { buildings: true, meters: true, members: true }
        }
      }
    });
    return res.json({ organizations: orgs });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getOrganizationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        buildings: {
          include: {
            departments: true,
            rooms: true,
            meters: true,
            solar: true,
            batteries: true
          }
        },
        tariffs: {
          include: { periods: true }
        },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    return res.json({ organization: org });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateOrganization = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, industryType, address, timezone, currency } = req.body;
    const updated = await prisma.organization.update({
      where: { id },
      data: { name, industryType, address, timezone, currency }
    });
    return res.json({ organization: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
