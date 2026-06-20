import { Request, Response } from 'express';
import { reportingService } from '../services/ReportingService';

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
      const data = await reportingService.getReceivablesAging();
      res.json({ success: true, data });
    } catch (error) {
      consoleError('GET /api/reports/receivables', error);
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

function consoleError(context: string, error: any) {
  console.error(`Erreur ${context}:`, error);
}
