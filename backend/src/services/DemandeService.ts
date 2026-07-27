import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';
import { businessError } from '../utils/errors';
import { costedStockIn } from './StockCostingService';

// ============================================
// TYPES
// ============================================

export interface DemandeLigneInput {
    produit_id: number;
    quantite_demandee: number;
    notes?: string;
}

export interface LigneDecisionInput {
    ligne_id: number;
    quantite_approuvee: number;
}

export interface CreateDemandeInput {
    magasin_id: number;
    depot_id: number;
    lignes: DemandeLigneInput[];
    motif?: string;
    created_by_user_id?: number;
    req?: any;
}

export interface DemandeDecisionInput {
    decision: 'approuvee' | 'refusee';
    lignes_decision?: LigneDecisionInput[];
    raison_refus?: string;
    user_id?: number;
    req?: any;
}

export interface DemandeFilters {
    statut?: string;
    /** Any-of status filter (depot staff default to the actionable states). */
    statuts?: string[];
    magasin_id?: number;
    depot_id?: number;
    /** Restrict to a set of stores — a user's assigned magasins. */
    magasin_ids?: number[];
    /** Restrict to a set of depots — a user's assigned depots. */
    depot_ids?: number[];
    created_by_user_id?: number;
    /**
     * Store staff see their own requests OR anything for their stores; the two
     * are OR-ed, so they cannot be expressed as separate filters.
     */
    created_by_or_magasin_ids?: { userId: number; magasinIds: number[] };
    date_from?: Date;
    date_to?: Date;
    page?: number;
    limit?: number;
}

// ============================================
// SERVICE CLASS
// ============================================

export class DemandeService {
    
    // ============================================
    // QUERIES
    // ============================================

    /**
     * Build the WHERE clause once, for both the page query and its count.
     *
     * These were two hand-maintained lists that had already diverged: the data
     * query filtered on date_creation and the count query did not, so any
     * date-filtered page reported a total for the *unfiltered* set — too many
     * pages, the surplus ones empty. DemandeController then hand-built a third
     * copy that honoured no dates at all. One builder makes the two provably
     * agree.
     */
    private buildFilterClause(options: DemandeFilters): { clause: string; params: any[] } {
        const params: any[] = [];
        let clause = '';
        const add = (sql: string, ...values: any[]) => {
            clause += ` AND ${sql}`;
            params.push(...values);
        };

        if (options.statut) add(`d.statut = $${params.length + 1}`, options.statut);
        if (options.statuts?.length) add(`d.statut = ANY($${params.length + 1})`, options.statuts);
        if (options.magasin_id) add(`d.magasin_id = $${params.length + 1}`, options.magasin_id);
        if (options.magasin_ids?.length) add(`d.magasin_id = ANY($${params.length + 1})`, options.magasin_ids);
        if (options.depot_id) add(`d.depot_id = $${params.length + 1}`, options.depot_id);
        if (options.depot_ids?.length) add(`d.depot_id = ANY($${params.length + 1})`, options.depot_ids);

        if (options.created_by_or_magasin_ids) {
            const { userId, magasinIds } = options.created_by_or_magasin_ids;
            add(
                `(d.created_by_user_id = $${params.length + 1} OR d.magasin_id = ANY($${params.length + 2}))`,
                userId,
                magasinIds
            );
        } else if (options.created_by_user_id) {
            add(`d.created_by_user_id = $${params.length + 1}`, options.created_by_user_id);
        }

        if (options.date_from) add(`d.date_creation >= $${params.length + 1}`, options.date_from);
        if (options.date_to) add(`d.date_creation <= $${params.length + 1}`, options.date_to);

        return { clause, params };
    }

