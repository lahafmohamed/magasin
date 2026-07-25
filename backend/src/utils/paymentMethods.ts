/**
 * Canonical payment-method list — mirrors the `paiements.methode_paiement`
 * CHECK constraint. Lives in utils rather than a service so any layer can
 * import it without creating a service-to-service cycle.
 */
export const PAYMENT_METHODS = [
  'espece', 'carte', 'cheque', 'virement',
  'mobile_money', 'orange_money', 'mtn_money', 'wave',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * Coerce an advance's payment method into one `paiements` accepts.
 *
 * `acomptes_clients.methode_paiement` allows 'compensation', which the
 * `paiements` CHECK does not — applying such an advance has to record the
 * settlement under a method the payments table recognises. 'virement' is the
 * closest non-cash equivalent, and it also sidesteps
 * `chk_paiement_espece_session` (cash payments require an open register).
 */
export function toPaiementMethod(value: unknown): PaymentMethod {
  return isPaymentMethod(value) ? value : 'virement';
}
