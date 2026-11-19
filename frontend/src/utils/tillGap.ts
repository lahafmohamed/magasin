/**
 * Écart de caisse (espèces comptées − espèces attendues) : nul → conforme ;
 * moins de 5 000 FCFA → à surveiller ; au-delà → à expliquer. Une seule règle
 * pour le dialogue de clôture (CaisseV2) et l'historique des caisses.
 */
export const TILL_GAP_ALERT_THRESHOLD = 5000;

export type TillGapTone = 'ok' | 'warning' | 'danger';

/** Ton d'un écart, arrondi au franc (un écart de 0,4 FCFA est conforme). */
export function tillGapTone(ecart: number): TillGapTone {
  const rounded = Math.round(ecart);
  if (rounded === 0) return 'ok';
  return Math.abs(rounded) < TILL_GAP_ALERT_THRESHOLD ? 'warning' : 'danger';
}

/** Couleur du montant d'écart dans un texte ou une cellule — un écart nul reste neutre. */
export const TILL_GAP_TEXT_CLASS: Record<TillGapTone, string> = {
  ok: 'text-muted-foreground',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
};
