import { Router } from 'express';
import multer from 'multer';
import {
  previewCsv,
  uploadEnergyCsv,
  getEnergyReadings,
  getEnergySummary,
  getEnergyTrends,
  getBuildingComparison,
} from './energy.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate);

router.post('/preview', upload.single('file'), previewCsv);
router.post('/upload', upload.single('file'), uploadEnergyCsv);
router.get('/readings', getEnergyReadings);
router.get('/summary', getEnergySummary);
router.get('/trends', getEnergyTrends);
router.get('/building-comparison', getBuildingComparison);

export default router;
