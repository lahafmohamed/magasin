/**
 * Return a usable sales price, or null when the catalogue price must be fixed
 * before the product can be selected for a sales document.
 */
export function getValidSalePrice(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Raison pour laquelle un produit ne peut pas entrer sur un document de vente
 * (prix catalogue absent ou nul), sinon `null`.
 */
export function saleDisabledReason(product: { prix_vente: unknown }): string | null {
  return getValidSalePrice(product.prix_vente) === null
    ? 'Prix de vente non renseigné : corrigez la fiche produit.'
    : null;
}

/** Nombre fini, sinon 0 — une saisie en cours (`NaN`) ne fausse pas les totaux. */
function finite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Prix unitaire net après une remise en pourcentage (bornée à 0–100 %),
 * arrondi au centime comme la colonne `NUMERIC(15,2)` qui le stocke.
 */
export function netUnitPrice(prixUnitaire: number, remisePct = 0): number {
  const remise = Math.min(100, Math.max(0, finite(remisePct)));
  return Math.round(finite(prixUnitaire) * (1 - remise / 100) * 100) / 100;
}

export interface SalesLineAmounts {
  quantite: number;
  prix_unitaire: number;
  /** Remise en % (facture) ; absente = 0. */
  remise_pct?: number;
  /** Prix de revient unitaire ; absent = 0 (marge non calculable). */
  prix_revient?: number;
}

export interface SalesTotals {
  /** Σ quantité × prix catalogue saisi, avant remise. */
  gross: number;
  /** Montant des remises (≥ 0). */
  discount: number;
  /** Total du document : Σ quantité × prix net. */
  total: number;
  /** Σ quantité × prix de revient. */
  cost: number;
  /** Total − coût. */
  margin: number;
  /** Marge / total × 100 ; `null` tant que le total est nul. */
  marginPct: number | null;
  units: number;
  lines: number;
}

/** Totaux d'un document de vente, calculés comme le serveur (sans TVA). */
export function computeSalesTotals(lines: ReadonlyArray<SalesLineAmounts>): SalesTotals {
  let gross = 0;
  let total = 0;
  let cost = 0;
  let units = 0;
  for (const line of lines) {
    const qty = finite(line.quantite);
    const price = finite(line.prix_unitaire);
    gross += qty * price;
    total += qty * netUnitPrice(price, line.remise_pct ?? 0);
    cost += qty * finite(line.prix_revient);
    units += qty;
  }
  const margin = total - cost;
  return {
    gross,
    discount: Math.max(0, gross - total),
    total,
    cost,
    margin,
    marginPct: total > 0 ? (margin / total) * 100 : null,
    units,
    lines: lines.length,
  };
}

/** Vrai quand le prix net d'une ligne passe sous son prix de revient connu. */
export function isBelowCost(line: SalesLineAmounts): boolean {
  const cost = finite(line.prix_revient);
  return cost > 0 && netUnitPrice(line.prix_unitaire, line.remise_pct ?? 0) < cost;
}
