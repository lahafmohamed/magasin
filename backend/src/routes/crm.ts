import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  createCrmInteractionSchema,
  updateCrmInteractionSchema,
  createCrmTacheSchema,
  updateCrmTacheStatutSchema,
} from '../validation/schemas';
import { crmService } from '../services/CrmService';

const router = Router();
router.use(authenticate);
// Mutating CRM operations are restricted to admin/manager
const canWrite = authorize('admin', 'manager');

// ========== INTERACTIONS ==========

router.get('/interactions', async (req: Request, res: Response) => {
  try {
    const data = await crmService.getAllInteractions({
      tiers_id: req.query.tiers_id ? parseInt(req.query.tiers_id as string) : undefined,
      type: req.query.type as string,
      statut: req.query.statut as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('GET /api/crm/interactions error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.get('/interactions/:tiersId', async (req: Request, res: Response) => {
  try {
    const data = await crmService.getInteractions(parseInt(req.params.tiersId));
    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/crm/interactions/:tiersId error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/interactions', canWrite, validateBody(createCrmInteractionSchema), async (req: Request, res: Response) => {
  try {
    const interaction = await crmService.createInteraction({
      ...req.body,
      cree_par: (req as any).user?.id,
    });
    res.status(201).json({ success: true, data: interaction });
  } catch (error) {
    console.error('POST /api/crm/interactions error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.put('/interactions/:id', canWrite, validateBody(updateCrmInteractionSchema), async (req: Request, res: Response) => {
  try {
    const interaction = await crmService.updateInteraction(parseInt(req.params.id), req.body);
    if (!interaction) {
      res.status(404).json({ success: false, error: 'Interaction introuvable' });
      return;
    }
    res.json({ success: true, data: interaction });
  } catch (error) {
    console.error('PUT /api/crm/interactions error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.delete('/interactions/:id', canWrite, async (req: Request, res: Response) => {
  try {
    const deleted = await crmService.deleteInteraction(parseInt(req.params.id));
    res.json({ success: true, data: deleted });
  } catch (error) {
    console.error('DELETE /api/crm/interactions error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ========== TÂCHES ==========

router.get('/taches', async (req: Request, res: Response) => {
  try {
    const data = await crmService.getTaches({
      tiers_id: req.query.tiers_id ? parseInt(req.query.tiers_id as string) : undefined,
      statut: req.query.statut as string,
      assigne_a: req.query.assigne_a ? parseInt(req.query.assigne_a as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('GET /api/crm/taches error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/taches', canWrite, validateBody(createCrmTacheSchema), async (req: Request, res: Response) => {
  try {
    const tache = await crmService.createTache({
      ...req.body,
      cree_par: (req as any).user?.id,
    });
    res.status(201).json({ success: true, data: tache });
  } catch (error) {
    console.error('POST /api/crm/taches error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.patch('/taches/:id/statut', canWrite, validateBody(updateCrmTacheStatutSchema), async (req: Request, res: Response) => {
  try {
    const tache = await crmService.updateTacheStatut(parseInt(req.params.id), req.body.statut);
    if (!tache) {
      res.status(404).json({ success: false, error: 'Tâche introuvable' });
      return;
    }
    res.json({ success: true, data: tache });
  } catch (error) {
    console.error('PATCH /api/crm/taches/:id/statut error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.delete('/taches/:id', canWrite, async (req: Request, res: Response) => {
  try {
    const deleted = await crmService.deleteTache(parseInt(req.params.id));
    res.json({ success: true, data: deleted });
  } catch (error) {
    console.error('DELETE /api/crm/taches error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ========== RAPPELS ==========

router.get('/rappels', async (_req: Request, res: Response) => {
  try {
    const rappels = await crmService.getRappelsEnAttente();
    res.json({ success: true, data: rappels });
  } catch (error) {
    console.error('GET /api/crm/rappels error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/rappels/:id/done', canWrite, async (req: Request, res: Response) => {
  try {
    await crmService.marquerRappelFait(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/crm/rappels/:id/done error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export default router;
