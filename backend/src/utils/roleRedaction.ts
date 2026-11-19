/**
 * E2 (décision du 2026-10-24) — le personnel de dépôt voit des quantités, pas
 * de l'argent : aucun montant, coût, prix de vente, valeur de commande ni
 * information client sur les écrans de réception, de stock et de transfert.
 * Les réponses de l'API retirent ces champs pour ces rôles ; l'interface
 * cache les zones correspondantes (le serveur reste la garantie).
 */
const QUANTITY_ONLY_ROLES = new Set(['depot_staff']);

/** True when the role may see amounts, costs and prices. */
export function seesAmounts(role?: string | null): boolean {
  return !QUANTITY_ONLY_ROLES.has(role ?? '');
}

/** Money fields of products and stock rows. */
export const PRODUCT_MONEY_KEYS = [
  'prix_achat', 'prix_vente', 'cmp', 'valeur_stock',
  'valeur_achat', 'valeur_vente', 'marge_potentielle',
] as const;

/**
 * Money fields of purchase orders, receptions and their lines. Never a bare
 * `total`: list envelopes use it for the row count — redact `data`, not the
 * envelope.
 */
export const PURCHASE_MONEY_KEYS = [
  'sous_total', 'tva', 'total_ht', 'total_ttc',
  'prix_unitaire', 'total_ligne', 'cout_unitaire', 'valeur_totale',
  'prix_commande', 'prix_facture', 'ecart_prix', 'ecart_prix_pct',
  ...PRODUCT_MONEY_KEYS,
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Copy of `value` without the given keys, at any depth (plain objects and
 * arrays only; dates and other instances are kept as they are).
 */
export function omitKeysDeep<T>(value: T, keys: readonly string[]): T {
  const drop = new Set(keys);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isPlainObject(v)) return v;
    const out: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v)) {
      if (!drop.has(k)) out[k] = walk(child);
    }
    return out;
  };
  return walk(value) as T;
}

/** `value` unchanged for roles that see amounts, stripped of `keys` otherwise. */
export function redactForRole<T>(role: string | null | undefined, value: T, keys: readonly string[]): T {
  return seesAmounts(role) ? value : omitKeysDeep(value, keys);
}
