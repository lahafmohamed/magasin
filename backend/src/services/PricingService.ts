import { businessError } from '../utils/errors';

export interface PricingLigneInput {
  quantite: number;
  prix_unitaire: number;
  remise_pct?: number;
  remise_montant?: number;
}

export interface PricingTotals {
  sousTotal: number;
  remiseGlobale: number;
  remiseGlobalePct: number;
  total: number;
  totalLignes: number[];
}

export interface SalePriceLine {
  prix_unitaire: number | string;
}

/**
 * A normal sales document must never contain a free or invalid line. Products
 * with a missing catalogue price must be corrected before they can be sold.
 */
export function assertPositiveSalePrices(lignes: SalePriceLine[]): void {
  for (let index = 0; index < lignes.length; index += 1) {
    const price = Number(lignes[index].prix_unitaire);
    if (!Number.isFinite(price) || price <= 0) {
      throw businessError(
        422,
        `Ligne ${index + 1}: le prix unitaire doit être supérieur à zéro. Corrigez le prix de vente du produit avant de continuer.`,
        'ZERO_SALE_PRICE'
      );
    }
  }
}

/**
 * Round to the scale money is stored at (NUMERIC(15,2)).
 *
 * Every document total must go through this. Postgres rounds on insert anyway,
 * so a JS accumulator that stays unrounded produces a header rounded once at
 * the end while each line is rounded independently — and the two disagree.
 */
export function roundMoney(value: number): number {
  return parseFloat(value.toFixed(2));
}

/**
 * Per-line totals plus their sum, both at storage scale.
 *
 * Shared by sales and purchase documents. Unlike `calculateTotals` this does
 * NOT assert a positive unit price: a supplier line may legitimately be free
 * (warranty replacement, goodwill), while a sales line may not.
 *
 * Callers must persist the returned `totalLignes` rather than recomputing
 * `quantite * prix_unitaire` at insert time, or the stored lines drift from
 * the stored header.
 */
export function computeLineTotals(
  lignes: PricingLigneInput[]
): { totalLignes: number[]; sousTotal: number } {
  let sousTotal = 0;
  const totalLignes: number[] = [];

  for (const ligne of lignes) {
    let ligneTotal = ligne.quantite * ligne.prix_unitaire;

    // Apply per-line discount if provided
    if (ligne.remise_pct && ligne.remise_pct > 0) {
      ligneTotal -= ligneTotal * (ligne.remise_pct / 100);
    }
    if (ligne.remise_montant && ligne.remise_montant > 0) {
      ligneTotal -= ligne.remise_montant;
    }

    // Ensure non-negative per line, rounded so stored line totals match reported sums
    ligneTotal = roundMoney(Math.max(0, ligneTotal));
    totalLignes.push(ligneTotal);
    sousTotal += ligneTotal;
  }

  return { totalLignes, sousTotal: roundMoney(sousTotal) };
}

/**
 * Calculate totals for a sales document (facture, devis, BL, avoir).
 *
 * @param lignes   Line items with quantite and prix_unitaire
 * @param remise_globale    Optional global discount amount
 * @param remise_globale_pct Optional global discount percentage
 * @returns PricingTotals with sousTotal, remise, and total
 */
export function calculateTotals(
  lignes: PricingLigneInput[],
  remise_globale?: number,
  remise_globale_pct?: number
): PricingTotals {
  assertPositiveSalePrices(lignes);

  const { totalLignes, sousTotal } = computeLineTotals(lignes);

  // Apply global discount
  let remiseGlobalePct = remise_globale_pct || 0;
  let remiseGlobale = remise_globale || 0;

  if (remiseGlobalePct > 0) {
    remiseGlobale = sousTotal * (remiseGlobalePct / 100);
  }

  remiseGlobale = Math.min(remiseGlobale, sousTotal); // Cap at sousTotal
  const total = Math.max(0, sousTotal - remiseGlobale);

  return {
    sousTotal: roundMoney(sousTotal),
    remiseGlobale: roundMoney(remiseGlobale),
    remiseGlobalePct: roundMoney(remiseGlobalePct),
    total: roundMoney(total),
    totalLignes,
  };
}
