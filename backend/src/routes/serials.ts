import { Router } from 'express';
import { SerialController } from '../controllers/SerialController';
import { validateBody } from '../middleware/validation';
import { registerSerialSchema, markSerialSoldSchema, markSerialWarrantySchema } from '../validation/schemas';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication.
router.use(authenticate);

const canManageSerials = authorize('admin', 'manager', 'depot_staff');

// Reads — open to any authenticated user.
router.get('/lookup', SerialController.lookup);
router.get('/', SerialController.getAll);
router.get('/:id', SerialController.getById);

// Writes — restricted.
router.post('/', canManageSerials, validateBody(registerSerialSchema), SerialController.register);
router.patch('/:id/sold', canManageSerials, validateBody(markSerialSoldSchema), SerialController.markSold);
router.patch('/:id/warranty', canManageSerials, validateBody(markSerialWarrantySchema), SerialController.markUnderWarranty);

export default router;
