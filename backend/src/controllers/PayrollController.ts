import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { payrollService } from '../services/PayrollService';
import { pdfService } from '../services/PDFService';
import { successResponse, paginatedResponse } from '../utils/response';
import { businessStatusOf } from '../utils/errors';

export class PayrollController {
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { data, total } = await payrollService.listRuns(page, limit);
      paginatedResponse(res, data, total, page, limit, 'Cycles de paie récupérés');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async getStats(_req: AuthRequest, res: Response): Promise<void> {
    try {
      successResponse(res, await payrollService.getStats(), 'Statistiques paie');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const run = await payrollService.getRunById(parseInt(req.params.id));
      if (!run) { res.status(404).json({ success: false, error: 'Cycle introuvable' }); return; }
      successResponse(res, run, 'Cycle de paie récupéré');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const run = await payrollService.generateRun({
        periode: req.body.periode,
        notes: req.body.notes,
        cree_par: req.user?.id,
        req,
      });
      res.status(201).json({ success: true, data: run, message: 'Cycle de paie généré' });
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async updatePayslip(req: AuthRequest, res: Response): Promise<void> {
    try {
      const run = await payrollService.updatePayslip(
        parseInt(req.params.payslipId),
        { primes: req.body.primes, deductions: req.body.deductions, notes: req.body.notes },
        req.user?.id, req
      );
      successResponse(res, run, 'Bulletin mis à jour');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async getConfig(_req: AuthRequest, res: Response): Promise<void> {
    try {
      successResponse(res, await payrollService.getConfig(), 'Configuration paie');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async updateCotisation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ success: false, error: 'Identifiant invalide' }); return; }
      const data = await payrollService.updateCotisation(id, {
        taux_salarial: req.body.taux_salarial, taux_patronal: req.body.taux_patronal,
        plafond: req.body.plafond, actif: req.body.actif,
      });
      successResponse(res, data, 'Cotisation mise à jour');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async replaceBaremes(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!Array.isArray(req.body.baremes)) { res.status(400).json({ success: false, error: 'baremes (array) requis' }); return; }
      const data = await payrollService.replaceBaremes(req.body.baremes);
      successResponse(res, data, 'Barème ITS mis à jour');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async payslipPDF(req: AuthRequest, res: Response): Promise<void> {
    try {
      const payslipId = parseInt(req.params.payslipId);
      if (isNaN(payslipId)) { res.status(400).json({ success: false, error: 'Identifiant invalide' }); return; }
      const buffer = await pdfService.generatePayslipPDF(payslipId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="bulletin-${payslipId}.pdf"`);
      res.send(buffer);
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async validate(req: AuthRequest, res: Response): Promise<void> {
    try {
      successResponse(res, await payrollService.validateRun(parseInt(req.params.id), req.user?.id, req), 'Cycle validé');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async markPaid(req: AuthRequest, res: Response): Promise<void> {
    try {
      successResponse(res, await payrollService.markRunPaid(parseInt(req.params.id), req.body.methode_paiement, req.user?.id, req), 'Cycle payé');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async cancel(req: AuthRequest, res: Response): Promise<void> {
    try {
      successResponse(res, await payrollService.cancelRun(parseInt(req.params.id), req.user?.id, req), 'Cycle annulé');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      await payrollService.deleteRun(parseInt(req.params.id), req.user?.id, req);
      successResponse(res, null, 'Cycle supprimé');
    } catch (e: any) {
      const status = businessStatusOf(e);
      if (!status) console.error('PayrollController:', e);
      res.status(status ?? 500).json({ success: false, error: status ? e.message : 'Erreur serveur' });
    }
  }
}
