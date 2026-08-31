import { useCallback, useEffect, useRef, useState } from 'react';
import { caisseService } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, RefreshCw, Filter, ShieldCheck } from 'lucide-react';
import { formatFCFA, formatDateShort } from '@/utils/format';
import { formatPaymentMethod } from '@/utils/paymentMethod';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errors';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';

const SOURCE_KINDS = [
  { value: '', label: 'Tous' },
  { value: 'paiement', label: 'Paiements' },
  { value: 'acompte_client', label: 'Acomptes client' },
  { value: 'acompte_fournisseur', label: 'Acomptes fournisseur' },
];

const KIND_LABELS: Record<string, string> = {
  paiement: 'Paiement',
  acompte_client: 'Acompte client',
  acompte_fournisseur: 'Acompte fournisseur',
};

// Palette catégorielle (voir tailwind.config.js) — pas de valeur de statut ici,
// et les tokens `chart-*` s'adaptent seuls au thème sombre.
const KIND_BADGE: Record<string, string> = {
  paiement: 'bg-chart-7/15 text-chart-7',
  acompte_client: 'bg-chart-1/15 text-chart-1',
  acompte_fournisseur: 'bg-chart-6/15 text-chart-6',
};

interface AuditItem {
  source_kind: string;
  source_id: number;
  source_date: string | null;
  tiers_id: number | null;
  methode_paiement: string;
  montant: number | string;
  session_caisse_id: number | null;
  mouvement_caisse_id: number | null;
  is_orphan: boolean;
}

interface AuditSummary {
  source_kind: string;
  total: number | string;
  total_montant: number | string;
  orphans: number | string;
}

export default function CaisseAudit() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [summary, setSummary] = useState<AuditSummary[]>([]);
  const [orphansTotal, setOrphansTotal] = useState(0);
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [sourceKind, setSourceKind] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Monotonic request id: les changements rapides de filtres ne laissent
  // jamais une réponse obsolète écraser la plus récente.
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const body = await caisseService.getAudit({
        limit: 500,
        orphans_only: orphansOnly || undefined,
        source_kind: sourceKind || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      if (reqId !== reqIdRef.current) return; // réponse obsolète
      setItems(body.data as AuditItem[]);
      setSummary(body.summary as AuditSummary[]);
      setOrphansTotal(body.orphans_total);
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return; // réponse obsolète
      if (err?.response?.status === 401) {
        // Session expirée — même comportement que l'intercepteur partagé
        localStorage.removeItem('auth_user');
        window.location.href = '/login';
        return;
      }
      setError(err);
      toast.error(getErrorMessage(err, "Erreur lors du chargement de l'audit de caisse"));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [orphansOnly, sourceKind, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      <PageHeader
        title="Audit caisse"
        icon={ShieldCheck}
        description="Rapprochement des encaissements espèces avec les mouvements de caisse"
        actions={
          <Button onClick={load} variant="outline" size="sm" className="gap-1" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className={orphansTotal > 0 ? 'border-danger-500 border-2' : 'border-success-500 border-2'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {orphansTotal > 0
                ? <AlertTriangle className="h-5 w-5 text-danger-600" />
                : <CheckCircle2 className="h-5 w-5 text-success-600" />}
              <div>
                <p className="text-xs text-muted-foreground">Orphelins (espèce sans caisse)</p>
                <p className={`text-2xl font-bold ${orphansTotal > 0 ? 'text-danger-600' : 'text-success-600'}`}>{orphansTotal}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {summary.map((s) => (
          <Card key={s.source_kind}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{KIND_LABELS[s.source_kind] || s.source_kind}</p>
              <p className="text-xl font-bold">{s.total}</p>
              <p className="text-xs text-muted-foreground">{formatFCFA(s.total_montant)}</p>
              {Number(s.orphans) > 0 && (
                <Badge variant="destructive" className="text-xs mt-1">{s.orphans} orphelins</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2"><Filter className="h-4 w-4" /> Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={sourceKind || '__all'} onValueChange={v => setSourceKind(v === '__all' ? '' : v)}>
              <SelectTrigger className="block w-44 text-sm" aria-label="Filtrer par type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_KINDS.map(k => <SelectItem key={k.value} value={k.value === '' ? '__all' : k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Du</Label>
            <DatePicker value={dateFrom} onChange={setDateFrom} className="h-9 w-44 text-sm" aria-label="Du" />
          </div>
          <div>
            <Label className="text-xs">Au</Label>
            <DatePicker value={dateTo} onChange={setDateTo} className="h-9 w-44 text-sm" aria-label="Au" />
          </div>
          <label htmlFor="audit-orphelins" className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              id="audit-orphelins"
              checked={orphansOnly}
              onChange={e => setOrphansOnly(e.target.checked)}
            />
            Orphelins uniquement
          </label>
          {(dateFrom || dateTo || sourceKind || orphansOnly) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setSourceKind(''); setOrphansOnly(false); }}>
              Réinitialiser
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">
            Mouvements ({items.length}{items.length >= 500 ? ' — limité à 500' : ''})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <QueryState
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            onRetry={load}
            skeleton={<TableSkeleton rows={8} columns={9} />}
            emptyIcon={ShieldCheck}
            emptyTitle="Aucun mouvement"
            emptyDescription="Aucun mouvement ne correspond aux filtres sélectionnés."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Tiers</TableHead>
                  <TableHead className="text-xs">Méthode</TableHead>
                  <TableHead className="text-xs text-right">Montant</TableHead>
                  <TableHead className="text-xs">Session</TableHead>
                  <TableHead className="text-xs">Mvt caisse</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={`${it.source_kind}-${it.source_id}`} className={it.is_orphan ? 'bg-danger-50' : ''}>
                    <TableCell className="text-xs whitespace-nowrap">{it.source_date ? formatDateShort(it.source_date) : '—'}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${KIND_BADGE[it.source_kind] || ''}`}>
                        {KIND_LABELS[it.source_kind] || it.source_kind}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono">#{it.source_id}</TableCell>
                    <TableCell className="text-xs">{it.tiers_id || '—'}</TableCell>
                    <TableCell className="text-xs">{formatPaymentMethod(it.methode_paiement)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatFCFA(it.montant)}</TableCell>
                    <TableCell className="text-xs">{it.session_caisse_id || '—'}</TableCell>
                    <TableCell className="text-xs">{it.mouvement_caisse_id || '—'}</TableCell>
                    <TableCell>
                      {it.is_orphan
                        ? <Badge variant="destructive" className="text-xs">Orphelin</Badge>
                        : <Badge variant="outline" className="text-xs">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
