import { useEffect, useRef, useState } from 'react';
import { api, caisseService } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { History, Filter } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';

interface SessionRow {
  id: number;
  magasin_id: number;
  magasin_nom: string;
  magasin_code: string;
  statut: 'ouverte' | 'cloturee';
  date_ouverture: string;
  date_cloture: string | null;
  fond_initial: number;
  fond_final_compte: number | null;
  solde_theorique_cloture: number | null;
  expected_cash?: number | string | null;
  ecart: number | null;
  commentaire_ouverture?: string | null;
  commentaire_cloture?: string | null;
  ouvert_par_username?: string | null;
  cloture_par_username?: string | null;
  totaux_par_methode?: Record<string, { in: number; out: number }> | null;
}

interface Magasin {
  id: number;
  nom: string;
  code?: string;
}

const heure = (iso: string | null) =>
  iso ? `${formatDateShort(iso)} ${new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '—';

function EcartCell({ ecart, statut }: { ecart: number | null; statut: string }) {
  if (statut !== 'cloturee' || ecart === null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(ecart) < 0.005) return <span className="text-success-600 dark:text-success-400 font-mono">0</span>;
  return (
    <span className="text-danger-600 dark:text-danger-400 font-mono font-medium">
      {ecart > 0 ? '+' : ''}{formatCurrency(ecart)}
    </span>
  );
}

export default function CaisseHistorique() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [magasinId, setMagasinId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [detail, setDetail] = useState<SessionRow | null>(null);
  // Garde anti-course : une réponse obsolète n'écrase jamais la plus récente
  const reqIdRef = useRef(0);

  useEffect(() => {
    api.get('/caisse/magasins')
      .then(({ data }) => setMagasins(Array.isArray(data) ? data : data?.data || []))
      .catch(() => setMagasins([]));
  }, []);

  const load = async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await caisseService.getHistorique({
        magasin_id: magasinId ? Number(magasinId) : undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        page,
        limit,
      });
      if (reqId !== reqIdRef.current) return;
      const rows: SessionRow[] = Array.isArray(res) ? res : res?.data || [];
      setSessions(rows);
      const pg = (res as any)?.pagination;
      setTotal(pg?.total ?? rows.length);
      setTotalPages(pg?.totalPages ?? 1);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [magasinId, dateFrom, dateTo, page, limit]);

  const onFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      <PageHeader
        title="Historique des caisses"
        icon={History}
        backTo="/caisse"
        description="Sessions de caisse ouvertes et clôturées"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtres
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Magasin</Label>
            <Select value={magasinId || 'tous'} onValueChange={v => onFilterChange(setMagasinId)(v === 'tous' ? '' : v)}>
              <SelectTrigger aria-label="Magasin">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous</SelectItem>
                {magasins.map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.code ? `${m.code} — ` : ''}{m.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hist-from">Du</Label>
            <Input id="hist-from" type="date" value={dateFrom} onChange={e => onFilterChange(setDateFrom)(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hist-to">Au</Label>
            <Input id="hist-to" type="date" value={dateTo} onChange={e => onFilterChange(setDateTo)(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <QueryState
            loading={loading}
            error={error}
            isEmpty={sessions.length === 0}
            onRetry={load}
            skeleton={<TableSkeleton rows={8} columns={8} />}
            emptyTitle="Aucune session"
            emptyDescription="Aucune session de caisse ne correspond aux filtres."
            emptyIcon={History}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Magasin</TableHead>
                    <TableHead>Ouverture</TableHead>
                    <TableHead>Clôture</TableHead>
                    <TableHead>Ouvert par</TableHead>
                    <TableHead>Clôturé par</TableHead>
                    <TableHead className="text-right">Fond initial</TableHead>
                    <TableHead className="text-right">Fond compté</TableHead>
                    <TableHead className="text-right">Écart</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map(s => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(s)}
                      title="Voir le détail"
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        {s.magasin_code ? `${s.magasin_code} — ` : ''}{s.magasin_nom}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{heure(s.date_ouverture)}</TableCell>
                      <TableCell className="whitespace-nowrap">{heure(s.date_cloture)}</TableCell>
                      <TableCell>{s.ouvert_par_username || '—'}</TableCell>
                      <TableCell>{s.cloture_par_username || '—'}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(s.fond_initial)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {s.fond_final_compte !== null ? formatCurrency(s.fond_final_compte) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <EcartCell ecart={s.ecart} statut={s.statut} />
                      </TableCell>
                      <TableCell>
                        {s.statut === 'ouverte'
                          ? <Badge variant="info">Ouverte</Badge>
                          : <Badge variant="secondary">Clôturée</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={l => { setLimit(l); setPage(1); }}
              />
            )}
          </QueryState>
        </CardContent>
      </Card>

      {/* Détail session */}
      <Dialog open={detail !== null} onOpenChange={o => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Session #{detail?.id} — {detail?.magasin_nom}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Ouverture</span>
                <span>{heure(detail.date_ouverture)} {detail.ouvert_par_username ? `(${detail.ouvert_par_username})` : ''}</span>
                <span className="text-muted-foreground">Clôture</span>
                <span>{heure(detail.date_cloture)} {detail.cloture_par_username ? `(${detail.cloture_par_username})` : ''}</span>
                <span className="text-muted-foreground">Fond initial</span>
                <span className="font-mono">{formatCurrency(detail.fond_initial)}</span>
                <span className="text-muted-foreground">Espèces attendues</span>
                <span className="font-mono">
                  {detail.expected_cash != null ? formatCurrency(Number(detail.expected_cash)) : '—'}
                </span>
                <span className="text-muted-foreground">Fond compté</span>
                <span className="font-mono">
                  {detail.fond_final_compte !== null ? formatCurrency(detail.fond_final_compte) : '—'}
                </span>
                <span className="text-muted-foreground">Écart</span>
                <span><EcartCell ecart={detail.ecart} statut={detail.statut} /></span>
              </div>
              {detail.totaux_par_methode && Object.keys(detail.totaux_par_methode).length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">Totaux par méthode</p>
                  <div className="rounded-md border divide-y">
                    {Object.entries(detail.totaux_par_methode).map(([methode, t]) => (
                      <div key={methode} className="flex justify-between px-3 py-1.5">
                        <span className="capitalize">{methode.replace('_', ' ')}</span>
                        <span className="font-mono">
                          +{formatCurrency(t.in)} / -{formatCurrency(t.out)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detail.commentaire_ouverture && (
                <div>
                  <p className="text-muted-foreground">Commentaire d'ouverture</p>
                  <p>{detail.commentaire_ouverture}</p>
                </div>
              )}
              {detail.commentaire_cloture && (
                <div>
                  <p className="text-muted-foreground">Commentaire de clôture</p>
                  <p>{detail.commentaire_cloture}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
