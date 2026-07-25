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
