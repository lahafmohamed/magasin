import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { TauxTvaController } from '../controllers/TauxTvaController';

const router = Router();

// Toutes les routes nécessitent d'être authentifié et d'avoir la permission 'users.manage'
router.use(authenticate, requirePermission('users.manage'));

router.get('/', TauxTvaController.getAll);
router.post('/', TauxTvaController.create);
router.put('/:id', TauxTvaController.update);
router.delete('/:id', TauxTvaController.delete);

export default router;
