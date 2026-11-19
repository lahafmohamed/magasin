import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { businessError } from '../utils/errors';
import { nextInternalBarcode } from './NumberingService';

export interface CodeBarreAttribue {
  produit_id: number;
  nom: string;
  code_barre: string;
  /** `true` : code créé maintenant ; `false` : le produit en avait déjà un. */
  cree: boolean;
}

/** Tentatives par produit avant d'abandonner (codes saisis à la main dans la plage 20…). */
const MAX_TENTATIVES = 20;

/**
 * Lot 3 — attribue un EAN-13 interne (plage 20…, migration 110) aux produits
 * qui n'ont pas de code-barres, pour qu'ils passent à la douchette. Un produit
 * qui a déjà un code le garde : ce code est sur l'emballage, le remplacer
 * rendrait le produit inscannable.
 */
export class CodeBarreService {
  async genererCodesManquants(produitIds: number[], userId: number | null): Promise<CodeBarreAttribue[]> {
    const ids = [...new Set(produitIds)];
    if (ids.length === 0) throw businessError(422, 'Choisissez au moins un produit.');

    const client = await pool.connect();
    const crees: CodeBarreAttribue[] = [];
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id, nom, NULLIF(TRIM(code_barre), '') AS code_barre
         FROM produits
         WHERE id = ANY($1::int[]) AND deleted_at IS NULL
         ORDER BY id
         FOR UPDATE`,
        [ids]
      );
      if (rows.length !== ids.length) {
        throw businessError(404, 'Un des produits est introuvable : il a peut-être été supprimé. Rechargez la liste.');
      }

      const resultat: CodeBarreAttribue[] = [];
      for (const p of rows) {
        if (p.code_barre) {
          resultat.push({ produit_id: p.id, nom: p.nom, code_barre: p.code_barre, cree: false });
          continue;
        }
        let code: string | null = null;
        for (let i = 0; i < MAX_TENTATIVES && !code; i++) {
          const candidat = await nextInternalBarcode(client);
          const { rows: pris } = await client.query('SELECT 1 FROM produits WHERE code_barre = $1', [candidat]);
          if (pris.length === 0) code = candidat;
        }
        if (!code) {
          throw businessError(409, `Impossible de trouver un code-barres libre pour « ${p.nom} ». Réessayez.`);
        }
        await client.query('UPDATE produits SET code_barre = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
          code,
          p.id,
        ]);
        const attribue = { produit_id: p.id, nom: p.nom, code_barre: code, cree: true };
        resultat.push(attribue);
        crees.push(attribue);
      }

      await client.query('COMMIT');

      for (const c of crees) {
        await logAudit({
          utilisateur_id: userId,
          action: 'update',
          table_name: 'produits',
          record_id: c.produit_id,
          old_values: { code_barre: null },
          new_values: { code_barre: c.code_barre, origine: 'code-barres interne' },
        });
      }
      return resultat;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const codeBarreService = new CodeBarreService();
