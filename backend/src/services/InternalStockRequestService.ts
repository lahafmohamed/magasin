import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';

export interface InternalRequestLineInput {
  produit_id: number;
  quantite_demandee: number;
}

export interface ValidateRequestLineInput {
  produit_id: number;
  quantite_validee: number;
}

export interface CreateInternalRequestInput {
  magasin_id: number;
  depot_id: number;
  lignes: InternalRequestLineInput[];
  notes?: string;
  cree_par?: number;
  req?: any;
}

export interface ValidateInternalRequestInput {
  lignes?: ValidateRequestLineInput[];
  req?: any;
  user_id?: number;
}

export class InternalStockRequestService {
  private isSchemaCompatibilityError(error: any): boolean {
    const code = String(error?.code || '');
    if (code !== '42P01' && code !== '42703') {
      return false;
    }

    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('internal_stock_requests') ||
      message.includes('internal_stock_request_lignes') ||
      message.includes('stock_transfers') ||
      message.includes('transfer_id') ||
      message.includes('cree_par') ||
      message.includes('valide_par') ||
      message.includes('execute_par')
    );
  }

  private isMissingTransferLinking(error: any): boolean {
    const message = String(error?.message || '');

    // 42P01: undefined_table (e.g. stock_transfers not created yet)
    if (error?.code === '42P01' && /stock_transfers/i.test(message)) {
      return true;
    }

    // 42703: undefined_column (e.g. internal_stock_requests.transfer_id missing)
    if (error?.code === '42703' && /transfer_id|stock_transfers|st\./i.test(message)) {
      return true;
    }

    return false;
  }

  async getAll(options?: {
    statut?: string;
    magasin_id?: number;
    depot_id?: number;
    allowed_location_ids?: number[];
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number }> {
    if (options?.allowed_location_ids && options.allowed_location_ids.length === 0) {
      return { data: [], total: 0 };
    }

    try {
      const page = options?.page || 1;
      const limit = options?.limit || 20;
      const offset = (page - 1) * limit;

      let query = `
        SELECT isr.*, m.nom AS magasin_nom, d.nom AS depot_nom,
               u1.username AS cree_par_username,
               u2.username AS valide_par_username,
               u3.username AS execute_par_username,
               st.numero_transfer
        FROM internal_stock_requests isr
        JOIN stock_locations m ON isr.magasin_id = m.id
        JOIN stock_locations d ON isr.depot_id = d.id
        LEFT JOIN utilisateurs u1 ON isr.cree_par = u1.id
        LEFT JOIN utilisateurs u2 ON isr.valide_par = u2.id
        LEFT JOIN utilisateurs u3 ON isr.execute_par = u3.id
        LEFT JOIN stock_transfers st ON isr.transfer_id = st.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (options?.statut) {
        query += ` AND isr.statut = $${params.length + 1}`;
        params.push(options.statut);
      }

      if (options?.magasin_id) {
        query += ` AND isr.magasin_id = $${params.length + 1}`;
        params.push(options.magasin_id);
      }

      if (options?.depot_id) {
        query += ` AND isr.depot_id = $${params.length + 1}`;
        params.push(options.depot_id);
      }

      if (options?.allowed_location_ids && options.allowed_location_ids.length > 0) {
        query += ` AND (isr.magasin_id = ANY($${params.length + 1}::int[]) OR isr.depot_id = ANY($${params.length + 1}::int[]))`;
        params.push(options.allowed_location_ids);
      }

      query += ' ORDER BY isr.created_at DESC';
      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      let rows: any[] = [];
      try {
        const result = await pool.query(query, params);
        rows = result.rows;
      } catch (error: any) {
        if (!this.isMissingTransferLinking(error)) {
          throw error;
        }

        // Backward compatibility when stock_transfers is not available yet.
        const fallbackQuery = query
          .replace(',\n             st.numero_transfer', ',\n             NULL::text AS numero_transfer')
          .replace('LEFT JOIN stock_transfers st ON isr.transfer_id = st.id\n', '');

        const fallbackResult = await pool.query(fallbackQuery, params);
        rows = fallbackResult.rows;
      }

      let countQuery = 'SELECT COUNT(*) AS total FROM internal_stock_requests isr WHERE 1=1';
      const countParams: any[] = [];

      if (options?.statut) {
        countQuery += ` AND isr.statut = $${countParams.length + 1}`;
        countParams.push(options.statut);
      }

      if (options?.magasin_id) {
        countQuery += ` AND isr.magasin_id = $${countParams.length + 1}`;
        countParams.push(options.magasin_id);
      }

      if (options?.depot_id) {
        countQuery += ` AND isr.depot_id = $${countParams.length + 1}`;
        countParams.push(options.depot_id);
      }

      if (options?.allowed_location_ids && options.allowed_location_ids.length > 0) {
        countQuery += ` AND (isr.magasin_id = ANY($${countParams.length + 1}::int[]) OR isr.depot_id = ANY($${countParams.length + 1}::int[]))`;
        countParams.push(options.allowed_location_ids);
      }

      const { rows: countRows } = await pool.query(countQuery, countParams);
      const total = parseInt(countRows[0].total, 10);

      return { data: rows, total };
    } catch (error: any) {
      if (this.isSchemaCompatibilityError(error)) {
        return { data: [], total: 0 };
      }
      throw error;
    }
  }

  async getById(id: number, allowedLocationIds?: number[]): Promise<any | null> {
    if (allowedLocationIds && allowedLocationIds.length === 0) {
      return null;
    }

    const locationFilter = allowedLocationIds && allowedLocationIds.length > 0
      ? ' AND (isr.magasin_id = ANY($2::int[]) OR isr.depot_id = ANY($2::int[]))'
      : '';
    const params = allowedLocationIds && allowedLocationIds.length > 0
      ? [id, allowedLocationIds]
      : [id];

    let requestRows: any[] = [];
    try {
      const result = await pool.query(
        `SELECT isr.*, m.nom AS magasin_nom, d.nom AS depot_nom,
                u1.username AS cree_par_username,
                u2.username AS valide_par_username,
                u3.username AS execute_par_username,
                st.numero_transfer
         FROM internal_stock_requests isr
         JOIN stock_locations m ON isr.magasin_id = m.id
         JOIN stock_locations d ON isr.depot_id = d.id
         LEFT JOIN utilisateurs u1 ON isr.cree_par = u1.id
         LEFT JOIN utilisateurs u2 ON isr.valide_par = u2.id
         LEFT JOIN utilisateurs u3 ON isr.execute_par = u3.id
         LEFT JOIN stock_transfers st ON isr.transfer_id = st.id
         WHERE isr.id = $1${locationFilter}`,
        params
      );
      requestRows = result.rows;
    } catch (error: any) {
      if (!this.isMissingTransferLinking(error)) {
        if (this.isSchemaCompatibilityError(error)) {
          return null;
        }
        throw error;
      }

      // Backward compatibility when stock_transfers is not available yet.
      const fallbackResult = await pool.query(
        `SELECT isr.*, m.nom AS magasin_nom, d.nom AS depot_nom,
                u1.username AS cree_par_username,
                u2.username AS valide_par_username,
                u3.username AS execute_par_username,
                NULL::text AS numero_transfer
         FROM internal_stock_requests isr
         JOIN stock_locations m ON isr.magasin_id = m.id
         JOIN stock_locations d ON isr.depot_id = d.id
         LEFT JOIN utilisateurs u1 ON isr.cree_par = u1.id
         LEFT JOIN utilisateurs u2 ON isr.valide_par = u2.id
         LEFT JOIN utilisateurs u3 ON isr.execute_par = u3.id
         WHERE isr.id = $1${locationFilter}`,
        params
      );
      requestRows = fallbackResult.rows;
    }

    if (requestRows.length === 0) {
      return null;
    }

    let lineRows: any[] = [];
    try {
      const lineResult = await pool.query(
        `SELECT isl.*, p.nom AS produit_nom, p.reference
         FROM internal_stock_request_lignes isl
         JOIN produits p ON isl.produit_id = p.id
         WHERE isl.request_id = $1
         ORDER BY isl.id ASC`,
        [id]
      );
      lineRows = lineResult.rows;
    } catch (error: any) {
      if (this.isSchemaCompatibilityError(error)) {
        return {
          ...requestRows[0],
          lignes: [],
        };
      }
      throw error;
    }

    return {
      ...requestRows[0],
      lignes: lineRows,
    };
  }

  async create(input: CreateInternalRequestInput): Promise<{ id: number; numero_demande: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { magasin_id, depot_id, lignes, notes, cree_par, req } = input;

      if (magasin_id === depot_id) {
        throw new Error('Le magasin et le depot doivent etre differents');
      }

      if (!lignes || lignes.length === 0) {
        throw new Error('La demande doit contenir au moins une ligne');
      }

      const { rows: locationRows } = await client.query(
        `SELECT id, est_principal, actif
         FROM stock_locations
         WHERE id IN ($1, $2)`,
        [magasin_id, depot_id]
      );

      if (locationRows.length !== 2) {
        throw new Error('Magasin ou depot invalide');
      }

      const depot = locationRows.find((row) => row.id === depot_id);
      if (!depot?.est_principal) {
        throw new Error('Le depot source doit etre une location principale');
      }

      const inactive = locationRows.find((row) => row.actif === false);
      if (inactive) {
        throw new Error('Une des locations est inactive');
      }

      const { rows: seqRows } = await client.query("SELECT nextval('internal_request_numero_seq') AS num");
      const numeroDemande = `DMI-${new Date().getFullYear()}-${String(seqRows[0].num).padStart(5, '0')}`;

      const { rows: requestRows } = await client.query(
        `INSERT INTO internal_stock_requests (
           numero_demande,
           magasin_id,
           depot_id,
           notes,
           cree_par
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [numeroDemande, magasin_id, depot_id, notes || null, cree_par || null]
      );

      const requestId = requestRows[0].id;

      for (const ligne of lignes) {
        if (!ligne.produit_id || !ligne.quantite_demandee || ligne.quantite_demandee <= 0) {
          throw new Error('Chaque ligne doit contenir produit_id et quantite_demandee > 0');
        }

        await client.query(
          `INSERT INTO internal_stock_request_lignes (
             request_id,
             produit_id,
             quantite_demandee
           ) VALUES ($1, $2, $3)`,
          [requestId, ligne.produit_id, ligne.quantite_demandee]
        );
      }

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: cree_par || req?.user?.id,
        action: 'create',
        table_name: 'internal_stock_requests',
        record_id: requestId,
        req,
        new_values: { numero_demande: numeroDemande, magasin_id, depot_id },
      });

      logger.info({ requestId, numeroDemande }, 'Internal stock request created');

      return {
        id: requestId,
        numero_demande: numeroDemande,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error creating internal stock request');
      throw error;
    } finally {
      client.release();
    }
  }

  async validate(requestId: number, input: ValidateInternalRequestInput): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: requestRows } = await client.query(
        `SELECT *
         FROM internal_stock_requests
         WHERE id = $1
           AND statut = 'en_attente'
         FOR UPDATE`,
        [requestId]
      );

      if (requestRows.length === 0) {
        throw new Error('Demande introuvable ou deja traitee');
      }

      const validationMap = new Map<number, number>();
      for (const ligne of input.lignes || []) {
        validationMap.set(ligne.produit_id, ligne.quantite_validee);
      }

      const { rows: lignesRows } = await client.query(
        `SELECT id, produit_id, quantite_demandee
         FROM internal_stock_request_lignes
         WHERE request_id = $1`,
        [requestId]
      );

      if (lignesRows.length === 0) {
        throw new Error('La demande ne contient aucune ligne');
      }

      for (const ligne of lignesRows) {
        const requested = parseInt(ligne.quantite_demandee, 10);
        const provided = validationMap.get(ligne.produit_id);
        const validated = provided === undefined ? requested : provided;

        if (validated < 0) {
          throw new Error(`Quantite validee invalide pour le produit ${ligne.produit_id}`);
        }

        if (validated > requested) {
          throw new Error(`Quantite validee superieure a la demandee pour le produit ${ligne.produit_id}`);
        }

        await client.query(
          `UPDATE internal_stock_request_lignes
           SET quantite_validee = $1
           WHERE id = $2`,
          [validated, ligne.id]
        );
      }

      await client.query(
        `UPDATE internal_stock_requests
         SET statut = 'validee',
             valide_par = $1,
             date_validation = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [input.user_id || null, requestId]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: input.user_id || input.req?.user?.id,
        action: 'validate',
        table_name: 'internal_stock_requests',
        record_id: requestId,
        req: input.req,
      });

      logger.info({ requestId }, 'Internal stock request validated');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error validating internal stock request');
      throw error;
    } finally {
      client.release();
    }
  }

  async reject(requestId: number, reason: string | undefined, userId?: number, req?: any): Promise<void> {
    const { rows } = await pool.query(
      `UPDATE internal_stock_requests
       SET statut = 'refusee',
           motif_refus = $1,
           valide_par = $2,
           date_validation = CURRENT_TIMESTAMP
       WHERE id = $3
         AND statut = 'en_attente'
       RETURNING id`,
      [reason || null, userId || null, requestId]
    );

    if (rows.length === 0) {
      throw new Error('Demande introuvable ou deja traitee');
    }

    await logAudit({
      utilisateur_id: userId || req?.user?.id,
      action: 'reject',
      table_name: 'internal_stock_requests',
      record_id: requestId,
      req,
      new_values: { motif_refus: reason || null },
    });

    logger.info({ requestId }, 'Internal stock request rejected');
  }

  async execute(requestId: number, userId?: number, req?: any): Promise<{ transfer_id: number; numero_transfer: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: requestRows } = await client.query(
        `SELECT id, numero_demande, magasin_id, depot_id, statut
         FROM internal_stock_requests
         WHERE id = $1
           AND statut = 'validee'
         FOR UPDATE`,
        [requestId]
      );

      if (requestRows.length === 0) {
        throw new Error('Demande introuvable ou non validee');
      }

      const requestRow = requestRows[0];

      const { rows: lignesRows } = await client.query(
        `SELECT id, produit_id, quantite_demandee, quantite_validee
         FROM internal_stock_request_lignes
         WHERE request_id = $1
         ORDER BY id ASC`,
        [requestId]
      );

      if (lignesRows.length === 0) {
        throw new Error('La demande ne contient aucune ligne');
      }

      const effectiveLines = lignesRows
        .map((ligne) => {
          const validated = ligne.quantite_validee === null ? ligne.quantite_demandee : ligne.quantite_validee;
          return {
            id: ligne.id,
            produit_id: parseInt(ligne.produit_id, 10),
            quantite: parseInt(validated, 10),
          };
        })
        .filter((ligne) => ligne.quantite > 0);

      if (effectiveLines.length === 0) {
        throw new Error('Aucune ligne validee a transferer');
      }

      const { rows: seqRows } = await client.query("SELECT nextval('transfer_numero_seq') AS num");
      const numeroTransfer = `TRF-${new Date().getFullYear()}-${String(seqRows[0].num).padStart(5, '0')}`;

      const { rows: transferRows } = await client.query(
        `INSERT INTO stock_transfers (
           numero_transfer,
           location_source_id,
           location_destination_id,
           notes,
           cree_par,
           statut
         ) VALUES ($1, $2, $3, $4, $5, 'en_preparation')
         RETURNING id`,
        [
          numeroTransfer,
          requestRow.depot_id,
          requestRow.magasin_id,
          `Cree depuis demande interne ${requestRow.numero_demande}`,
          userId || null,
        ]
      );

      const transferId = transferRows[0].id;

      for (const ligne of effectiveLines) {
        const { rows: stockRows } = await client.query(
          `SELECT quantite
           FROM stock_par_location
           WHERE produit_id = $1
             AND location_id = $2
           FOR UPDATE`,
          [ligne.produit_id, requestRow.depot_id]
        );

        const available = stockRows.length > 0 ? parseInt(stockRows[0].quantite, 10) : 0;
        if (available < ligne.quantite) {
          throw new Error(`Stock depot insuffisant pour produit ${ligne.produit_id}: disponible ${available}, requis ${ligne.quantite}`);
        }

        await client.query(
          `INSERT INTO stock_transfer_lignes (
             transfer_id,
             produit_id,
             quantite_demandee,
             quantite_transferee
           ) VALUES ($1, $2, $3, $4)`,
          [transferId, ligne.produit_id, ligne.quantite, ligne.quantite]
        );

        await client.query(
          `UPDATE stock_par_location
           SET quantite = quantite - $1
           WHERE produit_id = $2
             AND location_id = $3`,
          [ligne.quantite, ligne.produit_id, requestRow.depot_id]
        );

        await client.query(
          `INSERT INTO stock_par_location (produit_id, location_id, quantite)
           VALUES ($1, $2, $3)
           ON CONFLICT (produit_id, location_id)
           DO UPDATE SET quantite = stock_par_location.quantite + $3`,
          [ligne.produit_id, requestRow.magasin_id, ligne.quantite]
        );

        await client.query(
          `UPDATE internal_stock_request_lignes
           SET quantite_transferee = $1
           WHERE id = $2`,
          [ligne.quantite, ligne.id]
        );
      }

      await client.query(
        `UPDATE stock_transfers
         SET statut = 'livre'
         WHERE id = $1`,
        [transferId]
      );

      await client.query(
        `UPDATE internal_stock_requests
         SET statut = 'executee',
             transfer_id = $1,
             execute_par = $2,
             date_execution = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [transferId, userId || null, requestId]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: userId || req?.user?.id,
        action: 'execute',
        table_name: 'internal_stock_requests',
        record_id: requestId,
        req,
        new_values: { transfer_id: transferId, numero_transfer: numeroTransfer },
      });

      logger.info({ requestId, transferId }, 'Internal stock request executed');

      return {
        transfer_id: transferId,
        numero_transfer: numeroTransfer,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error executing internal stock request');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const internalStockRequestService = new InternalStockRequestService();
