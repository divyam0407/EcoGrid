import { Router } from 'express';
import multer from 'multer';
import {
  getSchedules,
  createSchedule,
  uploadScheduleCsv,
  correlateOperationalIntelligence,
} from './schedule.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.get('/', getSchedules);
router.post('/', createSchedule);
router.post('/upload', upload.single('file'), uploadScheduleCsv);
router.get('/correlate', correlateOperationalIntelligence);

export default router;
