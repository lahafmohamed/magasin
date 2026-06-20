import { Request, Response } from 'express';
import { serialService } from '../services/SerialService';
import { successResponse } from '../utils/response';

export class SerialController {
  /**
   * List serial numbers (filter by produit_id, statut, lot_id).
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { produit_id, statut, lot_id } = req.query;
      const serials = await serialService.list({
        produit_id: produit_id ? parseInt(produit_id as string, 10) : undefined,
        statut: statut as string | undefined,
        lot_id: lot_id ? parseInt(lot_id as string, 10) : undefined,
      });
      successResponse(res, serials, 'Numéros de série récupérés avec succès');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Lookup by serial number (?numero_serie=... &produit_id=...).
   */
  static async lookup(req: Request, res: Response): Promise<void> {
    try {
      const { numero_serie, produit_id } = req.query;
      if (!numero_serie) {
        res.status(400).json({ success: false, error: 'numero_serie requis' });
        return;
      }
      const serial = await serialService.lookupBySerial(
        numero_serie as string,
        produit_id ? parseInt(produit_id as string, 10) : undefined
      );
      if (!serial) {
        res.status(404).json({ success: false, error: 'Numéro de série non trouvé' });
        return;
      }
      successResponse(res, serial, 'Numéro de série récupéré avec succès');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const serial = await serialService.getById(parseInt(req.params.id, 10));
      if (!serial) {
        res.status(404).json({ success: false, error: 'Numéro de série non trouvé' });
        return;
      }
      successResponse(res, serial, 'Numéro de série récupéré avec succès');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async register(req: Request, res: Response): Promise<void> {
    try {
      const serial = await serialService.register({ ...req.body, req });
      res.status(201).json({ success: true, data: serial, message: 'Numéro de série enregistré' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async markSold(req: Request, res: Response): Promise<void> {
    try {
      const updated = await serialService.markSold(parseInt(req.params.id, 10), req.body, req);
      if (!updated) {
        res.status(404).json({ success: false, error: 'Numéro de série non trouvé' });
        return;
      }
      res.json({ success: true, data: updated, message: 'Numéro de série marqué vendu' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async markUnderWarranty(req: Request, res: Response): Promise<void> {
    try {
      const updated = await serialService.markUnderWarranty(
        parseInt(req.params.id, 10),
        req.body.garantie_jusqu,
        req
      );
      if (!updated) {
        res.status(404).json({ success: false, error: 'Numéro de série non trouvé' });
        return;
      }
      res.json({ success: true, data: updated, message: 'Numéro de série mis sous garantie' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
