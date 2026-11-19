import type { TagHue } from '@/components/ui/tag';

/**
 * Motifs d'avoir — valeurs imposées par la contrainte CHECK de
 * `factures_avoir.avoir_type` (023/043). Source unique partagée par la liste
 * des avoirs et le formulaire de création.
 */
export const AVOIR_TYPES = ['retour', 'echange', 'remise_commerciale', 'erreur'] as const;

export type AvoirType = (typeof AVOIR_TYPES)[number];

export const AVOIR_TYPE_LABELS: Record<string, string> = {
  erreur: 'Erreur de facturation',
  retour: 'Retour marchandise',
  echange: 'Échange',
  remise_commerciale: 'Remise commerciale',
};

/** Options prêtes pour un `<Select>` de motif, dans l'ordre de `AVOIR_TYPES`. */
export const AVOIR_TYPE_OPTIONS: ReadonlyArray<{ value: AvoirType; label: string }> = AVOIR_TYPES.map(
  (value) => ({ value, label: AVOIR_TYPE_LABELS[value] })
);

/** Libellé français d'un motif d'avoir ; valeur inconnue → texte lisible. */
export function formatAvoirType(type?: string | null): string {
  if (!type) return '—';
  if (AVOIR_TYPE_LABELS[type]) return AVOIR_TYPE_LABELS[type];
  const readable = type.replace(/_/g, ' ').trim();
  return readable ? readable.charAt(0).toLocaleUpperCase('fr-FR') + readable.slice(1) : '—';
}

/**
 * Teinte de catégorie de chaque motif (`<Tag hue>`) — une catégorie, jamais un
 * statut. Partagée par la liste des avoirs et le formulaire : un même motif
 * garde la même pastille d'un écran à l'autre. Quatre teintes bien distinctes :
 * `chart-1` (bleu) et `chart-3` (bleu ciel) se confondaient en pastille de 8 px.
 */
export const AVOIR_TYPE_HUES: Record<AvoirType, TagHue> = {
  retour: 1,
  echange: 4,
  remise_commerciale: 2,
  erreur: 6,
};

/** Teinte d'un motif ; `undefined` (étiquette neutre) pour un motif inconnu. */
export function avoirTypeHue(type?: string | null): TagHue | undefined {
  return type ? AVOIR_TYPE_HUES[type as AvoirType] : undefined;
}
