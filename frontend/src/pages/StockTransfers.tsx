import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowLeftRight, Plus, Search, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import {
  stockLocationService,
  stockTransferService,
  type Page,
  type ProductWithStock,
} from '@/services/api';
import { usePermission, Permissions } from '@/hooks/usePermission';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Spinner } from '@/components/ui/loading';
import { CardSkeleton } from '@/components/ui/skeleton';
import { DocumentCode } from '@/components/ui/document-code';
import { QueryErrorState } from '@/components/ui/query-state';
import { DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { DocumentListPage, useDocumentList, type DocumentColumn } from '@/components/DocumentListPage';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { formatDate, formatDateNumeric, formatDateTime, formatNumber, normalizeSearch } from '@/utils/format';

// ---------------------------------------------------------------------------
// Types (réponses de /api/stock-transfers et /api/stock-locations)
// ---------------------------------------------------------------------------

interface Transfer {
  id: number;
  numero_transfer: string;
  location_source_id: number;
  location_destination_id: number;
  source_nom: string | null;
  destination_nom: string | null;
  date_transfer: string;
  /** Valeurs de l'ENUM `transfer_statut_new` : en_preparation | en_cours | livre | annule. */
  statut: string;
  notes: string | null;
  created_at: string;
  /** Pas encore renvoyés par l'API (VB-TRF-04) : affichés dès qu'ils le seront. */
  demande_id?: number | null;
  demande_numero?: string | null;
}

interface TransferLine {
  id: number;
  produit_id: number;
  produit_nom: string | null;
  reference: string | null;
  quantite_demandee: number;
  quantite_transferee: number | null;
}

interface TransferDetail extends Transfer {
  lignes: TransferLine[];
}

/** Décompte serveur de chaque puce de statut (clé = valeur de la puce, `all` = tous). */
type TransferStats = Record<string, number>;

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  actif?: boolean;
}

interface DraftLine {
  produit_id: number;
  produit_nom: string;
  reference: string;
  /** Saisie brute : un champ vidé reste vide au lieu de revenir à 1. */
  quantite: string;
  /** Quantité en stock à l'emplacement de départ au moment de l'ajout. */
  disponible: number;
}

// ---------------------------------------------------------------------------
// Règles d'affichage
// ---------------------------------------------------------------------------

/** Seul un transfert en préparation peut encore être exécuté ou annulé (StockTransferService). */
function isTransferActionable(statut: string | null | undefined): boolean {
  return statut === 'en_preparation';
}

/** Puces de filtre : le statut transitoire `en_cours` n'est jamais conservé en base (exécution atomique). */
const TRANSFER_STATUS_CHIPS = [
  { value: 'all', label: 'Tous' },
  ...getStatusOptions('transfert', { exclude: ['en_cours'] }),
];

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/**
 * Le serveur accepte `search` mais ne l'applique pas encore (« Needs from BE ») :
 * en recherche, on lit la fenêtre des transferts les plus récents et on filtre
 * ici sur le numéro et les emplacements. À retirer dès que l'API filtre.
 */
const SEARCH_WINDOW = 500;

function matchesSearch(t: Transfer, search: string): boolean {
  const q = normalizeSearch(search);
  if (!q) return true;
  return [t.numero_transfer, t.source_nom ?? '', t.destination_nom ?? ''].some((v) =>
    normalizeSearch(v).includes(q)
  );
}

const CSV_HEADERS = ['N° de transfert', 'De', 'Vers', 'Statut', 'Date', 'Notes'];
const csvRow = (t: Transfer) => [
  t.numero_transfer,
  t.source_nom ?? '',
  t.destination_nom ?? '',
  getStatusLabel('transfert', t.statut),
  formatDateNumeric(t.date_transfer),
  t.notes ?? '',
];

async function fetchTransfers(
  search: string,
  statut: string | undefined,
  page: number,
  limit: number
): Promise<Page<Transfer>> {
  if (!search) {
    return (await stockTransferService.getAll(undefined, statut, page, limit)) as Page<Transfer>;
  }
  const window = (await stockTransferService.getAll(undefined, statut, 1, SEARCH_WINDOW)) as Page<Transfer>;
  const rows = (window?.data ?? []).filter((t) => matchesSearch(t, search));
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
  };
}

