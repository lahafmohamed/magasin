import { Request, Response } from 'express';
import { factureFournisseurService } from '../services/FactureFournisseurService';
import { successResponse, paginatedResponse } from '../utils/response';
import { businessStatusOf } from '../utils/errors';

export class FactureFournisseurController {
  /**
   * Get all supplier invoices
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { search, statut, tiers_id, fournisseur_id, page, limit } = req.query;

      const invoices = await factureFournisseurService.getAll({
        search: search as string,
        statut: statut as string,
        tiers_id: tiers_id ? parseInt(tiers_id as string) : undefined,
        fournisseur_id: fournisseur_id ? parseInt(fournisseur_id as string) : undefined,
        page: parseInt(page as string) || 1,
        limit: parseInt(limit as string) || 20,
      });

      paginatedResponse(res, invoices.data, invoices.total, parseInt(page as string) || 1, parseInt(limit as string) || 20, 'Factures fournisseur récupérées avec succès');
    } catch (error: any) {
      console.error('FactureFournisseurController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getMatchConfig(_req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, await factureFournisseurService.getMatchConfig(), 'Configuration rapprochement');
    } catch (error: any) {
      console.error('FactureFournisseurController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async updateMatchConfig(req: Request, res: Response): Promise<void> {
    try {
      const data = await factureFournisseurService.updateMatchConfig({
        qte_tolerance_pct: req.body.qte_tolerance_pct,
        prix_tolerance_pct: req.body.prix_tolerance_pct,
        bloquer: req.body.bloquer,
      });
      successResponse(res, data, 'Configuration rapprochement mise à jour');
    } catch (error: any) {
      console.error('FactureFournisseurController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * Get supplier invoice by ID
   */
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const invoice = await factureFournisseurService.getById(parseInt(id));

      if (!invoice) {
        res.status(404).json({ success: false, error: 'Facture fournisseur non trouvée' });
        return;
      }

      successResponse(res, invoice, 'Facture fournisseur récupérée avec succès');
    } catch (error: any) {
      console.error('FactureFournisseurController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * Create supplier invoice
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { tiers_id, fournisseur_id, reception_id, commande_id, numero_facture_fournisseur, date_facture, date_echeance, condition_paiement, lignes, notes } = req.body;
      const resolvedTiersId = tiers_id ?? fournisseur_id;

      if (!resolvedTiersId || !numero_facture_fournisseur || !date_facture || !lignes || lignes.length === 0) {
        res.status(400).json({ success: false, error: 'Fournisseur, numéro de facture, date et lignes sont requis' });
        return;
      }

      const invoice = await factureFournisseurService.create({
        tiers_id: resolvedTiersId,
        reception_id,
        commande_id,
        numero_facture_fournisseur,
        date_facture,
        date_echeance,
        condition_paiement,
        lignes,
        notes,
        cree_par: req.user?.id,
        req,
      });

      res.status(201).json({ success: true, data: invoice, message: 'Facture fournisseur créée avec succès' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message, code: error.code, violations: error.violations });
    }
  }

  /**
   * Record payment for supplier invoice
   */
  static async recordPayment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { montant, methode_paiement, reference } = req.body;

      if (!montant || !methode_paiement) {
        res.status(400).json({ success: false, error: 'Montant et méthode de paiement sont requis' });
        return;
      }

      await factureFournisseurService.recordPayment(
        parseInt(id),
        montant,
        methode_paiement,
        reference,
        req.user?.id,
        req
      );

      successResponse(res, null, 'Paiement enregistré avec succès');
    } catch (error: any) {
      const status = businessStatusOf(error);
      if (!status) console.error('FactureFournisseurController:', error);
      res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
    }
  }

  /**
   * Get payable invoices
   */
  static async getPayableInvoices(req: Request, res: Response): Promise<void> {
    try {
      const invoices = await factureFournisseurService.getPayableInvoices();
      successResponse(res, invoices, 'Factures payables récupérées avec succès');
    } catch (error: any) {
      console.error('FactureFournisseurController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * Get supplier invoice statistics
   */
  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await factureFournisseurService.getStats();
      successResponse(res, stats, 'Statistiques récupérées avec succès');
    } catch (error: any) {
      console.error('FactureFournisseurController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}
