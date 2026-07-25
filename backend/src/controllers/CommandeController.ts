import { Request, Response } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';
import { businessStatusOf } from '../utils/errors';
import { commandeService } from '../services/CommandeService';
import { factureFournisseurService } from '../services/FactureFournisseurService';
import { pdfService } from '../services/PDFService';

export class CommandeController {

  // Allow-listed sort columns (frontend key → SQL column). Never interpolate raw input.
  private static readonly SORT_COLUMNS: Record<string, string> = {
    numero: 'c.numero_commande',
    date: 'c.date_commande',
    montant: 'c.sous_total',
    livraison: 'c.date_livraison_prevue',
  };

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { statut, search } = req.query;
      // Bounded result set (the endpoint was previously unbounded). Optional ?page/?limit.
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 20));
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const offset = (page - 1) * limit;

      const sortColumn = CommandeController.SORT_COLUMNS[req.query.sort as string] || 'c.date_commande';
      const sortOrder = (req.query.order as string)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const filters: string[] = ['1=1'];
      const params: any[] = [];

      if (statut) {
        filters.push('c.statut = $' + (params.length + 1));
        params.push(statut);
      }

      if (search) {
        filters.push('(c.numero_commande ILIKE $' + (params.length + 1) + ' OR t.raison_sociale ILIKE $' + (params.length + 2) + ')');
        params.push(`%${search}%`, `%${search}%`);
      }

      const whereClause = filters.join(' AND ');

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM commandes_fournisseur c
         LEFT JOIN tiers t ON c.tiers_id = t.id
         WHERE ${whereClause}`,
        params
      );
      const total = countRows[0]?.total ?? 0;

      const dataParams = [...params, limit, offset];
      const { rows } = await pool.query(
        `SELECT c.*, t.raison_sociale as fournisseur_nom
         FROM commandes_fournisseur c
         LEFT JOIN tiers t ON c.tiers_id = t.id
         WHERE ${whereClause}
         ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, c.id DESC
         LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams
      );

      res.json({
        success: true,
        data: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('Erreur GET /api/commandes:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const { rows: commandeRows } = await pool.query(
        `SELECT c.*, t.raison_sociale as fournisseur_nom, t.telephone as fournisseur_telephone, t.email as fournisseur_email
         FROM commandes_fournisseur c
         LEFT JOIN tiers t ON c.tiers_id = t.id
         WHERE c.id = $1`,
        [id]
      );

      if (commandeRows.length === 0) {
        res.status(404).json({ error: 'Commande non trouvée' });
        return;
      }

      const { rows: lignesRows } = await pool.query(
        `SELECT cl.*, p.nom as produit_nom, p.reference as produit_reference, p.stock as stock, p.stock_min as stock_min
         FROM commande_lignes cl
         LEFT JOIN produits p ON cl.produit_id = p.id
         WHERE cl.commande_id = $1`,
        [id]
      );

      res.json({
        ...commandeRows[0],
        lignes: lignesRows
      });
    } catch (error) {
      console.error('Erreur GET /api/commandes/:id:', error);
      res.status(500).json({ error: 'Erreur serveur' });
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
      res.status(status ?? 500).json({ error: status ? error.message : 'Erreur serveur' });
    }
  }

  static async updateStatut(req: Request, res: Response): Promise<void> {
    try {
      await commandeService.updateStatut(Number(req.params.id), req.body.statut);
      res.json({ message: 'Statut mis à jour' });
    } catch (error: any) {
      console.error('Erreur PUT /api/commandes/:id/statut:', error);
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ error: status ? error.message : 'Erreur serveur' });
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
      res.json({ message: 'Commande mise à jour avec succès' });
    } catch (error: any) {
      console.error('Erreur PUT /api/commandes/:id:', error);
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ error: status ? error.message : 'Erreur serveur lors de la mise à jour' });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      await commandeService.delete(Number(req.params.id), (req as AuthRequest).user?.id || null, req);
      res.json({ message: 'Commande supprimée' });
    } catch (error: any) {
      console.error('Erreur DELETE /api/commandes/:id:', error);
      const status = businessStatusOf(error);
      res.status(status ?? 500).json({ error: status ? error.message : 'Erreur serveur' });
    }
  }

  /**
   * 3-way match: reconcile ordered (commande) vs received (receptions) vs
   * invoiced (facture fournisseur) quantities per product for an order.
   */
  static async getMatch(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const { rows: cmdRows } = await pool.query(
        `SELECT c.id, c.numero_commande, c.statut, t.raison_sociale as fournisseur_nom
         FROM commandes_fournisseur c
         LEFT JOIN tiers t ON c.tiers_id = t.id
         WHERE c.id = $1`,
        [id]
      );
      if (cmdRows.length === 0) {
        res.status(404).json({ error: 'Commande non trouvée' });
        return;
      }

      const match = await factureFournisseurService.computeMatch(parseInt(id));

      res.json({
        commande_id: cmdRows[0].id,
        numero_commande: cmdRows[0].numero_commande,
        statut: cmdRows[0].statut,
        fournisseur_nom: cmdRows[0].fournisseur_nom,
        coherent: match.coherent,
        within_tolerance: match.within_tolerance,
        config: match.config,
        violations: match.violations,
        lignes: match.lignes,
      });
    } catch (error) {
      console.error('Erreur GET /api/commandes/:id/match:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const { rows } = await pool.query(
        `SELECT 
          COUNT(*) FILTER (WHERE statut = 'en_attente') as en_attente,
          COUNT(*) FILTER (WHERE statut = 'validee') as validee,
          COUNT(*) FILTER (WHERE statut = 'expediee') as expediee,
          COUNT(*) FILTER (WHERE statut = 'livree') as livree,
          COUNT(*) FILTER (WHERE statut = 'annulee') as annulee
         FROM commandes_fournisseur`
      );
      res.json(rows[0]);
    } catch (error) {
      console.error('Erreur GET /api/commandes/stats:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  /** Bon de commande fournisseur (PDF) — le document envoyé au fournisseur. */
  static async generatePDF(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(
        'SELECT numero_commande FROM commandes_fournisseur WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if (!rows[0]) {
        res.status(404).json({ success: false, error: 'Commande introuvable' });
        return;
      }
      const buffer = await pdfService.generateCommandePDF(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bon-commande-${rows[0].numero_commande || id}.pdf"`
      );
      res.send(buffer);
    } catch (error) {
      console.error('Erreur GET /api/commandes/:id/pdf:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}
