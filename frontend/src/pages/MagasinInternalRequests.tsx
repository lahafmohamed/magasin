import { useEffect, useMemo, useState, useCallback } from 'react';
import { internalStockRequestService, stockLocationService } from '../services/api';
import { toast } from 'sonner';
import { Search, ShoppingCart, Plus, Minus, Trash2, Send, Package } from 'lucide-react';

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  est_principal: boolean;
  actif: boolean;
}

interface ProductWithStock {
  id: number;
  produit_id: number;
  produit_nom: string;
  reference: string;
  quantite: number;
  quantite_reservee: number;
  quantite_disponible: number;
  prix_vente: string;
}

interface CartItem {
  produit_id: number;
  produit_nom: string;
  reference: string;
  quantite_demandee: number;
  stock_disponible: number;
}

interface InternalRequest {
  id: number;
  numero_demande: string;
  depot_nom: string;
  statut: string;
  numero_transfer?: string | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  en_attente: { label: 'En attente', className: 'badge-warning' },
  validee: { label: 'Validée', className: 'badge-info' },
  refusee: { label: 'Refusée', className: 'badge-error' },
  executee: { label: 'Livrée', className: 'badge-success' },
  annulee: { label: 'Annulée', className: 'badge-ghost' },
};

export default function MagasinInternalRequests() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [requests, setRequests] = useState<InternalRequest[]>([]);
  const [selectedMagasinId, setSelectedMagasinId] = useState<string>('');
  const [selectedDepotId, setSelectedDepotId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');

  const depots = useMemo(
    () => locations.filter((location) => location.est_principal && location.actif),
    [locations]
  );

  const magasins = useMemo(
    () => locations.filter((location) => !location.est_principal && location.actif),
    [locations]
  );

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedMagasinId) {
      void fetchRequests(parseInt(selectedMagasinId, 10));
    }
  }, [selectedMagasinId]);

  useEffect(() => {
    if (selectedDepotId) {
      void fetchProducts(parseInt(selectedDepotId, 10));
    }
  }, [selectedDepotId, debouncedSearch]);

  const initialize = async () => {
    try {
      setLoading(true);
      const locationsData = await stockLocationService.getAll();
      const allLocations: StockLocation[] = locationsData.data || locationsData;
      setLocations(allLocations);

      const depotsActifs = allLocations.filter((location) => location.est_principal && location.actif);
      const magasinsActifs = allLocations.filter((location) => !location.est_principal && location.actif);

      if (magasinsActifs[0]) {
        setSelectedMagasinId(String(magasinsActifs[0].id));
      }
      if (depotsActifs[0]) {
        setSelectedDepotId(String(depotsActifs[0].id));
      }
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async (depotId: number) => {
    try {
      setLoadingProducts(true);
      const response = await stockLocationService.getProductsWithStock(depotId, debouncedSearch, 100);
      setProducts(response.data || response || []);
    } catch {
      toast.error('Erreur chargement produits');
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchRequests = async (magasinId: number) => {
    try {
      const response = await internalStockRequestService.getAll({ magasin_id: magasinId, limit: 50 });
      setRequests(response.data || response);
    } catch {
      toast.error('Erreur chargement demandes');
    }
  };

  const addToCart = useCallback((product: ProductWithStock) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.produit_id === product.produit_id);
      if (existing) {
        return prev.map((item) =>
          item.produit_id === product.produit_id
            ? { ...item, quantite_demandee: item.quantite_demandee + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          produit_id: product.produit_id,
          produit_nom: product.produit_nom,
          reference: product.reference,
          quantite_demandee: 1,
          stock_disponible: product.quantite_disponible,
        },
      ];
    });
    setSearchQuery('');
    setDebouncedSearch('');
  }, []);

  const updateCartQuantity = useCallback((produitId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.produit_id === produitId
            ? { ...item, quantite_demandee: Math.max(0, item.quantite_demandee + delta) }
            : item
        )
        .filter((item) => item.quantite_demandee > 0)
    );
  }, []);

  const removeFromCart = useCallback((produitId: number) => {
    setCart((prev) => prev.filter((item) => item.produit_id !== produitId));
  }, []);

  const clearCart = () => {
    setCart([]);
    setNotes('');
  };

  const handleSubmitRequest = async () => {
    if (!selectedMagasinId || !selectedDepotId) {
      toast.error('Sélectionne un magasin et un dépôt');
      return;
    }

    if (cart.length === 0) {
      toast.error('Ajoute au moins un produit');
      return;
    }

    const lignes = cart.map((item) => ({
      produit_id: item.produit_id,
      quantite_demandee: item.quantite_demandee,
    }));

    try {
      setSubmitting(true);
      await internalStockRequestService.create({
        magasin_id: parseInt(selectedMagasinId, 10),
        depot_id: parseInt(selectedDepotId, 10),
        lignes,
        notes: notes || undefined,
      });

      toast.success('Demande envoyée au dépôt');
      clearCart();
      await fetchRequests(parseInt(selectedMagasinId, 10));
      if (selectedDepotId) {
        await fetchProducts(parseInt(selectedDepotId, 10));
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur de création');
    } finally {
      setSubmitting(false);
    }
  };

  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantite_demandee, 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Demandes de Réapprovisionnement</h1>
          <p className="text-sm opacity-70">Commande rapide de produits depuis le dépôt</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-70">
            Magasin: <strong>{magasins.find((m) => String(m.id) === selectedMagasinId)?.nom || '-'}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h2 className="card-title text-base">
                  Produits disponibles au dépôt
                </h2>
                <select
                  className="select select-bordered select-sm w-48"
                  value={selectedDepotId}
                  onChange={(e) => setSelectedDepotId(e.target.value)}
                >
                  {depots.map((depot) => (
                    <option key={depot.id} value={depot.id}>
                      {depot.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher un produit par nom ou référence..."
                  className="input input-bordered w-full pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {loadingProducts ? (
                <div className="flex justify-center py-8">
                  <span className="loading loading-spinner"></span>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 opacity-70">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Aucun produit trouvé</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[400px]">
                  <table className="table table-sm">
                    <thead className="sticky top-0 bg-base-100 z-10">
                      <tr>
                        <th>Référence</th>
                        <th>Produit</th>
                        <th className="text-right">Stock</th>
                        <th className="text-center w-32">Quantité</th>
                        <th className="text-center w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => {
                        const inCart = cart.find((item) => item.produit_id === product.produit_id);
                        const stockClass = product.quantite_disponible <= 5 
                          ? 'text-error' 
                          : product.quantite_disponible <= 20 
                            ? 'text-warning' 
                            : 'text-success';

                        return (
                          <tr key={product.produit_id} className={inCart ? 'bg-primary/5' : ''}>
                            <td className="font-mono text-sm">{product.reference}</td>
                            <td>{product.produit_nom}</td>
                            <td className={`text-right font-semibold ${stockClass}`}>
                              {product.quantite_disponible}
                            </td>
                            <td>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  className="btn btn-sm btn-outline h-7 w-7 p-0"
                                  onClick={() => updateCartQuantity(product.produit_id, -1)}
                                  disabled={!inCart}
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-12 text-center font-medium">
                                  {inCart?.quantite_demandee || 0}
                                </span>
                                <button
                                  className="btn btn-sm btn-primary h-7 w-7 p-0"
                                  onClick={() => {
                                    if (inCart) {
                                      updateCartQuantity(product.produit_id, 1);
                                    } else {
                                      addToCart(product);
                                    }
                                  }}
                                  disabled={product.quantite_disponible <= 0}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="text-center">
                              {inCart ? (
                                <button
                                  className="btn btn-sm btn-ghost text-error"
                                  onClick={() => removeFromCart(product.produit_id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="text-xs opacity-50">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title text-base">Historique des demandes</h2>
              <div className="overflow-x-auto max-h-[300px]">
                <table className="table table-sm table-zebra">
                  <thead className="sticky top-0 bg-base-100 z-10">
                    <tr>
                      <th>Numéro</th>
                      <th>Date</th>
                      <th>Statut</th>
                      <th>Transfert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4 opacity-70">
                          Aucune demande
                        </td>
                      </tr>
                    ) : requests.map((request) => (
                      <tr key={request.id}>
                        <td className="font-medium">{request.numero_demande}</td>
                        <td>{new Date(request.created_at).toLocaleDateString('fr-FR')}</td>
                        <td>
                          <span className={`badge ${statusConfig[request.statut]?.className || 'badge-ghost'}`}>
                            {statusConfig[request.statut]?.label || request.statut}
                          </span>
                        </td>
                        <td>{request.numero_transfer || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card bg-base-100 shadow sticky top-6">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h2 className="card-title text-base flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Panier
                </h2>
                {cart.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={clearCart}>
                    Vider
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-8 opacity-70">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Votre panier est vide</p>
                  <p className="text-xs mt-1">Ajoutez des produits depuis la liste</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.produit_id} className="flex items-center gap-2 p-2 bg-base-200 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.produit_nom}</p>
                        <p className="text-xs opacity-60">{item.reference}</p>
                        <p className="text-xs opacity-60">Stock: {item.stock_disponible}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="btn btn-sm btn-outline h-7 w-7 p-0"
                          onClick={() => updateCartQuantity(item.produit_id, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={item.stock_disponible}
                          className="input input-bordered input-sm w-16 text-center h-7"
                          value={item.quantite_demandee}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val <= 0) {
                              removeFromCart(item.produit_id);
                            } else {
                              setCart((prev) =>
                                prev.map((i) =>
                                  i.produit_id === item.produit_id
                                    ? { ...i, quantite_demandee: Math.min(val, item.stock_disponible) }
                                    : i
                                )
                              );
                            }
                          }}
                        />
                        <button
                          className="btn btn-sm btn-outline h-7 w-7 p-0"
                          onClick={() => updateCartQuantity(item.produit_id, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm text-error h-7 w-7 p-0"
                        onClick={() => removeFromCart(item.produit_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="divider my-4"></div>

              <div className="space-y-3">
                <div>
                  <label className="label py-1">
                    <span className="label-text text-xs">Notes (optionnel)</span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full"
                    rows={2}
                    placeholder="Précisions sur la demande..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Total articles:</span>
                  <span>{cartTotalItems} unités</span>
                </div>

                <button
                  className="btn btn-primary w-full gap-2"
                  onClick={handleSubmitRequest}
                  disabled={cart.length === 0 || submitting}
                >
                  {submitting ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Envoyer la demande
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}