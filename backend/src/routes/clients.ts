import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import pool from '../db/connection';
import { validateBody } from '../middleware/validation';
import { createClientSchema, updateClientSchema } from '../validation/schemas';
import { logAudit } from '../middleware/audit';
import { AuthRequest } from '../middleware/auth';

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
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/clients/with-balance — list all clients with computed balance (tiers table)
router.get('/with-balance', async (req, res) => {
  try {
    const { search, sort = 'nom', order = 'asc', page = '1', limit = '20', statut_solde } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;
    const sortDir = (order as string).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const searchParam = search ? `%${search}%` : null;
    const statutParam = ['debiteur', 'crediteur', 'solde'].includes(statut_solde as string)
      ? (statut_solde as string)
      : null;

    const allowedSortCols = ['nom', 'prenom', 'solde', 'derniere_activite'];
    const sortCol = allowedSortCols.includes(sort as string) ? (sort as string) : 'nom';

    const dataQuery = `
      WITH balance_data AS (
        SELECT
          c.id, c.raison_sociale as nom, c.prenom, c.email, c.telephone, c.adresse, c.nif, c.created_at,
          COALESCE(f.total_factures, 0) as total_facture,
          COALESCE(p.total_paiements, 0) + COALESCE(ac.total_acomptes, 0) as total_paye,
          COALESCE(fa.total_avoirs, 0) as total_avoir,
          ROUND(COALESCE(f.total_factures, 0) - COALESCE(p.total_paiements, 0) - COALESCE(fa.total_avoirs, 0) - COALESCE(ac.total_acomptes, 0)) as solde,
          CASE
            WHEN COALESCE(f.total_factures, 0) - COALESCE(p.total_paiements, 0) - COALESCE(fa.total_avoirs, 0) - COALESCE(ac.total_acomptes, 0) > 0 THEN 'debiteur'
            WHEN COALESCE(f.total_factures, 0) - COALESCE(p.total_paiements, 0) - COALESCE(fa.total_avoirs, 0) - COALESCE(ac.total_acomptes, 0) < 0 THEN 'crediteur'
            ELSE 'solde'
          END as statut_solde,
          NULLIF(GREATEST(
            COALESCE(f.derniere_facture, '1970-01-01'::timestamp),
            COALESCE(p.dernier_paiement, '1970-01-01'::timestamp),
            COALESCE(fa.dernier_avoir::timestamp, '1970-01-01'::timestamp),
            COALESCE(ac.dernier_acompte, '1970-01-01'::timestamp)
          ), '1970-01-01'::timestamp) as derniere_activite
        FROM tiers c
        LEFT JOIN (
          SELECT tiers_id, SUM(total) as total_factures, MAX(date_facture) as derniere_facture
          FROM factures WHERE statut != 'annulee' AND deleted_at IS NULL GROUP BY tiers_id
        ) f ON f.tiers_id = c.id
        LEFT JOIN (
          SELECT f2.tiers_id, SUM(p.montant) as total_paiements, MAX(p.date_paiement) as dernier_paiement
          FROM paiements p
          JOIN factures f2 ON f2.id = p.facture_id
          WHERE f2.deleted_at IS NULL
          GROUP BY f2.tiers_id
        ) p ON p.tiers_id = c.id
        LEFT JOIN (
          SELECT tiers_id, SUM(total) as total_avoirs, MAX(date_avoir) as dernier_avoir
          FROM factures_avoir WHERE statut IN ('valide', 'utilise') GROUP BY tiers_id
        ) fa ON fa.tiers_id = c.id
        LEFT JOIN (
          SELECT tiers_id, SUM(montant) as total_acomptes, MAX(date_acompte) as dernier_acompte
          FROM acomptes_clients WHERE statut IN ('disponible', 'utilise') GROUP BY tiers_id
        ) ac ON ac.tiers_id = c.id
        WHERE c.deleted_at IS NULL AND c.est_client = true
          AND ($1::text IS NULL OR c.raison_sociale ILIKE $1 OR c.prenom ILIKE $1 OR c.email ILIKE $1)
      )
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

    const countQuery = `
      WITH balance_data AS (
        SELECT c.id,
          CASE
            WHEN COALESCE(f.total_factures, 0) - COALESCE(p.total_paiements, 0) - COALESCE(fa.total_avoirs, 0) - COALESCE(ac.total_acomptes, 0) > 0 THEN 'debiteur'
            WHEN COALESCE(f.total_factures, 0) - COALESCE(p.total_paiements, 0) - COALESCE(fa.total_avoirs, 0) - COALESCE(ac.total_acomptes, 0) < 0 THEN 'crediteur'
            ELSE 'solde'
          END as statut_solde
        FROM tiers c
        LEFT JOIN (SELECT tiers_id, SUM(total) as total_factures FROM factures WHERE statut != 'annulee' AND deleted_at IS NULL GROUP BY tiers_id) f ON f.tiers_id = c.id
        LEFT JOIN (SELECT f2.tiers_id, SUM(p.montant) as total_paiements FROM paiements p JOIN factures f2 ON f2.id = p.facture_id WHERE f2.deleted_at IS NULL GROUP BY f2.tiers_id) p ON p.tiers_id = c.id
        LEFT JOIN (SELECT tiers_id, SUM(total) as total_avoirs FROM factures_avoir WHERE statut IN ('valide','utilise') GROUP BY tiers_id) fa ON fa.tiers_id = c.id
        LEFT JOIN (SELECT tiers_id, SUM(montant) as total_acomptes FROM acomptes_clients WHERE statut IN ('disponible', 'utilise') GROUP BY tiers_id) ac ON ac.tiers_id = c.id
        WHERE c.deleted_at IS NULL AND c.est_client = true
          AND ($1::text IS NULL OR c.raison_sociale ILIKE $1 OR c.prenom ILIKE $1 OR c.email ILIKE $1)
      )
      SELECT COUNT(*) as total FROM balance_data
      WHERE ($2::text IS NULL OR statut_solde = $2)
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [searchParam, statutParam, sortCol, sortDir, limitNum, offset]),
      pool.query(countQuery, [searchParam, statutParam]),
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0');

    res.json({
      success: true,
      data: dataResult.rows.map((row: any) => ({
        id: row.id,
        nom: row.raison_sociale,
        raison_sociale: row.raison_sociale,
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
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('GET /api/clients/with-balance error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /api/clients/:id/compte — per-client ledger with running balance
router.get('/:id/compte', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) {
      res.status(400).json({ success: false, error: 'ID client invalide' });
      return;
    }

    const { from, to } = req.query;

    // Tiers info (replaces legacy clients lookup)
    const clientResult = await pool.query(
      'SELECT id, raison_sociale as nom, raison_sociale, prenom, email, telephone, adresse, nif FROM tiers WHERE id = $1 AND deleted_at IS NULL AND est_client = true',
      [clientId]
    );
    if (clientResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Client non trouvé' });
      return;
    }
    const client = clientResult.rows[0];

    // Totaux (all history, no date filter)
    const totauxQuery = `
      WITH
      f AS (SELECT COALESCE(SUM(total), 0) as total FROM factures WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL),
      fa AS (SELECT COALESCE(SUM(total), 0) as total FROM factures_avoir WHERE tiers_id = $1 AND statut IN ('valide', 'utilise')),
      ac AS (SELECT COALESCE(SUM(montant), 0) as total FROM acomptes_clients WHERE tiers_id = $1 AND statut IN ('disponible', 'utilise')),
      p AS (SELECT COALESCE(SUM(p.montant), 0) as total FROM paiements p JOIN factures fa ON fa.id = p.facture_id WHERE fa.tiers_id = $1 AND fa.deleted_at IS NULL),
      alloc AS (SELECT COALESCE(SUM(montant_paye), 0) as total FROM factures WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL)
      SELECT
        f.total as total_facture,
        p.total + ac.total as total_paye,
        alloc.total as total_alloue,
        (p.total + ac.total) - alloc.total as surplus,
        fa.total as total_avoir,
        ROUND(f.total - p.total - fa.total - ac.total) as solde,
        CASE
          WHEN f.total - p.total - fa.total - ac.total > 0 THEN 'debiteur'
          WHEN f.total - p.total - fa.total - ac.total < 0 THEN 'crediteur'
          ELSE 'solde'
        END as statut_solde
      FROM f, p, fa, ac, alloc
    `;
    const totauxResult = await pool.query(totauxQuery, [clientId]);
    const totaux = totauxResult.rows[0];

    // Mouvements with SQL running balance
    const mouvementsQuery = `
      WITH mouvements AS (
        SELECT
          date_facture::timestamp as date,
          'facture' as type,
          numero_facture as reference,
          'Facture ' || numero_facture as libelle,
          total as debit,
          0 as credit,
          id,
          1 as ordre,
          montant_paye,
          total - montant_paye as restant
        FROM factures
        WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL

        UNION ALL

        SELECT
          p.date_paiement::timestamp,
          'paiement',
          COALESCE(p.reference, 'PAY-' || p.id),
          'Paiement ' || p.methode_paiement,
          0,
          p.montant,
          p.id,
          2,
          NULL as montant_paye,
          NULL as restant
        FROM paiements p
        JOIN factures f ON f.id = p.facture_id
        WHERE f.tiers_id = $1 AND f.deleted_at IS NULL

        UNION ALL

        SELECT
          date_avoir::timestamp,
          'avoir',
          numero_avoir,
          'Avoir ' || numero_avoir,
          0,
          total,
          id,
          3,
          NULL as montant_paye,
          NULL as restant
        FROM factures_avoir
        WHERE tiers_id = $1 AND statut IN ('valide', 'utilise')

        UNION ALL

        SELECT
          date_acompte::timestamp,
          'acompte',
          'ACO-' || id,
          'Acompte client',
          0,
          montant,
          id,
          4,
          NULL as montant_paye,
          NULL as restant
        FROM acomptes_clients
        WHERE tiers_id = $1 AND statut IN ('disponible', 'utilise')
      ),
      filtered AS (
        SELECT * FROM mouvements
        WHERE ($2::date IS NULL OR date::date >= $2::date)
          AND ($3::date IS NULL OR date::date <= $3::date)
      )
      SELECT
        date::text as date,
        type,
        reference,
        libelle,
        debit,
        credit,
        montant_paye,
        restant,
        SUM(debit - credit) OVER (ORDER BY date ASC, ordre ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as solde_apres
      FROM filtered
      ORDER BY date ASC, ordre ASC, id ASC
    `;
    const mouvementsResult = await pool.query(mouvementsQuery, [
      clientId,
      from || null,
      to || null,
    ]);

    res.json({
      success: true,
      data: {
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
      },
    });
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
    res.status(500).json({ success: false, error: err.message });
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
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', validateBody(createClientSchema), async (req: Request, res: Response) => {
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
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', validateBody(updateClientSchema), async (req: Request, res: Response) => {
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
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
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
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
