import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { caisseService } from '@/services/api';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tag } from '@/components/ui/tag';
import { Money } from '@/components/ui/money';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataCard, DataCardRow, ResponsiveTable } from '@/components/ui/responsive-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { readDateParam, useSearchParamsPatch } from '@/hooks/useUrlState';
import { formatDate, formatNumber, toNumber } from '@/utils/format';
import { formatPaymentMethod, paymentMethodHue } from '@/utils/paymentMethod';

/** Plafond de lignes renvoyées par `/caisse/audit` (le serveur ne pagine pas). */
const AUDIT_LIMIT = 500;

const SOURCE_KINDS = [
  { value: '', label: 'Tous les types' },
  { value: 'paiement', label: 'Paiements' },
  { value: 'acompte_client', label: 'Acomptes clients' },
  { value: 'acompte_fournisseur', label: 'Acomptes fournisseurs' },
];

const KIND_LABELS: Record<string, string> = {
  paiement: 'Paiement',
  acompte_client: 'Acompte client',
  acompte_fournisseur: 'Acompte fournisseur',
};

/** Libellés des tuiles (pluriel). */
const KIND_TILE_LABELS: Record<string, string> = {
  paiement: 'Paiements',
  acompte_client: 'Acomptes clients',
  acompte_fournisseur: 'Acomptes fournisseurs',
};

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');

