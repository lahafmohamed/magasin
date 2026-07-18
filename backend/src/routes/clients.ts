import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import pool from '../db/connection';
import { validateBody } from '../middleware/validation';
import { createClientSchema, updateClientSchema } from '../validation/schemas';
import { logAudit } from '../middleware/audit';
import { AuthRequest } from '../middleware/auth';
import { tiersService } from '../services/TiersService';

const router = Router();

router.use(authenticate);

const deprecated = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/tiers>; rel="successor-version"');
  next();
};
router.use(deprecated);

// GET /api/clients - paginated list of clients
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, page = '1', limit = '20', sort = 'nom', order = 'asc' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;
    const sortDir = (order as string).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let query = `
      SELECT id, raison_sociale as nom, prenom, email, telephone, adresse, nif, created_at, updated_at
      FROM tiers
      WHERE deleted_at IS NULL AND est_client = true
    `;
    const params: any[] = [];

    if (search) {
      query += ` AND (raison_sociale ILIKE $1 OR prenom ILIKE $1 OR email ILIKE $1)`;
      params.push(`%${search}%`);
    }

    const sortColumnMap: Record<string, string> = {
      nom: 'raison_sociale',
      prenom: 'prenom',
      email: 'email',
      telephone: 'telephone',
      created_at: 'created_at'
    };
    const sortCol = sortColumnMap[sort as string] || 'raison_sociale';

    query += ` ORDER BY ${sortCol} ${sortDir} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    const countQuery = `
      SELECT COUNT(*)
      FROM tiers
      WHERE deleted_at IS NULL AND est_client = true
      ${search ? 'AND (raison_sociale ILIKE $1 OR prenom ILIKE $1 OR email ILIKE $1)' : ''}
    `;

    const [dataRes, countRes] = await Promise.all([
      pool.query(query, [...params, limitNum, offset]),
      pool.query(countQuery, params)
    ]);

    const total = parseInt(countRes.rows[0].count);

    res.json({
      success: true,
      data: dataRes.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err: any) {
    console.error('GET /api/clients error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /api/clients/with-balance — list clients with computed balance.
// Delegates to TiersService (canonical solde via calculer_solde_client).
router.get('/with-balance', async (req, res) => {
  try {
    const { search, sort, order, page, limit, statut_solde } = req.query;
    const result = await tiersService.getClientsWithBalance({
      search: search as string | undefined,
      statut_solde: statut_solde as string | undefined,
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      sort: sort as string | undefined,
      order: (order as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error: any) {
    console.error('GET /api/clients/with-balance error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /api/clients/:id/compte — per-client ledger with running balance.
// Delegates to TiersService (canonical solde via calculer_solde_client).
router.get('/:id/compte', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) {
      res.status(400).json({ success: false, error: 'ID client invalide' });
      return;
    }
    const { from, to } = req.query;
    const compte = await tiersService.getClientCompte(clientId, {
      from: from as string | undefined,
      to: to as string | undefined,
    });
    if (!compte) {
      res.status(404).json({ success: false, error: 'Client non trouvé' });
      return;
    }
    res.json({ success: true, data: compte });
  } catch (error: any) {
    console.error('GET /api/clients/:id/compte error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// CRUD shims directly query the database for compatibility
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { rows } = await pool.query(
      'SELECT id, raison_sociale as nom, prenom, email, telephone, adresse, nif, created_at, updated_at FROM tiers WHERE id = $1 AND deleted_at IS NULL AND est_client = true',
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Client non trouvé' });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err: any) {
    console.error('GET /api/clients/:id error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.get('/:id/historique', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { rows } = await pool.query(
      `SELECT f.*, STRING_AGG(p.nom || ' x' || dl.quantite, ', ') as articles
       FROM factures f
       LEFT JOIN document_lignes dl ON dl.document_type = 'facture' AND f.id = dl.document_id
       LEFT JOIN produits p ON dl.produit_id = p.id
       WHERE f.tiers_id = $1 AND f.deleted_at IS NULL
       GROUP BY f.id
       ORDER BY f.date_facture DESC`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('GET /api/clients/:id/historique error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/', authorize('admin', 'manager'), validateBody(createClientSchema), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { nom, prenom, email, telephone, adresse, nif } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO tiers (raison_sociale, prenom, email, telephone, adresse, nif, est_client, est_fournisseur)
       VALUES ($1, $2, $3, $4, $5, $6, true, false)
       RETURNING id, raison_sociale as nom, prenom, email, telephone, adresse, nif, created_at, updated_at`,
      [nom, prenom || null, email || null, telephone || null, adresse || null, nif || null]
    );
    
    const client = rows[0];
    await logAudit({
      utilisateur_id: authReq.user?.id || null,
      action: 'create',
      table_name: 'clients',
      record_id: client.id,
      req,
      new_values: client,
    });

    res.status(201).json({ success: true, data: client, message: 'Client créé' });
  } catch (err: any) {
    console.error('POST /api/clients error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.put('/:id', authorize('admin', 'manager'), validateBody(updateClientSchema), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const authReq = req as AuthRequest;
    const { nom, prenom, email, telephone, adresse, nif } = req.body;

    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (nom !== undefined) { fields.push(`raison_sociale = $${paramIndex++}`); params.push(nom); }
    if (prenom !== undefined) { fields.push(`prenom = $${paramIndex++}`); params.push(prenom || null); }
    if (email !== undefined) { fields.push(`email = $${paramIndex++}`); params.push(email || null); }
    if (telephone !== undefined) { fields.push(`telephone = $${paramIndex++}`); params.push(telephone || null); }
    if (adresse !== undefined) { fields.push(`adresse = $${paramIndex++}`); params.push(adresse || null); }
    if (nif !== undefined) { fields.push(`nif = $${paramIndex++}`); params.push(nif || null); }

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: 'Aucun champ à mettre à jour' });
      return;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE tiers SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL AND est_client = true
       RETURNING id, raison_sociale as nom, prenom, email, telephone, adresse, nif, created_at, updated_at`,
      params
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Client non trouvé' });
      return;
    }

    const client = rows[0];
    await logAudit({
      utilisateur_id: authReq.user?.id || null,
      action: 'update',
      table_name: 'clients',
      record_id: client.id,
      req,
      new_values: req.body,
    });

    res.json({ success: true, data: client, message: 'Client modifié' });
  } catch (err: any) {
    console.error('PUT /api/clients/:id error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.delete('/:id', authorize('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const authReq = req as AuthRequest;

    // Check if client is linked to invoices
    const { rows: invoiceRows } = await pool.query(
      'SELECT id FROM factures WHERE tiers_id = $1 AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    if (invoiceRows.length > 0) {
      res.status(400).json({ success: false, error: 'Ce client est lié à des factures', code: '23503' });
      return;
    }

    const { rowCount } = await pool.query(
      'UPDATE tiers SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL AND est_client = true',
      [id]
    );

    if ((rowCount ?? 0) === 0) {
      res.status(404).json({ success: false, error: 'Client non trouvé' });
      return;
    }

    await logAudit({
      utilisateur_id: authReq.user?.id || null,
      action: 'delete',
      table_name: 'clients',
      record_id: id,
      req,
    });

    res.json({ success: true, message: 'Client supprimé' });
  } catch (err: any) {
    console.error('DELETE /api/clients/:id error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export default router;
