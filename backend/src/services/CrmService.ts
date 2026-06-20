import pool from '../db/connection';

interface CreateInteractionInput {
  tiers_id: number;
  type: string;
  sujet: string;
  description?: string;
  date_interaction?: string;
  date_rappel?: string;
  priorite?: string;
  cree_par?: number;
}

interface CreateTacheInput {
  tiers_id?: number;
  titre: string;
  description?: string;
  priorite?: string;
  date_echeance?: string;
  assigne_a?: number;
  cree_par?: number;
}

export class CrmService {
  // ========== INTERACTIONS ==========

  async getInteractions(tiersId: number): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT ci.*, u.username as cree_par_nom
       FROM crm_interactions ci
       LEFT JOIN utilisateurs u ON ci.cree_par = u.id
       WHERE ci.tiers_id = $1
       ORDER BY ci.date_interaction DESC`,
      [tiersId]
    );
    return rows;
  }

  async getAllInteractions(options: {
    tiers_id?: number;
    type?: string;
    statut?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: any[]; total: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    let query = `SELECT ci.*, t.raison_sociale as tiers_nom, u.username as cree_par_nom
                 FROM crm_interactions ci
                 LEFT JOIN tiers t ON ci.tiers_id = t.id
                 LEFT JOIN utilisateurs u ON ci.cree_par = u.id WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (options.tiers_id) {
      query += ` AND ci.tiers_id = $${paramIndex++}`;
      params.push(options.tiers_id);
    }
    if (options.type) {
      query += ` AND ci.type = $${paramIndex++}`;
      params.push(options.type);
    }
    if (options.statut) {
      query += ` AND ci.statut = $${paramIndex++}`;
      params.push(options.statut);
    }

    query += ` ORDER BY ci.date_interaction DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Count query reuses the same parameterized filters (no string interpolation — SQLi safe)
    let countQuery = `SELECT COUNT(*) FROM crm_interactions ci WHERE 1=1`;
    const countParams: any[] = [];
    let countIndex = 1;
    if (options.tiers_id) {
      countQuery += ` AND ci.tiers_id = $${countIndex++}`;
      countParams.push(options.tiers_id);
    }
    if (options.type) {
      countQuery += ` AND ci.type = $${countIndex++}`;
      countParams.push(options.type);
    }
    if (options.statut) {
      countQuery += ` AND ci.statut = $${countIndex++}`;
      countParams.push(options.statut);
    }
    const countResult = await pool.query(countQuery, countParams);

    return { data: rows, total: parseInt(countResult.rows[0].count) };
  }

  async createInteraction(input: CreateInteractionInput): Promise<any> {
    const { rows } = await pool.query(
      `INSERT INTO crm_interactions (tiers_id, type, sujet, description, date_interaction, date_rappel, priorite, cree_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        input.tiers_id,
        input.type,
        input.sujet,
        input.description || null,
        input.date_interaction ? new Date(input.date_interaction) : new Date(),
        input.date_rappel ? new Date(input.date_rappel) : null,
        input.priorite || 'normale',
        input.cree_par || null,
      ]
    );
    return rows[0];
  }

  async updateInteraction(id: number, input: Partial<CreateInteractionInput>): Promise<any> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (fields.length === 0) return null;

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE crm_interactions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    return rows[0];
  }

  async deleteInteraction(id: number): Promise<boolean> {
    const { rowCount } = await pool.query('DELETE FROM crm_interactions WHERE id = $1', [id]);
    return (rowCount || 0) > 0;
  }

  // ========== TÂCHES ==========

  async getTaches(options: {
    tiers_id?: number;
    statut?: string;
    assigne_a?: number;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: any[]; total: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    let query = `SELECT ct.*, t.raison_sociale as tiers_nom, u.username as assigne_nom
                 FROM crm_taches ct
                 LEFT JOIN tiers t ON ct.tiers_id = t.id
                 LEFT JOIN utilisateurs u ON ct.assigne_a = u.id WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (options.tiers_id) {
      query += ` AND ct.tiers_id = $${paramIndex++}`;
      params.push(options.tiers_id);
    }
    if (options.statut) {
      query += ` AND ct.statut = $${paramIndex++}`;
      params.push(options.statut);
    }
    if (options.assigne_a) {
      query += ` AND ct.assigne_a = $${paramIndex++}`;
      params.push(options.assigne_a);
    }

    query += ` ORDER BY ct.date_echeance ASC NULLS LAST, ct.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM crm_taches ct WHERE 1=1`
    );

    return { data: rows, total: parseInt(countResult.rows[0].count) };
  }

  async createTache(input: CreateTacheInput): Promise<any> {
    const { rows } = await pool.query(
      `INSERT INTO crm_taches (tiers_id, titre, description, priorite, date_echeance, assigne_a, cree_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        input.tiers_id || null,
        input.titre,
        input.description || null,
        input.priorite || 'normale',
        input.date_echeance || null,
        input.assigne_a || null,
        input.cree_par || null,
      ]
    );
    return rows[0];
  }

  async updateTacheStatut(id: number, statut: string): Promise<any> {
    const { rows } = await pool.query(
      'UPDATE crm_taches SET statut = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [statut, id]
    );
    return rows[0];
  }

  async deleteTache(id: number): Promise<boolean> {
    const { rowCount } = await pool.query('DELETE FROM crm_taches WHERE id = $1', [id]);
    return (rowCount || 0) > 0;
  }

  async getRappelsEnAttente(): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT ci.*, t.raison_sociale as tiers_nom, t.telephone
       FROM crm_interactions ci
       LEFT JOIN tiers t ON ci.tiers_id = t.id
       WHERE ci.date_rappel IS NOT NULL
         AND ci.date_rappel <= NOW() + INTERVAL '24 hours'
         AND ci.rappel_fait = false
       ORDER BY ci.date_rappel ASC`
    );
    return rows;
  }

  async marquerRappelFait(id: number): Promise<void> {
    await pool.query('UPDATE crm_interactions SET rappel_fait = true WHERE id = $1', [id]);
  }
}

export const crmService = new CrmService();
