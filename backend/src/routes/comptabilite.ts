import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { comptabiliteService } from '../services/ComptabiliteService';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

// ========== PLAN COMPTABLE ==========
router.get('/plan-comptable', async (req: Request, res: Response) => {
  try {
    const classe = req.query.classe ? parseInt(req.query.classe as string) : undefined;
    const data = await comptabiliteService.getPlanComptable(classe);
    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/comptabilite/plan-comptable error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.get('/plan-comptable/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string || '';
    const data = await comptabiliteService.chercherCompte(query);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ========== ÉCRITURES ==========
router.get('/ecritures', async (req: Request, res: Response) => {
  try {
    const data = await comptabiliteService.getEcritures({
      date_debut: req.query.date_debut as string,
      date_fin: req.query.date_fin as string,
      journal: req.query.journal as string,
      compte_numero: req.query.compte_numero as string,
      tiers_id: req.query.tiers_id ? parseInt(req.query.tiers_id as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('GET /api/comptabilite/ecritures error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/ecritures', async (req: Request, res: Response) => {
  try {
    const result = await comptabiliteService.enregistrerPiece({
      ...req.body,
      cree_par: (req as any).user?.id,
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.error('POST /api/comptabilite/ecritures error:', error);
    res.status(400).json({ success: false, error: error.message || 'Erreur serveur' });
  }
});

// ========== GRAND-LIVRE ==========
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

// ========== BALANCE ==========
router.get('/balance', async (req: Request, res: Response) => {
  try {
    const data = await comptabiliteService.getBalance(
      req.query.date_debut as string,
      req.query.date_fin as string
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/comptabilite/balance error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ========== JOURNAL ==========
router.get('/journal', async (req: Request, res: Response) => {
  try {
    const data = await comptabiliteService.getJournal(
      req.query.date_debut as string,
      req.query.date_fin as string,
      req.query.journal as string
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/comptabilite/journal error:', error);
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

// ========== RATIOS FINANCIERS ==========
router.get('/ratios', async (req: Request, res: Response) => {
  try {
    const data = await comptabiliteService.getRatiosFinanciers(
      req.query.date_debut as string,
      req.query.date_fin as string
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/comptabilite/ratios error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export default router;
