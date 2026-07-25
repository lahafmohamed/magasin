import { Router } from 'express';
import { PaiementController } from '../controllers/PaiementController';
import { validateBody } from '../middleware/validation';
import { createPaiementSchema, updatePaiementSchema } from '../validation/schemas';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get all payments (with pagination and filters)
router.get('/', PaiementController.getAll);

// Get payment statistics
router.get('/stats', PaiementController.getStats);

// GET /api/paiements/:id/recu - Reçu de paiement (PDF)
router.get('/:id/recu', PaiementController.generateRecuPDF);

// Update a payment (admin, manager only)
router.put('/:id', authorize(['admin', 'manager']), validateBody(updatePaiementSchema), PaiementController.update);

// Delete a payment (admin only)
router.delete('/:id', authorize(['admin']), PaiementController.delete);

// Create standalone payment
router.post('/', authorize('admin', 'manager', 'magasin_staff', 'caissier'), validateBody(createPaiementSchema), PaiementController.create);

export default router;
