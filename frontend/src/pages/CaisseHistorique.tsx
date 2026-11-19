import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { caisseService } from '@/services/api';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Tag } from '@/components/ui/tag';
import { Money } from '@/components/ui/money';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataCard, DataCardRow, ResponsiveTable } from '@/components/ui/responsive-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { TILL_GAP_TEXT_CLASS, tillGapTone } from '@/utils/tillGap';
import { readDateParam, useSearchParamsPatch } from '@/hooks/useUrlState';
import { getErrorMessage } from '@/utils/errors';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatSignedCurrency,
  formatTime,
  toNumber,
} from '@/utils/format';
import { formatPaymentMethod, paymentMethodHue } from '@/utils/paymentMethod';

interface SessionRow {
  id: number;
  magasin_id: number;
  magasin_nom: string;
  magasin_code: string | null;
  statut: 'ouverte' | 'cloturee';
  date_ouverture: string;
  date_cloture: string | null;
  fond_initial: number | string;
  fond_final_compte: number | string | null;
  expected_cash?: number | string | null;
  ecart: number | string | null;
  commentaire_ouverture?: string | null;
  commentaire_cloture?: string | null;
  ouvert_par_username?: string | null;
  cloture_par_username?: string | null;
  /** Noms complets (CPG2-05) ; l'identifiant de connexion seulement à défaut. */
  ouvert_par_nom?: string | null;
  cloture_par_nom?: string | null;
  totaux_par_methode?: Record<string, { in: number; out: number }> | null;
}

const ouvertPar = (s: SessionRow) => s.ouvert_par_nom || s.ouvert_par_username || null;
const cloturePar = (s: SessionRow) => s.cloture_par_nom || s.cloture_par_username || null;

interface Magasin {
  id: number;
  nom: string;
  code?: string;
}

interface HistoriquePage {
  data?: SessionRow[];
  pagination?: { total?: number; totalPages?: number };
}

function Ecart({ value, statut }: { value: number | string | null; statut: string }) {
  const ecart = toNumber(value);
  if (statut !== 'cloturee' || ecart === null) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Non clôturée</span>
      </span>
    );
  }
  const rounded = Math.round(ecart);
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        rounded !== 0 && 'font-medium',
        TILL_GAP_TEXT_CLASS[tillGapTone(ecart)]
      )}
    >
      {formatSignedCurrency(rounded)}
      <span className="sr-only">
        {rounded === 0 ? ' (aucun écart)' : rounded < 0 ? ' (espèces manquantes)' : ' (espèces en trop)'}
      </span>
    </span>
  );
}

const sessionLabel = (s: SessionRow) => `Session n° ${s.id}`;

/** Date valide ou `null` (date absente ou illisible). */
function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * « 23 oct. 2026, 13:08 → 18:42 » : une seule cellule pour l'ouverture et la
 * clôture (GV-03). La date de clôture n'est répétée que si la session a
 * changé de jour ; une session ouverte se lit « → en cours ».
 */
function periodeParts(s: SessionRow): { debut: string; fin: string } | null {
  const ouverture = validDate(s.date_ouverture);
  if (!ouverture) return null;
  const debut = `${formatDate(ouverture)}, ${formatTime(ouverture)}`;
  const cloture = validDate(s.date_cloture);
  if (!cloture) return { debut, fin: 'en cours' };
  return { debut, fin: sameLocalDay(ouverture, cloture) ? formatTime(cloture) : `${formatDate(cloture)}, ${formatTime(cloture)}` };
}

function Periode({ session }: { session: SessionRow }) {
  const parts = periodeParts(session);
  if (!parts) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="whitespace-nowrap">
      {parts.debut} <span aria-hidden="true">→</span>
      <span className="sr-only"> jusqu’à</span> {parts.fin}
    </span>
  );
}

/** Code du magasin (le nom complet au survol et pour les lecteurs d'écran). */
function MagasinCell({ session }: { session: SessionRow }) {
  if (!session.magasin_code) return <span className="whitespace-nowrap">{session.magasin_nom}</span>;
  return (
    <span className="whitespace-nowrap" title={session.magasin_nom}>
      {session.magasin_code}
      <span className="sr-only"> — {session.magasin_nom}</span>
    </span>
  );
}

