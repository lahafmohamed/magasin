export type ReceivableBucket = 'all' | 'moins_30_jours' | 'entre_30_60_jours' | 'plus_60_jours';

export interface ReceivableRow {
  client_id: number;
  nom: string;
  prenom?: string | null;
  total_du: number | string;
  moins_30_jours: number | string;
  entre_30_60_jours: number | string;
  plus_60_jours: number | string;
}
