import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
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
import { FilePlus, Search as SearchIcon, Eye, FileCheck, FileText, Download, X, Truck } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { formatXOF, normalizeSearch } from '@/utils/format';
import { bonLivraisonService } from '@/services/api';
import { toast } from 'sonner';
import { SortableHeader, toggleSort, type SortState } from '@/components/ui/sortable-header';
import { LoadingState } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { StatsBar, type StatTile } from '@/components/ui/stats-bar';
import { BulkActionBar } from '@/components/ui/bulk-action-bar';
import { Pagination } from '@/components/ui/pagination';
import { useUrlState, useUrlNumber } from '@/hooks/useUrlState';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { downloadCsv } from '@/utils/csv';

interface BonLivraison {
  id: number;
  numero_bl: string;
  tiers_id: number;
  client_id?: number;
  client_nom: string;
  client_prenom?: string;
  date_bl: string;
  statut: 'valide' | 'livre' | 'facture' | 'annule' | string;
  total: number;
  notes: string | null;
}

const STATUS_CHIPS = [
  { value: 'all', label: 'Tous' },
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'valide', label: 'Validé' },
  { value: 'livre', label: 'Livré' },
  { value: 'facture', label: 'Facturé' },
  { value: 'annule', label: 'Annulé' },
];

