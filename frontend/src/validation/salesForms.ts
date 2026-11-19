import { formatDate, formatNumber } from '@/utils/format';

/**
 * Règles et messages partagés des formulaires de vente (facture, devis, bon de
 * livraison, avoir).
 *
 * Un seul message par règle, à l'impératif, en français : avant, la même règle
 * « client obligatoire » avait trois textes (« Sélectionnez un tiers (client) »,
 * « Veuillez sélectionner un client », « Le tiers (client) est obligatoire »).
 */
export const SALES_MESSAGES = {
  clientRequired: 'Choisissez le client.',
  linesRequired: 'Ajoutez au moins un produit.',
  avoirLinesRequired: 'Ajoutez au moins une ligne.',
  quantity: 'Saisissez une quantité supérieure à 0.',
  quantityInteger: 'Saisissez un nombre entier.',
  price: 'Saisissez un prix supérieur à 0.',
  discount: 'Saisissez une remise entre 0 et 100 %.',
  devisRequired: 'Choisissez le devis confirmé à livrer.',
  factureRequired: 'Choisissez la facture d’origine.',
  description: 'Décrivez la ligne : produit ou motif.',
  deliveredQuantity: 'Saisissez la quantité livrée : 0 ou plus.',
  deliveredOverOrdered: 'La quantité livrée dépasse la quantité commandée.',
} as const;

/** « 1 produit », « 3 produits » — le français met le singulier à 0 et à 1. */
export function plural(count: number, one: string, many: string): string {
  return `${formatNumber(count)} ${Math.abs(count) > 1 ? many : one}`;
}

/** Message de stock insuffisant d'une ligne de facture. */
export function insufficientStockMessage(available: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(available) ? available : 0));
  return `Stock insuffisant : ${n > 1 ? `${formatNumber(n)} disponibles` : `${n} disponible`} dans cet emplacement.`;
}

/**
 * Nom accessible d'un champ de ligne : le champ, puis le produit
 * (« Quantité — HP ProBook 450 G10 »). Sans le produit, un lecteur d'écran
 * annonçait « modifier, 125 000 » sur chaque ligne, sans dire laquelle.
 */
export function lineFieldLabel(field: string, product: string | null | undefined, index?: number): string {
  const name = (product ?? '').trim();
  if (name) return `${field} — ${name}`;
  return index === undefined ? field : `${field} — ligne ${index + 1}`;
}

const SPACES = /[\s\u00A0\u202F\u2009]/g;

/** Entier saisi au clavier (« 12 », « 1 200 ») ; `NaN` si vide ou invalide. */
export function parseIntegerInput(raw: string): number {
  const cleaned = raw.replace(SPACES, '');
  if (!/^\d+$/.test(cleaned)) return Number.NaN;
  return Number.parseInt(cleaned, 10);
}

/**
 * Nombre décimal saisi à la française (« 1 250,50 ») ou à l'anglaise
 * (« 1250.50 ») ; `NaN` si vide ou invalide.
 */
export function parseDecimalInput(raw: string): number {
  const cleaned = raw.replace(SPACES, '').replace(',', '.');
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(cleaned)) return Number.NaN;
  return Number.parseFloat(cleaned);
}

/** Texte éditable d'un nombre : chiffres bruts, virgule décimale, vide si absent. */
export function toEditableNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

/** Texte affiché hors édition : groupé à la française (« 1 250 000 », « 12,5 »). */
export function toDisplayNumber(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return formatNumber(value, maximumFractionDigits);
}

// --- Délais de paiement -----------------------------------------------------
// Le serveur fixe l'échéance d'une facture à la création, d'après le délai de
// paiement du client (`FactureService.calculateDueDate`) : la page ne fait que
// l'annoncer, elle ne la choisit pas.

const TERM_DAYS: Record<string, number> = {
  immediat: 0,
  net_30: 30,
  net_60: 60,
  net_90: 90,
};

/** Nombre de jours d'un délai de paiement (`immediat`, `net_30`…) ; inconnu → 0. */
export function paymentTermDays(delai: string | null | undefined): number {
  return TERM_DAYS[(delai || 'immediat').toLowerCase()] ?? 0;
}

/** Échéance annoncée : « À réception » ou « 22 nov. 2026 (30 jours) ». */
export function describeDueDate(delai: string | null | undefined, today: Date = new Date()): string {
  const days = paymentTermDays(delai);
  if (days === 0) return 'À réception';
  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return `${formatDate(due)} (${days} jours)`;
}
