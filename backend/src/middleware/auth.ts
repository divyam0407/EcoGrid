import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config, prisma } from '../config';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    const user = await prisma.user.findUnique({ where: { id: String(decoded.id || '') }, select: {
      id: true, name: true, email: true, status: true, tokenVersion: true, isPlatformAdmin: true,
    } });
    if (!user || user.status !== 'ACTIVE' || Number(decoded.tokenVersion ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    const organizationId = String(decoded.organizationId || '');
    const membership = user.isPlatformAdmin ? null : await prisma.organizationMember.findFirst({
      where: { userId: user.id, organizationId, status: 'ACTIVE' }, select: { role: true },
    });
    if (!user.isPlatformAdmin && !membership) return res.status(401).json({ error: 'Invalid or expired token.' });
    if (user.isPlatformAdmin && !await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.isPlatformAdmin ? 'SUPER_ADMIN' : membership!.role,
      organizationId,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
    }
    next();
  };
};

export const requireOrg = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.organizationId) {
    return res.status(400).json({ error: 'Organization context missing.' });
  }
  next();
};

export const requireOrganizationMembership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.organizationId) return res.status(401).json({ error: 'Organization context is required.' });
    if (req.user.role === 'SUPER_ADMIN') return next();
    const membership = await prisma.organizationMember.findFirst({ where: { userId: req.user.id, organizationId: req.user.organizationId, status: 'ACTIVE' } });
    if (!membership) return res.status(403).json({ error: 'Active organization membership is required.' });
    return next();
  } catch { return res.status(500).json({ error: 'Could not verify organization membership.' }); }
};
