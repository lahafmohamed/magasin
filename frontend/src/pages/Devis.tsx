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
import { FilePlus, Search as SearchIcon, Eye, FileCheck, Trash2, Pencil, FileText, Download, X } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { formatXOF, normalizeSearch } from '@/utils/format';
import { devisService } from '@/services/api';
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

interface Devis {
  id: number;
  numero_devis: string;
  tiers_id: number;
  client_id?: number;
  client_nom: string;
  client_prenom?: string;
  date_devis: string;
  date_validite: string | null;
  statut: 'brouillon' | 'envoye' | 'accepte' | 'annule' | 'converti' | string;
  total: number;
  notes: string | null;
}

const STATUS_CHIPS = [
  { value: 'all', label: 'Tous' },
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'envoye', label: 'Envoyé' },
  { value: 'accepte', label: 'Accepté' },
  { value: 'converti', label: 'Converti' },
  { value: 'annule', label: 'Annulé' },
];

export default function Devis() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [devis, setDevis] = useState<Devis[]>([]);
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
    loadDevis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSearch, statusFilter, page, limit]);

  useEffect(() => {
    devisService.getStats().then(setStats).catch(() => {});
  }, []);

  useKeyboardShortcuts([
    { key: '/', action: () => searchRef.current?.focus(), description: 'Rechercher' },
    { key: 'n', action: () => navigate('/devis/nouveau'), description: 'Nouveau devis' },
  ]);

  const loadDevis = async () => {
    try {
      setLoading(true);
      setSelected(new Set());
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const response = await devisService.getAll(normalizeSearch(committedSearch), status, page, limit);
      const data = response?.data ?? response ?? [];
      setDevis(Array.isArray(data) ? data : []);
      setTotal(response?.pagination?.total ?? 0);
      setTotalPages(response?.pagination?.totalPages ?? 0);
    } catch (error) {
      toast.error('Erreur lors du chargement des devis');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch(''); setCommittedSearch(''); setStatusFilter('all'); setPage(1);
  };

  const canConfirm = (statut: string) => ['brouillon', 'envoye'].includes(statut);

  const handleConfirm = async (id: number) => {
    if (!confirm('Confirmer ce devis ? Cela générera automatiquement un bon de livraison.')) return;
    try {
      await devisService.updateStatut(id, 'accepte');
      toast.success('Devis confirmé et bon de livraison généré');
      loadDevis();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur lors de la confirmation du devis');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce devis ? Cette action est irréversible.')) return;
    try {
      await devisService.delete(id);
      toast.success('Devis supprimé');
      loadDevis();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Supprimer ${selected.size} devis ? Cette action est irréversible.`)) return;
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => devisService.delete(id)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok) toast.success(`${ok} devis supprimé${ok > 1 ? 's' : ''}`);
    if (ok < ids.length) toast.error(`${ids.length - ok} échec(s)`);
    loadDevis();
  };

  const exportToCSV = async () => {
    try {
      const all = await devisService.exportAll(normalizeSearch(committedSearch), statusFilter === 'all' ? undefined : statusFilter);
      const headers = ['N° Devis', 'Client', 'Date', 'Validité', 'Total', 'Statut'];
      const rows = (all || []).map((d: any) => [
        d.numero_devis,
        `${d.client_nom || ''} ${d.client_prenom || ''}`.trim(),
        new Date(d.date_devis).toLocaleDateString('fr-FR'),
        d.date_validite ? new Date(d.date_validite).toLocaleDateString('fr-FR') : '',
        d.total,
        d.statut,
      ]);
      downloadCsv(`devis_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
      toast.success('Export CSV réussi');
    } catch {
      toast.error('Erreur lors de l\'export CSV');
    }
  };

  const sortedDevis = [...devis].sort((a, b) => {
    if (!sort) return 0;
    let av: any, bv: any;
    switch (sort.key) {
      case 'numero': av = a.numero_devis; bv = b.numero_devis; break;
      case 'client': av = a.client_nom; bv = b.client_nom; break;
      case 'date': av = a.date_devis; bv = b.date_devis; break;
      case 'validite': av = a.date_validite || ''; bv = b.date_validite || ''; break;
      case 'total': av = Number(a.total) || 0; bv = Number(b.total) || 0; break;
      default: return 0;
    }
    if (av < bv) return sort.dir === 'asc' ? -1 : 1;
    if (av > bv) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const allSelected = sortedDevis.length > 0 && sortedDevis.every((d) => selected.has(d.id));
  const someSelected = sortedDevis.some((d) => selected.has(d.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(sortedDevis.map((d) => d.id)));
  };
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const statTiles: StatTile[] = [
    { label: 'Total devis', value: stats ? String(stats.total.count) : '—', icon: FileText },
    { label: 'Montant total', value: stats ? formatXOF(stats.total.montant) : '—' },
    { label: 'En cours', value: stats ? String(stats.en_cours.count) : '—' },
    { label: 'Ce mois', value: stats ? String(stats.mois.count) : '—', hint: stats ? formatXOF(stats.mois.montant) : undefined },
  ];

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-8 w-8" /> Devis
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exporter en CSV
          </Button>
          <Button onClick={() => navigate('/devis/nouveau')} className="gap-2">
            <FilePlus className="h-4 w-4" /> Nouveau Devis
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
        <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-1">
          <Trash2 className="h-4 w-4" /> Supprimer
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
                <SortableHeader columnKey="validite" sort={sort} onSort={handleSort}>Validité</SortableHeader>
                <TableHead>Statut</TableHead>
                <SortableHeader columnKey="total" sort={sort} onSort={handleSort} align="right">Total</SortableHeader>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="p-0"><LoadingState inCell /></TableCell></TableRow>
              ) : sortedDevis.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={FileText}
                      title={hasFilters ? 'Aucun devis pour ces filtres' : 'Aucun devis trouvé'}
                      action={hasFilters
                        ? <Button variant="outline" size="sm" onClick={clearFilters}>Effacer les filtres</Button>
                        : <Button size="sm" className="gap-2" onClick={() => navigate('/devis/nouveau')}><FilePlus className="h-4 w-4" />Créer un devis</Button>}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortedDevis.map((d) => (
                  <TableRow
                    key={d.id}
                    className={`cursor-pointer hover:bg-muted/50 ${selected.has(d.id) ? 'bg-muted/40' : ''}`}
                    onClick={() => navigate(`/devis/${d.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(d.id)} onChange={() => toggleOne(d.id)} aria-label={`Sélectionner ${d.numero_devis}`} />
                    </TableCell>
                    <TableCell className="font-mono font-semibold">{d.numero_devis}</TableCell>
                    <TableCell>{d.client_nom} {d.client_prenom}</TableCell>
                    <TableCell>{new Date(d.date_devis).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>{d.date_validite ? new Date(d.date_validite).toLocaleDateString('fr-FR') : '-'}</TableCell>
                    <TableCell><StatusBadge type="devis" statut={d.statut} /></TableCell>
                    <TableCell className="text-right font-medium">{formatXOF(d.total)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/devis/${d.id}`)} aria-label="Voir le devis"><Eye className="h-4 w-4" /></Button>
                        {canConfirm(d.statut) && (
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/devis/${d.id}/edit`)} title="Modifier" aria-label="Modifier le devis"><Pencil className="h-4 w-4" /></Button>
                        )}
                        {canConfirm(d.statut) && (
                          <Button variant="ghost" size="sm" onClick={() => handleConfirm(d.id)} title="Confirmer" aria-label="Confirmer le devis"><FileCheck className="h-4 w-4" /></Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id)} title="Supprimer" aria-label="Supprimer le devis"><Trash2 className="h-4 w-4 text-red-600" /></Button>
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
        <p className="text-center text-xs text-muted-foreground"><Badge variant="secondary">{total}</Badge> devis au total</p>
      )}
    </div>
  );
}
