import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { comptabiliteService } from '@/services/api';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { ChoiceGroup } from '@/components/ui/choice-chips';
import { Money } from '@/components/ui/money';
import { Tag } from '@/components/ui/tag';
import { DocumentCode } from '@/components/ui/document-code';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState } from '@/components/ui/query-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate, formatDayMonth, formatSignedCurrency, toNumber } from '@/utils/format';
import {
  CHART_AXIS,
  CHART_GRID,
  CHART_PRIMARY,
  CHART_REST,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
  chartMoneyTick,
} from '@/lib/chartColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type Horizon = '30' | '60' | '90';

const HORIZONS: ReadonlyArray<{ value: Horizon; label: string }> = [
  { value: '30', label: '30 jours' },
  { value: '60', label: '60 jours' },
  { value: '90', label: '90 jours' },
];

/** `GET /comptabilite/tresorerie` — semaines glissantes à partir d'aujourd'hui. */
interface Semaine {
  debut: string;
  fin: string;
  date_debut?: string;
  date_fin?: string;
  encaissements: number | string;
  decaissements: number | string;
  solde: number | string;
}

interface Echeance {
  echeance: string;
  montant: number | string;
  reference: string | null;
  tiers_nom?: string | null;
  description?: string | null;
}

interface TresorerieData {
  echeancier?: Semaine[];
  encaissements?: Echeance[];
  decaissements?: Echeance[];
  depenses?: Echeance[];
  total_encaissements?: number | string;
  total_decaissements?: number | string;
}

