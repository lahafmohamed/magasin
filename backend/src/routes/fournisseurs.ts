/**
 * DEPRECATED – /api/fournisseurs is a compatibility shim.
 * All new code should use /api/tiers?role=fournisseur instead.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { TiersController } from '../controllers/TiersController';
import { authenticate, authorize } from '../middleware/auth';
import { deprecateRoute } from '../middleware/deprecation';
import { validateBody } from '../middleware/validation';
import { createFournisseurSchema, updateFournisseurSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.use(deprecateRoute('/api/tiers'));

// GET /api/fournisseurs → GET /api/tiers?role=fournisseur
router.get('/', (req: Request, res: Response) => {
  req.query.role = 'fournisseur';
  TiersController.getAll(req, res);
});

// GET /api/fournisseurs/:id → GET /api/tiers/:id
router.get('/:id', TiersController.getById);

// POST /api/fournisseurs → POST /api/tiers (with est_fournisseur=true)
// Legacy-shape adaptation runs BEFORE validation so the tiers schema applies.
router.post(
  '/',
  authorize(['admin', 'manager', 'depot_staff']),
  (req: Request, _res: Response, next: NextFunction) => {
    req.body.est_fournisseur = true;
    req.body.est_client = req.body.est_client ?? false;
    if (!req.body.raison_sociale && req.body.nom) {
      req.body.raison_sociale = req.body.nom;
    }
    next();
  },
  validateBody(createFournisseurSchema),
  TiersController.create
);

// PUT /api/fournisseurs/:id → PUT /api/tiers/:id
router.put('/:id', authorize(['admin', 'manager', 'depot_staff']), validateBody(updateFournisseurSchema), TiersController.update);

// DELETE /api/fournisseurs/:id → DELETE /api/tiers/:id
router.delete('/:id', authorize(['admin']), TiersController.delete);

export default router;