interface AuditItem {
  source_kind: string;
  source_id: number;
  source_date: string | null;
  tiers_id: number | null;
  /** Nom du client ou du fournisseur (P-M4 / B-02) ; absent sur un ancien serveur. */
  tiers_nom?: string | null;
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

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/**
 * Paiement en espèces sans mouvement : « Hors caisse ». Avec un mouvement :
 * « Rapproché ». Carte, virement, mobile money sans mouvement : rien à
 * rapprocher, ils n'entrent jamais dans le tiroir — le cas courant, dit en
 * texte estompé plutôt qu'en pastille.
 */
function StatutBadge({ item }: { item: AuditItem }) {
  if (item.is_orphan) {
    return (
      <Badge variant="destructive" icon={AlertTriangle}>
        Hors caisse
      </Badge>
    );
  }
  if (item.mouvement_caisse_id) {
    return (
      <Badge variant="success" icon={CheckCircle2}>
        Rapproché
      </Badge>
    );
  }
  return <span className="whitespace-nowrap text-sm text-muted-foreground">Hors espèces</span>;
}

export default function CaisseAudit() {
  const canOpen = useRouteAccess();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [summary, setSummary] = useState<AuditSummary[]>([]);
  /** `null` tant que le décompte n'est pas chargé : jamais « 0 » par défaut. */
  const [orphansTotal, setOrphansTotal] = useState<number | null>(null);
  // Filtres portés par l'adresse : le tableau de bord ouvre
  // `/caisse/audit?orphans_only=true` (« paiements en espèces hors caisse »).
  const [params] = useSearchParams();
  const patchParams = useSearchParamsPatch();
  const orphansOnly = params.get('orphans_only') === 'true';
  const kindParam = params.get('source_kind') ?? '';
  const sourceKind = SOURCE_KINDS.some((k) => k.value === kindParam) ? kindParam : '';
  const dateFrom = readDateParam(params, 'date_from');
  const dateTo = readDateParam(params, 'date_to');
  const setOrphansOnly = (on: boolean) => patchParams({ orphans_only: on ? 'true' : null });
  const setSourceKind = (kind: string) => patchParams({ source_kind: kind });
  const setDateFrom = (date: string) => patchParams({ date_from: date });
  const setDateTo = (date: string) => patchParams({ date_to: date });
  // Identifiant de requête : un changement rapide de filtres ne laisse jamais
  // une réponse obsolète écraser la plus récente.
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const body = await caisseService.getAudit({
        limit: AUDIT_LIMIT,
        orphans_only: orphansOnly || undefined,
        source_kind: sourceKind || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      if (reqId !== reqIdRef.current) return;
      setItems(body.data as AuditItem[]);
      setSummary(body.summary as AuditSummary[]);
      setOrphansTotal(body.orphans_total);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err);
      setItems([]);
      setSummary([]);
      setOrphansTotal(null);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [orphansOnly, sourceKind, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasFilters = !!(dateFrom || dateTo || sourceKind || orphansOnly);
  const clearFilters = () => patchParams({ date_from: null, date_to: null, source_kind: null, orphans_only: null });

  const summaryUnavailable = !loading && !!error;
  const canOpenContact = canOpen('/tiers');

  const tiersCell = (it: AuditItem) => {
    if (!it.tiers_id) return <span className="text-muted-foreground">—</span>;
    const label = it.tiers_nom?.trim() || `Contact n° ${it.tiers_id}`;
    return canOpenContact ? (
      <Link
        to={`/tiers/${it.tiers_id}`}
        className="inline-flex min-h-6 items-center rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </Link>
    ) : (
      label
    );
  };

  const refCell = (id: number | null) =>
    id ? <span className="whitespace-nowrap">n° {id}</span> : <span className="text-muted-foreground">—</span>;

  /**
   * GV-50 : session et mouvement dans une seule cellule « Caisse », sur deux
   * lignes courtes — deux colonnes faisaient sortir « Statut » du cadre à
   * 1 366 et 1 440 px.
   */
  const caisseCell = (it: AuditItem) => {
    if (!it.session_caisse_id && !it.mouvement_caisse_id) return <span className="text-muted-foreground">—</span>;
    return (
      <>
        {it.session_caisse_id && <span className="block whitespace-nowrap">Session n° {it.session_caisse_id}</span>}
        {it.mouvement_caisse_id && (
          <span className="block whitespace-nowrap text-xs text-muted-foreground">Mouvement n° {it.mouvement_caisse_id}</span>
        )}
      </>
    );
  };

  const orphanCount = orphansTotal ?? 0;
  const kinds = Array.from(new Set([...Object.keys(KIND_TILE_LABELS), ...summary.map((s) => s.source_kind)]));

  return (
    <PageShell
      title="Audit caisse"
      description={'Chaque paiement en espèces doit avoir son mouvement de caisse : ceux qui n’en ont pas sont «\u00A0hors caisse\u00A0»'}
    >
      <section aria-labelledby="audit-kpis" className="space-y-2">
        <h2 id="audit-kpis" className="sr-only">
          Indicateurs
        </h2>
        <StatGrid>
          <StatTile
            label="Paiements en espèces hors caisse"
            value={orphansTotal ?? undefined}
            tone="danger"
            loading={loading && orphansTotal === null}
            unavailable={summaryUnavailable}
            hint={
              orphansTotal === null
                ? undefined
                : orphanCount > 0
                  ? 'Sans mouvement de caisse : signalez-les à votre administrateur'
                  : 'Tous les paiements en espèces sont rapprochés'
            }
          />
          {kinds.map((kind) => {
            // Un type absent du récapitulatif chargé n'a aucune opération : zéro réel.
            const s = summary.find((x) => x.source_kind === kind);
            const total = toNumber(s?.total) ?? 0;
            const orphans = toNumber(s?.orphans) ?? 0;
            return (
              <StatTile
                key={kind}
                label={KIND_TILE_LABELS[kind] ?? kindLabel(kind)}
                format="money"
                value={s ? (toNumber(s.total_montant) ?? undefined) : 0}
                loading={loading && orphansTotal === null}
                unavailable={summaryUnavailable}
                hint={`${formatNumber(total)} ${plural(total, 'opération', 'opérations')}${
                  orphans > 0 ? ` · ${formatNumber(orphans)} hors caisse` : ''
                }`}
              />
            );
          })}
        </StatGrid>
        <p className="text-xs text-muted-foreground">
          Totaux sur l’ensemble des opérations enregistrées, sans tenir compte des filtres
        </p>
      </section>

      <Card>
        <CardContent inset="standalone" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-type">Type</Label>
            <Select value={sourceKind || '__all'} onValueChange={(v) => setSourceKind(v === '__all' ? '' : v)}>
              <SelectTrigger id="audit-type" className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_KINDS.map((k) => (
                  <SelectItem key={k.value || '__all'} value={k.value === '' ? '__all' : k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-du">Du</Label>
            <DatePicker id="audit-du" value={dateFrom} onChange={setDateFrom} className="w-full sm:w-44" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-au">Au</Label>
            <DatePicker id="audit-au" value={dateTo} onChange={setDateTo} className="w-full sm:w-44" />
          </div>
          <label htmlFor="audit-hors-caisse" className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="audit-hors-caisse"
              checked={orphansOnly}
              onChange={(e) => setOrphansOnly(e.target.checked)}
            />
            Hors caisse uniquement
          </label>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              Effacer les filtres
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opérations en espèces et acomptes</CardTitle>
          <CardDescription>
            {loading || error
              ? 'Les plus récentes en premier'
              : items.length >= AUDIT_LIMIT
                ? `Les ${formatNumber(AUDIT_LIMIT)} plus récentes : précisez les dates pour voir les autres`
                : `${formatNumber(items.length)} ${plural(items.length, 'opération', 'opérations')}, les plus récentes en premier`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            loading={loading}
            error={error}
            errorTitle="Impossible de charger l’audit de caisse"
            isEmpty={items.length === 0}
            onRetry={() => void load()}
            skeleton={<TableSkeleton rows={8} columns={7} />}
            emptyIcon={ShieldCheck}
            emptyTitle={hasFilters ? 'Aucun paiement à contrôler' : 'Aucun paiement en espèces à contrôler'}
            emptyDescription={
              hasFilters
                ? 'Aucun paiement ne correspond aux filtres sélectionnés'
                : 'Les paiements et acomptes enregistrés apparaîtront ici avec leur mouvement de caisse'
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
                <Table aria-label="Opérations en espèces et acomptes">
                  {/*
                   * GV-50 : le verdict (« Statut ») suit directement le montant, pour
                   * ne jamais être la colonne coupée ; le numéro passe sous le type,
                   * session et mouvement partagent la cellule « Caisse », et le nom
                   * du client passe à la ligne plutôt que d'élargir le tableau.
                   */}
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Client ou fournisseur</TableHead>
                      <TableHead>Mode de paiement</TableHead>
                      <TableHead numeric>Montant</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Caisse</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={`${it.source_kind}-${it.source_id}`} className={it.is_orphan ? 'bg-danger-50' : undefined}>
                        <TableCell className="whitespace-nowrap">{formatDate(it.source_date)}</TableCell>
                        <TableCell>
                          <span className="block whitespace-nowrap text-sm">{kindLabel(it.source_kind)}</span>
                          <span className="mt-0.5 block whitespace-nowrap text-xs text-muted-foreground">
                            n° {it.source_id}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[8rem] max-w-[14rem] break-words">{tiersCell(it)}</div>
                        </TableCell>
                        <TableCell>
                          <Tag hue={paymentMethodHue(it.methode_paiement)}>{formatPaymentMethod(it.methode_paiement)}</Tag>
                        </TableCell>
                        <TableCell numeric>
                          <Money value={it.montant} />
                        </TableCell>
                        <TableCell>
                          <StatutBadge item={it} />
                        </TableCell>
                        <TableCell>{caisseCell(it)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={items.map((it) => (
                <DataCard
                  key={`${it.source_kind}-${it.source_id}`}
                  title={`${kindLabel(it.source_kind)} n° ${it.source_id}`}
                  badge={<StatutBadge item={it} />}
                  className={it.is_orphan ? 'border-danger-200 bg-danger-50' : undefined}
                >
                  <DataCardRow label="Date" value={formatDate(it.source_date)} />
                  <DataCardRow label="Client ou fournisseur" value={tiersCell(it)} />
                  <DataCardRow
                    label="Mode de paiement"
                    value={<Tag hue={paymentMethodHue(it.methode_paiement)}>{formatPaymentMethod(it.methode_paiement)}</Tag>}
                  />
                  <DataCardRow label="Montant" value={<Money value={it.montant} />} numeric />
                  <DataCardRow label="Session" value={refCell(it.session_caisse_id)} />
                  <DataCardRow label="Mouvement de caisse" value={refCell(it.mouvement_caisse_id)} />
                </DataCard>
              ))}
            />
          </QueryState>
        </CardContent>
      </Card>
    </PageShell>
  );
}
