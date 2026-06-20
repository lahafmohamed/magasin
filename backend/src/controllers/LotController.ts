import { Request, Response } from 'express';
import { lotService } from '../services/LotService';
import { successResponse } from '../utils/response';

export class LotController {
  /**
   * List lots (filter by produit_id, statut, expiring_before).
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { produit_id, statut, expiring_before } = req.query;
      const lots = await lotService.list({
        produit_id: produit_id ? parseInt(produit_id as string, 10) : undefined,
        statut: statut as string | undefined,
        expiring_before: expiring_before as string | undefined,
      });
      successResponse(res, lots, 'Lots récupérés avec succès');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Lots expiring within `days` days (default 30).
   */
  static async getExpiring(req: Request, res: Response): Promise<void> {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
      const lots = await lotService.expiringLots(Number.isFinite(days) ? days : 30);
      successResponse(res, lots, 'Lots bientôt périmés récupérés avec succès');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const lot = await lotService.getById(parseInt(req.params.id, 10));
      if (!lot) {
        res.status(404).json({ success: false, error: 'Lot non trouvé' });
        return;
      }
      successResponse(res, lot, 'Lot récupéré avec succès');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const lot = await lotService.create({ ...req.body, req });
      res.status(201).json({ success: true, data: lot, message: 'Lot créé avec succès' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Adjust a lot's remaining quantity by a signed delta.
   */
  static async adjustQuantity(req: Request, res: Response): Promise<void> {
    try {
      const updated = await lotService.adjustQuantity(parseInt(req.params.id, 10), req.body.delta, req);
      if (!updated) {
        res.status(404).json({ success: false, error: 'Lot non trouvé' });
        return;
      }
      res.json({ success: true, data: updated, message: 'Quantité du lot ajustée' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Maintenance: run expire_old_lots() (admin only).
   */
  static async runExpire(req: Request, res: Response): Promise<void> {
    try {
      await lotService.runExpire();
      res.json({ success: true, message: 'Lots expirés mis à jour' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
