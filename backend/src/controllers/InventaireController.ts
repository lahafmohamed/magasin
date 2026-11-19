import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { inventaireService, FiltreLignes } from '../services/InventaireService';
import { successResponse, paginatedResponse } from '../utils/response';
import { respondWithError } from '../utils/errors';

const INTROUVABLE = 'Inventaire introuvable.';

export class InventaireController {
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const locationId = parseInt(req.query.location_id as string);

      const result = await inventaireService.getAll(
        {
          search: req.query.search as string | undefined,
          statut: req.query.statut as string | undefined,
          location_id: Number.isInteger(locationId) && locationId > 0 ? locationId : undefined,
          page,
          limit,
        },
        req.user?.role
      );
      paginatedResponse(res, result.data, result.total, page, limit);
    } catch (error) {
      respondWithError(res, error, 'InventaireController.getAll', 'Erreur serveur');
    }
  }

  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const inventaire = await inventaireService.getById(parseInt(req.params.id), req.user?.role);
      if (!inventaire) {
        res.status(404).json({ success: false, error: INTROUVABLE });
        return;
      }
      successResponse(res, inventaire);
    } catch (error) {
      respondWithError(res, error, 'InventaireController.getById', 'Erreur serveur');
    }
  }

  static async getLignes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const result = await inventaireService.getLignes(
        parseInt(req.params.id),
        {
          search: req.query.search as string | undefined,
          filtre: req.query.filtre as FiltreLignes | undefined,
          page,
          limit,
        },
        req.user?.role
      );
      if (!result) {
        res.status(404).json({ success: false, error: INTROUVABLE });
        return;
      }
      paginatedResponse(res, result.data, result.total, page, limit);
    } catch (error) {
      respondWithError(res, error, 'InventaireController.getLignes', 'Erreur serveur');
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { location_id, categorie, comptage_aveugle, notes } = req.body;
      const inventaire = await inventaireService.create({
        location_id,
        categorie,
        comptage_aveugle,
        notes,
        cree_par: req.user?.id,
        req,
      });
      res.status(201).json({ success: true, data: inventaire, message: 'Inventaire ouvert' });
    } catch (error) {
      respondWithError(res, error, 'InventaireController.create', 'Erreur serveur');
    }
  }

  static async compter(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { produit_id, code, quantite, mode } = req.body;
      const ligne = await inventaireService.compter(
        parseInt(req.params.id),
        { produit_id, code, quantite, mode: mode ?? 'fixer' },
        req.user?.id,
        req.user?.role
      );
      successResponse(res, ligne, 'Comptage enregistré');
    } catch (error) {
      respondWithError(res, error, 'InventaireController.compter', 'Erreur serveur');
    }
  }

  static async effacerComptage(req: AuthRequest, res: Response): Promise<void> {
    try {
      await inventaireService.effacerComptage(parseInt(req.params.id), parseInt(req.params.ligneId));
      successResponse(res, null, 'Comptage effacé');
    } catch (error) {
      respondWithError(res, error, 'InventaireController.effacerComptage', 'Erreur serveur');
    }
  }

  static async valider(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await inventaireService.valider(
        parseInt(req.params.id),
        { non_comptes: req.body?.non_comptes ?? 'ignorer' },
        req.user?.id,
        req
      );
      successResponse(res, result, 'Inventaire validé');
    } catch (error) {
      respondWithError(res, error, 'InventaireController.valider', 'Erreur serveur');
    }
  }

  static async annuler(req: AuthRequest, res: Response): Promise<void> {
    try {
      await inventaireService.annuler(parseInt(req.params.id), req.user?.id, req);
      successResponse(res, null, 'Inventaire annulé');
    } catch (error) {
      respondWithError(res, error, 'InventaireController.annuler', 'Erreur serveur');
    }
  }
}
