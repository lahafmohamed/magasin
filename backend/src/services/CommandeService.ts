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

/**
 * Commande fournisseur transaction orchestration: order + auto-created draft
 * facture fournisseur are written together and kept in sync while the invoice
 * is still 'en_attente'. Business rules throw businessError (4xx).
 */
export class CommandeService {

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
