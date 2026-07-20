import pool from '../db/connection';
import { BaseService } from './BaseService';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';
import { checkPeriodIsOpen } from './PeriodService';
import { costedStockIn } from './StockCostingService';
import { businessError } from '../utils/errors';

export interface ReceptionLigneInput {
  produit_id: number;
  quantite_commandee: number;
  quantite_recue: number;
  cout_unitaire: number;
  notes?: string;
}

export interface CreateReceptionInput {
  commande_id: number;
  location_id?: number;
  lignes: ReceptionLigneInput[];
  notes?: string;
  receptionne_par?: number;
  req?: any;
}

export interface ReceptionRecord {
  id: number;
  commande_id: number;
  numero_reception: string;
  date_reception: string;
  receptionne_par: number | null;
  notes: string | null;
  created_at: string;
}

export class ReceptionService extends BaseService<ReceptionRecord> {
  protected tableName = 'receptions';
  protected selectColumns = 'r.id, r.commande_id, r.numero_reception, r.date_reception, r.receptionne_par, r.notes, r.created_at, c.numero_commande, f.nom as fournisseur_nom';
  protected defaultSortColumn = 'created_at';
  protected allowedSortColumns = ['created_at', 'date_reception', 'numero_reception'];

  private async getPrincipalLocationId(client: any): Promise<number> {
    const { rows } = await client.query(
      'SELECT id FROM stock_locations WHERE est_principal = true AND actif = true LIMIT 1'
    );

    if (rows.length === 0) {
      throw businessError(400, 'Aucune location principale active configuree');
    }

    return rows[0].id;
  }

  /**
   * Get all receptions with supplier info and pagination
   */
  async getAll(options?: { search?: string; page?: number; limit?: number }): Promise<{ data: any[]; total: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT r.*, c.numero_commande, t.raison_sociale as fournisseur_nom, t.id as fournisseur_id
      FROM receptions r
      LEFT JOIN commandes_fournisseur c ON r.commande_id = c.id
      LEFT JOIN tiers t ON c.tiers_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.search) {
      query += ' AND (r.numero_reception ILIKE $1 OR c.numero_commande ILIKE $2 OR t.raison_sociale ILIKE $3)';
      params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }

