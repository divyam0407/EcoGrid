import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, config } from '../../config';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, organizationName, industryType } = req.body;
    if (!name || !email || !password || !organizationName) {
      return res.status(400).json({ error: 'Name, email, password, and organization name are required.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create organization and user transactionally
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: organizationName,
          industryType: industryType || 'HIGHER_EDUCATION',
          currency: 'USD',
          timezone: 'UTC',
        },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          status: 'ACTIVE',
        },
      });

      const member = await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'ORG_ADMIN',
        },
      });

      // Create default tariff
      const tariff = await tx.electricityTariff.create({
        data: {
          organizationId: org.id,
          tariffName: 'Campus Time-of-Use Standard',
          tariffType: 'TIME_OF_USE',
          pricePerKwh: 0.15,
        },
      });

      await tx.tariffPeriod.createMany({
        data: [
          { tariffId: tariff.id, periodName: 'OFF_PEAK', startTime: '00:00', endTime: '06:00', pricePerKwh: 0.08, dayType: 'ALL' },
          { tariffId: tariff.id, periodName: 'STANDARD', startTime: '06:00', endTime: '14:00', pricePerKwh: 0.15, dayType: 'ALL' },
          { tariffId: tariff.id, periodName: 'PEAK', startTime: '14:00', endTime: '20:00', pricePerKwh: 0.28, dayType: 'ALL' },
          { tariffId: tariff.id, periodName: 'STANDARD', startTime: '20:00', endTime: '24:00', pricePerKwh: 0.14, dayType: 'ALL' },
        ],
      });

      return { org, user, member };
    });

    const token = jwt.sign(
      {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.member.role,
        organizationId: result.org.id,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Registration successful.',
      token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.member.role,
        organization: {
          id: result.org.id,
          name: result.org.name,
          industryType: result.org.industryType,
        },
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during registration.' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const primaryMembership = user.memberships[0];
    if (!primaryMembership) {
      return res.status(403).json({ error: 'User does not belong to any organization.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: primaryMembership.role,
        organizationId: primaryMembership.organizationId,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: primaryMembership.role,
        organization: {
          id: primaryMembership.organization.id,
          name: primaryMembership.organization.name,
          industryType: primaryMembership.organization.industryType,
          currency: primaryMembership.organization.currency,
          timezone: primaryMembership.organization.timezone,
        },
        organizations: user.memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          role: m.role,
        })),
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during login.' });
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const activeMembership = user.memberships.find(
      (m) => m.organizationId === req.user?.organizationId
    ) || user.memberships[0];

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: activeMembership.role,
        organization: activeMembership.organization,
        organizations: user.memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          role: m.role,
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch user profile.' });
  }
};
