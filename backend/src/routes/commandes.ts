import { Router } from 'express';
import { CommandeController } from '../controllers/CommandeController';
import { validateBody } from '../middleware/validation';
import { createCommandeSchema, updateCommandeStatutSchema } from '../validation/schemas';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', CommandeController.getAll);
router.get('/stats', CommandeController.getStats);
router.get('/:id/match', CommandeController.getMatch);
// GET /api/commandes/:id/pdf - Bon de commande fournisseur
// The priced purchase order sent to the supplier (E2: not for dépôt staff).
router.get('/:id/pdf', authorize(['admin', 'manager']), CommandeController.generatePDF);
router.get('/:id', CommandeController.getById);
// E2 (2026-10-24): buying is for admin/manager — dépôt staff receive the
// goods (POST /receptions), they no longer create, edit or validate orders.
router.post('/', authorize(['admin', 'manager']), validateBody(createCommandeSchema), CommandeController.create);
router.put('/:id', authorize(['admin', 'manager']), validateBody(createCommandeSchema), CommandeController.update);
router.put('/:id/statut', authorize(['admin', 'manager']), validateBody(updateCommandeStatutSchema), CommandeController.updateStatut);
router.delete('/:id', authorize(['admin']), CommandeController.delete);

export default router;
