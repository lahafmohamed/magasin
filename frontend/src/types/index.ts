export interface Produit {
  id: number;
  reference: string;
  nom: string;
  code_barre: string | null;
  description: string | null;
  categorie: string | null;
  prix_achat: number;
  prix_vente: number;
  stock: number;
  stock_min: number;
}

export interface Tiers {
  id: number;
  code: string;
  raison_sociale: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  nif: string | null;
  rccm: string | null;
  est_client: boolean;
  est_fournisseur: boolean;
  credit_max: number;
  delai_paiement: string | null;
  delai_livraison: number;
  notes: string | null;
  solde_client_actuel: number;
  acompte_client_disponible: number;
  solde_fournisseur_actuel: number;
  solde_client_live?: number;
  solde_fournisseur_live?: number;
  solde_net?: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Legacy alias — existing pages still reference Client
export type Client = Tiers & { nom: string };

export interface FactureLigne {
  id: number;
  facture_id: number;
  produit_id: number;
  produit_nom: string;
  produit_reference: string;
  quantite: number;
  prix_unitaire: number;
  total_ligne: number;
}

export interface Facture {
  id: number;
  numero_facture: string;
  /** Colonne réelle en base (`factures.tiers_id`). */
  tiers_id?: number;
  /** Alias hérité : absent de la plupart des projections — préférer `tiers_id`. */
  client_id?: number;
  client_nom: string;
  client_prenom: string | null;
  date_facture: string;
  sous_total: number;
  tva: number;
  total: number;
  montant_paye?: number;
  remaining_due?: number;
  statut: 'payee' | 'partielle' | 'en_attente' | 'annulee';
  notes: string | null;
}

export interface Paiement {
  id: number;
  facture_id: number;
  montant: number;
  methode_paiement: 'espece' | 'carte' | 'cheque' | 'virement' | 'mobile_money' | 'orange_money' | 'mtn_money' | 'wave';
  date_paiement: string;
  reference: string | null;
  notes: string | null;
  source?: 'direct' | 'acompte_application' | 'reversal';
  mouvement_caisse_id?: number | null;
  session_caisse_id?: number | null;
  /** Faux quand le serveur refuserait la suppression (acompte, caisse ou période clôturée). */
  supprimable?: boolean;
  suppression_bloquee?: string | null;
}

/**
 * E1-R1 : argent d'un paiement qui règle une autre facture que celle où il a
 * été enregistré (données ré-imputées, facture annulée). Vu depuis une page de
 * facture : l'autre facture, le montant et le paiement d'origine.
 */
export interface PaiementReport {
  facture_id: number;
  numero_facture: string;
  montant: number | string;
  paiement_id: number;
  methode_paiement: string;
  date_paiement: string;
}

export interface FactureComplete extends Facture {
  lignes?: FactureLigne[];
  paiements?: Paiement[];
  /** Paiements de cette facture qui règlent d'autres factures (elle était déjà soldée ou est annulée). */
  excedent_reporte?: PaiementReport[];
  /** Argent reçu des paiements d'autres factures. */
  recu_par_report?: PaiementReport[];
  /** Part des paiements de cette facture qui ne règle aucune facture. */
  excedent_non_affecte?: number | string;
  origine?: {
    devis_id?: number;
    numero_devis?: string;
    bl_id?: number;
    numero_bl?: string;
    avoir_id?: number;
    numero_avoir?: string;
  } | null;
}

export interface Avoir {
  id: number;
  numero_avoir: string;
  client_id: number;
  client_nom: string;
  client_prenom: string | null;
  date_avoir: string;
  total: number;
  statut: 'brouillon' | 'valide' | 'utilise' | 'annule';
  notes: string | null;
  avoir_type: string | null;
  facture_origine_id?: number;
  facture_origine_numero?: string;
  retour_id?: number;
  numero_retour?: string;
}

export interface AvoirLigne {
  id: number;
  document_id: number;
  produit_id: number | null;
  produit_nom: string | null;
  produit_reference: string | null;
  description: string | null;
  quantite: number;
  prix_unitaire: number;
  total_ligne: number;
}

export interface AvoirComplete extends Avoir {
  lignes?: AvoirLigne[];
}

export interface StatsDashboard {
  total_factures: { count: number; montant: number };
  factures_mois: { count: number; montant: number };
  alertes_stock: number;
}

import { Banknote, CreditCard, ScrollText, Landmark, HandCoins, Wallet, Smartphone, type LucideIcon } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../utils/paymentMethod';

/**
 * Display metadata for every method a payment row can carry.
 *
 * Covers all eight selectable methods plus `acompte`, which is display-only:
 * it labels a payment sourced from an advance application and is not something
 * a user can pick. Build selectable option lists from `PAYMENT_METHOD_OPTIONS`
 * in utils/paymentMethod, not from this map's keys.
 *
 * Libellés repris de `PAYMENT_METHOD_LABELS` (source unique). Couleur : un mode
 * de paiement se distingue par son libellé et son icône ; en étiquette, `<Tag
 * hue={paymentMethodHue(m)}>`. Pas d'icône « $ » pour un produit en FCFA
 * (acompte : HandCoins, plus CircleDollarSign).
 */
export const METHODES_PAIEMENT: Record<
  PaymentMethod | 'acompte',
  { label: string; Icon: LucideIcon }
> = {
  espece: { label: PAYMENT_METHOD_LABELS.espece, Icon: Banknote },
  carte: { label: PAYMENT_METHOD_LABELS.carte, Icon: CreditCard },
  cheque: { label: PAYMENT_METHOD_LABELS.cheque, Icon: ScrollText },
  virement: { label: PAYMENT_METHOD_LABELS.virement, Icon: Landmark },
  acompte: { label: PAYMENT_METHOD_LABELS.acompte, Icon: HandCoins },
  mobile_money: { label: PAYMENT_METHOD_LABELS.mobile_money, Icon: Smartphone },
  wave: { label: PAYMENT_METHOD_LABELS.wave, Icon: Smartphone },
  orange_money: { label: PAYMENT_METHOD_LABELS.orange_money, Icon: Smartphone },
  mtn_money: { label: PAYMENT_METHOD_LABELS.mtn_money, Icon: Smartphone },
};

export const FALLBACK_PAIEMENT_ICON: LucideIcon = Wallet;
