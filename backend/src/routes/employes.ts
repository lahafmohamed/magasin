import { Router } from 'express';
import { EmployeController } from '../controllers/EmployeController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', EmployeController.getAll);
router.get('/stats', EmployeController.getStats);
router.get('/:id', EmployeController.getById);
router.post('/', authorize(['admin', 'manager']), EmployeController.create);
router.post('/:id/commission', authorize(['admin', 'manager']), EmployeController.recordCommission);
router.get('/:id/commissions', EmployeController.getCommissions);
router.get('/:id/commission-summary', EmployeController.getCommissionSummary);
router.post('/shifts', authorize(['admin', 'manager']), EmployeController.recordShift);

export default router;
