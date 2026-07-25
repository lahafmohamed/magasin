import { Request, Response } from 'express';
import { consoleError } from '../utils/logError';
import { ReceivableBucket, reportingService } from '../services/ReportingService';
import { EXPORT_MAX_ROWS, parsePagination } from '../utils/pagination';

export class ReportingController {

  static async getDashboardKPIs(req: Request, res: Response): Promise<void> {
    try {
      const data = await reportingService.getDashboardKPIs();
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/dashboard', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getPnL(req: Request, res: Response): Promise<void> {
    try {
      const { date_debut, date_fin } = req.query;
      if (!date_debut || !date_fin) {
        res.status(400).json({ success: false, error: 'date_debut et date_fin requis' });
        return;
      }
      const data = await reportingService.getPnL(date_debut as string, date_fin as string);
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/pnl', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getReceivablesAging(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit } = parsePagination(req.query as Record<string, any>, { limit: 20 });
      const result = await reportingService.getReceivablesAging({
        search: req.query.search as string | undefined,
        minAmount: req.query.min_amount === undefined ? undefined : Number(req.query.min_amount),
        bucket: req.query.bucket as ReceivableBucket | undefined,
        locationId: req.query.location_id === undefined ? undefined : Number(req.query.location_id),
        page,
        limit,
      });
      res.json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        summary: {
          montant_total: result.montantTotal,
        },
      });
    } catch (error) {
      consoleError('GET /api/reports/receivables', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async exportReceivablesAging(req: Request, res: Response): Promise<void> {
    try {
      const result = await reportingService.getReceivablesAging({
        search: req.query.search as string | undefined,
        minAmount: req.query.min_amount === undefined ? undefined : Number(req.query.min_amount),
        bucket: req.query.bucket as ReceivableBucket | undefined,
        locationId: req.query.location_id === undefined ? undefined : Number(req.query.location_id),
        page: 1,
        limit: EXPORT_MAX_ROWS,
      });
      res.json({
        success: true,
        data: result.data,
        total: result.total,
        truncated: result.total > EXPORT_MAX_ROWS,
      });
    } catch (error) {
      consoleError('GET /api/reports/receivables/export', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getInventoryValuation(req: Request, res: Response): Promise<void> {
    try {
      const data = await reportingService.getInventoryValuation();
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/inventory', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getInventoryTurnover(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const data = await reportingService.getInventoryTurnover(days);
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/turnover', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getSalesByCategory(req: Request, res: Response): Promise<void> {
    try {
      const { date_debut, date_fin } = req.query;
      if (!date_debut || !date_fin) {
        res.status(400).json({ success: false, error: 'date_debut et date_fin requis' });
        return;
      }
      const data = await reportingService.getSalesByCategory(date_debut as string, date_fin as string);
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/sales-by-category', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getProductPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { date_debut, date_fin, limit } = req.query;
      if (!date_debut || !date_fin) {
        res.status(400).json({ success: false, error: 'date_debut et date_fin requis' });
        return;
      }
      const data = await reportingService.getProductPerformance(
        date_debut as string,
        date_fin as string,
        parseInt(limit as string) || 20
      );
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/products', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getMarginsReport(req: Request, res: Response): Promise<void> {
    try {
      const { date_debut, date_fin } = req.query;
      if (!date_debut || !date_fin) {
        res.status(400).json({ success: false, error: 'date_debut et date_fin requis' });
        return;
      }
      const data = await reportingService.getMarginsReport(date_debut as string, date_fin as string);
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/margins', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getRevenueTrends(req: Request, res: Response): Promise<void> {
    try {
      const months = parseInt(req.query.months as string) || 12;
      const data = await reportingService.getRevenueTrends(months);
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/revenue-trends', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getYoYComparison(req: Request, res: Response): Promise<void> {
    try {
      const months = parseInt(req.query.months as string) || 6;
      const data = await reportingService.getYoYComparison(months);
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/yoy', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getRevenueForecast(req: Request, res: Response): Promise<void> {
    try {
      const data = await reportingService.getRevenueForecast();
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/forecast', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getConsolidatedDashboard(req: Request, res: Response): Promise<void> {
    try {
      const magasinId = req.query.magasin_id ? parseInt(req.query.magasin_id as string) : undefined;
      const data = await reportingService.getConsolidatedDashboard(magasinId);
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/consolidated', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const data = await reportingService.getAlerts();
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/alerts', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}
