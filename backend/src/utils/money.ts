/**
 * Montant lisible pour un message destiné à l'utilisateur : « 70 000 FCFA ».
 *
 * Même règle que le `formatCurrency` du frontend : espace insécable (U+00A0)
 * entre les groupes et avant « FCFA », pour qu'un montant ne soit jamais coupé
 * en fin de ligne dans un toast. `toLocaleString('fr-FR')` produit une espace
 * fine insécable (U+202F) sur les ICU récents : on la normalise.
 *
 * Pour les PDF (polices WinAnsi sans U+00A0/U+202F), utiliser
 * `formatNombrePdf` de PDFService, pas cette fonction.
 */
const SEPARATEURS = /[    ]/g;

export function formatMontantFcfa(value: unknown): string {
  const n = Number(value ?? 0);
  const arrondi = Number.isFinite(n) ? Math.round(n) : 0;
  const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(arrondi)
    .replace(SEPARATEURS, ' ');
  return `${nombre} FCFA`;
}
