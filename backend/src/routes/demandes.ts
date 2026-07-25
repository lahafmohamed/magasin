import { Router } from 'express';
import { DemandeController } from '../controllers/DemandeController';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { createDemandeSchema, updateDemandeSchema, decideDemandeSchema } from '../validation/schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Role sets (previously expressed via the permissions.ts ROLE_PERMISSIONS matrix,
// now inlined as plain role gates — the single authz mechanism across the app).
const CAN_CREATE = ['admin', 'manager', 'magasin_staff', 'caissier'];
const CAN_EDIT_OWN = ['admin', 'magasin_staff']; // update / send / cancel / close
const CAN_DECIDE = ['admin', 'manager', 'depot_staff']; // decide / execute
const CAN_VIEW_DEPOT_STOCK = ['admin', 'manager', 'depot_staff', 'magasin_staff', 'viewer'];

// ============================================
// DEMANDE CRUD
// ============================================

// List demandes (role-filtered automatically)
router.get('/', DemandeController.getAll);

// Get single demande
router.get('/:id', DemandeController.getById);

// Create demande (magasin staff)
router.post('/', authorize(CAN_CREATE), validateBody(createDemandeSchema), DemandeController.create);

// Update demande (brouillon only, own demandes)
router.put('/:id', authorize(CAN_EDIT_OWN), validateBody(updateDemandeSchema), DemandeController.update);

// ============================================
// STATE TRANSITIONS
// ============================================

// Send demande (brouillon -> envoyee)
router.post('/:id/envoyer', authorize(CAN_EDIT_OWN), DemandeController.send);

// Decide (approve/reject) - depot staff
router.post('/:id/decider', authorize(CAN_DECIDE), validateBody(decideDemandeSchema), DemandeController.decide);

// Execute (create transfer) - depot staff
router.post('/:id/executer', authorize(CAN_DECIDE), DemandeController.execute);

// Close (magasin confirms receipt)
router.post('/:id/cloturer', authorize(CAN_EDIT_OWN), DemandeController.close);

// Cancel (brouillon or envoyee)
router.post('/:id/annuler', authorize(CAN_EDIT_OWN), DemandeController.cancel);

// ============================================
// UTILITY
// ============================================

// Get depot stock for magasin planning (read-only)
router.get('/stock/depot', authorize(CAN_VIEW_DEPOT_STOCK), DemandeController.getDepotStock);

export default router;
