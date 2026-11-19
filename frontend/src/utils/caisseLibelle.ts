import { paymentMethodPhrase } from './paymentMethod';

/**
 * CPG2-03 — libellés de dépense écrits par le serveur avant le 2026-10-24
 * (« Dépense DEP-2026-00009 - Repas », « Annulation caisse - dépense DEP-…
 * passée en orange_money »), relus dans la forme qu'il écrit désormais :
 * tiret cadratin comme le reste de la caisse, mode de paiement en mots.
 *
 * Un mouvement de caisse ne se réécrit pas (journal en ajout seul) : c'est
 * l'affichage qui remet les anciennes lignes au propre. Les plus précis
 * d'abord : « Dépense X - Y » attrape tout le reste.
 */
const ANCIENS_LIBELLES: ReadonlyArray<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^Correction dépense (\S+) - ancien montant$/, (m) => `Correction de la dépense ${m[1]} — ancien montant`],
  [/^Dépense (\S+) - montant corrigé$/, (m) => `Dépense ${m[1]} — montant corrigé`],
  [/^Dépense (\S+) - mode de paiement changé en espèces$/, (m) => `Dépense ${m[1]} désormais payée en espèces`],
  [
    /^Annulation caisse - dépense (\S+) passée en (\S+)$/,
    (m) => `Dépense ${m[1]} désormais payée ${paymentMethodPhrase(m[2])} : sortie de caisse annulée`,
  ],
  [/^Annulation dépense (\S+)$/, (m) => `Annulation de la dépense ${m[1]}`],
  [/^Dépense (\S+) - (.+)$/, (m) => `Dépense ${m[1]} — ${m[2]}`],
];

/** Libellé d'un mouvement de caisse tel qu'il s'affiche ; un libellé actuel est rendu tel quel. */
export function libelleMouvementLisible(libelle: string | null | undefined): string | null {
  const texte = libelle?.trim();
  if (!texte) return null;
  for (const [motif, reecrire] of ANCIENS_LIBELLES) {
    const m = motif.exec(texte);
    if (m) return reecrire(m);
  }
  return texte;
}
