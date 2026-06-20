import { z } from 'zod';

// ============================================
// Common schemas
// ============================================
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortQuerySchema = z.object({
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc', 'ASC', 'DESC']).default('asc'),
});

// ============================================
// Auth schemas
// ============================================
export const loginSchema = z.object({
  username: z.string().min(1, 'Username requis'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const registerSchema = z.object({
  username: z.string().min(3, 'Username doit avoir au moins 3 caractères').max(100),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  password: z.string().min(6, 'Mot de passe doit avoir au moins 6 caractères'),
  nom_complet: z.string().max(255).optional().or(z.literal('')),
  role: z.enum(['admin', 'manager', 'caissier']).default('caissier'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().min(6, 'Nouveau mot de passe doit avoir au moins 6 caractères'),
});

// ============================================
// Produit schemas
// ============================================
export const createProduitSchema = z.object({
  reference: z.string().min(1, 'Référence requise').max(50),
  nom: z.string().min(1, 'Nom requis').max(255),
  description: z.string().max(1000).optional().or(z.literal('')),
  categorie: z.string().max(100).optional().or(z.literal('')),
  prix_achat: z.coerce.number().nonnegative('Prix d\'achat doit être positif'),
  prix_vente: z.coerce.number().nonnegative('Prix de vente doit être positif'),
  stock: z.coerce.number().int().nonnegative('Stock doit être positif').default(0),
  stock_min: z.coerce.number().int().nonnegative('Stock minimum doit être positif').default(5),
  location_id: z.coerce.number().int().positive('Location ID invalide').optional(),
  initial_stock: z.coerce.number().int().nonnegative('Stock initial doit être positif').optional(),
}).superRefine((data, ctx) => {
  if (data.location_id !== undefined && data.initial_stock === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['initial_stock'],
      message: 'Stock initial requis quand un depot est selectionne',
    });
  }
});

export const updateProduitSchema = z.object({
  reference: z.string().min(1).max(50).optional(),
  nom: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().or(z.literal('')).optional(),
  categorie: z.string().max(100).optional().or(z.literal('')).optional(),
  prix_achat: z.coerce.number().nonnegative().optional(),
  prix_vente: z.coerce.number().nonnegative().optional(),
  stock_min: z.coerce.number().int().nonnegative().optional(),
  // stock intentionally omitted: use PATCH /:id/stock to adjust stock levels
});

export const adjustStockSchema = z.object({
  quantite: z.coerce.number().int().refine(val => val !== 0, 'La quantité ne peut pas être zéro'),
  location_id: z.coerce.number().int().positive('Location ID invalide').optional(),
});

export const stockMovementSchema = z.object({
  type_mouvement: z.enum(['vente', 'ajustement', 'retour', 'commande', 'perte', 'autre']),
  quantite: z.coerce.number().int().refine(val => val !== 0, 'La quantité ne peut pas être zéro'),
  location_id: z.coerce.number().int().positive('Location ID invalide').optional(),
  raison: z.string().max(500).optional().or(z.literal('')),
  reference_liee: z.string().max(50).optional().or(z.literal('')),
});

// ============================================
// Tiers schemas (unified clients + fournisseurs)
// ============================================
export const createTiersSchema = z.object({
  raison_sociale: z.string().min(1, 'Raison sociale requise').max(255),
  prenom: z.string().max(100).optional().or(z.literal('')),
  telephone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('Email invalide').max(255).optional().or(z.literal('')),
  adresse: z.string().max(1000).optional().or(z.literal('')),
  nif: z.string().max(50).optional().or(z.literal('')),
  rccm: z.string().max(50).optional().or(z.literal('')),
  est_client: z.boolean(),
  est_fournisseur: z.boolean(),
  credit_max: z.coerce.number().nonnegative().max(15000000, 'Le plafond maximum est de 15 000 000 FCFA').optional(),
  delai_paiement: z.string().max(50).optional().or(z.literal('')),
  delai_livraison: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
}).refine(d => d.est_client || d.est_fournisseur, {
  message: 'Un tiers doit avoir au moins un rôle (est_client ou est_fournisseur)',
});

export const updateTiersSchema = z.object({
  raison_sociale: z.string().min(1).max(255).optional(),
  prenom: z.string().max(100).optional().or(z.literal('')),
  telephone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('Email invalide').max(255).optional().or(z.literal('')),
  adresse: z.string().max(1000).optional().or(z.literal('')),
  nif: z.string().max(50).optional().or(z.literal('')),
  rccm: z.string().max(50).optional().or(z.literal('')),
  est_client: z.boolean().optional(),
  est_fournisseur: z.boolean().optional(),
  credit_max: z.coerce.number().nonnegative().max(15000000, 'Le plafond maximum est de 15 000 000 FCFA').optional(),
  delai_paiement: z.string().max(50).optional().or(z.literal('')),
  delai_livraison: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const createCompensationSchema = z.object({
  date_compensation: z.string().min(1, 'Date requise'),
  montant: z.coerce.number().positive('Montant doit être positif'),
  factures_client_ids: z.array(z.number().int().positive()).optional(),
  factures_fournisseur_ids: z.array(z.number().int().positive()).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

// Legacy aliases kept for backward compat with existing routes during transition
export const createClientSchema = z.object({
  nom: z.string().min(1, 'Nom requis').max(100),
  prenom: z.string().max(100).optional().or(z.literal('')),
  telephone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('Email invalide').max(255).optional().or(z.literal('')).optional().or(z.null()),
  adresse: z.string().max(1000).optional().or(z.literal('')),
  nif: z.string().max(50).optional().or(z.literal('')),
});

export const updateClientSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  prenom: z.string().max(100).optional().or(z.literal('')).optional(),
  telephone: z.string().max(20).optional().or(z.literal('')).optional(),
  email: z.string().email('Email invalide').max(255).optional().or(z.literal('')).optional().or(z.null()),
  adresse: z.string().max(1000).optional().or(z.literal('')).optional(),
  nif: z.string().max(50).optional().or(z.literal('')).optional(),
});

// ============================================
// Facture schemas
// ============================================
export const factureLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive('ID produit requis'),
  quantite: z.coerce.number().int().positive('Quantité doit être positive'),
  prix_unitaire: z.coerce.number().nonnegative('Prix unitaire doit être positif'),
});

export const createFactureSchema = z.object({
  tiers_id: z.coerce.number().int().positive('Tiers ID requis').optional(),
  client_id: z.coerce.number().int().positive('Client ID requis').optional(),
  location_id: z.coerce.number().int().positive('Location ID invalide').optional(),
  date_facture: z.string().datetime().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  lignes: z.array(factureLigneSchema).min(1, 'Au moins une ligne requise'),
}).superRefine((data, ctx) => {
  if (data.tiers_id === undefined && data.client_id === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tiers_id'],
      message: 'Tiers ID ou Client ID requis',
    });
  }
}).transform((data) => {
  return {
    ...data,
    tiers_id: data.tiers_id ?? data.client_id!,
  };
});

