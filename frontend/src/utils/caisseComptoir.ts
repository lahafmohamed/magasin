/** Billets et pièces courants (XOF) pour les montants reçus proposés. */
const COUPURES = [500, 1000, 2000, 5000, 10000];

/** Montants reçus proposés : le compte juste puis les coupures supérieures. */
export function montantsProposes(total: number): number[] {
  if (!(total > 0)) return [];
  const propositions = new Set<number>([Math.ceil(total)]);
  for (const c of COUPURES) {
    const arrondi = Math.ceil(total / c) * c;
    if (arrondi > total) propositions.add(arrondi);
    if (propositions.size >= 4) break;
  }
  return [...propositions].sort((a, b) => a - b).slice(0, 4);
}