    async getAll(options: DemandeFilters = {}): Promise<{ data: any[]; total: number }> {
        const page = options.page || 1;
        const limit = options.limit || 20;
        const offset = (page - 1) * limit;

        const { clause, params } = this.buildFilterClause(options);

        const query = `
            SELECT d.*,
                   m.nom AS magasin_nom, m.code AS magasin_code,
                   dp.nom AS depot_nom, dp.code AS depot_code,
                   u1.username AS created_by_username, u1.nom_complet AS created_by_nom,
                   u2.username AS decided_by_username, u2.nom_complet AS decided_by_nom,
                   u3.username AS executed_by_username, u3.nom_complet AS executed_by_nom,
                   u4.username AS closed_by_username, u4.nom_complet AS closed_by_nom,
                   st.numero_transfer
            FROM demandes_reapprovisionnement d
            JOIN stock_locations m ON d.magasin_id = m.id
            JOIN stock_locations dp ON d.depot_id = dp.id
            LEFT JOIN utilisateurs u1 ON d.created_by_user_id = u1.id
            LEFT JOIN utilisateurs u2 ON d.decided_by_user_id = u2.id
            LEFT JOIN utilisateurs u3 ON d.executed_by_user_id = u3.id
            LEFT JOIN utilisateurs u4 ON d.closed_by_user_id = u4.id
            LEFT JOIN stock_transfers st ON d.transfert_id = st.id
            WHERE 1=1${clause}
            ORDER BY d.date_creation DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        // The count needs no joins: magasin_id and depot_id are NOT NULL foreign
        // keys, so the inner joins above can never drop a row.
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM demandes_reapprovisionnement d
            WHERE 1=1${clause}
        `;

        const [{ rows }, { rows: countRows }] = await Promise.all([
            pool.query(query, [...params, limit, offset]),
            pool.query(countQuery, params),
        ]);

        return { data: rows, total: parseInt(countRows[0].total, 10) };
    }

    async getById(id: number): Promise<any | null> {
        const { rows: demandeRows } = await pool.query(
            `SELECT d.*,
                    m.nom AS magasin_nom, m.code AS magasin_code,
                    dp.nom AS depot_nom, dp.code AS depot_code,
                    u1.username AS created_by_username, u1.nom_complet AS created_by_nom,
                    u2.username AS decided_by_username, u2.nom_complet AS decided_by_nom,
                    u3.username AS executed_by_username, u3.nom_complet AS executed_by_nom,
                    u4.username AS closed_by_username, u4.nom_complet AS closed_by_nom,
                    st.numero_transfer, st.statut AS transfert_statut
             FROM demandes_reapprovisionnement d
             JOIN stock_locations m ON d.magasin_id = m.id
             JOIN stock_locations dp ON d.depot_id = dp.id
             LEFT JOIN utilisateurs u1 ON d.created_by_user_id = u1.id
             LEFT JOIN utilisateurs u2 ON d.decided_by_user_id = u2.id
             LEFT JOIN utilisateurs u3 ON d.executed_by_user_id = u3.id
             LEFT JOIN utilisateurs u4 ON d.closed_by_user_id = u4.id
             LEFT JOIN stock_transfers st ON d.transfert_id = st.id
             WHERE d.id = $1`,
            [id]
        );

        if (demandeRows.length === 0) {
            return null;
        }

        const demande = demandeRows[0];

        // Get lines with product info
        const { rows: lignesRows } = await pool.query(
            `SELECT dl.*, p.nom AS produit_nom, p.reference, p.prix_vente
             FROM demandes_reapprovisionnement_lignes dl
             JOIN produits p ON dl.produit_id = p.id
             WHERE dl.demande_id = $1
             ORDER BY dl.id ASC`,
            [id]
        );

        // Get history
        const { rows: historyRows } = await pool.query(
            `SELECT h.*, u.username, u.nom_complet
             FROM demandes_reapprovisionnement_history h
             LEFT JOIN utilisateurs u ON h.user_id = u.id
             WHERE h.demande_id = $1
             ORDER BY h.timestamp DESC`,
            [id]
        );

        return {
            ...demande,
            lignes: lignesRows,
            historique: historyRows,
        };
    }

    // ============================================
    // COMMANDS - State Machine
    // ============================================