export const updateFactureStatutSchema = z.object({
  statut: z.enum(['payee', 'partielle', 'en_attente', 'annulee']),
});

// ============================================
// Paiement schemas
// ============================================
export const createPaiementSchema = z.object({
  // facture_id is optional here: present in body for the standalone POST /paiements route,
  // or supplied via the URL param on POST /factures/:factureId/paiements
  facture_id: z.coerce.number().int().positive().optional(),
  montant: z.coerce.number().positive('Montant doit être positif'),
  methode_paiement: z.enum([
    'espece', 'carte', 'cheque', 'virement',
    'mobile_money', 'orange_money', 'mtn_money', 'wave',
  ]),
  date_paiement: z.string().optional(),
  reference: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  session_caisse_id: z.coerce.number().int().positive().optional(),
  idempotency_key: z.string().max(255).optional(),
  skip_acompte_application: z.boolean().optional(),
});

// ============================================
// Fournisseur schemas — legacy aliases pointing to tiers schemas
// ============================================
export const createFournisseurSchema = createTiersSchema;
export const updateFournisseurSchema = updateTiersSchema;

// ============================================
// Commande schemas
// ============================================
export const commandeLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive('Produit ID requis'),
  quantite: z.coerce.number().int().positive('Quantité doit être positive'),
  prix_unitaire: z.coerce.number().nonnegative('Prix unitaire doit être positif'),
});

