import { Router } from 'express';
import { StockLocationController } from '../controllers/StockLocationController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', StockLocationController.getAll);
router.get('/:id', StockLocationController.getById);
router.post('/', authorize(['admin', 'manager']), StockLocationController.create);
router.put('/:id', authorize(['admin', 'manager']), StockLocationController.update);
router.delete('/:id', authorize(['admin', 'manager']), StockLocationController.deactivate);
router.get('/:id/stock', StockLocationController.getStockLevels);
router.get('/:id/products-with-stock', StockLocationController.getProductsWithStock);

export default router;
