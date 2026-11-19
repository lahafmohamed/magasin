import axios from 'axios';
import { Produit, FactureComplete, StatsDashboard } from '../types';
import type { PaymentMethod } from '../utils/paymentMethod';
import { isCredentialError } from '../utils/errors';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Page de liste accompagnée d'agrégats calculés sur tout le jeu filtré (`summary`). */
export interface PageWithSummary<T, S = Record<string, unknown>> extends Page<T> {
  summary?: S;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Normalize the API envelope without mutating arrays. Paginated endpoints keep
 * their rows and metadata in a stable `{ data, pagination }` contract, plus the
 * backend `summary` when there is one (totals over the whole filtered set, e.g.
 * Relances « Total à recouvrer » — dropping it showed « 0 FCFA » while clients
 * owed millions).
 */
export function normalizeApiResponseBody(body: unknown): unknown {
  if (!isRecord(body) || !('success' in body)) {
    return body;
  }

  if (!('data' in body)) {
    return body;
  }

  if (body.pagination && Array.isArray(body.data)) {
    return {
      data: body.data,
      pagination: body.pagination,
      ...('summary' in body && body.summary !== undefined ? { summary: body.summary } : {}),
    };
  }

  return body.data;
}

type CreateProduitPayload = Omit<Produit, 'id' | 'stock' | 'code_barre'> & {
  stock?: number;
  location_id?: number;
  initial_stock?: number;
  fournisseur_id?: number | null;
  // Optionnel côté serveur : une chaîne vide est enregistrée comme NULL
  // (la colonne est UNIQUE, deux '' entreraient en conflit).
  code_barre?: string | null;
};

type UpdateProduitPayload = Partial<Omit<Produit, 'id'>> & {
  fournisseur_id?: number | null;
};

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Garde l'enveloppe `{ success, data, message }` intacte : pour les appels
     * dont la phrase de confirmation du serveur (`message`) doit atteindre le
     * toast (encaissement).
     */
    keepEnvelope?: boolean;
  }
}

export const api = axios.create({
  baseURL: '/api',
  // Auth is carried by the httpOnly `auth_token` cookie — send it on every request.
  withCredentials: true,
});

