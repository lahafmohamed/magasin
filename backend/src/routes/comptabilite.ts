/**
 * Comptabilité — ce que le grand livre (`/api/general-ledger`) ne couvre pas.
 *
 * Les lectures du grand livre (écritures, balance, plan comptable) vivaient ici
 * en double : `/plan-comptable`, `/ecritures`, `/balance` et `/journal` étaient
 * les jumeaux de `/chart-of-accounts`, `GET /`, `/trial-balance` et du filtre
 * `journal` côté general-ledger, avec deux écrans qui affichaient la même chose.
 * Ils ont été supprimés le 2026-09-07 au profit de `/api/general-ledger`.
 *
 * Il reste ici ce qui n'existe nulle part ailleurs : la saisie d'une pièce
 * (numérotation automatique + lien tiers + journal d'audit), le grand-livre d'un
 * compte par numéro, et la trésorerie prévisionnelle.
 */
import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { enregistrerPieceSchema } from '../validation/schemas';
import { comptabiliteService } from '../services/ComptabiliteService';
import { respondWithError } from '../utils/errors';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

// ========== SAISIE D'UNE PIÈCE ==========
// Seul chemin de saisie manuelle : il numérote la pièce lui-même
// (`piece_comptable_seq`), accepte un tiers par ligne et journalise l'audit.
router.post('/ecritures', validateBody(enregistrerPieceSchema), async (req: Request, res: Response) => {
  try {
    const result = await comptabiliteService.enregistrerPiece({
      ...req.body,
      cree_par: (req as any).user?.id,
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    respondWithError(res, error, 'POST /api/comptabilite/ecritures');
  }
});

// ========== GRAND-LIVRE ==========
// Par numéro de compte (le plan comptable est la clé métier côté utilisateur).
router.get('/grand-livre/:compteNumero', async (req: Request, res: Response) => {
  try {
    const data = await comptabiliteService.getGrandLivre(
      req.params.compteNumero,
      req.query.date_debut as string,
      req.query.date_fin as string
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/comptabilite/grand-livre error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ========== TRÉSORERIE PRÉVISIONNELLE ==========
router.get('/tresorerie', async (req: Request, res: Response) => {
  try {
    const jours = parseInt(req.query.jours as string) || 90;
    const data = await comptabiliteService.getTresoreriePrevisionnelle(jours);
    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/comptabilite/tresorerie error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export default router;
