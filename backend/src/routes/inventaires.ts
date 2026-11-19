import { Router } from 'express';
import { InventaireController } from '../controllers/InventaireController';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validation';
import {
  compterInventaireSchema,
  createInventaireSchema,
  inventaireLignesQuerySchema,
  validerInventaireSchema,
} from '../validation/inventaire-schemas';

const router = Router();

router.use(authenticate);

/** Ceux qui comptent : le dépôt et le magasin, en plus des responsables. */
const COMPTEURS = ['admin', 'manager', 'depot_staff', 'magasin_staff'];
/** Ouvrir, valider, annuler : la validation ajuste le stock, elle revient au gérant. */
const RESPONSABLES = ['admin', 'manager'];

router.get('/', authorize(COMPTEURS), InventaireController.getAll);
router.get('/:id', authorize(COMPTEURS), InventaireController.getById);
router.get(
  '/:id/lignes',
  authorize(COMPTEURS),
  validateQuery(inventaireLignesQuerySchema),
  InventaireController.getLignes
);

router.post('/', authorize(RESPONSABLES), validateBody(createInventaireSchema), InventaireController.create);
router.post(
  '/:id/comptages',
  authorize(COMPTEURS),
  validateBody(compterInventaireSchema),
  InventaireController.compter
);
router.delete('/:id/lignes/:ligneId/comptage', authorize(COMPTEURS), InventaireController.effacerComptage);
router.post('/:id/valider', authorize(RESPONSABLES), validateBody(validerInventaireSchema), InventaireController.valider);
router.post('/:id/annuler', authorize(RESPONSABLES), InventaireController.annuler);

export default router;
