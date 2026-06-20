import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { companySettingsSchema } from '../validation/schemas';
import { companySettingsService } from '../services/CompanySettingsService';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/company-settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await companySettingsService.getSettings();
    res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error('Erreur GET /api/company-settings:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des paramètres' });
  }
});

// PUT /api/company-settings (Only admin and manager can edit)
router.put('/', authorize(['admin', 'manager']), validateBody(companySettingsSchema), async (req: Request, res: Response) => {
  try {
    const updated = await companySettingsService.updateSettings(req.body);
    res.json({ success: true, data: updated, message: 'Paramètres mis à jour avec succès' });
  } catch (error: any) {
    console.error('Erreur PUT /api/company-settings:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour des paramètres' });
  }
});

export default router;
