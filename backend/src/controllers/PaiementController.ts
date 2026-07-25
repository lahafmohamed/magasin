import { Request, Response } from 'express';
import pool from '../db/connection';
import { businessStatusOf } from '../utils/errors';
import { parsePagination } from '../utils/pagination';
import { logger } from '../utils/logger';
import { paiementService } from '../services/PaiementService';
import { pdfService } from '../services/PDFService';
import { AuthRequest } from '../middleware/auth';

/**
 * Thin HTTP layer over PaiementService: parse the request, call the service,
 * map business errors (statusCode) to their HTTP status — everything else is
 * a generic 500.
 */
export class PaiementController {

  /**
   * Record a new payment on a facture (acomptes FIFO d'abord, reste en direct).
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      // Support both /factures/:factureId/paiements and standalone /paiements (facture_id in body)
      const factureId = req.params.factureId ?? (req.body.facture_id != null ? String(req.body.facture_id) : undefined);
      if (!factureId || Number.isNaN(Number(factureId))) {
        res.status(400).json({ error: 'facture_id requis' });
        return;
      }

      const userId = (req as AuthRequest).user?.id || null;
      const result = await paiementService.create({
        factureId: Number(factureId),
        montant: req.body.montant,
        methode_paiement: req.body.methode_paiement,
        date_paiement: req.body.date_paiement,
        reference: req.body.reference,
        notes: req.body.notes,
        session_caisse_id: req.body.session_caisse_id,
        idempotency_key: req.body.idempotency_key,
        skip_acompte_application: req.body.skip_acompte_application,
        userId,
      });

      if (result.idempotent) {
        res.status(200).json({ idempotent: true, ...result.existing });
        return;
      }
      res.status(201).json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/factures/:factureId/paiements');
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ error: status ? error.message : 'Erreur serveur' });
    }
  }

  /**
   * Get all payments for a specific invoice
   */
  static async getByFacture(req: Request, res: Response): Promise<void> {
    try {
      const { factureId } = req.params;

      // Verify invoice exists
      const { rows: factureRows } = await pool.query(
        'SELECT id FROM factures WHERE id = $1',
        [factureId]
      );

      if (factureRows.length === 0) {
        res.status(404).json({ error: 'Facture non trouvée' });
        return;
      }

      const { rows } = await pool.query(
        `SELECT * FROM paiements WHERE facture_id = $1 ORDER BY date_paiement DESC`,
        [factureId]
      );

      res.json(rows);
    } catch (error) {
      logger.error({ err: error }, 'Erreur GET /api/factures/:factureId/paiements');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  /**
   * Get all payments across all invoices (with pagination)
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { methode, date_debut, date_fin } = req.query;

      let query = `
        SELECT p.*, f.numero_facture, t.raison_sociale as client_nom, t.prenom as client_prenom
        FROM paiements p
        LEFT JOIN factures f ON p.facture_id = f.id
        LEFT JOIN tiers t ON f.tiers_id = t.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (methode) {
        query += ' AND p.methode_paiement = $' + (params.length + 1);
        params.push(methode);
      }

      if (date_debut) {
        query += ' AND p.date_paiement >= $' + (params.length + 1);
        params.push(date_debut);
      }

      if (date_fin) {
        query += ' AND p.date_paiement <= $' + (params.length + 1);
        params.push(date_fin);
      }

      query += ' ORDER BY p.date_paiement DESC';

      // Pagination (clamped)
      const { page: pageNum, limit: limitNum } = parsePagination(req.query);
      const offset = (pageNum - 1) * limitNum;
      query += ' LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limitNum, offset);

      const { rows } = await pool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) FROM paiements p
        LEFT JOIN factures f ON p.facture_id = f.id
        WHERE 1=1
      `;
      const countParams: any[] = [];
      if (methode) {
        countQuery += ' AND p.methode_paiement = $' + (countParams.length + 1);
        countParams.push(methode);
      }
      if (date_debut) {
        countQuery += ' AND p.date_paiement >= $' + (countParams.length + 1);
        countParams.push(date_debut);
      }
      if (date_fin) {
        countQuery += ' AND p.date_paiement <= $' + (countParams.length + 1);
        countParams.push(date_fin);
      }

      const { rows: countRows } = await pool.query(countQuery, countParams);
      const total = parseInt(countRows[0].count);

      res.json({
        data: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Erreur GET /api/paiements');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  /**
   * Get payment statistics
   */
  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      // Total payments by method
      const { rows: parMethode } = await pool.query(
        `SELECT methode_paiement, COUNT(*) as nombre, SUM(montant) as total
         FROM paiements
         GROUP BY methode_paiement
         ORDER BY total DESC`
      );

      // Payments this month
      const { rows: moisActuel } = await pool.query(
        `SELECT COUNT(*) as nombre, COALESCE(SUM(montant), 0) as total
         FROM paiements
         WHERE EXTRACT(MONTH FROM date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(YEAR FROM date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE)`
      );

      // Payments today
      const { rows: aujourdhui } = await pool.query(
        `SELECT COUNT(*) as nombre, COALESCE(SUM(montant), 0) as total
         FROM paiements
         WHERE DATE(date_paiement) = CURRENT_DATE`
      );

      // Average payment amount
      const { rows: moyenne } = await pool.query(
        `SELECT AVG(montant) as moyenne_paiement
         FROM paiements`
      );

      res.json({
        par_methode: parMethode,
        mois_actuel: moisActuel[0],
        aujourdhui: aujourdhui[0],
        moyenne: moyenne[0]
      });
    } catch (error) {
      logger.error({ err: error }, 'Erreur GET /api/paiements/stats');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  /**
   * Update a payment (triggers FIFO reallocation)
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthRequest).user?.id || null;
      await paiementService.update(Number(req.params.id), {
        montant: req.body.montant,
        methode_paiement: req.body.methode_paiement,
        reference: req.body.reference,
        notes: req.body.notes,
        date_paiement: req.body.date_paiement,
      }, userId);
      res.json({ message: 'Paiement mis à jour et allocation FIFO recalculée' });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur PUT /api/paiements/:id');
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ error: status ? error.message : 'Erreur serveur' });
    }
  }

  /**
   * Delete a payment (triggers FIFO reallocation)
   */
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthRequest).user?.id || null;
      await paiementService.delete(Number(req.params.id), userId);
      res.json({ message: 'Paiement supprimé et allocation FIFO recalculée' });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur DELETE /api/paiements/:id');
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ error: status ? error.message : 'Erreur serveur' });
    }
  }

  /** Reçu de paiement (quittance) remis au client. */
  static async generateRecuPDF(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(
        'SELECT id FROM paiements WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if (!rows[0]) {
        res.status(404).json({ success: false, error: 'Paiement introuvable' });
        return;
      }
      const buffer = await pdfService.generatePaiementRecuPDF(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="recu-paiement-${id}.pdf"`);
      res.send(buffer);
    } catch (error) {
      logger.error({ err: error }, 'Erreur GET /api/paiements/:id/recu');
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}