// Response interceptor: unwrap non-paginated data and preserve paginated pages.
api.interceptors.response.use(
  (response) => {
    if (response.config?.keepEnvelope) return response;
    return { ...response, data: normalizeApiResponseBody(response.data) };
  },
  (error) => {
    // On token expiry / auth failure, clear the session and bounce to login —
    // mirrors authService so requests through this instance don't fail silently.
    // A wrong password (`/auth/login`, `/auth/change-password`) is not an
    // expired session: no reload, the page shows the reason.
    if (error.response?.status === 401 && !isCredentialError(error)) {
      try {
        localStorage.removeItem('auth_user');
      } catch {
        /* stockage indisponible */
      }
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ========== PRODUITS ==========
export const produitService = {
  getAll: async (
    search?: string,
    categorie?: string,
    lowStock?: boolean,
    page = 1,
    limit = 20,
    sort = 'nom',
    order = 'asc',
    locationId?: number
  ): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (categorie) params.append('categorie', categorie);
    if (lowStock) params.append('low_stock', 'true');
    if (locationId) params.append('location_id', locationId.toString());
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('sort', sort);
    params.append('order', order);
    const { data } = await api.get(`/produits?${params}`);
    return data;
  },

  /**
   * Lot 3 : un EAN-13 interne (plage 20…) pour chaque produit sans
   * code-barres ; un produit qui en a déjà un le garde (gérant, admin).
   */
  genererCodesBarres: async (
    produitIds: number[]
  ): Promise<{ produits: { produit_id: number; nom: string; code_barre: string; cree: boolean }[]; message: string }> => {
    const { data: body } = await api.post('/produits/codes-barres', { produit_ids: produitIds }, { keepEnvelope: true });
    return { produits: Array.isArray(body?.data) ? body.data : [], message: body?.message ?? '' };
  },

  getReorderSuggestions: async (): Promise<any[]> => {
    const { data } = await api.get('/produits/reorder-suggestions');
    return data?.data ?? data ?? [];
  },

  create: async (produit: CreateProduitPayload): Promise<{ id: number }> => {
    const { data } = await api.post('/produits', produit);
    return data;
  },

  update: async (id: number, produit: UpdateProduitPayload): Promise<void> => {
    await api.put(`/produits/${id}`, produit);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/produits/${id}`);
  },

  /** Fiche produit complète — porte `fournisseur_id`, absent de la liste. */
  getById: async (id: number): Promise<Produit & { fournisseur_id?: number | string | null; [key: string]: unknown }> => {
    const { data } = await api.get(`/produits/${id}`);
    return data;
  },

  /**
   * Mouvement de stock motivé (`POST /produits/:id/mouvements`, admin, manager,
   * depot_staff) : `quantite` signée (≠ 0), `raison` gardée dans l'historique.
   * Sans `location_id`, le serveur prend l'emplacement principal.
   */
  addStockMovement: async (
    id: number,
    payload: {
      type_mouvement: 'vente' | 'ajustement' | 'retour' | 'commande' | 'perte' | 'autre';
      quantite: number;
      location_id?: number;
      raison?: string;
    }
  ): Promise<unknown> => {
    const { data } = await api.post(`/produits/${id}/mouvements`, payload);
    return data;
  },

  adjustStock: async (id: number, quantite: number, location_id?: number): Promise<{ stock: number }> => {
    const { data } = await api.patch(`/produits/${id}/stock`, {
      quantite,
      ...(location_id ? { location_id } : {}),
    });
    return data;
  },

  getStockValuation: async (): Promise<any> => {
    const { data } = await api.get('/produits/stock-valuation');
    return data;
  },

  getStockByCategory: async (): Promise<any[]> => {
    const { data } = await api.get('/produits/stock-by-category');
    return data;
  },

  getStockHistory: async (id: number, limit = 50): Promise<any[]> => {
    const { data } = await api.get(`/produits/${id}/mouvements?limit=${limit}`);
    return data;
  },

  getPurchaseInfo: async (id: number): Promise<any> => {
    const { data } = await api.get(`/produits/${id}/info-achat`);
    return data;
  },

  searchFuzzy: async (query: string, limit = 10, threshold = 0.1): Promise<any[]> => {
    const params = new URLSearchParams();
    params.append('q', query);
    params.append('limit', limit.toString());
    params.append('threshold', threshold.toString());
    const { data } = await api.get(`/produits/search/fuzzy?${params}`);
    return data;
  },
};

// ========== VENTES (Magasin-only product picker) ==========
// Used exclusively by Facture and Devis forms. Backend filters dépôt at SQL level
// and rejects non-magasin location_id with HTTP 422.
export const ventesService = {

  getLocations: async (): Promise<any> => {
    const { data } = await api.get('/produits/ventes/locations');
    return data;
  },

  searchFuzzy: async (query: string, limit = 10, locationId?: number): Promise<any[]> => {
    const params = new URLSearchParams();
    params.append('q', query);
    params.append('limit', limit.toString());
    if (locationId) params.append('location_id', locationId.toString());
    const { data } = await api.get(`/produits/search/fuzzy?${params}`);
    // Filter by location stock if locationId is provided
    if (locationId && Array.isArray(data)) {
      return data.filter((p: any) => (p.stock || 0) > 0);
    }
    return data;
  },
};

// ========== TIERS (unified) ==========
export const tiersService = {
  getAll: async (options: {
    search?: string;
    role?: 'client' | 'fournisseur' | 'mixte' | 'all';
    page?: number;
    limit?: number;
    sort?: string;
    order?: string;
  } = {}): Promise<any> => {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.role) params.append('role', options.role);
    params.append('page', (options.page || 1).toString());
    params.append('limit', (options.limit || 20).toString());
    if (options.sort) params.append('sort', options.sort);
    if (options.order) params.append('order', options.order);
    const { data } = await api.get(`/tiers?${params}`);
    return data;
  },

  search: async (q: string, role?: 'client' | 'fournisseur'): Promise<any[]> => {
    const params = new URLSearchParams({ q });
    if (role) params.append('role', role);
    const { data } = await api.get(`/tiers/search?${params}`);
    return Array.isArray(data) ? data : data?.data || [];
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/tiers/${id}`);
    return data;
  },

  getCompte: async (id: number, from?: string, to?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const { data } = await api.get(`/tiers/${id}/compte?${params}`);
    return data;
  },

  downloadRelevePdf: async (id: number, raisonSociale: string, from?: string, to?: string): Promise<void> => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const response = await api.get(`/tiers/${id}/releve-detaille/pdf?${params}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `releve-${raisonSociale.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  create: async (payload: {
    raison_sociale: string;
    prenom?: string;
    telephone?: string;
    email?: string;
    adresse?: string;
    nif?: string;
    rccm?: string;
    est_client: boolean;
    est_fournisseur: boolean;
    credit_max?: number;
    delai_paiement?: string;
    delai_livraison?: number;
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post('/tiers', payload);
    return data;
  },

  update: async (id: number, payload: Record<string, any>): Promise<any> => {
    const { data } = await api.put(`/tiers/${id}`, payload);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/tiers/${id}`);
  },

  /**
   * Client de passage « Client comptoir » (code `PASS`), lisible par tous les
   * rôles — présélectionné pour le caissier dans la nouvelle facture (D4).
   * `null` quand l'instance n'en a pas (le serveur répond 404).
   */
  getComptoir: async (): Promise<ComptoirClient | null> => {
    try {
      const { data } = await api.get('/tiers/comptoir');
      return data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  },

  /**
   * Création d'un CLIENT depuis un formulaire de vente (D4) — ouverte au
   * caissier et au personnel magasin, qui ne créent jamais de fournisseur ni de
   * plafond de crédit (le serveur refuse en 403, message en français, et force
   * `credit_max` à 0 pour ces rôles). Renvoie le contact créé (`id`,
   * `raison_sociale`, …).
   */
  createClient: async (payload: {
    raison_sociale: string;
    prenom?: string;
    telephone?: string;
    email?: string;
    adresse?: string;
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post('/tiers', { ...payload, est_client: true, est_fournisseur: false });
    return data;
  },

  recordAcompteClient: async (id: number, payload: {
    montant: number;
    methode_paiement: string;
    notes?: string;
    magasin_id?: number;
    reference_number?: string;
    idempotency_key?: string;
    session_caisse_id?: number;
  }): Promise<any> => {
    const { data } = await api.post(`/tiers/${id}/acomptes-client`, payload);
    return data;
  },

  recordAcompteFournisseur: async (id: number, payload: {
    montant: number;
    methode_paiement: string;
    notes?: string;
    magasin_id?: number;
    reference_number?: string;
    idempotency_key?: string;
    session_caisse_id?: number;
  }): Promise<any> => {
    const { data } = await api.post(`/tiers/${id}/acomptes-fournisseur`, payload);
    return data;
  },

  createCompensation: async (id: number, payload: {
    date_compensation: string;
    montant: number;
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post(`/tiers/${id}/compensation`, payload);
    return data;
  },

  getCompensations: async (id: number): Promise<any[]> => {
    const { data } = await api.get(`/tiers/${id}/compensations`);
    return Array.isArray(data) ? data : data?.data || [];
  },

  /**
   * Revérifie l'affectation des paiements d'un client (admin). E1 : chaque
   * paiement reste sur sa facture ; seuls acomptes et avoirs sans facture
   * désignée vont aux plus anciennes. `message` : phrase du serveur
   * (« Paiements vérifiés : aucune facture ne change. »).
   */
  recomputeAllocation: async (id: number): Promise<{ message?: string; data?: unknown }> => {
    const { data: body } = await api.post(`/tiers/${id}/recompute-allocation`, undefined, { keepEnvelope: true });
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : undefined;
    return { message, data: isRecord(body) ? body.data : undefined };
  },
};

/** `GET /tiers/comptoir`. */
export interface ComptoirClient {
  id: number;
  code: string;
  raison_sociale: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  est_client: boolean;
  est_fournisseur: boolean;
}

// ========== ACOMPTES ==========
export const acompteService = {

  apply: async (id: number, payload: { facture_id: number; montant: number; idempotency_key?: string }): Promise<any> => {
    const { data } = await api.post(`/acomptes/${id}/apply`, payload);
    return data;
  },
  refund: async (id: number, payload: {
    montant: number;
    methode_paiement: string;
    session_caisse_id?: number;
    notes?: string;
    idempotency_key?: string;
  }): Promise<any> => {
    const { data } = await api.post(`/acomptes/${id}/refund`, payload);
    return data;
  },
  listForClient: async (tiersId: number): Promise<any[]> => {
    const { data } = await api.get(`/tiers/${tiersId}/acomptes-client/disponibles`);
    return data ?? [];
  },
};

// ========== ACOMPTES FOURNISSEUR ==========
export const acompteFournisseurService = {

  apply: async (id: number, payload: { facture_id: number; montant: number; idempotency_key?: string }): Promise<any> => {
    const { data } = await api.post(`/acomptes/fournisseur/${id}/apply`, payload);
    return data;
  },
  refund: async (id: number, payload: {
    montant: number;
    methode_paiement: string;
    session_caisse_id?: number;
    notes?: string;
    idempotency_key?: string;
  }): Promise<any> => {
    const { data } = await api.post(`/acomptes/fournisseur/${id}/refund`, payload);
    return data;
  },
  listForFournisseur: async (tiersId: number): Promise<any[]> => {
    const { data } = await api.get(`/tiers/${tiersId}/acomptes-fournisseur/disponibles`);
    return data ?? [];
  },
};


// ========== FACTURES ==========
export const factureService = {
  getAll: async (search?: string, statut?: string, page = 1, limit = 20, sort = 'date_facture', order = 'desc'): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('sort', sort);
    params.append('order', order);
    const { data } = await api.get(`/factures?${params}`);
    return data;
  },

  getById: async (id: number): Promise<FactureComplete> => {
    const { data } = await api.get(`/factures/${id}`);
    return data;
  },

  create: async (facture: {
    tiers_id: number;
    client_id?: number;
    location_id?: number;
    lignes: { produit_id: number; quantite: number; prix_unitaire: number }[];
    statut?: string;
    notes?: string;
  }): Promise<{ id: number; numero_facture: string; total: number }> => {
    const { data } = await api.post('/factures', facture);
    return data;
  },

  /**
   * Vente comptoir (lot 2) : facture + encaissement en une transaction. Rien
   * n'est enregistré si l'encaissement échoue (caisse fermée → 409
   * `CAISSE_FERMEE`). Sans `tiers_id`, le client comptoir.
   */
  createVenteComptoir: async (vente: {
    tiers_id?: number;
    location_id?: number;
    lignes: { produit_id: number; quantite: number; prix_unitaire: number }[];
    paiements: { methode_paiement: PaymentMethod; montant?: number; reference?: string }[];
    especes_recues?: number;
    idempotency_key?: string;
  }): Promise<VenteComptoirResult> => {
    const { data } = await api.post('/factures/comptoir', vente);
    return data;
  },

  getStats: async (): Promise<StatsDashboard> => {
    const { data } = await api.get('/factures/stats');
    // Unwrap nested data if needed
    return data.data || data;
  },

  /**
   * Change le statut d'une facture (admin, manager). `annulee` n'est accepté
   * que pour une facture sans paiement — U-24 « Annuler la facture ».
   */
  /**
   * Change le statut manuel d'une facture. `annulee` contre-passe ses écritures
   * et remet ses articles en stock côté serveur ; `message` résume l'effet.
   */
  updateStatut: async (
    id: number,
    statut: 'payee' | 'partielle' | 'en_attente' | 'annulee'
  ): Promise<{ message?: string } | undefined> => {
    const { data } = await api.put(`/factures/${id}/statut`, { statut });
    return data;
  },

  /** Supprime une facture (admin, manager) ; `restaurerStock` remet les quantités en stock. */
  delete: async (id: number, restaurerStock = false): Promise<void> => {
    await api.delete(`/factures/${id}`, { data: { restaurer_stock: restaurerStock } });
  },

  exportAll: async (search?: string, statut?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    const { data } = await api.get(`/factures/export?${params}`);
    return data;
  },

  getRevenueTrends: async (days = 30): Promise<any[]> => {
    const { data } = await api.get(`/factures/revenue-trends?days=${days}`);
    return data;
  },

  getTopProducts: async (limit = 5): Promise<any[]> => {
    const { data } = await api.get(`/factures/top-products?limit=${limit}`);
    return data;
  },

  getTopClients: async (limit = 5): Promise<any[]> => {
    const { data } = await api.get(`/factures/top-clients?limit=${limit}`);
    return data;
  },

  /** PDF de la facture généré par le serveur (`GET /factures/:id/pdf`), téléchargé. */
  downloadPdf: async (id: number, numero?: string): Promise<void> => {
    await downloadPdfBlob(`/factures/${id}/pdf`, pdfFilename('facture', numero ?? id));
  },
};

// ========== PAIEMENTS ==========
/**
 * Résultat d'un encaissement (contrat backend D3, `201`) : le montant saisi est
 * enregistré tel quel ; les acomptes ne sont pris que sur demande explicite
 * (`appliquer_acomptes: true`). `message` est la phrase française du serveur
 * qui dit ce qui a été enregistré — à reprendre telle quelle dans le toast.
 *
 * Erreurs (à lire avec `getErrorCode(err)` / `getErrorMessage(err)`) :
 *  - 409 `CAISSE_FERMEE` — espèces sans caisse ouverte (« La caisse de ce
 *    magasin est fermée : ouvrez-la avant d’encaisser des espèces. ») ;
 *  - 409 `STALE_CASH_SESSION` — session de caisse ouverte depuis trop longtemps ;
 *  - 422 — montant supérieur au reste dû.
 */
/** Réponse de `POST /factures/comptoir`. */
export interface VenteComptoirResult {
  /** Vrai quand la clé d'idempotence désignait une vente déjà enregistrée. */
  idempotent: boolean;
  facture_id: number;
  numero_facture: string;
  total: number;
  paiements: { paiement_id: number | null; methode_paiement: PaymentMethod; montant: number }[];
  especes_recues: number | null;
  monnaie_rendue: number;
  message: string;
}

export interface PaiementResult {
  /** Rejeu d'une même `idempotency_key` : rien n'a été encaissé deux fois. */
  idempotent?: boolean;
  facture_id: number;
  numero_facture: string;
  /** Montant saisi = `applique_depuis_acomptes` + `direct_montant`. */
  montant_recu: number;
  /** Pris sur les acomptes du client (0 sans `appliquer_acomptes`). */
  applique_depuis_acomptes: number;
  applications: { acompte_id: number; paiement_id: number; montant: number }[];
  direct_paiement_id: number | null;
  /** Encaissé dans `methode_paiement` (dans le tiroir quand c'est des espèces). */
  direct_montant: number;
  methode_paiement: PaymentMethod;
  session_caisse_id: number | null;
  mouvement_caisse_id: number | null;
  encaisse_en_caisse: boolean;
  /** État de la facture après le paiement. */
  reste_du: number;
  statut_facture: string;
  /** Acomptes du client encore disponibles. */
  acomptes_disponibles: number;
  /** Phrase de confirmation du serveur (« Paiement de 70 000 FCFA enregistré en espèces… »). */
  message: string;
}

export const paiementService = {
  create: async (factureId: number, paiement: {
    montant: number;
    methode_paiement: PaymentMethod;
    date_paiement?: string;
    reference?: string;
    notes?: string;
    /** Clé unique par ouverture du formulaire : un double envoi n'encaisse qu'une fois. */
    idempotency_key?: string;
    session_caisse_id?: number;
    /** D3 : utiliser d'abord les acomptes du client — jamais implicite (défaut `false`). */
    appliquer_acomptes?: boolean;
    /** @deprecated Sans effet depuis D3 : les acomptes ne sont plus appliqués d'office. */
    skip_acompte_application?: boolean;
  }): Promise<PaiementResult> => {
    // Enveloppe gardée : la phrase `message` du serveur est au niveau racine.
    const { data: body } = await api.post(`/factures/${factureId}/paiements`, paiement, {
      keepEnvelope: true,
    });
    const result = (body && typeof body === 'object' && 'data' in body ? body.data : body) ?? {};
    return { ...result, message: body?.message ?? result.message ?? '' } as PaiementResult;
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/paiements/stats');
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/paiements/${id}`);
  },

  /** Reçu de paiement (quittance) remis au client. */
  downloadRecu: async (id: number): Promise<void> => {
    await downloadPdfBlob(`/paiements/${id}/recu`, `recu-paiement-${id}.pdf`);
  },
};


// ========== COMMANDES ==========
/** « facture-FAC-2026-00110.pdf » : préfixe du document + numéro, sans espace. */
function pdfFilename(prefix: string, numero: string | number): string {
  return `${prefix}-${String(numero).trim().replace(/\s+/g, '_')}.pdf`;
}

/** Télécharge un blob PDF renvoyé par l'API sous le nom de fichier donné. */
async function downloadPdfBlob(url: string, filename: string): Promise<void> {
  const response = await api.get(url, { responseType: 'blob' });
  const objectUrl = window.URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export const commandeService = {
  getAll: async (
    search?: string,
    statut?: string,
    page = 1,
    limit = 20,
    sort = 'date',
    order: 'asc' | 'desc' = 'desc'
  ): Promise<Page<any>> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('sort', sort);
    params.append('order', order);
    const { data } = await api.get(`/commandes?${params}`);
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/commandes/${id}`);
    return data;
  },

  create: async (commande: {
    tiers_id: number;
    fournisseur_id?: number;
    lignes: { produit_id: number; quantite: number; prix_unitaire: number }[];
    notes?: string;
    date_livraison_prevue?: string;
  }): Promise<{ id: number; numero_commande: string }> => {
    const { data } = await api.post('/commandes', commande);
    return data;
  },

  update: async (id: number, commande: {
    tiers_id: number;
    fournisseur_id?: number;
    lignes: { produit_id: number; quantite: number; prix_unitaire: number }[];
    notes?: string;
    date_livraison_prevue?: string;
  }): Promise<void> => {
    await api.put(`/commandes/${id}`, commande);
  },

  updateStatut: async (id: number, statut: string): Promise<void> => {
    await api.put(`/commandes/${id}/statut`, { statut });
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/commandes/stats');
    return data;
  },

  getMatch: async (id: number): Promise<any> => {
    const { data } = await api.get(`/commandes/${id}/match`);
    return data;
  },

  /** Bon de commande fournisseur (PDF) — le document envoyé au fournisseur. */
  downloadPdf: async (id: number, numeroCommande?: string): Promise<void> => {
    await downloadPdfBlob(
      `/commandes/${id}/pdf`,
      `bon-commande-${(numeroCommande || id).toString().replace(/\s+/g, '_')}.pdf`
    );
  },
};

// ========== ERP MODULES ==========

// ========== RECEPTIONS ==========
export const receptionService = {
  getAll: async (search?: string, page = 1, limit = 20): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    const { data } = await api.get(`/receptions?${params}`);
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/receptions/${id}`);
    return data;
  },

  create: async (reception: {
    commande_id: number;
    location_id?: number;
    /** `cout_unitaire` absent : le serveur reprend le prix de la ligne de commande (E2, dépôt). */
    lignes: { produit_id: number; quantite_commandee: number; quantite_recue: number; cout_unitaire?: number; notes?: string }[];
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post('/receptions', reception);
    return data;
  },

  getPending: async (): Promise<any[]> => {
    const { data } = await api.get('/receptions/pending');
    return data;
  },

  /**
   * Commande à réceptionner, avec par ligne `quantite_deja_recue` et
   * `quantite_restante` (U-20). Une quantité au-delà du reste est refusée en
   * 422 `OVER_RECEIPT` avec un message qui nomme le produit.
   */
  getOrderDetails: async (commandeId: number): Promise<any & { lignes: ReceptionOrderLine[] }> => {
    const { data } = await api.get(`/receptions/order/${commandeId}`);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/receptions/${id}`);
  },
};

/** Ligne de commande vue depuis la réception. */
export interface ReceptionOrderLine {
  id: number;
  produit_id: number;
  produit_nom: string;
  produit_reference: string | null;
  code_barre: string | null;
  quantite: number | string;
  /** Absent pour le personnel dépôt (E2 : quantités seulement). */
  prix_unitaire?: number | string | null;
  /** Déjà reçu sur les réceptions précédentes de cette commande. */
  quantite_deja_recue: number;
  /** Reste à recevoir (= plafond de la saisie). */
  quantite_restante: number;
  [key: string]: unknown;
}

// ========== STOCK LOCATIONS ==========
export const stockLocationService = {
  getAll: async (): Promise<any> => {
    const { data } = await api.get('/stock-locations');
    return data;
  },

  create: async (location: {
    code: string;
    nom: string;
    adresse?: string;
    responsable_id?: number;
    est_principal?: boolean;
  }): Promise<any> => {
    const { data } = await api.post('/stock-locations', location);
    return data;
  },

  getStockLevels: async (locationId: number): Promise<any> => {
    const { data } = await api.get(`/stock-locations/${locationId}/stock`);
    return data;
  },

  /**
   * Produits EN STOCK à un emplacement, filtrés par nom ou référence — pour un
   * sélecteur à la frappe (transfert : « Disponible à <source> : N »). Seules
   * les lignes de quantité > 0 sont renvoyées, triées par nom.
   */
  getProductsWithStock: async (
    locationId: number,
    search?: string,
    limit = 20
  ): Promise<ProductWithStock[]> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    params.append('limit', String(limit));
    const { data } = await api.get(`/stock-locations/${locationId}/products-with-stock?${params}`);
    return Array.isArray(data) ? data : [];
  },
};

/** Ligne de `GET /stock-locations/:id/products-with-stock`. */
export interface ProductWithStock {
  /** Identifiant de la ligne de stock (pas du produit). */
  id: number;
  produit_id: number;
  produit_nom: string;
  reference: string;
  prix_vente: string | number;
  quantite: number;
  /** Quantité disponible à cet emplacement. */
  quantite_disponible: number;
}

// ========== USER LOCATION ASSIGNMENTS ==========
export const userLocationAssignmentService = {
  getUsers: async (): Promise<any> => {
    const { data } = await api.get('/user-location-assignments/users');
    return data;
  },

  getLocations: async (): Promise<any> => {
    const { data } = await api.get('/user-location-assignments/locations');
    return data;
  },

  getByUserId: async (userId: number): Promise<any> => {
    const { data } = await api.get(`/user-location-assignments/${userId}`);
    return data;
  },

  update: async (userId: number, payload: { location_ids: number[]; default_location_id?: number | null }): Promise<any> => {
    const { data } = await api.put(`/user-location-assignments/${userId}`, payload);
    return data;
  },
};

// ========== STOCK TRANSFERS ==========
export const stockTransferService = {
  getAll: async (search?: string, statut?: string, page = 1, limit = 20): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    const { data } = await api.get(`/stock-transfers?${params}`);
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/stock-transfers/${id}`);
    return data;
  },

  create: async (transfer: {
    location_source_id: number;
    location_destination_id: number;
    lignes: { produit_id: number; quantite_demandee: number }[];
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post('/stock-transfers', transfer);
    return data;
  },

  complete: async (id: number): Promise<void> => {
    await api.post(`/stock-transfers/${id}/complete`);
  },

  /** Annule un transfert non encore complété et relâche le stock réservé. */
  cancel: async (id: number): Promise<void> => {
    await api.post(`/stock-transfers/${id}/cancel`);
  },
};


// ========== FACTURES FOURNISSEUR ==========
export const factureFournisseurService = {
  getAll: async (search?: string, statut?: string, fournisseur_id?: number, page = 1, limit = 20): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    if (fournisseur_id) params.append('fournisseur_id', fournisseur_id.toString());
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    const { data } = await api.get(`/factures-fournisseur?${params}`);
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/factures-fournisseur/${id}`);
    return data;
  },

  /** Totaux sur toutes les factures fournisseur (reste à payer, en retard…). */
  getStats: async (): Promise<Record<string, unknown>> => {
    const { data } = await api.get('/factures-fournisseur/stats');
    return data ?? {};
  },

  getMatchConfig: async (): Promise<any> => {
    const { data } = await api.get('/factures-fournisseur/match-config');
    return data?.data ?? data;
  },
  updateMatchConfig: async (payload: { qte_tolerance_pct?: number; prix_tolerance_pct?: number; bloquer?: boolean }): Promise<any> => {
    const { data } = await api.put('/factures-fournisseur/match-config', payload);
    return data?.data ?? data;
  },

  create: async (facture: {
    tiers_id: number;
    fournisseur_id?: number;
    reception_id?: number;
    commande_id?: number;
    numero_facture_fournisseur: string;
    date_facture: string;
    date_echeance?: string;
    condition_paiement?: string;
    lignes: { produit_id?: number | null; description?: string; quantite: number; prix_unitaire: number }[];
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post('/factures-fournisseur', facture);
    return data;
  },

  recordPayment: async (factureId: number, payment: {
    montant: number;
    methode_paiement: string;
    reference?: string;
  }): Promise<void> => {
    await api.post(`/factures-fournisseur/${factureId}/paiement`, payment);
  },
};

// ========== GENERAL LEDGER ==========
export const generalLedgerService = {
  getAll: async (filters: {
    journal?: string;
    date_debut?: string;
    date_fin?: string;
    compte_id?: number;
    numero_piece?: string;
    description?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<any> => {
    const { data } = await api.get('/general-ledger', { params: filters });
    return data;
  },

  getChartOfAccounts: async (actifOnly = true): Promise<any> => {
    const { data } = await api.get(`/general-ledger/chart-of-accounts?actif_only=${actifOnly}`);
    return data;
  },

  getTrialBalance: async (dateDebut: string, dateFin: string): Promise<any> => {
    const { data } = await api.get('/general-ledger/trial-balance', {
      params: { date_debut: dateDebut, date_fin: dateFin }
    });
    return data;
  },

  /**
   * Toutes les écritures filtrées, plafonnées côté serveur : `truncated` dit
   * que l'export a été coupé (l'intercepteur commun le perdait).
   */
  exportAll: async (params: {
    journal?: string;
    date_debut?: string;
    date_fin?: string;
    compte_id?: number;
    numero_piece?: string;
    description?: string;
  }): Promise<{ data: unknown[]; truncated: boolean }> => {
    const { data: body } = await api.get('/general-ledger/export', { params, keepEnvelope: true });
    return { data: Array.isArray(body?.data) ? body.data : [], truncated: body?.truncated === true };
  },

  exportPdf: async (params: { journal?: string; date_debut?: string; date_fin?: string; compte_id?: number; numero_piece?: string; description?: string; type?: string }): Promise<Blob> => {
    const q = new URLSearchParams();
    if (params.journal) q.append('journal', params.journal);
    if (params.date_debut) q.append('date_debut', params.date_debut);
    if (params.date_fin) q.append('date_fin', params.date_fin);
    if (params.compte_id) q.append('compte_id', String(params.compte_id));
    if (params.numero_piece) q.append('numero_piece', params.numero_piece);
    if (params.description) q.append('description', params.description);
    if (params.type) q.append('type', params.type);
    const response = await api.get(`/general-ledger/export-pdf?${q.toString()}`, { responseType: 'blob' });
    return response.data;
  },

  exportIncomeStatementPdf: async (dateDebut: string, dateFin: string): Promise<Blob> => {
    const response = await api.get('/general-ledger/income-statement/export-pdf', {
      params: { date_debut: dateDebut, date_fin: dateFin },
      responseType: 'blob',
    });
    return response.data;
  },

  exportBalanceSheetPdf: async (dateFin: string): Promise<Blob> => {
    const response = await api.get('/general-ledger/balance-sheet/export-pdf', {
      params: { date_fin: dateFin },
      responseType: 'blob',
    });
    return response.data;
  },
};

// ========== EMPLOYES ==========
export const employeService = {
  getAll: async (search?: string, departement?: string, actif?: boolean, page = 1, limit = 20, sort?: string, order?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (departement) params.append('departement', departement);
    if (actif !== undefined) params.append('actif', actif.toString());
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (sort) params.append('sort', sort);
    if (order) params.append('order', order);
    const { data } = await api.get(`/employes?${params}`);
    return data;
  },

  create: async (employe: {
    matricule: string;
    nom_complet: string;
    poste?: string;
    departement?: string;
    date_embauche: string;
    date_naissance?: string;
    telephone?: string;
    email?: string;
    adresse?: string;
    salaire_base?: number;
    commission_taux?: number;
  }): Promise<any> => {
    const { data } = await api.post('/employes', employe);
    return data;
  },

  update: async (id: number, employe: Partial<{
    matricule: string;
    nom_complet: string;
    poste: string;
    departement: string;
    date_embauche: string;
    date_naissance: string;
    telephone: string;
    email: string;
    adresse: string;
    salaire_base: number;
    commission_taux: number;
    actif: boolean;
  }>): Promise<any> => {
    const { data } = await api.put(`/employes/${id}`, employe);
    return data;
  },

  /**
   * Détail des commissions d'un employé. Les lignes sont créées par le trigger
   * `trg_commission_vente` (migration 100) à chaque facture émise ; celles dont
   * la facture a été annulée ou supprimée sont exclues côté serveur.
   */
  getCommissions: async (employeId: number, dateDebut: string, dateFin: string): Promise<any> => {
    const { data } = await api.get(`/employes/${employeId}/commissions`, {
      params: { date_debut: dateDebut, date_fin: dateFin }
    });
    return data;
  },

  getCommissionSummary: async (employeId: number, dateDebut: string, dateFin: string): Promise<any> => {
    const { data } = await api.get(`/employes/${employeId}/commission-summary`, {
      params: { date_debut: dateDebut, date_fin: dateFin }
    });
    return data;
  },
};


// ========== PAYROLL (PAIE) ==========
export const payrollService = {
  getAll: async (page = 1, limit = 20): Promise<any> => {
    const { data } = await api.get(`/payroll?page=${page}&limit=${limit}`);
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/payroll/${id}`);
    return data;
  },
  create: async (periode: string, notes?: string): Promise<any> => {
    const { data } = await api.post('/payroll', { periode, notes });
    return data;
  },

  validate: async (id: number): Promise<any> => {
    const { data } = await api.post(`/payroll/${id}/valider`);
    return data;
  },
  markPaid: async (id: number, methode_paiement?: string): Promise<any> => {
    const { data } = await api.post(`/payroll/${id}/payer`, { methode_paiement });
    return data;
  },
  cancel: async (id: number): Promise<any> => {
    const { data } = await api.post(`/payroll/${id}/annuler`);
    return data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/payroll/${id}`);
  },
  getPayslipPdf: async (payslipId: number): Promise<Blob> => {
    const response = await api.get(`/payroll/payslips/${payslipId}/pdf`, { responseType: 'blob' });
    return response.data;
  },
  getConfig: async (): Promise<any> => {
    const { data } = await api.get('/payroll/config');
    return data?.data ?? data;
  },
  updateCotisation: async (id: number, payload: { taux_salarial?: number; taux_patronal?: number; plafond?: number | null; actif?: boolean }): Promise<any> => {
    const { data } = await api.put(`/payroll/config/cotisations/${id}`, payload);
    return data?.data ?? data;
  },
  /**
   * Ajoute une cotisation (CNPS…) — U-11, admin. Taux en FRACTION de 0 à 1
   * (6,3 % → 0.063), code en majuscules (lettres, chiffres, « _ »). `201` avec
   * la ligne créée ; `409` si le code existe déjà.
   */
  createCotisation: async (payload: {
    code: string;
    libelle: string;
    taux_salarial: number;
    taux_patronal: number;
    plafond?: number | null;
    actif?: boolean;
  }): Promise<any> => {
    const { data } = await api.post('/payroll/config/cotisations', payload);
    return data?.data ?? data;
  },
  replaceBaremes: async (baremes: { tranche_min: number; tranche_max: number | null; taux: number }[]): Promise<any> => {
    const { data } = await api.put('/payroll/config/baremes', { baremes });
    return data?.data ?? data;
  },
};


// ========== DEVIS ==========
export const devisService = {
  getAll: async (search?: string, statut?: string, page = 1, limit = 20, sort = 'date_devis', order = 'desc'): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('sort', sort);
    params.append('order', order);
    const { data } = await api.get(`/devis?${params}`);
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/devis/${id}`);
    return data;
  },

  create: async (devis: {
    tiers_id: number;
    client_id?: number;
    location_id?: number;
    lignes: { produit_id: number; quantite: number; prix_unitaire: number }[];
    notes?: string;
    /** Fin de validité « AAAA-MM-JJ » ; sans elle, le serveur met J+30. */
    date_validite?: string;
  }): Promise<any> => {
    const { data } = await api.post('/devis', devis);
    return data;
  },

  updateStatut: async (id: number, statut: string): Promise<void> => {
    await api.patch(`/devis/${id}/statut`, { statut });
  },

  update: async (id: number, devis: {
    tiers_id?: number;
    client_id?: number;
    location_id?: number;
    lignes?: { produit_id: number; quantite: number; prix_unitaire: number }[];
    notes?: string;
    date_validite?: string;
  }): Promise<any> => {
    const { data } = await api.put(`/devis/${id}`, devis);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/devis/${id}`);
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/devis/stats');
    return data.data || data;
  },

  exportAll: async (search?: string, statut?: string): Promise<any[]> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    params.append('page', '1');
    params.append('limit', '10000');
    const { data } = await api.get(`/devis?${params}`);
    return data.data || data;
  },

  /** PDF du devis généré par le serveur (`GET /devis/:id/pdf`), téléchargé. */
  downloadPdf: async (id: number, numero?: string): Promise<void> => {
    await downloadPdfBlob(`/devis/${id}/pdf`, pdfFilename('devis', numero ?? id));
  },
};

// ========== BONS DE LIVRAISON ==========
export const bonLivraisonService = {
  getAll: async (search?: string, statut?: string, page = 1, limit = 20, sort = 'date_bl', order = 'desc'): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('sort', sort);
    params.append('order', order);
    const { data } = await api.get(`/bons-livraison?${params}`);
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/bons-livraison/${id}`);
    return data;
  },

  create: async (bon: {
    tiers_id: number;
    client_id?: number;
    devis_id: number;
    lignes: { produit_id: number; quantite_commandee: number; quantite_livree?: number; prix_unitaire: number }[];
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post('/bons-livraison', bon);
    return data;
  },

  updateStatut: async (id: number, statut: string): Promise<void> => {
    await api.patch(`/bons-livraison/${id}/statut`, { statut });
  },

  convertToFacture: async (id: number): Promise<any> => {
    const { data } = await api.post(`/bons-livraison/${id}/convert`);
    return data;
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/bons-livraison/stats');
    return data.data || data;
  },

  exportAll: async (search?: string, statut?: string): Promise<any[]> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    params.append('page', '1');
    params.append('limit', '10000');
    const { data } = await api.get(`/bons-livraison?${params}`);
    return data.data ?? data;
  },

  /** PDF du bon de livraison généré par le serveur (`GET /bons-livraison/:id/pdf`), téléchargé. */
  downloadPdf: async (id: number, numero?: string): Promise<void> => {
    await downloadPdfBlob(`/bons-livraison/${id}/pdf`, pdfFilename('bon-livraison', numero ?? id));
  },
};

