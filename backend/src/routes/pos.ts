import { Router } from 'express';
import { POSController } from '../controllers/POSController';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { openPosSessionSchema, posQuickSaleSchema } from '../validation/schemas';

const router = Router();

// All POS routes require authentication
router.use(authenticate);
// POS is operated by cashiers / shop staff (and admins/managers)
const posRoles = authorize('admin', 'manager', 'magasin_staff', 'caissier');

// Session management
router.post('/open', posRoles, validateBody(openPosSessionSchema), POSController.openSession);
router.get('/session', POSController.getCurrentSession);
router.post('/:sessionId/close', posRoles, POSController.closeSession);
router.get('/:sessionId/summary', POSController.getSessionSummary);

// Barcode scanning
router.get('/scan', POSController.scanBarcode);

// Quick sale
router.post('/sale', posRoles, validateBody(posQuickSaleSchema), POSController.processQuickSale);

export default router;
