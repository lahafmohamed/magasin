import { Request, Response } from 'express';
import { CreditNoteService } from '../services/CreditNoteService';
import { pdfService } from '../services/PDFService';
import { AuthRequest } from '../middleware/auth';
import { businessStatusOf, respondWithError } from '../utils/errors';

const creditNoteService = new CreditNoteService();

export class CreditNoteController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { search, statut, avoir_type, tiers_id, client_id, page, limit, sort, order } = req.query;
      const result = await creditNoteService.getAll(
        search as string,
        statut as string,
        (tiers_id || client_id) ? parseInt((tiers_id || client_id) as string) : undefined,
        page ? parseInt(page as string) : 1,
        Math.min(200, (limit ? parseInt(limit as string) : 20) || 20),
        (sort as string) || 'date_avoir',
        (order as string) || 'DESC',
        avoir_type as string
      );
      res.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error: any) {
      console.error('CreditNoteController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const { tiers_id, client_id } = req.query;
      const stats = await creditNoteService.getStats(
        (tiers_id || client_id) ? parseInt((tiers_id || client_id) as string) : undefined
      );
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('CreditNoteController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const avoir = await creditNoteService.getById(parseInt(req.params.id));
      if (!avoir) {
        res.status(404).json({ success: false, error: 'Avoir non trouvé' });
        return;
      }
      res.json({ success: true, data: avoir });
    } catch (error: any) {
      console.error('CreditNoteController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async createFromRetour(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { retour_id } = req.body;
      
      if (!retour_id) {
        res.status(400).json({ success: false, error: 'Choisissez le retour à rembourser.' });
        return;
      }

      const result = await creditNoteService.createFromRetour(retour_id, req.user!.id, req);
      res.status(201).json({ success: true, data: result, message: `Avoir ${result.numero_avoir} créé` });
    } catch (error: any) {
      respondWithError(res, error, 'création avoir depuis retour', 'Erreur serveur');
    }
  }

  static async createManual(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tiers_id, client_id, facture_origine_id, retour_id, lignes, avoir_type, notes, location_id } = req.body;
      const resolvedTiersId = tiers_id ?? client_id;

      if (!resolvedTiersId || !lignes || lignes.length === 0) {
        res.status(400).json({ success: false, error: 'Choisissez le client et ajoutez au moins une ligne.' });
        return;
      }

      const result = await creditNoteService.createManual({
        tiers_id: resolvedTiersId,
        facture_origine_id,
        retour_id,
        lignes,
        avoir_type,
        notes,
        location_id,
        cree_par: req.user?.id,
        req,
      });

      res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      respondWithError(res, error, 'création avoir', 'Erreur lors de la création de l\'avoir');
    }
  }

  static async updateStatut(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { statut } = req.body;
      if (!statut) {
        res.status(400).json({ success: false, error: 'Choisissez le nouveau statut.' });
        return;
      }
      await creditNoteService.updateStatut(parseInt(req.params.id), statut, req);
      res.json({ success: true, message: 'Statut mis à jour' });
    } catch (error: any) {
      respondWithError(res, error, 'statut avoir', 'Erreur serveur');
    }
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      await creditNoteService.delete(parseInt(req.params.id), req);
      res.json({ success: true, message: 'Avoir supprimé' });
    } catch (error: any) {
      console.error('CreditNoteController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async applyToFacture(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { facture_id } = req.body;
      if (!facture_id) {
        res.status(400).json({ success: false, error: 'Choisissez la facture sur laquelle imputer l’avoir.' });
        return;
      }
      const result = await creditNoteService.applyToFacture(parseInt(id), parseInt(facture_id), req);
      res.json({ success: true, data: result, message: result.message });
    } catch (error: any) {
      respondWithError(res, error, 'application avoir');
    }
  }

  /**
   * POST /api/avoirs/:id/rembourser (admin, manager) — pay a valid, unused
   * credit note back (E3). 201 with the server sentence in `message`; errors
   * carry `code` (CAISSE_FERMEE, CAISSE_INTROUVABLE, AVOIR_DEJA_UTILISE,
   * AVOIR_ANNULE, AVOIR_NON_VALIDE, STALE_CASH_SESSION) for the UI.
   */
  static async rembourser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await creditNoteService.rembourser(parseInt(req.params.id), {
        methode_paiement: req.body.methode_paiement,
        notes: req.body.notes,
        reference: req.body.reference,
        userId: req.user?.id ?? null,
        req,
      });
      res.status(201).json({ success: true, data: result, message: result.message });
    } catch (error: any) {
      const status = businessStatusOf(error);
      if (!status) {
        respondWithError(res, error, 'remboursement avoir', 'Le remboursement de l’avoir a échoué.');
        return;
      }
      res.status(status).json({
        success: false,
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        // CAISSE_FERMEE: { magasin_id, magasin_nom } of the closed till.
        ...(error.details ?? {}),
      });
    }
  }

  static async generatePDF(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const buffer = await pdfService.generateAvoirPDF(parseInt(id));
      const avoir = await creditNoteService.getById(parseInt(id));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="avoir-${avoir?.numero_avoir || id}.pdf"`);
      res.send(buffer);
    } catch (error: any) {
      console.error('CreditNoteController:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}
