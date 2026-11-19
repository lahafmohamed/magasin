import type { Request } from 'express';
import type { PoolClient } from 'pg';
import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';
import { businessError } from '../utils/errors';
import { applyStockMovement } from './StockCostingService';
import { generateDocumentNumber } from './NumberingService';

/**
 * Inventaire physique (migration 111).
 *
 * Une session de comptage par emplacement : la feuille est créée avec les
 * produits que le système croit en stock, on compte (saisie ou scan), puis la
 * validation passe tous les écarts en mouvements « ajustement » dans UNE
 * transaction, par la même primitive que les ajustements manuels
 * (`applyStockMovement` : verrou de la ligne de stock, CMP pondéré à l'entrée,
 * mouvement d'historique).
 *
 * Écart = quantité comptée − stock du système AU MOMENT DU COMPTAGE de la
 * ligne. Il est appliqué en delta au stock courant : une vente passée entre le
 * comptage et la validation n'est ni perdue ni comptée deux fois.
 *
 * Comme un ajustement manuel, la validation ne passe aucune écriture
 * comptable : la valeur de l'écart est restituée, pas comptabilisée.
 *
 * Qui voit quoi :
 *  - gérant / admin : tout, y compris la valeur des écarts ;
 *  - compteurs (dépôt, magasin) : jamais de coût ni de valeur ; pendant un
 *    comptage « à l'aveugle », ni le stock théorique ni l'écart — on compte ce
 *    qu'on voit, pas ce que l'écran annonce.
 */

export type InventaireStatut = 'en_cours' | 'valide' | 'annule';
export type FiltreLignes = 'tous' | 'a_compter' | 'comptes' | 'ecarts';

const MANAGER_ROLES = new Set(['admin', 'manager']);

/** Le rôle voit-il coûts et valeurs d'écart ? */
export function voitValeurs(role?: string | null): boolean {
  return MANAGER_ROLES.has(role ?? '');
}

/** Le rôle voit-il le stock théorique et les écarts de cet inventaire ? */
export function voitEcarts(role: string | null | undefined, comptageAveugle: boolean, statut: InventaireStatut): boolean {
  if (voitValeurs(role)) return true;
  // Une fois l'inventaire clôturé, il n'y a plus rien à influencer.
  return !comptageAveugle || statut !== 'en_cours';
}

/**
 * Stock du système d'un produit `p` à l'emplacement donné. Même repli que
 * `applyStockMovement` : un produit sans aucune ligne `stock_par_location` est
 * un produit « legacy » dont le stock vit dans `produits.stock`.
 */
const stockCourantSql = (locationParam: string) => `
  COALESCE(
    (SELECT spl.quantite FROM stock_par_location spl
      WHERE spl.produit_id = p.id AND spl.location_id = ${locationParam}),
    CASE WHEN EXISTS (SELECT 1 FROM stock_par_location x WHERE x.produit_id = p.id)
         THEN 0 ELSE p.stock END,
    0
  )`;

/** Coût unitaire retenu pour valoriser l'écart : CMP de l'emplacement, sinon prix d'achat. */
const coutUnitaireSql = (locationParam: string) => `
  COALESCE(
    (SELECT NULLIF(spl.cmp, 0) FROM stock_par_location spl
      WHERE spl.produit_id = p.id AND spl.location_id = ${locationParam}),
    p.prix_achat,
    0
  )`;

