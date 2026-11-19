import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, PackageSearch, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { produitService } from '@/services/api';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { formatNumber, toNumber } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { RequiredMark } from '@/components/ui/required-mark';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryState } from '@/components/ui/query-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { DocumentTotals } from '@/components/ui/document-totals';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Produit proposé à l'achat (recherche ou catalogue) : prix d'achat et stock
 * tous emplacements confondus, pour décider de la quantité à commander.
 */
export interface PurchasableProduct {
  id: number;
  nom: string;
  reference: string;
  prix_achat: number | string | null;
  stock: number | string | null;
  stock_min: number | string | null;
  categorie?: string | null;
}

/** Ligne d'une commande fournisseur en cours de saisie. */
export interface CommandeLigneDraft {
  produit_id: number;
  produit_nom: string;
  produit_reference: string;
  quantite: number;
  prix_unitaire: number;
  stock: number;
  stock_min: number;
}

function toLigneDraft(p: PurchasableProduct): CommandeLigneDraft {
  return {
    produit_id: p.id,
    produit_nom: p.nom,
    produit_reference: p.reference,
    quantite: 1,
    prix_unitaire: toNumber(p.prix_achat) ?? 0,
    stock: toNumber(p.stock) ?? 0,
    stock_min: toNumber(p.stock_min) ?? 0,
  };
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Stock du produit, avec « Stock bas » en mots (jamais la couleur seule). */
function StockHint({ stock, stockMin }: { stock: number; stockMin: number }) {
  const low = stock <= stockMin;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', low ? 'text-warning-700' : 'text-muted-foreground')}>
      {low && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      Stock {formatNumber(stock)} · min. {formatNumber(stockMin)}
      {low && <span className="font-medium">· Stock bas</span>}
    </span>
  );
}

interface CommandeProductPickerProps {
  /** `id` du champ, relié au libellé visible. */
  id: string;
  /** Produits déjà sur la commande : proposés mais désactivés. */
  selectedIds: ReadonlySet<number>;
  onSelect: (product: PurchasableProduct) => void;
  /** Création rapide d'une fiche quand rien ne correspond à la recherche. */
  onCreate?: (query: string) => void;
  /** Mention d'un produit déjà présent (défaut « Déjà dans la commande »). */
  alreadyAddedLabel?: string;
}

/**
 * Recherche de produit à ajouter à une commande fournisseur — motif
 * « combobox » (WCAG 2.1.1 / 4.1.2) : flèches pour parcourir, Entrée pour
 * ajouter, Échap pour fermer. Les anciennes listes `<li onMouseDown>` se
 * fermaient au départ du focus : au clavier, aucun produit ne pouvait être
 * ajouté (A11Y-S01).
 */
export function CommandeProductPicker({
  id,
  selectedIds,
  onSelect,
  onCreate,
  alreadyAddedLabel = 'Déjà dans la commande',
}: CommandeProductPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<PurchasableProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const requestRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 250 ms : une recherche par mot, pas une par frappe (D1, limiteur de requêtes).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      setFailed(false);
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    setLoading(true);
    setFailed(false);
    produitService
      .searchFuzzy(debounced, 10, 0.1)
      .then((rows) => {
        if (request !== requestRef.current) return;
        const list = (Array.isArray(rows) ? rows : []) as PurchasableProduct[];
        setResults(list);
        setActive(list.length > 0 ? 0 : -1);
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        setResults([]);
        setFailed(true);
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
  }, [debounced]);

  const isDisabled = (p: PurchasableProduct) => selectedIds.has(p.id);

  const pick = (p: PurchasableProduct) => {
    if (isDisabled(p)) return;
    onSelect(p);
    setQuery('');
    setDebounced('');
    setResults([]);
    setActive(-1);
    setOpen(false);
    inputRef.current?.focus();
  };

  const searching = query.trim().length >= 2;
  const pending = searching && (loading || query.trim() !== debounced);
  const showPanel = open && searching;
  const showList = showPanel && !pending && !failed && results.length > 0;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Jamais d'envoi du formulaire depuis la recherche : Entrée ajoute le produit actif.
      e.preventDefault();
      if (showList && active >= 0) pick(results[active]);
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    }
  };

  const status = !searching
    ? ''
    : pending
      ? 'Recherche en cours…'
      : failed
        ? 'Recherche impossible. Réessayez.'
        : results.length === 0
          ? `Aucun produit ne correspond à « ${query.trim()} ».`
          : `${plural(results.length, 'produit trouvé', 'produits trouvés')}.`;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        id={id}
        type="search"
        role="combobox"
        autoComplete="off"
        enterKeyHint="search"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={`${id}-hint`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Nom ou référence du produit…"
        className="pl-10"
      />
      <p id={`${id}-hint`} className="sr-only">
        Saisissez au moins deux caractères, puis utilisez les flèches et Entrée pour ajouter un produit
      </p>
      <p role="status" className="sr-only">
        {status}
      </p>

      {showPanel && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          {pending ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Spinner /> Recherche…
            </p>
          ) : failed ? (
            <p className="px-3 py-3 text-sm text-danger-700">
              Recherche impossible. Vérifiez la connexion puis réessayez.
            </p>
          ) : results.length === 0 ? (
            <EmptyState
              compact
              icon={PackageSearch}
              title={`Aucun produit ne correspond à « ${query.trim()} »`}
              description="Vérifiez l’orthographe ou créez la fiche produit maintenant"
              action={
                onCreate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      onCreate(query.trim());
                      setOpen(false);
                    }}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Créer « {query.trim()} »
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul id={listId} role="listbox" aria-label="Produits trouvés" className="max-h-72 overflow-y-auto py-1">
              {results.map((p, i) => {
                const disabled = isDisabled(p);
                return (
                  <li
                    key={p.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={disabled || undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(p)}
                    onMouseMove={() => setActive(i)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 px-3 py-2',
                      i === active && 'bg-accent text-accent-foreground',
                      disabled && 'cursor-not-allowed'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={p.nom}>
                        {p.nom}
                      </p>
                      <DocumentCode className="block text-xs text-muted-foreground">{p.reference}</DocumentCode>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                      <Money value={p.prix_achat} className="text-sm font-medium" />
                      {disabled ? (
                        <span className="text-xs text-muted-foreground">{alreadyAddedLabel}</span>
                      ) : (
                        <StockHint stock={toNumber(p.stock) ?? 0} stockMin={toNumber(p.stock_min) ?? 0} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface CatalogueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: ReadonlySet<number>;
  onAdd: (product: PurchasableProduct) => void;
}

/** Catalogue parcourable (recherche serveur + catégorie), dans un tiroir Radix. */
function CatalogueSheet({ open, onOpenChange, selectedIds, onAdd }: CatalogueSheetProps) {
  const searchId = useId();
  const categoryId = useId();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('all');
  const [products, setProducts] = useState<PurchasableProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    produitService
      .getAll(debounced || undefined, undefined, false, 1, 100)
      .then((res: { data?: PurchasableProduct[]; pagination?: { total?: number } } | PurchasableProduct[]) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : res?.data ?? [];
        setProducts(rows);
        setTotal(Array.isArray(res) ? rows.length : res?.pagination?.total ?? rows.length);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProducts([]);
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debounced, reloadKey]);

  const categories = useMemo(
    () =>
      Array.from(new Set(products.map((p) => p.categorie).filter((c): c is string => !!c))).sort((a, b) =>
        a.localeCompare(b, 'fr')
      ),
    [products]
  );
  const visible = category === 'all' ? products : products.filter((p) => p.categorie === category);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader className="border-b p-4 pr-14">
          <SheetTitle>Catalogue des produits</SheetTitle>
          <SheetDescription>Ajoutez des produits à la commande ; ils restent modifiables dans le tableau</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 border-b p-4">
          <div className="space-y-1.5">
            <Label htmlFor={searchId}>Rechercher</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id={searchId}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom ou référence…"
                className="pl-10"
              />
            </div>
          </div>
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor={categoryId}>Catégorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id={categoryId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <QueryState
            loading={loading}
            error={error}
            onRetry={() => setReloadKey((k) => k + 1)}
            errorTitle="Impossible de charger le catalogue"
            skeleton={<ListSkeleton items={6} />}
            isEmpty={visible.length === 0}
            emptyIcon={PackageSearch}
            emptyTitle={debounced ? `Aucun produit ne correspond à « ${debounced} »` : 'Aucun produit dans le catalogue'}
            emptyDescription="Cherchez par nom ou référence"
          >
            {total > products.length && (
              <p className="mb-3 text-xs text-muted-foreground">
                {formatNumber(products.length)} premiers produits sur {formatNumber(total)} : affinez la recherche
              </p>
            )}
            <ul className="space-y-2" aria-label="Produits du catalogue">
              {visible.map((p) => {
                const inOrder = selectedIds.has(p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={p.nom}>
                        {p.nom}
                      </p>
                      <DocumentCode className="block text-xs text-muted-foreground">{p.reference}</DocumentCode>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Money value={p.prix_achat} className="text-xs font-medium" />
                        <StockHint stock={toNumber(p.stock) ?? 0} stockMin={toNumber(p.stock_min) ?? 0} />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="touch"
                      variant={inOrder ? 'secondary' : 'outline'}
                      disabled={inOrder}
                      onClick={() => onAdd(p)}
                      aria-label={inOrder ? `${p.nom} : déjà dans la commande` : `Ajouter ${p.nom} à la commande`}
                    >
                      {inOrder ? 'Ajouté' : 'Ajouter'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </QueryState>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onCreated: (product: PurchasableProduct) => void;
}

/** Fiche produit minimale créée depuis la commande (nom, référence, prix d'achat). */
function QuickCreateDialog({ open, onOpenChange, initialName, onCreated }: QuickCreateDialogProps) {
  const [nom, setNom] = useState(initialName);
  const [reference, setReference] = useState('');
  const [prix, setPrix] = useState('');
  const [categorie, setCategorie] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ nom?: string; reference?: string }>({});

  useEffect(() => {
    if (open) {
      setNom(initialName);
      setReference('');
      setPrix('');
      setCategorie('');
      setErrors({});
    }
  }, [open, initialName]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Rendu en portail mais imbriqué dans le formulaire de commande côté React :
    // l'envoi ne doit pas remonter jusqu'à lui.
    e.stopPropagation();
    const next: { nom?: string; reference?: string } = {};
    if (!nom.trim()) next.nom = 'Saisissez le nom du produit.';
    if (!reference.trim()) next.reference = 'Saisissez la référence du produit.';
    setErrors(next);
    if (next.nom || next.reference) {
      document.getElementById(next.nom ? 'qc-nom' : 'qc-ref')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const prixAchat = Number(prix) || 0;
      // Prix de vente laissé à 0 : la fiche apparaît « Prix non renseigné »
      // dans l'inventaire au lieu d'être vendable au prix d'achat.
      const result = await produitService.create({
        nom: nom.trim(),
        reference: reference.trim(),
        prix_achat: prixAchat,
        prix_vente: 0,
        categorie: categorie.trim() || null,
        description: '',
        stock_min: 0,
      });
      onCreated({
        id: result.id,
        nom: nom.trim(),
        reference: reference.trim(),
        prix_achat: prixAchat,
        stock: 0,
        stock_min: 0,
        categorie: categorie.trim() || null,
      });
      toast.success(`Produit « ${nom.trim()} » créé et ajouté à la commande`);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de créer le produit. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau produit</DialogTitle>
          <DialogDescription>
            La fiche est créée sans prix de vente : renseignez-le dans l’inventaire avant de vendre ce produit
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="qc-nom">
              Nom du produit <RequiredMark />
            </Label>
            <Input
              id="qc-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex. : Clavier USB"
              aria-invalid={errors.nom ? true : undefined}
              aria-describedby={errors.nom ? 'qc-nom-error' : undefined}
            />
            {errors.nom && (
              <p id="qc-nom-error" role="alert" className="text-xs font-medium text-danger-700">
                {errors.nom}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qc-ref">
              Référence <RequiredMark />
            </Label>
            <Input
              id="qc-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. : CLV-001"
              aria-invalid={errors.reference ? true : undefined}
              aria-describedby={errors.reference ? 'qc-ref-error' : undefined}
            />
            {errors.reference && (
              <p id="qc-ref-error" role="alert" className="text-xs font-medium text-danger-700">
                {errors.reference}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="qc-prix">Prix d’achat</Label>
              <MoneyInput id="qc-prix" value={prix} onChange={setPrix} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-cat">Catégorie</Label>
              <Input
                id="qc-cat"
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                placeholder="Ex. : Périphériques"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Spinner />}
              Créer et ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CommandeLinesEditorProps {
  /** Préfixe des `id` de champs (deux éditeurs ne cohabitent jamais, mais les tests montent les deux vues). */
  idPrefix: string;
  lignes: CommandeLigneDraft[];
  onChange: (lignes: CommandeLigneDraft[]) => void;
  /** Message de validation (« Ajoutez au moins un produit à la commande. »). */
  error?: string;
}

/**
 * Lignes d'une commande fournisseur : recherche au clavier, catalogue,
 * création rapide de fiche, quantité et prix d'achat par ligne, total.
 * Partagé par la création (Commandes) et la modification (CommandeDetail).
 */
export function CommandeLinesEditor({ idPrefix, lignes, onChange, error }: CommandeLinesEditorProps) {
  const pickerId = `${idPrefix}-produit`;
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [quickCreate, setQuickCreate] = useState<{ open: boolean; name: string }>({ open: false, name: '' });

  const selectedIds = useMemo(() => new Set(lignes.map((l) => l.produit_id)), [lignes]);
  const total = lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire, 0);

  const add = (p: PurchasableProduct) => {
    if (selectedIds.has(p.id)) {
      toast.info(`« ${p.nom} » est déjà dans la commande`);
      return;
    }
    onChange([...lignes, toLigneDraft(p)]);
  };

  const update = (index: number, patch: Partial<CommandeLigneDraft>) =>
    onChange(lignes.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const remove = (index: number) => onChange(lignes.filter((_, i) => i !== index));

  const quantityInput = (ligne: CommandeLigneDraft, index: number, mobile = false) => (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      step={1}
      value={ligne.quantite}
      onChange={(e) => update(index, { quantite: Math.max(1, parseInt(e.target.value, 10) || 1) })}
      aria-label={`Quantité — ${ligne.produit_nom}`}
      className={cn('text-right tabular-nums', mobile ? 'h-11 w-24' : 'ms-auto w-20')}
    />
  );

  const priceInput = (ligne: CommandeLigneDraft, index: number, mobile = false) => (
    <MoneyInput
      value={ligne.prix_unitaire ? String(Math.round(ligne.prix_unitaire)) : ''}
      onChange={(v) => update(index, { prix_unitaire: Number(v) || 0 })}
      aria-label={`Prix unitaire — ${ligne.produit_nom}`}
      className={cn(mobile ? 'h-11' : 'w-36')}
    />
  );

  const removeButton = (ligne: CommandeLigneDraft, index: number) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-touch"
      onClick={() => remove(index)}
      aria-label={`Retirer ${ligne.produit_nom} de la commande`}
      className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Produits commandés</CardTitle>
          <CardDescription>
            {lignes.length > 0
              ? plural(lignes.length, 'produit différent', 'produits différents')
              : 'Recherchez un produit ou ouvrez le catalogue'}
          </CardDescription>
        </div>
        {/* Commande vide : l'état vide porte déjà « Parcourir le catalogue ». */}
        {lignes.length > 0 && (
          <Button type="button" variant="outline" size="touch" className="gap-2" onClick={() => setCatalogOpen(true)}>
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Parcourir le catalogue
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={pickerId}>Ajouter un produit</Label>
          <CommandeProductPicker
            id={pickerId}
            selectedIds={selectedIds}
            onSelect={add}
            onCreate={(name) => setQuickCreate({ open: true, name })}
          />
        </div>

        {lignes.length === 0 ? (
          <div className={cn('rounded-lg border border-dashed', error && 'border-danger-600')}>
            <EmptyState
              compact
              icon={PackageSearch}
              title="Aucun produit dans la commande"
              description="Recherchez un produit ou ouvrez le catalogue pour l’ajouter"
              action={
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setCatalogOpen(true)}>
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  Parcourir le catalogue
                </Button>
              }
            />
          </div>
        ) : (
          <ResponsiveTable
            table={
              <Table aria-label="Produits de la commande">
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead numeric>Quantité</TableHead>
                    <TableHead numeric>Prix unitaire</TableHead>
                    <TableHead numeric>Total</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Retirer</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lignes.map((ligne, index) => (
                    <TableRow key={ligne.produit_id}>
                      <TableCell>
                        <p className="font-medium">{ligne.produit_nom}</p>
                        <DocumentCode className="block text-xs text-muted-foreground">{ligne.produit_reference}</DocumentCode>
                        <StockHint stock={ligne.stock} stockMin={ligne.stock_min} />
                      </TableCell>
                      <TableCell numeric>{quantityInput(ligne, index)}</TableCell>
                      <TableCell numeric>
                        <div className="flex justify-end">{priceInput(ligne, index)}</div>
                      </TableCell>
                      <TableCell numeric>
                        <Money value={ligne.quantite * ligne.prix_unitaire} />
                      </TableCell>
                      <TableCell className="text-right">{removeButton(ligne, index)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
            cards={lignes.map((ligne, index) => (
              <DataCard
                key={ligne.produit_id}
                title={ligne.produit_nom}
                actions={
                  <div className="flex w-full flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <span className="block text-xs text-muted-foreground" aria-hidden="true">
                        Quantité
                      </span>
                      {quantityInput(ligne, index, true)}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="block text-xs text-muted-foreground" aria-hidden="true">
                        Prix unitaire
                      </span>
                      {priceInput(ligne, index, true)}
                    </div>
                    {removeButton(ligne, index)}
                  </div>
                }
              >
                <DataCardRow label="Référence" value={<DocumentCode>{ligne.produit_reference}</DocumentCode>} />
                <DataCardRow label="Stock" value={<StockHint stock={ligne.stock} stockMin={ligne.stock_min} />} />
                <DataCardRow label="Total" value={<Money value={ligne.quantite * ligne.prix_unitaire} />} numeric />
              </DataCard>
            ))}
          />
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {error}
          </p>
        )}

        {/* « Total », comme sur la fiche : « Total de la commande » passait sur deux
            lignes à côté d'un montant à huit chiffres. */}
        {lignes.length > 0 && <DocumentTotals total={{ label: 'Total', value: total }} />}
      </CardContent>

      <CatalogueSheet open={catalogOpen} onOpenChange={setCatalogOpen} selectedIds={selectedIds} onAdd={add} />
      <QuickCreateDialog
        open={quickCreate.open}
        onOpenChange={(open) => setQuickCreate((s) => ({ ...s, open }))}
        initialName={quickCreate.name}
        onCreated={add}
      />
    </Card>
  );
}
