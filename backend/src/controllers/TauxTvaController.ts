import { Request, Response } from 'express';
import { TauxTvaService } from '../services/TauxTvaService';
import { logger } from '../utils/logger';

export class TauxTvaController {
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const rates = await TauxTvaService.getAll();
      res.json({ success: true, data: rates });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching TVA rates');
      res.status(500).json({ success: false, error: 'Erreur interne du serveur' });
    }
  }

  static async getActive(req: Request, res: Response): Promise<void> {
    try {
      const rates = await TauxTvaService.getActive();
      res.json({ success: true, data: rates });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching active TVA rates');
      res.status(500).json({ success: false, error: 'Erreur interne du serveur' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { code, taux, description, actif } = req.body;
      if (!code || taux === undefined || taux === null || taux === '') {
        res.status(400).json({ success: false, error: 'Code et taux sont requis' });
        return;
      }
      const tauxNum = Number(taux);
      if (Number.isNaN(tauxNum) || tauxNum < 0 || tauxNum > 100) {
        res.status(400).json({ success: false, error: 'Le taux doit être un pourcentage entre 0 et 100' });
        return;
      }
      const rate = await TauxTvaService.create({ code, taux: tauxNum, description, actif });
      res.status(201).json({ success: true, data: rate, message: 'Taux TVA créé avec succès' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error creating TVA rate');
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: 'Ce code de taux existe déjà' });
        return;
      }
      res.status(500).json({ success: false, error: 'Erreur lors de la création du taux' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { taux, description, actif } = req.body;
      if (taux !== undefined) {
        const tauxNum = Number(taux);
        if (Number.isNaN(tauxNum) || tauxNum < 0 || tauxNum > 100) {
          res.status(400).json({ success: false, error: 'Le taux doit être un pourcentage entre 0 et 100' });
          return;
        }
      }
      const rate = await TauxTvaService.update(id, { taux, description, actif });
      res.json({ success: true, data: rate, message: 'Taux TVA mis à jour avec succès' });
    } catch (error) {
      logger.error({ err: error }, 'Error updating TVA rate');
      res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du taux' });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      await TauxTvaService.delete(id);
      res.json({ success: true, message: 'Taux TVA supprimé avec succès' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error deleting TVA rate');
      if (error.code === '23503') {
        res.status(409).json({ success: false, error: 'Ce taux est utilisé par des factures et ne peut pas être supprimé. Désactivez-le plutôt.' });
        return;
      }
      res.status(500).json({ success: false, error: 'Erreur lors de la suppression du taux' });
    }
  }
}
