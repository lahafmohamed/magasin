import pool from '../db/connection';

// ============================================
// Location assignment helper
//
// The former role/permission matrix (ROLE_PERMISSIONS, requireRolePermission,
// requireLocationAccess, requireDemandeOwnershipOrRole, ...) was removed when RBAC
// was consolidated onto the single `authorize(roles)` mechanism in middleware/auth.
// The only survivor is this location-assignment lookup, used by DemandeController to
// filter demandes by the depot/magasin a user is assigned to. It reads the location
// assignment tables (`user_location_roles` / `utilisateur_locations`), not the
// dropped permission tables.
// ============================================

/**
 * Resolve a user's role at a specific location.
 */
export async function getUserLocationRole(
    userId: number,
    locationId: number
): Promise<'depot_staff' | 'magasin_staff' | 'both' | 'none'> {
    try {
        // Check user_location_roles first (canonical)
        const { rows } = await pool.query(
            `SELECT role_at_location FROM user_location_roles
             WHERE utilisateur_id = $1 AND location_id = $2`,
            [userId, locationId]
        );

        if (rows.length > 0) {
            return rows[0].role_at_location;
        }

        // Fallback: check utilisateur_locations with location_type inference
        const { rows: fallbackRows } = await pool.query(
            `SELECT ul.location_id, sl.location_type
             FROM utilisateur_locations ul
             JOIN stock_locations sl ON ul.location_id = sl.id
             WHERE ul.utilisateur_id = $1 AND ul.location_id = $2`,
            [userId, locationId]
        );

        if (fallbackRows.length > 0) {
            const locationType = fallbackRows[0].location_type;
            return locationType === 'depot' ? 'depot_staff' : 'magasin_staff';
        }

        return 'none';
    } catch {
        return 'none';
    }
}
