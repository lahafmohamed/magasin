import { z } from 'zod/v4';

// ========== PRODUITS ==========
export const produitSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis').max(200, 'Nom max 200 caractères'),
  reference: z.string().min(1, 'La référence est requise').max(50, 'Référence max 50 caractères'),
  code_barre: z.string().max(100).optional().or(z.literal('')),
  prix_vente: z.number().positive('Le prix de vente doit être positif'),
  prix_achat: z.number().min(0, 'Le prix d\'achat ne peut pas être négatif').optional(),
  description: z.string().max(2000).optional().or(z.literal('')),
  stock_min: z.number().min(0, 'Le stock minimum ne peut pas être négatif').optional(),
  categorie_id: z.number().optional().nullable(),
  fournisseur_id: z.number().optional().nullable(),
});

export type ProduitFormData = z.infer<typeof produitSchema>;

// ========== TIERS (CLIENTS / FOURNISSEURS) ==========
export const tiersSchema = z.object({
  type: z.enum(['client', 'fournisseur', 'client_fournisseur', 'prospect']),
  raison_sociale: z.string().min(1, 'La raison sociale est requise').max(200),
  nom: z.string().max(100).optional().or(z.literal('')),
  prenom: z.string().max(100).optional().or(z.literal('')),
  telephone: z.string().max(50).optional().or(z.literal('')),
  email: z.string().email('Email invalide').max(100).optional().or(z.literal('')),
  adresse: z.string().max(500).optional().or(z.literal('')),
  nif: z.string().max(50).optional().or(z.literal('')),
  rc: z.string().max(50).optional().or(z.literal('')),
  ai: z.string().max(50).optional().or(z.literal('')),
});

export type TiersFormData = z.infer<typeof tiersSchema>;

// ========== FACTURES ==========
export const factureLigneSchema = z.object({
  produit_id: z.number().positive('Produit requis'),
  quantite: z.number().positive('La quantité doit être positive'),
  prix_unitaire: z.number().positive('Le prix unitaire doit être positif'),
  remise: z.number().min(0).max(100).optional(),
});

export const factureSchema = z.object({
  client_id: z.number().positive('Client requis'),
  lignes: z.array(factureLigneSchema).min(1, 'Au moins un produit requis'),
  notes: z.string().max(2000).optional().or(z.literal('')),
  date_echeance: z.string().optional().or(z.literal('')),
});

export type FactureFormData = z.infer<typeof factureSchema>;

// ========== COMMANDES FOURNISSEUR ==========
export const commandeLigneSchema = z.object({
  produit_id: z.number().positive('Produit requis'),
  quantite: z.number().positive('La quantité doit être positive'),
  prix_unitaire: z.number().positive('Le prix unitaire doit être positif'),
});

export const commandeSchema = z.object({
  fournisseur_id: z.number().positive('Fournisseur requis'),
  lignes: z.array(commandeLigneSchema).min(1, 'Au moins un produit requis'),
  notes: z.string().max(2000).optional().or(z.literal('')),
  date_livraison_prevue: z.string().optional().or(z.literal('')),
});

export type CommandeFormData = z.infer<typeof commandeSchema>;

// ========== DEPENSES ==========
export const depenseSchema = z.object({
  categorie_id: z.number().positive('Catégorie requise'),
  montant: z.number().positive('Le montant doit être positif'),
  description: z.string().min(1, 'La description est requise').max(500),
  methode_paiement: z.enum(['espece', 'carte', 'cheque', 'virement', 'mobile_money']),
  date_depense: z.string().optional(),
  beneficiaire_libre: z.string().max(200).optional().or(z.literal('')),
  fournisseur_id: z.number().optional().nullable(),
});

export type DepenseFormData = z.infer<typeof depenseSchema>;

// ========== EMPLOYES ==========
export const employeSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis').max(100),
  prenom: z.string().min(1, 'Le prénom est requis').max(100),
  email: z.string().email('Email invalide').max(100),
  telephone: z.string().max(50).optional().or(z.literal('')),
  role: z.string().min(1, 'Le rôle est requis'),
  date_embauche: z.string().optional().or(z.literal('')),
});

export type EmployeFormData = z.infer<typeof employeSchema>;

// ========== RECEPTION ==========
export const receptionSchema = z.object({
  commande_id: z.number().positive('Commande requise'),
  lignes: z.array(z.object({
    produit_id: z.number().positive(),
    quantite_commandee: z.number().positive(),
    quantite_recue: z.number().positive('La quantité reçue doit être positive'),
    cout_unitaire: z.number().positive('Le coût unitaire doit être positif'),
  })).min(1, 'Au moins un produit requis'),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export type ReceptionFormData = z.infer<typeof receptionSchema>;

// ========== PAIEMENT ==========
export const paiementSchema = z.object({
  facture_id: z.number().positive('Facture requise'),
  montant: z.number().positive('Le montant doit être positif'),
  methode: z.enum(['espece', 'carte', 'cheque', 'virement', 'mobile_money', 'avoir', 'compensation']),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export type PaiementFormData = z.infer<typeof paiementSchema>;
