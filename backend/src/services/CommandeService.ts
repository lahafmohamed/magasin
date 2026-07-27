import pool from '../db/connection';
import { businessError } from '../utils/errors';
import { generateDocumentNumber } from './NumberingService';
import { logAudit } from '../middleware/audit';
import { computeLineTotals } from './PricingService';

export interface CommandeLigneInput {
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
}

export interface CreateCommandeInput {
  tiersId: number | undefined;
  lignes: CommandeLigneInput[];
  notes?: string;
  date_livraison_prevue?: string;
  userId: number | null;
}

export interface UpdateCommandeInput {
  tiersId: number | undefined;
  lignes: CommandeLigneInput[];
  notes?: string;
  date_livraison_prevue?: string;
}

export interface CommandeListOptions {
  statut?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}

/**
 * Commande fournisseur orchestration: reads (list/detail/match/stats) plus the
 * transactional writes — order and auto-created draft facture fournisseur are
 * written together and kept in sync while the invoice is still 'en_attente'.
 * Business rules throw businessError (4xx).
 */
export class CommandeService {

  /** Allow-listed sort keys (frontend key → SQL column). Never interpolate raw input. */
  private static readonly SORT_COLUMNS: Record<string, string> = {
    numero: 'c.numero_commande',
    date: 'c.date_commande',
    montant: 'c.sous_total',
    livraison: 'c.date_livraison_prevue',
  };

