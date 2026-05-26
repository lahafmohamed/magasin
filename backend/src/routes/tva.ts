import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { TauxTvaController } from '../controllers/TauxTvaController';

const router = Router();

// Lecture seule des taux actifs - accessible à tout utilisateur authentifié (facturation)
router.use(authenticate);

router.get('/active', TauxTvaController.getActive);

export default router;
