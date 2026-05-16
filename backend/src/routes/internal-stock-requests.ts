import { Router } from 'express';
import { InternalStockRequestController } from '../controllers/InternalStockRequestController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', InternalStockRequestController.getAll);
router.get('/:id', InternalStockRequestController.getById);

router.post('/', authorize(['admin', 'manager', 'caissier']), InternalStockRequestController.create);
router.post('/:id/validate', authorize(['admin', 'manager', 'depot_staff']), InternalStockRequestController.validate);
router.post('/:id/reject', authorize(['admin', 'manager', 'depot_staff']), InternalStockRequestController.reject);
router.post('/:id/execute', authorize(['admin', 'manager', 'depot_staff']), InternalStockRequestController.execute);

export default router;