// ========== AVOIRS (CREDIT NOTES) ==========
/** `POST /avoirs/:id/rembourser` — 201 (E3). */
export interface AvoirRefundResult {
  avoir_id: number;
  numero_avoir: string;
  montant: number | string;
  methode_paiement: PaymentMethod;
  /** Sortie de caisse créée (espèces), sinon `null`. */
  mouvement_caisse_id?: number | null;
  /** Phrase de confirmation du serveur, reprise telle quelle dans le toast. */
  message?: string;
}

export const creditNoteService = {
  getAll: async (
    search?: string,
    statut?: string,
    page = 1,
    limit = 20,
    sort?: string,
    order?: 'asc' | 'desc',
    avoirType?: string
  ): Promise<Page<any>> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    if (avoirType) params.append('avoir_type', avoirType);
    if (sort) params.append('sort', sort);
    if (order) params.append('order', order);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    const { data } = await api.get(`/avoirs?${params}`);
    return data;
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/avoirs/stats');
    // L'intercepteur a déjà déplié l'enveloppe : `data.data` valait undefined et
    // les tuiles affichaient « 0 avoir » au-dessus de trois avoirs validés (U-31).
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/avoirs/${id}`);
    return data;
  },

  createManual: async (avoir: {
    tiers_id: number;
    client_id?: number;
    facture_origine_id: number;
    lignes: { produit_id?: number; description?: string; quantite: number; prix_unitaire: number }[];
    avoir_type?: 'retour' | 'echange' | 'remise_commerciale' | 'erreur';
    notes?: string;
    /** Retour d'origine : lie l'avoir au retour approuvé (U-08). */
    retour_id?: number;
    location_id?: number;
  }): Promise<any> => {
    const { data } = await api.post('/avoirs/manual', avoir);
    return data;
  },

  /**
   * Crée l'avoir d'un retour approuvé (`traite`) en une fois : client, facture
   * d'origine et lignes repris du retour (U-08, admin/manager). `201` →
   * `{ avoir_id, numero_avoir }` ; le retour porte ensuite `avoir_id` et
   * `numero_avoir` (liste et détail).
   */
  createFromRetour: async (retourId: number): Promise<{ avoir_id: number; numero_avoir: string }> => {
    const { data } = await api.post('/avoirs/from-retour', { retour_id: retourId });
    return data;
  },
  /**
   * Impute un avoir « valide » sur une facture du même client (E1 : il réduit
   * le reste dû de CETTE facture). Le serveur refuse un avoir non validé, une
   * facture annulée ou un client différent. `message` : phrase du serveur.
   */
  applyToFacture: async (id: number, factureId: number): Promise<{ message?: string }> => {
    const { data: body } = await api.post(
      `/avoirs/${id}/apply-to-facture`,
      { facture_id: factureId },
      { keepEnvelope: true }
    );
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : undefined;
    return { message };
  },

  /**
   * Rembourse un avoir « valide » au client (E3, gérant et administrateur).
   * En espèces, l'argent sort de la caisse ouverte du magasin de l'avoir :
   * `409 CAISSE_FERMEE` quand elle est fermée ; `409` aussi quand l'avoir n'est
   * plus utilisable. L'avoir passe « utilisé ».
   */
  refund: async (
    id: number,
    body: { methode_paiement: PaymentMethod; notes?: string; reference?: string }
  ): Promise<AvoirRefundResult> => {
    const { data: raw } = await api.post(`/avoirs/${id}/rembourser`, body, { keepEnvelope: true });
    const result = (isRecord(raw) && isRecord(raw.data) ? raw.data : raw) ?? {};
    const message =
      (isRecord(raw) && typeof raw.message === 'string' ? raw.message : undefined) ??
      (isRecord(result) && typeof result.message === 'string' ? result.message : undefined);
    return { ...(result as Partial<AvoirRefundResult>), message } as AvoirRefundResult;
  },

  /** PDF de l'avoir généré par le serveur (`GET /avoirs/:id/pdf`), téléchargé. */
  downloadPdf: async (id: number, numero?: string): Promise<void> => {
    await downloadPdfBlob(`/avoirs/${id}/pdf`, pdfFilename('avoir', numero ?? id));
  },
};

// ========== RETOURS CLIENTS ==========
export const retourService = {
  /** Retours paginés ; `statut` : `en_attente`, `traite` ou `annule`. */
  getAll: async (page = 1, limit = 20, statut?: string): Promise<Page<any>> => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statut) params.append('statut', statut);
    const { data } = await api.get(`/retours?${params}`);
    return data;
  },

  /**
   * Statistiques des retours : `montant_total_rembourse` ne compte que les
   * retours approuvés (`traite`) ; `montant_en_attente` les retours à décider.
   */
  getStats: async (): Promise<any & { montant_total_rembourse?: number | string; montant_en_attente?: number | string }> => {
    const { data } = await api.get('/retours/stats');
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/retours/${id}`);
    return data;
  },

  /**
   * Le backend attend `client_id` (createReturnSchema) — toutes les lignes
   * portent la facture d'origine, et le stock n'est réintégré qu'à l'approbation.
   */
  create: async (retour: {
    client_id: number;
    lignes: { facture_id: number; produit_id: number; quantite: number; raison: string }[];
    notes?: string;
  }): Promise<{ id: number; numero_retour: string; total: number }> => {
    const { data } = await api.post('/retours', retour);
    return data;
  },

  updateStatut: async (id: number, statut: 'en_attente' | 'traite' | 'annule'): Promise<void> => {
    await api.put(`/retours/${id}/statut`, { statut });
  },
};