    query += ' ORDER BY r.created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM receptions r
      LEFT JOIN commandes_fournisseur c ON r.commande_id = c.id
      LEFT JOIN tiers t ON c.tiers_id = t.id
      WHERE 1=1
    `;
    const countParams: any[] = [];
    if (options?.search) {
      countQuery += ' AND (r.numero_reception ILIKE $1 OR c.numero_commande ILIKE $2 OR t.raison_sociale ILIKE $3)';
      countParams.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    return { data: rows, total };
  }

  /**
   * Get reception with line items
   */
  async getById(id: number): Promise<any | null> {
    const { rows: receptionRows } = await pool.query(
      `SELECT r.*, c.numero_commande, t.raison_sociale as fournisseur_nom, t.id as fournisseur_id
       FROM receptions r
       LEFT JOIN commandes_fournisseur c ON r.commande_id = c.id
       LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE r.id = $1`,
      [id]
    );

    if (receptionRows.length === 0) return null;

    const { rows: lignesRows } = await pool.query(
      `SELECT rl.*, p.nom as produit_nom, p.reference as produit_reference, p.code_barre
       FROM reception_lignes rl
       LEFT JOIN produits p ON rl.produit_id = p.id
       WHERE rl.reception_id = $1`,
      [id]
    );

    return {
      ...receptionRows[0],
      lignes: lignesRows,
    };
  }

  /**
   * Create reception with stock update (transactional)
   */
  async create(input: CreateReceptionInput): Promise<{ id: number; numero_reception: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await checkPeriodIsOpen(new Date(), client);

      const { commande_id, lignes, notes, receptionne_par, req } = input;
      const effectiveLocationId = input.location_id || await this.getPrincipalLocationId(client);

      if (!lignes || lignes.length === 0) {
        throw businessError(400, 'La réception doit contenir au moins un produit');
      }

      // --- 3-way match control: block over-receipt beyond what was ordered. ---
      // Build ordered-per-product and already-received-per-product maps for this order.
      const { rows: orderedRows } = await client.query(
        'SELECT produit_id, SUM(quantite) AS qte FROM commande_lignes WHERE commande_id = $1 GROUP BY produit_id',
        [commande_id]
      );
      const orderedMap = new Map<number, number>(orderedRows.map((r: any) => [r.produit_id, Number(r.qte)]));
      const { rows: receivedRows } = await client.query(
        `SELECT rl.produit_id, SUM(rl.quantite_recue) AS qte
         FROM reception_lignes rl JOIN receptions r ON rl.reception_id = r.id
         WHERE r.commande_id = $1 GROUP BY rl.produit_id`,
        [commande_id]
      );
      const receivedMap = new Map<number, number>(receivedRows.map((r: any) => [r.produit_id, Number(r.qte)]));
      // Aggregate this reception's quantities per product (a product may repeat across lines).
      const incomingMap = new Map<number, number>();
      for (const ligne of lignes) {
        incomingMap.set(ligne.produit_id, (incomingMap.get(ligne.produit_id) || 0) + ligne.quantite_recue);
      }
      for (const [produitId, incoming] of incomingMap) {
        const ordered = orderedMap.get(produitId) || 0;
        const already = receivedMap.get(produitId) || 0;
        if (already + incoming > ordered) {
          throw businessError(
            422,
            `Réception excessive pour le produit ${produitId}: commandé ${ordered}, déjà reçu ${already}, ` +
            `réception en cours ${incoming} (max autorisé ${Math.max(0, ordered - already)}).`,
            'OVER_RECEIPT'
          );
        }
      }

      // Generate reception number via sequence
      const { rows: seqRows } = await client.query("SELECT nextval('reception_numero_seq') as num");
      const numeroReception = `REC-${new Date().getFullYear()}-${String(seqRows[0].num).padStart(5, '0')}`;

      // Insert reception
      let receptionResult: any[] = [];
      try {
        await client.query('SAVEPOINT reception_insert');
        const withLocation = await client.query(
          'INSERT INTO receptions (numero_reception, commande_id, notes, receptionne_par, location_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [numeroReception, commande_id, notes || null, receptionne_par || null, effectiveLocationId]
        );
        receptionResult = withLocation.rows;
      } catch (error: any) {
        if (error?.code !== '42703') {
          throw error;
        }

        await client.query('ROLLBACK TO SAVEPOINT reception_insert');
        const legacy = await client.query(
          'INSERT INTO receptions (numero_reception, commande_id, notes, receptionne_par) VALUES ($1, $2, $3, $4) RETURNING id',
          [numeroReception, commande_id, notes || null, receptionne_par || null]
        );
        receptionResult = legacy.rows;
      }

      const receptionId = receptionResult[0].id;

      // Insert line items and update stock
      for (const ligne of lignes) {
        const totalLigne = ligne.quantite_recue * ligne.cout_unitaire;
        const ecart = ligne.quantite_recue - ligne.quantite_commandee;

        await client.query(
          `INSERT INTO reception_lignes
           (reception_id, produit_id, quantite_commandee, quantite_recue, cout_unitaire, total_ligne, ecart, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [receptionId, ligne.produit_id, ligne.quantite_commandee, ligne.quantite_recue, ligne.cout_unitaire, totalLigne, ecart, ligne.notes || null]
        );

