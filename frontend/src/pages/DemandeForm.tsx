import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardList, Minus, Package, Plus, Save, Search, Send, Trash2 } from 'lucide-react';
import { caisseService, demandeService, stockLocationService } from '@/services/api';
import { usePermission, Permissions } from '@/hooks/usePermission';
import { PageShell } from '@/components/ui/page-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DocumentCode } from '@/components/ui/document-code';
import { RequiredMark } from '@/components/ui/required-mark';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState } from '@/components/ui/query-state';
import { CardSkeleton, ListSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { formatNumber } from '@/utils/format';

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  location_type: 'depot' | 'magasin' | null;
  est_principal: boolean;
  actif?: boolean;
}

interface DepotProduct {
  produit_id: number;
  reference: string;
  produit_nom: string;
  quantite_disponible: number | string;
}

interface CartItem {
  produit_id: number;
  reference: string;
  produit_nom: string;
  /** Saisie brute (un champ vidé reste vide le temps de la frappe). */
  quantite: string;
  /** Stock au dépôt quand il est connu (indicatif : le dépôt décide). */
  stock_disponible: number | null;
  notes: string;
}

interface ExistingDemande {
  id: number;
  numero: string;
  statut: string;
  magasin_id: number;
  depot_id: number;
  motif: string | null;
  lignes: {
    produit_id: number;
    reference: string | null;
    produit_nom: string;
    quantite_demandee: number;
    notes: string | null;
  }[];
}

const demandeSchema = z.object({
  magasin_id: z.string().min(1, 'Choisissez le magasin qui recevra le stock.'),
  depot_id: z.string().min(1, 'Choisissez le dépôt qui fournira le stock.'),
  motif: z.string().optional(),
});

type DemandeFormValues = z.infer<typeof demandeSchema>;

/** Seuil indicatif sous lequel le stock du dépôt est dit « Stock bas ». */
const LOW_DEPOT_STOCK = 5;

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;
const toQty = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) ? n : 0;
};

