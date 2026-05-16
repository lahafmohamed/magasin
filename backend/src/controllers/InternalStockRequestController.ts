import { Request, Response } from 'express';
import { internalStockRequestService } from '../services/InternalStockRequestService';
import { paginatedResponse, successResponse } from '../utils/response';
import pool from '../db/connection';

type ScopeContext = {
  role: string;
  allowedLocationIds: number[] | null;
};

export class InternalStockRequestController {
  private static async resolveScopeColumns(): Promise<{ userColumn: string; locationColumn: string } | null> {
    const { rows } = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'utilisateur_locations'`
    );

    if (rows.length === 0) {
      return null;
    }

    const columns = new Set(rows.map((row) => String(row.column_name || '').toLowerCase()));
    const userColumn = columns.has('utilisateur_id')
      ? 'utilisateur_id'
      : (columns.has('user_id') ? 'user_id' : '');
    const locationColumn = columns.has('location_id')
      ? 'location_id'
      : (columns.has('stock_location_id') ? 'stock_location_id' : '');

    if (!userColumn || !locationColumn) {
      return null;
    }

    return { userColumn, locationColumn };
  }

  private static async getScope(req: Request): Promise<ScopeContext> {
    const role = req.user?.role || '';
    const userId = req.user?.id;

    if (role === 'admin' || !userId) {
      return { role, allowedLocationIds: null };
    }

    try {
      const resolvedColumns = await InternalStockRequestController.resolveScopeColumns();
      if (!resolvedColumns) {
        return { role, allowedLocationIds: null };
      }

      const { rows } = await pool.query(
        `SELECT ${resolvedColumns.locationColumn} AS location_id
         FROM utilisateur_locations
         WHERE ${resolvedColumns.userColumn} = $1`,
        [userId]
      );

      // Backward compatibility: if no mapping exists yet, keep legacy unrestricted behavior.
      if (rows.length === 0) {
        return { role, allowedLocationIds: null };
      }

      const allowedLocationIds = rows.map((row) => parseInt(row.location_id, 10));
      return { role, allowedLocationIds };
    } catch (error: any) {
      if (error?.code === '42P01' || error?.code === '42703') {
        // Backward compatibility when migration 026 is missing or partially applied.
        return { role, allowedLocationIds: null };
      }
      throw error;
    }
  }

  private static canAccessLocation(scope: ScopeContext, locationId?: number): boolean {
    if (!locationId) return true;
    if (scope.allowedLocationIds === null) return true;
    return scope.allowedLocationIds.includes(locationId);
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { statut, magasin_id, depot_id, page, limit } = req.query;
      const scope = await InternalStockRequestController.getScope(req);

      const magasinId = magasin_id ? parseInt(magasin_id as string, 10) : undefined;
      const depotId = depot_id ? parseInt(depot_id as string, 10) : undefined;

      if (!InternalStockRequestController.canAccessLocation(scope, magasinId) || !InternalStockRequestController.canAccessLocation(scope, depotId)) {
        // For list views, return an empty result rather than a hard error to keep UI load stable.
        paginatedResponse(
          res,
          [],
          0,
          page ? parseInt(page as string, 10) : 1,
          limit ? parseInt(limit as string, 10) : 20,
          'Demandes internes recuperees avec succes'
        );
        return;
      }

      const requests = await internalStockRequestService.getAll({
        statut: statut as string | undefined,
        magasin_id: magasinId,
        depot_id: depotId,
        allowed_location_ids: scope.allowedLocationIds === null ? undefined : scope.allowedLocationIds,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      paginatedResponse(
        res,
        requests.data,
        requests.total,
        page ? parseInt(page as string, 10) : 1,
        limit ? parseInt(limit as string, 10) : 20,
        'Demandes internes recuperees avec succes'
      );
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const scope = await InternalStockRequestController.getScope(req);
      const request = await internalStockRequestService.getById(
        parseInt(req.params.id, 10),
        scope.allowedLocationIds === null ? undefined : scope.allowedLocationIds
      );

      if (!request) {
        res.status(404).json({ success: false, error: 'Demande interne non trouvee' });
        return;
      }

      successResponse(res, request, 'Demande interne recuperee avec succes');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { magasin_id, depot_id, lignes, notes } = req.body;
      const scope = await InternalStockRequestController.getScope(req);

      if (!magasin_id || !depot_id || !lignes || !Array.isArray(lignes) || lignes.length === 0) {
        res.status(400).json({ success: false, error: 'magasin_id, depot_id et lignes sont requis' });
        return;
      }

      if (!InternalStockRequestController.canAccessLocation(scope, magasin_id)) {
        res.status(403).json({ success: false, error: 'Acces refuse pour ce magasin' });
        return;
      }

      const result = await internalStockRequestService.create({
        magasin_id,
        depot_id,
        lignes,
        notes,
        cree_par: req.user?.id,
        req,
      });

      res.status(201).json({ success: true, data: result, message: 'Demande interne creee avec succes' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async validate(req: Request, res: Response): Promise<void> {
    try {
      const scope = await InternalStockRequestController.getScope(req);
      const existingRequest = await internalStockRequestService.getById(parseInt(req.params.id, 10));

      if (!existingRequest) {
        res.status(404).json({ success: false, error: 'Demande interne non trouvee' });
        return;
      }

      if (!InternalStockRequestController.canAccessLocation(scope, existingRequest.depot_id)) {
        res.status(403).json({ success: false, error: 'Acces refuse pour ce depot' });
        return;
      }

      await internalStockRequestService.validate(parseInt(req.params.id, 10), {
        lignes: req.body?.lignes,
        req,
        user_id: req.user?.id,
      });

      successResponse(res, null, 'Demande validee avec succes');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async reject(req: Request, res: Response): Promise<void> {
    try {
      const scope = await InternalStockRequestController.getScope(req);
      const existingRequest = await internalStockRequestService.getById(parseInt(req.params.id, 10));

      if (!existingRequest) {
        res.status(404).json({ success: false, error: 'Demande interne non trouvee' });
        return;
      }

      if (!InternalStockRequestController.canAccessLocation(scope, existingRequest.depot_id)) {
        res.status(403).json({ success: false, error: 'Acces refuse pour ce depot' });
        return;
      }

      await internalStockRequestService.reject(
        parseInt(req.params.id, 10),
        req.body?.motif_refus,
        req.user?.id,
        req
      );

      successResponse(res, null, 'Demande refusee avec succes');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async execute(req: Request, res: Response): Promise<void> {
    try {
      const scope = await InternalStockRequestController.getScope(req);
      const existingRequest = await internalStockRequestService.getById(parseInt(req.params.id, 10));

      if (!existingRequest) {
        res.status(404).json({ success: false, error: 'Demande interne non trouvee' });
        return;
      }

      if (!InternalStockRequestController.canAccessLocation(scope, existingRequest.depot_id)) {
        res.status(403).json({ success: false, error: 'Acces refuse pour ce depot' });
        return;
      }

      const result = await internalStockRequestService.execute(
        parseInt(req.params.id, 10),
        req.user?.id,
        req
      );

      successResponse(res, result, 'Demande executee avec succes');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
