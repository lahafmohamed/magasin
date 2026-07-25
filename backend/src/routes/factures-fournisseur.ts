import { Router } from 'express';
import { FactureFournisseurController } from '../controllers/FactureFournisseurController';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  createFactureFournisseurSchema,
  recordFactureFournisseurPaiementSchema,
  updateMatchConfigSchema,
} from '../validation/schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', FactureFournisseurController.getAll);
router.get('/payable', FactureFournisseurController.getPayableInvoices);
router.get('/stats', FactureFournisseurController.getStats);
router.get('/match-config', FactureFournisseurController.getMatchConfig);
router.put('/match-config', authorize(['admin']), validateBody(updateMatchConfigSchema), FactureFournisseurController.updateMatchConfig);
router.get('/:id', FactureFournisseurController.getById);
router.post('/', authorize(['admin', 'manager']), validateBody(createFactureFournisseurSchema), FactureFournisseurController.create);
router.post('/:id/paiement', authorize(['admin', 'manager']), validateBody(recordFactureFournisseurPaiementSchema), FactureFournisseurController.recordPayment);

export default router;
