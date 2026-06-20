import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuditService } from '../services/AuditService';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/', async (req: Request, res: Response) => {
  try {
    const { table, record_id, action, date_from, date_to, user_id, page, limit } = req.query;
    const result = await AuditService.getLogs({
      table: table as string,
      record_id: record_id ? parseInt(record_id as string) : undefined,
      action: action as string,
      date_from: date_from as string,
      date_to: date_to as string,
      user_id: user_id ? parseInt(user_id as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
    });
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error: any) {
    console.error('GET /api/admin/audit error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des logs d\'audit' });
  }
});

export default router;
