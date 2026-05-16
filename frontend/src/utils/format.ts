/**
 * Normalize search input: strip accents, collapse whitespace, lowercase.
 * Lets users type "cafe" and find "café", or "produit" and find "Produit".
 */
export function normalizeSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format a number as XOF (FCFA) currency.
 */
export function formatXOF(montant: number | string | undefined): string {
  const value = typeof montant === 'string' ? parseFloat(montant) : (montant ?? 0);
  if (isNaN(value)) return '0.00 XOF';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(value);
}

/**
 * Format a date string to French locale.
 */
export function formatDate(date: string | Date | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a short date (numeric).
 */
export function formatDateShort(date: string | Date | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('fr-FR');
}
