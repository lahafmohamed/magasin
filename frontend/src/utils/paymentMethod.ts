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
