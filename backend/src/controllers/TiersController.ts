import { Request, Response } from 'express';
import { tiersService } from '../services/TiersService';
import { ClientAllocationService } from '../services/ClientAllocationService';
import { CompensationService } from '../services/CompensationService';
import { acompteService } from '../services/AcompteService';
import { pdfService } from '../services/PDFService';
import { SupplierAllocationService } from '../services/SupplierAllocationService';
import { businessStatusOf } from '../utils/errors';

export class TiersController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { search, role, page, limit, sort, order, statut_solde } = req.query;
      const result = await tiersService.getAll({
        search: search as string,
        role: role as any,
        page: parseInt(page as string) || 1,
        limit: parseInt(limit as string) || 20,
        sort: sort as string,
        order: (order as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
        statut_solde: statut_solde as any,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tiers = await tiersService.getById(id);
      if (!tiers) { res.status(404).json({ success: false, error: 'Tiers introuvable' }); return; }
      res.json({ success: true, data: tiers });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const tiers = await tiersService.create(req.body);
      res.status(201).json({ success: true, data: tiers });
    } catch (err: any) {
      if (err.message?.includes('au moins un rôle')) {
        res.status(422).json({ success: false, error: err.message });
      } else {
        console.error('TiersController.create:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
      }
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tiers = await tiersService.update(id, req.body);
      if (!tiers) { res.status(404).json({ success: false, error: 'Tiers introuvable' }); return; }
      res.json({ success: true, data: tiers });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const ok = await tiersService.softDelete(id);
      if (!ok) { res.status(404).json({ success: false, error: 'Tiers introuvable' }); return; }
      res.json({ success: true, message: 'Tiers supprimé' });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async search(req: Request, res: Response): Promise<void> {
    try {
      const { q, role } = req.query;
      if (!q) { res.json({ success: true, data: [] }); return; }
      const results = await tiersService.search(q as string, role as any);
      res.json({ success: true, data: results });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getCompte(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { from, to } = req.query;
      const compte = await tiersService.getCompte(id, { from: from as string, to: to as string });
      if (!compte) { res.status(404).json({ success: false, error: 'Tiers introuvable' }); return; }
      res.json({ success: true, data: compte });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getReleveDetaille(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { from, to } = req.query;
      const releve = await tiersService.getReleveDetaille(id, { from: from as string, to: to as string });
      if (!releve) { res.status(404).json({ success: false, error: 'Tiers introuvable' }); return; }
      res.json({ success: true, data: releve });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getRelevePDF(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ success: false, error: 'Identifiant invalide' }); return; }
      const { from, to } = req.query;
      const buffer = await pdfService.generateRelevePDF(id, from as string, to as string);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="releve-client-${id}.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({ success: false, error: err.message });
        return;
      }
      console.error('TiersController.getRelevePDF:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async promouvoir(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { role } = req.body;
      let tiers;
      if (role === 'client') tiers = await tiersService.promouvoirEnClient(id);
      else if (role === 'fournisseur') tiers = await tiersService.promouvoirEnFournisseur(id);
      else { res.status(422).json({ success: false, error: 'Rôle invalide: client ou fournisseur' }); return; }
      if (!tiers) { res.status(404).json({ success: false, error: 'Tiers introuvable' }); return; }
      res.json({ success: true, data: tiers });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async recordAcompteClient(req: Request, res: Response): Promise<void> {
    try {
      const result = await acompteService.createClient({
        tiersId: parseInt(req.params.id),
        montant: req.body.montant,
        methode_paiement: req.body.methode_paiement,
        notes: req.body.notes,
        magasin_id: req.body.magasin_id,
        reference_number: req.body.reference_number,
        session_caisse_id: req.body.session_caisse_id,
        idempotency_key: req.body.idempotency_key,
        userId: (req as any).user?.id || null,
      });
      if (result.idempotent) {
        res.status(200).json({ success: true, data: result.acompte, idempotent: true });
        return;
      }
      res.status(201).json({ success: true, data: { ...result.acompte, mouvement_caisse_id: result.mouvement_caisse_id } });
    } catch (err: any) {
      const status = businessStatusOf(err);
      if (status) {
        res.status(status).json({ success: false, error: err.message });
        return;
      }
      console.error('TiersController acompte:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async recordAcompteFournisseur(req: Request, res: Response): Promise<void> {
    try {
      const result = await acompteService.createFournisseur({
        tiersId: parseInt(req.params.id),
        montant: req.body.montant,
        methode_paiement: req.body.methode_paiement,
        notes: req.body.notes,
        magasin_id: req.body.magasin_id,
        reference_number: req.body.reference_number,
        session_caisse_id: req.body.session_caisse_id,
        idempotency_key: req.body.idempotency_key,
        userId: (req as any).user?.id || null,
      });
      if (result.idempotent) {
        res.status(200).json({ success: true, data: result.acompte, idempotent: true });
        return;
      }
      res.status(201).json({
        success: true,
        data: { ...result.acompte, mouvement_caisse_id: result.mouvement_caisse_id, allocation: result.allocation },
      });
    } catch (err: any) {
      const status = businessStatusOf(err);
      if (status) {
        res.status(status).json({ success: false, error: err.message });
        return;
      }
      console.error('TiersController acompte:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async createCompensation(req: Request, res: Response): Promise<void> {
    try {
      const tiersId = parseInt(req.params.id);
      const result = await CompensationService.create({
        ...req.body,
        tiers_id: tiersId,
        cree_par: (req as any).user?.id,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      const status = err.message?.includes('période') || err.message?.includes('rôle') || err.message?.includes('supérieur') ? 422 : 500;
      if (status === 500) {
        console.error('TiersController.createCompensation:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
        return;
      }
      res.status(status).json({ success: false, error: err.message });
    }
  }

  static async getCompensations(req: Request, res: Response): Promise<void> {
    try {
      const tiersId = parseInt(req.params.id);
      const data = await CompensationService.getForTiers(tiersId);
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async recomputeAllocation(req: Request, res: Response): Promise<void> {
    try {
      const tiersId = parseInt(req.params.id);
      const role = (req.query.role as string) || req.body?.role || 'client';
      if (role === 'fournisseur') {
        const result = await SupplierAllocationService.recomputeSupplierState(tiersId, {
          userId: (req as any).user?.id ?? null,
        });
        res.json({ success: true, data: result });
        return;
      }
      const result = await ClientAllocationService.recomputeClientAllocations(tiersId);
      res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('TiersController:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}
