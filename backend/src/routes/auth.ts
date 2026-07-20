import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { loginSchema, changePasswordSchema, registerSchema } from '../validation/schemas';

const router = Router();

// Public routes
router.post('/login', validateBody(loginSchema), AuthController.login);
router.post('/logout', authenticate, AuthController.logout);

// Protected routes
router.post('/register', authenticate, authorize('admin'), validateBody(registerSchema), AuthController.register);
router.get('/me', authenticate, AuthController.me);
router.put('/change-password', authenticate, validateBody(changePasswordSchema), AuthController.changePassword);
router.post('/revoke-all-sessions/:userId', authenticate, authorize('admin'), AuthController.revokeAllSessions);

// Admin routes
router.get('/users', authenticate, authorize('admin'), AuthController.getAllUsers);
router.put('/users/:id', authenticate, authorize('admin'), AuthController.updateUser);

export default router;