interface ChartPoint {
  key: string;
  label: string;
  periode: string;
  encaissements: number;
  /** Négatif : les sorties sont tracées sous l'axe. */
  decaissements: number;
  cumul: number;
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Échéances affichées avant « Afficher les N échéances ». */
const VISIBLE_ECHEANCES = 10;

const SERIES_LABELS: Record<string, string> = {
  encaissements: 'Encaissements',
  decaissements: 'Décaissements',
  cumul: 'Solde net cumulé',
};

function EcheanceList({
  rows,
  emptyTitle,
  emptyDescription,
}: {
  rows: Array<Echeance & { kind?: 'commande' | 'depense' }>;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) {
    return <EmptyState compact icon={CalendarClock} title={emptyTitle} description={emptyDescription} />;
  }
  const visible = showAll ? rows : rows.slice(0, VISIBLE_ECHEANCES);
  return (
    <>
      <ul className="divide-y">
        {visible.map((e, i) => (
        <li key={`${e.reference ?? 'ref'}-${i}`} className="flex items-start justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className="min-w-0 break-words">{e.tiers_nom || e.description || '—'}</span>
              {e.kind && <Tag hue={e.kind === 'commande' ? 6 : 4}>{e.kind === 'commande' ? 'Commande' : 'Dépense'}</Tag>}
            </p>
            <p className="text-xs text-muted-foreground">
              {e.reference && (
                <>
                  <DocumentCode>{e.reference}</DocumentCode> —{' '}
                </>
              )}
              <span className="whitespace-nowrap">échéance : {formatDate(e.echeance)}</span>
            </p>
          </div>
          <Money value={e.montant} className="shrink-0" />
        </li>
        ))}
      </ul>
      {rows.length > VISIBLE_ECHEANCES && (
        <div className="flex justify-center border-t pt-3">
          <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Afficher les ${VISIBLE_ECHEANCES} premières échéances` : `Afficher les ${rows.length} échéances`}
          </Button>
        </div>
      )}
    </>
  );
}

export default function TresoreriePage() {
  const [data, setData] = useState<TresorerieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [horizon, setHorizon] = useState<Horizon>('90');
  const jours = Number(horizon);
  const reduceMotion = useReducedMotion();

  // L'erreur reste dans l'état : sans elle la page afficherait un solde de
  // 0 FCFA indiscernable d'une trésorerie réellement vide.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    comptabiliteService
      .getTresorerie(jours)
      .then((d: TresorerieData) => setData(d))
      .catch((err) => {
        setError(err);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [jours]);

  useEffect(load, [load]);

  const totalEnc = toNumber(data?.total_encaissements);
  const totalDec = toNumber(data?.total_decaissements);
  const solde = totalEnc !== null && totalDec !== null ? totalEnc - totalDec : null;
  const unavailable = !loading && !!error;
  const nbFactures = data?.encaissements?.length ?? 0;

  const points = useMemo<ChartPoint[]>(() => {
    let cumul = 0;
    return (data?.echeancier ?? []).map((s, i) => {
      const enc = toNumber(s.encaissements) ?? 0;
      const dec = toNumber(s.decaissements) ?? 0;
      cumul += enc - dec;
      const debut = s.date_debut ? formatDayMonth(s.date_debut) : s.debut;
      const fin = s.date_fin ? formatDayMonth(s.date_fin) : s.fin;
      return {
        key: s.date_debut ?? String(i),
        label: debut,
        periode: debut === fin ? debut : `${debut} – ${fin}`,
        encaissements: enc,
        decaissements: -dec,
        cumul,
      };
    });
  }, [data]);

  const hasFlows = (totalEnc ?? 0) !== 0 || (totalDec ?? 0) !== 0;
  const weeksHaveData = points.some((p) => p.encaissements !== 0 || p.decaissements !== 0);

  const decaissementsPrevus = useMemo(
    () =>
      [
        ...(data?.decaissements ?? []).map((e) => ({ ...e, kind: 'commande' as const })),
        ...(data?.depenses ?? []).map((e) => ({ ...e, kind: 'depense' as const })),
      ].sort((a, b) => new Date(a.echeance).getTime() - new Date(b.echeance).getTime()),
    [data]
  );

  let chartBody: ReactNode;
  if (loading) {
    chartBody = <Skeleton className="h-[300px] w-full" />;
  } else if (error) {
    chartBody = (
      <QueryErrorState error={error} title="Impossible de charger la trésorerie prévisionnelle" onRetry={load} />
    );
  } else if (!hasFlows) {
    chartBody = (
      <EmptyState
        icon={CalendarClock}
        title="Aucune échéance sur la période"
        description={`Aucune facture à encaisser ni commande ou dépense prévue dans les ${jours} prochains jours`}
      />
    );
  } else if (!weeksHaveData) {
    chartBody = (
      <EmptyState
        icon={CalendarClock}
        title="Échéancier indisponible"
        description="Le détail par semaine n’a pas pu être calculé. Les totaux ci-dessus et les listes ci-dessous restent valables."
      />
    );
  } else {
    // Légende en HTML au-dessus du tracé : celle de recharts, à hauteur fixe,
    // passait sur la courbe à 390 px, et ne savait pas montrer les sorties
    // estompées (même graphite que les entrées, à 45 %).
    chartBody = (
      <>
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm bg-chart-rest" />
            {SERIES_LABELS.encaissements}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm bg-chart-rest/[0.45]" />
            {SERIES_LABELS.decaissements}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full bg-chart-1" />
            {SERIES_LABELS.cumul}
          </li>
        </ul>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
            <ComposedChart accessibilityLayer data={points} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis
                dataKey="label"
                tick={CHART_TICK_STYLE}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis tick={CHART_TICK_STYLE} tickLine={false} axisLine={false} tickFormatter={chartMoneyTick} width={56} />
              <ReferenceLine y={0} stroke={CHART_AXIS} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: CHART_GRID, fillOpacity: 0.4 }}
                labelFormatter={(_label, payload) => {
                  const p = payload?.[0]?.payload as ChartPoint | undefined;
                  return p ? `Semaine du ${p.periode}` : '';
                }}
                formatter={(value, name) => {
                  const n = Number(value);
                  const key = String(name);
                  // Les sorties sont tracées en négatif : l'infobulle donne le montant.
                  const text = key === 'cumul' ? formatSignedCurrency(n) : formatCurrency(Math.abs(n));
                  return [text, SERIES_LABELS[key] ?? key];
                }}
              />
              {/* Flux au repos en graphite (sorties estompées, sous l'axe) ; seule
                  la courbe du solde cumulé est à l'encre. */}
              <Bar
                dataKey="encaissements"
                stackId="flux"
                fill={CHART_REST}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={!reduceMotion}
              />
              <Bar
                dataKey="decaissements"
                stackId="flux"
                fill={CHART_REST}
                fillOpacity={0.45}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={!reduceMotion}
              />
              <Line
                dataKey="cumul"
                type="monotone"
                stroke={CHART_PRIMARY}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))', fill: CHART_PRIMARY }}
                isAnimationActive={!reduceMotion}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  }

  return (
    <PageShell
      title="Trésorerie prévisionnelle"
      description={`Encaissements et décaissements attendus sur les ${jours} prochains jours`}
      toolbar={
        <ChoiceGroup<Horizon>
          label="Période"
          hideLabel
          value={horizon}
          onValueChange={setHorizon}
          options={HORIZONS}
          size="md"
        />
      }
    >
      {/* Le solde répond à la page : en tête et plus large. */}
      <StatGrid className="grid-cols-1 sm:grid-cols-[2fr_1fr_1fr]">
        <StatTile
          label="Solde net prévisionnel"
          size="lg"
          value={solde === null ? undefined : formatSignedCurrency(solde)}
          tone={solde !== null && solde < 0 ? 'danger' : 'default'}
          loading={loading}
          unavailable={unavailable}
          hint={solde !== null && solde < 0 ? 'Trésorerie négative prévue' : 'Encaissements − décaissements'}
        />
        <StatTile
          label="Encaissements prévus"
          format="money"
          value={totalEnc ?? undefined}
          loading={loading}
          unavailable={unavailable}
          hint={`${nbFactures} ${plural(nbFactures, 'facture', 'factures')} à encaisser`}
        />
        <StatTile
          label="Décaissements prévus"
          format="money"
          value={totalDec ?? undefined}
          loading={loading}
          unavailable={unavailable}
          hint="Commandes fournisseur et dépenses"
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>Échéancier par semaine</CardTitle>
          <CardDescription>
            Entrées au-dessus de l’axe, sorties en dessous ; la courbe cumule le solde net semaine après semaine
          </CardDescription>
        </CardHeader>
        <CardContent>{chartBody}</CardContent>
      </Card>

      {!loading && !error && (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Encaissements attendus</CardTitle>
              <CardDescription>Factures clients non soldées, par date d’échéance</CardDescription>
            </CardHeader>
            <CardContent>
              <EcheanceList
                rows={data?.encaissements ?? []}
                emptyTitle="Aucune facture à encaisser sur la période"
                emptyDescription="Les factures non soldées dont l’échéance tombe dans la période apparaîtront ici"
              />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Décaissements prévus</CardTitle>
              <CardDescription>Commandes fournisseur à livrer et dépenses programmées</CardDescription>
            </CardHeader>
            <CardContent>
              <EcheanceList
                rows={decaissementsPrevus}
                emptyTitle="Aucun décaissement prévu sur la période"
                emptyDescription="Les commandes fournisseur et les dépenses datées dans la période apparaîtront ici"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
