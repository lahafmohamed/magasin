import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Search as SearchIcon, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { StatsBar, type StatTile } from '@/components/ui/stats-bar';
import { normalizeSearch } from '@/utils/format';
import { downloadCsv } from '@/utils/csv';
import { useUrlState, useUrlNumber } from '@/hooks/useUrlState';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

/**
 * Modèle partagé des pages « liste de documents » (Factures, Devis, Bons de
 * livraison) : recherche débouncée, filtres statut, tri serveur persisté dans
 * l'URL, sélection multiple, export CSV, pagination.
 *
 * Deux briques :
 *  - `useDocumentList`  — tout l'état/fetch (la page garde la main sur ses
 *    actions métier via `list.reload`) ;
 *  - `DocumentListPage` — tout le rendu, piloté par une config typée. Les
 *    points qui varient trop d'une page à l'autre (bouton créer, actions
 *    groupées, action de l'état vide, rendu des cellules/cartes) sont des
 *    slots ReactNode / render props plutôt que de la config déclarative.
 */

/** Enveloppe de réponse liste standard `{ success, data, pagination }`. */
export interface ListResult<T> {
  data?: T[];
  pagination?: { total?: number; totalPages?: number };
}

export interface UseDocumentListOptions<T, S> {
  /** Clé de tri par défaut (ex. `date_facture`) — desc, retirée de l'URL. */
  defaultSortKey: string;
  /** Doit correspondre à la signature `service.getAll(...)`. */
  fetchList: (
    search: string,
    statut: string | undefined,
    page: number,
    limit: number,
    sortKey: string,
    sortDir: 'asc' | 'desc'
  ) => Promise<T[] | ListResult<T> | null | undefined>;
  fetchStats?: () => Promise<S>;
  loadErrorMessage: string;
}

