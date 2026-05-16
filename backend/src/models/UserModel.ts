import pool from '../db/connection';

export interface User {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  nom_complet: string | null;
  role: 'admin' | 'manager' | 'caissier';
  actif: boolean;
  must_change_password: boolean;
  dernier_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserCreateInput {
  username: string;
  email?: string;
  password_hash: string;
  nom_complet?: string;
  role?: 'admin' | 'manager' | 'caissier';
}

export interface UserUpdateInput {
  email?: string;
  nom_complet?: string;
  role?: 'admin' | 'manager' | 'caissier';
  actif?: boolean;
}

export class UserModel {
  /**
   * Find user by username
   */
  static async findByUsername(username: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM utilisateurs WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM utilisateurs WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by ID
   */
  static async findById(id: number): Promise<User | null> {
    const result = await pool.query(
      'SELECT id, username, email, password_hash, nom_complet, role, actif, must_change_password, dernier_login, created_at, updated_at FROM utilisateurs WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new user
   */
  static async create(input: UserCreateInput): Promise<User> {
    const result = await pool.query(
      `INSERT INTO utilisateurs (username, email, password_hash, nom_complet, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.username, input.email || null, input.password_hash, input.nom_complet || null, input.role || 'caissier']
    );
    return result.rows[0];
  }

  /**
   * Update user
   */
  static async update(id: number, input: UserUpdateInput): Promise<User> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (input.email !== undefined) {
      fields.push(`email = $${paramIndex}`);
      params.push(input.email);
      paramIndex++;
    }
    if (input.nom_complet !== undefined) {
      fields.push(`nom_complet = $${paramIndex}`);
      params.push(input.nom_complet);
      paramIndex++;
    }
    if (input.role !== undefined) {
      fields.push(`role = $${paramIndex}`);
      params.push(input.role);
      paramIndex++;
    }
    if (input.actif !== undefined) {
      fields.push(`actif = $${paramIndex}`);
      params.push(input.actif);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error('Aucun champ à mettre à jour');
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const result = await pool.query(
      `UPDATE utilisateurs SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (!result.rows[0]) {
      throw new Error('Utilisateur non trouvé');
    }

    return result.rows[0];
  }

  /**
   * Update last login timestamp
   */
  static async updateLastLogin(id: number): Promise<void> {
    await pool.query(
      'UPDATE utilisateurs SET dernier_login = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  /**
   * Get all users (with pagination)
   */
  static async findAll(page: number = 1, limit: number = 20): Promise<{ users: Omit<User, 'password_hash'>[]; total: number }> {
    const offset = (page - 1) * limit;

    const [usersResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, username, email, nom_complet, role, actif, must_change_password, dernier_login, created_at, updated_at
         FROM utilisateurs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*) as total FROM utilisateurs')
    ]);

    return {
      users: usersResult.rows,
      total: parseInt(countResult.rows[0].total),
    };
  }
}
