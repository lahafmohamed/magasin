import axios from 'axios';
import { Produit, FactureComplete, Paiement, StatsDashboard } from '../types';
import type { PaymentMethod } from '../utils/paymentMethod';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Normalize the API envelope without mutating arrays. Paginated endpoints keep
 * both their rows and metadata in a stable `{ data, pagination }` contract.
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

export const api = axios.create({
  baseURL: '/api',
  // Auth is carried by the httpOnly `auth_token` cookie — send it on every request.
  withCredentials: true,
});

// Response interceptor: unwrap non-paginated data and preserve paginated pages.
api.interceptors.response.use(
  (response) => {
    return { ...response, data: normalizeApiResponseBody(response.data) };
  },
  (error) => {
    // On token expiry / auth failure, clear the session and bounce to login —
    // mirrors authService so requests through this instance don't fail silently.
    const status = error.response?.status;
    const url: string = error.config?.url || '';
    const isAuthCall = url.includes('/auth/login');
    if (status === 401 && !isAuthCall) {
      localStorage.removeItem('auth_user');
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

  getReorderSuggestions: async (): Promise<any[]> => {
    const { data } = await api.get('/produits/reorder-suggestions');
    return data?.data ?? data ?? [];
  },

  getById: async (id: number): Promise<Produit> => {
    const { data } = await api.get(`/produits/${id}`);
    return data;
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

  addStockMovement: async (id: number, movement: {
    type_mouvement: string;
    quantite: number;
    raison?: string;
    reference_liee?: string;
  }): Promise<{ stock: number }> => {
    const { data } = await api.post(`/produits/${id}/mouvements`, movement);
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

  getSuggestions: async (query: string, limit = 5): Promise<any[]> => {
    const params = new URLSearchParams();
    params.append('q', query);
    params.append('limit', limit.toString());
    const { data } = await api.get(`/produits/suggestions?${params}`);
    return data;
  },
};

// ========== VENTES (Magasin-only product picker) ==========
// Used exclusively by Facture and Devis forms. Backend filters dépôt at SQL level
// and rejects non-magasin location_id with HTTP 422.
export const ventesService = {
  searchProducts: async (
    search?: string,
    page = 1,
    limit = 20,
    sort = 'nom',
    order = 'asc',
    locationId?: number,
  ): Promise<any> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (locationId) params.append('location_id', locationId.toString());
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('sort', sort);
    params.append('order', order);
    const { data } = await api.get(`/produits/ventes?${params}`);
    return data;
  },

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

  getReleveDetaille: async (id: number, from?: string, to?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const { data } = await api.get(`/tiers/${id}/releve-detaille?${params}`);
    return data?.data ?? data;
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

  promouvoir: async (id: number, role: 'client' | 'fournisseur'): Promise<any> => {
    const { data } = await api.patch(`/tiers/${id}/promouvoir`, { role });
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

  recomputeAllocation: async (id: number): Promise<any> => {
    const { data } = await api.post(`/tiers/${id}/recompute-allocation`);
    return data;
  },
};

// ========== ACOMPTES ==========
export const acompteService = {
  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/acomptes/${id}`);
    return data;
  },
  listApplications: async (id: number): Promise<any[]> => {
    const { data } = await api.get(`/acomptes/${id}/applications`);
    return data ?? [];
  },
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
    // Reuses /api/comptes/:id/acomptes/disponibles for active-only list.
    // The endpoint returns the standard envelope, so the response interceptor
    // has already unwrapped it to the array — reading `.data` again yielded
    // undefined and silently emptied the list.
    const { data } = await api.get(`/comptes/${tiersId}/acomptes/disponibles`);
    return data ?? [];
  },
};

// ========== ACOMPTES FOURNISSEUR ==========
export const acompteFournisseurService = {
  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/acomptes/fournisseur/${id}`);
    return data;
  },
  listApplications: async (id: number): Promise<any[]> => {
    const { data } = await api.get(`/acomptes/fournisseur/${id}/applications`);
    return data ?? [];
  },
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

  updateStatut: async (id: number, statut: string): Promise<void> => {
    await api.put(`/factures/${id}/statut`, { statut });
  },

  delete: async (id: number, restaurerStock = false): Promise<void> => {
    await api.delete(`/factures/${id}`, { data: { restaurer_stock: restaurerStock } });
  },

  getStats: async (): Promise<StatsDashboard> => {
    const { data } = await api.get('/factures/stats');
    // Unwrap nested data if needed
    return data.data || data;
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
};

// ========== PAIEMENTS ==========
export const paiementService = {
  create: async (factureId: number, paiement: {
    montant: number;
    methode_paiement: PaymentMethod;
    date_paiement?: string;
    reference?: string;
    notes?: string;
  }): Promise<{ id: number; message: string }> => {
    const { data } = await api.post(`/factures/${factureId}/paiements`, paiement);
    return data;
  },

  getByFacture: async (factureId: number): Promise<Paiement[]> => {
    const { data } = await api.get(`/factures/${factureId}/paiements`);
    return data;
  },

  getAll: async (page = 1, limit = 20, methode?: string, dateDebut?: string, dateFin?: string): Promise<any> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (methode) params.append('methode', methode);
    if (dateDebut) params.append('date_debut', dateDebut);
    if (dateFin) params.append('date_fin', dateFin);
    const { data } = await api.get(`/paiements?${params}`);
    return data;
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/paiements/stats');
    return data;
  },

  update: async (id: number, paiement: {
    montant?: number;
    methode_paiement?: PaymentMethod;
    reference?: string;
    notes?: string;
    date_paiement?: string;
  }): Promise<void> => {
    await api.put(`/paiements/${id}`, paiement);
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

  delete: async (id: number): Promise<void> => {
    await api.delete(`/commandes/${id}`);
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
    lignes: { produit_id: number; quantite_commandee: number; quantite_recue: number; cout_unitaire: number; notes?: string }[];
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post('/receptions', reception);
    return data;
  },

  getPending: async (): Promise<any[]> => {
    const { data } = await api.get('/receptions/pending');
    return data;
  },

  getOrderDetails: async (commandeId: number): Promise<any> => {
    const { data } = await api.get(`/receptions/order/${commandeId}`);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/receptions/${id}`);
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/receptions/stats');
    return data;
  },
};

// ========== STOCK LOCATIONS ==========
export const stockLocationService = {
  getAll: async (): Promise<any> => {
    const { data } = await api.get('/stock-locations');
    return data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/stock-locations/${id}`);
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

  getProductsWithStock: async (locationId: number, search?: string, limit?: number): Promise<any> => {
    const params: Record<string, any> = {};
    if (search) params.search = search;
    if (limit) params.limit = limit;
    const { data } = await api.get(`/stock-locations/${locationId}/products-with-stock`, { params });
    return data;
  },
};

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

  getPayable: async (): Promise<any[]> => {
    const { data } = await api.get('/factures-fournisseur/payable');
    return data;
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/factures-fournisseur/stats');
    return data;
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

  getAccountLedger: async (compteId: number, dateDebut: string, dateFin: string): Promise<any> => {
    const { data } = await api.get(`/general-ledger/account/${compteId}/ledger`, {
      params: { date_debut: dateDebut, date_fin: dateFin }
    });
    return data;
  },

  createManualEntry: async (entry: {
    numero_piece: string;
    journal: string;
    date_ecriture: string;
    lignes: { compte_id: number; debit: number; credit: number; description?: string }[];
  }): Promise<void> => {
    await api.post('/general-ledger/manual-entry', entry);
  },

  getStats: async (date_debut?: string, date_fin?: string): Promise<any> => {
    const params: any = {};
    if (date_debut) params.date_debut = date_debut;
    if (date_fin) params.date_fin = date_fin;
    const { data } = await api.get('/general-ledger/stats', { params });
    return data;
  },

  getJournalBreakdown: async (dateDebut: string, dateFin: string): Promise<any> => {
    const { data } = await api.get('/general-ledger/journal-breakdown', {
      params: { date_debut: dateDebut, date_fin: dateFin }
    });
    return data;
  },

  exportAll: async (params: { journal?: string; date_debut?: string; date_fin?: string; compte_id?: number; numero_piece?: string; description?: string }): Promise<any> => {
    const { data } = await api.get('/general-ledger/export', { params });
    return data;
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

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/employes/${id}`);
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

  recordCommission: async (employeId: number, factureId: number, montantVente: number): Promise<void> => {
    await api.post(`/employes/${employeId}/commission`, {
      facture_id: factureId,
      montant_vente: montantVente,
    });
  },

  getCommissionSummary: async (employeId: number, dateDebut: string, dateFin: string): Promise<any> => {
    const { data } = await api.get(`/employes/${employeId}/commission-summary`, {
      params: { date_debut: dateDebut, date_fin: dateFin }
    });
    return data;
  },

  recordShift: async (shift: {
    employe_id: number;
    date_shift: string;
    heure_prevue_debut?: string;
    heure_prevue_fin?: string;
    heure_debut?: string;
    heure_fin?: string;
    statut?: string;
    notes?: string;
  }): Promise<void> => {
    await api.post('/employes/shifts', shift);
  },

  getStats: async (): Promise<any> => {
    const { data } = await api.get('/employes/stats');
    return data;
  },
};


// ========== PAYROLL (PAIE) ==========
export const payrollService = {
  getAll: async (page = 1, limit = 20): Promise<any> => {
    const { data } = await api.get(`/payroll?page=${page}&limit=${limit}`);
    return data;
  },
  getStats: async (): Promise<any> => {
    const { data } = await api.get('/payroll/stats');
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
  updatePayslip: async (payslipId: number, payload: { primes?: number; deductions?: number; notes?: string }): Promise<any> => {
    const { data } = await api.put(`/payroll/payslips/${payslipId}`, payload);
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
    valid_until?: string;
  }): Promise<any> => {
    const { data } = await api.post('/devis', devis);
    return data;
  },

  updateStatut: async (id: number, statut: string): Promise<void> => {
    await api.patch(`/devis/${id}/statut`, { statut });
  },

  convertToFacture: async (id: number): Promise<any> => {
    const { data } = await api.post(`/devis/${id}/convert`);
    return data;
  },

  update: async (id: number, devis: {
    tiers_id?: number;
    client_id?: number;
    location_id?: number;
    lignes?: { produit_id: number; quantite: number; prix_unitaire: number }[];
    notes?: string;
    valid_until?: string;
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

  delete: async (id: number): Promise<void> => {
    await api.delete(`/bons-livraison/${id}`);
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
};

// ========== AVOIRS (CREDIT NOTES) ==========
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
    return data.data;
  },

  getById: async (id: number): Promise<any> => {
    const { data } = await api.get(`/avoirs/${id}`);
    return data;
  },

  createFromRetour: async (retourId: number): Promise<any> => {
    const { data } = await api.post('/avoirs/from-retour', { retour_id: retourId });
    return data;
  },

  createManual: async (avoir: {
    tiers_id: number;
    client_id?: number;
    facture_origine_id: number;
    lignes: { produit_id?: number; description?: string; quantite: number; prix_unitaire: number }[];
    avoir_type?: 'retour' | 'echange' | 'remise_commerciale' | 'erreur';
    notes?: string;
  }): Promise<any> => {
    const { data } = await api.post('/avoirs/manual', avoir);
    return data;
  },

  updateStatut: async (id: number, statut: string): Promise<void> => {
    await api.patch(`/avoirs/${id}/statut`, { statut });
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/avoirs/${id}`);
  },
};

// ========== RETOURS CLIENTS ==========
export const retourService = {
  getAll: async (page = 1, limit = 20): Promise<Page<any>> => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    const { data } = await api.get(`/retours?${params}`);
    return data;
  },

  getStats: async (): Promise<any> => {
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
export const caisseService = {
  getMagasins: async (): Promise<any[]> => {
    const { data } = await api.get('/stock-locations');
    return data?.data || data || [];
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
    // Raw axios on purpose: the shared interceptor unwraps the envelope down to
    // `data` and would drop `summary` / `orphans_total`.
    const { data: body } = await axios.get('/api/caisse/audit', { params: q, withCredentials: true });
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
};

// ========== REPORTS ==========
export const reportService = {
  getAlerts: async (): Promise<any> => {
    const { data } = await api.get('/reports/alerts');
    return data;
  },

  getRevenueTrends: async (months = 12): Promise<any> => {
    const { data } = await api.get(`/reports/revenue-trends?months=${months}`);
    return data?.data || data;
  },

  getYoYComparison: async (months = 6): Promise<any> => {
    const { data } = await api.get(`/reports/yoy?months=${months}`);
    return data?.data || data;
  },

  getRevenueForecast: async (): Promise<any> => {
    const { data } = await api.get('/reports/forecast');
    return data?.data || data;
  },

  getConsolidatedDashboard: async (magasinId?: number): Promise<any> => {
    const params = magasinId ? `?magasin_id=${magasinId}` : '';
    const { data } = await api.get(`/reports/consolidated${params}`);
    return data?.data || data;
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
}

let cachedSettings: CompanySettings | null = null;
let settingsCacheTimestamp = 0;
const SETTINGS_CACHE_TTL = 60_000;

export const companySettingsService = {
  get: async (force = false): Promise<CompanySettings> => {
    const now = Date.now();
    if (!force && cachedSettings && (now - settingsCacheTimestamp) < SETTINGS_CACHE_TTL) {
      return cachedSettings;
    }
    const { data } = await api.get('/company-settings');
    cachedSettings = data;
    settingsCacheTimestamp = now;
    return data;
  },

  update: async (settings: Partial<CompanySettings>): Promise<CompanySettings> => {
    const { data } = await api.put('/company-settings', settings);
    cachedSettings = data;
    settingsCacheTimestamp = Date.now();
    return data;
  },

  getCached: (): CompanySettings | null => cachedSettings,
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

  getRappels: async (): Promise<any[]> => {
    const { data } = await api.get('/crm/rappels');
    return data?.data || data || [];
  },

  marquerRappelFait: async (id: number): Promise<void> => {
    await api.post(`/crm/rappels/${id}/done`);
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
  } = {}): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.table) params.append('table', filters.table);
    if (filters.record_id) params.append('record_id', filters.record_id.toString());
    if (filters.action) params.append('action', filters.action);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.user_id) params.append('user_id', filters.user_id.toString());
    params.append('page', (filters.page || 1).toString());
    params.append('limit', (filters.limit || 50).toString());
    const { data } = await api.get(`/admin/audit?${params}`);
    return data;
  },
};

// ========== COMPTABILITÉ ==========
export const comptabiliteService = {
  getPlanComptable: async (classe?: number): Promise<any[]> => {
    const params = classe ? `?classe=${classe}` : '';
    const { data } = await api.get(`/comptabilite/plan-comptable${params}`);
    return data?.data || data;
  },

  /**
   * Saisie d'une pièce comptable manuelle. Le backend (enregistrerPieceSchema)
   * exige: date_ecriture, libelle, lignes >= 2 { compte_numero, debit, credit };
   * il rejette 400 (déséquilibre, compte inconnu) ou période clôturée.
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

  getEcritures: async (params: {
    date_debut?: string;
    date_fin?: string;
    journal?: string;
    compte_numero?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<any> => {
    const q = new URLSearchParams();
    if (params.date_debut) q.append('date_debut', params.date_debut);
    if (params.date_fin) q.append('date_fin', params.date_fin);
    if (params.journal) q.append('journal', params.journal);
    if (params.compte_numero) q.append('compte_numero', params.compte_numero);
    if (params.page) q.append('page', params.page.toString());
    if (params.limit) q.append('limit', params.limit.toString());
    const { data } = await api.get(`/comptabilite/ecritures?${q}`);
    return data;
  },

  getJournal: async (params: {
    date_debut?: string;
    date_fin?: string;
    journal?: string;
  } = {}): Promise<any[]> => {
    const q = new URLSearchParams();
    if (params.date_debut) q.append('date_debut', params.date_debut);
    if (params.date_fin) q.append('date_fin', params.date_fin);
    if (params.journal) q.append('journal', params.journal);
    const { data } = await api.get(`/comptabilite/journal?${q}`);
    return data?.data || data;
  },

  getBalance: async (date_debut?: string, date_fin?: string): Promise<any[]> => {
    const q = new URLSearchParams();
    if (date_debut) q.append('date_debut', date_debut);
    if (date_fin) q.append('date_fin', date_fin);
    const { data } = await api.get(`/comptabilite/balance?${q}`);
    return data?.data || data;
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

  getRatios: async (date_debut?: string, date_fin?: string): Promise<any> => {
    const q = new URLSearchParams();
    if (date_debut) q.append('date_debut', date_debut);
    if (date_fin) q.append('date_fin', date_fin);
    const { data } = await api.get(`/comptabilite/ratios?${q}`);
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
