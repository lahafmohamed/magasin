import { Router } from 'express';
import { ReturnController } from '../controllers/ReturnController';
import { validateBody } from '../middleware/validation';
import { createReturnSchema } from '../validation/phase3-schemas';
import { updateReturnStatutSchema } from '../validation/schemas';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', ReturnController.getAll);
router.get('/stats', ReturnController.getStats);
router.get('/:id', ReturnController.getById);
router.post('/', authorize(['admin', 'manager']), validateBody(createReturnSchema), ReturnController.create);
router.put('/:id/statut', authorize(['admin', 'manager']), validateBody(updateReturnStatutSchema), ReturnController.updateStatut);

export default router;