/** Nombre de transferts d'un statut (tous sans statut), lu dans la pagination du serveur. */
async function countTransfers(statut?: string): Promise<number> {
  const res = (await stockTransferService.getAll(undefined, statut, 1, 1)) as Page<Transfer>;
  return res?.pagination?.total ?? 0;
}

/**
 * Un décompte serveur par puce : « Tous 6 · En préparation 1 · Livré 4 ·
 * Annulé 1 ». Deux tuiles d'un chiffre répétaient les puces au-dessus d'elles.
 */
async function fetchTransferCounts(): Promise<TransferStats> {
  const counts = await Promise.all(
    TRANSFER_STATUS_CHIPS.map((c) => countTransfers(c.value === 'all' ? undefined : c.value))
  );
  return Object.fromEntries(TRANSFER_STATUS_CHIPS.map((c, i) => [c.value, counts[i]]));
}

// ---------------------------------------------------------------------------
// Sélecteur de produit à l'emplacement de départ (U-06)
// ---------------------------------------------------------------------------

interface SourceProductPickerProps {
  id: string;
  sourceId: number | null;
  sourceNom: string;
  addedIds: ReadonlySet<number>;
  onPick: (product: ProductWithStock) => void;
  /** La liste est ouverte : le dialogue parent ne doit pas se fermer sur Échap. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Recherche à la frappe (250 ms) parmi les produits EN STOCK à l'emplacement de
 * départ, avec la quantité disponible à cet emplacement. Motif « combobox » :
 * flèches pour parcourir, Entrée pour ajouter, Échap pour fermer — au clavier
 * comme à la souris (l'ancienne liste déroulante ne montrait que les 20 premiers
 * produits du catalogue et leur stock tous emplacements confondus).
 */
function SourceProductPicker({ id, sourceId, sourceNom, addedIds, onPick, onOpenChange }: SourceProductPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpenState] = useState(false);
  const [active, setActive] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef(0);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || !sourceId) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    stockLocationService
      .getProductsWithStock(sourceId, debounced || undefined, 20)
      .then((rows) => {
        if (request !== requestRef.current) return;
        setResults(rows);
        setActive(rows.findIndex((r) => !addedIds.has(r.produit_id)));
      })
      .catch((err) => {
        if (request !== requestRef.current) return;
        setResults([]);
        setError(err);
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
    // `addedIds` ne relance pas la recherche : il ne sert qu'à l'option active initiale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceId, debounced, attempt]);

  // Changer d'emplacement de départ vide la recherche (le stock n'est plus le même).
  useEffect(() => {
    setQuery('');
    setDebounced('');
    setResults([]);
  }, [sourceId]);

  const isAdded = (p: ProductWithStock) => addedIds.has(p.produit_id);

  const pick = (p: ProductWithStock | undefined) => {
    if (!p || isAdded(p)) return;
    onPick(p);
    setQuery('');
    setActive(-1);
  };

  const move = (delta: number) => {
    if (results.length === 0) return;
    let next = active;
    for (let i = 0; i < results.length; i++) {
      next = (next + delta + results.length) % results.length;
      if (!isAdded(results[next])) break;
    }
    setActive(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) move(-1);
    } else if (e.key === 'Enter') {
      // Entrée ajoute le produit actif — jamais l'envoi du formulaire.
      e.preventDefault();
      if (open && active >= 0) pick(results[active]);
    } else if (e.key === 'Escape') {
      if (open) setOpen(false);
    }
  };

  const disabled = !sourceId;
  const showList = open && !disabled;
  const listVisible = showList && !loading && !error && results.length > 0;
  const activeId = listVisible && active >= 0 && results[active] ? `${listId}-${active}` : undefined;
  const statusText = disabled
    ? ''
    : loading
      ? 'Recherche…'
      : error
        ? ''
        : results.length === 0
          ? debounced
            ? `Aucun produit en stock ne correspond à « ${debounced} » à ${sourceNom}.`
            : `Aucun produit en stock à ${sourceNom}.`
          : plural(results.length, 'produit trouvé', 'produits trouvés');

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
        id={id}
        type="search"
        role="combobox"
        aria-expanded={listVisible}
        aria-controls={listVisible ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        enterKeyHint="search"
        disabled={disabled}
        placeholder={disabled ? 'Choisissez d’abord l’emplacement de départ' : 'Nom ou référence du produit'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-11 pl-10 sm:h-9"
      />
      <p role="status" className="sr-only">
        {showList ? statusText : ''}
      </p>
      {showList && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Spinner /> Recherche…
            </div>
          ) : error ? (
            <div className="space-y-2 px-3 py-3 text-sm">
              <p className="text-danger-700">Impossible de charger le stock de {sourceNom}.</p>
              <Button
                type="button"
                variant="outline"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setAttempt((n) => n + 1)}
              >
                Réessayer
              </Button>
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">{statusText}</p>
          ) : (
            <div id={listId} role="listbox" aria-label={`Produits en stock à ${sourceNom}`}>
            {results.map((p, i) => {
              const added = isAdded(p);
              return (
                <div
                  key={p.produit_id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={added || undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => !added && setActive(i)}
                  onClick={() => pick(p)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm',
                    i === active && !added && 'bg-accent text-accent-foreground',
                    added && 'cursor-not-allowed text-muted-foreground'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium" title={p.produit_nom}>
                      {p.produit_nom}
                    </span>
                    <DocumentCode className="block truncate text-xs text-muted-foreground">{p.reference}</DocumentCode>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    {added ? (
                      'Déjà ajouté'
                    ) : (
                      <>
                        Disponible :{' '}
                        <span className="font-medium tabular-nums text-foreground">
                          {formatNumber(p.quantite_disponible)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Création d'un transfert
// ---------------------------------------------------------------------------

interface CreateTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: { id: number; numero_transfer: string }) => void;
}

type DraftErrors = {
  source?: string;
  destination?: string;
  lignes?: string;
  quantite?: Record<number, string>;
};

function lineError(line: DraftLine, sourceNom: string): string | undefined {
  const raw = line.quantite.trim();
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return 'Saisissez une quantité entière d’au moins 1.';
  if (n > line.disponible) {
    return `Il n’y a que ${plural(line.disponible, 'unité', 'unités')} à ${sourceNom}.`;
  }
  return undefined;
}

function CreateTransferDialog({ open, onOpenChange, onCreated }: CreateTransferDialogProps) {
  const confirm = useConfirm();
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<unknown>(null);
  const [sourceId, setSourceId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      const data = (await stockLocationService.getAll()) as StockLocation[] | { data?: StockLocation[] };
      const rows = Array.isArray(data) ? data : data?.data ?? [];
      setLocations(rows.filter((l) => l.actif !== false));
    } catch (err) {
      setLocationsError(err);
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && locations.length === 0) void loadLocations();
  }, [open, locations.length, loadLocations]);

  const reset = () => {
    setSourceId('');
    setDestinationId('');
    setNotes('');
    setLines([]);
    setErrors({});
  };

  const source = locations.find((l) => String(l.id) === sourceId);
  const destination = locations.find((l) => String(l.id) === destinationId);
  const sourceNom = source?.nom ?? 'l’emplacement de départ';
  const addedIds = useMemo(() => new Set(lines.map((l) => l.produit_id)), [lines]);

  const changeSource = async (value: string) => {
    if (value === sourceId) return;
    if (lines.length > 0) {
      const ok = await confirm({
        title: 'Changer l’emplacement de départ ?',
        description: `${
          lines.length === 1
            ? 'Le produit ajouté sera retiré'
            : `Les ${formatNumber(lines.length)} produits ajoutés seront retirés`
        } : le stock disponible dépend de l’emplacement de départ.`,
        confirmLabel: 'Changer d’emplacement',
        cancelLabel: 'Garder les produits',
      });
      if (!ok) return;
      setLines([]);
    }
    setSourceId(value);
    if (value === destinationId) setDestinationId('');
    setErrors((e) => ({ ...e, source: undefined, lignes: undefined, quantite: undefined }));
  };

  const addLine = (p: ProductWithStock) => {
    setLines((prev) => [
      ...prev,
      {
        produit_id: p.produit_id,
        produit_nom: p.produit_nom,
        reference: p.reference,
        quantite: '1',
        disponible: Number(p.quantite_disponible) || 0,
      },
    ]);
    setErrors((e) => ({ ...e, lignes: undefined }));
  };

  const updateQuantite = (produitId: number, value: string) => {
    setLines((prev) => prev.map((l) => (l.produit_id === produitId ? { ...l, quantite: value } : l)));
    setErrors((e) => {
      if (!e.quantite?.[produitId]) return e;
      const next = { ...e.quantite };
      delete next[produitId];
      return { ...e, quantite: next };
    });
  };

  const removeLine = (produitId: number) => setLines((prev) => prev.filter((l) => l.produit_id !== produitId));

  const validate = (): DraftErrors => {
    const next: DraftErrors = {};
    if (!sourceId) next.source = 'Choisissez l’emplacement de départ.';
    if (!destinationId) next.destination = 'Choisissez l’emplacement d’arrivée.';
    else if (destinationId === sourceId) next.destination = 'Choisissez deux emplacements différents.';
    if (lines.length === 0) next.lignes = 'Ajoutez au moins un produit au transfert.';
    const quantite: Record<number, string> = {};
    for (const l of lines) {
      const msg = lineError(l, sourceNom);
      if (msg) quantite[l.produit_id] = msg;
    }
    if (Object.keys(quantite).length > 0) next.quantite = quantite;
    return next;
  };

  const focusFirstError = (e: DraftErrors) => {
    const target = e.source
      ? 'transfer-source'
      : e.destination
        ? 'transfer-destination'
        : e.lignes
          ? 'transfer-product-search'
          : e.quantite
            ? `transfer-qty-${Object.keys(e.quantite)[0]}`
            : null;
    if (target) document.getElementById(target)?.focus();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (found.source || found.destination || found.lignes || found.quantite) {
      focusFirstError(found);
      return;
    }
    setSubmitting(true);
    try {
      const created = (await stockTransferService.create({
        location_source_id: Number(sourceId),
        location_destination_id: Number(destinationId),
        lignes: lines.map((l) => ({ produit_id: l.produit_id, quantite_demandee: Number(l.quantite) })),
        notes: notes.trim() || undefined,
      })) as { id: number; numero_transfer: string };
      toast.success(`Transfert ${created.numero_transfer} créé`);
      reset();
      onCreated(created);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de créer le transfert. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  const totalUnits = lines.reduce((sum, l) => sum + (Number(l.quantite) || 0), 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-2xl"
        onEscapeKeyDown={(e) => {
          // Échap ferme d'abord la liste de produits, pas tout le formulaire.
          if (pickerOpen) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Nouveau transfert</DialogTitle>
          <DialogDescription>
            Le stock ne bouge qu’à l’exécution du transfert : il quitte alors l’emplacement de départ pour
            l’emplacement d’arrivée
          </DialogDescription>
        </DialogHeader>

        {locationsError ? (
          <QueryErrorState
            error={locationsError}
            title="Impossible de charger les emplacements"
            onRetry={() => void loadLocations()}
            className="py-6"
          />
        ) : (
          <form id="transfer-form" onSubmit={submit} noValidate className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="transfer-source">
                  Emplacement de départ <RequiredMark />
                </Label>
                <Select value={sourceId || undefined} onValueChange={(v) => void changeSource(v)} disabled={locationsLoading}>
                  <SelectTrigger id="transfer-source" className="h-11 sm:h-9" {...fieldErrorProps('transfer-source', errors.source)}>
                    <SelectValue placeholder={locationsLoading ? 'Chargement…' : 'Choisir un emplacement'} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="transfer-source">{errors.source}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-destination">
                  Emplacement d’arrivée <RequiredMark />
                </Label>
                <Select
                  value={destinationId || undefined}
                  onValueChange={(v) => {
                    setDestinationId(v);
                    setErrors((e) => ({ ...e, destination: undefined }));
                  }}
                  disabled={locationsLoading}
                >
                  <SelectTrigger
                    id="transfer-destination"
                    className="h-11 sm:h-9"
                    {...fieldErrorProps('transfer-destination', errors.destination)}
                  >
                    <SelectValue placeholder={locationsLoading ? 'Chargement…' : 'Choisir un emplacement'} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations
                      .filter((l) => String(l.id) !== sourceId)
                      .map((loc) => (
                        <SelectItem key={loc.id} value={String(loc.id)}>
                          {loc.nom}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FieldError id="transfer-destination">{errors.destination}</FieldError>
              </div>
            </div>

            <section aria-labelledby="transfer-lines-title" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="transfer-lines-title" className="text-sm font-medium">
                  Produits à transférer
                </h3>
                {lines.length > 0 && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {plural(lines.length, 'produit', 'produits')} · {plural(totalUnits, 'unité', 'unités')}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-product-search">
                  Ajouter un produit{source ? ` en stock à ${source.nom}` : ''}
                </Label>
                <SourceProductPicker
                  id="transfer-product-search"
                  sourceId={source ? source.id : null}
                  sourceNom={sourceNom}
                  addedIds={addedIds}
                  onPick={addLine}
                  onOpenChange={setPickerOpen}
                />
                <FieldError id="transfer-product-search">{errors.lignes}</FieldError>
              </div>

              {lines.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  {source
                    ? `Cherchez un produit ci-dessus : seuls les produits en stock à ${source.nom} sont proposés`
                    : 'Choisissez l’emplacement de départ, puis ajoutez les produits à transférer'}
                </p>
              ) : (
                <ul className="divide-y rounded-md border" aria-label="Produits du transfert">
                  {lines.map((l) => {
                    const qtyId = `transfer-qty-${l.produit_id}`;
                    const err = errors.quantite?.[l.produit_id] ?? (Number(l.quantite) > l.disponible ? lineError(l, sourceNom) : undefined);
                    return (
                      <li key={l.produit_id} className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap sm:items-center">
                        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                          <p className="truncate text-sm font-medium" title={l.produit_nom}>
                            {l.produit_nom}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <DocumentCode>{l.reference}</DocumentCode> · Disponible :{' '}
                            <span className="tabular-nums">{formatNumber(l.disponible)}</span>
                          </p>
                        </div>
                        <div className="w-28 shrink-0">
                          <Label htmlFor={qtyId} className="sr-only">
                            Quantité à transférer — {l.produit_nom}
                          </Label>
                          <Input
                            id={qtyId}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={l.disponible}
                            step={1}
                            value={l.quantite}
                            onChange={(e) => updateQuantite(l.produit_id, e.target.value)}
                            className="h-11 text-right tabular-nums sm:h-9"
                            {...fieldErrorProps(qtyId, err)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-touch"
                          className="shrink-0 text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                          onClick={() => removeLine(l.produit_id)}
                          aria-label={`Retirer ${l.produit_nom} du transfert`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <FieldError id={qtyId} className="basis-full">
                          {err}
                        </FieldError>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="space-y-1.5">
              <Label htmlFor="transfer-notes">Notes</Label>
              <Input
                id="transfer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex. : réassort de la vitrine"
                className="h-11 sm:h-9"
              />
            </div>
            {source && destination && lines.length > 0 && (
              <p className="text-sm text-muted-foreground">
                À l’exécution, {plural(totalUnits, 'unité quittera', 'unités quitteront')} {source.nom} pour{' '}
                {destination.nom}
              </p>
            )}
          </form>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="touch" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="transfer-form" size="touch" disabled={submitting || !!locationsError} className="gap-2">
            {submitting ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            Créer le transfert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Détail d'un transfert (panneau latéral piloté par ?transfert=ID)
// ---------------------------------------------------------------------------

interface TransferSheetProps {
  transferId: number | null;
  /** Exécuter (`POST /stock-transfers/:id/complete`). */
  canExecute: boolean;
  /** Annuler (`POST /stock-transfers/:id/cancel`) — permission distincte. */
  canCancel: boolean;
  busy: 'execute' | 'cancel' | null;
  reloadKey: number;
  onClose: () => void;
  onExecute: (t: Transfer) => void;
  onCancel: (t: Transfer) => void;
}

function TransferSheet({
  transferId,
  canExecute,
  canCancel,
  busy,
  reloadKey,
  onClose,
  onExecute,
  onCancel,
}: TransferSheetProps) {
  const canOpen = useRouteAccess();
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      setDetail((await stockTransferService.getById(id)) as TransferDetail);
    } catch (err) {
      setDetail(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (transferId) void load(transferId);
    else setDetail(null);
  }, [transferId, reloadKey, load]);

  const pendingTransfer = !!detail && isTransferActionable(detail.statut);
  const showExecute = pendingTransfer && canExecute;
  const showCancel = pendingTransfer && canCancel;

  return (
    <Sheet open={transferId !== null} onOpenChange={(open) => !open && onClose()}>
      {/* `scroll-pb-*` : la barre d'actions collée en bas ne cache jamais le
          lien ou la zone qui reçoit le focus (WCAG 2.4.11). */}
      <SheetContent className="w-full overflow-y-auto scroll-pb-36 sm:max-w-lg sm:scroll-pb-28">
        <SheetHeader className="space-y-2 border-b p-4 pr-12 sm:p-6 sm:pr-14">
          {/* Comme les titres de page : le code reste d'un seul tenant, sans mono gras. */}
          <SheetTitle>
            Transfert {detail?.numero_transfer && <span className="whitespace-nowrap">{detail.numero_transfer}</span>}
          </SheetTitle>
          <SheetDescription>
            {detail ? `De ${detail.source_nom ?? '—'} vers ${detail.destination_nom ?? '—'}` : 'Détail du transfert'}
          </SheetDescription>
          {detail && (
            <div>
              <StatusBadge type="transfert" statut={detail.statut} size="md" />
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-5 p-4 sm:p-6">
          {loading ? (
            <CardSkeleton lines={6} />
          ) : error ? (
            <QueryErrorState
              error={error}
              title="Impossible de charger le détail du transfert"
              onRetry={() => transferId && void load(transferId)}
            />
          ) : detail ? (
            <>
              <KeyValueList columns={2}>
                <KeyValue label="Date">{formatDate(detail.date_transfer)}</KeyValue>
                <KeyValue label="Créé le">{formatDateTime(detail.created_at)}</KeyValue>
                <KeyValue label="Départ">{detail.source_nom ?? '—'}</KeyValue>
                <KeyValue label="Arrivée">{detail.destination_nom ?? '—'}</KeyValue>
                {detail.demande_id && detail.demande_numero && (
                  <KeyValue label="Demande">
                    {canOpen(`/demandes/${detail.demande_id}`) ? (
                      <Link to={`/demandes/${detail.demande_id}`} className="text-primary underline-offset-4 hover:underline">
                        <DocumentCode>{detail.demande_numero}</DocumentCode>
                      </Link>
                    ) : (
                      <DocumentCode>{detail.demande_numero}</DocumentCode>
                    )}
                  </KeyValue>
                )}
                {detail.notes && (
                  <KeyValue label="Notes" className="sm:col-span-2">
                    {detail.notes}
                  </KeyValue>
                )}
              </KeyValueList>

              <section aria-labelledby="transfer-detail-lines" className="space-y-2">
                <h3 id="transfer-detail-lines" className="text-sm font-medium">
                  Produits{' '}
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {formatNumber(detail.lignes.length)}
                  </span>
                </h3>
                <Table aria-label={`Produits du transfert ${detail.numero_transfer}`} containerClassName="rounded-md border">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead numeric>Demandé</TableHead>
                      <TableHead numeric>Transféré</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.lignes.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <span className="block font-medium">{l.produit_nom ?? 'Produit supprimé'}</span>
                          {l.reference && (
                            <DocumentCode className="block text-xs text-muted-foreground">{l.reference}</DocumentCode>
                          )}
                        </TableCell>
                        <TableCell numeric>{formatNumber(l.quantite_demandee)}</TableCell>
                        <TableCell numeric>
                          {l.quantite_transferee == null || detail.statut !== 'livre' ? (
                            <>
                              <span aria-hidden="true">—</span>
                              <span className="sr-only">Pas encore transféré</span>
                            </>
                          ) : (
                            formatNumber(l.quantite_transferee)
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              {isTransferActionable(detail.statut) && !canExecute && (
                <p className="text-sm text-muted-foreground">
                  Ce transfert attend son exécution par le dépôt ou un gérant
                </p>
              )}
            </>
          ) : null}
        </div>

        {detail && (showExecute || showCancel) && (
          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-popover p-4 sm:flex-row sm:justify-end sm:p-6">
            {showCancel && (
              <Button
                variant="outline"
                size="touch"
                className="gap-2"
                disabled={busy !== null}
                onClick={() => onCancel(detail)}
              >
                {busy === 'cancel' && <Spinner />}
                Annuler le transfert
              </Button>
            )}
            {/* Une seule icône, sur l'action principale ; la coche disait « fait » avant l'exécution. */}
            {showExecute && (
              <Button size="touch" className="gap-2" disabled={busy !== null} onClick={() => onExecute(detail)}>
                {busy === 'execute' ? <Spinner /> : <Truck className="h-4 w-4" aria-hidden="true" />}
                Exécuter le transfert
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StockTransfers() {
  const { hasPermission } = usePermission();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState<{ id: number; kind: 'execute' | 'cancel' } | null>(null);
  const [detailReload, setDetailReload] = useState(0);

  // Mêmes rôles que l'API (`authorize(['admin', 'manager', 'depot_staff'])`).
  const canCreate =
    hasPermission(Permissions.TRANSFERT_CREATE_PROACTIVE) || hasPermission(Permissions.TRANSFERT_CREATE);
  const canAct = hasPermission(Permissions.TRANSFERT_EXECUTE);
  const canCancel = hasPermission(Permissions.TRANSFERT_CANCEL);

  const list = useDocumentList<Transfer, TransferStats>({
    defaultSortKey: 'date',
    fetchList: (search, statut, page, limit) => fetchTransfers(search, statut, page, limit),
    fetchStats: fetchTransferCounts,
    loadErrorMessage: 'Impossible de charger les transferts.',
  });

  const detailParam = Number(searchParams.get('transfert'));
  const openTransferId = Number.isInteger(detailParam) && detailParam > 0 ? detailParam : null;
  const createOpen = canCreate && searchParams.get('nouveau') === '1';

  // Une seule écriture d'adresse par action, cumulable avec celles des filtres.
  const updateParams = useSearchParamsPatch();

  const detailPath = (t: Transfer) => {
    const p = new URLSearchParams(searchParams);
    p.delete('nouveau');
    p.set('transfert', String(t.id));
    return `/stock-transfers?${p.toString()}`;
  };

  const refreshAll = () => {
    void list.reload();
    list.reloadStats();
    setDetailReload((n) => n + 1);
  };

  const handleExecute = async (t: Transfer) => {
    const ok = await confirm({
      title: `Exécuter le transfert ${t.numero_transfer} ?`,
      description: `Les quantités quitteront ${t.source_nom ?? 'l’emplacement de départ'} et entreront dans ${
        t.destination_nom ?? 'l’emplacement d’arrivée'
      }.`,
      confirmLabel: 'Exécuter le transfert',
    });
    if (!ok) return;
    setBusy({ id: t.id, kind: 'execute' });
    try {
      await stockTransferService.complete(t.id);
      toast.success(`Transfert ${t.numero_transfer} exécuté`);
      refreshAll();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’exécuter le transfert. Réessayez.'));
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async (t: Transfer) => {
    const ok = await confirm({
      title: `Annuler le transfert ${t.numero_transfer} ?`,
      description:
        'Aucun stock n’a encore bougé : le transfert est abandonné et ne pourra plus être exécuté.',
      confirmLabel: 'Annuler le transfert',
      cancelLabel: 'Garder le transfert',
      destructive: true,
    });
    if (!ok) return;
    setBusy({ id: t.id, kind: 'cancel' });
    try {
      await stockTransferService.cancel(t.id);
      toast.success(`Transfert ${t.numero_transfer} annulé`);
      refreshAll();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’annuler le transfert. Réessayez.'));
    } finally {
      setBusy(null);
    }
  };

  const openCreate = () => updateParams((p) => p.set('nouveau', '1'));

  const executeButton = (t: Transfer) =>
    canAct && isTransferActionable(t.statut) ? (
      <Button
        variant="outline"
        size="touch"
        className="gap-1.5"
        disabled={busy !== null}
        onClick={(e) => {
          e.stopPropagation();
          void handleExecute(t);
        }}
        aria-label={`Exécuter le transfert ${t.numero_transfer}`}
      >
        {busy?.id === t.id && busy.kind === 'execute' && <Spinner />}
        Exécuter
      </Button>
    ) : null;

  const columns: DocumentColumn<Transfer>[] = [
    {
      header: 'N° de transfert',
      primary: true,
      render: (t) => t.numero_transfer,
    },
    {
      header: 'Trajet',
      render: (t) => (
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <span>{t.source_nom ?? '—'}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">vers</span>
          <span>{t.destination_nom ?? '—'}</span>
        </span>
      ),
    },
    {
      header: 'Statut',
      card: 'badge',
      render: (t) => <StatusBadge type="transfert" statut={t.statut} />,
    },
    {
      header: 'Date',
      render: (t) => <span className="whitespace-nowrap">{formatDate(t.date_transfer)}</span>,
    },
    {
      header: <span className="sr-only">Action</span>,
      card: 'actions',
      stopPropagation: true,
      // Toutes les lignes à la hauteur de celles qui portent « Exécuter ».
      cellClassName: 'h-14 text-right',
      render: (t) => executeButton(t),
    },
  ];

  const renderCard = (t: Transfer) => (
    <DataCard
      key={t.id}
      href={detailPath(t)}
      title={<DocumentCode>{t.numero_transfer}</DocumentCode>}
      linkLabel={`Ouvrir le transfert ${t.numero_transfer}`}
      badge={<StatusBadge type="transfert" statut={t.statut} />}
      actions={executeButton(t) ?? undefined}
    >
      <DataCardRow label="De" value={t.source_nom ?? '—'} />
      <DataCardRow label="Vers" value={t.destination_nom ?? '—'} />
      <DataCardRow label="Date" value={formatDate(t.date_transfer)} />
    </DataCard>
  );

  const createButton = canCreate ? (
    <Button size="touch" className="gap-2" onClick={openCreate}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      Nouveau transfert
    </Button>
  ) : null;

  const sheetBusy = busy && openTransferId === busy.id ? busy.kind : null;

  return (
    <>
      <DocumentListPage<Transfer, TransferStats>
        list={list}
        title="Transferts de stock"
        subtitle="Déplacez du stock entre le dépôt et les magasins : il change d’emplacement à l’exécution du transfert"
        createButton={createButton}
        chipCounts={(stats) => stats}
        searchPlaceholder="Numéro ou emplacement… ( / )"
        searchLabel="Rechercher un transfert"
        statusChips={TRANSFER_STATUS_CHIPS}
        shortcuts={{ newRoute: '/stock-transfers?nouveau=1', newDescription: 'Nouveau transfert' }}
        csv={{
          filenamePrefix: 'transferts',
          headers: CSV_HEADERS,
          row: csvRow,
          fetchAll: async (search, statut) => {
            const res = (await stockTransferService.getAll(undefined, statut, 1, 1000)) as Page<Transfer>;
            return (res?.data ?? []).filter((t) => matchesSearch(t, search));
          },
        }}
        columns={columns}
        detailPath={detailPath}
        selectable={false}
        itemNoun={{ one: 'transfert', many: 'transferts' }}
        emptyState={{
          icon: ArrowLeftRight,
          title: 'Aucun transfert de stock',
          description:
            'Les transferts entre dépôt et magasins apparaîtront ici, qu’ils viennent d’une demande ou soient créés directement',
          filteredTitle: list.committedSearch
            ? `Aucun transfert ne correspond à « ${list.committedSearch} »`
            : 'Aucun transfert ne correspond à ces filtres',
          filteredDescription: 'Vérifiez le numéro ou l’emplacement, ou choisissez un autre statut',
          createAction: createButton,
        }}
        renderCard={renderCard}
      />

      <CreateTransferDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) updateParams((p) => p.delete('nouveau'));
        }}
        onCreated={(created) => {
          updateParams((p) => {
            p.delete('nouveau');
            p.set('transfert', String(created.id));
          });
          void list.reload();
          list.reloadStats();
        }}
      />

      <TransferSheet
        transferId={openTransferId}
        canExecute={canAct}
        canCancel={canCancel}
        busy={sheetBusy}
        reloadKey={detailReload}
        onClose={() => updateParams((p) => p.delete('transfert'))}
        onExecute={(t) => void handleExecute(t)}
        onCancel={(t) => void handleCancel(t)}
      />
    </>
  );
}