    async create(input: CreateDemandeInput): Promise<{ id: number; numero: string }> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const { magasin_id, depot_id, lignes, motif, created_by_user_id, req } = input;

            // Validation
            if (magasin_id === depot_id) {
                throw businessError(422, 'Le magasin et le dépôt doivent être différents');
            }

            if (!lignes || lignes.length === 0) {
                throw businessError(422, 'La demande doit contenir au moins une ligne');
            }

            // Verify locations exist and are correct types
            const { rows: locationRows } = await client.query(
                `SELECT id, location_type, actif FROM stock_locations WHERE id IN ($1, $2)`,
                [magasin_id, depot_id]
            );

            if (locationRows.length !== 2) {
                throw businessError(422, 'Magasin ou dépôt invalide');
            }

            const magasin = locationRows.find((r) => r.id === magasin_id);
            const depot = locationRows.find((r) => r.id === depot_id);

            if (magasin?.location_type !== 'magasin') {
                throw businessError(422, 'La location source doit être un magasin');
            }
            if (depot?.location_type !== 'depot') {
                throw businessError(422, 'La location destination doit être un dépôt');
            }
            if (!magasin.actif || !depot.actif) {
                throw businessError(422, 'Une des locations est inactive');
            }

            // Generate demande number
            const { rows: seqRows } = await client.query(
                "SELECT nextval('demande_reappro_numero_seq') AS num"
            );
            const numero = `DEM-${new Date().getFullYear()}-${String(seqRows[0].num).padStart(5, '0')}`;

            // Insert demande
            const { rows: demandeRows } = await client.query(
                `INSERT INTO demandes_reapprovisionnement (
                    numero, magasin_id, depot_id, statut,
                    created_by_user_id, motif, date_creation
                ) VALUES ($1, $2, $3, 'brouillon', $4, $5, CURRENT_TIMESTAMP)
                RETURNING id`,
                [numero, magasin_id, depot_id, created_by_user_id, motif || null]
            );

            const demandeId = demandeRows[0].id;

            // Insert lines
            for (const ligne of lignes) {
                if (!ligne.produit_id || !ligne.quantite_demandee || ligne.quantite_demandee <= 0) {
                    throw businessError(422, 'Chaque ligne doit avoir un produit et une quantité > 0');
                }

                await client.query(
                    `INSERT INTO demandes_reapprovisionnement_lignes (
                        demande_id, produit_id, quantite_demandee, notes
                    ) VALUES ($1, $2, $3, $4)`,
                    [demandeId, ligne.produit_id, ligne.quantite_demandee, ligne.notes || null]
                );
            }

            // Log initial state
            await client.query(
                `INSERT INTO demandes_reapprovisionnement_history (
                    demande_id, from_statut, to_statut, user_id, payload
                ) VALUES ($1, NULL, 'brouillon', $2, $3)`,
                [demandeId, created_by_user_id, JSON.stringify({ motif })]
            );

            await client.query('COMMIT');

            await logAudit({
                utilisateur_id: created_by_user_id,
                action: 'create',
                table_name: 'demandes_reapprovisionnement',
                record_id: demandeId,
                req,
                new_values: { numero, magasin_id, depot_id, lignes_count: lignes.length },
            });

            logger.info({ demandeId, numero }, 'Demande de réapprovisionnement créée');

            return { id: demandeId, numero };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async update(demandeId: number, updates: Partial<CreateDemandeInput>, userId?: number): Promise<void> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Check current state - can only edit in brouillon
            const { rows: checkRows } = await client.query(
                `SELECT statut, created_by_user_id FROM demandes_reapprovisionnement 
                 WHERE id = $1 FOR UPDATE`,
                [demandeId]
            );

            if (checkRows.length === 0) {
                throw businessError(404, 'Demande non trouvée');
            }

            const current = checkRows[0];
            if (current.statut !== 'brouillon') {
                throw businessError(409, 'Une demande ne peut être modifiée qu\'en état brouillon');
            }

