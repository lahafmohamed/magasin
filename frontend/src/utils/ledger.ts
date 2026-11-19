import { toNumber } from '@/utils/format';

export interface LedgerSource {
  source_type?: string | null;
  source_id?: number | null;
}

export function ledgerSourceHref(entry: LedgerSource): string | null {
  if (entry.source_type === 'facture' && entry.source_id) {
    return `/factures/${entry.source_id}`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Relevé de compte d'un contact (`GET /tiers/:id/compte`)             */
/* ------------------------------------------------------------------ */

/** Mouvement du relevé de compte d'un contact. */
export interface TiersMovementSource {
  type: string;
  document_id?: number | null;
}

/**
 * Libellé de chaque type de mouvement — en toutes lettres (plus de « Facture
 * fourn. ») et sans couleur : le type est une information, pas un statut.
 */
export const TIERS_MOVEMENT_LABELS: Readonly<Record<string, string>> = {
  facture_client: 'Facture',
  paiement_client: 'Paiement',
  avoir_client: 'Avoir',
  acompte_client: 'Acompte reçu',
  compensation_client: 'Compensation',
  facture_fourn: 'Facture fournisseur',
  paiement_fourn: 'Paiement fournisseur',
  acompte_fourn: 'Acompte versé',
  compensation_fourn: 'Compensation',
};

/** Libellé d'un type de mouvement ; type inconnu → texte lisible, jamais le code brut. */
export function tiersMovementLabel(type: string | null | undefined): string {
  if (!type) return 'Mouvement';
  const known = TIERS_MOVEMENT_LABELS[type];
  if (known) return known;
  const readable = type.replace(/_/g, ' ').trim();
  return readable ? readable.charAt(0).toLocaleUpperCase('fr-FR') + readable.slice(1) : 'Mouvement';
}

/** Verbe + article de chaque pièce, pour le nom d'un lien : « Ouvrir la facture », « Ouvrir l’avoir ». */
const OPEN_LABELS: Readonly<Record<string, string>> = {
  facture_client: 'Ouvrir la facture',
  paiement_client: 'Ouvrir le paiement',
  avoir_client: 'Ouvrir l’avoir',
  acompte_client: 'Ouvrir l’acompte',
  compensation_client: 'Ouvrir la compensation',
  facture_fourn: 'Ouvrir la facture fournisseur',
  paiement_fourn: 'Ouvrir le paiement fournisseur',
  acompte_fourn: 'Ouvrir l’acompte',
  compensation_fourn: 'Ouvrir la compensation',
};

/**
 * Nom accessible du lien vers la pièce d'un mouvement, avec son article
 * (CPG-N3) : « Ouvrir la facture FAC-2026-00113 », « Ouvrir l’avoir AVOIR-… ».
 */
export function tiersMovementOpenLabel(type: string | null | undefined, ref: string): string {
  return `${OPEN_LABELS[type ?? ''] ?? 'Ouvrir la pièce'} ${ref}`;
}

/**
 * Lien vers la pièce d'un mouvement. Seules la facture et l'avoir client ont
 * une fiche ; une facture fournisseur n'en a pas (la liste ne se filtre pas par
 * l'adresse) : pas de lien plutôt qu'un lien qui n'ouvre pas la pièce.
 */
export function tiersMovementHref(movement: TiersMovementSource): string | null {
  if (!movement.document_id) return null;
  switch (movement.type) {
    case 'facture_client':
      return `/factures/${movement.document_id}`;
    case 'avoir_client':
      return `/avoirs/${movement.document_id}`;
    default:
      return null;
  }
}

/** Point de vue d'un solde : compte client, compte fournisseur ou solde net (client − fournisseur). */
export type BalanceSide = 'client' | 'fournisseur' | 'net';

export interface BalanceDirection {
  /** Montant à afficher, toujours positif : le sens est porté par `label`. */
  amount: number;
  /** `receivable` : le contact vous doit ; `payable` : vous lui devez. */
  direction: 'receivable' | 'payable' | 'settled';
  /** Le sens en mots (« Il vous doit », « Vous lui devez », « Compte soldé »). */
  label: string;
}

const DIRECTION_LABEL: Record<BalanceDirection['direction'], string> = {
  receivable: 'Il vous doit',
  payable: 'Vous lui devez',
  settled: 'Compte soldé',
};

/**
 * Sens d'un solde, dit en mots. La même créance était rouge dans « Solde
 * client » et verte dans « Solde NET » : la couleur ne dit plus qui doit quoi,
 * le texte le dit.
 *
 * - client : solde > 0 → le client vous doit ; < 0 → vous lui devez (avance) ;
 * - fournisseur : solde > 0 → vous devez au fournisseur ; < 0 → il vous doit ;
 * - net (client − fournisseur) : même lecture que le compte client.
 *
 * Arrondi au franc : un reliquat de centimes compte comme soldé.
 */
export function balanceDirection(solde: number | string | null | undefined, side: BalanceSide): BalanceDirection {
  const value = Math.round(toNumber(solde) ?? 0);
  if (value === 0) return { amount: 0, direction: 'settled', label: DIRECTION_LABEL.settled };
  const owedToYou = side === 'fournisseur' ? value < 0 : value > 0;
  const direction = owedToYou ? 'receivable' : 'payable';
  return { amount: Math.abs(value), direction, label: DIRECTION_LABEL[direction] };
}
