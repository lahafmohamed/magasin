import pool from '../db/connection';

/**
 * Shared read engine for the sales document families (devis, bons de
 * livraison). Their list and stats queries were written twice, character for
 * character apart from the table, alias, number column and date column — and
 * each copy built its filter chain *twice more*, once for the page and once
 * for the count.
 *
 * That is four hand-maintained filter lists for one concept. The same shape in
 * DemandeService had already drifted into wrong pagination totals, so this
 * builds the WHERE once and hands it to both queries.
 *
 * Only the read paths are shared. The write paths (create, updateStatut,
 * convertToFacture, delete) look symmetric from a distance but encode
 * genuinely different rules — a delivery note moves stock, a quote spawns a
 * delivery note — and are deliberately left in their own services.
 */

export interface SalesDocumentConfig {
  /** Table holding the documents, e.g. 'bons_livraison'. */
  table: string;
  /** Alias used throughout the query, e.g. 'bl'. */
  alias: string;
  /** Document-number column, searched with ILIKE, e.g. 'numero_bl'. */
  numeroColumn: string;
  /** Document date column, the default sort, e.g. 'date_bl'. */
  dateColumn: string;
  /** Sort keys accepted from the caller. Anything else falls back to dateColumn. */
  sortColumns: string[];
  /** Extra SELECT expressions appended after the standard tiers/location ones. */
  extraSelect?: string;
  /** Extra JOINs needed by extraSelect. */
  extraJoins?: string;
}

export interface SalesDocumentListOptions {
  search?: string;
  statut?: string;
  client_id?: number;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}

export interface SalesDocumentPage {
  data: any[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Filters shared by the page query and its count, built once. */
function buildFilters(
  cfg: SalesDocumentConfig,
  options: SalesDocumentListOptions
): { clause: string; params: any[] } {
  const params: any[] = [];
  let clause = '';

  if (options.search) {
    clause += ` AND (${cfg.alias}.${cfg.numeroColumn} ILIKE $${params.length + 1}`
      + ` OR t.raison_sociale ILIKE $${params.length + 2})`;
    params.push(`%${options.search}%`, `%${options.search}%`);
  }
  if (options.statut) {
    clause += ` AND ${cfg.alias}.statut = $${params.length + 1}`;
    params.push(options.statut);
  }
  if (options.client_id) {
    clause += ` AND ${cfg.alias}.tiers_id = $${params.length + 1}`;
    params.push(options.client_id);
  }

  return { clause, params };
}

export async function listSalesDocuments(
  cfg: SalesDocumentConfig,
  options: SalesDocumentListOptions = {}
): Promise<SalesDocumentPage> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  const offset = (page - 1) * limit;

  const sortColumn = cfg.sortColumns.includes(options.sort ?? '') ? options.sort! : cfg.dateColumn;
  // client_nom is a joined alias (tiers), not a column of the document table.
  const sortExpr = sortColumn === 'client_nom' ? 't.raison_sociale' : `${cfg.alias}.${sortColumn}`;
  const sortOrder = (options.order ?? 'DESC').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const { clause, params } = buildFilters(cfg, options);

  const query = `
      SELECT ${cfg.alias}.*, t.raison_sociale as client_nom, t.prenom as client_prenom,
             sl.nom as location_nom${cfg.extraSelect ? `, ${cfg.extraSelect}` : ''}
      FROM ${cfg.table} ${cfg.alias}
      LEFT JOIN tiers t ON ${cfg.alias}.tiers_id = t.id
      LEFT JOIN stock_locations sl ON ${cfg.alias}.location_id = sl.id
      ${cfg.extraJoins ?? ''}
      WHERE ${cfg.alias}.deleted_at IS NULL${clause}
      ORDER BY ${sortExpr} ${sortOrder}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  // The count only needs the tiers join, which the search filter references.
  const countQuery = `
      SELECT COUNT(*) FROM ${cfg.table} ${cfg.alias}
      LEFT JOIN tiers t ON ${cfg.alias}.tiers_id = t.id
      WHERE ${cfg.alias}.deleted_at IS NULL${clause}
  `;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(query, [...params, limit, offset]),
    pool.query(countQuery, params),
  ]);

  const total = parseInt(countRows[0].count, 10);

  return {
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export interface SalesDocumentStatsConfig {
  table: string;
  dateColumn: string;
  /** SQL predicate for the family-specific highlight bucket. */
  highlightFilter: string;
  /** Key the highlight bucket is returned under. */
  highlightKey: string;
}

export async function salesDocumentStats(cfg: SalesDocumentStatsConfig): Promise<any> {
  const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total_count,
        COALESCE(SUM(total), 0) AS total_montant,
        COUNT(*) FILTER (WHERE ${cfg.highlightFilter})::int AS highlight_count,
        COUNT(*) FILTER (WHERE date_trunc('month', ${cfg.dateColumn}) = date_trunc('month', CURRENT_DATE))::int AS mois_count,
        COALESCE(SUM(total) FILTER (WHERE date_trunc('month', ${cfg.dateColumn}) = date_trunc('month', CURRENT_DATE)), 0) AS mois_montant
      FROM ${cfg.table}
      WHERE deleted_at IS NULL
  `);

  const r = rows[0];
  return {
    total: { count: r.total_count, montant: Number(r.total_montant) },
    [cfg.highlightKey]: { count: r.highlight_count },
    mois: { count: r.mois_count, montant: Number(r.mois_montant) },
  };
}
