import { Router } from 'express';
import multer from 'multer';
import {
  previewCsv,
  getEnergyReadings,
  getEnergySummary,
  getEnergyTrends,
  getBuildingComparison,
  getEnergySources,
  getTelemetryStatus,
  ingestTelemetry,
} from './energy.controller';
import { authenticate, requireOrg, requireRole } from '../../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate);

router.get('/telemetry/status', requireOrg, getTelemetryStatus);
router.post('/telemetry', requireOrg, requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']), ingestTelemetry);
router.post('/preview', upload.single('file'), previewCsv);
router.post('/upload', (_req, res) => res.status(410).json({ error: 'CSV uploads now use the provenance-aware dataset import workflow at POST /api/v1/imports.' }));
router.get('/readings', getEnergyReadings);
router.get('/sources', getEnergySources);
router.get('/summary', getEnergySummary);
router.get('/trends', getEnergyTrends);
router.get('/building-comparison', getBuildingComparison);

export default router;
