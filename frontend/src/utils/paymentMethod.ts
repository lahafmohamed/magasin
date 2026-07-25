/**
 * Payment methods the server accepts — mirrors backend `utils/paymentMethods.ts`
 * and the CHECK constraints on paiements / mouvements_caisse / depenses.
 *
 * Anything a form offers must come from this list. The UI used to keep four
 * independent copies with different members, so the expense form offered
 * Mobile Money the database rejected while the payment dialog hid two methods
 * the server accepted.
 */
export const PAYMENT_METHODS = [
  'espece', 'carte', 'cheque', 'virement',
  'mobile_money', 'orange_money', 'mtn_money', 'wave',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  espece: 'Espèces',
  carte: 'Carte',
  cheque: 'Chèque',
  virement: 'Virement',
  acompte: 'Acompte',
  wave: 'Wave',
  orange_money: 'Orange Money',
  mtn_money: 'MTN Money',
  mobile_money: 'Mobile Money',
};

export function formatPaymentMethod(method?: string | null): string {
  if (!method) return 'Non renseignée';
  if (PAYMENT_METHOD_LABELS[method]) return PAYMENT_METHOD_LABELS[method];

  const readable = method.replace(/_/g, ' ').trim();
  return readable ? readable.charAt(0).toLocaleUpperCase('fr-FR') + readable.slice(1) : 'Non renseignée';
}
