import { Router } from 'express';
import { AttachmentController } from '../controllers/AttachmentController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', AttachmentController.list);
router.get('/:id/download', AttachmentController.download);
router.post('/', AttachmentController.create);
router.delete('/:id', authorize(['admin', 'manager']), AttachmentController.remove);

export default router;
