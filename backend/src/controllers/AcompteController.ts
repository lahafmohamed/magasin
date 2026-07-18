import { Request, Response } from 'express';
import pool from '../db/connection';
import { acompteService } from '../services/AcompteService';
import { businessStatusOf } from '../utils/errors';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

/**
 * Thin HTTP layer over AcompteService (client + fournisseur apply/refund).
 * Business errors carry a statusCode; anything else is a generic 500.
 */
export class AcompteController {

  private static respondError(res: Response, err: any, context: string): void {
    logger.error({ err }, context);
    const status = businessStatusOf(err);
    res.status(status ?? 500).json({ error: status ? err.message : 'Erreur serveur' });
  }

  /**
   * Manually apply an acompte (or part of it) to a specific facture.
   */
  static async apply(req: Request, res: Response): Promise<void> {
    try {
      const result = await acompteService.applyClient({
        acompteId: parseInt(req.params.id),
        factureId: req.body.facture_id,
        montant: req.body.montant,
        idempotency_key: req.body.idempotency_key,
        userId: (req as AuthRequest).user?.id || null,
      });
      if ('idempotent' in result) {
        res.status(200).json(result);
        return;
      }
      res.status(201).json(result);
    } catch (err: any) {
      AcompteController.respondError(res, err, 'Erreur POST /api/acomptes/:id/apply');
    }
  }

  /**
   * Refund unused portion of an acompte (cash out).
   */
  static async refund(req: Request, res: Response): Promise<void> {
    try {
      const result = await acompteService.refundClient({
        acompteId: parseInt(req.params.id),
        montant: req.body.montant,
        methode_paiement: req.body.methode_paiement,
        session_caisse_id: req.body.session_caisse_id,
        idempotency_key: req.body.idempotency_key,
        userId: (req as AuthRequest).user?.id || null,
      });
      res.status(201).json(result);
    } catch (err: any) {
      AcompteController.respondError(res, err, 'Erreur POST /api/acomptes/:id/refund');
    }
  }

  /**
   * Apply supplier acompte (or part of it) to a facture_fournisseur.
   */
  static async applyFournisseur(req: Request, res: Response): Promise<void> {
    try {
      const result = await acompteService.applyFournisseur({
        acompteId: parseInt(req.params.id),
        factureId: req.body.facture_id,
        montant: req.body.montant,
        idempotency_key: req.body.idempotency_key,
        userId: (req as AuthRequest).user?.id || null,
      });
      if ('idempotent' in result) {
        res.status(200).json(result);
        return;
      }
      res.status(201).json(result);
    } catch (err: any) {
      AcompteController.respondError(res, err, 'Erreur POST /api/acomptes-fournisseur/:id/apply');
    }
  }

  /**
   * Refund unused supplier acompte (cash IN — supplier gives money back).
   */
  static async refundFournisseur(req: Request, res: Response): Promise<void> {
    try {
      const result = await acompteService.refundFournisseur({
        acompteId: parseInt(req.params.id),
        montant: req.body.montant,
        methode_paiement: req.body.methode_paiement,
        session_caisse_id: req.body.session_caisse_id,
        idempotency_key: req.body.idempotency_key,
        userId: (req as AuthRequest).user?.id || null,
      });
      res.status(201).json(result);
    } catch (err: any) {
      AcompteController.respondError(res, err, 'Erreur POST /api/acomptes-fournisseur/:id/refund');
    }
  }

  /**
   * List applications of an acompte.
   */
  static async listApplications(req: Request, res: Response): Promise<void> {
    try {
      const acompteId = parseInt(req.params.id);
      const { rows } = await pool.query(
        `SELECT app.*, f.numero_facture
         FROM acompte_applications app
         JOIN factures f ON f.id = app.facture_id
         WHERE app.acompte_id = $1
         ORDER BY app.date_application ASC`,
        [acompteId]
      );
      res.json({ data: rows });
    } catch (err: any) {
      logger.error({ err }, 'Erreur lecture acompte');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  /**
   * List applications of a supplier acompte.
   */
  static async listApplicationsFournisseur(req: Request, res: Response): Promise<void> {
    try {
      const acompteId = parseInt(req.params.id);
      const { rows } = await pool.query(
        `SELECT app.*, f.numero_facture_interne AS numero_facture
         FROM acompte_applications_fournisseur app
         JOIN factures_fournisseur f ON f.id = app.facture_id
         WHERE app.acompte_id = $1
         ORDER BY app.date_application ASC`,
        [acompteId]
      );
      res.json({ data: rows });
    } catch (err: any) {
      logger.error({ err }, 'Erreur lecture acompte');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  /**
   * Get supplier acompte by id with applications + remaining.
   */
  static async getByIdFournisseur(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { rows } = await pool.query(
        `SELECT ac.*, t.raison_sociale AS tiers_nom
         FROM acomptes_fournisseur ac
         JOIN tiers t ON t.id = ac.tiers_id
         WHERE ac.id = $1`,
        [id]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'Acompte fournisseur introuvable' });
        return;
      }
      const { rows: apps } = await pool.query(
        `SELECT app.*, f.numero_facture_interne AS numero_facture
         FROM acompte_applications_fournisseur app
         JOIN factures_fournisseur f ON f.id = app.facture_id
         WHERE app.acompte_id = $1
         ORDER BY app.date_application ASC`,
        [id]
      );
      res.json({ data: { ...rows[0], applications: apps } });
    } catch (err: any) {
      logger.error({ err }, 'Erreur lecture acompte');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  /**
   * Get acompte by id with applications + remaining.
   */
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { rows } = await pool.query(
        `SELECT ac.*, t.raison_sociale AS tiers_nom
         FROM acomptes_clients ac
         JOIN tiers t ON t.id = ac.tiers_id
         WHERE ac.id = $1`,
        [id]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'Acompte introuvable' });
        return;
      }
      const { rows: apps } = await pool.query(
        `SELECT app.*, f.numero_facture
         FROM acompte_applications app
         JOIN factures f ON f.id = app.facture_id
         WHERE app.acompte_id = $1
         ORDER BY app.date_application ASC`,
        [id]
      );
      res.json({ data: { ...rows[0], applications: apps } });
    } catch (err: any) {
      logger.error({ err }, 'Erreur lecture acompte');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
}
