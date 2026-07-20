import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { attachmentService, attachmentRolesFor } from '../services/AttachmentService';
import { successResponse } from '../utils/response';

/** Entity-level ACL: HR/finance-sensitive attachment types are admin/manager-only. */
function canAccessEntityType(req: AuthRequest, entityType: string): boolean {
  const roles = attachmentRolesFor(entityType);
  if (roles === '*') return true;
  return !!req.user && roles.includes(req.user.role);
}

export class AttachmentController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const entity_type = req.query.entity_type as string;
      const entity_id = parseInt(req.query.entity_id as string);
      if (!entity_type || isNaN(entity_id)) {
        res.status(400).json({ success: false, error: 'entity_type et entity_id requis' });
        return;
      }
      if (!canAccessEntityType(req, entity_type)) {
        res.status(403).json({ success: false, error: 'Permissions insuffisantes' });
        return;
      }
      successResponse(res, await attachmentService.list(entity_type, entity_id), 'Pièces jointes récupérées');
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ success: false, error: e.message });
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { entity_type, entity_id, filename, mime_type, contenu_base64 } = req.body;
      if (!entity_type || !entity_id || !filename || !mime_type || !contenu_base64) {
        res.status(400).json({ success: false, error: 'entity_type, entity_id, filename, mime_type, contenu_base64 requis' });
        return;
      }
      if (!canAccessEntityType(req, entity_type)) {
        res.status(403).json({ success: false, error: 'Permissions insuffisantes' });
        return;
      }
      const data = await attachmentService.create({
        entity_type, entity_id: parseInt(entity_id), filename, mime_type, contenu_base64,
        cree_par: req.user?.id, req,
      });
      res.status(201).json({ success: true, data, message: 'Pièce jointe ajoutée' });
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ success: false, error: e.message });
    }
  }

  static async download(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ success: false, error: 'Identifiant invalide' }); return; }
      const att = await attachmentService.getWithContent(id);
      if (!att) { res.status(404).json({ success: false, error: 'Pièce jointe introuvable' }); return; }
      if (!canAccessEntityType(req, att.entity_type)) {
        res.status(403).json({ success: false, error: 'Permissions insuffisantes' });
        return;
      }
      res.setHeader('Content-Type', att.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.filename)}"`);
      res.send(att.contenu);
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ success: false, error: e.message });
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ success: false, error: 'Identifiant invalide' }); return; }
      await attachmentService.delete(id, req.user?.id, req);
      successResponse(res, null, 'Pièce jointe supprimée');
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ success: false, error: e.message });
    }
  }
}
