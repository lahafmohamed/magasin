import { z } from 'zod';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../utils/security';

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
  // Enforce the same strength policy as the controller (was a weak min(6)).
  password: z.string().refine(isStrongPassword, PASSWORD_POLICY_MESSAGE),
  nom_complet: z.string().max(255).optional().or(z.literal('')),
  // Free-form: the app has 6 roles (admin/manager/caissier/depot_staff/
  // magasin_staff/viewer); the controller resolves the role by name.
  role: z.string().max(50).default('caissier'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().refine(isStrongPassword, PASSWORD_POLICY_MESSAGE),
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
  fournisseur_id: z.coerce.number().int().positive('Fournisseur ID invalide').optional(),
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
  fournisseur_id: z.coerce.number().int().positive('Fournisseur ID invalide').nullable().optional(),
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
  prix_unitaire: z.coerce.number().positive('Le prix unitaire doit être supérieur à zéro'),
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
// Facture fournisseur (supplier invoice) schemas
// ============================================
export const factureFournisseurLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive().optional(),
  description: z.string().max(500).optional().or(z.literal('')),
  quantite: z.coerce.number().positive('Quantité doit être positive'),
  prix_unitaire: z.coerce.number().nonnegative('Prix unitaire invalide'),
}).refine(l => l.produit_id !== undefined || (l.description && l.description.length > 0), {
  message: 'Chaque ligne doit avoir un produit ou une description',
});

export const createFactureFournisseurSchema = z.object({
  tiers_id: z.coerce.number().int().positive().optional(),
  fournisseur_id: z.coerce.number().int().positive().optional(),
  reception_id: z.coerce.number().int().positive().optional(),
  commande_id: z.coerce.number().int().positive().optional(),
  numero_facture_fournisseur: z.string().min(1, 'Numéro de facture requis').max(100),
  date_facture: z.string().min(1, 'Date de facture requise'),
  date_echeance: z.string().optional().or(z.literal('')),
  condition_paiement: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  lignes: z.array(factureFournisseurLigneSchema).min(1, 'Au moins une ligne requise'),
}).refine(d => d.tiers_id !== undefined || d.fournisseur_id !== undefined, {
  message: 'Fournisseur (tiers_id) requis',
});

export const recordFactureFournisseurPaiementSchema = z.object({
  montant: z.coerce.number().positive('Montant doit être positif'),
  methode_paiement: z.enum([
    'espece', 'carte', 'cheque', 'virement',
    'mobile_money', 'orange_money', 'mtn_money', 'wave',
  ]),
  reference: z.string().max(100).optional().or(z.literal('')),
});

