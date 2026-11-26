import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  jwtSecret: process.env.JWT_SECRET || 'ecogrid-super-secret-jwt-key-2026',
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

export const prisma = new PrismaClient();
