import pool from '../db/connection';
import { BaseService, PaginatedResult, PaginationParams } from './BaseService';

export interface TiersRecord {
  id: number;
  code: string;
  raison_sociale: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  nif: string | null;
  rccm: string | null;
  est_client: boolean;
  est_fournisseur: boolean;
  credit_max: number;
  delai_paiement: string | null;
  delai_livraison: number;
  notes: string | null;
  solde_client_actuel: number;
  acompte_client_disponible: number;
  solde_fournisseur_actuel: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTiersInput {
  raison_sociale: string;
  prenom?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  nif?: string;
  rccm?: string;
  est_client: boolean;
  est_fournisseur: boolean;
  credit_max?: number;
  delai_paiement?: string;
  delai_livraison?: number;
  notes?: string;
}

export interface UpdateTiersInput extends Partial<CreateTiersInput> {
  est_client?: boolean;
  est_fournisseur?: boolean;
}

export class TiersService extends BaseService<TiersRecord> {
  protected tableName = 'tiers';
  protected selectColumns = `id, code, raison_sociale, prenom, telephone, email, adresse,
    nif, rccm, est_client, est_fournisseur, credit_max, delai_paiement, delai_livraison,
    notes, solde_client_actuel, acompte_client_disponible, solde_fournisseur_actuel,
    deleted_at, created_at, updated_at`;
  protected defaultSortColumn = 'raison_sociale';
  protected allowedSortColumns = ['raison_sociale', 'code', 'created_at', 'solde_client_actuel', 'solde_fournisseur_actuel'];

  async getAll(options: {
    search?: string;
    role?: 'client' | 'fournisseur' | 'mixte' | 'all';
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'ASC' | 'DESC';
    statut_solde?: 'debiteur' | 'crediteur' | 'solde';
  } = {}): Promise<PaginatedResult<TiersRecord>> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;
    const sort = this.allowedSortColumns.includes(options.sort || '') ? options.sort! : 'raison_sociale';
    const order = options.order === 'DESC' ? 'DESC' : 'ASC';

    const params: any[] = [];
    const conditions: string[] = ['t.deleted_at IS NULL'];

    if (options.search) {
      params.push(`%${options.search}%`);
      conditions.push(`(t.raison_sociale ILIKE $${params.length} OR t.telephone ILIKE $${params.length} OR t.email ILIKE $${params.length} OR t.code ILIKE $${params.length} OR t.nif ILIKE $${params.length})`);
    }

    if (options.role === 'client') conditions.push('t.est_client = true');
    else if (options.role === 'fournisseur') conditions.push('t.est_fournisseur = true');
    else if (options.role === 'mixte') conditions.push('t.est_client = true AND t.est_fournisseur = true');

    const where = conditions.join(' AND ');

    const dataQuery = `
      SELECT t.*,
        ROUND(calculer_solde_client(t.id)) as solde_client_live,
        ROUND(calculer_solde_fournisseur(t.id)) as solde_fournisseur_live,
        ROUND(calculer_solde_net(t.id)) as solde_net
      FROM tiers t
      WHERE ${where}
      ORDER BY t.${sort} ${order}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countQuery = `SELECT COUNT(*) as total FROM tiers t WHERE ${where}`;

    const [data, count] = await Promise.all([
      pool.query(dataQuery, [...params, limit, offset]),
      pool.query(countQuery, params),
    ]);

    return {
      data: data.rows,
      pagination: {
        page,
        limit,
        total: parseInt(count.rows[0].total),
        totalPages: Math.ceil(parseInt(count.rows[0].total) / limit),
      },
    };
  }

  async getById(id: number): Promise<TiersRecord & { solde_client_live: number; solde_fournisseur_live: number; solde_net: number } | null> {
    const { rows } = await pool.query(
      `SELECT t.*,
        ROUND(calculer_solde_client(t.id)) as solde_client_live,
        ROUND(calculer_solde_fournisseur(t.id)) as solde_fournisseur_live,
        ROUND(calculer_solde_net(t.id)) as solde_net
       FROM tiers t
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  }

