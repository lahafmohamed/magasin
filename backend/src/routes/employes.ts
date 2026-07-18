import { Router } from 'express';
import { EmployeController } from '../controllers/EmployeController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Employee data (incl. salary/commission) is sensitive — restrict all access to admin/manager
const hrAccess = authorize(['admin', 'manager']);
router.get('/', hrAccess, EmployeController.getAll);
router.get('/stats', hrAccess, EmployeController.getStats);
router.get('/:id', hrAccess, EmployeController.getById);
router.post('/', hrAccess, EmployeController.create);
router.put('/:id', hrAccess, EmployeController.update);
router.post('/:id/commission', hrAccess, EmployeController.recordCommission);
router.get('/:id/commissions', hrAccess, EmployeController.getCommissions);
router.get('/:id/commission-summary', hrAccess, EmployeController.getCommissionSummary);
router.post('/shifts', hrAccess, EmployeController.recordShift);

export default router;
