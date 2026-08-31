import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { demandeService, stockLocationService } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { PageLoading, Spinner } from '@/components/ui/loading';
import { getErrorMessage } from '@/utils/errors';
import {
  Plus,
  Minus,
  Trash2,
  Search,
  ArrowLeft,
  Send,
  Save,
  Package,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  location_type: 'depot' | 'magasin';
  est_principal: boolean;
}

interface DepotProduct {
  produit_id: number;
  reference: string;
  produit_nom: string;
  prix_vente: string;
  quantite_disponible: number;
}

interface CartItem {
  produit_id: number;
  reference: string;
  produit_nom: string;
  quantite_demandee: number;
  stock_disponible: number;
  notes?: string;
}

const demandeSchema = z.object({
  magasin_id: z.string().min(1, 'Veuillez sélectionner un magasin et un dépôt'),
  depot_id: z.string().min(1, 'Veuillez sélectionner un magasin et un dépôt'),
  motif: z.string().optional(),
});

type DemandeFormValues = z.infer<typeof demandeSchema>;

export default function DemandeForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  useAuth();
  const isEdit = !!id;

  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [depotProducts, setDepotProducts] = useState<DepotProduct[]>([]);
  // Le panier reste géré localement : sa logique (fusion, clamp au stock,
  // suppression à 0, panneau de navigation produit) est trop entangled pour useFieldArray.
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<DemandeFormValues>({
    resolver: zodResolver(demandeSchema),
    defaultValues: {
      magasin_id: '',
      depot_id: '',
      motif: '',
    },
  });

  const depotId = watch('depot_id');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Guard against losing a multi-line cart to an accidental tab close / reload.
  // (The cart is local state, not RHF, so this mirrors the sibling create pages'
  // beforeunload guard rather than useDraft autosave.)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (cart.length > 0 && !submitting) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [cart.length, submitting]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load locations
  useEffect(() => {
    loadLocations();
  }, []);

  // Load depot products when depot selected
  useEffect(() => {
    if (depotId) {
      loadDepotProducts(parseInt(depotId));
    }
  }, [depotId, debouncedSearch]);

  const loadExistingDemande = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await demandeService.getById(parseInt(id, 10));
      const demande = response.data || response;

      reset({
        magasin_id: String(demande.magasin_id),
        depot_id: String(demande.depot_id),
        motif: demande.motif || '',
      });

      setCart(demande.lignes.map((l: any) => ({
        produit_id: l.produit_id,
        reference: l.reference,
        produit_nom: l.produit_nom,
        quantite_demandee: l.quantite_demandee,
        stock_disponible: l.quantite_disponible || 0,
        notes: l.notes || '',
      })));
    } catch (err) {
      setCart([]);
      setError(err);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement de la demande'));
    } finally {
      setLoading(false);
    }
  }, [id, reset]);

  // Load existing demande if editing
  useEffect(() => {
    if (isEdit) {
      loadExistingDemande();
    }
  }, [isEdit, loadExistingDemande]);

  const loadLocations = async () => {
    try {
      const response = await stockLocationService.getAll();
      const allLocations = response.data || response || [];
      setLocations(allLocations);

      // Auto-select defaults based on user role
      const magasins = allLocations.filter((l: StockLocation) => l.location_type === 'magasin');
      const depots = allLocations.filter((l: StockLocation) => l.location_type === 'depot');

      if (!isEdit) {
        if (magasins.length > 0) {
          setValue('magasin_id', String(magasins[0].id));
        }
        if (depots.length > 0) {
          setValue('depot_id', String(depots[0].id));
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des emplacements'));
    }
  };

  const loadDepotProducts = async (depotIdArg: number) => {
    setLoadingProducts(true);
    try {
      const response = await demandeService.getDepotStock(depotIdArg, debouncedSearch);
      setDepotProducts(response.data || response || []);
    } catch (err) {
      setDepotProducts([]);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement du stock du dépôt'));
    } finally {
      setLoadingProducts(false);
    }
  };

  const addToCart = useCallback((product: DepotProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.produit_id === product.produit_id);
      if (existing) {
        return prev.map((item) =>
          item.produit_id === product.produit_id
            ? { ...item, quantite_demandee: Math.min(item.quantite_demandee + 1, product.quantite_disponible) }
            : item
        );
      }
      return [
        ...prev,
        {
          produit_id: product.produit_id,
          reference: product.reference,
          produit_nom: product.produit_nom,
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

  const updateCartNotes = useCallback((produitId: number, notes: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.produit_id === produitId ? { ...item, notes } : item
      )
    );
  }, []);

  const submitDemande = async (values: DemandeFormValues, andSend: boolean) => {
    if (cart.length === 0) {
      toast.error('Ajoutez au moins un produit au panier');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        magasin_id: parseInt(values.magasin_id),
        depot_id: parseInt(values.depot_id),
        motif: values.motif || undefined,
        lignes: cart.map((item) => ({
          produit_id: item.produit_id,
          quantite_demandee: item.quantite_demandee,
          notes: item.notes,
        })),
      };

      let demandeId: number;

      if (isEdit) {
        await demandeService.update(parseInt(id!), payload);
        demandeId = parseInt(id!);
      } else {
        const response = await demandeService.create(payload);
        demandeId = response.data?.id || response.id;
      }

      if (andSend) {
        await demandeService.send(demandeId);
        toast.success(isEdit ? 'Demande modifiée et envoyée' : 'Demande créée et envoyée au dépôt');
      } else {
        toast.success(isEdit ? 'Demande modifiée (brouillon)' : 'Demande créée (brouillon)');
      }

      navigate('/demandes');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la sauvegarde'));
    } finally {
      setSubmitting(false);
    }
  };

  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantite_demandee, 0);

  const magasins = locations.filter((l) => l.location_type === 'magasin');
  const depots = locations.filter((l) => l.location_type === 'depot');

  if (loading) {
    return <PageLoading message="Chargement de la demande…" />;
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 text-center" role="alert">
        <AlertCircle className="h-12 w-12 text-destructive opacity-80" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Échec du chargement</h2>
          <p className="text-muted-foreground">{getErrorMessage(error, 'Erreur lors du chargement de la demande')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/demandes')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour à la liste
          </Button>
          <Button onClick={loadExistingDemande} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/demandes')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Retour
        </Button>
        <h1 className="text-2xl font-bold">
          {isEdit ? 'Modifier la demande' : 'Nouvelle demande de réapprovisionnement'}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Location Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Emplacements</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="magasin">Magasin destinataire *</Label>
                <Controller
                  control={control}
                  name="magasin_id"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                      disabled={isEdit}
                    >
                      <SelectTrigger
                        id="magasin"
                        className="h-9 w-full text-sm"
                        {...fieldErrorProps('magasin', errors.magasin_id)}
                      >
                        <SelectValue placeholder="Sélectionner…" />
                      </SelectTrigger>
                      <SelectContent>
                        {magasins.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.nom} ({m.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError id="magasin">{errors.magasin_id?.message}</FieldError>
              </div>
              <div className="space-y-2">
                <Label htmlFor="depot">Dépôt source *</Label>
                <Controller
                  control={control}
                  name="depot_id"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                      disabled={isEdit}
                    >
                      <SelectTrigger
                        id="depot"
                        className="h-9 w-full text-sm"
                        {...fieldErrorProps('depot', errors.depot_id)}
                      >
                        <SelectValue placeholder="Sélectionner…" />
                      </SelectTrigger>
                      <SelectContent>
                        {depots.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.nom} ({d.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError id="depot">{errors.depot_id?.message}</FieldError>
              </div>
            </CardContent>
          </Card>

          {/* Product Selection */}
          {depotId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Produits disponibles au dépôt</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Stock affiché à titre indicatif
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un produit par nom ou référence…"
                    className="pl-10 sm:pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {loadingProducts ? (
                  <div className="flex justify-center py-8">
                    <Spinner size="md" />
                  </div>
                ) : depotProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Aucun produit trouvé</p>
                  </div>
                ) : (
                  <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium">Produit</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">Stock dépôt</th>
                          <th className="px-3 py-2 text-center text-xs font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {depotProducts.map((product) => {
                          const inCart = cart.find((item) => item.produit_id === product.produit_id);
                          const stockClass = product.quantite_disponible <= 5
                            ? 'text-destructive'
                            : product.quantite_disponible <= 20
                              ? 'text-warning'
                              : 'text-success';

                          return (
                            <tr key={product.produit_id} className={inCart ? 'bg-primary/5' : ''}>
                              <td className="px-3 py-2">
                                <div className="font-medium text-sm">{product.produit_nom}</div>
                                <div className="text-xs text-muted-foreground">{product.reference}</div>
                              </td>
                              <td className={`px-3 py-2 text-right font-medium ${stockClass}`}>
                                {product.quantite_disponible}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {inCart ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9"
                                      aria-label={`Retirer une unité de ${product.produit_nom}`}
                                      onClick={() => updateCartQuantity(product.produit_id, -1)}
                                    >
                                      <Minus className="h-3 w-3" aria-hidden="true" />
                                    </Button>
                                    <span className="w-8 text-center text-sm font-medium tabular-nums">{inCart.quantite_demandee}</span>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9"
                                      aria-label={`Ajouter une unité de ${product.produit_nom}`}
                                      onClick={() => updateCartQuantity(product.produit_id, 1)}
                                      disabled={inCart.quantite_demandee >= product.quantite_disponible}
                                    >
                                      <Plus className="h-3 w-3" aria-hidden="true" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => addToCart(product)}
                                    disabled={product.quantite_disponible === 0}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Ajouter
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="bg-muted/50 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Le stock affiché est indicatif. Les quantités réellement disponibles
                    seront vérifiées lors de l&apos;exécution du transfert par le dépôt.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Motif */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Notes éventuelles pour le dépôt…"
                rows={3}
                {...register('motif')}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Cart */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Panier ({cart.length} articles, {cartTotalItems} unités)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Votre panier est vide</p>
                  <p className="text-xs mt-1">Ajoutez des produits depuis la liste</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.produit_id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.produit_nom}</p>
                          <p className="text-xs text-muted-foreground">{item.reference}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive shrink-0"
                          aria-label={`Retirer ${item.produit_nom} de la demande`}
                          onClick={() => removeFromCart(item.produit_id)}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={`Retirer une unité de ${item.produit_nom}`}
                          onClick={() => updateCartQuantity(item.produit_id, -1)}
                        >
                          <Minus className="h-3 w-3" aria-hidden="true" />
                        </Button>
                        <Input
                          type="number" inputMode="numeric"
                          min={1}
                          max={item.stock_disponible}
                          value={item.quantite_demandee}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val <= 0) {
                              removeFromCart(item.produit_id);
                            } else {
                              setCart((prev) =>
                                prev.map((i) =>
                                  i.produit_id === item.produit_id
                                    ? { ...i, quantite_demandee: Math.min(val, i.stock_disponible) }
                                    : i
                                )
                              );
                            }
                          }}
                          aria-label={`Quantité demandée pour ${item.produit_nom}`}
                          className="w-16 h-9 text-center text-sm px-1 tabular-nums"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={`Ajouter une unité de ${item.produit_nom}`}
                          onClick={() => updateCartQuantity(item.produit_id, 1)}
                          disabled={item.quantite_demandee >= item.stock_disponible}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Notes (optionnel)"
                        value={item.notes || ''}
                        onChange={(e) => updateCartNotes(item.produit_id, e.target.value)}
                        className="mt-2 h-7 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <>
                  <div className="border-t pt-4 space-y-2">
                    <Button
                      className="w-full gap-2"
                      onClick={handleSubmit((values) => submitDemande(values, false))}
                      disabled={submitting}
                      variant="outline"
                    >
                      {submitting ? <Spinner /> : <Save className="h-4 w-4" />}
                      {isEdit ? 'Enregistrer' : 'Enregistrer brouillon'}
                    </Button>
                    <Button
                      className="w-full gap-2"
                      onClick={handleSubmit((values) => submitDemande(values, true))}
                      disabled={submitting}
                    >
                      {submitting ? <Spinner /> : <Send className="h-4 w-4" />}
                      {isEdit ? 'Enregistrer et envoyer' : 'Envoyer au dépôt'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
