import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in the backend environment.');
}

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  jwtSecret: process.env.JWT_SECRET,
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000',
  importServiceToken: process.env.IMPORT_SERVICE_TOKEN || '',
  importStorageDir: path.resolve(process.env.IMPORT_STORAGE_DIR || './imports'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

export const prisma = new PrismaClient();