export default function CaisseHistorique() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  // Filtres portés par l'adresse (lien partageable, retour arrière ; le tableau
  // de bord ouvre `?from=` sur la semaine des clôtures qu'il compte).
  const [params] = useSearchParams();
  const patchParams = useSearchParamsPatch();
  const magasinParam = params.get('magasin_id') ?? '';
  const magasinId = /^\d+$/.test(magasinParam) ? magasinParam : '';
  const dateFrom = readDateParam(params, 'from');
  const dateTo = readDateParam(params, 'to');
  const setMagasinId = (id: string) => patchParams({ magasin_id: id });
  const setDateFrom = (date: string) => patchParams({ from: date });
  const setDateTo = (date: string) => patchParams({ to: date });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [detail, setDetail] = useState<SessionRow | null>(null);
  // Garde anti-course : une réponse obsolète n'écrase jamais la plus récente.
  const reqIdRef = useRef(0);

  useEffect(() => {
    caisseService
      .getMagasins()
      .then((rows) => setMagasins(rows as Magasin[]))
      .catch((err) => {
        setMagasins([]);
        toast.error(getErrorMessage(err, 'Impossible de charger la liste des magasins : le filtre reste sur «\u00A0Tous\u00A0».'));
      });
  }, []);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = (await caisseService.getHistorique({
        magasin_id: magasinId ? Number(magasinId) : undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        page,
        limit,
      })) as HistoriquePage | SessionRow[];
      if (reqId !== reqIdRef.current) return;
      const rows: SessionRow[] = Array.isArray(res) ? res : res?.data ?? [];
      const pg = Array.isArray(res) ? undefined : res?.pagination;
      setSessions(rows);
      setTotal(pg?.total ?? rows.length);
      setTotalPages(pg?.totalPages ?? 1);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setSessions([]);
      setError(err);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [magasinId, dateFrom, dateTo, page, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const hasFilters = !!(magasinId || dateFrom || dateTo);
  const clearFilters = () => {
    patchParams({ magasin_id: null, from: null, to: null });
    setPage(1);
  };

  /** Clic sur la ligne = commodité souris ; le bouton « Session n° » reste le vrai contrôle. */
  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, s: SessionRow) => {
    if ((e.target as HTMLElement).closest('a,button,input,select,textarea,[role="checkbox"]')) return;
    setDetail(s);
  };

  const detailMethodes = detail?.totaux_par_methode ? Object.entries(detail.totaux_par_methode) : [];

  return (
    <PageShell
      title="Historique des caisses"
      backTo="/caisse"
      description="Sessions de caisse clôturées : fonds, espèces comptées et écarts"
    >
      <Card>
        <CardContent inset="standalone" className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_minmax(0,12rem)_minmax(0,12rem)_auto]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hist-magasin">Magasin</Label>
            <Select
              value={magasinId || 'tous'}
              onValueChange={(v) => onFilterChange(setMagasinId)(v === 'tous' ? '' : v)}
            >
              <SelectTrigger id="hist-magasin">
                <SelectValue placeholder="Tous les magasins" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les magasins</SelectItem>
                {magasins.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.code ? `${m.code} — ` : ''}
                    {m.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hist-from">Du</Label>
            <DatePicker id="hist-from" value={dateFrom} onChange={onFilterChange(setDateFrom)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hist-to">Au</Label>
            <DatePicker id="hist-to" value={dateTo} onChange={onFilterChange(setDateTo)} />
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters} className="justify-self-start">
              Effacer les filtres
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="standalone" className="max-md:p-0">
          <QueryState
            loading={loading}
            error={error}
            errorTitle="Impossible de charger l’historique des caisses"
            isEmpty={sessions.length === 0}
            onRetry={() => void load()}
            skeleton={<TableSkeleton rows={8} columns={6} />}
            emptyIcon={History}
            emptyTitle="Aucune session de caisse"
            emptyDescription={
              hasFilters
                ? 'Aucune session ne correspond à ce magasin et à ces dates'
                : 'Les sessions apparaîtront ici après leur clôture, avec les espèces comptées et l’écart'
            }
            emptyAction={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>
                  Effacer les filtres
                </Button>
              ) : undefined
            }
          >
            <ResponsiveTable
              table={
                // Six colonnes : l'écart, raison d'être de la page, tient entier à
                // 1366 px (GV-03). Fonds initial et auteur de la clôture sont dans
                // le détail de la session.
                <Table aria-label="Sessions de caisse clôturées">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session</TableHead>
                      <TableHead>Magasin</TableHead>
                      <TableHead>Période</TableHead>
                      <TableHead numeric>Espèces attendues</TableHead>
                      <TableHead numeric>Espèces comptées</TableHead>
                      <TableHead numeric>Écart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={(e) => onRowClick(e, s)}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setDetail(s)}
                            className="inline-flex min-h-6 items-center whitespace-nowrap rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            n° {s.id}
                            <span className="sr-only"> : voir le détail de la session</span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <MagasinCell session={s} />
                        </TableCell>
                        <TableCell>
                          <Periode session={s} />
                        </TableCell>
                        <TableCell numeric>
                          <Money value={s.expected_cash ?? null} />
                        </TableCell>
                        <TableCell numeric>
                          <Money value={s.fond_final_compte} />
                        </TableCell>
                        <TableCell numeric>
                          <Ecart value={s.ecart} statut={s.statut} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={sessions.map((s) => (
                <DataCard
                  key={s.id}
                  title={`${sessionLabel(s)} · ${s.magasin_code || s.magasin_nom}`}
                  onClick={() => setDetail(s)}
                  linkLabel={`Voir le détail de la session n° ${s.id}`}
                >
                  <DataCardRow label="Ouverture" value={formatDateTime(s.date_ouverture)} />
                  <DataCardRow label="Clôture" value={formatDateTime(s.date_cloture)} />
                  <DataCardRow label="Clôturée par" value={cloturePar(s) || '—'} />
                  <DataCardRow label="Fonds initial" value={<Money value={s.fond_initial} />} numeric />
                  <DataCardRow label="Espèces attendues" value={<Money value={s.expected_cash ?? null} />} numeric />
                  <DataCardRow label="Espèces comptées" value={<Money value={s.fond_final_compte} />} numeric />
                  <DataCardRow label="Écart" value={<Ecart value={s.ecart} statut={s.statut} />} numeric />
                </DataCard>
              ))}
            />
            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={(l) => {
                  setLimit(l);
                  setPage(1);
                }}
              />
            )}
          </QueryState>
        </CardContent>
      </Card>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail ? `${sessionLabel(detail)} — ${detail.magasin_nom}` : 'Session de caisse'}</DialogTitle>
            <DialogDescription>
              {detail?.date_cloture
                ? `Clôturée le ${formatDateTime(detail.date_cloture)}${
                    cloturePar(detail) ? ` par ${cloturePar(detail)}` : ''
                  }`
                : 'Session non clôturée'}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <KeyValueList columns={2}>
                <KeyValue label="Ouverture">{formatDateTime(detail.date_ouverture)}</KeyValue>
                <KeyValue label="Ouverte par">{ouvertPar(detail) || '—'}</KeyValue>
                <KeyValue label="Clôture">{formatDateTime(detail.date_cloture)}</KeyValue>
                <KeyValue label="Clôturée par">{cloturePar(detail) || '—'}</KeyValue>
                <KeyValue label="Fonds initial" numeric>
                  <Money value={detail.fond_initial} />
                </KeyValue>
                <KeyValue label="Espèces attendues" numeric>
                  <Money value={detail.expected_cash ?? null} />
                </KeyValue>
                <KeyValue label="Espèces comptées" numeric>
                  <Money value={detail.fond_final_compte} />
                </KeyValue>
                <KeyValue label="Écart" numeric>
                  <Ecart value={detail.ecart} statut={detail.statut} />
                </KeyValue>
              </KeyValueList>

              {detailMethodes.length > 0 && (
                <section aria-labelledby="hist-par-mode" className="space-y-1">
                  <h3 id="hist-par-mode" className="text-sm font-medium">
                    Par mode de paiement
                  </h3>
                  <div className="rounded-md border">
                    <Table aria-label="Totaux par mode de paiement">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mode de paiement</TableHead>
                          <TableHead numeric>Encaissé</TableHead>
                          <TableHead numeric>Décaissé</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailMethodes.map(([methode, t]) => (
                          <TableRow key={methode}>
                            <TableCell>
                              <Tag hue={paymentMethodHue(methode)}>{formatPaymentMethod(methode)}</Tag>
                            </TableCell>
                            <TableCell numeric>
                              <Money value={t.in} />
                            </TableCell>
                            <TableCell numeric>
                              <Money value={t.out} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {detail.commentaire_ouverture && (
                <div>
                  <p className="text-xs text-muted-foreground">Commentaire d’ouverture</p>
                  <p className="mt-0.5 break-words">{detail.commentaire_ouverture}</p>
                </div>
              )}
              {detail.commentaire_cloture && (
                <div>
                  <p className="text-xs text-muted-foreground">Commentaire de clôture</p>
                  <p className="mt-0.5 break-words">{detail.commentaire_cloture}</p>
                </div>
              )}
              {!detail.commentaire_cloture && toNumber(detail.ecart) !== null && Math.round(toNumber(detail.ecart) ?? 0) !== 0 && (
                <p className="text-xs text-muted-foreground">
                  Écart de {formatCurrency(Math.abs(toNumber(detail.ecart) ?? 0))} sans commentaire
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
