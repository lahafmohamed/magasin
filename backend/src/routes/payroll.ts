import { Router } from 'express';
import { PayrollController } from '../controllers/PayrollController';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  createPayrollRunSchema,
  updatePayslipSchema,
  markPayrollPaidSchema,
  updateCotisationSchema,
  replaceBaremesSchema,
} from '../validation/schemas';

const router = Router();

router.use(authenticate);

// Payroll is sensitive HR/finance data: admin + manager only.
const hrFinance = authorize(['admin', 'manager']);

router.get('/', hrFinance, PayrollController.getAll);
router.get('/stats', hrFinance, PayrollController.getStats);
// Statutory config (CNPS cotisations + ITS brackets) — must precede '/:id'.
router.get('/config', hrFinance, PayrollController.getConfig);
router.put('/config/cotisations/:id', authorize(['admin']), validateBody(updateCotisationSchema), PayrollController.updateCotisation);
router.put('/config/baremes', authorize(['admin']), validateBody(replaceBaremesSchema), PayrollController.replaceBaremes);

router.get('/payslips/:payslipId/pdf', hrFinance, PayrollController.payslipPDF);
router.put('/payslips/:payslipId', hrFinance, validateBody(updatePayslipSchema), PayrollController.updatePayslip);

router.get('/:id', hrFinance, PayrollController.getById);
router.post('/', hrFinance, validateBody(createPayrollRunSchema), PayrollController.create);
router.post('/:id/valider', hrFinance, PayrollController.validate);
router.post('/:id/payer', hrFinance, validateBody(markPayrollPaidSchema), PayrollController.markPaid);
router.post('/:id/annuler', hrFinance, PayrollController.cancel);
router.delete('/:id', authorize(['admin']), PayrollController.remove);

export default router;
