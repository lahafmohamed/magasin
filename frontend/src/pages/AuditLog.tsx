import { useState, useEffect, useMemo } from 'react';
import { auditService } from '../services/api';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState } from '@/components/ui/loading';
import { QueryState } from '@/components/ui/query-state';
import { SortableHeader, toggleSort, SortState } from '@/components/ui/sortable-header';
import { Search, ShieldAlert, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-success-100 text-success-700',
  UPDATE: 'bg-info-100 text-info-700',
  DELETE: 'bg-danger-100 text-danger-700',
};

export default function AuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filterTable, setFilterTable] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    loadLogs();
  }, [page, filterTable]);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await auditService.getLogs({
        table: filterTable || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        page,
        limit,
      });
      setLogs(result.data || []);
      setTotal(result.total || 0);
    } catch (err) {
      // On garde l'erreur en état : QueryState affiche « Réessayer » au lieu de
      // laisser une page vide derrière un toast qui s'efface.
      setError(err);
      setLogs([]);
      toast.error('Erreur lors du chargement des logs');
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  // Tri client appliqué à la page courante (la pagination reste côté serveur).
  const [sort, setSort] = useState<SortState<'date' | 'table' | 'action' | 'user'> | null>(null);
  const handleSort = (key: 'date' | 'table' | 'action' | 'user') => setSort(s => toggleSort(s, key));

  const sortedLogs = useMemo(() => {
    if (!sort) return logs;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const pick = (l: any) =>
      sort.key === 'date' ? l.created_at
      : sort.key === 'table' ? l.table_name
      : sort.key === 'action' ? l.action
      : (l.user_nom || '');
    return [...logs].sort((a, b) => {
      if (sort.key === 'date') {
        return (new Date(pick(a)).getTime() - new Date(pick(b)).getTime()) * dir;
      }
      return String(pick(a) || '').localeCompare(String(pick(b) || ''), 'fr') * dir;
    });
  }, [logs, sort]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="h-8 w-8" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal d'audit</h1>
          <p className="text-muted-foreground">Historique des modifications</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="audit-table">Table</Label>
              <Select
                value={filterTable === '' ? '__all' : filterTable}
                onValueChange={(v) => { setFilterTable(v === '__all' ? '' : v); setPage(1); }}
              >
                <SelectTrigger id="audit-table" className="w-full" aria-label="Filtrer par table">
                  <SelectValue placeholder="Toutes les tables" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Toutes les tables</SelectItem>
                  <SelectItem value="company_settings">Paramètres société</SelectItem>
                  <SelectItem value="factures">Factures</SelectItem>
                  <SelectItem value="produits">Produits</SelectItem>
                  <SelectItem value="tiers">Tiers</SelectItem>
                  <SelectItem value="utilisateurs">Utilisateurs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-date-from">Date début</Label>
              <DatePicker id="audit-date-from" value={filterDateFrom} onChange={setFilterDateFrom} aria-label="Date début" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-date-to">Date fin</Label>
              <DatePicker id="audit-date-to" value={filterDateTo} onChange={setFilterDateTo} aria-label="Date fin" />
            </div>
            <div className="flex items-end">
              <Button onClick={loadLogs} className="gap-2 w-full">
                <Search className="h-4 w-4" />
                Filtrer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modifications ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <QueryState
            loading={loading}
            error={error}
            isEmpty={logs.length === 0}
            onRetry={loadLogs}
            skeleton={<LoadingState />}
            emptyIcon={ScrollText}
            emptyTitle="Aucun log trouvé"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <SortableHeader columnKey="date" sort={sort} onSort={handleSort}>Date</SortableHeader>
                    <SortableHeader columnKey="table" sort={sort} onSort={handleSort}>Table</SortableHeader>
                    <th className="px-4 py-3 text-left">Enregistrement</th>
                    <SortableHeader columnKey="action" sort={sort} onSort={handleSort}>Action</SortableHeader>
                    <SortableHeader columnKey="user" sort={sort} onSort={handleSort}>Utilisateur</SortableHeader>
                    <th className="px-4 py-3 text-left">Anciennes valeurs</th>
                    <th className="px-4 py-3 text-left">Nouvelles valeurs</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs font-mono">
                        {new Date(log.created_at).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-xs">{log.table_name}</td>
                      <td className="px-4 py-3 text-xs font-mono">#{log.record_id}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[log.action] || 'bg-muted text-muted-foreground'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{log.user_nom || '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.old_values ? JSON.stringify(log.old_values).substring(0, 80) : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.new_values ? JSON.stringify(log.new_values).substring(0, 80) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
        </CardContent>
      </Card>

      {total > limit && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={() => {}}
          />
        </div>
      )}
    </div>
  );
}