// ============================================
// Payroll schemas
// ============================================
export const createPayrollRunSchema = z.object({
  periode: z.string().regex(/^\d{4}-\d{2}$/, "Période au format 'YYYY-MM' requise"),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const updatePayslipSchema = z.object({
  primes: z.coerce.number().nonnegative('Primes invalides').optional(),
  deductions: z.coerce.number().nonnegative('Déductions invalides').optional(),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export const markPayrollPaidSchema = z.object({
  methode_paiement: z.enum([
    'espece', 'carte', 'cheque', 'virement',
    'mobile_money', 'orange_money', 'mtn_money', 'wave',
  ]).optional(),
});

// ============================================
// Devis schemas
// ============================================
export const devisLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive('Produit ID requis').optional(),
  description: z.string().max(255).optional().or(z.literal('')),
  quantite: z.coerce.number().int().positive('Quantité doit être positive'),
  prix_unitaire: z.coerce.number().positive('Le prix unitaire doit être supérieur à zéro'),
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
  prix_unitaire: z.coerce.number().positive('Le prix unitaire doit être supérieur à zéro'),
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
  prix_unitaire: z.coerce.number().positive('Le prix unitaire doit être supérieur à zéro'),
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
// CRM schemas (crm_interactions / crm_taches, migration 068)
// ============================================
export const createCrmInteractionSchema = z.object({
  tiers_id: z.coerce.number().int().positive('Tiers requis'),
  type: z.string().min(1, 'Type requis').max(50),
  sujet: z.string().min(1, 'Sujet requis').max(200),
  description: z.string().max(5000).optional().or(z.literal('')),
  date_interaction: z.string().max(40).optional().or(z.literal('')),
  date_rappel: z.string().max(40).nullable().optional().or(z.literal('')),
  priorite: z.string().max(20).optional(),
  statut: z.string().max(20).optional(),
});

export const updateCrmInteractionSchema = createCrmInteractionSchema
  .omit({ tiers_id: true })
  .partial();

export const createCrmTacheSchema = z.object({
  tiers_id: z.coerce.number().int().positive().nullable().optional(),
  titre: z.string().min(1, 'Titre requis').max(200),
  description: z.string().max(5000).optional().or(z.literal('')),
  priorite: z.string().max(20).optional(),
  date_echeance: z.string().max(40).nullable().optional().or(z.literal('')),
  assigne_a: z.coerce.number().int().positive().nullable().optional(),
});

export const updateCrmTacheStatutSchema = z.object({
  statut: z.string().min(1, 'Statut requis').max(20),
});

// ============================================
// Acompte schemas (client + fournisseur)
// ============================================
export const applyAcompteSchema = z.object({
  facture_id: z.coerce.number().int().positive('Facture ID requis'),
  montant: z.coerce.number().positive('Montant doit être positif'),
  idempotency_key: z.string().max(255).optional(),
});

export const refundAcompteSchema = z.object({
  montant: z.coerce.number().positive('Montant doit être positif'),
  methode_paiement: z.enum([
    'espece', 'carte', 'cheque', 'virement',
    'mobile_money', 'orange_money', 'mtn_money', 'wave',
  ]),
  session_caisse_id: z.coerce.number().int().positive().optional(),
  notes: z.string().max(1000).optional().or(z.literal('')),
  idempotency_key: z.string().max(255).optional(),
});

// PATCH /retours/:id/statut
export const updateReturnStatutSchema = z.object({
  statut: z.enum(['en_attente', 'traite', 'annule']),
});

// POST /avoirs/:id/apply-to-facture
export const applyAvoirToFactureSchema = z.object({
  facture_id: z.coerce.number().int().positive('Facture requise'),
  montant: z.coerce.number().positive().optional(),
});

// Shared payment-method enum (matches PaiementService.PAYMENT_METHODS).
const paymentMethodEnum = z.enum([
  'espece', 'carte', 'cheque', 'virement',
  'mobile_money', 'orange_money', 'mtn_money', 'wave',
]);

// PUT /paiements/:id — partial update; rewrites amount then recomputes FIFO.
export const updatePaiementSchema = z.object({
  montant: z.coerce.number().positive('Montant doit être positif').optional(),
  methode_paiement: paymentMethodEnum.optional(),
  reference: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  date_paiement: z.string().optional(),
});

// POST /stock-transfers — inter-location stock move.
export const createStockTransferSchema = z.object({
  location_source_id: z.coerce.number().int().positive('Location source requise'),
  location_destination_id: z.coerce.number().int().positive('Location destination requise'),
  notes: z.string().max(1000).optional().or(z.literal('')),
  lignes: z.array(z.object({
    produit_id: z.coerce.number().int().positive(),
    quantite_demandee: z.coerce.number().int().positive('Quantité doit être > 0'),
  })).min(1, 'Au moins une ligne requise'),
});

// POST/PUT /stock-locations
export const createStockLocationSchema = z.object({
  code: z.string().min(1, 'Code requis').max(20),
  nom: z.string().min(1, 'Nom requis').max(100),
  adresse: z.string().max(500).optional().or(z.literal('')),
  responsable_id: z.coerce.number().int().positive().optional().nullable(),
  est_principal: z.boolean().optional(),
});
export const updateStockLocationSchema = createStockLocationSchema.partial();

// POST /caisses-hierarchy — create caisse.
export const createCaisseSchema = z.object({
  code: z.string().min(1, 'Code requis').max(50),
  nom: z.string().min(1, 'Nom requis').max(100),
  type: z.string().min(1, 'Type requis').max(50),
  location_id: z.coerce.number().int().positive().optional().nullable(),
  caisse_parent_id: z.coerce.number().int().positive().optional().nullable(),
});

// POST /caisses-hierarchy/transferts — move money between caisses.
export const transfertFondsSchema = z.object({
  caisse_source_id: z.coerce.number().int().positive('Caisse source requise'),
  caisse_dest_id: z.coerce.number().int().positive('Caisse destination requise'),
  montant: z.coerce.number().positive('Montant doit être positif'),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

// Admin user management (create / update)
const strongPassword = z.string().refine(isStrongPassword, PASSWORD_POLICY_MESSAGE);

export const adminCreateUserSchema = z.object({
  username: z.string().min(1, 'Username requis').max(50),
  password: strongPassword,
  role_id: z.coerce.number().int().positive('role_id requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  nom_complet: z.string().max(200).optional().or(z.literal('')),
  location_ids: z.array(z.coerce.number().int().positive()).optional(),
});

export const adminUpdateUserSchema = z.object({
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  nom_complet: z.string().max(200).optional().or(z.literal('')),
  role_id: z.coerce.number().int().positive().optional(),
  actif: z.boolean().optional(),
  password: strongPassword.optional(),
  location_ids: z.array(z.coerce.number().int().positive()).optional(),
});

// POST /tiers/:id/acomptes-client + /tiers/:id/acomptes-fournisseur
export const recordAcompteSchema = z.object({
  montant: z.coerce.number().positive('Montant doit être positif'),
  methode_paiement: z.enum([
    'espece', 'carte', 'cheque', 'virement',
    'mobile_money', 'orange_money', 'mtn_money', 'wave',
  ]),
  notes: z.string().max(1000).optional().or(z.literal('')),
  magasin_id: z.coerce.number().int().positive().optional(),
  reference_number: z.string().max(100).optional().or(z.literal('')),
  session_caisse_id: z.coerce.number().int().positive().optional(),
  idempotency_key: z.string().max(255).optional(),
});

// ============================================
// Caisse magasin schemas
// ============================================
export const ouvrirSessionCaisseSchema = z.object({
  magasin_id: z.coerce.number().int().positive('Magasin ID requis'),
  fond_initial: z.coerce.number().nonnegative('Fond initial doit être positif ou nul'),
  commentaire_ouverture: z.string().max(2000).optional().or(z.literal('')),
});

export const cloturerSessionCaisseSchema = z.object({
  fond_final_compte: z.coerce.number().nonnegative('Fond final compté doit être positif ou nul'),
  commentaire_cloture: z.string().max(2000).optional().or(z.literal('')),
});

export const createMouvementDiversSchema = z.object({
  type: z.enum(['encaissement', 'decaissement']),
  categorie: z.enum(['apport', 'retrait_banque', 'autre_entree', 'autre_sortie']),
  montant: z.coerce.number().positive('Montant doit être positif'),
  methode_paiement: z.enum([
    'espece', 'carte', 'cheque', 'virement',
    'mobile_money', 'orange_money', 'mtn_money', 'wave',
  ]),
  libelle: z.string().trim().min(3, 'Libellé (motif) obligatoire (au moins 3 caractères)').max(500),
  idempotency_key: z.string().max(255).optional(),
});

// ============================================
// POS schemas
// ============================================
export const openPosSessionSchema = z.object({
  solde_ouverture: z.coerce.number().nonnegative("Solde d'ouverture doit être positif ou nul").optional(),
  location_id: z.coerce.number().int().positive('Location ID invalide').optional(),
});

export const posQuickSaleLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive('Produit ID requis'),
  quantite: z.coerce.number().positive('Quantité doit être positive'),
  // Le prix est ignoré côté serveur (prix catalogue autoritaire), accepté pour compat
  prix_unitaire: z.coerce.number().nonnegative().optional(),
});

export const posQuickSaleSchema = z.object({
  sessionId: z.coerce.number().int().positive('Session ID requis'),
  items: z.array(posQuickSaleLigneSchema).min(1, 'Au moins un article requis'),
  client_id: z.coerce.number().int().positive().nullable().optional(),
  methode_paiement: z.enum([
    'espece', 'carte', 'cheque', 'virement',
    'mobile_money', 'orange_money', 'mtn_money', 'wave',
  ]).optional(),
});

// ============================================
// Dépenses (V2) schemas
// ============================================
export const createDepenseSchema = z.object({
  magasin_id: z.coerce.number().int().positive('Magasin ID requis'),
  categorie_id: z.coerce.number().int().positive('Catégorie requise'),
  montant: z.coerce.number().positive('Montant doit être positif'),
  methode_paiement: z.enum(['espece', 'carte', 'cheque', 'virement', 'mobile_money']),
  date_depense: z.string().max(40).optional().or(z.literal('')),
  description: z.string().min(1, 'Description requise').max(2000),
  beneficiaire_libre: z.string().max(255).optional().or(z.literal('')),
  fournisseur_id: z.coerce.number().int().positive().nullable().optional(),
  justificatif_url: z.string().max(500).optional().or(z.literal('')),
});

export const updateDepenseSchema = createDepenseSchema.omit({ magasin_id: true }).partial();

// ============================================
// General ledger (manual entry) schemas
// ============================================
export const manualEntryLigneSchema = z.object({
  compte_id: z.coerce.number().int().positive('Compte requis'),
  debit: z.coerce.number().nonnegative('Débit invalide'),
  credit: z.coerce.number().nonnegative('Crédit invalide'),
  description: z.string().max(500).optional().or(z.literal('')),
});

export const createManualEntrySchema = z.object({
  numero_piece: z.string().min(1, 'Numéro de pièce requis').max(50),
  journal: z.string().min(1, 'Journal requis').max(20),
  date_ecriture: z.string().min(1, "Date d'écriture requise"),
  lignes: z.array(manualEntryLigneSchema).min(1, 'Au moins une ligne requise'),
});

// ============================================
// Comptabilité (pièce comptable) schemas
// ============================================
export const pieceLigneSchema = z.object({
  compte_numero: z.string().min(1, 'Numéro de compte requis').max(20),
  debit: z.coerce.number().nonnegative('Débit invalide'),
  credit: z.coerce.number().nonnegative('Crédit invalide'),
  tiers_id: z.coerce.number().int().positive().nullable().optional(),
});

export const enregistrerPieceSchema = z.object({
  journal: z.string().min(1).max(20).optional(),
  date_ecriture: z.string().min(1, "Date d'écriture requise"),
  libelle: z.string().min(1, 'Libellé requis').max(500),
  lignes: z.array(pieceLigneSchema).min(2, 'Une pièce doit contenir au moins 2 lignes'),
  reference_type: z.string().max(50).optional().or(z.literal('')),
  reference_id: z.coerce.number().int().positive().optional(),
});

// ============================================
// Employé schemas
// ============================================
export const createEmployeSchema = z.object({
  utilisateur_id: z.coerce.number().int().positive().optional(),
  matricule: z.string().min(1, 'Matricule requis').max(50),
  nom_complet: z.string().min(1, 'Nom complet requis').max(255),
  poste: z.string().max(100).optional().or(z.literal('')),
  departement: z.string().max(100).optional().or(z.literal('')),
  date_embauche: z.string().min(1, "Date d'embauche requise"),
  date_naissance: z.string().max(40).optional().or(z.literal('')),
  telephone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('Email invalide').max(255).optional().or(z.literal('')),
  adresse: z.string().max(1000).optional().or(z.literal('')),
  salaire_base: z.coerce.number().nonnegative('Salaire invalide').optional(),
  commission_taux: z.coerce.number().nonnegative('Taux de commission invalide').max(100, 'Taux de commission max 100%').optional(),
});

export const updateEmployeSchema = createEmployeSchema
  .omit({ utilisateur_id: true })
  .partial()
  .extend({ actif: z.boolean().optional() });

export const recordEmployeCommissionSchema = z.object({
  facture_id: z.coerce.number().int().positive('Facture ID requis'),
  montant_vente: z.coerce.number().positive('Montant de vente doit être positif'),
});

export const recordEmployeShiftSchema = z.object({
  employe_id: z.coerce.number().int().positive('Employé requis'),
  date_shift: z.string().min(1, 'Date du shift requise'),
  heure_prevue_debut: z.string().max(20).optional().or(z.literal('')),
  heure_prevue_fin: z.string().max(20).optional().or(z.literal('')),
  heure_debut: z.string().max(20).optional().or(z.literal('')),
  heure_fin: z.string().max(20).optional().or(z.literal('')),
  statut: z.enum(['prevu', 'en_cours', 'termine', 'absent']).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

// ============================================
// Demandes de réapprovisionnement
// ============================================

const demandeLigneSchema = z.object({
  produit_id: z.coerce.number().int().positive(),
  quantite_demandee: z.coerce.number().int().positive('Quantité demandée invalide'),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export const createDemandeSchema = z.object({
  magasin_id: z.coerce.number().int().positive('magasin_id requis'),
  depot_id: z.coerce.number().int().positive('depot_id requis'),
  motif: z.string().max(2000).optional().or(z.literal('')),
  lignes: z.array(demandeLigneSchema).min(1, 'La demande doit contenir au moins une ligne'),
});

export const updateDemandeSchema = z.object({
  motif: z.string().max(2000).optional().or(z.literal('')),
  lignes: z.array(demandeLigneSchema).min(1, 'La demande doit contenir au moins une ligne'),
});

export const decideDemandeSchema = z.object({
  decision: z.enum(['approuvee', 'refusee']),
  raison_refus: z.string().max(2000).optional().or(z.literal('')),
  lignes_decision: z.array(z.object({
    ligne_id: z.coerce.number().int().positive(),
    quantite_approuvee: z.coerce.number().int().nonnegative(),
  })).optional(),
});

// ============================================
// Payroll statutory config (admin)
// ============================================

export const updateCotisationSchema = z.object({
  taux_salarial: z.coerce.number().min(0).max(100).optional(),
  taux_patronal: z.coerce.number().min(0).max(100).optional(),
  plafond: z.number().nonnegative().nullable().optional(),
  actif: z.boolean().optional(),
});

export const replaceBaremesSchema = z.object({
  baremes: z.array(z.object({
    tranche_min: z.coerce.number().nonnegative(),
    tranche_max: z.number().positive().nullable(),
    taux: z.coerce.number().min(0).max(100),
  })).min(1, 'baremes (array) requis'),
});

// 3-way match tolerance config (admin)
export const updateMatchConfigSchema = z.object({
  qte_tolerance_pct: z.coerce.number().min(0).max(100).optional(),
  prix_tolerance_pct: z.coerce.number().min(0).max(100).optional(),
  bloquer: z.boolean().optional(),
});

export const receivablesReportQuerySchema = z.object({
  search: z.string().trim().max(100, 'Recherche trop longue').optional(),
  min_amount: z.coerce.number().nonnegative('Le solde minimum doit être positif').optional(),
  bucket: z.enum(['all', 'moins_30_jours', 'entre_30_60_jours', 'plus_60_jours']).default('all'),
  location_id: z.coerce.number().int().positive('Emplacement invalide').optional(),
  page: z.coerce.number().int().positive('Page invalide').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Maximum 100 lignes par page').default(20),
});

export const generalLedgerQuerySchema = z.object({
  journal: z.enum(['ACHATS', 'VENTES', 'TRESORERIE', 'OD']).optional(),
  date_debut: z.iso.date('Date de début invalide').optional(),
  date_fin: z.iso.date('Date de fin invalide').optional(),
  compte_id: z.coerce.number().int().positive('Compte invalide').optional(),
  numero_piece: z.string().trim().max(100, 'Numéro de pièce trop long').optional(),
  description: z.string().trim().max(200, 'Description trop longue').optional(),
  page: z.coerce.number().int().positive('Page invalide').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Maximum 100 lignes par page').default(50),
});

export const generalLedgerPdfQuerySchema = generalLedgerQuerySchema.extend({
  type: z.enum(['ecritures', 'chart', 'balance']).optional(),
});

// Affectations utilisateur ↔ locations (admin/manager)
export const updateUserLocationAssignmentsSchema = z.object({
  location_ids: z.array(z.coerce.number().int().positive()).default([]),
});

// Lot/batch (migration 015) and serial-number (migration 016) tracking schemas
// were removed with the batch/serial module (no routes/UI ever wired). The
// backing tables are dropped in migration 085.
