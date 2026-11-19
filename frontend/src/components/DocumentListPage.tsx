import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSearchParamsPatch, type SearchParamsPatch } from '@/hooks/useUrlState';
import type { LucideIcon } from 'lucide-react';
import { Search as SearchIcon, Download, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import type { PageHeaderMenuAction } from '@/components/ui/page-header';
import { getErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BulkActionBar } from '@/components/ui/bulk-action-bar';
import { Pagination } from '@/components/ui/pagination';
import { SortableHeader, toggleSort, type SortState } from '@/components/ui/sortable-header';
import { TableSkeleton, ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState } from '@/components/ui/query-state';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { StatsBar, type StatTile } from '@/components/ui/stats-bar';
import { ToggleChip } from '@/components/ui/choice-chips';
import { cn } from '@/lib/utils';
import { normalizeSearch } from '@/utils/format';
import { downloadCsv } from '@/utils/csv';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useSingleKeyShortcuts } from '@/lib/shortcutPreferences';
import { useOptionalAuth } from '@/lib/AuthContext';
import { canAccessPath } from '@/config/routeAccess';

/**
 * Modèle partagé des pages « liste de documents » (Factures, Devis, Bons de
 * livraison, Avoirs) : recherche débouncée, filtres statut, tri serveur
 * persisté dans l'URL, sélection multiple, export CSV, pagination, cartes sur
 * mobile.
 *
 * Deux briques :
 *  - `useDocumentList`  — tout l'état/fetch (la page garde la main sur ses
 *    actions métier via `list.reload`) ;
 *  - `DocumentListPage` — tout le rendu, piloté par une config typée, dans un
 *    `PageShell` (gouttière, titre unique, titre d'onglet). Les points qui
 *    varient trop d'une page à l'autre (bouton créer, actions groupées, action
 *    de l'état vide, rendu des cellules/cartes) sont des slots ReactNode /
 *    render props plutôt que de la config déclarative.
 */

/** Enveloppe de réponse liste standard `{ success, data, pagination }`. */
export interface ListResult<T> {
  data?: T[];
  pagination?: { total?: number; totalPages?: number };
}

export interface UseDocumentListOptions<T, S> {
  /** Clé de tri par défaut (ex. `date_facture`) — desc, retirée de l'URL. */
  defaultSortKey: string;
  /**
   * Filtres additionnels propres à la page (ex. `{ type: 'tous' }` pour les
   * avoirs) : clé = paramètre d'URL, valeur = défaut (retiré de l'URL).
   */
  extraFilters?: Record<string, string>;
  /** Doit correspondre à la signature `service.getAll(...)`. */
  fetchList: (
    search: string,
    statut: string | undefined,
    page: number,
    limit: number,
    sortKey: string,
    sortDir: 'asc' | 'desc',
    extra: Record<string, string>
  ) => Promise<T[] | ListResult<T> | null | undefined>;
  fetchStats?: () => Promise<S>;
  /** Message de repli quand le serveur ne dit rien d'utile (« Impossible de charger les factures. »). */
  loadErrorMessage: string;
}

/** Taille de page par défaut (retirée de l'adresse). */
const DEFAULT_LIMIT = 20;
/** Pause de frappe avant que la recherche parte au serveur. */
const SEARCH_DEBOUNCE_MS = 300;

/** Entier ≥ 1 lu dans l'adresse (`?page=abc`, `?page=0` → valeur par défaut). */
function positiveInt(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 1 ? n : fallback;
}

