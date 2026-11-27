import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { authenticate, requireOrg, requireRole } from '../../middleware/auth';
import { config } from '../../config';
import { requireEntitlement } from '../organizations/subscription.service';
import {
  createDatasetImport,
  getImportBatch,
  getImportHistory,
  getImportRejectionsCsv,
} from './import.controller';

fs.mkdirSync(config.importStorageDir, { recursive: true, mode: 0o700 });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.importStorageDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() === '.csv' ? '.csv' : '.upload';
    callback(null, `${randomUUID()}${extension}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 4, fields: 16 } });
const router = Router();

router.use(authenticate, requireOrg);
router.post(
  '/',
  requireRole(['ORG_ADMIN', 'ENERGY_MANAGER']),
  requireEntitlement('importsPerMonth'),
  upload.fields([
    { name: 'readings', maxCount: 1 },
    { name: 'metadata', maxCount: 1 },
    { name: 'weather', maxCount: 1 },
    { name: 'occupancy', maxCount: 1 },
  ]),
  createDatasetImport,
);
router.get('/', getImportHistory);
router.get('/:id/rejections.csv', getImportRejectionsCsv);
router.get('/:id', getImportBatch);

export default router;
