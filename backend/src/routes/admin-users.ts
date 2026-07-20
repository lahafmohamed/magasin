import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AdminUserController } from '../controllers/AdminUserController';
import { validateBody } from '../middleware/validation';
import { adminCreateUserSchema, adminUpdateUserSchema } from '../validation/schemas';

const router = Router();

// User administration is admin-only.
router.use(authenticate, authorize(['admin']));

router.get('/', AdminUserController.getUsers);
router.post('/', validateBody(adminCreateUserSchema), AdminUserController.createUser);
router.put('/:id', validateBody(adminUpdateUserSchema), AdminUserController.updateUser);

router.get('/roles', AdminUserController.getRoles);

export default router;
