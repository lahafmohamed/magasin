import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { checkPeriodIsOpen } from './PeriodService';
import { businessError } from '../utils/errors';
import { roundMoney } from './PricingService';

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

  /**
   * Forecast over `jours` days starting today (day 0 … jours − 1), plus a
   * weekly schedule (`echeancier`) whose weeks sum exactly to the totals.
   *
   * Each item carries `jour` = days from today, computed by PostgreSQL. The
   * previous version compared pg DATE values (JS `Date`) with 'YYYY-MM-DD'
   * strings — always false — so every week summed to 0 and the chart was
   * empty (VB-TRE-00). Dates are anchored on the database's CURRENT_DATE so
   * the server's time zone cannot shift an item into the wrong week.
   */
  async getTresoreriePrevisionnelle(jours: number = 90): Promise<any> {
    // Clamped: `jours` comes straight from the query string.
    const horizon = Math.min(366, Math.max(1, Math.trunc(Number(jours) || 90)));

    const { rows: [{ today }] } = await pool.query(
      `SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today`
    );

    const { rows: encaissements } = await pool.query(
      `SELECT
         f.date_echeance as echeance,
         (f.date_echeance - CURRENT_DATE) AS jour,
         f.remaining_due as montant,
         f.numero_facture as reference,
         t.raison_sociale as tiers_nom
       FROM factures f
       LEFT JOIN tiers t ON f.tiers_id = t.id
       WHERE f.statut IN ('en_attente', 'partielle')
         AND f.deleted_at IS NULL
         AND f.date_echeance >= CURRENT_DATE
         AND f.date_echeance < CURRENT_DATE + $1::int
       ORDER BY f.date_echeance ASC`,
      [horizon]
    );

    const { rows: decaissements } = await pool.query(
      `SELECT
         c.date_livraison_prevue as echeance,
         (c.date_livraison_prevue - CURRENT_DATE) AS jour,
         c.sous_total as montant,
         c.numero_commande as reference,
         t.raison_sociale as tiers_nom
       FROM commandes_fournisseur c
       LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE c.statut NOT IN ('livree', 'annulee')
         AND c.deleted_at IS NULL
         AND c.date_livraison_prevue >= CURRENT_DATE
         AND c.date_livraison_prevue < CURRENT_DATE + $1::int
       ORDER BY c.date_livraison_prevue ASC`,
      [horizon]
    );

    const { rows: depenses } = await pool.query(
      `SELECT
         d.date_depense as echeance,
         (d.date_depense - CURRENT_DATE) AS jour,
         d.montant,
         d.numero_depense as reference,
         d.description
       FROM depenses d
       WHERE d.deleted_at IS NULL
         AND d.date_depense >= CURRENT_DATE
         AND d.date_depense < CURRENT_DATE + $1::int
       ORDER BY d.date_depense ASC`,
      [horizon]
    );

    // Aggregate per 7-day period (the last one may be shorter).
    const weeks = Math.ceil(horizon / 7);
    const enc = new Array<number>(weeks).fill(0);
    const dec = new Array<number>(weeks).fill(0);
    const weekOf = (row: any) => Math.min(weeks - 1, Math.floor(Number(row.jour) / 7));
    for (const e of encaissements) enc[weekOf(e)] += parseFloat(e.montant || 0);
    for (const e of decaissements) dec[weekOf(e)] += parseFloat(e.montant || 0);
    for (const e of depenses) dec[weekOf(e)] += parseFloat(e.montant || 0);

    const [y, m, d] = String(today).split('-').map(Number);
    const dayUtc = (offset: number) => new Date(Date.UTC(y, m - 1, d + offset));
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    const label = (date: Date) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

    const echeancier: {
      debut: string; fin: string; date_debut: string; date_fin: string;
      encaissements: number; decaissements: number; solde: number;
    }[] = [];
    for (let w = 0; w < weeks; w++) {
      const debut = dayUtc(w * 7);
      const fin = dayUtc(Math.min(w * 7 + 6, horizon - 1));
      const e = roundMoney(enc[w]);
      const s = roundMoney(dec[w]);
      echeancier.push({
        debut: label(debut),
        fin: label(fin),
        date_debut: iso(debut),
        date_fin: iso(fin),
        encaissements: e,
        decaissements: s,
        solde: roundMoney(e - s),
      });
    }

    const total = (rows: any[]) => rows.reduce((s: number, r: any) => s + parseFloat(r.montant || 0), 0);

    return {
      echeancier,
      encaissements,
      decaissements,
      depenses,
      total_encaissements: roundMoney(total(encaissements)),
      total_decaissements: roundMoney(total(decaissements) + total(depenses)),
    };
  }
}

export const comptabiliteService = new ComptabiliteService();
