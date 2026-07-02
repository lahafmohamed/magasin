import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AdminUserController } from '../controllers/AdminUserController';

const router = Router();

// User administration is admin-only.
router.use(authenticate, authorize(['admin']));

router.get('/', AdminUserController.getUsers);
router.post('/', AdminUserController.createUser);
router.put('/:id', AdminUserController.updateUser);

router.get('/roles', AdminUserController.getRoles);

export default router;
