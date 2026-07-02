import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';

// Records that may carry attachments. Guards against arbitrary entity_type.
export const ATTACHMENT_ENTITY_TYPES = [
  'facture', 'facture_fournisseur', 'commande', 'reception', 'tiers', 'employe', 'devis', 'avoir', 'depense',
] as const;
export type AttachmentEntityType = typeof ATTACHMENT_ENTITY_TYPES[number];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', 'application/vnd.ms-excel',
  'text/plain', 'text/csv',
]);

export interface CreateAttachmentInput {
  entity_type: string;
  entity_id: number;
  filename: string;
  mime_type: string;
  contenu_base64: string; // raw base64 or data: URL
  cree_par?: number;
  req?: any;
}

export class AttachmentService {
  /** List attachment metadata (no contenu) for an entity. */
  async list(entityType: string, entityId: number): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT a.id, a.entity_type, a.entity_id, a.filename, a.mime_type, a.taille, a.cree_par, a.created_at,
              u.nom_complet AS cree_par_nom
       FROM attachments a
       LEFT JOIN utilisateurs u ON u.id = a.cree_par
       WHERE a.entity_type = $1 AND a.entity_id = $2
       ORDER BY a.created_at DESC`,
      [entityType, entityId]
    );
    return rows;
  }

  /** Fetch one attachment including its bytes (for download). */
  async getWithContent(id: number): Promise<{ filename: string; mime_type: string; contenu: Buffer } | null> {
    const { rows } = await pool.query(
      'SELECT filename, mime_type, contenu FROM attachments WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  async create(input: CreateAttachmentInput): Promise<any> {
    const { entity_type, entity_id, filename, mime_type, contenu_base64, cree_par, req } = input;

    if (!ATTACHMENT_ENTITY_TYPES.includes(entity_type as AttachmentEntityType)) {
      const err: any = new Error(`Type d'entité non supporté: ${entity_type}`); err.statusCode = 400; throw err;
    }
    if (!ALLOWED_MIME.has(mime_type)) {
      const err: any = new Error(`Type de fichier non autorisé: ${mime_type}`); err.statusCode = 400; throw err;
    }

    // Accept raw base64 or a data: URL; strip the prefix if present.
    const base64 = contenu_base64.includes(',') ? contenu_base64.split(',').pop()! : contenu_base64;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      const err: any = new Error('Contenu base64 invalide'); err.statusCode = 400; throw err;
    }
    if (buffer.length === 0) { const err: any = new Error('Fichier vide'); err.statusCode = 400; throw err; }
    if (buffer.length > MAX_BYTES) {
      const err: any = new Error(`Fichier trop volumineux (max ${MAX_BYTES / 1024 / 1024} Mo)`); err.statusCode = 400; throw err;
    }

    const { rows } = await pool.query(
      `INSERT INTO attachments (entity_type, entity_id, filename, mime_type, taille, contenu, cree_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, entity_type, entity_id, filename, mime_type, taille, cree_par, created_at`,
      [entity_type, entity_id, filename.slice(0, 255), mime_type, buffer.length, buffer, cree_par || null]
    );

    await logAudit({
      utilisateur_id: cree_par || req?.user?.id, action: 'create', table_name: 'attachments',
      record_id: rows[0].id, req, new_values: { entity_type, entity_id, filename, taille: buffer.length },
    });
    logger.info({ id: rows[0].id, entity_type, entity_id }, 'Attachment created');
    return rows[0];
  }

  async delete(id: number, userId?: number, req?: any): Promise<boolean> {
    const { rowCount } = await pool.query('DELETE FROM attachments WHERE id = $1', [id]);
    if (!rowCount) { const err: any = new Error('Pièce jointe introuvable'); err.statusCode = 404; throw err; }
    await logAudit({ utilisateur_id: userId, action: 'delete', table_name: 'attachments', record_id: id, req });
    return true;
  }
}

export const attachmentService = new AttachmentService();
