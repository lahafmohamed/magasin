import { Router } from 'express';
import { ReportingController } from '../controllers/ReportingController';
import { authenticate, authorize } from '../middleware/auth';
import { validateQuery } from '../middleware/validation';
import { receivablesReportQuerySchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);
router.use(authorize(['admin', 'manager']));

router.get('/dashboard', ReportingController.getDashboardKPIs);
router.get('/pnl', ReportingController.getPnL);
router.get('/receivables/export', validateQuery(receivablesReportQuerySchema), ReportingController.exportReceivablesAging);
router.get('/receivables', validateQuery(receivablesReportQuerySchema), ReportingController.getReceivablesAging);
router.get('/inventory', ReportingController.getInventoryValuation);
router.get('/turnover', ReportingController.getInventoryTurnover);
router.get('/sales-by-category', ReportingController.getSalesByCategory);
router.get('/products', ReportingController.getProductPerformance);
router.get('/margins', ReportingController.getMarginsReport);
router.get('/revenue-trends', ReportingController.getRevenueTrends);
router.get('/yoy', ReportingController.getYoYComparison);
router.get('/forecast', ReportingController.getRevenueForecast);
router.get('/consolidated', ReportingController.getConsolidatedDashboard);
router.get('/alerts', ReportingController.getAlerts);

export default router;
