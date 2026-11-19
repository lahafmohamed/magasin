import { Response } from 'express';
import { demandeService, DemandeFilters } from '../services/DemandeService';
import { successResponse, paginatedResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { getUserLocationRole } from '../middleware/permissions';
import { businessStatusOf } from '../utils/errors';
import pool from '../db/connection';
import { PRODUCT_MONEY_KEYS, redactForRole } from '../utils/roleRedaction';

/**
 * Gérant (`manager`) et administrateur supervisent tous les emplacements :
 * ils voient, décident et exécutent n'importe quelle demande sans affectation
 * à un dépôt (décision produit D2, 2026-10-23). Avant, seul `admin` passait le
 * contrôle d'emplacement : la cloche et le tableau de bord invitaient le gérant
 * à décider, puis l'API lui répondait 403.
 */
const SUPERVISOR_ROLES = ['admin', 'manager'];

/** demandes_reapprovisionnement.statut CHECK values. */
const DEMANDE_STATUTS = [
    'brouillon',
    'envoyee',
    'approuvee',
    'partiellement_approuvee',
    'refusee',
    'en_cours',
    'livree',
    'cloturee',
];

function isSupervisor(role: string | undefined): boolean {
    return !!role && SUPERVISOR_ROLES.includes(role);
}

export class DemandeController {
    /** Location ids this user holds one of the given roles at. */
    private static async assignedLocations(userId: number, roles: string[]): Promise<number[]> {
        const { rows } = await pool.query(
            `SELECT location_id FROM user_location_roles
             WHERE utilisateur_id = $1 AND role_at_location = ANY($2)`,
            [userId, roles]
        );
        return rows.map((r) => r.location_id);
    }

    // ============================================
    // LIST - Role-based filtering
    // ============================================

    static async getAll(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { statut, search, magasin_id, depot_id, date_from, date_to, page, limit } = req.query;
            const userId = req.user?.id;
            const userRole = req.user?.role;

            if (!userId || !userRole) {
                res.status(401).json({ success: false, error: 'Non authentifié' });
                return;
            }

            // `statut` accepts one status or several, comma-separated
            // (statut=approuvee,partiellement_approuvee).
            const statuts = typeof statut === 'string'
                ? [...new Set(statut.split(',').map((s) => s.trim()).filter(Boolean))]
                : [];
            const unknown = statuts.find((s) => !DEMANDE_STATUTS.includes(s));
            if (unknown) {
                res.status(400).json({ success: false, error: 'Statut de demande inconnu.' });
                return;
            }

            const filters: DemandeFilters = {
                statuts: statuts.length > 0 ? statuts : undefined,
                search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
                page: page ? parseInt(page as string, 10) : 1,
                limit: limit ? parseInt(limit as string, 10) : 20,
            };

            // The previous inline version parsed these and then referenced them in
            // neither the data nor the count query — the API accepted a date range
            // and silently ignored it.
            if (date_from) filters.date_from = new Date(date_from as string);
            if (date_to) filters.date_to = new Date(date_to as string);

            // Role decides what the user is allowed to see; the query itself
            // belongs to the service.
            if (isSupervisor(userRole)) {
                if (magasin_id) filters.magasin_id = parseInt(magasin_id as string, 10);
                if (depot_id) filters.depot_id = parseInt(depot_id as string, 10);
            } else if (userRole === 'magasin_staff') {
                const magasinIds = await DemandeController.assignedLocations(userId, ['magasin_staff', 'both']);
                if (magasinIds.length > 0) {
                    // Their own requests OR anything for their stores.
                    filters.created_by_or_magasin_ids = { userId, magasinIds };
                } else {
                    filters.created_by_user_id = userId;
                }
            } else if (userRole === 'depot_staff') {
                const depotIds = await DemandeController.assignedLocations(userId, ['depot_staff', 'both']);
                if (depotIds.length === 0) {
                    paginatedResponse(res, [], 0, 1, 20, 'Demandes récupérées avec succès');
                    return;
                }
                filters.depot_ids = depotIds;
                // A store's draft is never visible to the depot (GET /:id answers
                // 403 on it), even when asked for explicitly.
                filters.exclude_statuts = ['brouillon'];
                // Without an explicit filter, depot staff see only actionable states.
                if (!filters.statuts) {
                    filters.statuts = ['envoyee', 'approuvee', 'partiellement_approuvee', 'en_cours', 'livree'];
                }
            } else {
                // Caissier and any other role: only the demandes they created —
                // exactly what GET /:id lets them open. The list used to return
                // every demande of every store to a cashier.
                filters.created_by_user_id = userId;
            }

            const { data, total } = await demandeService.getAll(filters);

            paginatedResponse(res, data, total, filters.page!, filters.limit!, 'Demandes récupérées avec succès');
        } catch (error: any) {
            console.error('[DemandeController.getAll] Error:', error);
            res.status(500).json({ success: false, error: 'Erreur serveur' });
        }
    }

    // ============================================
    // GET BY ID
    // ============================================

    static async getById(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            const userId = req.user?.id;
            const userRole = req.user?.role;

            const demande = await demandeService.getById(id);

            if (!demande) {
                res.status(404).json({ success: false, error: 'Demande non trouvée' });
                return;
            }

            // Role-based access check
            if (isSupervisor(userRole)) {
                // Full access (admin + gérant)
            } else if (userRole === 'magasin_staff') {
                // Can access if creator or assigned to this magasin
                const canAccess = demande.created_by_user_id === userId || 
                    await getUserLocationRole(userId!, demande.magasin_id) !== 'none';
                
                if (!canAccess) {
                    res.status(403).json({ success: false, error: 'Accès refusé à cette demande' });
                    return;
                }
            } else if (userRole === 'depot_staff') {
                // Can access if assigned to this depot
                const depotAccess = await getUserLocationRole(userId!, demande.depot_id);
                if (depotAccess === 'none') {
                    res.status(403).json({ success: false, error: 'Accès refusé à cette demande' });
                    return;
                }
                // Depot staff cannot see brouillon demandes from magasins
                if (demande.statut === 'brouillon') {
                    res.status(403).json({ success: false, error: 'Cette demande n\'est pas encore visible' });
                    return;
                }
            } else if (demande.created_by_user_id !== userId) {
                // Caissier and other roles: their own demandes only (same rule as the list).
                res.status(403).json({ success: false, error: 'Accès refusé à cette demande' });
                return;
            }

            // E2: dépôt staff see the quantities of a demande, not its prices.
            successResponse(res, redactForRole(req.user?.role, demande, PRODUCT_MONEY_KEYS), 'Demande récupérée avec succès');
        } catch (error: any) {
            console.error('[DemandeController] Error:', error);
            res.status(500).json({ success: false, error: 'Erreur serveur' });
        }
    }

    // ============================================
    // CREATE
    // ============================================

    static async create(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { magasin_id, depot_id, lignes, motif } = req.body;
            const userId = req.user?.id;

            if (!magasin_id || !depot_id || !lignes || !Array.isArray(lignes) || lignes.length === 0) {
                res.status(400).json({ 
                    success: false, 
                    error: 'magasin_id, depot_id et lignes (non vide) sont requis' 
                });
                return;
            }

            const result = await demandeService.create({
                magasin_id,
                depot_id,
                lignes,
                motif,
                created_by_user_id: userId,
                req,
            });

            res.status(201).json({
                success: true,
                data: result,
                message: 'Demande créée avec succès',
            });
        } catch (error: any) {
            const status = businessStatusOf(error);
            if (!status) console.error('[DemandeController] Error:', error);
            res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
        }
    }

    // ============================================
    // UPDATE (brouillon only)
    // ============================================

    static async update(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            const { lignes, motif } = req.body;
            const userId = req.user?.id;
            const userRole = req.user?.role;

            // Check ownership before update
            const existing = await demandeService.getById(id);
            if (!existing) {
                res.status(404).json({ success: false, error: 'Demande non trouvée' });
                return;
            }

            if (existing.created_by_user_id !== userId && !isSupervisor(userRole)) {
                res.status(403).json({ success: false, error: 'Vous ne pouvez modifier que vos propres demandes en brouillon' });
                return;
            }

            await demandeService.update(id, { lignes, motif }, userId);
            successResponse(res, null, 'Demande mise à jour avec succès');
        } catch (error: any) {
            const status = businessStatusOf(error);
            if (!status) console.error('[DemandeController] Error:', error);
            res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
        }
    }

    // ============================================
    // STATE TRANSITIONS
    // ============================================

    static async send(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            const userId = req.user?.id;
            const userRole = req.user?.role;

            // Verify ownership
            const existing = await demandeService.getById(id);
            if (!existing) {
                res.status(404).json({ success: false, error: 'Demande non trouvée' });
                return;
            }

            if (existing.created_by_user_id !== userId && !isSupervisor(userRole)) {
                res.status(403).json({ success: false, error: 'Vous ne pouvez envoyer que vos propres demandes' });
                return;
            }

            await demandeService.send(id, userId, req);
            successResponse(res, null, 'Demande envoyée au dépôt avec succès');
        } catch (error: any) {
            const status = businessStatusOf(error);
            if (!status) console.error('[DemandeController] Error:', error);
            res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
        }
    }

    static async decide(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            const { decision, lignes_decision, raison_refus } = req.body;
            const userId = req.user?.id;
            const userRole = req.user?.role;

            if (!decision || !['approuvee', 'refusee'].includes(decision)) {
                res.status(400).json({ success: false, error: 'Décision requise: approuvee ou refusee' });
                return;
            }

            // Verify depot access
            const existing = await demandeService.getById(id);
            if (!existing) {
                res.status(404).json({ success: false, error: 'Demande non trouvée' });
                return;
            }

            if (!isSupervisor(userRole)) {
                const depotAccess = await getUserLocationRole(userId!, existing.depot_id);
                if (depotAccess === 'none') {
                    res.status(403).json({
                        success: false,
                        error: 'Seuls le personnel du dépôt concerné, le gérant et l’administrateur peuvent décider de cette demande.',
                    });
                    return;
                }
            }

            // Refusal requires reason
            if (decision === 'refusee' && !raison_refus) {
                res.status(400).json({ success: false, error: 'Motif de refus requis' });
                return;
            }

            await demandeService.decide(id, {
                decision,
                lignes_decision,
                raison_refus,
                user_id: userId,
                req,
            });

            const message = decision === 'approuvee' 
                ? 'Demande approuvée avec succès' 
                : 'Demande refusée';
            
            successResponse(res, null, message);
        } catch (error: any) {
            const status = businessStatusOf(error);
            if (!status) console.error('[DemandeController] Error:', error);
            res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
        }
    }

    static async execute(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            const userId = req.user?.id;
            const userRole = req.user?.role;

            // Verify depot access
            const existing = await demandeService.getById(id);
            if (!existing) {
                res.status(404).json({ success: false, error: 'Demande non trouvée' });
                return;
            }

            if (!isSupervisor(userRole)) {
                const depotAccess = await getUserLocationRole(userId!, existing.depot_id);
                if (depotAccess === 'none') {
                    res.status(403).json({
                        success: false,
                        error: 'Seuls le personnel du dépôt concerné, le gérant et l’administrateur peuvent exécuter ce transfert.',
                    });
                    return;
                }
            }

            const result = await demandeService.execute(id, userId, req);
            
            res.status(200).json({
                success: true,
                data: result,
                message: 'Transfert exécuté avec succès',
            });
        } catch (error: any) {
            const status = businessStatusOf(error);
            if (!status) console.error('[DemandeController] Error:', error);
            res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
        }
    }

    static async close(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            const userId = req.user?.id;
            const userRole = req.user?.role;

            // Verify magasin access
            const existing = await demandeService.getById(id);
            if (!existing) {
                res.status(404).json({ success: false, error: 'Demande non trouvée' });
                return;
            }

            if (!isSupervisor(userRole)) {
                const magasinAccess = await getUserLocationRole(userId!, existing.magasin_id);
                if (magasinAccess === 'none') {
                    res.status(403).json({ 
                        success: false, 
                        error: 'Seul le personnel du magasin peut clôturer' 
                    });
                    return;
                }
            }

            await demandeService.close(id, userId, req);
            successResponse(res, null, 'Demande clôturée avec succès');
        } catch (error: any) {
            const status = businessStatusOf(error);
            if (!status) console.error('[DemandeController] Error:', error);
            res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
        }
    }

    static async cancel(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            const userId = req.user?.id;
            const userRole = req.user?.role;

            // Verify ownership
            const existing = await demandeService.getById(id);
            if (!existing) {
                res.status(404).json({ success: false, error: 'Demande non trouvée' });
                return;
            }

            // Only the creator or a supervisor (admin, manager) can cancel
            if (existing.created_by_user_id !== userId && !isSupervisor(userRole)) {
                res.status(403).json({ success: false, error: 'Vous ne pouvez annuler que vos propres demandes' });
                return;
            }

            // Can only cancel in brouillon or envoyee
            if (!['brouillon', 'envoyee'].includes(existing.statut)) {
                res.status(400).json({ 
                    success: false, 
                    error: 'Une demande ne peut être annulée qu\'en état brouillon ou envoyée' 
                });
                return;
            }

            await demandeService.cancel(id, userId, userRole, req);
            successResponse(res, null, 'Demande annulée avec succès');
        } catch (error: any) {
            const status = businessStatusOf(error);
            if (!status) console.error('[DemandeController] Error:', error);
            res.status(status ?? 500).json({ success: false, error: status ? error.message : 'Erreur serveur' });
        }
    }

    // ============================================
    // DEPOT STOCK VIEW (for magasin planning)
    // ============================================

    static async getDepotStock(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { depot_id, search } = req.query;
            if (!depot_id) {
                res.status(400).json({ success: false, error: 'depot_id requis' });
                return;
            }

            // All authenticated users can view depot stock (read-only)
            // Actual write protection is at the mutation level
            const stock = await demandeService.getDepotStockForDemande(
                parseInt(depot_id as string, 10),
                search as string | undefined
            );

            successResponse(res, redactForRole(req.user?.role, stock, PRODUCT_MONEY_KEYS), 'Stock dépôt récupéré avec succès');
        } catch (error: any) {
            console.error('[DemandeController] Error:', error);
            res.status(500).json({ success: false, error: 'Erreur serveur' });
        }
    }
}
