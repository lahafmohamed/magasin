import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';

// Column names bound exactly to migration 016_serial_number_tracking.sql:
//   numeros_serie(id, produit_id, numero_serie, lot_id, statut, date_achat,
//                 date_vente, client_id, facture_id, prix_vente, garantie_jusqu,
//                 notes, created_at, updated_at)
//   statut CHECK IN ('en_stock','vendu','retourne','en_garantie','reforme')
//   UNIQUE(produit_id, numero_serie)
// client_id now references tiers(id) (see migration 074).

export type SerialStatut = 'en_stock' | 'vendu' | 'retourne' | 'en_garantie' | 'reforme';

export interface SerialRecord {
  id: number;
  produit_id: number;
  numero_serie: string;
  lot_id: number | null;
  statut: SerialStatut;
  date_achat: string | null;
  date_vente: string | null;
  client_id: number | null;
  facture_id: number | null;
  prix_vente: number | null;
  garantie_jusqu: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListSerialsOptions {
  produit_id?: number;
  statut?: string;
  lot_id?: number;
}

export interface RegisterSerialInput {
  produit_id: number;
  numero_serie: string;
  lot_id?: number;
  statut?: SerialStatut;
  date_achat?: string;
  prix_vente?: number;
  notes?: string;
  req?: any;
}

const SELECT_COLUMNS =
  'ns.id, ns.produit_id, ns.numero_serie, ns.lot_id, ns.statut, ns.date_achat, ns.date_vente, ns.client_id, ns.facture_id, ns.prix_vente, ns.garantie_jusqu, ns.notes, ns.created_at, ns.updated_at';

export class SerialService {
  /**
   * Register a serial number for a product.
   */
  async register(input: RegisterSerialInput): Promise<SerialRecord> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        produit_id,
        numero_serie,
        lot_id,
        statut,
        date_achat,
        prix_vente,
        notes,
        req,
      } = input;

      const { rows } = await client.query(
        `INSERT INTO numeros_serie
           (produit_id, numero_serie, lot_id, statut, date_achat, prix_vente, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          produit_id,
          numero_serie,
          lot_id ?? null,
          statut || 'en_stock',
          date_achat || null,
          prix_vente ?? null,
          notes || null,
        ]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: req?.user?.id || null,
        action: 'create',
        table_name: 'numeros_serie',
        record_id: rows[0].id,
        req,
        new_values: { produit_id, numero_serie },
      });

      logger.info({ serialId: rows[0].id, numero_serie }, 'Serial number registered');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error registering serial number');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * List serial numbers, filterable by product / status / lot.
   */
  async list(options?: ListSerialsOptions): Promise<any[]> {
    let query = `
      SELECT ${SELECT_COLUMNS},
             p.nom AS produit_nom, p.reference AS produit_reference,
             t.raison_sociale AS client_nom
      FROM numeros_serie ns
      LEFT JOIN produits p ON ns.produit_id = p.id
      LEFT JOIN tiers t ON ns.client_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.produit_id !== undefined) {
      params.push(options.produit_id);
      query += ` AND ns.produit_id = $${params.length}`;
    }
    if (options?.statut) {
      params.push(options.statut);
      query += ` AND ns.statut = $${params.length}`;
    }
    if (options?.lot_id !== undefined) {
      params.push(options.lot_id);
      query += ` AND ns.lot_id = $${params.length}`;
    }

    query += ' ORDER BY ns.created_at DESC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Lookup a single serial number record by its numero_serie (optionally scoped
   * to a product, since uniqueness is per-product).
   */
  async lookupBySerial(numero_serie: string, produit_id?: number): Promise<any | null> {
    let query = `
      SELECT ${SELECT_COLUMNS},
             p.nom AS produit_nom, p.reference AS produit_reference,
             t.raison_sociale AS client_nom
      FROM numeros_serie ns
      LEFT JOIN produits p ON ns.produit_id = p.id
      LEFT JOIN tiers t ON ns.client_id = t.id
      WHERE ns.numero_serie = $1
    `;
    const params: any[] = [numero_serie];
    if (produit_id !== undefined) {
      params.push(produit_id);
      query += ` AND ns.produit_id = $${params.length}`;
    }
    query += ' ORDER BY ns.created_at DESC LIMIT 1';

    const { rows } = await pool.query(query, params);
    return rows[0] || null;
  }

  async getById(id: number): Promise<any | null> {
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS},
              p.nom AS produit_nom, p.reference AS produit_reference,
              t.raison_sociale AS client_nom
       FROM numeros_serie ns
       LEFT JOIN produits p ON ns.produit_id = p.id
       LEFT JOIN tiers t ON ns.client_id = t.id
       WHERE ns.id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Mark a serial as sold: set statut='vendu', record sale date, client, invoice
   * and (optionally) a warranty end date.
   */
  async markSold(
    id: number,
    data: { client_id?: number; facture_id?: number; prix_vente?: number; garantie_jusqu?: string; date_vente?: string },
    req?: any
  ): Promise<SerialRecord | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: existing } = await client.query(
        'SELECT id FROM numeros_serie WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (existing.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const { rows } = await client.query(
        `UPDATE numeros_serie
         SET statut = 'vendu',
             date_vente = COALESCE($2, CURRENT_DATE),
             client_id = $3,
             facture_id = $4,
             prix_vente = COALESCE($5, prix_vente),
             garantie_jusqu = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [
          id,
          data.date_vente || null,
          data.client_id ?? null,
          data.facture_id ?? null,
          data.prix_vente ?? null,
          data.garantie_jusqu || null,
        ]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: req?.user?.id || null,
        action: 'update',
        table_name: 'numeros_serie',
        record_id: id,
        req,
        new_values: { statut: 'vendu', ...data },
      });

      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error marking serial as sold');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Flag a serial as under warranty service (statut='en_garantie').
   */
  async markUnderWarranty(id: number, garantie_jusqu?: string, req?: any): Promise<SerialRecord | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: existing } = await client.query(
        'SELECT id FROM numeros_serie WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (existing.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const { rows } = await client.query(
        `UPDATE numeros_serie
         SET statut = 'en_garantie',
             garantie_jusqu = COALESCE($2, garantie_jusqu),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, garantie_jusqu || null]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: req?.user?.id || null,
        action: 'update',
        table_name: 'numeros_serie',
        record_id: id,
        req,
        new_values: { statut: 'en_garantie', garantie_jusqu },
      });

      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error marking serial under warranty');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const serialService = new SerialService();
