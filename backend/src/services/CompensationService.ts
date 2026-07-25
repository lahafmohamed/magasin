import pool from '../db/connection';
import { checkPeriodIsOpen } from './PeriodService';
import { logger } from '../utils/logger';
import { ClientAllocationService } from './ClientAllocationService';
import { SupplierAllocationService } from './SupplierAllocationService';

export interface CreateCompensationInput {
  tiers_id: number;
  date_compensation: string;
  montant: number;
  factures_client_ids?: number[];
  factures_fournisseur_ids?: number[];
  notes?: string;
  cree_par?: number;
}

export class CompensationService {

  static async create(input: CreateCompensationInput): Promise<any> {
    await checkPeriodIsOpen(new Date(input.date_compensation));

    let compRows: any[] = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify tiers exists and has both roles
      const { rows: tiersRows } = await client.query(
        `SELECT id, raison_sociale, est_client, est_fournisseur,
           ROUND(calculer_solde_client(id)) as solde_client,
           ROUND(calculer_solde_fournisseur(id)) as solde_fourn
         FROM tiers WHERE id=$1 AND deleted_at IS NULL`,
        [input.tiers_id]
      );
      if (!tiersRows.length) throw new Error('Tiers introuvable');

      const tiers = tiersRows[0];
      if (!tiers.est_client || !tiers.est_fournisseur) {
        throw new Error('La compensation nécessite un tiers avec les deux rôles (client ET fournisseur)');
      }

      const soldeClient = parseFloat(tiers.solde_client);
      const soldeFourn = parseFloat(tiers.solde_fourn);

      if (soldeClient <= 0) throw new Error('Aucune créance client à compenser');
      if (soldeFourn <= 0) throw new Error('Aucune dette fournisseur à compenser');

      const maxComp = Math.min(soldeClient, soldeFourn);
      if (input.montant > maxComp) {
        throw new Error(`Montant de compensation (${input.montant}) supérieur au minimum compensable (${maxComp})`);
      }

      // Ensure the 401/411 accounts exist in the plan comptable (069 schema
      // references accounts by their numero, so no id lookup is needed).
      const getAccounts = await client.query(
        `SELECT numero FROM plan_comptable WHERE numero IN ('401','411')`
      );
      const numeros = new Set(getAccounts.rows.map((r: any) => r.numero));
      if (!numeros.has('401') || !numeros.has('411')) {
        throw new Error('Comptes comptables 401/411 introuvables dans le plan comptable');
      }

      const pieceNum = `COMP-${input.tiers_id}-${Date.now()}`;

      // OD entry: Débit 401 (reduces AP), Crédit 411 (reduces AR)
      const { rows: ecritureRows } = await client.query(
        `INSERT INTO ecritures_comptables
           (numero_piece, date_ecriture, journal, compte_numero, tiers_id, libelle, debit, credit, reference_type, reference_id)
         VALUES
           ($1, $2, 'OD', '401', $3, $4, $5, 0, 'compensation', NULL),
           ($1, $2, 'OD', '411', $3, $4, 0, $5, 'compensation', NULL)
         RETURNING id`,
        [pieceNum, input.date_compensation, input.tiers_id,
         `Compensation tiers ${tiers.raison_sociale}`, input.montant]
      );
      const ecritureId = ecritureRows[0]?.id || null;

      // Insert compensation record
      ({ rows: compRows } = await client.query(
        `INSERT INTO compensations (tiers_id, date_compensation, montant, factures_client_ids,
           factures_fournisseur_ids, ecriture_id, notes, cree_par)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          input.tiers_id,
          input.date_compensation,
          input.montant,
          input.factures_client_ids || [],
          input.factures_fournisseur_ids || [],
          ecritureId,
          input.notes || null,
          input.cree_par || null,
        ]
      ));

      // Create a client acompte so the FIFO engine can allocate it to invoices
      await client.query(
        `INSERT INTO acomptes_clients
           (tiers_id, montant, montant_restant, methode_paiement, notes, cree_par,
            date_acompte, idempotency_key, reference_number)
         VALUES ($1, $2, $2, 'compensation', $3, $4, $5, $6, $7) RETURNING id`,
        [input.tiers_id, input.montant,
         `Compensation ${pieceNum}`, input.cree_par || null, input.date_compensation,
         `compensation:${compRows[0].id}:client`, pieceNum]
      );

      // Mirror the same amount on the supplier side. Supplier balances are
      // computed from invoices/payments/acomptes (not from the display ledger),
      // so omitting this row left the supplier debt unchanged after netting.
      await client.query(
        `INSERT INTO acomptes_fournisseur
           (tiers_id, montant, montant_restant, methode_paiement, notes, cree_par,
            date_acompte, idempotency_key, reference_number)
         VALUES ($1, $2, $2, 'compensation', $3, $4, $5, $6, $7)`,
        [input.tiers_id, input.montant,
         `Compensation ${pieceNum}`, input.cree_par || null, input.date_compensation,
         `compensation:${compRows[0].id}:fournisseur`, pieceNum]
      );

      // Record in client ledger
      await client.query(
        `INSERT INTO compte_client_lignes
           (tiers_id, date_operation, type_operation, document_id, document_numero,
            montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, $2, 'compensation', $3, $4, 0, $5, $6, $7)`,
        [input.tiers_id, input.date_compensation, compRows[0].id, pieceNum,
         input.montant, `Compensation ${pieceNum}`, input.cree_par || null]
      );

      // Record in supplier ledger
      await client.query(
        `INSERT INTO compte_fournisseur_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'compensation', $2, $3, $4, 0, $5, $6)`,
        [input.tiers_id, compRows[0].id, pieceNum, input.montant,
         `Compensation ${pieceNum}`, input.cree_par || null]
      );

      await SupplierAllocationService.allocateAvailableAdvances(input.tiers_id, {
        transaction: client,
        userId: input.cree_par || null,
      });

      await client.query('COMMIT');
      logger.info({ tiersId: input.tiers_id, montant: input.montant }, 'Compensation created');

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Recompute FIFO allocation AFTER the transaction commits
    // so the new acompte is visible and no nested-transaction conflicts occur
    await ClientAllocationService.recomputeClientAllocations(input.tiers_id);
    return compRows[0];
  }

  static async getForTiers(tiersId: number): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT c.*, t.raison_sociale
       FROM compensations c
       JOIN tiers t ON t.id = c.tiers_id
       WHERE c.tiers_id = $1 AND c.statut = 'valide'
       ORDER BY c.date_compensation DESC, c.created_at DESC`,
      [tiersId]
    );
    return rows;
  }
}