            // Update motif if provided
            if (updates.motif !== undefined) {
                await client.query(
                    `UPDATE demandes_reapprovisionnement SET motif = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                    [updates.motif, demandeId]
                );
            }

            // Update lignes if provided (delete and recreate)
            if (updates.lignes && updates.lignes.length > 0) {
                // Delete existing lines
                await client.query(
                    `DELETE FROM demandes_reapprovisionnement_lignes WHERE demande_id = $1`,
                    [demandeId]
                );

                // Insert new lines
                for (const ligne of updates.lignes) {
                    await client.query(
                        `INSERT INTO demandes_reapprovisionnement_lignes (
                            demande_id, produit_id, quantite_demandee, notes
                        ) VALUES ($1, $2, $3, $4)`,
                        [demandeId, ligne.produit_id, ligne.quantite_demandee, ligne.notes || null]
                    );
                }
            }

            await client.query('COMMIT');

            await logAudit({
                utilisateur_id: userId,
                action: 'update',
                table_name: 'demandes_reapprovisionnement',
                record_id: demandeId,
                new_values: updates,
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async send(demandeId: number, userId?: number, req?: any): Promise<void> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const { rows } = await client.query(
                `UPDATE demandes_reapprovisionnement
                 SET statut = 'envoyee',
                     date_envoi = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND statut = 'brouillon'
                 RETURNING id`,
                [demandeId]
            );

            if (rows.length === 0) {
                throw businessError(409, 'Demande non trouvée ou déjà envoyée');
            }

            await client.query('COMMIT');

            await logAudit({
                utilisateur_id: userId,
                action: 'send',
                table_name: 'demandes_reapprovisionnement',
                record_id: demandeId,
                req,
            });

            logger.info({ demandeId }, 'Demande envoyée au dépôt');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async decide(demandeId: number, input: DemandeDecisionInput): Promise<void> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Lock demande
            const { rows: demandeRows } = await client.query(
                `SELECT * FROM demandes_reapprovisionnement 
                 WHERE id = $1 AND statut = 'envoyee'
                 FOR UPDATE`,
                [demandeId]
            );

            if (demandeRows.length === 0) {
                throw businessError(409, 'Demande non trouvée ou non envoyée');
            }

            // Get current lines
            const { rows: lignesRows } = await client.query(
                `SELECT id, produit_id, quantite_demandee FROM demandes_reapprovisionnement_lignes 
                 WHERE demande_id = $1`,
                [demandeId]
            );

            if (input.decision === 'refusee') {
                // Refuse all - set all approved to 0
                await client.query(
                    `UPDATE demandes_reapprovisionnement_lignes 
                     SET quantite_approuvee = 0, updated_at = CURRENT_TIMESTAMP
                     WHERE demande_id = $1`,
                    [demandeId]
                );

                await client.query(
                    `UPDATE demandes_reapprovisionnement
                     SET statut = 'refusee',
                         decided_by_user_id = $1,
                         raison_refus = $2,
                         date_decision = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $3`,
                    [input.user_id, input.raison_refus || 'Demande refusée', demandeId]
                );
            } else {
                // Approval - process line decisions
                const decisionMap = new Map<number, number>();
                for (const d of input.lignes_decision || []) {
                    decisionMap.set(d.ligne_id, d.quantite_approuvee);
                }

                let anyPartial = false;
                let allZero = true;

                for (const ligne of lignesRows) {
                    const ligneId = ligne.id;
                    const requested = parseInt(ligne.quantite_demandee, 10);
                    const approved = decisionMap.has(ligneId) 
                        ? decisionMap.get(ligneId)! 
                        : requested; // Default to full approval if not specified

                    if (approved < 0 || approved > requested) {
                        throw businessError(422, `Quantité approuvée invalide pour ligne ${ligneId}: ${approved}`);
                    }

                    await client.query(
                        `UPDATE demandes_reapprovisionnement_lignes 
                         SET quantite_approuvee = $1, updated_at = CURRENT_TIMESTAMP
                         WHERE id = $2`,
                        [approved, ligneId]
                    );

                    if (approved < requested) anyPartial = true;
                    if (approved > 0) allZero = false;
                }

                // Determine status
                let newStatus: string;
                if (allZero) {
                    newStatus = 'refusee';
                } else if (anyPartial) {
                    newStatus = 'partiellement_approuvee';
                } else {
                    newStatus = 'approuvee';
                }

                await client.query(
                    `UPDATE demandes_reapprovisionnement
                     SET statut = $1,
                         decided_by_user_id = $2,
                         raison_refus = $3,
                         date_decision = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $4`,
                    [newStatus, input.user_id, allZero ? (input.raison_refus || 'Toutes les lignes refusées') : null, demandeId]
                );
            }

            await client.query('COMMIT');

            await logAudit({
                utilisateur_id: input.user_id,
                action: input.decision,
                table_name: 'demandes_reapprovisionnement',
                record_id: demandeId,
                req: input.req,
                new_values: { decision: input.decision, raison_refus: input.raison_refus },
            });

            logger.info({ demandeId, decision: input.decision }, 'Décision prise sur demande');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async execute(demandeId: number, userId?: number, req?: any): Promise<{ transfert_id: number; numero_transfer: string }> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Lock demande
            const { rows: demandeRows } = await client.query(
                `SELECT * FROM demandes_reapprovisionnement 
                 WHERE id = $1 AND statut IN ('approuvee', 'partiellement_approuvee')
                 FOR UPDATE`,
                [demandeId]
            );

            if (demandeRows.length === 0) {
                throw businessError(409, 'Demande non trouvée ou non approuvée');
            }

            const demande = demandeRows[0];

            // Get approved lines
            const { rows: lignesRows } = await client.query(
                `SELECT id, produit_id, quantite_demandee, quantite_approuvee
                 FROM demandes_reapprovisionnement_lignes 
                 WHERE demande_id = $1
                 ORDER BY id ASC`,
                [demandeId]
            );

            // Calculate effective quantities
            const effectiveLines = lignesRows
                .map((l) => ({
                    id: l.id,
                    produit_id: parseInt(l.produit_id, 10),
                    quantite: l.quantite_approuvee !== null 
                        ? parseInt(l.quantite_approuvee, 10) 
                        : parseInt(l.quantite_demandee, 10),
                }))
                .filter((l) => l.quantite > 0);

            if (effectiveLines.length === 0) {
                throw businessError(422, 'Aucune ligne à transférer');
            }

            // Generate transfer number
            const { rows: seqRows } = await client.query(
                "SELECT nextval('transfer_numero_seq') AS num"
            );
            const numeroTransfer = `TRA-${new Date().getFullYear()}-${String(seqRows[0].num).padStart(5, '0')}`;

            // Create transfer
            const { rows: transferRows } = await client.query(
                `INSERT INTO stock_transfers (
                    numero_transfer, location_source_id, location_destination_id,
                    demande_id, notes, statut, cree_par
                ) VALUES ($1, $2, $3, $4, $5, 'en_cours', $6)
                RETURNING id`,
                [
                    numeroTransfer,
                    demande.depot_id,
                    demande.magasin_id,
                    demandeId,
                    `Créé depuis demande ${demande.numero}`,
                    userId,
                ]
            );

            const transfertId = transferRows[0].id;

            // Process lines set-based: one ordered lock pass per location,
            // per-line validation on a running balance, then bulk writes.
            // costedStockIn stays per line — it owns the CMP math.
            const ligneProduitIds = [...new Set(effectiveLines.map((l: any) => l.produit_id))];

            // Stable lock order (produit_id ASC), source then destination —
            // concurrent executions can no longer deadlock on interleaved rows.
            const { rows: depotRows } = await client.query(
                `SELECT produit_id, quantite, COALESCE(cmp, 0) AS cmp
                 FROM stock_par_location
                 WHERE location_id = $2 AND produit_id = ANY($1::int[])
                 ORDER BY produit_id
                 FOR UPDATE`,
                [ligneProduitIds, demande.depot_id]
            );
            const depotByProduit = new Map(depotRows.map((r: any) => [Number(r.produit_id), r]));
            await client.query(
                `SELECT produit_id FROM stock_par_location
                 WHERE location_id = $2 AND produit_id = ANY($1::int[])
                 ORDER BY produit_id
                 FOR UPDATE`,
                [ligneProduitIds, demande.magasin_id]
            );

            const runningDepot = new Map<number, number>();
            for (const [pid, row] of depotByProduit) {
                runningDepot.set(pid, parseInt((row as any).quantite, 10));
            }

            const tlProduits: number[] = [];
            const tlQuantites: number[] = [];
            const tlDemandeLigneIds: number[] = [];
            const decrement = new Map<number, number>();
            for (const ligne of effectiveLines) {
                const available = runningDepot.get(ligne.produit_id) ?? 0;
                if (available < ligne.quantite) {
                    throw businessError(422,
                        `Stock dépôt insuffisant pour le produit ${ligne.produit_id}: ` +
                        `disponible ${available}, demandé ${ligne.quantite}`
                    );
                }
                runningDepot.set(ligne.produit_id, available - ligne.quantite);
                decrement.set(ligne.produit_id, (decrement.get(ligne.produit_id) ?? 0) + ligne.quantite);
                tlProduits.push(ligne.produit_id);
                tlQuantites.push(ligne.quantite);
                tlDemandeLigneIds.push(ligne.id);
            }

            // Transfer lines with demande_ligne_id link (one statement)
            await client.query(
                `INSERT INTO stock_transfer_lignes (
                    transfer_id, produit_id, quantite_demandee, quantite_transferee, demande_ligne_id
                ) SELECT $1, unnest($2::int[]), unnest($3::int[]), unnest($3::int[]), unnest($4::int[])`,
                [transfertId, tlProduits, tlQuantites, tlDemandeLigneIds]
            );

            // Decrement depot stock (validated above under lock — no guard needed)
            {
                const ids = [...decrement.keys()];
                const qtes = ids.map((id) => decrement.get(id)!);
                await client.query(
                    `UPDATE stock_par_location spl
                     SET quantite = spl.quantite - v.qte, updated_at = CURRENT_TIMESTAMP
                     FROM (SELECT unnest($1::int[]) AS pid, unnest($2::int[]) AS qte) v
                     WHERE spl.produit_id = v.pid AND spl.location_id = $3`,
                    [ids, qtes, demande.depot_id]
                );
            }

            // Increment magasin stock at the depot's unit cost so the
            // transferred value arrives with the goods (costed stock-in).
            // cmp is unaffected by the decrement above, so reading it from the
            // lock pass matches the old per-line re-read.
            for (const ligne of effectiveLines) {
                const depotCmp = Number((depotByProduit.get(ligne.produit_id) as any)?.cmp ?? 0);
                await costedStockIn(client, {
                    produitId: ligne.produit_id,
                    locationId: demande.magasin_id,
                    quantite: ligne.quantite,
                    unitCost: depotCmp > 0 ? depotCmp : null,
                });
            }

            // Delivered quantities (one statement — demande_ligne ids are unique)
            await client.query(
                `UPDATE demandes_reapprovisionnement_lignes dl
                 SET quantite_livree = v.qte, updated_at = CURRENT_TIMESTAMP
                 FROM (SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS qte) v
                 WHERE dl.id = v.id`,
                [tlDemandeLigneIds, tlQuantites]
            );

            // Update transfer to delivered
            await client.query(
                `UPDATE stock_transfers SET statut = 'livre' WHERE id = $1`,
                [transfertId]
            );

            // Update demande to livree (executed)
            await client.query(
                `UPDATE demandes_reapprovisionnement
                 SET statut = 'livree',
                     transfert_id = $1,
                     executed_by_user_id = $2,
                     date_execution = CURRENT_TIMESTAMP,
                     date_livraison = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [transfertId, userId, demandeId]
            );

            await client.query('COMMIT');

            await logAudit({
                utilisateur_id: userId,
                action: 'execute',
                table_name: 'demandes_reapprovisionnement',
                record_id: demandeId,
                req,
                new_values: { transfert_id: transfertId, numero_transfer: numeroTransfer },
            });

            logger.info({ demandeId, transfertId, numeroTransfer }, 'Demande exécutée et stock transféré');

            return { transfert_id: transfertId, numero_transfer: numeroTransfer };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async close(demandeId: number, userId?: number, req?: any): Promise<void> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const { rows } = await client.query(
                `UPDATE demandes_reapprovisionnement
                 SET statut = 'cloturee',
                     closed_by_user_id = $1,
                     date_cloture = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2 AND statut = 'livree'
                 RETURNING id`,
                [userId, demandeId]
            );

            if (rows.length === 0) {
                throw businessError(409, 'Demande non trouvée ou non livrée');
            }

            await client.query('COMMIT');

            await logAudit({
                utilisateur_id: userId,
                action: 'close',
                table_name: 'demandes_reapprovisionnement',
                record_id: demandeId,
                req,
            });

            logger.info({ demandeId }, 'Demande clôturée par le magasin');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async cancel(demandeId: number, userId?: number, role?: string, req?: any): Promise<void> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Can only cancel in brouillon or envoyee
            const { rows: checkRows } = await client.query(
                `SELECT statut, created_by_user_id FROM demandes_reapprovisionnement
                 WHERE id = $1 FOR UPDATE`,
                [demandeId]
            );

            if (checkRows.length === 0) {
                throw businessError(404, 'Demande non trouvée');
            }

            const current = checkRows[0];
            if (!['brouillon', 'envoyee'].includes(current.statut)) {
                throw businessError(409, 'Une demande ne peut être annulée qu\'en état brouillon ou envoyée');
            }

            // Ownership: only the creator or an admin may cancel.
            if (role !== 'admin' && current.created_by_user_id !== userId) {
                throw businessError(403, 'Vous ne pouvez annuler que vos propres demandes', 'FORBIDDEN');
            }

            // Soft delete approach: mark as cancelled
            // Note: 'annulee' is not in the main enum, so we use 'refusee' with a flag
            // Or add 'annulee' to the enum. Let's use a different approach - set to 'refusee' with cancellation note
            await client.query(
                `UPDATE demandes_reapprovisionnement
                 SET statut = 'refusee',
                     raison_refus = COALESCE(raison_refus, '') || ' [Annulée par le magasin]',
                     decided_by_user_id = $1,
                     date_decision = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [userId, demandeId]
            );

            await client.query('COMMIT');

            await logAudit({
                utilisateur_id: userId,
                action: 'cancel',
                table_name: 'demandes_reapprovisionnement',
                record_id: demandeId,
                req,
            });

            logger.info({ demandeId }, 'Demande annulée');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ============================================
    // UTILITY
    // ============================================

    async getDepotStockForDemande(depotId: number, search?: string): Promise<any[]> {
        let query = `
            SELECT 
                p.id AS produit_id,
                p.reference,
                p.nom AS produit_nom,
                p.prix_vente,
                COALESCE(spl.quantite, 0) AS quantite_disponible
            FROM produits p
            LEFT JOIN stock_par_location spl ON p.id = spl.produit_id AND spl.location_id = $1
            WHERE p.deleted_at IS NULL
        `;
        
        const params: any[] = [depotId];

        if (search) {
            query += ` AND (p.nom ILIKE $2 OR p.reference ILIKE $2)`;
            params.push(`%${search}%`);
        }

        // Bounded: this feeds a type-ahead picker; 200 rows is plenty and keeps
        // an all-products pull off every keystroke.
        query += ` ORDER BY p.nom ASC LIMIT 200`;

        const { rows } = await pool.query(query, params);
        return rows;
    }
}

export const demandeService = new DemandeService();
