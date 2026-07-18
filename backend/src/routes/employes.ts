import { Router } from 'express';
import { EmployeController } from '../controllers/EmployeController';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  createEmployeSchema,
  updateEmployeSchema,
  recordEmployeCommissionSchema,
  recordEmployeShiftSchema,
} from '../validation/schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Employee data (incl. salary/commission) is sensitive — restrict all access to admin/manager
const hrAccess = authorize(['admin', 'manager']);
router.get('/', hrAccess, EmployeController.getAll);
router.get('/stats', hrAccess, EmployeController.getStats);
router.get('/:id', hrAccess, EmployeController.getById);
router.post('/', hrAccess, validateBody(createEmployeSchema), EmployeController.create);
router.put('/:id', hrAccess, validateBody(updateEmployeSchema), EmployeController.update);
router.post('/:id/commission', hrAccess, validateBody(recordEmployeCommissionSchema), EmployeController.recordCommission);
router.get('/:id/commissions', hrAccess, EmployeController.getCommissions);
router.get('/:id/commission-summary', hrAccess, EmployeController.getCommissionSummary);
router.post('/shifts', hrAccess, validateBody(recordEmployeShiftSchema), EmployeController.recordShift);

export default router;
