/** Tranche d'ancienneté de la balance âgée (`GET /reports/receivables?bucket=`). */
export type ReceivableBucket = 'all' | 'moins_30_jours' | 'entre_30_60_jours' | 'plus_60_jours';

/** Libellés des tranches (glossaire n° 34 : « Moins de 30 jours / 30 à 60 jours / Plus de 60 jours »). */
export const RECEIVABLE_BUCKETS: ReadonlyArray<{ value: ReceivableBucket; label: string }> = [
  { value: 'all', label: 'Toutes les créances' },
  { value: 'moins_30_jours', label: 'Moins de 30 jours' },
  { value: 'entre_30_60_jours', label: '30 à 60 jours' },
  { value: 'plus_60_jours', label: 'Plus de 60 jours' },
];

/** Une ligne de la balance âgée : ce qu'un client doit, par ancienneté. */
export interface ReceivableRow {
  client_id: number;
  nom: string;
  prenom?: string | null;
  telephone?: string | null;
  email?: string | null;
  /** Date de la plus ancienne facture impayée (critère de relance). */
  plus_ancienne_facture?: string | null;
  total_du: number | string;
  moins_30_jours: number | string;
  entre_30_60_jours: number | string;
  plus_60_jours: number | string;
}

/** Jours écoulés depuis une date (facture impayée la plus ancienne) ; `null` si la date manque. */
export function daysSince(date: string | null | undefined, now: number = Date.now()): number | null {
  if (!date) return null;
  const debut = new Date(date);
  if (Number.isNaN(debut.getTime())) return null;
  return Math.max(0, Math.floor((now - debut.getTime()) / 86_400_000));
}
