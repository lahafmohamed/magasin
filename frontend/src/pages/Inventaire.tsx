import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import {
  AlertTriangle,
  Barcode,
  Download,
  Equal,
  History,
  Minus,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { caisseService, produitService, stockLocationService, tiersService } from '../services/api';
import { useAuth } from '@/lib/AuthContext';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { ChoiceGroup, ToggleChip } from '@/components/ui/choice-chips';
import { BulkActionBar } from '@/components/ui/bulk-action-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState } from '@/components/ui/query-state';
import { LoadingState, Spinner } from '@/components/ui/loading';
import { ListSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { SortableHeader, type SortState } from '@/components/ui/sortable-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/utils/csv';
import { getErrorMessage } from '@/utils/errors';
import {
  MINUS,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  normalizeSearch,
  toNumber,
} from '@/utils/format';
import { canSeePrices } from '@/utils/roles';

// ---------------------------------------------------------------------------
// Rôles — miroir des `authorize(...)` de backend/src/routes/produits.ts : un
// contrôle que l'API refuserait n'est pas proposé (U-13).
// ---------------------------------------------------------------------------
const WRITE_ROLES = ['admin', 'manager', 'depot_staff'];
/**
 * Créer un produit, c'est fixer son prix : réservé aux responsables (E2 —
 * `POST /produits` refusé au personnel dépôt, qui ajuste et corrige le stock).
 */
const CREATE_ROLES = ['admin', 'manager'];
const DELETE_ROLES = ['admin', 'manager'];
/** Prix de revient et marge : jamais sur un écran de comptoir (U-26). */
const COST_ROLES = ['admin', 'manager'];
/**
 * Fournisseur, prix d'achat et meilleur client d'un produit : métier des
 * achats, réservé aux responsables. Le personnel dépôt voit des quantités
 * seulement (E2, 2026-10-24) — ni prix, ni client.
 */
const PURCHASE_INFO_ROLES = ['admin', 'manager'];

/** Valeur du filtre « Tous les emplacements » (paramètre d'URL `location_id`). */
const ALL_LOCATIONS = 'tous';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface InventoryProduct {
  id: number;
  reference: string;
  nom: string;
  code_barre: string | null;
  description: string | null;
  categorie: string | null;
  prix_achat: number;
  prix_vente: number;
  /** Stock à l'emplacement filtré, ou tous emplacements confondus. */
  stock: number;
  stock_min: number;
  /**
   * `GET /produits?location_id=X` : le produit a-t-il une ligne de stock à
   * cet emplacement ? `false` = jamais stocké ici (pas une rupture) ; `null`
   * quand l'API ne le dit pas (tous emplacements, ancienne API).
   */
  stocke_ici: boolean | null;
}

type RawRecord = Record<string, unknown>;

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  actif: boolean;
  est_principal: boolean;
  location_type?: 'depot' | 'magasin' | null;
}

interface MagasinRow {
  location_id: number | null;
}

interface StockLevelRow {
  produit_id: number;
  quantite: number | string;
}

interface StockMovement {
  id: number;
  type_mouvement: string;
  quantite: number | string;
  stock_avant: number | string | null;
  stock_apres: number | string | null;
  raison: string | null;
  reference_liee?: string | null;
  location_id: number | null;
  date_mouvement: string;
}

interface PurchaseLine {
  fournisseur: string | null;
  numero: string | null;
  date: string | null;
  prix_unitaire: number;
  quantite: number | string;
}

interface PurchaseInfo {
  default_supplier: { id: number; raison_sociale: string; telephone: string | null; email: string | null } | null;
  prix_achat: number;
  price_stats: { total_achats: number; prix_min: number; prix_max: number; prix_moyen: number } | null;
  recent_purchase: { prix_unitaire: number; fournisseur: string | null; source: string; date: string | null } | null;
  purchase_history: PurchaseLine[];
  order_history: PurchaseLine[];
  top_buyer: {
    raison_sociale: string;
    prenom: string | null;
    telephone: string | null;
    total_quantite: number;
    total_depense: number;
    nombre_factures: number;
  } | null;
}

interface FournisseurOption {
  id: number;
  raison_sociale: string;
}

type SortKey = 'reference' | 'nom' | 'categorie' | 'prix_vente' | 'stock';
type AdjustMode = 'ajouter' | 'retirer' | 'fixer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const num = (value: unknown): number => toNumber(value as number | string | null | undefined) ?? 0;

function toProduct(raw: RawRecord): InventoryProduct {
  return {
    id: Number(raw.id),
    reference: String(raw.reference ?? ''),
    nom: String(raw.nom ?? ''),
    code_barre: typeof raw.code_barre === 'string' && raw.code_barre ? raw.code_barre : null,
    description: typeof raw.description === 'string' ? raw.description : null,
    categorie: typeof raw.categorie === 'string' && raw.categorie ? raw.categorie : null,
    prix_achat: num(raw.prix_achat),
    prix_vente: num(raw.prix_vente),
    stock: Math.trunc(num(raw.stock)),
    stock_min: Math.trunc(num(raw.stock_min)),
    stocke_ici: typeof raw.stocke_ici === 'boolean' ? raw.stocke_ici : null,
  };
}

/** Pluriel français : 0 et 1 au singulier. */
const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Marge sur prix de revient, en % ; `null` quand le prix de revient ou de vente manque. */
function marginPercent(p: InventoryProduct): number | null {
  if (p.prix_achat <= 0 || p.prix_vente <= 0) return null;
  return ((p.prix_vente - p.prix_achat) / p.prix_achat) * 100;
}

/** Libellés des types de mouvement (`mouvements_stock.type_mouvement`). */
const MOVEMENT_LABELS: Record<string, string> = {
  vente: 'Vente',
  retour: 'Retour client',
  ajustement: 'Ajustement',
  commande: 'Réception fournisseur',
  perte: 'Perte',
  transfert: 'Transfert',
  autre: 'Autre mouvement',
};

/** Fournisseur par défaut d'un produit (absent de la liste : fiche complète). */
async function fetchProduitFournisseurId(produitId: number): Promise<number | null> {
  const produit = await produitService.getById(produitId);
  return toNumber(produit?.fournisseur_id ?? null);
}

// ---------------------------------------------------------------------------
// Niveau de stock : le mot, pas seulement la couleur (VB-INV-01).
// ---------------------------------------------------------------------------
function StockLevel({
  stock,
  stockMin,
  notStockedHere = false,
}: {
  stock: number;
  stockMin: number;
  /** Aucun stock tenu à l'emplacement filtré : pas une rupture (G-STOCK-01). */
  notStockedHere?: boolean;
}) {
  if (notStockedHere && stock <= 0) {
    return <span className="whitespace-nowrap text-sm text-muted-foreground">Non stocké ici</span>;
  }
  if (stock <= 0) {
    return <Badge variant="destructive">Rupture</Badge>;
  }
  if (stock <= stockMin) {
    // Pastille d'abord, chiffre en dernier : les chiffres restent alignés sur
    // le bord droit de la colonne, comme ceux des autres lignes.
    return (
      <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
        <Badge variant="warning">Stock bas</Badge>
        <span className="font-medium tabular-nums text-warning-700">{formatNumber(stock)}</span>
      </span>
    );
  }
  return <span className="font-medium tabular-nums">{formatNumber(stock)}</span>;
}

// ===========================================================================
// Page
// ===========================================================================
export default function Inventaire() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canWrite = WRITE_ROLES.includes(role);
  const canCreate = CREATE_ROLES.includes(role);
  const canDelete = DELETE_ROLES.includes(role);
  const canSeeCost = COST_ROLES.includes(role);
  const canSeePurchaseInfo = PURCHASE_INFO_ROLES.includes(role);
  /** Prix de vente : tout le monde sauf le personnel dépôt (E2). */
  const canSeeSalePrice = canSeePrices(role);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const canOpen = useRouteAccess();
  const [searchParams] = useSearchParams();
  const patchParams = useSearchParamsPatch();

  // --- Filtres -------------------------------------------------------------
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(normalizeSearch(urlSearch));
  const [lowStockOnly, setLowStockOnly] = useState(searchParams.get('low_stock') === 'true');
  const [categorieFilter, setCategorieFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'nom', dir: 'asc' });

  // --- Emplacements et emplacement de l'utilisateur (U-22) ---------------
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationsError, setLocationsError] = useState<unknown>(null);
  const [locationsReady, setLocationsReady] = useState(false);
  const [userLocationId, setUserLocationId] = useState<string | null>(null);

  const loadLocations = useCallback(async () => {
    setLocationsError(null);
    let active: StockLocation[] = [];
    try {
      const response: unknown = await stockLocationService.getAll();
      const rows = (Array.isArray(response) ? response : (response as { data?: unknown })?.data) as
        | StockLocation[]
        | undefined;
      active = (rows ?? []).filter((l) => l.actif);
      setLocations(active);
    } catch (err) {
      setLocationsError(err);
      setLocations([]);
    }

    // L'emplacement « à soi » : le magasin de la caisse pour le personnel de
    // magasin, le dépôt pour le personnel dépôt. Les responsables voient tout.
    let own: string | null = null;
    if (role === 'magasin_staff' || role === 'caissier') {
      try {
        const magasins = (await caisseService.getMagasins()) as MagasinRow[];
        const match = magasins.find((m) => m.location_id && active.some((l) => l.id === m.location_id));
        own = match?.location_id ? String(match.location_id) : null;
      } catch {
        own = null;
      }
    } else if (role === 'depot_staff') {
      const depot = active.find((l) => l.location_type === 'depot');
      own = depot ? String(depot.id) : null;
    }
    setUserLocationId(own);
    setLocationsReady(true);
  }, [role]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  // `location_id` : liens du tableau de bord (« Stock bas » de son magasin ou
  // du dépôt) ; `emplacement` : ancien nom du paramètre, encore lu.
  const urlLocation = searchParams.get('location_id') ?? searchParams.get('emplacement');
  const locationFilter: string | null = useMemo(() => {
    if (urlLocation === ALL_LOCATIONS) return ALL_LOCATIONS;
    if (urlLocation) {
      // Lien périmé vers un emplacement inactif : on retombe sur tous.
      if (locationsReady && !locations.some((l) => String(l.id) === urlLocation)) return ALL_LOCATIONS;
      return urlLocation;
    }
    if (!locationsReady) return null;
    return userLocationId ?? ALL_LOCATIONS;
  }, [urlLocation, locationsReady, locations, userLocationId]);

  const setLocationFilter = (value: string) => {
    patchParams({ location_id: value, emplacement: null });
    setPage(1);
  };

  /** Filtre « Stock bas », gardé dans l'adresse comme le lien du tableau de bord qui l'active. */
  const setLowStockFilter = (on: boolean) => {
    setLowStockOnly(on);
    patchParams({ low_stock: on ? 'true' : null });
    setPage(1);
  };

  const locationName = useCallback(
    (id: string | number | null | undefined) => locations.find((l) => String(l.id) === String(id))?.nom ?? null,
    [locations]
  );

  /** Emplacement proposé par défaut pour un ajustement ou un stock initial. */
  const defaultWriteLocationId =
    (locationFilter && locationFilter !== ALL_LOCATIONS ? locationFilter : null) ??
    userLocationId ??
    (locations.find((l) => l.est_principal) ?? locations[0])?.id?.toString() ??
    '';

  // Lien profond (recherche globale Ctrl+K, tableau de bord « Stock bas »).
  useEffect(() => {
    if (!urlSearch) return;
    setSearch(urlSearch);
    setDebouncedSearch(normalizeSearch(urlSearch));
    setPage(1);
  }, [urlSearch]);
  const urlLowStock = searchParams.get('low_stock') === 'true';
  useEffect(() => {
    if (urlLowStock) setLowStockOnly(true);
  }, [urlLowStock]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = normalizeSearch(search);
      if (next !== debouncedSearch) {
        setDebouncedSearch(next);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  const hasFilters = search.trim() !== '' || lowStockOnly || categorieFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setLowStockOnly(false);
    setCategorieFilter('all');
    setPage(1);
    // Sinon un rafraîchissement rendrait la recherche ou le stock bas du lien d'arrivée.
    patchParams({ search: null, low_stock: null });
  };

  // --- Catégories (liste complète, pas seulement la page affichée) --------
  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => {
    let ignore = false;
    produitService
      .getStockByCategory()
      .then((rows: unknown) => {
        if (ignore || !Array.isArray(rows)) return;
        const names = (rows as RawRecord[])
          .map((r) => (typeof r.categorie === 'string' ? r.categorie : ''))
          .filter((c) => c && c !== 'Sans catégorie');
        setCategories((prev) => [...new Set([...prev, ...names])].sort((a, b) => a.localeCompare(b, 'fr')));
      })
      .catch(() => {
        /* Repli : les catégories des produits chargés (ci-dessous). */
      });
    return () => {
      ignore = true;
    };
  }, []);

  // --- Produits ------------------------------------------------------------
  const [produits, setProduits] = useState<InventoryProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const locationParam = locationFilter && locationFilter !== ALL_LOCATIONS ? Number(locationFilter) : undefined;

  const loadProduits = useCallback(async () => {
    if (locationFilter === null) return;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const response = (await produitService.getAll(
        debouncedSearch || undefined,
        categorieFilter === 'all' ? undefined : categorieFilter,
        lowStockOnly,
        page,
        limit,
        sort.key,
        sort.dir,
        locationParam
      )) as { data?: RawRecord[]; pagination?: { total?: number; totalPages?: number } } | RawRecord[];
      const rows = Array.isArray(response) ? response : response?.data ?? [];
      const list = rows.map(toProduct);
      setProduits(list);
      const pagination = Array.isArray(response) ? undefined : response?.pagination;
      setTotal(pagination?.total ?? list.length);
      setTotalPages(pagination?.totalPages ?? (list.length > 0 ? 1 : 0));
      setCategories((prev) => {
        const fromPage = list.map((p) => p.categorie).filter((c): c is string => !!c);
        const merged = [...new Set([...prev, ...fromPage])];
        return merged.length === prev.length ? prev : merged.sort((a, b) => a.localeCompare(b, 'fr'));
      });
    } catch (err) {
      setError(err);
      setProduits([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [locationFilter, debouncedSearch, categorieFilter, lowStockOnly, page, limit, sort.key, sort.dir, locationParam]);

  useEffect(() => {
    void loadProduits();
  }, [loadProduits]);

  const handleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(1);
  };

  // --- Sélection -----------------------------------------------------------
  const allSelected = produits.length > 0 && produits.every((p) => selected.has(p.id));
  const someSelected = produits.some((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(produits.map((p) => p.id)));
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedProducts = produits.filter((p) => selected.has(p.id));

  // --- Dialogues -----------------------------------------------------------
  const [adjustTargets, setAdjustTargets] = useState<InventoryProduct[] | null>(null);
  const [formState, setFormState] = useState<{ mode: 'create' } | { mode: 'edit'; produit: InventoryProduct } | null>(
    null
  );
  const [historyProduct, setHistoryProduct] = useState<InventoryProduct | null>(null);
  const [purchaseProduct, setPurchaseProduct] = useState<InventoryProduct | null>(null);
  const [categoryTargets, setCategoryTargets] = useState<InventoryProduct[] | null>(null);

  // --- Suppression ----------------------------------------------------------
  const deleteOne = async (p: InventoryProduct) => {
    const ok = await confirm({
      title: `Supprimer « ${p.nom} » ?`,
      description:
        'Le produit disparaîtra du catalogue et ne pourra plus être vendu ni commandé. Les factures et commandes existantes ne changent pas.',
      confirmLabel: 'Supprimer le produit',
      destructive: true,
    });
    if (!ok) return;
    try {
      await produitService.delete(p.id);
      toast.success(`Produit « ${p.nom} » supprimé`);
      void loadProduits();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer le produit.'));
    }
  };

  const deleteSelected = async () => {
    const targets = selectedProducts;
    if (targets.length === 0) return;
    const n = targets.length;
    const ok = await confirm({
      title: n > 1 ? `Supprimer ${formatNumber(n)} produits ?` : `Supprimer « ${targets[0].nom} » ?`,
      description:
        n > 1
          ? 'Les produits disparaîtront du catalogue et ne pourront plus être vendus ni commandés. Les factures et commandes existantes ne changent pas.'
          : 'Le produit disparaîtra du catalogue et ne pourra plus être vendu ni commandé. Les factures et commandes existantes ne changent pas.',
      confirmLabel: n > 1 ? `Supprimer les ${formatNumber(n)} produits` : 'Supprimer le produit',
      destructive: true,
    });
    if (!ok) return;
    let done = 0;
    let firstError: string | null = null;
    for (const p of targets) {
      try {
        await produitService.delete(p.id);
        done++;
      } catch (err) {
        firstError ??= getErrorMessage(err, `Impossible de supprimer « ${p.nom} ».`);
      }
    }
    if (done > 0) toast.success(done > 1 ? `${formatNumber(done)} produits supprimés` : '1 produit supprimé');
    const failed = n - done;
    if (failed > 0) {
      toast.error(
        `${failed > 1 ? `${formatNumber(failed)} suppressions ont échoué` : 'Une suppression a échoué'} : ${firstError}`
      );
    }
    void loadProduits();
  };

  // --- Export CSV (U-26 : coût et marge réservés aux responsables) --------
  const [exporting, setExporting] = useState(false);
  const exportToCSV = async () => {
    if (locationFilter === null) return;
    setExporting(true);
    try {
      const response = (await produitService.getAll(
        debouncedSearch || undefined,
        categorieFilter === 'all' ? undefined : categorieFilter,
        lowStockOnly,
        1,
        1000,
        sort.key,
        sort.dir,
        locationParam
      )) as { data?: RawRecord[] } | RawRecord[];
      const rows = (Array.isArray(response) ? response : response?.data ?? []).map(toProduct);
      const headers = [
        'Référence',
        'Code-barres',
        'Nom',
        'Catégorie',
        ...(canSeeCost ? ['Prix d’achat'] : []),
        ...(canSeeSalePrice ? ['Prix de vente'] : []),
        ...(canSeeCost ? ['Marge'] : []),
        'Stock',
        'Stock minimum',
      ];
      const lines = rows.map((p) => {
        const marge = marginPercent(p);
        return [
          p.reference,
          p.code_barre ?? '',
          p.nom,
          p.categorie ?? '',
          ...(canSeeCost ? [p.prix_achat.toFixed(2)] : []),
          ...(canSeeSalePrice ? [p.prix_vente.toFixed(2)] : []),
          ...(canSeeCost ? [marge === null ? '' : formatPercent(marge, 1)] : []),
          p.stock,
          p.stock_min,
        ];
      });
      downloadCsv(`inventaire_${new Date().toISOString().split('T')[0]}.csv`, headers, lines);
      toast.success('Fichier CSV téléchargé');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’exporter en CSV. Réessayez.'));
    } finally {
      setExporting(false);
    }
  };

  // --- Rendu des lignes -------------------------------------------------------
  const referenceControl = (p: InventoryProduct, className?: string) =>
    canSeePurchaseInfo ? (
      <button
        type="button"
        onClick={() => setPurchaseProduct(p)}
        className={cn(
          'inline-flex min-h-6 max-w-full items-center break-all rounded-sm text-left font-mono text-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        aria-label={`${p.reference} — informations d’achat`}
      >
        {p.reference}
      </button>
    ) : (
      <span className={cn('break-all font-mono text-sm text-muted-foreground', className)}>{p.reference}</span>
    );

  const rowMenu = (p: InventoryProduct, touch = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={touch ? 'icon-touch' : 'icon'}
          className="shrink-0"
          aria-label={`Actions pour ${p.nom}`}
          title={`Actions pour ${p.nom}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="min-h-11 gap-2 sm:min-h-9" onSelect={() => setHistoryProduct(p)}>
          <History className="h-4 w-4" aria-hidden="true" />
          Historique du stock
        </DropdownMenuItem>
        {canSeePurchaseInfo && (
          <DropdownMenuItem className="min-h-11 gap-2 sm:min-h-9" onSelect={() => setPurchaseProduct(p)}>
            <Package className="h-4 w-4" aria-hidden="true" />
            Informations d’achat
          </DropdownMenuItem>
        )}
        {canOpen('/etiquettes') && (
          <DropdownMenuItem className="min-h-11 gap-2 sm:min-h-9" onSelect={() => navigate(`/etiquettes?produits=${p.id}`)}>
            <Barcode className="h-4 w-4" aria-hidden="true" />
            Imprimer l’étiquette
          </DropdownMenuItem>
        )}
        {canWrite && (
          <>
            <DropdownMenuItem className="min-h-11 gap-2 sm:min-h-9" onSelect={() => setAdjustTargets([p])}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Ajuster le stock
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 gap-2 sm:min-h-9"
              onSelect={() => setFormState({ mode: 'edit', produit: p })}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Modifier le produit
            </DropdownMenuItem>
          </>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11 gap-2 text-danger-700 focus:bg-danger-50 focus:text-danger-800 sm:min-h-9"
              onSelect={() => void deleteOne(p)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Supprimer le produit
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const priceCell = (p: InventoryProduct) =>
    p.prix_vente > 0 ? (
      <Money value={p.prix_vente} />
    ) : (
      <span className="text-xs font-medium text-warning-700">Prix non renseigné</span>
    );

  const marginCell = (p: InventoryProduct) => {
    const marge = marginPercent(p);
    if (marge === null) {
      return (
        <span className="text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">Marge non calculable</span>
        </span>
      );
    }
    // Une marge n'est pas une variation : pas de « + », rouge seulement sous 0.
    return <span className={cn('font-medium', marge < 0 && 'text-danger-700')}>{formatPercent(marge, 1)}</span>;
  };

  const singleLocation = !!locationFilter && locationFilter !== ALL_LOCATIONS;
  const stockHeader = singleLocation ? 'Stock à l’emplacement' : 'Stock total';
  const colCount = 4 + (canSeeSalePrice ? 1 : 0) + (canWrite ? 1 : 0) + (canSeeCost ? 1 : 0) + 1;
  /** « Non stocké ici » plutôt que « Rupture » : seulement quand un emplacement est choisi. */
  const stockCell = (p: InventoryProduct) => (
    <StockLevel stock={p.stock} stockMin={p.stock_min} notStockedHere={singleLocation && p.stocke_ici === false} />
  );

  const tableNode = (
    <Table aria-label="Produits">
      <TableHeader>
        <TableRow>
          {canWrite && (
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={toggleAll}
                aria-label="Sélectionner tous les produits de la page"
              />
            </TableHead>
          )}
          <SortableHeader columnKey="reference" sort={sort} onSort={handleSort}>
            Référence
          </SortableHeader>
          <SortableHeader columnKey="nom" sort={sort} onSort={handleSort}>
            Produit
          </SortableHeader>
          <SortableHeader columnKey="categorie" sort={sort} onSort={handleSort}>
            Catégorie
          </SortableHeader>
          {canSeeSalePrice && (
            <SortableHeader columnKey="prix_vente" sort={sort} onSort={handleSort} numeric>
              Prix de vente
            </SortableHeader>
          )}
          {canSeeCost && <TableHead numeric>Marge</TableHead>}
          <SortableHeader columnKey="stock" sort={sort} onSort={handleSort} numeric>
            {stockHeader}
          </SortableHeader>
          <TableHead className="w-14">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {produits.map((p) => (
          <TableRow key={p.id} className={cn(selected.has(p.id) && 'bg-muted/40')}>
            {canWrite && (
              <TableCell>
                <Checkbox
                  checked={selected.has(p.id)}
                  onChange={() => toggleOne(p.id)}
                  aria-label={`Sélectionner ${p.nom}`}
                />
              </TableCell>
            )}
            <TableCell className="max-w-[10rem]">{referenceControl(p)}</TableCell>
            <TableCell className="min-w-[12rem]">
              <span className="font-medium">{p.nom}</span>
              {p.code_barre && (
                <span className="block font-mono text-xs text-muted-foreground" title="Code-barres">
                  <span className="sr-only">Code-barres </span>
                  {p.code_barre}
                </span>
              )}
            </TableCell>
            <TableCell>
              {p.categorie ? (
                p.categorie
              ) : (
                <span className="text-muted-foreground">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Sans catégorie</span>
                </span>
              )}
            </TableCell>
            {canSeeSalePrice && <TableCell numeric>{priceCell(p)}</TableCell>}
            {canSeeCost && <TableCell numeric>{marginCell(p)}</TableCell>}
            <TableCell numeric>{stockCell(p)}</TableCell>
            <TableCell className="text-right">{rowMenu(p)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const cardsNode = produits.map((p) => (
    <article
      key={p.id}
      className={cn('rounded-lg border bg-card p-3 shadow-xs', selected.has(p.id) && 'border-primary-300 bg-primary-50')}
    >
      <div className="flex items-start gap-3">
        {canWrite && (
          <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
            <Checkbox
              checked={selected.has(p.id)}
              onChange={() => toggleOne(p.id)}
              aria-label={`Sélectionner ${p.nom}`}
              className="h-5 w-5"
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-medium leading-snug">{p.nom}</h2>
          {referenceControl(p, 'mt-1 inline-flex min-h-11 items-center')}
        </div>
        {rowMenu(p, true)}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
        {canSeeSalePrice && (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Prix de vente</dt>
            <dd className="mt-1">{priceCell(p)}</dd>
          </div>
        )}
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{stockHeader}</dt>
          <dd className="mt-1">{stockCell(p)}</dd>
        </div>
        {/* Trois cases (prix, stock, catégorie) : la catégorie prend la ligne entière. */}
        <div className={cn('min-w-0', canSeeSalePrice && !canSeeCost && 'col-span-2')}>
          <dt className="text-xs text-muted-foreground">Catégorie</dt>
          <dd className="mt-1 break-words">{p.categorie || 'Sans catégorie'}</dd>
        </div>
        {canSeeCost && (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Marge</dt>
            <dd className="mt-1">{marginCell(p)}</dd>
          </div>
        )}
      </dl>
    </article>
  ));

  // --- États vides ------------------------------------------------------------
  const emptyNode = (() => {
    const query = search.trim();
    if (query) {
      return (
        <EmptyState
          icon={Search}
          title={`Aucun produit ne correspond à « ${query} »`}
          description="Cherchez par nom, référence ou code-barres"
          action={
            <Button variant="outline" onClick={() => setSearch('')} className="gap-2">
              <X className="h-4 w-4" aria-hidden="true" /> Effacer la recherche
            </Button>
          }
        />
      );
    }
    if (lowStockOnly && categorieFilter === 'all') {
      return (
        <EmptyState
          icon={Package}
          title="Aucun produit en stock bas"
          description="Tous les produits sont au-dessus de leur stock minimum"
          action={
            <Button variant="outline" onClick={() => setLowStockFilter(false)} className="gap-2">
              <X className="h-4 w-4" aria-hidden="true" /> Afficher tous les produits
            </Button>
          }
        />
      );
    }
    if (hasFilters) {
      return (
        <EmptyState
          icon={Package}
          title="Aucun produit ne correspond à ces filtres"
          description="Changez de catégorie ou retirez le filtre Stock bas"
          action={
            <Button variant="outline" onClick={clearFilters} className="gap-2">
              <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={Package}
        title="Aucun produit dans le catalogue"
        description={
          canCreate
            ? 'Ajoutez vos produits pour les vendre et suivre leur stock dans chaque dépôt'
            : 'Les produits ajoutés par un gérant apparaîtront ici, avec leur stock par emplacement'
        }
        action={
          canCreate ? (
            <Button onClick={() => setFormState({ mode: 'create' })} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau produit
            </Button>
          ) : undefined
        }
      />
    );
  })();

  const busy = loading || locationFilter === null;
  const errorNode = (
    <QueryErrorState error={error} title="Impossible de charger les produits" onRetry={() => void loadProduits()} />
  );

  const status = busy || error ? '' : total === 0 ? '' : plural(total, 'produit', 'produits');

  return (
    <PageShell
      title="Inventaire"
      description={
        canSeeSalePrice
          ? 'Produits, prix et niveaux de stock, emplacement par emplacement'
          : 'Produits et niveaux de stock, emplacement par emplacement'
      }
      actions={
        <Button
          variant="outline"
          size="touch"
          onClick={() => void exportToCSV()}
          disabled={exporting || busy}
          className="gap-2"
        >
          {exporting ? <Spinner /> : <Download className="h-4 w-4" aria-hidden="true" />}
          Exporter en CSV
        </Button>
      }
      primaryAction={
        canCreate ? (
          <Button size="touch" onClick={() => setFormState({ mode: 'create' })} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouveau produit
          </Button>
        ) : undefined
      }
    >
      <p role="status" className="sr-only">
        {status}
      </p>

      {/* Recherche, emplacement, filtres */}
      <Card>
        <CardContent inset="standalone" className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                enterKeyHint="search"
                aria-label="Rechercher un produit"
                placeholder="Nom, référence ou code-barres…"
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[30rem]">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="inventaire-emplacement">Emplacement</Label>
                <Select
                  value={locationFilter ?? ALL_LOCATIONS}
                  onValueChange={setLocationFilter}
                  disabled={!locationsReady}
                >
                  <SelectTrigger id="inventaire-emplacement">
                    <SelectValue placeholder="Tous les emplacements" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_LOCATIONS}>Tous les emplacements</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.nom}
                        {userLocationId === String(l.id) ? ' (le vôtre)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="inventaire-categorie">Catégorie</Label>
                <Select
                  value={categorieFilter}
                  onValueChange={(v) => {
                    setCategorieFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger id="inventaire-categorie">
                    <SelectValue placeholder="Toutes les catégories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les catégories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleChip
              size="md"
              icon={AlertTriangle}
              pressed={lowStockOnly}
              onPressedChange={setLowStockFilter}
            >
              Stock bas
            </ToggleChip>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
                <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
              </Button>
            )}
          </div>
          {locationsError !== null && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Impossible de charger les emplacements : le stock affiché est celui de tous les emplacements.</span>
              <Button variant="outline" onClick={() => void loadLocations()}>
                Réessayer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canWrite && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button variant="outline" className="gap-1.5" onClick={() => setAdjustTargets(selectedProducts)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Ajuster le stock
          </Button>
          {canOpen('/etiquettes') && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => navigate(`/etiquettes?produits=${selectedProducts.map((p) => p.id).join(',')}`)}
            >
              <Barcode className="h-4 w-4" aria-hidden="true" />
              Imprimer les étiquettes
            </Button>
          )}
          <Button variant="outline" className="gap-1.5" onClick={() => setCategoryTargets(selectedProducts)}>
            <Tags className="h-4 w-4" aria-hidden="true" />
            Changer la catégorie
          </Button>
          {canDelete && (
            <Button
              variant="outline"
              className="gap-1.5 text-danger-700 hover:bg-danger-50 hover:text-danger-800"
              onClick={() => void deleteSelected()}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {selected.size > 1 ? `Supprimer les ${formatNumber(selected.size)} produits` : 'Supprimer le produit'}
            </Button>
          )}
        </BulkActionBar>
      )}

      {/* Liste — sous 768 px les cartes portent la surface. */}
      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="flush">
          {busy ? (
            <>
              <div className="hidden md:block" aria-busy="true">
                <TableSkeleton rows={10} columns={colCount} />
              </div>
              <div className="md:hidden" aria-busy="true">
                <ListSkeleton items={6} />
              </div>
            </>
          ) : error ? (
            errorNode
          ) : produits.length === 0 ? (
            emptyNode
          ) : (
            <ResponsiveTable table={tableNode} cards={cardsNode} />
          )}
        </CardContent>
      </Card>

      {!busy && !error && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          announce={false}
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
        />
      )}

      {adjustTargets && (
        <AdjustStockDialog
          products={adjustTargets}
          locations={locations}
          defaultLocationId={defaultWriteLocationId}
          listLocationId={locationFilter && locationFilter !== ALL_LOCATIONS ? locationFilter : null}
          onClose={() => setAdjustTargets(null)}
          onDone={() => {
            setAdjustTargets(null);
            void loadProduits();
          }}
        />
      )}

      {formState && (
        <ProductFormDialog
          state={formState}
          showPrices={canSeeSalePrice}
          locations={locations}
          defaultLocationId={defaultWriteLocationId}
          categories={categories}
          onClose={() => setFormState(null)}
          onSaved={() => {
            setFormState(null);
            void loadProduits();
          }}
          onAdjustStock={(p) => {
            setFormState(null);
            setAdjustTargets([p]);
          }}
        />
      )}

      {categoryTargets && (
        <CategoryDialog
          products={categoryTargets}
          categories={categories}
          onClose={() => setCategoryTargets(null)}
          onDone={() => {
            setCategoryTargets(null);
            void loadProduits();
          }}
        />
      )}

      {historyProduct && (
        <HistoryDialog
          product={historyProduct}
          locationName={locationName}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      {purchaseProduct && <PurchaseInfoDialog product={purchaseProduct} onClose={() => setPurchaseProduct(null)} />}
    </PageShell>
  );
}

// ===========================================================================
// « Ajuster le stock » (U-21) : mode, quantité, emplacement en toutes lettres,
// motif obligatoire, aperçu de l'effet ligne par ligne.
// ===========================================================================
const MODE_OPTIONS = [
  { value: 'ajouter' as const, label: 'Ajouter', icon: Plus },
  { value: 'retirer' as const, label: 'Retirer', icon: Minus },
  { value: 'fixer' as const, label: 'Fixer à', icon: Equal },
];

const QUANTITY_LABEL: Record<AdjustMode, string> = {
  ajouter: 'Quantité à ajouter',
  retirer: 'Quantité à retirer',
  fixer: 'Nouveau stock',
};

const SUCCESS_MESSAGE: Record<AdjustMode, [string, string]> = {
  ajouter: ['Stock augmenté pour 1 produit', 'Stock augmenté pour {n} produits'],
  retirer: ['Stock diminué pour 1 produit', 'Stock diminué pour {n} produits'],
  fixer: ['Stock fixé pour 1 produit', 'Stock fixé pour {n} produits'],
};

interface AdjustLine {
  product: InventoryProduct;
  before: number;
  after: number;
  delta: number;
  invalid: boolean;
}

function AdjustStockDialog({
  products,
  locations,
  defaultLocationId,
  listLocationId,
  onClose,
  onDone,
}: {
  products: InventoryProduct[];
  locations: StockLocation[];
  defaultLocationId: string;
  /** Emplacement sur lequel la liste est filtrée : son stock est déjà connu. */
  listLocationId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<AdjustMode>('ajouter');
  const [quantity, setQuantity] = useState('');
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [motif, setMotif] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const motifRef = useRef<HTMLTextAreaElement>(null);

  // Stock de chaque produit À L'EMPLACEMENT choisi.
  const [stockMap, setStockMap] = useState<Map<number, number> | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const knownFromList = !!locationId && locationId === listLocationId;

  useEffect(() => {
    if (!locationId) {
      setStockMap(null);
      setStockLoading(false);
      return;
    }
    if (knownFromList) {
      setStockMap(new Map(products.map((p) => [p.id, p.stock])));
      setStockError(null);
      setStockLoading(false);
      return;
    }
    let ignore = false;
    setStockLoading(true);
    setStockError(null);
    stockLocationService
      .getStockLevels(Number(locationId))
      .then((response: unknown) => {
        if (ignore) return;
        const rows = (Array.isArray(response) ? response : (response as { data?: unknown })?.data) as
          | StockLevelRow[]
          | undefined;
        setStockMap(new Map((rows ?? []).map((r) => [Number(r.produit_id), Math.trunc(num(r.quantite))])));
      })
      .catch((err) => {
        if (ignore) return;
        setStockMap(null);
        setStockError(err);
      })
      .finally(() => {
        if (!ignore) setStockLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [locationId, knownFromList, products, reloadKey]);

  const parsedQuantity = /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : null;
  const quantityError =
    parsedQuantity === null
      ? 'Saisissez une quantité en nombre entier.'
      : mode !== 'fixer' && parsedQuantity === 0
        ? 'Saisissez une quantité supérieure à 0.'
        : null;
  const motifError = motif.trim() ? null : 'Indiquez le motif de l’ajustement (inventaire, casse, erreur de saisie…).';
  const locationError = locationId ? null : 'Choisissez l’emplacement à ajuster.';

  const lines: AdjustLine[] = useMemo(() => {
    if (!stockMap || parsedQuantity === null) return [];
    return products.map((product) => {
      const before = stockMap.get(product.id) ?? 0;
      const after = mode === 'ajouter' ? before + parsedQuantity : mode === 'retirer' ? before - parsedQuantity : parsedQuantity;
      return { product, before, after, delta: after - before, invalid: after < 0 };
    });
  }, [stockMap, parsedQuantity, products, mode]);

  const changing = lines.filter((l) => l.delta !== 0 && !l.invalid);
  const invalidLines = lines.filter((l) => l.invalid);
  const locationLabel = locations.find((l) => String(l.id) === locationId)?.nom ?? '';
  const submitLabel =
    products.length > 1 ? `Ajuster le stock de ${formatNumber(products.length)} produits` : 'Ajuster le stock';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (locationError || quantityError || motifError) {
      if (quantityError) quantityRef.current?.focus();
      else if (motifError) motifRef.current?.focus();
      return;
    }
    if (!stockMap) return;
    if (invalidLines.length > 0) {
      setFormError(
        invalidLines.length > 1
          ? `Le retrait rendrait le stock négatif pour ${formatNumber(invalidLines.length)} produits : réduisez la quantité.`
          : `Le retrait rendrait le stock de « ${invalidLines[0].product.nom} » négatif : il n’en reste que ${formatNumber(invalidLines[0].before)}.`
      );
      return;
    }
    if (changing.length === 0) {
      setFormError('Aucun stock ne change avec cette quantité : saisissez une autre valeur.');
      return;
    }

    setSubmitting(true);
    let done = 0;
    let firstError: string | null = null;
    for (const line of changing) {
      try {
        await produitService.addStockMovement(line.product.id, {
          type_mouvement: 'ajustement',
          quantite: line.delta,
          location_id: Number(locationId),
          raison: motif.trim(),
        });
        done++;
      } catch (err) {
        firstError ??= getErrorMessage(err, `Impossible d’ajuster le stock de « ${line.product.nom} ».`);
      }
    }
    setSubmitting(false);

    const failed = changing.length - done;
    if (done > 0) {
      const [one, many] = SUCCESS_MESSAGE[mode];
      toast.success(done > 1 ? many.replace('{n}', formatNumber(done)) : one);
    }
    if (failed > 0) {
      toast.error(
        `${failed > 1 ? `${formatNumber(failed)} ajustements ont échoué` : 'Un ajustement a échoué'} : ${firstError}`
      );
    }
    // Rien n'est passé : le formulaire reste ouvert pour réessayer sans ressaisir.
    if (done === 0) {
      setFormError(firstError ?? 'Impossible d’ajuster le stock. Réessayez.');
      return;
    }
    onDone();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Ajuster le stock</DialogTitle>
            <DialogDescription>
              {products.length > 1
                ? `${formatNumber(products.length)} produits sélectionnés. L’ajustement est enregistré dans l’historique de chaque produit, avec son motif.`
                : `« ${products[0]?.nom} ». L’ajustement est enregistré dans l’historique du produit, avec son motif.`}
            </DialogDescription>
          </DialogHeader>

          <ChoiceGroup
            label="Type d’ajustement"
            value={mode}
            onValueChange={setMode}
            options={MODE_OPTIONS}
            layout="grid-3"
            shape="tile"
            size="touch"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ajustement-quantite">
                {QUANTITY_LABEL[mode]}
                <RequiredMark />
              </Label>
              <Input
                ref={quantityRef}
                id="ajustement-quantite"
                inputMode="numeric"
                autoComplete="off"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
                className="tabular-nums"
                required
                {...fieldErrorProps('ajustement-quantite', submitted && quantityError)}
              />
              <FieldError id="ajustement-quantite">{submitted ? quantityError : null}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ajustement-emplacement">
                Emplacement
                <RequiredMark />
              </Label>
              <Select value={locationId || undefined} onValueChange={setLocationId}>
                <SelectTrigger
                  id="ajustement-emplacement"
                  {...fieldErrorProps('ajustement-emplacement', submitted && locationError)}
                >
                  <SelectValue placeholder="Choisir un emplacement…" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="ajustement-emplacement">{submitted ? locationError : null}</FieldError>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ajustement-motif">
              Motif
              <RequiredMark />
            </Label>
            <Textarea
              ref={motifRef}
              id="ajustement-motif"
              rows={2}
              maxLength={500}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex. : inventaire physique du jour, casse, erreur de saisie"
              className="min-h-[64px]"
              required
              {...fieldErrorProps('ajustement-motif', submitted && motifError)}
            />
            <FieldError id="ajustement-motif">{submitted ? motifError : null}</FieldError>
          </div>

          {/* Aperçu de l'effet */}
          <section aria-labelledby="ajustement-apercu-titre" className="space-y-2">
            <h3 id="ajustement-apercu-titre" className="text-sm font-medium">
              {locationLabel ? `Effet sur le stock à ${locationLabel}` : 'Effet sur le stock'}
            </h3>
            {!locationId ? (
              <p className="text-sm text-muted-foreground">Choisissez un emplacement pour voir l’effet</p>
            ) : stockLoading ? (
              <LoadingState message="Chargement du stock de l’emplacement…" className="py-6" />
            ) : stockError ? (
              <QueryErrorState
                error={stockError}
                title="Impossible de charger le stock de cet emplacement"
                onRetry={() => setReloadKey((k) => k + 1)}
                className="py-6"
              />
            ) : parsedQuantity === null ? (
              <p className="text-sm text-muted-foreground">Saisissez une quantité pour voir l’effet</p>
            ) : (
              <ul
                className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Effet de l’ajustement par produit"
                tabIndex={0}
              >
                {lines.map((line) => (
                  <li key={line.product.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 break-words">{line.product.nom}</span>
                    {line.invalid ? (
                      <span className="shrink-0 text-right text-xs font-medium text-danger-700">
                        Seulement {formatNumber(line.before)} en stock
                      </span>
                    ) : (
                      <span className="shrink-0 whitespace-nowrap text-right tabular-nums">
                        {formatNumber(line.before)}
                        <span aria-hidden="true"> → </span>
                        <span className="sr-only"> passera à </span>
                        <span className="font-medium">{formatNumber(line.after)}</span>
                        {line.delta === 0 && <span className="ml-2 text-xs text-muted-foreground">inchangé</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {formError && (
            <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {formError}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting || stockLoading} className="gap-2">
              {submitting ? <Spinner /> : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Fiche produit (création / modification). Le stock n'y est plus modifiable :
// il ne bouge que par un mouvement tracé (« Ajuster le stock »).
// ===========================================================================
interface ProductFormValues {
  reference: string;
  nom: string;
  code_barre: string;
  categorie: string;
  description: string;
  prix_achat: string;
  prix_vente: string;
  stock_min: string;
  initial_stock: string;
  location_id: string;
  fournisseur_id: string;
}

type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>;

const NO_SUPPLIER = '__aucun';

function ProductFormDialog({
  state,
  showPrices,
  locations,
  defaultLocationId,
  categories,
  onClose,
  onSaved,
  onAdjustStock,
}: {
  state: { mode: 'create' } | { mode: 'edit'; produit: InventoryProduct };
  /**
   * Prix d'achat et de vente dans la fiche. Faux pour le personnel dépôt
   * (E2) : les champs disparaissent et une modification ne renvoie jamais de
   * prix — l'API peut les lui masquer, renvoyer 0 effacerait le vrai prix.
   */
  showPrices: boolean;
  locations: StockLocation[];
  defaultLocationId: string;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
  onAdjustStock: (p: InventoryProduct) => void;
}) {
  const editing = state.mode === 'edit' ? state.produit : null;
  const [values, setValues] = useState<ProductFormValues>(() => ({
    reference: editing?.reference ?? '',
    nom: editing?.nom ?? '',
    code_barre: editing?.code_barre ?? '',
    categorie: editing?.categorie ?? '',
    description: editing?.description ?? '',
    prix_achat: editing ? String(Math.round(editing.prix_achat)) : '',
    prix_vente: editing ? String(Math.round(editing.prix_vente)) : '',
    stock_min: editing ? String(editing.stock_min) : '5',
    initial_stock: '0',
    location_id: defaultLocationId,
    fournisseur_id: NO_SUPPLIER,
  }));
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<FournisseurOption[]>([]);
  const [fournisseursError, setFournisseursError] = useState(false);
  // En modification, le fournisseur actuel n'est pas dans la liste : il est lu
  // sur la fiche. Tant qu'il n'est pas connu, il n'est pas renvoyé (sinon une
  // simple correction de prix effaçait le fournisseur par défaut).
  const [supplierKnown, setSupplierKnown] = useState(!editing);
  const [supplierTouched, setSupplierTouched] = useState(false);
  const supplierTouchedRef = useRef(false);
  const editingId = editing?.id ?? null;

  useEffect(() => {
    let ignore = false;
    tiersService
      .getAll({ role: 'fournisseur', limit: 200 })
      .then((response: unknown) => {
        if (ignore) return;
        const rows = (Array.isArray(response) ? response : (response as { data?: unknown })?.data) as
          | FournisseurOption[]
          | undefined;
        setFournisseurs(rows ?? []);
      })
      .catch(() => {
        if (!ignore) setFournisseursError(true);
      });
    if (editingId !== null) {
      fetchProduitFournisseurId(editingId)
        .then((id) => {
          if (ignore) return;
          setValues((v) => (supplierTouchedRef.current ? v : { ...v, fournisseur_id: id ? String(id) : NO_SUPPLIER }));
          setSupplierKnown(true);
        })
        .catch(() => {
          /* Fournisseur actuel inconnu : non renvoyé sauf choix explicite. */
        });
    }
    return () => {
      ignore = true;
    };
  }, [editingId]);

  const set = (key: keyof ProductFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  const validate = (): ProductFormErrors => {
    const next: ProductFormErrors = {};
    if (!values.reference.trim()) next.reference = 'Saisissez la référence du produit.';
    if (!values.nom.trim()) next.nom = 'Saisissez le nom du produit.';
    if (showPrices && !values.prix_vente.trim()) next.prix_vente = 'Saisissez le prix de vente.';
    if (!/^\d+$/.test(values.stock_min.trim())) next.stock_min = 'Saisissez un stock minimum en nombre entier.';
    if (!editing && !/^\d+$/.test(values.initial_stock.trim())) {
      next.initial_stock = 'Saisissez un stock initial en nombre entier (0 si aucun).';
    }
    if (!editing && Number(values.initial_stock || 0) > 0 && !values.location_id) {
      next.location_id = 'Choisissez l’emplacement qui reçoit le stock initial.';
    }
    return next;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      document.getElementById(`produit-${firstKey}`)?.focus();
      return;
    }
    setSubmitting(true);
    const fournisseurId = values.fournisseur_id === NO_SUPPLIER ? null : Number(values.fournisseur_id);
    const nom = values.nom.trim();
    try {
      if (editing) {
        await produitService.update(editing.id, {
          reference: values.reference.trim(),
          nom,
          code_barre: values.code_barre.trim(),
          description: values.description,
          categorie: values.categorie.trim() || null,
          ...(showPrices
            ? { prix_achat: Number(values.prix_achat || 0), prix_vente: Number(values.prix_vente) }
            : {}),
          stock_min: Number(values.stock_min),
          ...(supplierKnown || supplierTouched ? { fournisseur_id: fournisseurId } : {}),
        });
        toast.success(`Produit « ${nom} » enregistré`);
      } else {
        const initialStock = Number(values.initial_stock || 0);
        await produitService.create({
          reference: values.reference.trim(),
          nom,
          code_barre: values.code_barre.trim(),
          description: values.description,
          categorie: values.categorie.trim() || null,
          // Sans les champs de prix (dépôt), le produit est créé à 0 : il
          // s'affiche « Prix non renseigné » jusqu'à ce qu'un gérant le fixe.
          prix_achat: showPrices ? Number(values.prix_achat || 0) : 0,
          prix_vente: showPrices ? Number(values.prix_vente) : 0,
          stock_min: Number(values.stock_min),
          stock: initialStock,
          initial_stock: initialStock,
          ...(values.location_id ? { location_id: Number(values.location_id) } : {}),
          ...(fournisseurId ? { fournisseur_id: fournisseurId } : {}),
        });
        toast.success(`Produit « ${nom} » créé`);
      }
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer le produit. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  const field = (
    key: keyof ProductFormValues,
    label: ReactNode,
    input: ReactNode,
    hint?: ReactNode,
    className?: string
  ) => (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={`produit-${key}`}>{label}</Label>
      {input}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={`produit-${key}`}>{errors[key]}</FieldError>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifiez la fiche du produit. Le stock se corrige avec « Ajuster le stock ».'
                : 'Renseignez la fiche du nouveau produit. Les champs marqués d’un * sont obligatoires.'}
              {!showPrices && ' Les prix sont fixés par un gérant.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              'reference',
              <>
                Référence
                <RequiredMark />
              </>,
              <Input
                id="produit-reference"
                value={values.reference}
                onChange={(e) => set('reference')(e.target.value)}
                placeholder="Ex. : REF-001"
                autoComplete="off"
                required
                {...fieldErrorProps('produit-reference', errors.reference)}
              />
            )}
            {field(
              'nom',
              <>
                Nom
                <RequiredMark />
              </>,
              <Input
                id="produit-nom"
                value={values.nom}
                onChange={(e) => set('nom')(e.target.value)}
                placeholder="Ex. : Clavier Logitech K120"
                required
                {...fieldErrorProps('produit-nom', errors.nom)}
              />
            )}
            {field(
              'code_barre',
              'Code-barres',
              <Input
                id="produit-code_barre"
                value={values.code_barre}
                onChange={(e) => set('code_barre')(e.target.value)}
                placeholder="Ex. : 3245678901234"
                inputMode="numeric"
                autoComplete="off"
              />,
              'Scannez-le ou saisissez-le : il permet de retrouver le produit à la vente'
            )}
            {field(
              'categorie',
              'Catégorie',
              <>
                <Input
                  id="produit-categorie"
                  value={values.categorie}
                  onChange={(e) => set('categorie')(e.target.value)}
                  placeholder="Ex. : Périphériques"
                  list="produit-categories"
                  autoComplete="off"
                />
                <datalist id="produit-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
            {field(
              'fournisseur_id',
              'Fournisseur par défaut',
              <Select
                value={values.fournisseur_id}
                onValueChange={(v) => {
                  supplierTouchedRef.current = true;
                  setSupplierTouched(true);
                  set('fournisseur_id')(v);
                }}
              >
                <SelectTrigger id="produit-fournisseur_id">
                  <SelectValue placeholder="Aucun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUPPLIER}>Aucun</SelectItem>
                  {fournisseurs.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.raison_sociale}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>,
              fournisseursError ? 'Impossible de charger les fournisseurs : la liste est vide.' : undefined
            )}
            {field(
              'stock_min',
              'Stock minimum',
              <Input
                id="produit-stock_min"
                inputMode="numeric"
                value={values.stock_min}
                onChange={(e) => set('stock_min')(e.target.value.replace(/[^\d]/g, ''))}
                className="tabular-nums"
                {...fieldErrorProps('produit-stock_min', errors.stock_min)}
              />,
              'Sous ce seuil, le produit passe en «\u00A0Stock bas\u00A0»'
            )}
            {showPrices &&
              field(
                'prix_achat',
                'Prix d’achat',
                <MoneyInput
                  id="produit-prix_achat"
                  value={values.prix_achat}
                  onChange={set('prix_achat')}
                  {...fieldErrorProps('produit-prix_achat', errors.prix_achat)}
                />
              )}
            {showPrices &&
              field(
                'prix_vente',
                <>
                  Prix de vente
                  <RequiredMark />
                </>,
                <MoneyInput
                  id="produit-prix_vente"
                  value={values.prix_vente}
                  onChange={set('prix_vente')}
                  required
                  {...fieldErrorProps('produit-prix_vente', errors.prix_vente)}
                />
              )}
            {!editing && (
              <>
                {field(
                  'location_id',
                  'Emplacement du stock initial',
                  <Select value={values.location_id || undefined} onValueChange={set('location_id')}>
                    <SelectTrigger
                      id="produit-location_id"
                      {...fieldErrorProps('produit-location_id', errors.location_id)}
                    >
                      <SelectValue placeholder="Choisir un emplacement…" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field(
                  'initial_stock',
                  'Stock initial',
                  <Input
                    id="produit-initial_stock"
                    inputMode="numeric"
                    value={values.initial_stock}
                    onChange={(e) => set('initial_stock')(e.target.value.replace(/[^\d]/g, ''))}
                    className="tabular-nums"
                    {...fieldErrorProps('produit-initial_stock', errors.initial_stock)}
                  />
                )}
              </>
            )}
            {field(
              'description',
              'Description',
              <Input
                id="produit-description"
                value={values.description}
                onChange={(e) => set('description')(e.target.value)}
                placeholder="Facultatif"
              />,
              undefined,
              'sm:col-span-2'
            )}
          </div>

          {editing && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span>
                Stock affiché : <span className="font-medium tabular-nums">{formatNumber(editing.stock)}</span>. Pour
                le corriger, ajustez-le avec un motif.
              </span>
              <Button type="button" variant="outline" className="gap-1.5" onClick={() => onAdjustStock(editing)}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Ajuster le stock
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Spinner />}
              {editing ? 'Enregistrer les modifications' : 'Créer le produit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Changer la catégorie de plusieurs produits.
// ===========================================================================
function CategoryDialog({
  products,
  categories,
  onClose,
  onDone,
}: {
  products: InventoryProduct[];
  categories: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [categorie, setCategorie] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const n = products.length;
  const error = categorie.trim() ? null : 'Saisissez ou choisissez une catégorie.';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (error) {
      document.getElementById('categorie-groupee')?.focus();
      return;
    }
    setSubmitting(true);
    let done = 0;
    let firstError: string | null = null;
    for (const p of products) {
      try {
        await produitService.update(p.id, { categorie: categorie.trim() });
        done++;
      } catch (err) {
        firstError ??= getErrorMessage(err, `Impossible de changer la catégorie de « ${p.nom} ».`);
      }
    }
    setSubmitting(false);
    if (done > 0) {
      toast.success(
        done > 1
          ? `Catégorie « ${categorie.trim()} » appliquée à ${formatNumber(done)} produits`
          : `Catégorie « ${categorie.trim()} » appliquée à 1 produit`
      );
    }
    const failed = n - done;
    if (failed > 0) {
      toast.error(`${failed > 1 ? `${formatNumber(failed)} modifications ont échoué` : 'Une modification a échoué'} : ${firstError}`);
    }
    if (done > 0) onDone();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Changer la catégorie</DialogTitle>
            <DialogDescription>
              {n > 1
                ? `Les ${formatNumber(n)} produits sélectionnés passeront dans cette catégorie`
                : `« ${products[0]?.nom} » passera dans cette catégorie`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="categorie-groupee">
              Nouvelle catégorie
              <RequiredMark />
            </Label>
            <Input
              id="categorie-groupee"
              list="categories-existantes"
              value={categorie}
              onChange={(e) => setCategorie(e.target.value)}
              autoComplete="off"
              required
              {...fieldErrorProps('categorie-groupee', submitted && error)}
            />
            <datalist id="categories-existantes">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <FieldError id="categorie-groupee">{submitted ? error : null}</FieldError>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Spinner />}
              {n > 1 ? `Changer la catégorie des ${formatNumber(n)} produits` : 'Changer la catégorie'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Historique des mouvements d'un produit.
// ===========================================================================
function HistoryDialog({
  product,
  locationName,
  onClose,
}: {
  product: InventoryProduct;
  locationName: (id: number | null) => string | null;
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = (await produitService.getStockHistory(product.id, 50)) as unknown;
      setMovements(Array.isArray(rows) ? (rows as StockMovement[]) : []);
    } catch (err) {
      setError(err);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8">Historique des mouvements — {product.nom}</DialogTitle>
          <DialogDescription>
            Référence <DocumentCode>{product.reference}</DocumentCode>. Les 50 derniers mouvements de stock, du plus
            récent au plus ancien.
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
          role="region"
          aria-label="Mouvements de stock"
        >
          {loading ? (
            <LoadingState inCell message="Chargement de l’historique…" />
          ) : error ? (
            <QueryErrorState error={error} title="Impossible de charger l’historique" onRetry={() => void load()} />
          ) : movements.length === 0 ? (
            <EmptyState
              compact
              icon={History}
              title="Aucun mouvement enregistré"
              description="Les ventes, réceptions, transferts et ajustements de ce produit apparaîtront ici"
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {movements.map((m) => {
                const quantite = Math.trunc(num(m.quantite));
                const entrant = quantite > 0;
                const where = locationName(m.location_id);
                return (
                  <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">{MOVEMENT_LABELS[m.type_mouvement] ?? 'Autre mouvement'}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(m.date_mouvement)}
                        {where ? ` · ${where}` : ''}
                      </p>
                      {m.raison && <p className="break-words text-xs text-muted-foreground">Motif : {m.raison}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          'text-sm font-medium tabular-nums',
                          entrant ? 'text-success-700' : quantite < 0 ? 'text-danger-700' : undefined
                        )}
                      >
                        {entrant ? '+' : quantite < 0 ? MINUS : ''}
                        {formatNumber(Math.abs(quantite))}
                        <span className="sr-only">{entrant ? ' entrée' : quantite < 0 ? ' sortie' : ''}</span>
                      </p>
                      {m.stock_avant !== null && m.stock_apres !== null && (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          Stock : {formatNumber(num(m.stock_avant))} → {formatNumber(num(m.stock_apres))}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Informations d'achat d'un produit (fournisseur, prix d'achat, acheteurs).
// ===========================================================================
function PurchaseInfoDialog({ product, onClose }: { product: InventoryProduct; onClose: () => void }) {
  const [info, setInfo] = useState<PurchaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo((await produitService.getPurchaseInfo(product.id)) as PurchaseInfo);
    } catch (err) {
      setInfo(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const history = info
    ? [
        ...(info.purchase_history ?? []).map((item) => ({ ...item, source: 'Facture fournisseur' })),
        ...(info.order_history ?? []).map((item) => ({ ...item, source: 'Commande fournisseur' })),
      ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
    : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8">Informations d’achat — {product.nom}</DialogTitle>
          <DialogDescription>
            Référence <DocumentCode>{product.reference}</DocumentCode>. Fournisseur, prix d’achat et client qui achète
            le plus ce produit.
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
          role="region"
          aria-label="Informations d’achat"
        >
          {loading ? (
            <LoadingState inCell message="Chargement des informations d’achat…" />
          ) : error || !info ? (
            <QueryErrorState
              error={error}
              title="Impossible de charger les informations d’achat"
              onRetry={() => void load()}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <section className="space-y-1 rounded-lg border p-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Fournisseur par défaut</h3>
                  {info.default_supplier ? (
                    <>
                      <p className="font-medium">{info.default_supplier.raison_sociale}</p>
                      {info.default_supplier.telephone && (
                        <p className="text-sm text-muted-foreground">Tél. : {info.default_supplier.telephone}</p>
                      )}
                      {info.default_supplier.email && (
                        <p className="break-all text-sm text-muted-foreground">E-mail : {info.default_supplier.email}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucun fournisseur par défaut</p>
                  )}
                </section>
                <section className="space-y-1 rounded-lg border p-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Prix d’achat</h3>
                  {info.price_stats ? (
                    <>
                      {info.price_stats.prix_min === info.price_stats.prix_max ? (
                        <p className="text-xl font-medium">
                          <Money value={info.price_stats.prix_min} />
                        </p>
                      ) : (
                        <p className="text-lg font-medium">
                          <Money value={info.price_stats.prix_min} /> – <Money value={info.price_stats.prix_max} />
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Moyenne : <Money value={info.price_stats.prix_moyen} /> ·{' '}
                        {plural(info.price_stats.total_achats, 'achat', 'achats')}
                      </p>
                      {info.recent_purchase && (
                        <p className="border-t pt-1 text-xs text-muted-foreground">
                          Dernier achat : <Money value={info.recent_purchase.prix_unitaire} />
                          {info.recent_purchase.fournisseur ? ` chez ${info.recent_purchase.fournisseur}` : ''}
                          {info.recent_purchase.date ? `, le ${formatDate(info.recent_purchase.date)}` : ''}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-medium">
                        <Money value={info.prix_achat} />
                      </p>
                      <p className="text-xs text-muted-foreground">Prix de la fiche : aucun achat enregistré</p>
                    </>
                  )}
                </section>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Derniers achats</h3>
                {history.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Package}
                    title="Aucun achat enregistré pour ce produit"
                    description="Les commandes et factures fournisseur de ce produit apparaîtront ici"
                  />
                ) : (
                  <Table aria-label="Derniers achats" containerClassName="rounded-md border">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Fournisseur</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead numeric>Quantité</TableHead>
                        <TableHead numeric>Prix unitaire</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((item, i) => (
                        <TableRow key={`${item.source}-${item.numero ?? i}-${i}`}>
                          <TableCell className="whitespace-nowrap">{formatDate(item.date)}</TableCell>
                          <TableCell>{item.fournisseur || '—'}</TableCell>
                          <TableCell>
                            {item.numero ? <DocumentCode className="text-xs">{item.numero}</DocumentCode> : '—'}
                            <span className="block text-xs text-muted-foreground">{item.source}</span>
                          </TableCell>
                          <TableCell numeric>{formatNumber(num(item.quantite))}</TableCell>
                          <TableCell numeric>
                            <Money value={item.prix_unitaire} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>

              <section className="space-y-1 rounded-lg border p-4">
                <h3 className="text-sm font-medium text-muted-foreground">Client qui en achète le plus</h3>
                {info.top_buyer ? (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {[info.top_buyer.prenom, info.top_buyer.raison_sociale].filter(Boolean).join(' ')}
                      </p>
                      {info.top_buyer.telephone && (
                        <p className="text-sm text-muted-foreground">Tél. : {info.top_buyer.telephone}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-medium tabular-nums">
                        {plural(info.top_buyer.total_quantite, 'unité', 'unités')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {plural(info.top_buyer.nombre_factures, 'facture', 'factures')} ·{' '}
                        <Money value={info.top_buyer.total_depense} />
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune vente enregistrée pour ce produit</p>
                )}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
