import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || '';
const importServiceToken = process.env.IMPORT_SERVICE_TOKEN || '';
const databaseUrl = process.env.DATABASE_URL || '';
const demoTelemetryEnabled = process.env.DEMO_TELEMETRY_ENABLED === 'true';
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
if (importServiceToken.length < 32) throw new Error('IMPORT_SERVICE_TOKEN must contain at least 32 characters.');
if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) throw new Error('DATABASE_URL must use PostgreSQL.');
if (nodeEnv === 'production' && (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.split(',').some((origin) => origin.trim() === '*'))) {
  throw new Error('Production requires explicit CORS_ORIGIN values; wildcard origins are not allowed.');
}

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
const accessTokenSeconds = Number(process.env.JWT_ACCESS_TTL_SECONDS || 900);
if (!Number.isInteger(accessTokenSeconds) || accessTokenSeconds < 300 || accessTokenSeconds > 3600) {
  throw new Error('JWT_ACCESS_TTL_SECONDS must be an integer between 300 and 3600.');
}

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv,
  jwtSecret,
  accessTokenSeconds,
  refreshTokenDays: 30,
  cookieSameSite: (process.env.COOKIE_SAME_SITE || 'lax') as 'lax' | 'strict' | 'none',
  corsOrigins,
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000',
  importServiceToken,
  importStorageDir: path.resolve(process.env.IMPORT_STORAGE_DIR || './imports'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  demoTelemetryEnabled,
};

export const prisma = new PrismaClient();
