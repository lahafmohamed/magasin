import type { TagHue } from '@/components/ui/tag';

/**
 * Modes de paiement acceptés par le serveur — miroir de backend
 * `utils/paymentMethods.ts` et des contraintes CHECK de paiements /
 * mouvements_caisse / depenses.
 *
 * Tout formulaire construit sa liste à partir d'ici (`PAYMENT_METHOD_OPTIONS`).
 * L'interface gardait quatre copies divergentes : le formulaire de dépense
 * proposait Mobile Money que la base refusait, la saisie de paiement masquait
 * deux modes acceptés.
 *
 * Glossaire : « mode de paiement » (et non « méthode », « moyen »).
 */
export const PAYMENT_METHODS = [
  'espece', 'carte', 'cheque', 'virement',
  'mobile_money', 'orange_money', 'mtn_money', 'wave',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Libellés français (inclut `acompte`, affiché seulement : un paiement issu d'un acompte). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod | 'acompte', string> = {
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

/** Options prêtes pour un `<Select>` ou un groupe de choix, dans l'ordre canonique. */
export const PAYMENT_METHOD_OPTIONS: ReadonlyArray<{ value: PaymentMethod; label: string }> =
  PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

/**
 * Teinte catégorielle (`<Tag hue>`) de chaque mode — distingue les modes entre
 * eux, sans valeur de statut. Une teinte par mode : Chèque et Orange Money, puis
 * Virement et Acompte, partageaient la leur et se fondaient en un seul segment
 * dans la barre des encaissements. Un acompte n'est pas un mode : pas de
 * teinte (texte seul, graphite dans un graphique).
 */
export const PAYMENT_METHOD_HUES: Record<PaymentMethod, TagHue> = {
  espece: 7,
  carte: 1,
  cheque: 4,
  virement: 5,
  mobile_money: 2,
  orange_money: 6,
  mtn_money: 8,
  wave: 3,
};

export function paymentMethodHue(method?: string | null): TagHue | undefined {
  return method ? PAYMENT_METHOD_HUES[method as PaymentMethod] : undefined;
}

/** Compléments de phrase — miroir de `PAYMENT_METHOD_PHRASES` côté serveur. */
const PAYMENT_METHOD_PHRASES: Record<PaymentMethod, string> = {
  espece: 'en espèces',
  carte: 'par carte',
  cheque: 'par chèque',
  virement: 'par virement',
  mobile_money: 'par Mobile Money',
  orange_money: 'par Orange Money',
  mtn_money: 'par MTN Money',
  wave: 'par Wave',
};

/** « remboursé en espèces », « payé par virement » ; code inconnu → « par un autre mode de paiement ». */
export function paymentMethodPhrase(method?: string | null): string {
  return PAYMENT_METHOD_PHRASES[method as PaymentMethod] ?? 'par un autre mode de paiement';
}

/** Libellé d'un mode de paiement ; code inconnu → texte lisible, jamais le code brut. */
export function formatPaymentMethod(method?: string | null): string {
  if (!method) return 'Non renseigné';
  const known = PAYMENT_METHOD_LABELS[method as PaymentMethod | 'acompte'];
  if (known) return known;

  const readable = method.replace(/_/g, ' ').trim();
  return readable ? readable.charAt(0).toLocaleUpperCase('fr-FR') + readable.slice(1) : 'Non renseigné';
}
