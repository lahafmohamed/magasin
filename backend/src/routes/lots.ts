import { Router } from 'express';
import { LotController } from '../controllers/LotController';
import { validateBody } from '../middleware/validation';
import { createLotSchema, adjustLotQuantiteSchema } from '../validation/schemas';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication.
router.use(authenticate);

const canManageLots = authorize('admin', 'manager', 'depot_staff');

// Reads — open to any authenticated user.
router.get('/expiring', LotController.getExpiring);
router.get('/', LotController.getAll);
router.get('/:id', LotController.getById);

// Writes — restricted.
router.post('/', canManageLots, validateBody(createLotSchema), LotController.create);
router.patch('/:id/quantite', canManageLots, validateBody(adjustLotQuantiteSchema), LotController.adjustQuantity);

// Maintenance — admin only. Runs the orphaned expire_old_lots() DB function.
router.post('/expire-run', authorize('admin'), LotController.runExpire);

export default router;