export const createCommandeSchema = z.object({
  tiers_id: z.coerce.number().int().positive('Tiers ID requis'),
  date_commande: z.string().datetime().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  date_livraison_prevue: z.string().optional().or(z.literal('')),
  lignes: z.array(commandeLigneSchema).min(1, 'Au moins une ligne requise'),
});

export const updateCommandeStatutSchema = z.object({
  statut: z.enum(['en_attente', 'validee', 'expediee', 'livree', 'annulee']),
});

// ============================================
// Devis schemas
// ============================================
export const devisLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive('Produit ID requis').optional(),
  description: z.string().max(255).optional().or(z.literal('')),
  quantite: z.coerce.number().int().positive('Quantité doit être positive'),
  prix_unitaire: z.coerce.number().nonnegative('Prix unitaire doit être positif'),
  remise_pct: z.coerce.number().nonnegative().max(100).optional(),
  remise_montant: z.coerce.number().nonnegative().optional(),
});

export const createDevisSchema = z.object({
  tiers_id: z.coerce.number().int().positive('Tiers ID requis'),
  lignes: z.array(devisLigneSchema).min(1, 'Au moins une ligne requise'),
  date_validite: z.string().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  conditions: z.string().max(2000).optional().or(z.literal('')),
  location_id: z.coerce.number().int().positive().optional(),
  remise_globale: z.coerce.number().nonnegative().optional(),
  remise_globale_pct: z.coerce.number().nonnegative().max(100).optional(),
});

export const updateDevisSchema = z.object({
  tiers_id: z.coerce.number().int().positive().optional(),
  lignes: z.array(devisLigneSchema).optional(),
  date_validite: z.string().optional().or(z.literal('')).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')).optional(),
  conditions: z.string().max(2000).optional().or(z.literal('')).optional(),
  location_id: z.coerce.number().int().positive().optional(),
  remise_globale: z.coerce.number().nonnegative().optional(),
  remise_globale_pct: z.coerce.number().nonnegative().max(100).optional(),
});

export const updateDevisStatutSchema = z.object({
  statut: z.enum(['brouillon', 'envoye', 'accepte', 'refuse', 'annule', 'converti']),
});

// ============================================
// Bon de livraison schemas
// ============================================
export const bonLivraisonLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive('Produit ID requis').optional(),
  description: z.string().max(255).optional().or(z.literal('')),
  quantite_commandee: z.coerce.number().int().positive('Quantité commandée doit être positive'),
  quantite_livree: z.coerce.number().int().nonnegative().optional(),
  prix_unitaire: z.coerce.number().nonnegative('Prix unitaire doit être positif'),
});

export const createBonLivraisonSchema = z.object({
  tiers_id: z.coerce.number().int().positive('Tiers ID requis'),
  devis_id: z.coerce.number().int().positive('Devis ID requis'),
  lignes: z.array(bonLivraisonLigneSchema).min(1, 'Au moins une ligne requise'),
  notes: z.string().max(2000).optional().or(z.literal('')),
  adresse_livraison: z.string().max(1000).optional().or(z.literal('')),
  date_livraison_prevue: z.string().optional().or(z.literal('')),
  location_id: z.coerce.number().int().positive().optional(),
});

export const updateBonLivraisonSchema = z.object({
  tiers_id: z.coerce.number().int().positive().optional(),
  lignes: z.array(bonLivraisonLigneSchema).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')).optional(),
  adresse_livraison: z.string().max(1000).optional().or(z.literal('')).optional(),
  date_livraison_prevue: z.string().optional().or(z.literal('')).optional(),
  location_id: z.coerce.number().int().positive().optional(),
});

export const updateBonLivraisonStatutSchema = z.object({
  statut: z.enum(['brouillon', 'valide', 'livre', 'facture', 'annule']),
});

