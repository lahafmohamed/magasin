import pool from '../db/connection';

/**
 * Legacy DepenseService — CRUD path superseded by DepenseServiceV2.
 * Only the read-only category/report helpers below remain in use
 * (consumed by DepenseControllerV2).
 */
export class DepenseService {
  /**
   * Get expense categories
   */
  async getCategories(): Promise<any[]> {
    const { rows } = await pool.query(
      'SELECT * FROM categories_depenses WHERE actif = true ORDER BY nom',
    );
    return rows;
  }

  /**
   * Get expense reports by location
   */
  async getReportByLocation(date_debut?: string, date_fin?: string): Promise<any[]> {
    let query = `
      SELECT
        sl.code as location_code,
        sl.nom as location_nom,
        COUNT(d.id) as nombre_depenses,
        COALESCE(SUM(d.montant), 0) as total_depenses,
        cd.nom as categorie_nom,
        cd.code as categorie_code
      FROM depenses d
      LEFT JOIN stock_locations sl ON d.location_id = sl.id
      LEFT JOIN categories_depenses cd ON d.categorie_id = cd.id
      WHERE d.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (date_debut) {
      query += ' AND d.date_depense >= $' + (params.length + 1);
      params.push(date_debut);
    }

    if (date_fin) {
      query += ' AND d.date_depense <= $' + (params.length + 1);
      params.push(date_fin);
    }

    query += ` GROUP BY sl.code, sl.nom, cd.nom, cd.code ORDER BY total_depenses DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Get expense reports by category
   */
  async getReportByCategorie(date_debut?: string, date_fin?: string): Promise<any[]> {
    let query = `
      SELECT
        cd.code as categorie_code,
        cd.nom as categorie_nom,
        COUNT(d.id) as nombre_depenses,
        COALESCE(SUM(d.montant), 0) as total_depenses,
        AVG(d.montant) as moyenne_depense
      FROM depenses d
      LEFT JOIN categories_depenses cd ON d.categorie_id = cd.id
      WHERE d.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (date_debut) {
      query += ' AND d.date_depense >= $' + (params.length + 1);
      params.push(date_debut);
    }

    if (date_fin) {
      query += ' AND d.date_depense <= $' + (params.length + 1);
      params.push(date_fin);
    }

    query += ` GROUP BY cd.code, cd.nom ORDER BY total_depenses DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
  }
}

export const depenseService = new DepenseService();
export default depenseService;
