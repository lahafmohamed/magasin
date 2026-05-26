import pool from '../db/connection';

export interface TauxTvaInput {
  code: string;
  taux: number;
  description?: string | null;
  actif?: boolean;
}

export class TauxTvaService {
  static async getAll() {
    const { rows } = await pool.query(
      'SELECT id, code, taux, description, actif, date_debut, date_fin, created_at FROM taux_tva ORDER BY taux DESC'
    );
    return rows;
  }

  static async getActive() {
    const { rows } = await pool.query(
      'SELECT id, code, taux, description FROM taux_tva WHERE actif = true ORDER BY taux DESC'
    );
    return rows;
  }

  static async create(input: TauxTvaInput) {
    const { code, taux, description = null, actif = true } = input;
    const { rows } = await pool.query(
      `INSERT INTO taux_tva (code, taux, description, actif)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, taux, description, actif, date_debut, date_fin, created_at`,
      [code, taux, description, actif]
    );
    return rows[0];
  }

  static async update(id: number, input: Partial<TauxTvaInput>) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (input.taux !== undefined) { fields.push(`taux = $${i++}`); values.push(input.taux); }
    if (input.description !== undefined) { fields.push(`description = $${i++}`); values.push(input.description); }
    if (input.actif !== undefined) { fields.push(`actif = $${i++}`); values.push(input.actif); }

    if (fields.length === 0) {
      const { rows } = await pool.query('SELECT * FROM taux_tva WHERE id = $1', [id]);
      return rows[0];
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE taux_tva SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, code, taux, description, actif, date_debut, date_fin, created_at`,
      values
    );
    return rows[0];
  }

  static async delete(id: number) {
    await pool.query('DELETE FROM taux_tva WHERE id = $1', [id]);
  }
}