  /**
   * Paginated order list. The read paths used to live in CommandeController as
   * raw pool.query calls, so the list, detail, match and stats reads bypassed
   * this service entirely and could not be reused or tested.
   */
  async getAll(options: CommandeListOptions = {}): Promise<{
    data: any[]; total: number; page: number; limit: number;
  }> {
    const limit = Math.min(200, Math.max(1, options.limit || 20));
    const page = Math.max(1, options.page || 1);
    const offset = (page - 1) * limit;

    const sortColumn = CommandeService.SORT_COLUMNS[options.sort || ''] || 'c.date_commande';
    const sortOrder = options.order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const filters: string[] = ['1=1'];
    const params: any[] = [];

    if (options.statut) {
      filters.push(`c.statut = $${params.length + 1}`);
      params.push(options.statut);
    }
    if (options.search) {
      filters.push(
        `(c.numero_commande ILIKE $${params.length + 1} OR t.raison_sociale ILIKE $${params.length + 2})`
      );
      params.push(`%${options.search}%`, `%${options.search}%`);
    }
    const whereClause = filters.join(' AND ');

    const dataParams = [...params, limit, offset];
    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM commandes_fournisseur c
         LEFT JOIN tiers t ON c.tiers_id = t.id
         WHERE ${whereClause}`,
        params
      ),
      pool.query(
        `SELECT c.*, t.raison_sociale as fournisseur_nom
         FROM commandes_fournisseur c
         LEFT JOIN tiers t ON c.tiers_id = t.id
         WHERE ${whereClause}
         ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, c.id DESC
         LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams
      ),
    ]);

    return { data: rows, total: countRows[0]?.total ?? 0, page, limit };
  }

  /** One order with its lines, or null when it does not exist. */
  async getById(id: number): Promise<any | null> {
    const { rows: commandeRows } = await pool.query(
      `SELECT c.*, t.raison_sociale as fournisseur_nom, t.telephone as fournisseur_telephone, t.email as fournisseur_email
       FROM commandes_fournisseur c
       LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE c.id = $1`,
      [id]
    );
    if (commandeRows.length === 0) return null;

    const { rows: lignesRows } = await pool.query(
      `SELECT cl.*, p.nom as produit_nom, p.reference as produit_reference, p.stock as stock, p.stock_min as stock_min
       FROM commande_lignes cl
       LEFT JOIN produits p ON cl.produit_id = p.id
       WHERE cl.commande_id = $1`,
      [id]
    );

    return { ...commandeRows[0], lignes: lignesRows };
  }

  /** Order header fields needed alongside a 3-way match result. */
  async getMatchHeader(id: number): Promise<any | null> {
    const { rows } = await pool.query(
      `SELECT c.id, c.numero_commande, c.statut, t.raison_sociale as fournisseur_nom
       FROM commandes_fournisseur c
       LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE c.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  /** Order number for a live (non-deleted) order — used for the PDF filename. */
  async getNumero(id: number): Promise<string | null> {
    const { rows } = await pool.query(
      'SELECT numero_commande FROM commandes_fournisseur WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return rows[0]?.numero_commande ?? null;
  }

  /** Order counts per status. */
  async getStats(): Promise<any> {
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE statut = 'en_attente') as en_attente,
        COUNT(*) FILTER (WHERE statut = 'validee') as validee,
        COUNT(*) FILTER (WHERE statut = 'expediee') as expediee,
        COUNT(*) FILTER (WHERE statut = 'livree') as livree,
        COUNT(*) FILTER (WHERE statut = 'annulee') as annulee
       FROM commandes_fournisseur`
    );
    return rows[0];
  }

  /**
   * Rounded per-line totals and their sum.
   *
   * The header sum and the four line-insert sites used to recompute
   * `quantite * prix_unitaire` independently and unrounded, so the order, its
   * lines, the auto-created draft invoice and that invoice's lines could each
   * land on a different figure for the same order.
   */
  private lineTotals(lignes: CommandeLigneInput[]): { totalLignes: number[]; sousTotal: number } {
    return computeLineTotals(lignes);
  }

  /** Bulk-insert order lines from totals already computed for the header. */
  private async insertCommandeLignes(
    client: any, commandeId: number, lignes: CommandeLigneInput[], totalLignes: number[]
  ): Promise<void> {
    await client.query(
      `INSERT INTO commande_lignes (commande_id, produit_id, quantite, prix_unitaire, total_ligne)
       SELECT $1, unnest($2::int[]), unnest($3::int[]), unnest($4::numeric[]), unnest($5::numeric[])`,
      [commandeId, lignes.map((l) => l.produit_id), lignes.map((l) => l.quantite),
        lignes.map((l) => l.prix_unitaire), totalLignes]
    );
  }

  /** Bulk-insert the linked draft invoice's lines from the same totals. */
  private async insertFactureLignes(
    client: any, factureId: number, lignes: CommandeLigneInput[], totalLignes: number[]
  ): Promise<void> {
    await client.query(
      `INSERT INTO facture_fournisseur_lignes (facture_id, produit_id, quantite, prix_unitaire, total_ligne)
       SELECT $1, unnest($2::int[]), unnest($3::int[]), unnest($4::numeric[]), unnest($5::numeric[])`,
      [factureId, lignes.map((l) => l.produit_id), lignes.map((l) => l.quantite),
        lignes.map((l) => l.prix_unitaire), totalLignes]
    );
  }

  private assertLignes(lignes: CommandeLigneInput[] | undefined): asserts lignes is CommandeLigneInput[] {
    if (!lignes || lignes.length === 0) {
      throw businessError(400, 'La commande doit contenir au moins un produit');
    }
  }

  /**
   * Create an order and its linked draft supplier invoice in one transaction.
   */
  async create(input: CreateCommandeInput): Promise<{
    id: number;
    numero_commande: string;
    facture_fournisseur_id: number;
    numero_facture_interne: string;
    message: string;
  }> {
    const { tiersId, lignes, notes, date_livraison_prevue, userId } = input;
    this.assertLignes(lignes);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const numeroCommande = await generateDocumentNumber('commande', client);
      const { totalLignes, sousTotal } = this.lineTotals(lignes);

      const { rows: commandeResult } = await client.query(
        'INSERT INTO commandes_fournisseur (numero_commande, tiers_id, sous_total, notes, date_livraison_prevue) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [numeroCommande, tiersId, sousTotal, notes || null, date_livraison_prevue || null]
      );
      const commandeId = commandeResult[0].id;

      await this.insertCommandeLignes(client, commandeId, lignes, totalLignes);

      // Auto-create a facture_fournisseur (brouillon) linked to this commande
      const numeroFactureInterne = await generateDocumentNumber('facture_fournisseur', client);
      const today = new Date().toISOString().split('T')[0];

      const { rows: ffResult } = await client.query(
        `INSERT INTO factures_fournisseur
         (tiers_id, commande_id, numero_facture_fournisseur, numero_facture_interne, date_facture, sous_total, tva, total, statut, notes, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'en_attente', $8, $9)
         RETURNING id`,
        [tiersId, commandeId, numeroCommande, numeroFactureInterne, today, sousTotal, sousTotal, notes || null, userId]
      );
      const factureId = ffResult[0].id;

      await this.insertFactureLignes(client, factureId, lignes, totalLignes);

      await client.query('COMMIT');

      return {
        id: commandeId,
        numero_commande: numeroCommande,
        facture_fournisseur_id: factureId,
        numero_facture_interne: numeroFactureInterne,
        message: 'Commande et facture fournisseur créées',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an 'en_attente' order (lines replaced) and sync its draft invoice.
   */
  async update(id: number, input: UpdateCommandeInput): Promise<void> {
    const { tiersId, lignes, notes, date_livraison_prevue } = input;
    this.assertLignes(lignes);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: commandeRows } = await client.query(
        'SELECT statut FROM commandes_fournisseur WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (commandeRows.length === 0) {
        throw businessError(404, 'Commande non trouvée');
      }
      if (commandeRows[0].statut !== 'en_attente') {
        throw businessError(400, 'Seules les commandes en attente peuvent être modifiées');
      }

      const { totalLignes, sousTotal } = this.lineTotals(lignes);

      await client.query(
        `UPDATE commandes_fournisseur
         SET tiers_id = $1, sous_total = $2, notes = $3, date_livraison_prevue = $4
         WHERE id = $5`,
        [tiersId, sousTotal, notes || null, date_livraison_prevue || null, id]
      );

      await client.query('DELETE FROM commande_lignes WHERE commande_id = $1', [id]);
      await this.insertCommandeLignes(client, id, lignes, totalLignes);

      // Sync the linked invoice while it is still a draft ('en_attente')
      const { rows: ffRows } = await client.query(
        'SELECT id, statut FROM factures_fournisseur WHERE commande_id = $1 FOR UPDATE',
        [id]
      );
      if (ffRows.length > 0 && ffRows[0].statut === 'en_attente') {
        const factureId = ffRows[0].id;
        await client.query(
          `UPDATE factures_fournisseur
           SET tiers_id = $1, sous_total = $2, total = $3, notes = $4
           WHERE id = $5`,
          [tiersId, sousTotal, sousTotal, notes || null, factureId]
        );

        await client.query('DELETE FROM facture_fournisseur_lignes WHERE facture_id = $1', [factureId]);
        await this.insertFactureLignes(client, factureId, lignes, totalLignes);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update order status. 'livree' is blocked — stock only moves via réception.
   */
  async updateStatut(id: number, statut: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: commandeRows } = await client.query(
        'SELECT statut FROM commandes_fournisseur WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (commandeRows.length === 0) {
        throw businessError(404, 'Commande non trouvée');
      }

      if (statut === 'livree') {
        throw businessError(
          400,
          'Impossible de marquer une commande comme livrée directement. Utilisez la réception de marchandises pour enregistrer les produits reçus et mettre à jour le stock.'
        );
      }

      await client.query('UPDATE commandes_fournisseur SET statut = $1 WHERE id = $2', [statut, id]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete an order and its auto-created draft invoice. Blocked when the
   * linked invoice already has payments.
   */
  async delete(id: number, userId: number | null, req?: any): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: cmdRows } = await client.query(
        'SELECT id FROM commandes_fournisseur WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (cmdRows.length === 0) {
        throw businessError(404, 'Commande non trouvée');
      }

      const { rows: ffRows } = await client.query(
        'SELECT id, COALESCE(montant_paye, 0) AS montant_paye FROM factures_fournisseur WHERE commande_id = $1 FOR UPDATE',
        [id]
      );
      for (const ff of ffRows) {
        if (parseFloat(ff.montant_paye) > 0) {
          throw businessError(400, 'Impossible de supprimer: une facture fournisseur liée a des paiements.');
        }
      }
      for (const ff of ffRows) {
        await client.query('DELETE FROM facture_fournisseur_lignes WHERE facture_id = $1', [ff.id]);
        await client.query('DELETE FROM factures_fournisseur WHERE id = $1', [ff.id]);
      }

      await client.query('DELETE FROM commande_lignes WHERE commande_id = $1', [id]);
      await client.query('DELETE FROM commandes_fournisseur WHERE id = $1', [id]);

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: userId,
        action: 'delete',
        table_name: 'commandes_fournisseur',
        record_id: id,
        req,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const commandeService = new CommandeService();
