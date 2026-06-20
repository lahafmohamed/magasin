import pool from '../db/connection';
import { logger } from '../utils/logger';

export class AuditService {
  static async log(
    table: string,
    recordId: number,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    oldValues: Record<string, any> | null = null,
    newValues: Record<string, any> | null = null,
    userId?: number
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [table, recordId, action, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null, userId || null]
      );
    } catch (error) {
      logger.error({ error }, 'Failed to write audit log');
    }
  }

  static async getLogs(filters: {
    table?: string;
    record_id?: number;
    action?: string;
    date_from?: string;
    date_to?: string;
    user_id?: number;
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.table) {
      conditions.push(`table_name = $${paramIndex++}`);
      params.push(filters.table);
    }
    if (filters.record_id) {
      conditions.push(`record_id = $${paramIndex++}`);
      params.push(filters.record_id);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters.date_from) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      conditions.push(`created_at <= $${paramIndex++}::date + interval '1 day'`);
      params.push(filters.date_to);
    }
    if (filters.user_id) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.user_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 200);
    const offset = (page - 1) * limit;

    const countResult = await pool.query(`SELECT COUNT(*) FROM audit_log ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await pool.query(
      `SELECT al.*, u.username as user_nom
       FROM audit_log al
       LEFT JOIN utilisateurs u ON al.user_id = u.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return { data: dataResult.rows, total };
  }
}
