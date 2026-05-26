import { Router } from 'express';
import { FactureFournisseurController } from '../controllers/FactureFournisseurController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', FactureFournisseurController.getAll);
router.get('/payable', FactureFournisseurController.getPayableInvoices);
router.get('/stats', FactureFournisseurController.getStats);
router.get('/:id', FactureFournisseurController.getById);
router.post('/', authorize(['admin', 'manager']), FactureFournisseurController.create);
router.post('/:id/paiement', authorize(['admin', 'manager']), FactureFournisseurController.recordPayment);

export default router;