export default function BonsLivraison() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [bons, setBons] = useState<BonLivraison[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortState | null>({ key: 'date', dir: 'desc' });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [statusFilter, setStatusFilter] = useUrlState('statut', 'all');
  const [committedSearch, setCommittedSearch] = useUrlState('q', '');
  const [page, setPage] = useUrlNumber('page', 1);
  const [limit, setLimit] = useUrlNumber('limit', 20);
  const [search, setSearch] = useState(committedSearch);

  const handleSort = (key: string) => setSort((s) => toggleSort(s, key));
  const hasFilters = committedSearch !== '' || statusFilter !== 'all';

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== committedSearch) { setCommittedSearch(search); setPage(1); }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    loadBons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSearch, statusFilter, page, limit]);

  useEffect(() => {
    bonLivraisonService.getStats().then(setStats).catch(() => {});
  }, []);

  useKeyboardShortcuts([
    { key: '/', action: () => searchRef.current?.focus(), description: 'Rechercher' },
    { key: 'n', action: () => navigate('/bons-livraison/nouveau'), description: 'Nouveau bon' },
  ]);

  const loadBons = async () => {
    try {
      setLoading(true);
      setSelected(new Set());
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const response = await bonLivraisonService.getAll(normalizeSearch(committedSearch), status, page, limit);
      const data = response?.data ?? response ?? [];
      setBons(Array.isArray(data) ? data : []);
      setTotal(response?.pagination?.total ?? 0);
      setTotalPages(response?.pagination?.totalPages ?? 0);
    } catch (error) {
      toast.error('Erreur lors du chargement des bons de livraison');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch(''); setCommittedSearch(''); setStatusFilter('all'); setPage(1);
  };

  const handleConvert = async (id: number) => {
    if (!confirm('Convertir ce bon de livraison en facture ?')) return;
    try {
      await bonLivraisonService.convertToFacture(id);
      toast.success('Bon de livraison converti en facture');
      loadBons();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur lors de la conversion');
    }
  };

  const exportToCSV = async () => {
    try {
      const all = await bonLivraisonService.exportAll(normalizeSearch(committedSearch), statusFilter === 'all' ? undefined : statusFilter);
      const headers = ['N° BL', 'Client', 'Date', 'Total', 'Statut'];
      const rows = (all || []).map((b: any) => [
        b.numero_bl,
        `${b.client_nom || ''} ${b.client_prenom || ''}`.trim(),
        new Date(b.date_bl).toLocaleDateString('fr-FR'),
        b.total,
        b.statut,
      ]);
      downloadCsv(`bons_livraison_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
      toast.success('Export CSV réussi');
    } catch {
      toast.error('Erreur lors de l\'export CSV');
    }
  };

  const sortedBons = [...bons].sort((a, b) => {
    if (!sort) return 0;
    let av: any, bv: any;
    switch (sort.key) {
      case 'numero': av = a.numero_bl || ''; bv = b.numero_bl || ''; break;
      case 'client': av = a.client_nom || ''; bv = b.client_nom || ''; break;
      case 'date': av = a.date_bl; bv = b.date_bl; break;
      case 'total': av = Number(a.total) || 0; bv = Number(b.total) || 0; break;
      default: return 0;
    }
    if (av < bv) return sort.dir === 'asc' ? -1 : 1;
    if (av > bv) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const allSelected = sortedBons.length > 0 && sortedBons.every((b) => selected.has(b.id));
  const someSelected = sortedBons.some((b) => selected.has(b.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(sortedBons.map((b) => b.id)));
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkConvertible = sortedBons.filter((b) => selected.has(b.id) && b.statut === 'livre');
  const handleBulkConvert = async () => {
    if (bulkConvertible.length === 0) { toast.info('Aucun BL « livré » sélectionné'); return; }
    if (!confirm(`Convertir ${bulkConvertible.length} bon(s) de livraison en facture ?`)) return;
    const results = await Promise.allSettled(bulkConvertible.map((b) => bonLivraisonService.convertToFacture(b.id)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok) toast.success(`${ok} converti(s) en facture`);
    if (ok < bulkConvertible.length) toast.error(`${bulkConvertible.length - ok} échec(s)`);
    loadBons();
  };

  const statTiles: StatTile[] = [
    { label: 'Total BL', value: stats ? String(stats.total.count) : '—', icon: Truck },
    { label: 'Montant total', value: stats ? formatXOF(stats.total.montant) : '—' },
    { label: 'À facturer', value: stats ? String(stats.a_facturer.count) : '—', tone: stats && stats.a_facturer.count > 0 ? 'text-warning' : undefined },
    { label: 'Ce mois', value: stats ? String(stats.mois.count) : '—', hint: stats ? formatXOF(stats.mois.montant) : undefined },
  ];

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-8 w-8" /> Bons de Livraison
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exporter en CSV
          </Button>
          <Button onClick={() => navigate('/bons-livraison/nouveau')} className="gap-2">
            <FilePlus className="h-4 w-4" /> Nouveau Bon (depuis devis)
          </Button>
        </div>
      </div>

      <StatsBar tiles={statTiles} loading={!stats} />

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Rechercher par numéro ou client…  ( / )"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                <X className="h-4 w-4" /> Effacer
              </Button>
            )}
          </div>
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
        <Button variant="default" size="sm" onClick={handleBulkConvert} className="gap-1">
          <FileCheck className="h-4 w-4" /> Convertir en facture
        </Button>
      </BulkActionBar>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} aria-label="Tout sélectionner" />
                </TableHead>
                <SortableHeader columnKey="numero" sort={sort} onSort={handleSort}>Numéro</SortableHeader>
                <SortableHeader columnKey="client" sort={sort} onSort={handleSort}>Client</SortableHeader>
                <SortableHeader columnKey="date" sort={sort} onSort={handleSort}>Date</SortableHeader>
                <TableHead>Statut</TableHead>
                <SortableHeader columnKey="total" sort={sort} onSort={handleSort} align="right">Total</SortableHeader>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="p-0"><LoadingState inCell /></TableCell></TableRow>
              ) : sortedBons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={FileText}
                      title={hasFilters ? 'Aucun bon pour ces filtres' : 'Aucun bon de livraison trouvé'}
                      action={hasFilters
                        ? <Button variant="outline" size="sm" onClick={clearFilters}>Effacer les filtres</Button>
                        : <Button size="sm" className="gap-2" onClick={() => navigate('/bons-livraison/nouveau')}><FilePlus className="h-4 w-4" />Créer un bon</Button>}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortedBons.map((bon) => (
                  <TableRow
                    key={bon.id}
                    className={`cursor-pointer hover:bg-muted/50 ${selected.has(bon.id) ? 'bg-muted/40' : ''}`}
                    onClick={() => navigate(`/bons-livraison/${bon.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(bon.id)} onChange={() => toggleOne(bon.id)} aria-label={`Sélectionner ${bon.numero_bl}`} />
                    </TableCell>
                    <TableCell className="font-mono font-semibold">{bon.numero_bl}</TableCell>
                    <TableCell>{bon.client_nom} {bon.client_prenom}</TableCell>
                    <TableCell>{new Date(bon.date_bl).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell><StatusBadge type="bl" statut={bon.statut} /></TableCell>
                    <TableCell className="text-right font-medium">{formatXOF(bon.total)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/bons-livraison/${bon.id}`)} aria-label="Voir le bon de livraison"><Eye className="h-4 w-4" /></Button>
                        {bon.statut === 'livre' && (
                          <Button variant="ghost" size="sm" onClick={() => handleConvert(bon.id)} title="Convertir en facture" aria-label="Convertir en facture"><FileCheck className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!loading && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(l) => { setLimit(l); setPage(1); }}
        />
      )}

      {!loading && total > 0 && (
        <p className="text-center text-xs text-muted-foreground"><Badge variant="secondary">{total}</Badge> bons au total</p>
      )}
    </div>
  );
}