export function useDocumentList<T extends { id: number }, S = unknown>(
  opts: UseDocumentListOptions<T, S>
) {
  const [rows, setRows] = useState<T[]>([]);
  const [stats, setStats] = useState<S | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /** Message affichable de la dernière erreur de chargement (`null` sans erreur). */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Une réponse lente ne remplace jamais celle d'une requête plus récente.
  const requestSeq = useRef(0);

  // Filtres, tri (serveur, sur tout le jeu) et pagination vivent dans
  // l'adresse : retour arrière, rafraîchissement et lien partagé gardent la
  // vue. Une action de l'utilisateur = UNE écriture (`patchParams`) : deux
  // setters successifs s'écrasaient (React Router leur passe les paramètres du
  // dernier rendu) et les puces de statut, la recherche et « Effacer les
  // filtres » ne faisaient rien.
  const [params] = useSearchParams();
  const patchParams = useSearchParamsPatch();

  const sort: SortState = {
    key: params.get('sort') ?? opts.defaultSortKey,
    dir: params.get('order') === 'asc' ? 'asc' : 'desc',
  };
  const statusFilter = params.get('statut') ?? 'all';
  const committedSearch = params.get('q') ?? '';
  const page = positiveInt(params.get('page'), 1);
  const limit = positiveInt(params.get('limit'), DEFAULT_LIMIT);

  // Filtres additionnels de la page, également portés par l'URL.
  const extraDefaults = opts.extraFilters ?? {};
  const extraKeys = Object.keys(extraDefaults);
  const extra: Record<string, string> = {};
  for (const key of extraKeys) {
    extra[key] = params.get(key) ?? extraDefaults[key];
  }
  const extraSignature = extraKeys.map((k) => `${k}=${extra[k]}`).join('&');

  /** Change de statut et revient à la première page. */
  const setStatusFilter = (value: string) => patchParams({ statut: value === 'all' ? null : value, page: null });
  const setPage = (next: number) => patchParams({ page: next > 1 ? next : null });
  /** Change la taille de page et revient à la première page. */
  const setLimit = (next: number) => patchParams({ limit: next === DEFAULT_LIMIT ? null : next, page: null });
  /** Change un filtre propre à la page et revient à la première page. */
  const setExtra = (key: string, value: string) =>
    patchParams({ [key]: value === extraDefaults[key] ? null : value, page: null });

  /** Trie tout le jeu côté serveur, depuis la première page. */
  const handleSort = (key: string) => {
    const next = toggleSort(sort, key);
    const isDefault = next.key === opts.defaultSortKey && next.dir === 'desc';
    patchParams({ sort: isDefault ? null : next.key, order: isDefault ? null : next.dir, page: null });
  };

  // Texte du champ de recherche : validé dans l'adresse après une pause de frappe.
  const [search, setSearch] = useState(committedSearch);
  // Dernière recherche écrite par ce champ : distingue notre propre écriture
  // d'un changement venu d'ailleurs (retour arrière, lien), à refléter dans le champ.
  const ownSearch = useRef(committedSearch);

  useEffect(() => {
    if (committedSearch === ownSearch.current) return;
    ownSearch.current = committedSearch;
    setSearch(committedSearch);
  }, [committedSearch]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search === ownSearch.current) return;
      ownSearch.current = search;
      patchParams({ q: search, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, patchParams]);

  const hasFilters =
    committedSearch !== '' ||
    statusFilter !== 'all' ||
    extraKeys.some((k) => extra[k] !== extraDefaults[k]);

  const reload = async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setSelected(new Set());
    try {
      const statut = statusFilter === 'all' ? undefined : statusFilter;
      const response = await opts.fetchList(
        normalizeSearch(committedSearch),
        statut,
        page,
        limit,
        sort.key,
        sort.dir,
        extra
      );
      if (seq !== requestSeq.current) return;
      const data = Array.isArray(response) ? response : response?.data ?? [];
      setRows(Array.isArray(data) ? data : []);
      const pagination = Array.isArray(response) ? undefined : response?.pagination;
      setTotal(pagination?.total ?? (Array.isArray(data) ? data.length : 0));
      setTotalPages(pagination?.totalPages ?? (Array.isArray(data) && data.length > 0 ? 1 : 0));
      setError(false);
      setLoadError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // A fetch failure must NOT read as "no data" — the list shows an error
      // state with the reason and « Réessayer » (no extra toast: the inline
      // message is announced and stays on screen).
      setError(true);
      setLoadError(getErrorMessage(err, opts.loadErrorMessage));
      setRows([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSearch, statusFilter, page, limit, sort.key, sort.dir, extraSignature]);

  // Les tuiles KPI ont leur propre état d'échec : sans lui elles resteraient
  // bloquées sur « — », indiscernable d'un total réellement nul.
  const loadStats = () => {
    if (!opts.fetchStats) return;
    setStatsError(false);
    opts
      .fetchStats()
      .then((s) => setStats(s))
      .catch(() => setStatsError(true));
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Recherche, statut, filtres de la page et pagination remis à zéro en une écriture. */
  const clearFilters = () => {
    setSearch('');
    ownSearch.current = '';
    const reset: SearchParamsPatch = { q: null, statut: null, page: null };
    for (const key of extraKeys) reset[key] = null;
    patchParams(reset);
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectedRows = rows.filter((r) => selected.has(r.id));

  return {
    rows,
    stats,
    statsError,
    reloadStats: loadStats,
    extra,
    setExtra,
    total,
    totalPages,
    loading,
    error,
    loadError,
    selected,
    selectedRows,
    allSelected,
    someSelected,
    sort,
    handleSort,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    committedSearch,
    page,
    setPage,
    limit,
    setLimit,
    hasFilters,
    clearFilters,
    reload,
    clearSelection,
    toggleAll,
    toggleOne,
  };
}

export type DocumentList<T extends { id: number }, S = unknown> = ReturnType<
  typeof useDocumentList<T, S>
>;

export interface DocumentColumn<T> {
  /** Libellé d'en-tête (ReactNode pour les cas riches, ex. tooltip). */
  header: React.ReactNode;
  /** Clé de tri backend — la colonne devient triable quand elle est fournie. */
  sortKey?: string;
  /** Alignement de l'icône de tri (colonnes numériques). */
  align?: 'left' | 'right';
  /**
   * Montant / quantité : aligné à droite, chiffres tabulaires, jamais coupé.
   * Par défaut : vrai pour une colonne `align: 'right'`.
   */
  numeric?: boolean;
  /**
   * Colonne d'identification (numéro du document) : rendue comme un vrai lien
   * vers le détail, en en-tête de ligne. Par défaut : la première colonne.
   */
  primary?: boolean;
  /**
   * Place de la colonne dans la carte mobile générée quand la page ne fournit
   * pas `renderCard` : `title` (défaut de la colonne principale), `badge`
   * (statut), `row` (défaut), `actions` (défaut des colonnes d'actions),
   * `hidden`.
   */
  card?: 'title' | 'badge' | 'row' | 'actions' | 'hidden';
  headClassName?: string;
  cellClassName?: string;
  /** Empêche le clic-ligne (colonnes d'actions). */
  stopPropagation?: boolean;
  render: (row: T) => React.ReactNode;
}

export interface CsvExportConfig<T> {
  /** `<prefix>_<yyyy-mm-dd>.csv` */
  filenamePrefix: string;
  headers: string[];
  row: (r: T) => unknown[];
  /** Export « tout » côté serveur avec les filtres courants. */
  fetchAll: (search: string, statut: string | undefined) => Promise<T[]>;
}

export interface DocumentListPageProps<T extends { id: number }, S = unknown> {
  list: DocumentList<T, S>;
  /**
   * @deprecated Ignoré : la gouttière et la largeur viennent de `PageShell`.
   * Les pages historiques passaient des conteneurs différents (0, 12 ou 24 px
   * de marge) ; à retirer des appels.
   */
  layoutClassName?: string;
  title: string;
  /** Sous-titre : ce que la liste apporte (ne pas répéter le titre). */
  subtitle?: string;
  /** Slot : action principale « Nouveau … » (Link ou Button, au choix de la page). */
  createButton: React.ReactNode;
  /** Actions rares de l'en-tête, rangées dans « Plus d’actions ». */
  moreActions?: ReadonlyArray<PageHeaderMenuAction | false | null | undefined>;
  /**
   * Indicateurs au-dessus de la liste — montants et chiffres calculés
   * seulement. Un simple décompte par statut va dans sa puce (`chipCounts`) :
   * une tuile qui répète une puce de filtre n'apporte rien. Sans tuile, pas de
   * rangée.
   */
  statTiles?: (stats: S | null) => StatTile[];
  /** Décompte affiché dans chaque puce de statut (clé = `value` de la puce). */
  chipCounts?: (stats: S) => Partial<Record<string, number | null | undefined>>;
  searchPlaceholder: string;
  /** Nom accessible du champ de recherche ; par défaut le texte indicatif sans « ( / ) ». */
  searchLabel?: string;
  statusChips: ReadonlyArray<{ value: string; label: string }>;
  /** Slot : filtres additionnels rendus à droite de la recherche (Select…). */
  extraFilters?: React.ReactNode;
  /** Raccourcis page : « / » focus recherche (intégré) + « n » création. */
  shortcuts: { newRoute: string; newDescription: string };
  csv: CsvExportConfig<T>;
  /**
   * Cases à cocher et barre d'actions groupées (défaut `true`). `false` pour
   * une liste sans action groupée réelle : une colonne de cases qui ne sert
   * qu'à « Exporter la sélection » double « Exporter en CSV » de l'en-tête.
   */
  selectable?: boolean;
  /** Slot : contenu de la barre d'actions groupées (liste sélectionnable). */
  bulkActions?: React.ReactNode;
  columns: ReadonlyArray<DocumentColumn<T>>;
  /** Classes additionnelles de ligne (ex. liseré facture impayée). */
  rowClassName?: (row: T) => string;
  detailPath: (row: T) => string;
  /** aria-label de la case à cocher de ligne (liste sélectionnable). */
  rowAriaLabel?: (row: T) => string;
  /** Nom des éléments pour l'annonce du décompte (« 12 factures »). */
  itemNoun?: { one: string; many: string };
  emptyState: {
    icon: LucideIcon;
    /** Liste vide sans filtre : ce qui manque (« Aucune facture pour le moment »). */
    title: string;
    /** À quoi sert la liste et comment la remplir. */
    description?: string;
    /** Liste vide avec filtres (« Aucune facture ne correspond à ces filtres »). */
    filteredTitle: string;
    /** Comment élargir la recherche. */
    filteredDescription?: string;
    /** Slot : action de création affichée quand la liste est vide sans filtre. */
    createAction: React.ReactNode;
  };
  /**
   * Rendu carte mobile (sous 768 px). Sans lui, une carte est générée à partir
   * des colonnes : titre = colonne principale, lignes = autres colonnes,
   * actions = colonnes d'actions. Aucune liste n'affiche plus un tableau de
   * 6 colonnes à défiler sur téléphone.
   */
  renderCard?: (row: T) => React.ReactNode;
  /** @deprecated Ignoré : le décompte est porté par la pagination. */
  listTitle?: string;
  /** @deprecated Ignoré : le décompte est porté par la pagination. */
  totalFooterLabel?: string;
}

/** Une colonne d'actions (boutons de ligne) : rendue en pied de carte. */
function isActionColumn<T>(col: DocumentColumn<T>): boolean {
  if (col.card) return col.card === 'actions';
  return !!col.stopPropagation && (col.header === '' || col.header === 'Actions');
}

const INTERACTIVE_IN_ROW =
  'a, button, input, select, textarea, label, [role="checkbox"], [role="button"], [role="menuitem"], [role="combobox"]';

/** Espace fine / étroite d'Intl → espace insécable U+00A0 (code ASCII : pas de caractère invisible dans la source). */
const NBSP_CHAR = String.fromCharCode(0xa0);
const SPACE_VARIANTS = new RegExp(`[${String.fromCharCode(0x202f, 0x2009)}]`, 'g');
const formatCount = (n: number) =>
  new Intl.NumberFormat('fr-FR').format(n).replace(SPACE_VARIANTS, NBSP_CHAR);

export function DocumentListPage<T extends { id: number }, S = unknown>(
  props: DocumentListPageProps<T, S>
) {
  const { list, columns } = props;
  const selectable = props.selectable ?? true;
  const navigate = useNavigate();
  const role = useOptionalAuth()?.user?.role;
  const [singleKeyShortcuts] = useSingleKeyShortcuts();
  const searchRef = useRef<HTMLInputElement>(null);
  const colSpan = columns.length + (selectable ? 1 : 0);
  const primaryIndex = Math.max(0, columns.findIndex((c) => c.primary));
  const searchLabel =
    props.searchLabel ?? props.searchPlaceholder.replace(/\s*\(\s*\/\s*\)\s*$/, '').replace(/…$/, '').trim();
  const placeholder = props.searchPlaceholder.replace(/\s*\(\s*\/\s*\)\s*$/, '');
  // Hors fournisseur d'authentification (tests de page) : pas de filtrage.
  const canCreate = role === undefined || canAccessPath(props.shortcuts.newRoute, role);

  // Page-local shortcuts: "/" focuses search, "n" opens the create route.
  useKeyboardShortcuts([
    { key: '/', action: () => searchRef.current?.focus(), description: 'Rechercher dans la liste' },
    ...(canCreate
      ? [
          {
            key: 'n',
            action: () => navigate(props.shortcuts.newRoute),
            description: props.shortcuts.newDescription,
          },
        ]
      : []),
  ]);

  const exportToCSV = async () => {
    try {
      const all = await props.csv.fetchAll(
        normalizeSearch(list.committedSearch),
        list.statusFilter === 'all' ? undefined : list.statusFilter
      );
      const rows = (all || []).map((r) => props.csv.row(r));
      downloadCsv(
        `${props.csv.filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`,
        props.csv.headers,
        rows
      );
      toast.success('Fichier CSV téléchargé');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’exporter en CSV. Réessayez.'));
    }
  };

  const openRow = (row: T, event: React.MouseEvent) => {
    // Un clic sur un lien, un bouton ou la case à cocher garde son propre effet.
    if ((event.target as Element).closest(INTERACTIVE_IN_ROW)) return;
    const url = props.detailPath(row);
    if (event.ctrlKey || event.metaKey) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    navigate(url);
  };

  const emptyNode = list.hasFilters ? (
    <EmptyState
      icon={props.emptyState.icon}
      title={props.emptyState.filteredTitle}
      description={
        props.emptyState.filteredDescription ?? 'Vérifiez la recherche ou choisissez un autre statut.'
      }
      action={
        <Button variant="outline" onClick={list.clearFilters} className="gap-2">
          <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={props.emptyState.icon}
      title={props.emptyState.title}
      description={props.emptyState.description}
      action={props.emptyState.createAction}
    />
  );

  const errorNode = (
    <QueryErrorState
      error={list.loadError ?? undefined}
      title="Impossible de charger la liste"
      onRetry={() => list.reload()}
    />
  );

  const renderPrimaryCell = (row: T, col: DocumentColumn<T>, i: number) => (
    <th
      key={i}
      scope="row"
      // Numéro de pièce en mono : la signature de l'interface (DocumentCode).
      className={cn('whitespace-nowrap px-3 py-2.5 text-left align-middle font-mono text-sm font-normal', col.cellClassName)}
    >
      <Link
        to={props.detailPath(row)}
        className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {col.render(row)}
      </Link>
    </th>
  );

  const tableNode = (
    <Table aria-label={props.title}>
      <TableHeader>
        <TableRow>
          {selectable && (
            <TableHead className="w-10">
              <Checkbox
                checked={list.allSelected}
                indeterminate={list.someSelected && !list.allSelected}
                onChange={list.toggleAll}
                aria-label="Sélectionner toutes les lignes de la page"
              />
            </TableHead>
          )}
          {columns.map((col, i) => {
            const numeric = col.numeric ?? col.align === 'right';
            return col.sortKey ? (
              <SortableHeader
                key={i}
                columnKey={col.sortKey}
                sort={list.sort}
                onSort={list.handleSort}
                align={col.align}
                numeric={numeric}
                className={col.headClassName}
              >
                {col.header}
              </SortableHeader>
            ) : (
              <TableHead key={i} numeric={numeric} className={col.headClassName}>
                {col.header}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.loading ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="p-0">
              <TableSkeleton rows={10} columns={colSpan} />
            </TableCell>
          </TableRow>
        ) : list.error ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={colSpan} className="p-0">
              {errorNode}
            </TableCell>
          </TableRow>
        ) : list.rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={colSpan} className="p-0">
              {emptyNode}
            </TableCell>
          </TableRow>
        ) : (
          list.rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(
                'cursor-pointer',
                selectable && list.selected.has(row.id) && 'bg-muted/40',
                props.rowClassName?.(row)
              )}
              onClick={(e) => openRow(row, e)}
            >
              {selectable && (
                <TableCell>
                  <Checkbox
                    checked={list.selected.has(row.id)}
                    onChange={() => list.toggleOne(row.id)}
                    aria-label={props.rowAriaLabel?.(row) ?? 'Sélectionner la ligne'}
                  />
                </TableCell>
              )}
              {columns.map((col, i) =>
                i === primaryIndex ? (
                  renderPrimaryCell(row, col, i)
                ) : (
                  <TableCell
                    key={i}
                    numeric={col.numeric ?? col.align === 'right'}
                    className={col.cellClassName}
                    onClick={col.stopPropagation ? (e) => e.stopPropagation() : undefined}
                  >
                    {col.render(row)}
                  </TableCell>
                )
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  // Carte mobile générée à partir des colonnes quand la page n'en fournit pas.
  const autoCard = (row: T) => {
    const titleCol = columns[primaryIndex];
    const badgeCols = columns.filter((c, i) => i !== primaryIndex && c.card === 'badge');
    const actionCols = columns.filter((c, i) => i !== primaryIndex && isActionColumn(c));
    const rowCols = columns.filter(
      (c, i) => i !== primaryIndex && !isActionColumn(c) && c.card !== 'badge' && c.card !== 'hidden'
    );
    return (
      <DataCard
        key={row.id}
        href={props.detailPath(row)}
        title={<span className={cn('whitespace-nowrap font-mono font-normal', titleCol.cellClassName)}>{titleCol.render(row)}</span>}
        badge={badgeCols.length > 0 ? <>{badgeCols.map((c, i) => <span key={i}>{c.render(row)}</span>)}</> : undefined}
        actions={
          actionCols.length > 0 ? (
            <>
              {actionCols.map((c, i) => (
                <span key={i} className="contents">
                  {c.render(row)}
                </span>
              ))}
            </>
          ) : undefined
        }
      >
        {rowCols.map((c, i) => (
          <DataCardRow
            key={i}
            label={c.header}
            value={c.render(row)}
            numeric={c.numeric ?? c.align === 'right'}
          />
        ))}
      </DataCard>
    );
  };

  const renderCard = props.renderCard ?? autoCard;
  const bodyNode = (
    <ResponsiveTable
      cards={
        list.loading ? (
          <ListSkeleton items={6} />
        ) : list.error ? (
          <Card>{errorNode}</Card>
        ) : list.rows.length === 0 ? (
          <Card>{emptyNode}</Card>
        ) : (
          list.rows.map((row) => renderCard(row))
        )
      }
      table={tableNode}
    />
  );

  // Annonce stable du résultat de chaque chargement (le filtre qui vide la
  // liste était silencieux) ; la pagination n'annonce plus en double.
  const noun = props.itemNoun ?? { one: 'résultat', many: 'résultats' };
  const status = list.loading
    ? ''
    : list.error
      ? ''
      : list.total === 0
        ? list.hasFilters
          ? props.emptyState.filteredTitle
          : props.emptyState.title
        : `${formatCount(list.total)} ${list.total > 1 ? noun.many : noun.one}`;

  const tiles = props.statTiles?.(list.stats) ?? [];
  const counts = props.chipCounts && list.stats ? props.chipCounts(list.stats) : undefined;

  return (
    <PageShell
      title={props.title}
      description={props.subtitle}
      width="full"
      moreActions={props.moreActions}
      actions={
        <Button variant="outline" size="touch" onClick={exportToCSV} className="gap-2">
          <Download className="h-4 w-4" aria-hidden="true" /> Exporter en CSV
        </Button>
      }
      primaryAction={props.createButton}
    >
      <p role="status" className="sr-only">
        {status}
      </p>

      {tiles.length === 0 ? null : list.statsError ? (
        <Card>
          <CardContent inset="standalone" className="flex flex-wrap items-center justify-between gap-3 py-3 sm:py-3">
            <p className="text-sm text-muted-foreground">Impossible de charger les totaux</p>
            <Button variant="outline" onClick={list.reloadStats} className="gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <StatsBar tiles={tiles} loading={!list.stats} />
      )}

      {selectable && (
        <BulkActionBar count={list.selected.size} onClear={list.clearSelection}>
          {props.bulkActions}
        </BulkActionBar>
      )}

      {/* Une seule carte : la recherche et les filtres en sont l'en-tête, la liste
          le corps (trois boîtes empilées avant). Sous 768 px la carte s'efface :
          les filtres restent nus et les cartes de ligne portent la surface. */}
      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <div className="space-y-3 border-b p-4 max-md:border-0 max-md:p-0 max-md:pb-3 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchRef}
                type="search"
                enterKeyHint="search"
                aria-label={searchLabel}
                placeholder={placeholder}
                value={list.search}
                onChange={(e) => list.setSearch(e.target.value)}
                className={cn('pl-10', singleKeyShortcuts && !list.search && 'sm:pr-10')}
              />
              {singleKeyShortcuts && !list.search && (
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-sans text-2xs font-medium text-muted-foreground sm:inline-flex"
                >
                  /
                </kbd>
              )}
            </div>
            {props.extraFilters && (
              <div className="flex flex-wrap items-center gap-2">{props.extraFilters}</div>
            )}
            {list.hasFilters && (
              <Button
                variant="ghost"
                onClick={list.clearFilters}
                className="gap-1.5 self-start text-muted-foreground sm:self-auto"
              >
                <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
              </Button>
            )}
          </div>
          {/* Filtres rapides par statut */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
            {props.statusChips.map((c) => (
              <ToggleChip
                key={c.value}
                pressed={list.statusFilter === c.value}
                onPressedChange={() => list.setStatusFilter(c.value)}
              >
                {c.label}
                {counts?.[c.value] != null && (
                  <span className="tabular-nums text-muted-foreground">{formatCount(counts[c.value] as number)}</span>
                )}
              </ToggleChip>
            ))}
          </div>
        </div>
        <CardContent inset="flush">{bodyNode}</CardContent>
      </Card>

      {!list.loading && !list.error && list.total > 0 && (
        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          limit={list.limit}
          announce={false}
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
        />
      )}
    </PageShell>
  );
}
