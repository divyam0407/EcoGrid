import { Router } from 'express';
import { getDepartments, createDepartment } from './department.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', getDepartments);
router.post('/', createDepartment);

export default router;