  async create(input: CreateTiersInput): Promise<TiersRecord> {
    if (!input.est_client && !input.est_fournisseur) {
      throw new Error('Un tiers doit avoir au moins un rôle (client ou fournisseur)');
    }
    const { rows } = await pool.query(
      `INSERT INTO tiers (raison_sociale, prenom, telephone, email, adresse, nif, rccm,
         est_client, est_fournisseur, credit_max, delai_paiement, delai_livraison, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        input.raison_sociale,
        input.prenom || null,
        input.telephone || null,
        input.email || null,
        input.adresse || null,
        input.nif || null,
        input.rccm || null,
        input.est_client,
        input.est_fournisseur,
        input.credit_max || 0,
        input.delai_paiement || null,
        input.delai_livraison || 7,
        input.notes || null,
      ]
    );
    return rows[0];
  }

  async update(id: number, input: UpdateTiersInput): Promise<TiersRecord | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;

    const set = (col: string, val: any) => { fields.push(`${col} = $${i++}`); params.push(val); };

    if (input.raison_sociale !== undefined) set('raison_sociale', input.raison_sociale);
    if (input.prenom !== undefined)         set('prenom', input.prenom || null);
    if (input.telephone !== undefined)      set('telephone', input.telephone || null);
    if (input.email !== undefined)          set('email', input.email || null);
    if (input.adresse !== undefined)        set('adresse', input.adresse || null);
    if (input.nif !== undefined)            set('nif', input.nif || null);
    if (input.rccm !== undefined)           set('rccm', input.rccm || null);
    if (input.est_client !== undefined)     set('est_client', input.est_client);
    if (input.est_fournisseur !== undefined) set('est_fournisseur', input.est_fournisseur);
    if (input.credit_max !== undefined)     set('credit_max', input.credit_max);
    if (input.delai_paiement !== undefined) set('delai_paiement', input.delai_paiement || null);
    if (input.delai_livraison !== undefined) set('delai_livraison', input.delai_livraison);
    if (input.notes !== undefined)          set('notes', input.notes || null);

    if (fields.length === 0) throw new Error('Aucun champ à mettre à jour');
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE tiers SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  async getCompte(tiersId: number, options: { from?: string; to?: string } = {}): Promise<any> {
    const tiers = await this.getById(tiersId);
    if (!tiers) return null;

    const totauxClientQ = `
      WITH
        f  AS (SELECT COALESCE(SUM(total),0) as v FROM factures WHERE tiers_id=$1 AND statut!='annulee' AND deleted_at IS NULL),
        fa AS (SELECT COALESCE(SUM(total),0) as v FROM factures_avoir WHERE tiers_id=$1 AND statut = 'valide' AND deleted_at IS NULL),
        ac AS (SELECT COALESCE(SUM(montant),0) as v FROM acomptes_clients WHERE tiers_id=$1 AND statut IN ('disponible','utilise')),
        p  AS (SELECT COALESCE(SUM(p.montant),0) as v FROM paiements p JOIN factures f2 ON f2.id=p.facture_id WHERE f2.tiers_id=$1 AND f2.deleted_at IS NULL)
      SELECT f.v as total_facture, p.v as total_paye, fa.v as total_avoir, ac.v as total_acompte,
        ROUND(f.v - p.v - fa.v - ac.v) as solde_client
      FROM f,p,fa,ac`;

    const totauxFournQ = `
      WITH
        ff AS (SELECT COALESCE(SUM(total),0) as v FROM factures_fournisseur WHERE tiers_id=$1 AND statut!='annulee'),
        pf AS (SELECT COALESCE(SUM(pf.montant),0) as v FROM paiements_fournisseur pf JOIN factures_fournisseur ff2 ON ff2.id=pf.facture_id WHERE ff2.tiers_id=$1),
        af AS (SELECT COALESCE(SUM(montant),0) as v FROM acomptes_fournisseur WHERE tiers_id=$1 AND statut IN ('disponible','utilise'))
      SELECT ff.v as total_facture_fourn, pf.v as total_paye_fourn, af.v as total_acompte_fourn,
        ROUND(ff.v - pf.v - af.v) as solde_fournisseur
      FROM ff,pf,af`;

    const mouvementsQ = `
      WITH mouvements AS (
        SELECT date_facture::timestamp as date, 'facture_client' as type, numero_facture as ref,
          'Facture ' || numero_facture as libelle, total as debit, 0 as credit, id, 1 as ordre
        FROM factures WHERE tiers_id=$1 AND statut!='annulee' AND deleted_at IS NULL

        UNION ALL
        SELECT p.date_paiement::timestamp, 'paiement_client', COALESCE(p.reference,'PAY-'||p.id),
          'Paiement client', 0, p.montant, p.id, 2
        FROM paiements p JOIN factures f ON f.id=p.facture_id WHERE f.tiers_id=$1 AND f.deleted_at IS NULL

        UNION ALL
        SELECT date_avoir::timestamp, 'avoir_client', numero_avoir,
          'Avoir ' || numero_avoir, 0, total, id, 3
        FROM factures_avoir WHERE tiers_id=$1 AND statut = 'valide' AND deleted_at IS NULL

        UNION ALL
        SELECT date_acompte::timestamp, 'acompte_client', 'ACO-'||id,
          'Acompte client', 0, montant, id, 4
        FROM acomptes_clients WHERE tiers_id=$1 AND statut IN ('disponible','utilise')

        UNION ALL
        SELECT ff.date_facture::timestamp, 'facture_fourn', ff.numero_facture_fournisseur,
          'Facture fourn. ' || ff.numero_facture_fournisseur, 0, ff.total, ff.id, 5
        FROM factures_fournisseur ff WHERE ff.tiers_id=$1 AND ff.statut!='annulee'

        UNION ALL
        SELECT pf.date_paiement::timestamp, 'paiement_fourn', COALESCE(pf.reference,'PF-'||pf.id),
          'Paiement fourn.', pf.montant, 0, pf.id, 6
        FROM paiements_fournisseur pf JOIN factures_fournisseur ff2 ON ff2.id=pf.facture_id WHERE ff2.tiers_id=$1

        UNION ALL
        SELECT date_acompte::timestamp, 'acompte_fourn', 'AF-'||id,
          'Acompte fourn.', montant, 0, id, 7
        FROM acomptes_fournisseur WHERE tiers_id=$1 AND statut IN ('disponible','utilise')
      ),
      filtered AS (
        SELECT * FROM mouvements
        WHERE ($2::date IS NULL OR date::date >= $2::date)
          AND ($3::date IS NULL OR date::date <= $3::date)
      )
      SELECT date::text, type, ref as reference, libelle, debit, credit, id as document_id
      FROM filtered
      ORDER BY date ASC, ordre ASC, id ASC`;

    const [totauxClient, totauxFourn, mouvements] = await Promise.all([
      pool.query(totauxClientQ, [tiersId]),
      pool.query(totauxFournQ, [tiersId]),
      pool.query(mouvementsQ, [tiersId, options.from || null, options.to || null]),
    ]);

    const tc = totauxClient.rows[0];
    const tf = totauxFourn.rows[0];
    const solde_net = parseFloat(tc.solde_client) - parseFloat(tf.solde_fournisseur);

    return {
      tiers,
      totaux: {
        client: {
          total_facture: parseFloat(tc.total_facture),
          total_paye: parseFloat(tc.total_paye),
          total_avoir: parseFloat(tc.total_avoir),
          total_acompte: parseFloat(tc.total_acompte),
          solde_client: parseFloat(tc.solde_client),
        },
        fournisseur: {
          total_facture_fourn: parseFloat(tf.total_facture_fourn),
          total_paye_fourn: parseFloat(tf.total_paye_fourn),
          total_acompte_fourn: parseFloat(tf.total_acompte_fourn),
          solde_fournisseur: parseFloat(tf.solde_fournisseur),
        },
        solde_net,
        statut_net: solde_net > 0 ? 'debiteur' : solde_net < 0 ? 'crediteur' : 'solde',
      },
      mouvements: mouvements.rows.map((r: any) => ({
        date: r.date,
        type: r.type,
        reference: r.reference,
        libelle: r.libelle,
        debit: parseFloat(r.debit),
        credit: parseFloat(r.credit),
        document_id: r.document_id,
        role: r.type.endsWith('_client') || r.type === 'avoir_client' ? 'Client' : 'Fournisseur',
      })),
    };
  }

  /**
   * Relevé de compte détaillé (client): une ligne par article facturé + une
   * ligne par versement, dans l'ordre chronologique, avec solde cumulé.
   * Format type "grand livre client" (date, facture, désignation, qté, PU,
   * montant, versement, solde).
   */
  async getReleveDetaille(tiersId: number, options: { from?: string; to?: string } = {}): Promise<any> {
    const tiers = await this.getById(tiersId);
    if (!tiers) return null;

    const q = `
      WITH lignes AS (
        SELECT f.date_facture::date AS date, f.numero_facture AS facture,
               COALESCE(p.nom, dl.description, '-') AS designation,
               dl.quantite::numeric AS quantite, dl.prix_unitaire AS prix_unitaire,
               dl.total_ligne AS montant, 0::numeric AS versement,
               f.date_facture AS sortdate, 1 AS ordre, dl.id AS lid
        FROM document_lignes dl
        JOIN factures f ON f.id = dl.document_id AND dl.document_type = 'facture'
        LEFT JOIN produits p ON p.id = dl.produit_id
        WHERE f.tiers_id = $1 AND f.statut <> 'annulee' AND f.deleted_at IS NULL

        UNION ALL

        SELECT pay.date_paiement::date, f.numero_facture,
               'PAIEMENT ' || UPPER(pay.methode_paiement) || COALESCE(' ' || pay.reference, ''),
               NULL::numeric, NULL::numeric, 0::numeric, pay.montant,
               pay.date_paiement, 2, pay.id
        FROM paiements pay
        JOIN factures f ON f.id = pay.facture_id
        WHERE f.tiers_id = $1 AND f.deleted_at IS NULL
      )
      SELECT date::text, facture, designation, quantite, prix_unitaire, montant, versement
      FROM lignes
      WHERE ($2::date IS NULL OR date >= $2::date)
        AND ($3::date IS NULL OR date <= $3::date)
      ORDER BY sortdate ASC, ordre ASC, lid ASC`;

    const { rows } = await pool.query(q, [tiersId, options.from || null, options.to || null]);

    let solde = 0;
    const lignes = rows.map((r: any) => {
      const montant = parseFloat(r.montant) || 0;
      const versement = parseFloat(r.versement) || 0;
      solde += montant - versement;
      return {
        date: r.date,
        facture: r.facture,
        designation: r.designation,
        quantite: r.quantite != null ? parseFloat(r.quantite) : null,
        prix_unitaire: r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null,
        montant,
        versement,
        solde: Math.round(solde * 100) / 100,
      };
    });

    const total_facture = lignes.reduce((s, l) => s + l.montant, 0);
    const total_versement = lignes.reduce((s, l) => s + l.versement, 0);

    return {
      tiers,
      from: options.from || null,
      to: options.to || null,
      lignes,
      total_facture: Math.round(total_facture * 100) / 100,
      total_versement: Math.round(total_versement * 100) / 100,
      solde_final: Math.round(solde * 100) / 100,
    };
  }

  /**
   * Client list with computed balance (deprecated `/api/clients/with-balance`).
   * Solde is the canonical `calculer_solde_client()` (single source of truth —
   * same function `getAll`/`getById` use), not a re-derived inline subtraction.
   * The breakdown columns (total_facture/paye/avoir, derniere_activite) are kept
   * for display only.
   */
  async getClientsWithBalance(options: {
    search?: string;
    statut_solde?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'ASC' | 'DESC';
  } = {}): Promise<PaginatedResult<any>> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;
    const order = options.order === 'DESC' ? 'DESC' : 'ASC';
    const allowedSort = ['nom', 'prenom', 'solde', 'derniere_activite'];
    const sortCol = allowedSort.includes(options.sort || '') ? options.sort! : 'nom';
    const searchParam = options.search ? `%${options.search}%` : null;
    const statutParam = ['debiteur', 'crediteur', 'solde'].includes(options.statut_solde || '')
      ? options.statut_solde!
      : null;

    const baseCte = `
      WITH balance_data AS (
        SELECT
          c.id, c.raison_sociale AS nom, c.prenom, c.email, c.telephone, c.adresse, c.nif, c.created_at,
          COALESCE(f.total_factures, 0) AS total_facture,
          COALESCE(p.total_paiements, 0) + COALESCE(ac.total_acomptes, 0) AS total_paye,
          COALESCE(fa.total_avoirs, 0) AS total_avoir,
          ROUND(calculer_solde_client(c.id)) AS solde,
          CASE
            WHEN calculer_solde_client(c.id) > 0 THEN 'debiteur'
            WHEN calculer_solde_client(c.id) < 0 THEN 'crediteur'
            ELSE 'solde'
          END AS statut_solde,
          NULLIF(GREATEST(
            COALESCE(f.derniere_facture, '1970-01-01'::timestamp),
            COALESCE(p.dernier_paiement, '1970-01-01'::timestamp),
            COALESCE(fa.dernier_avoir::timestamp, '1970-01-01'::timestamp),
            COALESCE(ac.dernier_acompte, '1970-01-01'::timestamp)
          ), '1970-01-01'::timestamp) AS derniere_activite
        FROM tiers c
        LEFT JOIN (SELECT tiers_id, SUM(total) AS total_factures, MAX(date_facture) AS derniere_facture FROM factures WHERE statut != 'annulee' AND deleted_at IS NULL GROUP BY tiers_id) f ON f.tiers_id = c.id
        LEFT JOIN (SELECT f2.tiers_id, SUM(p.montant) AS total_paiements, MAX(p.date_paiement) AS dernier_paiement FROM paiements p JOIN factures f2 ON f2.id = p.facture_id WHERE f2.deleted_at IS NULL GROUP BY f2.tiers_id) p ON p.tiers_id = c.id
        LEFT JOIN (SELECT tiers_id, SUM(total) AS total_avoirs, MAX(date_avoir) AS dernier_avoir FROM factures_avoir WHERE statut = 'valide' GROUP BY tiers_id) fa ON fa.tiers_id = c.id
        LEFT JOIN (SELECT tiers_id, SUM(montant) AS total_acomptes, MAX(date_acompte) AS dernier_acompte FROM acomptes_clients WHERE statut IN ('disponible', 'utilise') GROUP BY tiers_id) ac ON ac.tiers_id = c.id
        WHERE c.deleted_at IS NULL AND c.est_client = true
          AND ($1::text IS NULL OR c.raison_sociale ILIKE $1 OR c.prenom ILIKE $1 OR c.email ILIKE $1)
      )
    `;

    const dataQuery = baseCte + `
      SELECT * FROM balance_data
      WHERE ($2::text IS NULL OR statut_solde = $2)
      ORDER BY
        CASE WHEN $3 = 'nom'     AND $4 = 'ASC'  THEN nom END ASC NULLS LAST,
        CASE WHEN $3 = 'nom'     AND $4 = 'DESC' THEN nom END DESC NULLS LAST,
        CASE WHEN $3 = 'prenom'  AND $4 = 'ASC'  THEN prenom END ASC NULLS LAST,
        CASE WHEN $3 = 'prenom'  AND $4 = 'DESC' THEN prenom END DESC NULLS LAST,
        CASE WHEN $3 = 'solde'   AND $4 = 'ASC'  THEN solde END ASC NULLS LAST,
        CASE WHEN $3 = 'solde'   AND $4 = 'DESC' THEN solde END DESC NULLS LAST,
        CASE WHEN $3 = 'derniere_activite' AND $4 = 'ASC'  THEN derniere_activite END ASC NULLS LAST,
        CASE WHEN $3 = 'derniere_activite' AND $4 = 'DESC' THEN derniere_activite END DESC NULLS LAST,
        CASE WHEN $3 NOT IN ('nom','prenom','solde','derniere_activite') AND $4 = 'ASC'  THEN nom END ASC NULLS LAST,
        CASE WHEN $3 NOT IN ('nom','prenom','solde','derniere_activite') AND $4 = 'DESC' THEN nom END DESC NULLS LAST
      LIMIT $5 OFFSET $6
    `;

    const countQuery = baseCte + ` SELECT COUNT(*) AS total FROM balance_data WHERE ($2::text IS NULL OR statut_solde = $2)`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [searchParam, statutParam, sortCol, order, limit, offset]),
      pool.query(countQuery, [searchParam, statutParam]),
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0');

    return {
      data: dataResult.rows.map((row: any) => ({
        id: row.id,
        nom: row.nom,
        raison_sociale: row.nom,
        prenom: row.prenom,
        email: row.email,
        telephone: row.telephone,
        adresse: row.adresse,
        nif: row.nif,
        created_at: row.created_at,
        total_facture: parseFloat(row.total_facture),
        total_paye: parseFloat(row.total_paye),
        total_avoir: parseFloat(row.total_avoir),
        solde: parseInt(row.solde),
        statut_solde: row.statut_solde,
        derniere_activite: row.derniere_activite,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Per-client ledger with running balance (deprecated `/api/clients/:id/compte`).
   * Headline solde uses the canonical `calculer_solde_client()`; the breakdown
   * and per-row running balance are presentation only. Returns null if the id is
   * not an active client.
   */
  async getClientCompte(clientId: number, options: { from?: string; to?: string } = {}): Promise<any> {
    const clientResult = await pool.query(
      'SELECT id, raison_sociale as nom, raison_sociale, prenom, email, telephone, adresse, nif FROM tiers WHERE id = $1 AND deleted_at IS NULL AND est_client = true',
      [clientId]
    );
    if (clientResult.rows.length === 0) return null;
    const client = clientResult.rows[0];

    const totauxQuery = `
      WITH
      f AS (SELECT COALESCE(SUM(total), 0) as total FROM factures WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL),
      ac AS (SELECT COALESCE(SUM(montant), 0) as total FROM acomptes_clients WHERE tiers_id = $1 AND statut IN ('disponible', 'utilise')),
      p AS (SELECT COALESCE(SUM(p.montant), 0) as total FROM paiements p JOIN factures fa ON fa.id = p.facture_id WHERE fa.tiers_id = $1 AND fa.deleted_at IS NULL),
      fa AS (SELECT COALESCE(SUM(total), 0) as total FROM factures_avoir WHERE tiers_id = $1 AND statut = 'valide'),
      alloc AS (SELECT COALESCE(SUM(montant_paye), 0) as total FROM factures WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL)
      SELECT
        f.total as total_facture,
        p.total + ac.total as total_paye,
        alloc.total as total_alloue,
        (p.total + ac.total) - alloc.total as surplus,
        fa.total as total_avoir,
        ROUND(calculer_solde_client($1)) as solde,
        CASE
          WHEN calculer_solde_client($1) > 0 THEN 'debiteur'
          WHEN calculer_solde_client($1) < 0 THEN 'crediteur'
          ELSE 'solde'
        END as statut_solde
      FROM f, p, fa, ac, alloc
    `;

    const mouvementsQuery = `
      WITH mouvements AS (
        SELECT date_facture::timestamp as date, 'facture' as type, numero_facture as reference,
          'Facture ' || numero_facture as libelle, total as debit, 0 as credit, id, 1 as ordre,
          montant_paye, total - montant_paye as restant
        FROM factures WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL
        UNION ALL
        SELECT p.date_paiement::timestamp, 'paiement', COALESCE(p.reference, 'PAY-' || p.id),
          'Paiement ' || p.methode_paiement, 0, p.montant, p.id, 2, NULL as montant_paye, NULL as restant
        FROM paiements p JOIN factures f ON f.id = p.facture_id WHERE f.tiers_id = $1 AND f.deleted_at IS NULL
        UNION ALL
        SELECT date_avoir::timestamp, 'avoir', numero_avoir, 'Avoir ' || numero_avoir, 0, total, id, 3,
          NULL as montant_paye, NULL as restant
        FROM factures_avoir WHERE tiers_id = $1 AND statut = 'valide'
        UNION ALL
        SELECT date_acompte::timestamp, 'acompte', 'ACO-' || id, 'Acompte client', 0, montant, id, 4,
          NULL as montant_paye, NULL as restant
        FROM acomptes_clients WHERE tiers_id = $1 AND statut IN ('disponible', 'utilise')
      ),
      filtered AS (
        SELECT * FROM mouvements
        WHERE ($2::date IS NULL OR date::date >= $2::date)
          AND ($3::date IS NULL OR date::date <= $3::date)
      )
      SELECT date::text as date, type, reference, libelle, debit, credit, montant_paye, restant,
        SUM(debit - credit) OVER (ORDER BY date ASC, ordre ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as solde_apres
      FROM filtered
      ORDER BY date ASC, ordre ASC, id ASC
    `;

    const [totauxResult, mouvementsResult] = await Promise.all([
      pool.query(totauxQuery, [clientId]),
      pool.query(mouvementsQuery, [clientId, options.from || null, options.to || null]),
    ]);
    const totaux = totauxResult.rows[0];

    return {
      client,
      totaux: {
        total_facture: parseFloat(totaux.total_facture),
        total_paye: parseFloat(totaux.total_paye),
        total_alloue: parseFloat(totaux.total_alloue),
        surplus: parseFloat(totaux.surplus),
        total_avoir: parseFloat(totaux.total_avoir),
        solde: parseInt(totaux.solde),
        statut_solde: totaux.statut_solde,
      },
      mouvements: mouvementsResult.rows.map((row: any) => ({
        date: row.date,
        type: row.type,
        reference: row.reference,
        libelle: row.libelle,
        debit: parseFloat(row.debit),
        credit: parseFloat(row.credit),
        montant_paye: row.montant_paye ? parseFloat(row.montant_paye) : null,
        restant: row.restant ? parseFloat(row.restant) : null,
        solde_apres: parseInt(row.solde_apres),
      })),
    };
  }

  async promouvoirEnClient(id: number): Promise<TiersRecord | null> {
    const { rows } = await pool.query(
      `UPDATE tiers SET est_client = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    return rows[0] || null;
  }

  async promouvoirEnFournisseur(id: number): Promise<TiersRecord | null> {
    const { rows } = await pool.query(
      `UPDATE tiers SET est_fournisseur = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    return rows[0] || null;
  }

  async search(query: string, role?: 'client' | 'fournisseur'): Promise<TiersRecord[]> {
    const params: any[] = [`%${query}%`];
    let roleFilter = '';
    if (role === 'client') roleFilter = 'AND est_client = true';
    else if (role === 'fournisseur') roleFilter = 'AND est_fournisseur = true';

    const { rows } = await pool.query(
      `SELECT id, code, raison_sociale, prenom, telephone, email, est_client, est_fournisseur
       FROM tiers
       WHERE deleted_at IS NULL ${roleFilter}
         AND (raison_sociale ILIKE $1 OR telephone ILIKE $1 OR email ILIKE $1 OR code ILIKE $1 OR nif ILIKE $1)
       ORDER BY raison_sociale ASC
       LIMIT 20`,
      params
    );
    return rows;
  }
}

export const tiersService = new TiersService();
