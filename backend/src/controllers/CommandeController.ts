import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { businessStatusOf } from '../utils/errors';
import { commandeService } from '../services/CommandeService';
import { factureFournisseurService } from '../services/FactureFournisseurService';
import { pdfService } from '../services/PDFService';
import { successResponse } from '../utils/response';

export class CommandeController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { data, total, page, limit } = await commandeService.getAll({
        statut: req.query.statut as string | undefined,
        search: req.query.search as string | undefined,
        page: parseInt(req.query.page as string) || undefined,
        limit: parseInt(req.query.limit as string) || undefined,
        sort: req.query.sort as string | undefined,
        order: req.query.order as string | undefined,
      });

      res.json({
        success: true,
        data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('Erreur GET /api/commandes:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const commande = await commandeService.getById(Number(req.params.id));
      if (!commande) {
        res.status(404).json({ success: false, error: 'Commande non trouvée' });
        return;
      }
      successResponse(res, commande);
    } catch (error) {
      console.error('Erreur GET /api/commandes/:id:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const result = await commandeService.create({
        tiersId: req.body.tiers_id ?? req.body.fournisseur_id,
        lignes: req.body.lignes,
        notes: req.body.notes,
        date_livraison_prevue: req.body.date_livraison_prevue,
        userId: (req as AuthRequest).user?.id || null,
      });
      res.status(201).json(result);
    } catch (error: any) {
      console.error('Erreur POST /api/commandes:', error);
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
    }
  }

  static async updateStatut(req: Request, res: Response): Promise<void> {
    try {
      await commandeService.updateStatut(Number(req.params.id), req.body.statut);
      successResponse(res, null, 'Statut mis à jour');
    } catch (error: any) {
      console.error('Erreur PUT /api/commandes/:id/statut:', error);
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      await commandeService.update(Number(req.params.id), {
        tiersId: req.body.tiers_id ?? req.body.fournisseur_id,
        lignes: req.body.lignes,
        notes: req.body.notes,
        date_livraison_prevue: req.body.date_livraison_prevue,
      });
      successResponse(res, null, 'Commande mise à jour avec succès');
    } catch (error: any) {
      console.error('Erreur PUT /api/commandes/:id:', error);
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur lors de la mise à jour' });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      await commandeService.delete(Number(req.params.id), (req as AuthRequest).user?.id || null, req);
      successResponse(res, null, 'Commande supprimée');
    } catch (error: any) {
      console.error('Erreur DELETE /api/commandes/:id:', error);
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
    }
  }

  /**
   * 3-way match: reconcile ordered (commande) vs received (receptions) vs
   * invoiced (facture fournisseur) quantities per product for an order.
   */
  static async getMatch(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const header = await commandeService.getMatchHeader(Number(id));
      if (!header) {
        res.status(404).json({ success: false, error: 'Commande non trouvée' });
        return;
      }

      const match = await factureFournisseurService.computeMatch(parseInt(id));

      successResponse(res, {
        commande_id: header.id,
        numero_commande: header.numero_commande,
        statut: header.statut,
        fournisseur_nom: header.fournisseur_nom,
        coherent: match.coherent,
        within_tolerance: match.within_tolerance,
        config: match.config,
        violations: match.violations,
        lignes: match.lignes,
      });
    } catch (error) {
      console.error('Erreur GET /api/commandes/:id/match:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, await commandeService.getStats());
    } catch (error) {
      console.error('Erreur GET /api/commandes/stats:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /** Bon de commande fournisseur (PDF) — le document envoyé au fournisseur. */
  static async generatePDF(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      const numeroCommande = await commandeService.getNumero(id);
      if (!numeroCommande) {
        res.status(404).json({ success: false, error: 'Commande introuvable' });
        return;
      }
      const buffer = await pdfService.generateCommandePDF(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bon-commande-${numeroCommande}.pdf"`
      );
      res.send(buffer);
    } catch (error) {
      console.error('Erreur GET /api/commandes/:id/pdf:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}