const AGREGATS_SQL = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS nb_lignes,
           COUNT(l.quantite_comptee)::int AS nb_comptees,
           (COUNT(*) FILTER (
              WHERE l.quantite_comptee IS NOT NULL AND l.quantite_comptee <> l.quantite_theorique
            ))::int AS nb_ecarts,
           COALESCE(SUM(GREATEST(l.quantite_comptee - l.quantite_theorique, 0)), 0)::int AS unites_en_plus,
           COALESCE(SUM(GREATEST(l.quantite_theorique - l.quantite_comptee, 0)), 0)::int AS unites_en_moins,
           COALESCE(SUM((l.quantite_comptee - l.quantite_theorique) * l.cmp), 0)::numeric(15,2) AS valeur_ecart
    FROM inventaire_lignes l
    WHERE l.inventaire_id = i.id
  ) agg ON true`;

const ENTETE_SQL = `
  SELECT i.id, i.numero, i.location_id, sl.nom AS location_nom, sl.location_type,
         i.statut, i.categorie, i.comptage_aveugle, i.notes,
         i.created_at, i.date_validation,
         COALESCE(uc.nom_complet, uc.username) AS cree_par_nom,
         COALESCE(uv.nom_complet, uv.username) AS valide_par_nom,
         agg.nb_lignes, agg.nb_comptees, agg.nb_ecarts,
         agg.unites_en_plus, agg.unites_en_moins, agg.valeur_ecart
  FROM inventaires i
  JOIN stock_locations sl ON sl.id = i.location_id
  LEFT JOIN utilisateurs uc ON uc.id = i.cree_par
  LEFT JOIN utilisateurs uv ON uv.id = i.valide_par
  ${AGREGATS_SQL}`;

const CLES_ECART = ['nb_ecarts', 'unites_en_plus', 'unites_en_moins', 'quantite_theorique', 'ecart', 'ecart_applique'] as const;
const CLES_VALEUR = ['valeur_ecart', 'cmp'] as const;

/** Retire d'une ligne ou d'un en-tête ce que le rôle ne doit pas voir. */
function pourRole<T extends Record<string, any>>(
  row: T,
  role: string | null | undefined,
  comptageAveugle: boolean,
  statut: InventaireStatut
): T {
  const out: Record<string, any> = { ...row };
  if (!voitValeurs(role)) for (const k of CLES_VALEUR) delete out[k];
  if (!voitEcarts(role, comptageAveugle, statut)) for (const k of CLES_ECART) delete out[k];
  return out as T;
}

function numerique<T extends Record<string, any>>(row: T): T {
  if (row && row.valeur_ecart !== undefined && row.valeur_ecart !== null) {
    (row as any).valeur_ecart = Number(row.valeur_ecart);
  }
  if (row && row.cmp !== undefined && row.cmp !== null) (row as any).cmp = Number(row.cmp);
  return row;
}

export interface CreateInventaireInput {
  location_id: number;
  categorie?: string | null;
  comptage_aveugle?: boolean;
  notes?: string | null;
  cree_par?: number;
  req?: Request;
}

export interface CompterInput {
  produit_id?: number;
  /** Code-barres ou référence, tel que scanné ou saisi. */
  code?: string;
  quantite: number;
  /** `fixer` remplace la quantité comptée ; `ajouter` l'incrémente (scan unité par unité). */
  mode: 'fixer' | 'ajouter';
}

export interface ValidationResult {
  id: number;
  numero: string;
  lignes_ajustees: number;
  unites_en_plus: number;
  unites_en_moins: number;
  valeur_ecart: number;
}

const INTROUVABLE = 'Inventaire introuvable.';
const CLOTURE = 'Cet inventaire est clôturé : il n’accepte plus de modification.';

export class InventaireService {
  /** Liste paginée, la plus récente d'abord. */
  async getAll(
    options: { search?: string; statut?: string; location_id?: number; page?: number; limit?: number },
    role?: string | null
  ): Promise<{ data: any[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));

    let where = ' WHERE 1=1';
    const params: any[] = [];

    if (options.statut) {
      params.push(options.statut);
      where += ` AND i.statut = $${params.length}`;
    }
    if (options.location_id) {
      params.push(options.location_id);
      where += ` AND i.location_id = $${params.length}`;
    }
    for (const word of (options.search ?? '').trim().split(/\s+/).filter(Boolean)) {
      params.push(`%${word}%`);
      const p = `$${params.length}`;
      where += ` AND (i.numero ILIKE ${p} OR sl.nom ILIKE ${p} OR COALESCE(sl.code, '') ILIKE ${p}
                  OR COALESCE(i.categorie, '') ILIKE ${p})`;
    }

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `${ENTETE_SQL} ${where}
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM inventaires i JOIN stock_locations sl ON sl.id = i.location_id ${where}`,
        params
      ),
    ]);

    return {
      data: rows.map((r) => pourRole(numerique(r), role, r.comptage_aveugle, r.statut)),
      total: countRows[0].total,
    };
  }

  /** En-tête et synthèse d'un inventaire (sans ses lignes — voir getLignes). */
  async getById(id: number, role?: string | null): Promise<any | null> {
    const { rows } = await pool.query(`${ENTETE_SQL} WHERE i.id = $1`, [id]);
    if (!rows[0]) return null;
    const row = numerique(rows[0]);
    return {
      ...pourRole(row, role, row.comptage_aveugle, row.statut),
      voit_ecarts: voitEcarts(role, row.comptage_aveugle, row.statut),
      voit_valeurs: voitValeurs(role),
    };
  }

  /** Lignes paginées côté serveur : une feuille peut porter plusieurs milliers de produits. */
  async getLignes(
    id: number,
    options: { search?: string; filtre?: FiltreLignes; page?: number; limit?: number },
    role?: string | null
  ): Promise<{ data: any[]; total: number } | null> {
    const { rows: invRows } = await pool.query(
      'SELECT statut, comptage_aveugle FROM inventaires WHERE id = $1',
      [id]
    );
    if (!invRows[0]) return null;
    const { statut, comptage_aveugle } = invRows[0];
    const ecartsVisibles = voitEcarts(role, comptage_aveugle, statut);

    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const filtre: FiltreLignes = options.filtre ?? 'tous';

    if (filtre === 'ecarts' && !ecartsVisibles) {
      throw businessError(403, 'Pendant un comptage à l’aveugle, les écarts sont réservés au gérant.');
    }

    let where = ' WHERE l.inventaire_id = $1';
    const params: any[] = [id];

    if (filtre === 'a_compter') where += ' AND l.quantite_comptee IS NULL';
    if (filtre === 'comptes') where += ' AND l.quantite_comptee IS NOT NULL';
    if (filtre === 'ecarts') {
      where += ' AND l.quantite_comptee IS NOT NULL AND l.quantite_comptee <> l.quantite_theorique';
    }
    for (const word of (options.search ?? '').trim().split(/\s+/).filter(Boolean)) {
      params.push(`%${word}%`);
      const p = `$${params.length}`;
      where += ` AND (p.nom ILIKE ${p} OR p.reference ILIKE ${p} OR COALESCE(p.code_barre, '') ILIKE ${p})`;
    }

    // Les écarts : les plus gros d'abord. Sinon l'ordre de la feuille (nom).
    const orderBy =
      filtre === 'ecarts'
        ? 'ABS(l.quantite_comptee - l.quantite_theorique) DESC, p.nom ASC, l.id ASC'
        : 'p.nom ASC, l.id ASC';

    const from = `FROM inventaire_lignes l
                  JOIN produits p ON p.id = l.produit_id
                  LEFT JOIN utilisateurs u ON u.id = l.compte_par`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT l.id, l.produit_id, p.nom AS produit_nom, p.reference, p.code_barre, p.categorie,
                l.quantite_theorique, l.quantite_comptee,
                (l.quantite_comptee - l.quantite_theorique) AS ecart,
                l.cmp,
                ((l.quantite_comptee - l.quantite_theorique) * l.cmp)::numeric(15,2) AS valeur_ecart,
                l.ecart_applique, l.compte_le,
                COALESCE(u.nom_complet, u.username) AS compte_par_nom
         ${from} ${where}
         ORDER BY ${orderBy}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit]
      ),
      pool.query(`SELECT COUNT(*)::int AS total ${from} ${where}`, params),
    ]);

    return {
      data: rows.map((r) => pourRole(numerique(r), role, comptage_aveugle, statut)),
      total: countRows[0].total,
    };
  }

  /**
   * Ouvre un inventaire : la feuille reçoit chaque produit que le système
   * croit en stock à cet emplacement (dans la catégorie, si elle est donnée).
   * Un produit trouvé en rayon mais absent de la feuille s'y ajoute au
   * comptage.
   */
  async create(input: CreateInventaireInput): Promise<{ id: number; numero: string; nb_lignes: number }> {
    const categorie = input.categorie?.trim() || null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: locRows } = await client.query(
        'SELECT id, nom FROM stock_locations WHERE id = $1 AND actif = true',
        [input.location_id]
      );
      if (!locRows[0]) {
        throw businessError(422, 'Cet emplacement n’existe pas ou n’est plus actif.');
      }

      const { rows: ouverts } = await client.query(
        `SELECT numero FROM inventaires WHERE location_id = $1 AND statut = 'en_cours'`,
        [input.location_id]
      );
      if (ouverts[0]) {
        throw businessError(
          409,
          `Un inventaire est déjà en cours à ${locRows[0].nom} (${ouverts[0].numero}) : validez-le ou annulez-le d’abord.`,
          'INVENTAIRE_EN_COURS'
        );
      }

      const numero = await generateDocumentNumber('inventaire', client);

      const { rows: invRows } = await client.query(
        `INSERT INTO inventaires (numero, location_id, categorie, comptage_aveugle, notes, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          numero,
          input.location_id,
          categorie,
          input.comptage_aveugle ?? true,
          input.notes?.trim() || null,
          input.cree_par ?? null,
        ]
      );
      const id = Number(invRows[0].id);

      const { rowCount } = await client.query(
        `INSERT INTO inventaire_lignes (inventaire_id, produit_id, quantite_theorique, cmp)
         SELECT $1, p.id, spl.quantite, COALESCE(NULLIF(spl.cmp, 0), p.prix_achat, 0)
         FROM stock_par_location spl
         JOIN produits p ON p.id = spl.produit_id
         WHERE spl.location_id = $2
           AND spl.quantite > 0
           AND p.deleted_at IS NULL
           AND ($3::text IS NULL OR p.categorie = $3::text)`,
        [id, input.location_id, categorie]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: input.cree_par,
        action: 'create',
        table_name: 'inventaires',
        record_id: id,
        req: input.req,
        new_values: { numero, location_id: input.location_id, categorie, nb_lignes: rowCount ?? 0 },
      });
      logger.info({ inventaireId: id, numero }, 'Inventaire ouvert');

      return { id, numero, nb_lignes: rowCount ?? 0 };
    } catch (error: any) {
      await client.query('ROLLBACK');
      // Deux ouvertures simultanées : l'index unique partiel tranche.
      if (error?.code === '23505' && error?.constraint === 'uq_inventaires_en_cours_par_emplacement') {
        throw businessError(409, 'Un inventaire est déjà en cours à cet emplacement.', 'INVENTAIRE_EN_COURS');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Verrouille l'inventaire et vérifie qu'il est encore ouvert. */
  private async ouvertOuErreur(
    client: PoolClient,
    id: number,
    lock: 'FOR SHARE' | 'FOR UPDATE'
  ): Promise<{ id: number; numero: string; location_id: number; comptage_aveugle: boolean; statut: InventaireStatut }> {
    const { rows } = await client.query(
      `SELECT id, numero, location_id, comptage_aveugle, statut FROM inventaires WHERE id = $1 ${lock}`,
      [id]
    );
    if (!rows[0]) throw businessError(404, INTROUVABLE);
    if (rows[0].statut !== 'en_cours') throw businessError(409, CLOTURE, 'INVENTAIRE_CLOTURE');
    return rows[0];
  }

  /**
   * Enregistre un comptage. Le produit est désigné par son id (saisie dans la
   * feuille) ou par un code scanné (code-barres exact, sinon référence). Un
   * produit absent de la feuille y est ajouté.
   *
   * Plusieurs compteurs peuvent travailler en même temps (verrou partagé sur
   * l'inventaire, l'upsert sérialise les scans d'un même produit) ; la
   * validation, elle, attend la fin des comptages en cours.
   */
  async compter(id: number, input: CompterInput, userId?: number, role?: string | null): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inv = await this.ouvertOuErreur(client, id, 'FOR SHARE');

      let produit: { id: number; nom: string; reference: string; code_barre: string | null } | undefined;
      if (input.produit_id) {
        const { rows } = await client.query(
          'SELECT id, nom, reference, code_barre FROM produits WHERE id = $1 AND deleted_at IS NULL',
          [input.produit_id]
        );
        produit = rows[0];
        if (!produit) throw businessError(422, 'Ce produit n’existe plus.');
      } else {
        const code = (input.code ?? '').trim();
        const { rows } = await client.query(
          `SELECT id, nom, reference, code_barre FROM produits
           WHERE deleted_at IS NULL AND (code_barre = $1 OR UPPER(reference) = UPPER($1))
           ORDER BY (code_barre = $1) DESC, id ASC
           LIMIT 1`,
          [code]
        );
        produit = rows[0];
        if (!produit) {
          // 422 et non 404 : l'inventaire existe, c'est le code saisi qui ne correspond à rien
          // (le client remplace tout 404 par un message générique).
          throw businessError(422, `Aucun produit ne porte le code « ${code} ».`, 'PRODUIT_INCONNU');
        }
      }

      const { rows: stockRows } = await client.query(
        `SELECT ${stockCourantSql('$2')} AS stock, ${coutUnitaireSql('$2')} AS cout
         FROM produits p WHERE p.id = $1`,
        [produit.id, inv.location_id]
      );
      const stock = Number(stockRows[0].stock);
      const cout = Number(stockRows[0].cout);

      const { rows: avant } = await client.query(
        'SELECT 1 FROM inventaire_lignes WHERE inventaire_id = $1 AND produit_id = $2',
        [id, produit.id]
      );

      const { rows: ligneRows } = await client.query(
        `INSERT INTO inventaire_lignes
           (inventaire_id, produit_id, quantite_theorique, quantite_comptee, cmp, compte_par, compte_le)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (inventaire_id, produit_id) DO UPDATE SET
           quantite_theorique = EXCLUDED.quantite_theorique,
           quantite_comptee = CASE WHEN $7::boolean
             THEN COALESCE(inventaire_lignes.quantite_comptee, 0) + EXCLUDED.quantite_comptee
             ELSE EXCLUDED.quantite_comptee END,
           cmp = EXCLUDED.cmp,
           compte_par = EXCLUDED.compte_par,
           compte_le = CURRENT_TIMESTAMP
         RETURNING id, produit_id, quantite_theorique, quantite_comptee,
                   (quantite_comptee - quantite_theorique) AS ecart, cmp, compte_le`,
        [id, produit.id, stock, input.quantite, cout, userId ?? null, input.mode === 'ajouter']
      );

      await client.query('COMMIT');

      const ligne = {
        ...numerique(ligneRows[0]),
        produit_nom: produit.nom,
        reference: produit.reference,
        code_barre: produit.code_barre,
        ajoutee_a_la_feuille: avant.length === 0,
      };
      return pourRole(ligne, role, inv.comptage_aveugle, inv.statut);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Efface le comptage d'une ligne : elle redevient « à compter ». */
  async effacerComptage(id: number, ligneId: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.ouvertOuErreur(client, id, 'FOR SHARE');
      const { rowCount } = await client.query(
        `UPDATE inventaire_lignes
         SET quantite_comptee = NULL, compte_par = NULL, compte_le = NULL
         WHERE id = $1 AND inventaire_id = $2`,
        [ligneId, id]
      );
      if ((rowCount ?? 0) === 0) throw businessError(404, 'Cette ligne n’appartient pas à cet inventaire.');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Valide l'inventaire : chaque écart devient un mouvement « ajustement »,
   * tous dans la même transaction — un échec n'en laisse aucun.
   *
   * `non_comptes` :
   *  - `ignorer` (défaut) : une ligne jamais comptée garde son stock ;
   *  - `zero` : une ligne jamais comptée est tenue pour absente — son stock
   *    courant est sorti. À réserver à un inventaire complet réellement terminé.
   */
  async valider(
    id: number,
    options: { non_comptes?: 'ignorer' | 'zero' },
    userId?: number,
    req?: Request
  ): Promise<ValidationResult> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inv = await this.ouvertOuErreur(client, id, 'FOR UPDATE');

      if (options.non_comptes === 'zero') {
        await client.query(
          `UPDATE inventaire_lignes l
           SET quantite_comptee = 0,
               quantite_theorique = ${stockCourantSql('$2')},
               compte_par = $3,
               compte_le = CURRENT_TIMESTAMP
           FROM produits p
           WHERE p.id = l.produit_id AND l.inventaire_id = $1 AND l.quantite_comptee IS NULL`,
          [id, inv.location_id, userId ?? null]
        );
      }

      const { rows: compteRows } = await client.query(
        'SELECT COUNT(quantite_comptee)::int AS n FROM inventaire_lignes WHERE inventaire_id = $1',
        [id]
      );
      if (compteRows[0].n === 0) {
        throw businessError(422, 'Aucun produit n’a été compté : il n’y a rien à valider.', 'INVENTAIRE_VIDE');
      }

      // Ordre stable par produit : deux validations sur des emplacements
      // différents ne peuvent pas se verrouiller en croix.
      const { rows: lignes } = await client.query(
        `SELECT l.id, l.produit_id, p.nom AS produit_nom, l.cmp,
                (l.quantite_comptee - l.quantite_theorique) AS ecart
         FROM inventaire_lignes l
         JOIN produits p ON p.id = l.produit_id
         WHERE l.inventaire_id = $1
           AND l.quantite_comptee IS NOT NULL
           AND l.quantite_comptee <> l.quantite_theorique
         ORDER BY l.produit_id`,
        [id]
      );

      let unitesEnPlus = 0;
      let unitesEnMoins = 0;

      for (const ligne of lignes) {
        const ecart = Number(ligne.ecart);
        const cmp = Number(ligne.cmp);
        let mouvement;
        try {
          mouvement = await applyStockMovement(client, {
            produitId: ligne.produit_id,
            locationId: inv.location_id,
            delta: ecart,
            unitCost: cmp > 0 ? cmp : null,
            type: 'ajustement',
            raison: `Inventaire ${inv.numero}`,
            reference: inv.numero,
          });
        } catch (error: any) {
          if (error?.code === 'STOCK_INSUFFISANT') {
            // Le stock a baissé après le comptage au point que l'écart ne
            // « rentre » plus : le comptage de ce produit n'est plus fiable.
            throw businessError(
              409,
              `Le stock de « ${ligne.produit_nom} » a changé depuis son comptage : recomptez ce produit avant de valider.`,
              'RECOMPTAGE_REQUIS'
            );
          }
          throw error;
        }

        await client.query(
          'UPDATE inventaire_lignes SET ecart_applique = $1, mouvement_id = $2 WHERE id = $3',
          [ecart, mouvement.mouvementId, ligne.id]
        );
        if (ecart > 0) unitesEnPlus += ecart;
        else unitesEnMoins += -ecart;
      }

      const { rows: valeurRows } = await client.query(
        `SELECT COALESCE(SUM(ecart_applique * cmp), 0)::numeric(15,2) AS valeur
         FROM inventaire_lignes WHERE inventaire_id = $1 AND ecart_applique IS NOT NULL`,
        [id]
      );

      await client.query(
        `UPDATE inventaires
         SET statut = 'valide', valide_par = $2, date_validation = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, userId ?? null]
      );

      await client.query('COMMIT');

      const result: ValidationResult = {
        id,
        numero: inv.numero,
        lignes_ajustees: lignes.length,
        unites_en_plus: unitesEnPlus,
        unites_en_moins: unitesEnMoins,
        valeur_ecart: Number(valeurRows[0].valeur),
      };

      await logAudit({
        utilisateur_id: userId,
        action: 'validate',
        table_name: 'inventaires',
        record_id: id,
        req,
        new_values: { ...result, non_comptes: options.non_comptes ?? 'ignorer' },
      });
      logger.info({ inventaireId: id, lignes: lignes.length }, 'Inventaire validé');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Annule un inventaire en cours. Aucun stock n'a bougé : simple changement d'état. */
  async annuler(id: number, userId?: number, req?: Request): Promise<void> {
    const { rows } = await pool.query(
      `UPDATE inventaires SET statut = 'annule' WHERE id = $1 AND statut = 'en_cours' RETURNING id`,
      [id]
    );
    if (!rows[0]) {
      const { rows: existe } = await pool.query('SELECT 1 FROM inventaires WHERE id = $1', [id]);
      throw existe[0] ? businessError(409, CLOTURE, 'INVENTAIRE_CLOTURE') : businessError(404, INTROUVABLE);
    }
    await logAudit({
      utilisateur_id: userId,
      action: 'cancel',
      table_name: 'inventaires',
      record_id: id,
      req,
    });
    logger.info({ inventaireId: id }, 'Inventaire annulé');
  }
}

export const inventaireService = new InventaireService();