        // Update product stock with received quantity: single costed stock-in
        // recomputes the weighted-average CMP from the pre-inflow row.
        // (The previous split upsert-then-recompute read quantite AFTER the
        // increment, double-counting the received qty in the denominator.)
        if (ligne.quantite_recue > 0) {
          const stockIn = await costedStockIn(client, {
            produitId: ligne.produit_id,
            locationId: effectiveLocationId,
            quantite: ligne.quantite_recue,
            unitCost: ligne.cout_unitaire > 0 ? ligne.cout_unitaire : null,
          });

          await client.query(
            `INSERT INTO mouvements_stock
               (produit_id, type_mouvement, quantite, stock_avant, stock_apres, raison, reference_liee, location_id)
             VALUES ($1, 'commande', $2, $3, $4, $5, $6, $7)`,
            [
              ligne.produit_id,
              ligne.quantite_recue,
              stockIn.stockAvant,
              stockIn.stockApres,
              `Réception — ${numeroReception}`,
              numeroReception,
              effectiveLocationId,
            ]
          );

          if (ligne.cout_unitaire > 0) {
            await client.query(
              'UPDATE produits SET prix_achat = $1 WHERE id = $2',
              [stockIn.cmpApres, ligne.produit_id]
            );
          }
        }
      }

      // Update order status to delivered
      await client.query(
        `UPDATE commandes_fournisseur 
         SET statut = 'livree', date_livraison_reelle = CURRENT_DATE 
         WHERE id = $1 AND statut != 'annulee'`,
        [commande_id]
      );

      await client.query('COMMIT');

      // Audit log
      if (receptionne_par) {
        await logAudit({
          utilisateur_id: receptionne_par,
          action: 'create',
          table_name: 'receptions',
          record_id: receptionId,
          req,
          new_values: { numero_reception: numeroReception, commande_id },
        });
      }

      logger.info({ receptionId, numeroReception, commande_id }, 'Reception created');

      return { id: receptionId, numero_reception: numeroReception };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error creating reception');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get pending orders (available for reception)
   */
  async getPendingOrders(): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT c.*, t.raison_sociale as fournisseur_nom,
        (SELECT COUNT(*) FROM receptions r WHERE r.commande_id = c.id) as receptions_count
       FROM commandes_fournisseur c
       LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE c.statut IN ('validee', 'expediee') AND c.deleted_at IS NULL
       ORDER BY c.date_commande ASC`
    );
    return rows;
  }

  /**
   * Get order details for reception creation
   */
  async getOrderDetails(commandeId: number): Promise<any | null> {
    const { rows: commandeRows } = await pool.query(
      `SELECT c.*, t.raison_sociale as fournisseur_nom, t.id as fournisseur_id
       FROM commandes_fournisseur c
       LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE c.id = $1`,
      [commandeId]
    );

    if (commandeRows.length === 0) return null;

    const { rows: lignesRows } = await pool.query(
      `SELECT cl.*, p.nom as produit_nom, p.reference as produit_reference, p.code_barre, p.stock as stock_actuel
       FROM commande_lignes cl
       LEFT JOIN produits p ON cl.produit_id = p.id
       WHERE cl.commande_id = $1`,
      [commandeId]
    );

    return {
      ...commandeRows[0],
      lignes: lignesRows,
    };
  }

  /**
   * Get reception statistics
   */
  async getStats(): Promise<any> {
    const { rows } = await pool.query(
      `SELECT 
        COUNT(*) as total_receptions,
        COALESCE(SUM(rl.total_ligne), 0) as valeur_totale,
        COALESCE(AVG(rl.ecart), 0) as ecart_moyen,
        COUNT(DISTINCT r.commande_id) as commandes_traitees
       FROM receptions r
       LEFT JOIN reception_lignes rl ON r.id = rl.reception_id`
    );
    return rows[0];
  }

  /**
   * Delete reception (and reverse stock changes)
   */
  async delete(id: number, userId?: number, req?: any): Promise<boolean> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: receptionRows } = await client.query('SELECT * FROM receptions WHERE id = $1', [id]);
      if (receptionRows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      // Reverse stock changes
      const { rows: receptionLocationRows } = await client.query(
        'SELECT COALESCE(location_id, (SELECT id FROM stock_locations WHERE est_principal = true AND actif = true LIMIT 1)) as effective_location_id FROM receptions WHERE id = $1',
        [id]
      );
      const effectiveLocationId = receptionLocationRows[0]?.effective_location_id;

      const { rows: lignesRows } = await client.query(
        'SELECT produit_id, quantite_recue FROM reception_lignes WHERE reception_id = $1',
        [id]
      );

      for (const ligne of lignesRows) {
        const { rows: stockBefore } = await client.query(
          'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
          [ligne.produit_id, effectiveLocationId]
        );
        const stockAvant = stockBefore.length > 0 ? parseInt(stockBefore[0].quantite) : 0;
        const stockApres = Math.max(0, stockAvant - ligne.quantite_recue);

        await client.query(
          `UPDATE stock_par_location
           SET quantite = GREATEST(0, quantite - $1)
           WHERE produit_id = $2 AND location_id = $3`,
          [ligne.quantite_recue, ligne.produit_id, effectiveLocationId]
        );

        // Record a compensating stock movement so the ledger matches stock_par_location.
        await client.query(
          `INSERT INTO mouvements_stock
             (produit_id, type_mouvement, quantite, stock_avant, stock_apres, raison, reference_liee, location_id)
           VALUES ($1, 'ajustement', $2, $3, $4, $5, $6, $7)`,
          [
            ligne.produit_id,
            stockApres - stockAvant,
            stockAvant,
            stockApres,
            `Annulation réception #${id}`,
            `RECEPTION-DELETE-${id}`,
            effectiveLocationId,
          ]
        );
      }

      // Delete reception lines and reception
      await client.query('DELETE FROM reception_lignes WHERE reception_id = $1', [id]);
      await client.query('DELETE FROM receptions WHERE id = $1', [id]);

      // Revert order status
      await client.query(
        `UPDATE commandes_fournisseur 
         SET statut = 'expediee', date_livraison_reelle = NULL 
         WHERE id = $1`,
        [receptionRows[0].commande_id]
      );

      await client.query('COMMIT');

      if (userId) {
        await logAudit({
          utilisateur_id: userId,
          action: 'delete',
          table_name: 'receptions',
          record_id: id,
          req,
        });
      }

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const receptionService = new ReceptionService();
