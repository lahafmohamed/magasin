/**
 * Libellés français des rôles système (`roles.nom` côté backend).
 * Source unique — ne pas dupliquer de map locale dans les pages.
 */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  caissier: 'Caissier',
  depot_staff: 'Personnel dépôt',
  magasin_staff: 'Personnel magasin',
  viewer: 'Consultation',
};

/** Rend le libellé français d'un rôle, ou le code brut si inconnu. */
export function formatRole(role?: string | null): string {
  if (!role) return '—';
  return ROLE_LABELS[role] || role;
}

/** Libellés français des types d'emplacement (`location_type`). */
export const LOCATION_TYPE_LABELS: Record<string, string> = {
  magasin: 'Magasin',
  depot: 'Dépôt',
};

/** Rend le libellé français d'un type d'emplacement, ou le code brut si inconnu. */
export function formatLocationType(type?: string | null): string {
  if (!type) return '—';
  return LOCATION_TYPE_LABELS[type.toLowerCase()] || type;
}