export function useDocumentList<T extends { id: number }, S = unknown>(
  opts: UseDocumentListOptions<T, S>
) {
  const [rows, setRows] = useState<T[]>([]);
  const [stats, setStats] = useState<S | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Sort is applied server-side (whole dataset, not just the current page) and
  // lives in the URL like the filters. Keys match the backend sort allow-list.
  const [sortParams, setSortParams] = useSearchParams();
  const sort: SortState = {
    key: sortParams.get('sort') ?? opts.defaultSortKey,
    dir: sortParams.get('order') === 'asc' ? 'asc' : 'desc',
  };

  // Filters & pagination live in the URL so back-navigation / refresh keep the view.
  const [statusFilter, setStatusFilter] = useUrlState('statut', 'all');
  const [committedSearch, setCommittedSearch] = useUrlState('q', '');
  const [page, setPage] = useUrlNumber('page', 1);
  const [limit, setLimit] = useUrlNumber('limit', 20);

  // Local text mirrors the committed search; debounced before it hits the URL/fetch.
  const [search, setSearch] = useState(committedSearch);

  // Single setSearchParams call (sort + order together) to avoid clobbering.
  const handleSort = (key: string) => {
    const next = toggleSort(sort, key);
    setSortParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.key === opts.defaultSortKey && next.dir === 'desc') {
          p.delete('sort');
          p.delete('order');
        } else {
          p.set('sort', next.key);
          p.set('order', next.dir);
        }
        return p;
      },
      { replace: true }
    );
  };

  const hasFilters = committedSearch !== '' || statusFilter !== 'all';

  // Debounce the search box → committed search, resetting to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== committedSearch) {
        setCommittedSearch(search);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const reload = async () => {
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
        sort.dir
      );
      const data = Array.isArray(response) ? response : response?.data ?? [];
      setRows(Array.isArray(data) ? data : []);
      const pagination = Array.isArray(response) ? undefined : response?.pagination;
      setTotal(pagination?.total ?? 0);
      setTotalPages(pagination?.totalPages ?? 0);
      setError(false);
    } catch {
      // A fetch failure must NOT read as "no data" — surface an error + retry.
      setError(true);
      setRows([]);
      toast.error(opts.loadErrorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSearch, statusFilter, page, limit, sort.key, sort.dir]);

  useEffect(() => {
    opts.fetchStats?.().then(setStats).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFilters = () => {
    setSearch('');
    setCommittedSearch('');
    setStatusFilter('all');
    setPage(1);
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
    total,
    totalPages,
    loading,
    error,
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
  /** Classes du conteneur racine (les pages historiques diffèrent). */
  layoutClassName: string;
  title: string;
  titleIcon: LucideIcon;
  subtitle?: string;
  /** Slot : bouton « Nouveau … » (Link ou Button, au choix de la page). */
  createButton: React.ReactNode;
  statTiles: (stats: S | null) => StatTile[];
  searchPlaceholder: string;
  statusChips: ReadonlyArray<{ value: string; label: string }>;
  /** Raccourcis page : « / » focus recherche (intégré) + « n » création. */
  shortcuts: { newRoute: string; newDescription: string };
  csv: CsvExportConfig<T>;
  /** Slot : contenu de la barre d'actions groupées. */
  bulkActions: React.ReactNode;
  columns: ReadonlyArray<DocumentColumn<T>>;
  /** Classes additionnelles de ligne (ex. liseré facture impayée). */
  rowClassName?: (row: T) => string;
  detailPath: (row: T) => string;
  /** aria-label de la case à cocher de ligne. */
  rowAriaLabel: (row: T) => string;
  emptyState: {
    icon: LucideIcon;
    title: string;
    filteredTitle: string;
    /** Slot : action de création affichée quand la liste est vide sans filtre. */
    createAction: React.ReactNode;
  };
  /** Rendu carte mobile — active l'habillage ResponsiveTable (Factures). */
  renderCard?: (row: T) => React.ReactNode;
  /** Titre de carte au-dessus du tableau, avec badge compteur (Factures). */
  listTitle?: string;
  /** Pied « N xxx au total » sous la pagination (Devis / BL). */
  totalFooterLabel?: string;
}

export function DocumentListPage<T extends { id: number }, S = unknown>(
  props: DocumentListPageProps<T, S>
) {
  const { list, columns } = props;
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const TitleIcon = props.titleIcon;
  const colSpan = columns.length + 1;

  // Page-local shortcuts: "/" focuses search, "n" opens the create route.
  useKeyboardShortcuts([
    { key: '/', action: () => searchRef.current?.focus(), description: 'Rechercher' },
    {
      key: 'n',
      action: () => navigate(props.shortcuts.newRoute),
      description: props.shortcuts.newDescription,
    },
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
      toast.success('Export CSV réussi');
    } catch {
      toast.error('Erreur lors de l\'export CSV');
    }
  };

  const emptyNode = (
    <EmptyState
      icon={props.emptyState.icon}
      title={list.hasFilters ? props.emptyState.filteredTitle : props.emptyState.title}
      action={
        list.hasFilters ? (
          <Button variant="outline" size="sm" onClick={list.clearFilters}>
            Effacer les filtres
          </Button>
        ) : (
          props.emptyState.createAction
        )
      }
    />
  );

  const errorNode = (
    <EmptyState
      icon={props.emptyState.icon}
      title="Erreur lors du chargement"
      action={
        <Button variant="outline" size="sm" onClick={() => list.reload()}>
          Réessayer
        </Button>
      }
    />
  );

  const tableNode = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={list.allSelected}
              indeterminate={list.someSelected && !list.allSelected}
              onChange={list.toggleAll}
              aria-label="Tout sélectionner"
            />
          </TableHead>
          {columns.map((col, i) =>
            col.sortKey ? (
              <SortableHeader
                key={i}
                columnKey={col.sortKey}
                sort={list.sort}
                onSort={list.handleSort}
                align={col.align}
                className={col.headClassName}
              >
                {col.header}
              </SortableHeader>
            ) : (
              <TableHead key={i} className={col.headClassName}>
                {col.header}
              </TableHead>
            )
          )}
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
          <TableRow>
            <TableCell colSpan={colSpan} className="p-0">
              {errorNode}
            </TableCell>
          </TableRow>
        ) : list.rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="p-0">
              {emptyNode}
            </TableCell>
          </TableRow>
        ) : (
          list.rows.map((row) => (
            <TableRow
              key={row.id}
              className={`cursor-pointer hover:bg-muted/50 ${list.selected.has(row.id) ? 'bg-muted/40' : ''} ${props.rowClassName ? props.rowClassName(row) : ''}`}
              onClick={() => navigate(props.detailPath(row))}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={list.selected.has(row.id)}
                  onChange={() => list.toggleOne(row.id)}
                  aria-label={props.rowAriaLabel(row)}
                />
              </TableCell>
              {columns.map((col, i) => (
                <TableCell
                  key={i}
                  className={col.cellClassName}
                  onClick={col.stopPropagation ? (e) => e.stopPropagation() : undefined}
                >
                  {col.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const renderCard = props.renderCard;
  const bodyNode = renderCard ? (
    <ResponsiveTable
      className="px-3 pb-3 md:p-0"
      cards={
        list.loading ? (
          <ListSkeleton items={6} />
        ) : list.error ? (
          errorNode
        ) : list.rows.length === 0 ? (
          emptyNode
        ) : (
          list.rows.map((row) => renderCard(row))
        )
      }
      table={tableNode}
    />
  ) : (
    tableNode
  );

  return (
    <div className={props.layoutClassName}>
      <div className="flex justify-between items-center">
        {props.subtitle ? (
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <TitleIcon className="h-8 w-8" /> {props.title}
            </h1>
            <p className="text-muted-foreground mt-1">{props.subtitle}</p>
          </div>
        ) : (
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TitleIcon className="h-8 w-8" /> {props.title}
          </h1>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exporter en CSV
          </Button>
          {props.createButton}
        </div>
      </div>

      <StatsBar tiles={props.statTiles(list.stats)} loading={!list.stats} />

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder={props.searchPlaceholder}
                value={list.search}
                onChange={(e) => list.setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {list.hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={list.clearFilters}
                className="gap-1 text-muted-foreground"
              >
                <X className="h-4 w-4" /> Effacer
              </Button>
            )}
          </div>
          {/* Quick status filter chips */}
          <div className="flex flex-wrap gap-2">
            {props.statusChips.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  list.setStatusFilter(c.value);
                  list.setPage(1);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  list.statusFilter === c.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-muted'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <BulkActionBar count={list.selected.size} onClear={list.clearSelection}>
        {props.bulkActions}
      </BulkActionBar>

      {/* Tableau */}
      <Card>
        {props.listTitle && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {props.listTitle}
              {list.total > 0 && <Badge variant="secondary">{list.total}</Badge>}
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="p-0">{bodyNode}</CardContent>
      </Card>

      {/* Pagination */}
      {!list.loading && list.total > 0 && (
        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          limit={list.limit}
          onPageChange={list.setPage}
          onLimitChange={(newLimit) => {
            list.setLimit(newLimit);
            list.setPage(1);
          }}
        />
      )}

      {props.totalFooterLabel && !list.loading && list.total > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          <Badge variant="secondary">{list.total}</Badge> {props.totalFooterLabel}
        </p>
      )}
    </div>
  );
}
