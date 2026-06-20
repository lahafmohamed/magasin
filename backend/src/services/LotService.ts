import pool from '../db/connection';
import { BaseService } from './BaseService';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';

// Column names bound exactly to migration 015_batch_lot_tracking.sql:
//   lots(id, produit_id, numero_lot, date_fabrication, date_expiration,
//        quantite_initiale, quantite_restante, prix_achat_unitaire,
//        fournisseur_id, date_reception, statut, notes, created_at)
// fournisseur_id now references tiers(id) (see migration 074).

export interface LotRecord {
  id: number;
  produit_id: number;
  numero_lot: string;
  date_fabrication: string | null;
  date_expiration: string | null;
  quantite_initiale: number;
  quantite_restante: number;
  prix_achat_unitaire: number | null;
  fournisseur_id: number | null;
  date_reception: string;
  statut: 'actif' | 'epuise' | 'expire' | 'rappelle';
  notes: string | null;
  created_at: string;
}

export interface ListLotsOptions {
  produit_id?: number;
  statut?: string;
  expiring_before?: string;
}

export interface CreateLotInput {
  produit_id: number;
  numero_lot: string;
  quantite: number;
  date_fabrication?: string;
  date_expiration?: string;
  prix_achat_unitaire?: number;
  fournisseur_id?: number;
  notes?: string;
  req?: any;
}

export class LotService extends BaseService<LotRecord> {
  protected tableName = 'lots';
  protected selectColumns =
    'l.id, l.produit_id, l.numero_lot, l.date_fabrication, l.date_expiration, l.quantite_initiale, l.quantite_restante, l.prix_achat_unitaire, l.fournisseur_id, l.date_reception, l.statut, l.notes, l.created_at';
  protected defaultSortColumn = 'created_at';
  protected allowedSortColumns = ['created_at', 'date_expiration', 'numero_lot'];

  /**
   * List lots with optional filters (product, status, expiring-before-date).
   */
  async list(options?: ListLotsOptions): Promise<any[]> {
    let query = `
      SELECT ${this.selectColumns},
             p.nom AS produit_nom, p.reference AS produit_reference,
             t.raison_sociale AS fournisseur_nom
      FROM lots l
      LEFT JOIN produits p ON l.produit_id = p.id
      LEFT JOIN tiers t ON l.fournisseur_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.produit_id !== undefined) {
      params.push(options.produit_id);
      query += ` AND l.produit_id = $${params.length}`;
    }

    if (options?.statut) {
      params.push(options.statut);
      query += ` AND l.statut = $${params.length}`;
    }

    if (options?.expiring_before) {
      params.push(options.expiring_before);
      query += ` AND l.date_expiration IS NOT NULL AND l.date_expiration <= $${params.length}`;
    }

    query += ' ORDER BY l.date_expiration ASC NULLS LAST, l.created_at DESC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Get a single lot by id.
   */
  async getById(id: number): Promise<any | null> {
    const { rows } = await pool.query(
      `SELECT ${this.selectColumns},
              p.nom AS produit_nom, p.reference AS produit_reference,
              t.raison_sociale AS fournisseur_nom
       FROM lots l
       LEFT JOIN produits p ON l.produit_id = p.id
       LEFT JOIN tiers t ON l.fournisseur_id = t.id
       WHERE l.id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Create a lot (typically on reception). Sets both quantite_initiale and
   * quantite_restante to the received quantity.
   */
  async create(input: CreateLotInput): Promise<LotRecord> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        produit_id,
        numero_lot,
        quantite,
        date_fabrication,
        date_expiration,
        prix_achat_unitaire,
        fournisseur_id,
        notes,
        req,
      } = input;

      const { rows } = await client.query(
        `INSERT INTO lots
           (produit_id, numero_lot, date_fabrication, date_expiration,
            quantite_initiale, quantite_restante, prix_achat_unitaire,
            fournisseur_id, statut, notes)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7, 'actif', $8)
         RETURNING *`,
        [
          produit_id,
          numero_lot,
          date_fabrication || null,
          date_expiration || null,
          quantite,
          prix_achat_unitaire ?? null,
          fournisseur_id ?? null,
          notes || null,
        ]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: req?.user?.id || null,
        action: 'create',
        table_name: 'lots',
        record_id: rows[0].id,
        req,
        new_values: { produit_id, numero_lot, quantite },
      });

      logger.info({ lotId: rows[0].id, numero_lot }, 'Lot created');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error creating lot');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Adjust a lot's remaining quantity by a signed delta. Recomputes the status:
   * a lot drops to 'epuise' when it reaches zero, and returns to 'actif' when
   * restocked (unless it has already expired).
   */
  async adjustQuantity(id: number, delta: number, req?: any): Promise<LotRecord | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: existing } = await client.query(
        'SELECT quantite_restante, date_expiration, statut FROM lots WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (existing.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const current = Number(existing[0].quantite_restante);
      const nouvelle = current + delta;
      if (nouvelle < 0) {
        await client.query('ROLLBACK');
        throw new Error('Quantité restante insuffisante dans le lot');
      }

      const expiration = existing[0].date_expiration;
      const isExpired = expiration && new Date(expiration) < new Date();
      let statut = existing[0].statut;
      if (nouvelle === 0) {
        statut = 'epuise';
      } else if (statut === 'epuise') {
        statut = isExpired ? 'expire' : 'actif';
      }

      const { rows } = await client.query(
        `UPDATE lots SET quantite_restante = $1, statut = $2 WHERE id = $3 RETURNING *`,
        [nouvelle, statut, id]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: req?.user?.id || null,
        action: 'update',
        table_name: 'lots',
        record_id: id,
        req,
        new_values: { quantite_restante: nouvelle, delta, statut },
      });

      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error adjusting lot quantity');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Lots expiring within `days` days. Uses the lots_perimion view when present
   * (recreated by migration 074), otherwise falls back to a direct query.
   */
  async expiringLots(days: number = 30): Promise<any[]> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM lots_perimion
         WHERE jours_restants <= $1
         ORDER BY date_expiration ASC`,
        [days]
      );
      return rows;
    } catch (error: any) {
      // 42P01 = undefined_table (view absent) — fall back to a direct query.
      if (error?.code !== '42P01') {
        throw error;
      }
      const { rows } = await pool.query(
        `SELECT ${this.selectColumns},
                p.nom AS produit_nom, p.reference AS produit_reference,
                t.raison_sociale AS fournisseur_nom,
                (l.date_expiration - CURRENT_DATE) AS jours_restants
         FROM lots l
         LEFT JOIN produits p ON l.produit_id = p.id
         LEFT JOIN tiers t ON l.fournisseur_id = t.id
         WHERE l.date_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval
           AND l.statut = 'actif'
           AND l.quantite_restante > 0
         ORDER BY l.date_expiration ASC`,
        [days]
      );
      return rows;
    }
  }

  /**
   * Run the orphaned expire_old_lots() maintenance function.
   */
  async runExpire(): Promise<void> {
    await pool.query('SELECT expire_old_lots()');
  }
}

export const lotService = new LotService();
