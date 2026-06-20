import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { factureService } from '../services/api';
import { Facture, StatsDashboard } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkActionBar } from '@/components/ui/bulk-action-bar';
import StatusBadge from '@/components/StatusBadge';
import { formatXOF, normalizeSearch } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { SortableHeader, toggleSort, type SortState } from '@/components/ui/sortable-header';
import { LoadingState } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { StatsBar, type StatTile } from '@/components/ui/stats-bar';
import { Plus, Search as SearchIcon, FileText, Info, Download, X, ExternalLink, Receipt, CalendarDays, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '../utils/csv';
import { useUrlState, useUrlNumber } from '../hooks/useUrlState';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

const STATUS_CHIPS = [
  { value: 'all', label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'partielle', label: 'Partielle' },
  { value: 'payee', label: 'Payée' },
  { value: 'annulee', label: 'Annulée' },
];

export default function Factures() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [stats, setStats] = useState<StatsDashboard | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortState | null>({ key: 'date', dir: 'desc' });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Filters & pagination live in the URL so back-navigation / refresh keep the view.
  const [statusFilter, setStatusFilter] = useUrlState('statut', 'all');
  const [committedSearch, setCommittedSearch] = useUrlState('q', '');
  const [page, setPage] = useUrlNumber('page', 1);
  const [limit, setLimit] = useUrlNumber('limit', 20);

  // Local text mirrors the committed search; debounced before it hits the URL/fetch.
  const [search, setSearch] = useState(committedSearch);

  const handleSort = (key: string) => setSort((s) => toggleSort(s, key));
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

  useEffect(() => {
    loadFactures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSearch, statusFilter, page, limit]);

  useEffect(() => {
    factureService.getStats().then(setStats).catch(() => {});
  }, []);

  // Page-local shortcuts: "/" focuses search, "n" creates a new facture.
  useKeyboardShortcuts([
    { key: '/', action: () => searchRef.current?.focus(), description: 'Rechercher' },
    { key: 'n', action: () => navigate('/factures/nouvelle'), description: 'Nouvelle facture' },
  ]);

  const loadFactures = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const response = await factureService.getAll(normalizeSearch(committedSearch), status, page, limit);
      const factureData = response?.data ?? response ?? [];
      setFactures(Array.isArray(factureData) ? factureData : []);
      setTotal(response.pagination?.total ?? 0);
      setTotalPages(response.pagination?.totalPages ?? 0);
    } catch (error) {
      console.error(' Error loading factures:', error);
      toast.error('Erreur lors du chargement des factures');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setCommittedSearch('');
    setStatusFilter('all');
    setPage(1);
  };

  const exportToCSV = async () => {
    try {
      const response = await factureService.exportAll(normalizeSearch(committedSearch), statusFilter === 'all' ? undefined : statusFilter);
      const allFactures = Array.isArray(response?.data || response) ? (response?.data || response) : [];

      const headers = ['N° Facture', 'Client', 'Date', 'Total', 'Payé', 'Statut'];
      const rows = allFactures.map((f: any) => [
        f.numero_facture,
        `${f.client_nom || ''} ${f.client_prenom || ''}`.trim(),
        new Date(f.date_facture).toLocaleDateString('fr-FR'),
        f.total,
        f.montant_paye || 0,
        f.statut,
      ]);
      downloadCsv(`factures_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
      toast.success('Export CSV réussi');
    } catch {
      toast.error('Erreur lors de l\'export CSV');
    }
  };

  // Client-side sort of the current page rows (server handles pagination).
  const sortedFactures = [...factures].sort((a, b) => {
    if (!sort) return 0;
    let av: any;
    let bv: any;
    switch (sort.key) {
      case 'numero': av = a.numero_facture; bv = b.numero_facture; break;
      case 'client': av = `${a.client_nom || ''} ${a.client_prenom || ''}`.trim(); bv = `${b.client_nom || ''} ${b.client_prenom || ''}`.trim(); break;
      case 'date': av = a.date_facture; bv = b.date_facture; break;
      case 'total': av = parseFloat(a.total as any) || 0; bv = parseFloat(b.total as any) || 0; break;
      case 'paye': av = parseFloat(a.montant_paye as any) || 0; bv = parseFloat(b.montant_paye as any) || 0; break;
      default: return 0;
    }
    if (av < bv) return sort.dir === 'asc' ? -1 : 1;
    if (av > bv) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const allSelected = sortedFactures.length > 0 && sortedFactures.every((f) => selected.has(f.id));
  const someSelected = sortedFactures.some((f) => selected.has(f.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(sortedFactures.map((f) => f.id)));
  };
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exportSelection = () => {
    const headers = ['N° Facture', 'Client', 'Date', 'Total', 'Payé', 'Statut'];
    const rows = sortedFactures
      .filter((f) => selected.has(f.id))
      .map((f: any) => [
        f.numero_facture,
        `${f.client_nom || ''} ${f.client_prenom || ''}`.trim(),
        new Date(f.date_facture).toLocaleDateString('fr-FR'),
        f.total,
        f.montant_paye || 0,
        f.statut,
      ]);
    downloadCsv(`factures_selection_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast.success(`${rows.length} facture${rows.length > 1 ? 's' : ''} exportée${rows.length > 1 ? 's' : ''}`);
  };

  const statTiles: StatTile[] = [
    { label: 'Total factures', value: stats ? String(stats.total_factures.count) : '—', icon: Receipt },
    { label: 'Chiffre d\'affaires', value: stats ? formatXOF(stats.total_factures.montant) : '—', icon: Wallet },
    { label: 'Ce mois', value: stats ? String(stats.factures_mois.count) : '—', hint: stats ? formatXOF(stats.factures_mois.montant) : undefined, icon: CalendarDays },
  ];

  return (
    <div className="p-3 sm:p-6 w-full space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Factures
          </h1>
          <p className="text-muted-foreground mt-1">Historique complet des factures</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Exporter en CSV
          </Button>
          <Link to="/factures/nouvelle">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nouvelle Facture
            </Button>
          </Link>
        </div>
      </div>

      <StatsBar tiles={statTiles} loading={!stats} />

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Rechercher par numéro de facture ou client…  ( / )"
                className="pl-10 sm:pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                <X className="h-4 w-4" />
                Effacer
              </Button>
            )}
          </div>
          {/* Quick status filter chips */}
          <div className="flex flex-wrap gap-2">
            {STATUS_CHIPS.map((c) => (
              <button
                key={c.value}
                onClick={() => { setStatusFilter(c.value); setPage(1); }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  statusFilter === c.value
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

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="outline" size="sm" onClick={exportSelection} className="gap-1">
          <Download className="h-4 w-4" /> Exporter la sélection
        </Button>
      </BulkActionBar>

      {/* Tableau */}
      <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Liste des Factures
              {total > 0 && <Badge variant="secondary">{total}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} aria-label="Tout sélectionner" />
                  </TableHead>
                  <SortableHeader columnKey="numero" sort={sort} onSort={handleSort}>N° Facture</SortableHeader>
                  <SortableHeader columnKey="client" sort={sort} onSort={handleSort}>Client</SortableHeader>
                  <SortableHeader columnKey="date" sort={sort} onSort={handleSort}>Date</SortableHeader>
                  <SortableHeader columnKey="total" sort={sort} onSort={handleSort} align="right">Total</SortableHeader>
                  <SortableHeader columnKey="paye" sort={sort} onSort={handleSort}>
                    <span className="flex items-center gap-1">
                      Payé
                      <span title="Allocation FIFO: les paiements remboursent les factures les plus anciennes en premier">
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </span>
                    </span>
                  </SortableHeader>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <LoadingState inCell />
                    </TableCell>
                  </TableRow>
                ) : (
                <>
                {sortedFactures.map((facture) => {
                  const total = parseFloat(facture.total as any) || 0;
                  const montantPaye = parseFloat(facture.montant_paye as any) || 0;
                  const remainingDue = parseFloat(facture.remaining_due as any) || total;
                  const unpaid = facture.statut !== 'payee' && facture.statut !== 'annulee';
                  return (
                    <TableRow
                      key={facture.id}
                      className={`group cursor-pointer hover:bg-muted/50 ${selected.has(facture.id) ? 'bg-muted/40' : ''} ${unpaid ? 'border-l-2 border-l-warning' : ''}`}
                      onClick={() => navigate(`/factures/${facture.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(facture.id)} onChange={() => toggleOne(facture.id)} aria-label={`Sélectionner ${facture.numero_facture}`} />
                      </TableCell>
                      <TableCell className="font-mono font-semibold">{facture.numero_facture}</TableCell>
                      <TableCell>{facture.client_nom} {facture.client_prenom}</TableCell>
                      <TableCell>{new Date(facture.date_facture).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}</TableCell>
                      <TableCell className="text-right">{formatXOF(facture.total)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className={`text-sm font-semibold ${montantPaye >= total ? 'text-success' : 'text-warning'}`}>
                            {formatXOF(montantPaye)}
                          </span>
                          {facture.statut === 'partielle' && (
                            <span className="text-xs text-muted-foreground">
                              Reste: {formatXOF(remainingDue)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge type="facture" statut={facture.statut} /></TableCell>
                      <TableCell>
                        <button
                          title="Ouvrir dans un nouvel onglet"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                          onClick={(e) => { e.stopPropagation(); window.open(`/factures/${facture.id}`, '_blank'); }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sortedFactures.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <EmptyState
                        icon={FileText}
                        title={hasFilters ? 'Aucune facture pour ces filtres' : 'Aucune facture trouvée'}
                        action={hasFilters
                          ? <Button variant="outline" size="sm" onClick={clearFilters}>Effacer les filtres</Button>
                          : <Link to="/factures/nouvelle"><Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Créer une facture</Button></Link>}
                      />
                    </TableCell>
                  </TableRow>
                )}
                </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      {/* Pagination */}
      {!loading && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
        />
      )}
    </div>
  );
}