/** Stock du dépôt en mots (jamais la seule couleur — VB-INV-01). */
function DepotStock({ value }: { value: number }) {
  if (value <= 0) {
    return <span className="text-xs font-medium text-danger-700">Rupture au dépôt</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', value <= LOW_DEPOT_STOCK ? 'text-warning-700' : 'text-muted-foreground')}>
      {value <= LOW_DEPOT_STOCK && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      Au dépôt : <span className="font-medium tabular-nums">{formatNumber(value)}</span>
      {value <= LOW_DEPOT_STOCK && <span>· Stock bas</span>}
    </span>
  );
}

export default function DemandeForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { hasPermission } = usePermission();
  // Préparer une demande sans pouvoir l'envoyer laissait des brouillons orphelins (U-13).
  const canUseForm = hasPermission(Permissions.DEMANDE_CREATE) && hasPermission(Permissions.DEMANDE_SEND);

  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState<unknown>(null);

  const [existing, setExisting] = useState<ExistingDemande | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<unknown>(null);

  const [depotProducts, setDepotProducts] = useState<DepotProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<unknown>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartError, setCartError] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [submitting, setSubmitting] = useState<'draft' | 'send' | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<DemandeFormValues>({
    resolver: zodResolver(demandeSchema),
    defaultValues: { magasin_id: '', depot_id: '', motif: '' },
  });

  const depotId = watch('depot_id');

  // Garde : un panier de plusieurs lignes ne doit pas disparaître sur une fermeture d'onglet.
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      const response = (await stockLocationService.getAll()) as StockLocation[] | { data?: StockLocation[] };
      const all = (Array.isArray(response) ? response : response?.data ?? []).filter((l) => l.actif !== false);
      setLocations(all);
      if (!isEdit) {
        // Magasin par défaut : celui de l'utilisateur (même source que la caisse), sinon le premier.
        let ownMagasinLocation: number | undefined;
        try {
          const magasins = await caisseService.getMagasins();
          ownMagasinLocation = magasins.map((m) => Number(m?.location_id)).find((n) => Number.isInteger(n) && n > 0);
        } catch {
          /* défaut générique ci-dessous */
        }
        const magasins = all.filter((l) => l.location_type === 'magasin');
        const depots = all.filter((l) => l.location_type === 'depot');
        const defaultMagasin = magasins.find((m) => m.id === ownMagasinLocation) ?? magasins[0];
        if (defaultMagasin && !getValues('magasin_id')) setValue('magasin_id', String(defaultMagasin.id));
        if (depots[0] && !getValues('depot_id')) setValue('depot_id', String(depots[0].id));
      }
    } catch (err) {
      setLocationsError(err);
    } finally {
      setLocationsLoading(false);
    }
  }, [isEdit, getValues, setValue]);

  useEffect(() => {
    if (canUseForm) void loadLocations();
  }, [canUseForm, loadLocations]);

  const loadExistingDemande = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const demande = (await demandeService.getById(Number(id))) as ExistingDemande;
      setExisting(demande);
      reset({
        magasin_id: String(demande.magasin_id),
        depot_id: String(demande.depot_id),
        motif: demande.motif ?? '',
      });
      setCart(
        demande.lignes.map((l) => ({
          produit_id: l.produit_id,
          reference: l.reference ?? '',
          produit_nom: l.produit_nom,
          quantite: String(l.quantite_demandee),
          stock_disponible: null,
          notes: l.notes ?? '',
        }))
      );
    } catch (err) {
      setExisting(null);
      setCart([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, reset]);

  useEffect(() => {
    if (isEdit && canUseForm) void loadExistingDemande();
  }, [isEdit, canUseForm, loadExistingDemande]);

  const loadDepotProducts = useCallback(async () => {
    if (!depotId) return;
    setProductsLoading(true);
    setProductsError(null);
    try {
      const response = (await demandeService.getDepotStock(Number(depotId), debouncedSearch || undefined)) as
        | DepotProduct[]
        | { data?: DepotProduct[] };
      const rows = Array.isArray(response) ? response : response?.data ?? [];
      setDepotProducts(rows);
      // Le stock d'un produit déjà demandé se met à jour quand il réapparaît dans la liste.
      const byId = new Map(rows.map((r) => [r.produit_id, Number(r.quantite_disponible) || 0]));
      setCart((prev) =>
        prev.some((c) => byId.has(c.produit_id))
          ? prev.map((c) => (byId.has(c.produit_id) ? { ...c, stock_disponible: byId.get(c.produit_id) ?? null } : c))
          : prev
      );
    } catch (err) {
      setDepotProducts([]);
      setProductsError(err);
    } finally {
      setProductsLoading(false);
    }
  }, [depotId, debouncedSearch]);

  useEffect(() => {
    if (canUseForm) void loadDepotProducts();
  }, [canUseForm, loadDepotProducts]);

  const addToCart = (product: DepotProduct) => {
    const dispo = Number(product.quantite_disponible) || 0;
    setCart((prev) => {
      const found = prev.find((item) => item.produit_id === product.produit_id);
      if (found) {
        return prev.map((item) =>
          item.produit_id === product.produit_id ? { ...item, quantite: String(toQty(item.quantite) + 1) } : item
        );
      }
      return [
        ...prev,
        {
          produit_id: product.produit_id,
          reference: product.reference,
          produit_nom: product.produit_nom,
          quantite: '1',
          stock_disponible: dispo,
          notes: '',
        },
      ];
    });
    setCartError(undefined);
  };

  const stepQuantity = (produitId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.produit_id === produitId ? { ...item, quantite: String(Math.max(0, toQty(item.quantite) + delta)) } : item
        )
        .filter((item) => toQty(item.quantite) > 0)
    );
  };

  const setQuantity = (produitId: number, raw: string) =>
    setCart((prev) => prev.map((item) => (item.produit_id === produitId ? { ...item, quantite: raw } : item)));

  const removeFromCart = (produitId: number) => setCart((prev) => prev.filter((item) => item.produit_id !== produitId));

  const setNotes = (produitId: number, notes: string) =>
    setCart((prev) => prev.map((item) => (item.produit_id === produitId ? { ...item, notes } : item)));

  const invalidLines = useMemo(
    () => cart.filter((item) => !Number.isInteger(Number(item.quantite)) || toQty(item.quantite) < 1),
    [cart]
  );

  const submitDemande = async (values: DemandeFormValues, andSend: boolean) => {
    if (cart.length === 0) {
      setCartError('Ajoutez au moins un produit à la demande.');
      document.getElementById('demande-product-search')?.focus();
      return;
    }
    if (invalidLines.length > 0) {
      setCartError('Saisissez une quantité entière d’au moins 1 pour chaque produit.');
      document.getElementById(`demande-qty-${invalidLines[0].produit_id}`)?.focus();
      return;
    }
    setCartError(undefined);
    setSubmitting(andSend ? 'send' : 'draft');
    const payload = {
      magasin_id: Number(values.magasin_id),
      depot_id: Number(values.depot_id),
      motif: values.motif?.trim() || undefined,
      lignes: cart.map((item) => ({
        produit_id: item.produit_id,
        quantite_demandee: toQty(item.quantite),
        notes: item.notes.trim() || undefined,
      })),
    };

    let saved: { id: number; numero?: string } | null = null;
    try {
      if (isEdit && existing) {
        await demandeService.update(existing.id, payload);
        saved = { id: existing.id, numero: existing.numero };
      } else {
        const created = (await demandeService.create(payload)) as { id: number; numero?: string };
        saved = { id: created.id, numero: created.numero };
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer la demande. Réessayez.'));
      setSubmitting(null);
      return;
    }

    const label = saved.numero ? `Demande ${saved.numero}` : 'Demande';
    if (andSend) {
      try {
        await demandeService.send(saved.id);
        toast.success(`${label} envoyée au dépôt`);
      } catch (err) {
        // Le brouillon existe : on l'ouvre pour réessayer l'envoi plutôt que d'en recréer un.
        toast.error(
          `${label} enregistrée en brouillon, mais pas envoyée : ${getErrorMessage(err, 'réessayez depuis la demande.')}`
        );
      }
    } else {
      toast.success(`${label} enregistrée en brouillon`);
    }
    setSubmitting(null);
    navigate(`/demandes/${saved.id}`);
  };

  const cartUnits = cart.reduce((sum, item) => sum + Math.max(0, toQty(item.quantite)), 0);
  const magasins = locations.filter((l) => l.location_type === 'magasin');
  const depots = locations.filter((l) => l.location_type === 'depot');
  const title = isEdit
    ? existing
      ? `Modifier la demande ${existing.numero}`
      : 'Modifier la demande'
    : 'Nouvelle demande de réapprovisionnement';

  if (!canUseForm) {
    return (
      <PageShell title={title} backTo="/demandes" width="wide">
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Demande réservée au personnel du magasin"
            description="Les demandes de stock au dépôt sont préparées et envoyées par le personnel du magasin ou un gérant"
            action={
              <Link to="/demandes" className={buttonVariants({ variant: 'outline', size: 'touch' })}>
                Retour aux demandes
              </Link>
            }
          />
        </Card>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell title={title} backTo="/demandes" width="wide">
        <Card>
          <CardContent inset="standalone">
            <CardSkeleton lines={6} />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title={title} backTo="/demandes" width="wide">
        <Card>
          <QueryErrorState error={error} title="Impossible de charger la demande" onRetry={() => void loadExistingDemande()} />
        </Card>
      </PageShell>
    );
  }

  if (isEdit && existing && existing.statut !== 'brouillon') {
    return (
      <PageShell title={title} backTo={`/demandes/${existing.id}`} width="wide">
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Cette demande n’est plus modifiable"
            description="Seul un brouillon se modifie : une fois envoyée, la demande est entre les mains du dépôt"
            action={
              <Link to={`/demandes/${existing.id}`} className={buttonVariants({ variant: 'outline', size: 'touch' })}>
                Voir la demande
              </Link>
            }
          />
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={title}
      backTo={existing ? `/demandes/${existing.id}` : '/demandes'}
      width="wide"
      description="Choisissez les produits dont le magasin a besoin : le dépôt approuve, puis exécute le transfert"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Emplacements</CardTitle>
            </CardHeader>
            <CardContent>
              {locationsError ? (
                <QueryErrorState
                  error={locationsError}
                  title="Impossible de charger les emplacements"
                  onRetry={() => void loadLocations()}
                  className="py-6"
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="magasin">
                      Magasin demandeur <RequiredMark />
                    </Label>
                    <Controller
                      control={control}
                      name="magasin_id"
                      render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isEdit || locationsLoading}>
                          <SelectTrigger id="magasin" className="h-11 w-full sm:h-9" {...fieldErrorProps('magasin', errors.magasin_id)}>
                            <SelectValue placeholder={locationsLoading ? 'Chargement…' : 'Choisir un magasin'} />
                          </SelectTrigger>
                          <SelectContent>
                            {magasins.map((m) => (
                              <SelectItem key={m.id} value={String(m.id)}>
                                {m.nom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError id="magasin">{errors.magasin_id?.message}</FieldError>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="depot">
                      Dépôt <RequiredMark />
                    </Label>
                    <Controller
                      control={control}
                      name="depot_id"
                      render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isEdit || locationsLoading}>
                          <SelectTrigger id="depot" className="h-11 w-full sm:h-9" {...fieldErrorProps('depot', errors.depot_id)}>
                            <SelectValue placeholder={locationsLoading ? 'Chargement…' : 'Choisir un dépôt'} />
                          </SelectTrigger>
                          <SelectContent>
                            {depots.map((d) => (
                              <SelectItem key={d.id} value={String(d.id)}>
                                {d.nom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError id="depot">{errors.depot_id?.message}</FieldError>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Produits du dépôt</CardTitle>
              <CardDescription>Stock indicatif, vérifié par le dépôt à l’exécution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="demande-product-search" className="sr-only">
                  Rechercher un produit du dépôt
                </Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="demande-product-search"
                    type="search"
                    enterKeyHint="search"
                    placeholder={depotId ? 'Nom ou référence du produit…' : 'Choisissez d’abord le dépôt'}
                    disabled={!depotId}
                    className="h-11 pl-10 sm:h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                  />
                </div>
              </div>

              {!depotId ? (
                <p className="text-sm text-muted-foreground">Choisissez le dépôt pour voir son stock</p>
              ) : productsLoading ? (
                <ListSkeleton items={4} />
              ) : productsError ? (
                <QueryErrorState
                  error={productsError}
                  title="Impossible de charger le stock du dépôt"
                  onRetry={() => void loadDepotProducts()}
                  className="py-6"
                />
              ) : depotProducts.length === 0 ? (
                <EmptyState
                  compact
                  icon={Package}
                  title={
                    debouncedSearch
                      ? `Aucun produit du dépôt ne correspond à « ${debouncedSearch} »`
                      : 'Aucun produit au dépôt'
                  }
                  description={debouncedSearch ? 'Cherchez par nom ou référence' : undefined}
                />
              ) : (
                <ul className="max-h-[22rem] divide-y overflow-y-auto rounded-md border" aria-label="Produits du dépôt">
                  {depotProducts.map((product) => {
                    const dispo = Number(product.quantite_disponible) || 0;
                    const inCart = cart.find((item) => item.produit_id === product.produit_id);
                    return (
                      <li
                        key={product.produit_id}
                        className={cn('flex items-center justify-between gap-3 p-3', inCart && 'bg-primary-50')}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" title={product.produit_nom}>
                            {product.produit_nom}
                          </p>
                          <DocumentCode className="block text-xs text-muted-foreground">{product.reference}</DocumentCode>
                          <DepotStock value={dispo} />
                        </div>
                        {inCart ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            Demandé : <span className="font-medium tabular-nums text-foreground">{inCart.quantite || '0'}</span>
                          </span>
                        ) : (
                          // Bouton sans cadre : une colonne de « Ajouter » encadrés chargeait la liste.
                          <Button
                            type="button"
                            variant="ghost"
                            size="touch"
                            className="shrink-0 gap-1.5"
                            onClick={() => addToCart(product)}
                            disabled={dispo <= 0}
                            aria-label={`Ajouter ${product.produit_nom} à la demande`}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Ajouter
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-[4.5rem]">
            <CardHeader className="pb-3">
              <CardTitle>Produits demandés</CardTitle>
              {cart.length > 0 && (
                <CardDescription className="tabular-nums">
                  {plural(cart.length, 'produit', 'produits')} · {plural(cartUnits, 'unité', 'unités')}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <EmptyState
                  compact
                  icon={Package}
                  title="Aucun produit demandé"
                  description="Ajoutez depuis la liste du dépôt les produits dont le magasin a besoin"
                />
              ) : (
                <ul className="space-y-3" aria-label="Produits demandés">
                  {cart.map((item) => {
                    const qtyId = `demande-qty-${item.produit_id}`;
                    const n = toQty(item.quantite);
                    const over = item.stock_disponible != null && n > item.stock_disponible;
                    return (
                      <li key={item.produit_id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium" title={item.produit_nom}>
                              {item.produit_nom}
                            </p>
                            <DocumentCode className="block text-xs text-muted-foreground">{item.reference}</DocumentCode>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-touch"
                            className="shrink-0 text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                            aria-label={`Retirer ${item.produit_nom} de la demande`}
                            onClick={() => removeFromCart(item.produit_id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-touch"
                            aria-label={`Retirer une unité de ${item.produit_nom}`}
                            onClick={() => stepQuantity(item.produit_id, -1)}
                          >
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Label htmlFor={qtyId} className="sr-only">
                            Quantité demandée — {item.produit_nom}
                          </Label>
                          <Input
                            id={qtyId}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={item.quantite}
                            onChange={(e) => setQuantity(item.produit_id, e.target.value)}
                            className="h-11 w-20 text-center tabular-nums sm:h-9"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-touch"
                            aria-label={`Ajouter une unité de ${item.produit_nom}`}
                            onClick={() => stepQuantity(item.produit_id, 1)}
                            disabled={item.stock_disponible != null && n >= item.stock_disponible}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                        {over && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-warning-700">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Le dépôt n’en a que {formatNumber(item.stock_disponible ?? 0)} : il pourra en approuver moins
                          </p>
                        )}
                        <Label htmlFor={`demande-note-${item.produit_id}`} className="sr-only">
                          Note pour {item.produit_nom}
                        </Label>
                        <Input
                          id={`demande-note-${item.produit_id}`}
                          placeholder="Note pour ce produit (facultatif)"
                          value={item.notes}
                          onChange={(e) => setNotes(item.produit_id, e.target.value)}
                          className="mt-2 h-11 text-sm sm:h-9"
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <FieldError id="demande-cart" className="text-sm">
                {cartError}
              </FieldError>

              {/* Les notes partent avec la demande : elles se saisissent à côté
                  de l'envoi, plus dans une carte à part sous la liste du dépôt. */}
              <div className="space-y-1.5 border-t pt-4">
                <Label htmlFor="demande-motif">Notes pour le dépôt</Label>
                <Textarea
                  id="demande-motif"
                  placeholder="Ex. : rupture en vitrine depuis lundi, client en attente"
                  rows={3}
                  {...register('motif')}
                />
              </div>

              <div className="space-y-2">
                <Button
                  type="button"
                  size="touch"
                  className="w-full gap-2"
                  onClick={handleSubmit((values) => submitDemande(values, true))}
                  disabled={submitting !== null || !!locationsError}
                >
                  {submitting === 'send' ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  Envoyer au dépôt
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="w-full gap-2"
                  onClick={handleSubmit((values) => submitDemande(values, false))}
                  disabled={submitting !== null || !!locationsError}
                >
                  {submitting === 'draft' ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  Enregistrer le brouillon
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
