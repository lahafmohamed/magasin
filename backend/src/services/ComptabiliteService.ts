import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { checkPeriodIsOpen } from './PeriodService';
import { businessError } from '../utils/errors';

interface PieceInput {
  journal: string;
  date_ecriture: string;
  libelle: string;
  lignes: { compte_numero: string; debit: number; credit: number; tiers_id?: number }[];
  reference_type?: string;
  reference_id?: number;
  cree_par?: number;
}

export class ComptabiliteService {
  // ========== ÉCRITURES ==========

  /**
   * Enregistre une pièce comptable (ensemble d'écritures équilibré)
   * Vérifie que total débit = total crédit avant insertion
   */
  async enregistrerPiece(input: PieceInput): Promise<{ id: number; numero_piece: string }> {
    // 'OD' (opérations diverses) — the only valid default under the ecritures_comptables
    // journal CHECK (ACHATS/VENTES/TRESORERIE/OD). Callers may override.
    const { journal = 'OD', date_ecriture, libelle, lignes, reference_type, reference_id, cree_par } = input;

    if (!lignes || lignes.length < 2) {
      throw businessError(422, 'Une pièce doit contenir au moins 2 lignes');
    }

    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw businessError(422, `Écriture non équilibrée: débit ${totalDebit} ≠ crédit ${totalCredit}`);
    }

    const { rows: seqRows } = await pool.query("SELECT nextval('piece_comptable_seq') as num");
    const numeroPiece = `PC-${new Date().getFullYear()}-${String(seqRows[0].num).padStart(5, '0')}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Refuse posting into a closed accounting period (nice 422 before the DB trigger fires).
      await checkPeriodIsOpen(new Date(date_ecriture), client);

      // Comptes inconnus : sans ce contrôle, l'INSERT viole
      // fk_ecritures_compte_numero et l'utilisateur reçoit un 500 opaque au lieu
      // du numéro de compte fautif. C'est la régression que couvrait l'ancien
      // /general-ledger/manual-entry, supprimé le 2026-09-07.
      const numeros = [...new Set(lignes.map((l) => l.compte_numero))];
      const { rows: connus } = await client.query(
        'SELECT numero FROM plan_comptable WHERE numero = ANY($1::varchar[])',
        [numeros]
      );
      const trouves = new Set(connus.map((r) => r.numero));
      const inconnus = numeros.filter((n) => !trouves.has(n));
      if (inconnus.length > 0) {
        throw businessError(404, `Compte introuvable au plan comptable : ${inconnus.join(', ')}`);
      }

      for (const ligne of lignes) {
        await client.query(
          `INSERT INTO ecritures_comptables
             (journal, numero_piece, date_ecriture, compte_numero, tiers_id, libelle, debit, credit,
              reference_type, reference_id, cree_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            journal, numeroPiece, date_ecriture, ligne.compte_numero,
            ligne.tiers_id || null, libelle, ligne.debit, ligne.credit,
            reference_type || null, reference_id || null, cree_par || null,
          ]
        );
      }

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: cree_par ?? null,
        action: 'create',
        table_name: 'ecritures_comptables',
        record_id: seqRows[0].num,
        new_values: { numero_piece: numeroPiece, journal, libelle, lignes: lignes.length },
      });

      return { id: seqRows[0].num, numero_piece: numeroPiece };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Grand-livre : toutes les écritures d'un compte sur une période
   */
  async getGrandLivre(compteNumero: string, dateDebut?: string, dateFin?: string): Promise<any[]> {
    let query = `SELECT e.*, pc.intitule as compte_intitule
                 FROM ecritures_comptables e
                 LEFT JOIN plan_comptable pc ON e.compte_numero = pc.numero
                 WHERE e.compte_numero = $1`;
    const params: any[] = [compteNumero];
    let paramIdx = 2;

    if (dateDebut) {
      query += ` AND e.date_ecriture >= $${paramIdx++}`;
      params.push(dateDebut);
    }
    if (dateFin) {
      query += ` AND e.date_ecriture <= $${paramIdx++}`;
      params.push(dateFin);
    }

    query += ' ORDER BY e.date_ecriture ASC, e.id ASC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  // NOTE: the former app-level auto-posting helpers (ecrituresFromFacture/
  // Paiement/Depense) were removed — they had zero callers and duplicated the
  // DB triggers that are the single source of journal entries (see migration 072).

  // ========== TRÉSORERIE PRÉVISIONNELLE ==========

  async getTresoreriePrevisionnelle(jours: number = 90): Promise<any> {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + jours);
    const endDateStr = endDate.toISOString().slice(0, 10);

    const { rows: encaissements } = await pool.query(
      `SELECT
         f.date_echeance as echeance,
         f.remaining_due as montant,
         f.numero_facture as reference,
         t.raison_sociale as tiers_nom
       FROM factures f
       LEFT JOIN tiers t ON f.tiers_id = t.id
       WHERE f.statut IN ('en_attente', 'partielle')
         AND f.deleted_at IS NULL
         AND f.date_echeance >= CURRENT_DATE
         AND f.date_echeance <= $1::DATE
       ORDER BY f.date_echeance ASC`,
      [endDateStr]
    );

    const { rows: decaissements } = await pool.query(
      `SELECT
         c.date_livraison_prevue as echeance,
         c.sous_total as montant,
         c.numero_commande as reference,
         t.raison_sociale as tiers_nom
       FROM commandes_fournisseur c
       LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE c.statut NOT IN ('livree', 'annulee')
         AND c.deleted_at IS NULL
         AND c.date_livraison_prevue >= CURRENT_DATE
         AND c.date_livraison_prevue <= $1::DATE
       ORDER BY c.date_livraison_prevue ASC`,
      [endDateStr]
    );

    const { rows: depenses } = await pool.query(
      `SELECT
         d.date_depense as echeance,
         d.montant,
         d.numero_depense as reference,
         d.description
       FROM depenses d
       WHERE d.deleted_at IS NULL
         AND d.date_depense >= CURRENT_DATE
         AND d.date_depense <= $1::DATE
       ORDER BY d.date_depense ASC`,
      [endDateStr]
    );

    // Aggrégation par période (7 jours)
    const echeancier: { debut: string; fin: string; encaissements: number; decaissements: number; solde: number }[] = [];
    const maintenant = new Date();

    for (let i = 0; i < jours; i += 7) {
      const debut = new Date(maintenant.getTime() + i * 86400000);
      const fin = new Date(maintenant.getTime() + Math.min(i + 6, jours - 1) * 86400000);
      const d = debut.toISOString().slice(0, 10);
      const f = fin.toISOString().slice(0, 10);

      const enc = encaissements
        .filter((e: any) => e.echeance >= d && e.echeance <= f)
        .reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0);

      const dec = decaissements
        .filter((e: any) => e.echeance >= d && e.echeance <= f)
        .reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0)
        + depenses
          .filter((e: any) => e.echeance >= d && e.echeance <= f)
          .reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0);

      echeancier.push({
        debut: debut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        fin: fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        encaissements: enc,
        decaissements: dec,
        solde: enc - dec,
      });
    }

    return {
      echeancier,
      encaissements,
      decaissements,
      depenses,
      total_encaissements: encaissements.reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0),
      total_decaissements: decaissements.reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0)
        + depenses.reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0),
    };
  }
}

export const comptabiliteService = new ComptabiliteService();