// ========== CAISSE ==========
/** Totaux par mode de paiement d'une session de caisse. */
export interface CaisseParMethode {
  methode_paiement: PaymentMethod | string;
  total_encaissements: number | string;
  total_decaissements: number | string;
  nb: number | string;
}

/**
 * Ventilation espèces / hors espèces d'une session (U-03), sur
 * `GET /caisse/session-active` et `GET /caisse/cloture-preview/:id`.
 * Les NUMERIC peuvent arriver en chaîne : passer par `toNumber`.
 */
/**
 * Ligne de `GET /caisse/:sessionId/mouvements`. P-M4 : le serveur résout le
 * document d'origine et le client, y compris pour les anciennes lignes dont le
 * libellé porte un identifiant interne (« Paiement facture #113 »).
 */
export interface CaisseMouvement {
  id: number;
  date_mouvement: string;
  type: 'encaissement' | 'decaissement';
  categorie: string;
  montant: number | string;
  methode_paiement: string;
  libelle: string | null;
  /** Facture client réglée (paiement client), sinon `null`. */
  facture_id?: number | null;
  numero_facture?: string | null;
  /** Avoir remboursé (E3), sinon `null`. */
  avoir_id?: number | null;
  numero_avoir?: string | null;
  tiers_id?: number | null;
  /** Client ou fournisseur concerné, quand le mouvement en a un. */
  tiers_nom?: string | null;
}

