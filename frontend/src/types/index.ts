export interface Produit {
  id: number;
  reference: string;
  nom: string;
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
  client_id: number;
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
}

export interface FactureComplete extends Facture {
  lignes?: FactureLigne[];
  paiements?: Paiement[];
  origine?: {
    devis_id?: number;
    numero_devis?: string;
    bl_id?: number;
    numero_bl?: string;
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

export const METHODES_PAIEMENT = {
  espece: { label: 'Espèces', color: 'bg-green-500', icon: '💵' },
  carte: { label: 'Carte', color: 'bg-blue-500', icon: '💳' },
  cheque: { label: 'Chèque', color: 'bg-yellow-500', icon: '📝' },
  virement: { label: 'Virement', color: 'bg-purple-500', icon: '🏦' },
  acompte: { label: 'Acompte', color: 'bg-orange-500', icon: '🔶' },
} as const;
