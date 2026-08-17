/**
 * Motifs d'avoir — valeurs imposées par la contrainte CHECK de
 * `factures_avoir.avoir_type` (023/043). Source unique partagée par la liste
 * des avoirs et le formulaire de création.
 */
export const AVOIR_TYPES = ['retour', 'echange', 'remise_commerciale', 'erreur'] as const;

export type AvoirType = (typeof AVOIR_TYPES)[number];

export const AVOIR_TYPE_LABELS: Record<string, string> = {
  erreur: 'Erreur facturation',
  retour: 'Retour marchandise',
  echange: 'Échange',
  remise_commerciale: 'Remise commerciale',
};

/** Libellé français d'un motif d'avoir, ou la valeur brute si inconnue. */
export function formatAvoirType(type?: string | null): string {
  if (!type) return '—';
  return AVOIR_TYPE_LABELS[type] || type;
}