// ============================================
// Avoir (credit note) schemas
// ============================================
export const avoirLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive('Produit ID requis').optional(),
  description: z.string().max(255).optional().or(z.literal('')),
  quantite: z.coerce.number().int().positive('Quantité doit être positive'),
  prix_unitaire: z.coerce.number().nonnegative('Prix unitaire doit être positif'),
});

export const createAvoirFromRetourSchema = z.object({
  retour_id: z.coerce.number().int().positive('Retour ID requis'),
});

export const createAvoirManualSchema = z.object({
  tiers_id: z.coerce.number().int().positive('Tiers ID requis'),
  facture_origine_id: z.coerce.number().int().positive('Facture d\'origine requise'),
  retour_id: z.coerce.number().int().positive().optional(),
  lignes: z.array(avoirLigneSchema).min(1, 'Au moins une ligne requise'),
  avoir_type: z.enum(['retour', 'echange', 'remise_commerciale', 'erreur']).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
  location_id: z.coerce.number().int().positive().optional(),
});

export const updateAvoirStatutSchema = z.object({
  statut: z.enum(['brouillon', 'valide', 'annule', 'utilise']),
});

// ============================================
// Company Settings schema
// ============================================
export const companySettingsSchema = z.object({
  nom: z.string().min(1, 'Nom requis').max(100, 'Nom max 100 caractères').optional(),
  adresse: z.string().max(500).nullable().optional().or(z.literal('')),
  telephone: z.string().max(50).nullable().optional().or(z.literal('')),
  email: z.string().email('Email invalide').max(100).nullable().optional().or(z.literal('')),
  site_web: z.string().max(100).nullable().optional().or(z.literal('')),
  nif: z.string().max(50).nullable().optional().or(z.literal('')),
  rc: z.string().max(50).nullable().optional().or(z.literal('')),
  ai: z.string().max(50).nullable().optional().or(z.literal('')),
  cb: z.string().max(100).nullable().optional().or(z.literal('')),
  devise: z.string().min(1, 'Devise requise').max(10, 'Devise max 10 caractères').optional(),
  logo_url: z.string().max(2 * 1024 * 1024, 'Le logo ne doit pas dépasser 2 Mo').nullable().optional().or(z.literal('')),
  taux_conversion: z.coerce.number().positive('Taux de conversion doit être positif').max(999999).optional(),
});

// ============================================
// Lot / batch tracking schemas (migration 015)
// ============================================
export const createLotSchema = z.object({
  produit_id: z.coerce.number().int().positive('Produit ID requis'),
  numero_lot: z.string().min(1, 'Numéro de lot requis').max(100),
  quantite: z.coerce.number().int().positive('Quantité doit être positive'),
  date_fabrication: z.string().optional().or(z.literal('')),
  date_expiration: z.string().optional().or(z.literal('')),
  prix_achat_unitaire: z.coerce.number().nonnegative().optional(),
  fournisseur_id: z.coerce.number().int().positive('Fournisseur (tiers) ID invalide').optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const adjustLotQuantiteSchema = z.object({
  delta: z.coerce.number().int().refine(val => val !== 0, 'Le delta ne peut pas être zéro'),
});

// ============================================
// Serial number tracking schemas (migration 016)
// ============================================
export const registerSerialSchema = z.object({
  produit_id: z.coerce.number().int().positive('Produit ID requis'),
  numero_serie: z.string().min(1, 'Numéro de série requis').max(100),
  lot_id: z.coerce.number().int().positive('Lot ID invalide').optional(),
  statut: z.enum(['en_stock', 'vendu', 'retourne', 'en_garantie', 'reforme']).optional(),
  date_achat: z.string().optional().or(z.literal('')),
  prix_vente: z.coerce.number().nonnegative().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const markSerialSoldSchema = z.object({
  client_id: z.coerce.number().int().positive('Client (tiers) ID invalide').optional(),
  facture_id: z.coerce.number().int().positive('Facture ID invalide').optional(),
  prix_vente: z.coerce.number().nonnegative().optional(),
  garantie_jusqu: z.string().optional().or(z.literal('')),
  date_vente: z.string().optional().or(z.literal('')),
});

export const markSerialWarrantySchema = z.object({
  garantie_jusqu: z.string().optional().or(z.literal('')),
});