export interface CaisseCashBreakdown {
  /** Fonds de caisse + espèces encaissées − espèces décaissées : ce que le tiroir doit contenir. */
  expected_cash?: number | string;
  especes_encaissees?: number | string;
  especes_decaissees?: number | string;
  /** Carte, chèque, virement, mobile money : jamais dans le tiroir. */
  hors_especes_encaissees?: number | string;
  hors_especes_decaissees?: number | string;
  par_methode?: CaisseParMethode[];
  /** Total tous modes confondus (historique, ne pas présenter comme le contenu du tiroir). */
  solde_theorique?: number | string;
}

export const caisseService = {
  /** Magasins dont l'utilisateur peut tenir ou consulter la caisse. */
  getMagasins: async (): Promise<any[]> => {
    const { data } = await api.get('/caisse/magasins');
    return Array.isArray(data) ? data : [];
  },

  /**
   * Session ouverte d'un magasin, ou `null`. Porte (U-03) `expected_cash` —
   * les espèces que le tiroir doit contenir — et le détail par mode de
   * paiement ; `solde_theorique` reste le total tous modes confondus.
   */
  getSessionActive: async (magasinId: number): Promise<(CaisseCashBreakdown & Record<string, any>) | null> => {
    const { data } = await api.get('/caisse/session-active', { params: { magasin_id: magasinId } });
    return data ?? null;
  },

  getSessionDetail: async (sessionId: number): Promise<any> => {
    const { data } = await api.get(`/caisse/session/${sessionId}`);
    return data;
  },

  /** Mouvements d'une session, du plus ancien au plus récent. */
  getMouvements: async (sessionId: number): Promise<CaisseMouvement[]> => {
    const { data } = await api.get(`/caisse/${sessionId}/mouvements`);
    return Array.isArray(data) ? data : [];
  },

  /** Aperçu de clôture : espèces attendues, totaux par mode, mouvements hors caisse. */
  getCloturePreview: async (sessionId: number, fondFinalCompte?: number): Promise<CaisseCashBreakdown & Record<string, any>> => {
    const { data } = await api.get(`/caisse/cloture-preview/${sessionId}`, {
      params: fondFinalCompte !== undefined ? { fond_final_compte: fondFinalCompte } : undefined,
    });
    return data;
  },

  ouvrir: async (payload: { magasin_id: number; fond_initial: number; commentaire_ouverture?: string }): Promise<any> => {
    const { data } = await api.post('/caisse/ouvrir', payload);
    return data;
  },

  cloturer: async (
    sessionId: number,
    payload: { fond_final_compte: number; commentaire_cloture?: string }
  ): Promise<any> => {
    const { data } = await api.post(`/caisse/cloturer/${sessionId}`, payload);
    return data;
  },

  /** Mouvement divers (apport, retrait banque, autre entrée/sortie) avec motif. */
  mouvementDivers: async (
    sessionId: number,
    payload: {
      type: 'encaissement' | 'decaissement';
      categorie: 'apport' | 'retrait_banque' | 'autre_entree' | 'autre_sortie';
      montant: number;
      methode_paiement: PaymentMethod;
      libelle: string;
      idempotency_key?: string;
    }
  ): Promise<any> => {
    const { data } = await api.post(`/caisse/${sessionId}/mouvement-divers`, payload);
    return data;
  },

  /** Sessions de caisse clôturées/ouvertes, paginées ({ data, pagination } après intercepteur). */
  getHistorique: async (params: {
    magasin_id?: number;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<any> => {
    const q: Record<string, string> = {};
    if (params.magasin_id) q.magasin_id = String(params.magasin_id);
    if (params.from) q.from = params.from;
    if (params.to) q.to = params.to;
    if (params.page) q.page = String(params.page);
    if (params.limit) q.limit = String(params.limit);
    const res = await api.get('/caisse/historique', { params: q });
    return res.data;
  },

  getAudit: async (params: {
    orphans_only?: boolean;
    source_kind?: string;
    tiers_id?: number;
    date_from?: string;
    date_to?: string;
    limit?: number;
  } = {}): Promise<{ data: any[]; summary: any[]; orphans_total: number }> => {
    const q: Record<string, string> = {};
    if (params.orphans_only) q.orphans_only = 'true';
    if (params.source_kind) q.source_kind = params.source_kind;
    if (params.tiers_id) q.tiers_id = String(params.tiers_id);
    if (params.date_from) q.date_from = params.date_from;
    if (params.date_to) q.date_to = params.date_to;
    if (params.limit) q.limit = String(params.limit);
    // Enveloppe gardée : `summary` et `orphans_total` sont à la racine. Passe
    // par l'instance commune — une session expirée renvoie à la connexion.
    const { data: body } = await api.get('/caisse/audit', { params: q, keepEnvelope: true });
    return {
      data: Array.isArray(body?.data) ? body.data : [],
      summary: Array.isArray(body?.summary) ? body.summary : [],
      orphans_total: Number(body?.orphans_total) || 0,
    };
  },
};

// ========== DEMANDES DE REAPPROVISIONNEMENT (New RBC Workflow) ==========
export const demandeService = {
  getAll: async (filters?: {
    statut?: string;
    magasin_id?: number;
    depot_id?: number;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters?.statut) params.append('statut', filters.statut);
    if (filters?.magasin_id) params.append('magasin_id', String(filters.magasin_id));
    if (filters?.depot_id) params.append('depot_id', String(filters.depot_id));
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    params.append('page', String(filters?.page || 1));
    params.append('limit', String(filters?.limit || 20));
    const { data } = await api.get(`/demandes?${params}`);
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/demandes/${id}`);
    return data;
  },

  create: async (payload: {
    magasin_id: number;
    depot_id: number;
    lignes: { produit_id: number; quantite_demandee: number; notes?: string }[];
    motif?: string;
  }): Promise<any> => {
    const { data } = await api.post('/demandes', payload);
    return data;
  },

  update: async (id: number, payload: {
    lignes?: { produit_id: number; quantite_demandee: number; notes?: string }[];
    motif?: string;
  }): Promise<any> => {
    const { data } = await api.put(`/demandes/${id}`, payload);
    return data;
  },

  send: async (id: number): Promise<any> => {
    const { data } = await api.post(`/demandes/${id}/envoyer`);
    return data;
  },

  decide: async (id: number, payload: {
    decision: 'approuvee' | 'refusee';
    lignes_decision?: { ligne_id: number; quantite_approuvee: number }[];
    raison_refus?: string;
  }): Promise<any> => {
    const { data } = await api.post(`/demandes/${id}/decider`, payload);
    return data;
  },

  execute: async (id: number): Promise<any> => {
    const { data } = await api.post(`/demandes/${id}/executer`);
    return data;
  },

  close: async (id: number): Promise<any> => {
    const { data } = await api.post(`/demandes/${id}/cloturer`);
    return data;
  },

  cancel: async (id: number): Promise<any> => {
    const { data } = await api.post(`/demandes/${id}/annuler`);
    return data;
  },

  getDepotStock: async (depot_id: number, search?: string): Promise<any> => {
    const params = new URLSearchParams();
    params.append('depot_id', String(depot_id));
    if (search) params.append('search', search);
    const { data } = await api.get(`/demandes/stock/depot?${params}`);
    return data;
  },
};

// ========== ADMIN USER MANAGEMENT ==========
export const adminUserService = {
  getAll: async (page = 1, limit = 20): Promise<any> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    const { data } = await api.get(`/admin/users?${params}`);
    return data;
  },

  getRoles: async (): Promise<any[]> => {
    const { data } = await api.get('/admin/users/roles');
    return data?.data || data;
  },

  create: async (user: any): Promise<any> => {
    const { data } = await api.post('/admin/users', user);
    return data;
  },

  update: async (id: number, user: any): Promise<any> => {
    const { data } = await api.put(`/admin/users/${id}`, user);
    return data;
  },

  /** Déconnecte immédiatement toutes les sessions actives de cet utilisateur. */
  revokeAllSessions: async (userId: number): Promise<void> => {
    await api.post(`/auth/revoke-all-sessions/${userId}`);
  },
};

// ========== REPORTS ==========
export const reportService = {
  /**
   * Balance âgée des créances clients, paginée, avec `summary.montant_total`
   * (total dû sur tout le jeu filtré — Relances « Total à recouvrer »).
   */
  getReceivables: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    bucket?: string;
    min_amount?: number;
    location_id?: number;
  } = {}): Promise<PageWithSummary<any, { montant_total?: number }>> => {
    const { data } = await api.get('/reports/receivables', { params });
    return data;
  },

  getAlerts: async (): Promise<any> => {
    const { data } = await api.get('/reports/alerts');
    return data;
  },

  getYoYComparison: async (months = 6): Promise<any> => {
    const { data } = await api.get(`/reports/yoy?months=${months}`);
    return data?.data || data;
  },

  getRevenueForecast: async (): Promise<any> => {
    const { data } = await api.get('/reports/forecast');
    return data?.data || data;
  },

  /** Indicateurs du mois en cours (chiffre d'affaires, marge, créances, stock). */
  getDashboard: async (): Promise<unknown> => {
    const { data } = await api.get('/reports/dashboard');
    return data ?? null;
  },

  /** Compte de résultat simplifié de la période. */
  getPnl: async (params: ReportPeriod): Promise<unknown> => {
    const { data } = await api.get('/reports/pnl', { params });
    return data ?? null;
  },

  getSalesByCategory: async (params: ReportPeriod): Promise<unknown[]> => {
    const { data } = await api.get('/reports/sales-by-category', { params });
    return Array.isArray(data) ? data : [];
  },

  /** Produits de la période classés par chiffre d'affaires. */
  getProductPerformance: async (params: ReportPeriod & { limit?: number }): Promise<unknown[]> => {
    const { data } = await api.get('/reports/products', { params });
    return Array.isArray(data) ? data : [];
  },

  getMargins: async (params: ReportPeriod): Promise<unknown> => {
    const { data } = await api.get('/reports/margins', { params });
    return data ?? null;
  },

  /**
   * Toutes les créances filtrées, pour l'export CSV — plafonnées côté serveur :
   * `truncated` dit que la liste a été coupée.
   */
  exportReceivables: async (params: {
    search?: string;
    bucket?: string;
    min_amount?: number;
    location_id?: number;
  } = {}): Promise<{ data: unknown[]; truncated: boolean }> => {
    const { data: body } = await api.get('/reports/receivables/export', { params, keepEnvelope: true });
    return { data: Array.isArray(body?.data) ? body.data : [], truncated: body?.truncated === true };
  },
};

/** Période d'un rapport : dates « AAAA-MM-JJ » incluses. */
export interface ReportPeriod {
  date_debut: string;
  date_fin: string;
}

// ========== DÉPENSES ==========
export const depenseService = {
  /** Dépenses paginées ; un magasin non affecté à l'utilisateur répond 403. */
  getAll: async (params: {
    magasin_id?: number;
    categorie_id?: number;
    methode_paiement?: string;
    date_debut?: string;
    date_fin?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<Page<any>> => {
    const { data } = await api.get('/depenses', { params });
    if (Array.isArray(data)) {
      return { data, pagination: { page: 1, limit: data.length, total: data.length, totalPages: 1 } };
    }
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/depenses/${id}`);
    return data;
  },

  /** Catégories de dépense (liste vide sur une instance neuve non initialisée). */
  getCategories: async (): Promise<any[]> => {
    const { data } = await api.get('/depenses/categories/list');
    return Array.isArray(data) ? data : [];
  },

  create: async (payload: {
    magasin_id: number;
    categorie_id: number;
    montant: number;
    methode_paiement: PaymentMethod;
    description: string;
    date_depense?: string;
    beneficiaire_libre?: string;
    fournisseur_id?: number | null;
    justificatif_url?: string;
  }): Promise<any> => {
    const { data } = await api.post('/depenses', payload);
    return data;
  },

  update: async (id: number, payload: Partial<{
    categorie_id: number;
    montant: number;
    methode_paiement: PaymentMethod;
    description: string;
    date_depense: string;
    beneficiaire_libre: string;
    fournisseur_id: number | null;
    justificatif_url: string;
  }>): Promise<any> => {
    const { data } = await api.put(`/depenses/${id}`, payload);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/depenses/${id}`);
  },
};

// ========== COMPANY SETTINGS ==========
export interface CompanySettings {
  id: number;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  site_web: string | null;
  nif: string | null;
  rc: string | null;
  ai: string | null;
  cb: string | null;
  devise: string;
  logo_url: string | null;
  taux_conversion: number;
  /** Modules masqués dans l'interface — liste d'exclusion (migration 098). */
  modules_desactives: string[];
  /** Métier du client (migration 109) : préréglage des modules, écran de vente. */
  type_activite: TypeActivite;
  /** Message imprimé en bas du ticket de caisse (migration 109), `null` = aucun. */
  ticket_message: string | null;
}

export type TypeActivite = 'general' | 'informatique' | 'habillement' | 'libre_service';

let cachedSettings: CompanySettings | null = null;
let settingsCacheTimestamp = 0;
let settingsInflight: Promise<CompanySettings> | null = null;
const SETTINGS_CACHE_TTL = 60_000;

export const companySettingsService = {
  get: async (force = false): Promise<CompanySettings> => {
    const now = Date.now();
    if (!force && cachedSettings && (now - settingsCacheTimestamp) < SETTINGS_CACHE_TTL) {
      return cachedSettings;
    }
    // Plusieurs lecteurs au démarrage (cadre, page Paramètres) : une seule requête.
    if (!force && settingsInflight) return settingsInflight;
    const request = api
      .get('/company-settings')
      .then(({ data }) => {
        cachedSettings = data;
        settingsCacheTimestamp = Date.now();
        return data as CompanySettings;
      })
      .finally(() => {
        if (settingsInflight === request) settingsInflight = null;
      });
    settingsInflight = request;
    return request;
  },

  update: async (settings: Partial<CompanySettings>): Promise<CompanySettings> => {
    const { data } = await api.put('/company-settings', settings);
    cachedSettings = data;
    settingsCacheTimestamp = Date.now();
    return data;
  },
};

// ========== CRM ==========
export const crmService = {
  getInteractions: async (tiersId: number): Promise<any[]> => {
    const { data } = await api.get(`/crm/interactions/${tiersId}`);
    return data?.data || data || [];
  },

  /** Interactions tous tiers confondus, filtrables par type (ex. « relance »). */
  listInteractions: async (params: {
    type?: string;
    tiers_id?: number;
    page?: number;
    limit?: number;
  } = {}): Promise<any[]> => {
    const query = new URLSearchParams();
    if (params.type) query.append('type', params.type);
    if (params.tiers_id) query.append('tiers_id', String(params.tiers_id));
    query.append('page', String(params.page ?? 1));
    query.append('limit', String(params.limit ?? 200));
    const { data } = await api.get(`/crm/interactions?${query}`);
    return data?.data || data || [];
  },

  createInteraction: async (interaction: {
    tiers_id: number;
    type: string;
    sujet: string;
    description?: string;
    date_rappel?: string;
    priorite?: string;
  }): Promise<any> => {
    const { data } = await api.post('/crm/interactions', interaction);
    return data?.data || data;
  },

  deleteInteraction: async (id: number): Promise<void> => {
    await api.delete(`/crm/interactions/${id}`);
  },

  getTaches: async (tiersId: number): Promise<any[]> => {
    const { data } = await api.get(`/crm/taches?tiers_id=${tiersId}`);
    return data?.data || data || [];
  },

  createTache: async (tache: {
    tiers_id?: number;
    titre: string;
    description?: string;
    priorite?: string;
    date_echeance?: string;
  }): Promise<any> => {
    const { data } = await api.post('/crm/taches', tache);
    return data?.data || data;
  },

  updateTacheStatut: async (id: number, statut: string): Promise<void> => {
    await api.patch(`/crm/taches/${id}/statut`, { statut });
  },

  deleteTache: async (id: number): Promise<void> => {
    await api.delete(`/crm/taches/${id}`);
  },
};

// ========== AUDIT LOG ==========
export const auditService = {
  getLogs: async (filters: {
    table?: string;
    record_id?: number;
    action?: string;
    date_from?: string;
    date_to?: string;
    user_id?: number;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: unknown[]; total: number }> => {
    const params = new URLSearchParams();
    if (filters.table) params.append('table', filters.table);
    if (filters.record_id) params.append('record_id', filters.record_id.toString());
    if (filters.action) params.append('action', filters.action);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.user_id) params.append('user_id', filters.user_id.toString());
    params.append('page', (filters.page || 1).toString());
    params.append('limit', (filters.limit || 50).toString());
    // Enveloppe gardée : `total` est à la racine, hors de `pagination` — sans
    // elle le journal s'affichait toujours vide.
    const { data: body } = await api.get(`/admin/audit?${params}`, { keepEnvelope: true });
    const data = Array.isArray(body?.data) ? body.data : [];
    const total = Number(body?.total ?? body?.pagination?.total ?? data.length) || 0;
    return { data, total };
  },
};

// ========== COMPTABILITÉ ==========
export const comptabiliteService = {
  /**
   * Saisie d'une pièce comptable manuelle. Le backend (enregistrerPieceSchema)
   * exige: date_ecriture, libelle, lignes >= 2 { compte_numero, debit, credit };
   * il rejette 400 (déséquilibre, compte inconnu) ou période clôturée.
   *
   * Seul chemin de saisie : il numérote la pièce lui-même et journalise
   * l'audit, contrairement à l'ancien /general-ledger/manual-entry supprimé
   * le 2026-09-07.
   */
  enregistrerPiece: async (payload: {
    journal?: string;
    date_ecriture: string;
    libelle: string;
    lignes: { compte_numero: string; debit: number; credit: number; tiers_id?: number | null }[];
    reference_type?: string;
    reference_id?: number;
  }): Promise<any> => {
    const { data } = await api.post('/comptabilite/ecritures', payload);
    return data;
  },

  getGrandLivre: async (compteNumero: string, date_debut?: string, date_fin?: string): Promise<any[]> => {
    const q = new URLSearchParams();
    if (date_debut) q.append('date_debut', date_debut);
    if (date_fin) q.append('date_fin', date_fin);
    const { data } = await api.get(`/comptabilite/grand-livre/${compteNumero}?${q}`);
    return data?.data || data;
  },

  getTresorerie: async (jours: number = 90): Promise<any> => {
    const { data } = await api.get(`/comptabilite/tresorerie?jours=${jours}`);
    return data?.data || data;
  },
};

// ========== ATTACHMENTS ==========
export const attachmentService = {
  list: async (entity_type: string, entity_id: number): Promise<any[]> => {
    const { data } = await api.get('/attachments', { params: { entity_type, entity_id } });
    return data?.data ?? data ?? [];
  },

  upload: async (entity_type: string, entity_id: number, file: File): Promise<any> => {
    const contenu_base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const { data } = await api.post('/attachments', {
      entity_type, entity_id, filename: file.name, mime_type: file.type, contenu_base64,
    });
    return data?.data ?? data;
  },

  download: async (id: number, filename: string): Promise<void> => {
    const response = await api.get(`/attachments/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/attachments/${id}`);
  },
};

// ── Inventaire physique (/api/inventaires, migration 111) ───────────────────

export type InventaireStatut = 'en_cours' | 'valide' | 'annule';
export type InventaireFiltreLignes = 'tous' | 'a_compter' | 'comptes' | 'ecarts';

/**
 * En-tête d'un inventaire. Les champs d'écart manquent pour un compteur
 * pendant un comptage à l'aveugle ; `valeur_ecart` n'est servi qu'au gérant et
 * à l'administrateur.
 */
export interface Inventaire {
  id: number;
  numero: string;
  location_id: number;
  location_nom: string;
  location_type: 'magasin' | 'depot';
  statut: InventaireStatut;
  categorie: string | null;
  comptage_aveugle: boolean;
  notes: string | null;
  created_at: string;
  date_validation: string | null;
  cree_par_nom: string | null;
  valide_par_nom: string | null;
  nb_lignes: number;
  nb_comptees: number;
  nb_ecarts?: number;
  unites_en_plus?: number;
  unites_en_moins?: number;
  valeur_ecart?: number;
  /** Détail seulement : ce que le rôle courant a le droit de voir. */
  voit_ecarts?: boolean;
  voit_valeurs?: boolean;
}

export interface InventaireLigne {
  id: number;
  produit_id: number;
  produit_nom: string;
  reference: string;
  code_barre: string | null;
  categorie?: string | null;
  quantite_comptee: number | null;
  quantite_theorique?: number;
  ecart?: number | null;
  cmp?: number;
  valeur_ecart?: number | null;
  ecart_applique?: number | null;
  compte_le: string | null;
  compte_par_nom?: string | null;
  /** Réponse d'un comptage : le produit n'était pas sur la feuille. */
  ajoutee_a_la_feuille?: boolean;
}

export interface InventaireValidation {
  id: number;
  numero: string;
  lignes_ajustees: number;
  unites_en_plus: number;
  unites_en_moins: number;
  valeur_ecart: number;
}

export const inventaireService = {
  getAll: async (
    search?: string,
    statut?: string,
    page = 1,
    limit = 20,
    locationId?: number
  ): Promise<Page<Inventaire>> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statut) params.append('statut', statut);
    if (locationId) params.append('location_id', String(locationId));
    params.append('page', String(page));
    params.append('limit', String(limit));
    const { data } = await api.get(`/inventaires?${params}`);
    return data;
  },

  getById: async (id: number): Promise<Inventaire> => {
    const { data } = await api.get(`/inventaires/${id}`);
    return data;
  },

  getLignes: async (
    id: number,
    options: { search?: string; filtre?: InventaireFiltreLignes; page?: number; limit?: number } = {}
  ): Promise<Page<InventaireLigne>> => {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.filtre && options.filtre !== 'tous') params.append('filtre', options.filtre);
    params.append('page', String(options.page ?? 1));
    params.append('limit', String(options.limit ?? 50));
    const { data } = await api.get(`/inventaires/${id}/lignes?${params}`);
    return data;
  },

  create: async (payload: {
    location_id: number;
    categorie?: string;
    comptage_aveugle?: boolean;
    notes?: string;
  }): Promise<{ id: number; numero: string; nb_lignes: number }> => {
    const { data } = await api.post('/inventaires', payload);
    return data;
  },

  /** `fixer` remplace la quantité comptée ; `ajouter` l'incrémente (un passage du lecteur = +1). */
  compter: async (
    id: number,
    payload: { produit_id?: number; code?: string; quantite: number; mode: 'fixer' | 'ajouter' }
  ): Promise<InventaireLigne> => {
    const { data } = await api.post(`/inventaires/${id}/comptages`, payload);
    return data;
  },

  effacerComptage: async (id: number, ligneId: number): Promise<void> => {
    await api.delete(`/inventaires/${id}/lignes/${ligneId}/comptage`);
  },

  valider: async (id: number, nonComptes: 'ignorer' | 'zero' = 'ignorer'): Promise<InventaireValidation> => {
    const { data } = await api.post(`/inventaires/${id}/valider`, { non_comptes: nonComptes });
    return data;
  },

  annuler: async (id: number): Promise<void> => {
    await api.post(`/inventaires/${id}/annuler`);
  },
};
