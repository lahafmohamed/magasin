import React from 'react';
import { usePermission, Permission } from '../hooks/usePermission';

interface RequirePermissionProps {
    permission: Permission;
    children: React.ReactNode;
    fallback?: React.ReactNode;
    hideIfUnauthorized?: boolean;
}

/**
 * Component that conditionally renders children based on user permission
 * 
 * Usage:
 * <RequirePermission permission={Permissions.DEMANDE_CREATE}>
 *   <Button>Nouvelle Demande</Button>
 * </RequirePermission>
 * 
 * With fallback:
 * <RequirePermission 
 *   permission={Permissions.DEMANDE_CREATE}
 *   fallback={<span>Vous ne pouvez pas créer de demandes</span>}
 * >
 *   <Button>Nouvelle Demande</Button>
 * </RequirePermission>
 * 
 * Hide completely if unauthorized:
 * <RequirePermission permission={Permissions.DEMANDE_CREATE} hideIfUnauthorized>
 *   <Button>Nouvelle Demande</Button>
 * </RequirePermission>
 */
export function RequirePermission({
    permission,
    children,
    fallback,
    hideIfUnauthorized = false,
}: RequirePermissionProps) {
    const { hasPermission } = usePermission();

    if (!hasPermission(permission)) {
        if (hideIfUnauthorized) {
            return null;
        }
        return <>{fallback || null}</>;
    }

    return <>{children}</>;
}

export default RequirePermission;
