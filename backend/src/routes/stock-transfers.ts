import { Router } from 'express';
import { StockTransferController } from '../controllers/StockTransferController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', StockTransferController.getAll);
router.get('/:id', StockTransferController.getById);
router.post('/', authorize(['admin', 'manager', 'depot_staff']), StockTransferController.create);
router.post('/:id/complete', authorize(['admin', 'manager', 'depot_staff']), StockTransferController.complete);

export default router;
