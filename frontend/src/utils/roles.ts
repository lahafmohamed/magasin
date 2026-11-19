/**
 * Libellés français des rôles système (`roles.nom` côté backend).
 * Source unique — ne pas dupliquer de map locale dans les pages.
 * Glossaire : le rôle `manager` se dit « Gérant » (persona Moussa, brief §2).
 */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Gérant',
  caissier: 'Caissier',
  depot_staff: 'Personnel dépôt',
  magasin_staff: 'Personnel magasin',
  viewer: 'Consultation',
};

/**
 * Rôles qui travaillent en quantités seulement (décision E2, 2026-10-24) : ni
 * montant, ni prix d'achat ou de vente, ni valeur de commande, ni client à
 * l'écran — réceptions, stock et transferts compris.
 */
export const QUANTITY_ONLY_ROLES: readonly string[] = ['depot_staff'];

/** Le rôle voit-il les prix et les montants ? Faux pour le personnel dépôt (E2). */
export function canSeePrices(role?: string | null): boolean {
  return !QUANTITY_ONLY_ROLES.includes(role ?? '');
}

/** Options prêtes pour un `<Select>` de rôle, dans l'ordre ci-dessus. */
export const ROLE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.entries(ROLE_LABELS).map(
  ([value, label]) => ({ value, label })
);

/** Rend le libellé français d'un rôle ; code inconnu → texte lisible, jamais le code brut. */
export function formatRole(role?: string | null): string {
  if (!role) return '—';
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  const readable = role.replace(/_/g, ' ').trim();
  return readable ? readable.charAt(0).toLocaleUpperCase('fr-FR') + readable.slice(1) : '—';
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
