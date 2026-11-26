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
    const org = await prisma.organization.findFirst({
      where: { id, ...(req.user?.role === 'SUPER_ADMIN' ? {} : { members: { some: { userId: req.user?.id, organizationId: id } } }) },
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
    if (req.user?.role !== 'SUPER_ADMIN' && req.user?.organizationId !== id) return res.status(403).json({ error: 'Organization scope mismatch.' });
    if (req.user?.role !== 'SUPER_ADMIN' && !['ORG_ADMIN'].includes(req.user?.role || '')) return res.status(403).json({ error: 'Organization administrator role is required.' });
    const updated = await prisma.organization.updateMany({
      where: { id, ...(req.user?.role === 'SUPER_ADMIN' ? {} : { members: { some: { userId: req.user?.id, organizationId: id } } }) },
      data: { name, industryType, address, timezone, currency }
    });
    if (!updated.count) return res.status(404).json({ error: 'Organization not found.' });
    const org = await prisma.organization.findUnique({ where: { id } });
    return res.json({ organization: org });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
