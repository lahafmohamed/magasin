import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { factureService } from '../services/api';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { useMediaQuery } from '@/components/useMediaQuery';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/ui/page-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Money } from '@/components/ui/money';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { getErrorMessage } from '@/utils/errors';
import { formatNumber, formatPercent, toNumber } from '@/utils/format';
import { downloadCsv } from '../utils/csv';
import {
  CHART_GRID,
  CHART_PRIMARY,
  CHART_REST,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
  chartMoneyTick,
  chartMoneyTooltip,
  maxIndex,
} from '@/lib/chartColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** Ligne de `GET /factures/top-clients` (factures non annulées, tous exercices). */
interface TopClientApi {
  id?: number | null;
  nom: string | null;
  prenom: string | null;
  nombre_factures: number | string | null;
  total_depenses: number | string | null;
}

interface TopClient {
  id: number | null;
  nom: string;
  nombreFactures: number;
  chiffreAffaires: number;
}

interface Slice {
  name: string;
  value: number;
}

const TOP_LIMIT = 10;
/** Parts nommées dans la barre de répartition ; les suivantes sont regroupées. */
const SHARE_NAMED = 7;

/**
 * Teinte d'un segment de la barre de répartition : le premier client à
 * l'encre, les suivants en graphite de plus en plus clair (des marches
 * neutres, pas huit couleurs qui redisent le classement).
 */
const SHARE_STEPS = [
  'bg-chart-1',
  'bg-chart-rest',
  'bg-chart-rest/[0.8]',
  'bg-chart-rest/[0.65]',
  'bg-chart-rest/[0.5]',
  'bg-chart-rest/[0.4]',
  'bg-chart-rest/[0.3]',
  'bg-chart-rest/[0.2]',
];
const shareStep = (i: number) => SHARE_STEPS[Math.min(i, SHARE_STEPS.length - 1)];

/**
 * Graduation de l'axe des noms sur une seule ligne (le rendu par défaut de
 * recharts coupait « TRAORÉ / Mariama » sur deux lignes).
 */
function NameTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={CHART_TICK_STYLE.fontSize} fill={CHART_TICK_STYLE.fill}>
      {payload?.value ?? ''}
    </text>
  );
}

/** Nom court pour un axe : `max` caractères puis « … » (jamais trois points). */
function shortName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

export default function ClientAnalytics() {
  const canOpen = useRouteAccess();
  const [clients, setClients] = useState<TopClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const reduceMotion = useReducedMotion();
  // Dès 768 px le graphique a la place d'écrire les noms (28 caractères, axe de
  // 180 px) ; 14 caractères seulement sur téléphone.
  const wideChart = useMediaQuery('(min-width: 768px)');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = (await factureService.getTopClients(TOP_LIMIT)) as TopClientApi[];
      setClients(
        (Array.isArray(rows) ? rows : []).map((c) => ({
          id: c.id ?? null,
          nom: `${c.nom ?? ''} ${c.prenom ?? ''}`.trim() || 'Client sans nom',
          nombreFactures: Math.round(toNumber(c.nombre_factures) ?? 0),
          chiffreAffaires: toNumber(c.total_depenses) ?? 0,
        }))
      );
    } catch (err) {
      // Erreur gardée en état : jamais de tuiles à 0 sur un échec.
      setError(err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const count = clients.length;
  const totalRevenue = clients.reduce((sum, c) => sum + c.chiffreAffaires, 0);
  const avgPerClient = count > 0 ? totalRevenue / count : 0;

  // Répartition : les 7 premiers clients + le reste des clients classés, pour
  // que les parts se lisent sur le même total que la tuile « Chiffre d'affaires
  // clients ».
  const slices: Slice[] = clients.slice(0, SHARE_NAMED).map((c) => ({ name: c.nom, value: c.chiffreAffaires }));
  const rest = clients.slice(SHARE_NAMED);
  if (rest.length > 0) {
    slices.push({
      name: rest.length > 1 ? `${rest.length} autres clients classés` : '1 autre client classé',
      value: rest.reduce((s, c) => s + c.chiffreAffaires, 0),
    });
  }
  const share = (value: number) => (totalRevenue > 0 ? (value / totalRevenue) * 100 : 0);

  const barData = clients.map((c) => ({ ...c, label: shortName(c.nom, wideChart ? 28 : 14) }));
  const leader = maxIndex(barData, (c) => c.chiffreAffaires);

  const exportToCSV = () => {
    downloadCsv(
      'meilleurs-clients.csv',
      ['Rang', 'Client', 'Nombre de factures', 'Total acheté (FCFA)'],
      clients.map((c, i) => [i + 1, c.nom, c.nombreFactures, Math.round(c.chiffreAffaires)])
    );
    toast.success('Fichier CSV téléchargé');
  };

  const handleExport = () => {
    try {
      exportToCSV();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’exporter en CSV. Réessayez.'));
    }
  };

  return (
    <PageShell
      title="Analyse clients"
      description="Qui achète le plus, et combien, sur toutes les factures"
      actions={
        <>
          {canOpen('/tiers') && (
            <Link to="/tiers" className={buttonVariants({ variant: 'outline', size: 'touch' })}>
              Gérer les contacts
            </Link>
          )}
          <Button variant="outline" size="touch" onClick={handleExport} className="gap-2" disabled={loading || count === 0}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter en CSV
          </Button>
        </>
      }
    >
      <QueryState
        loading={loading}
        error={error}
        isEmpty={count === 0}
        onRetry={() => void loadAnalytics()}
        errorTitle="Impossible de charger l’analyse clients"
        emptyIcon={BarChart3}
        emptyTitle="Aucune vente à analyser"
        emptyDescription="Le classement apparaîtra après vos premières factures client"
        skeleton={
          <div className="space-y-4 sm:space-y-6">
            <StatGrid>
              <StatTile label="Chiffre d’affaires clients" size="lg" loading />
              <StatTile label="Moyenne par client" loading />
            </StatGrid>
            <Card>
              <CardContent inset="standalone">
                <Skeleton className="h-72 w-full" />
              </CardContent>
            </Card>
          </div>
        }
      >
        <div className="space-y-4 sm:space-y-6">
          {/* Pas de tuile « Meilleurs clients : 10 » : elle comptait la liste, pas une mesure. */}
          <StatGrid>
            <StatTile
              label="Chiffre d’affaires clients"
              size="lg"
              value={totalRevenue}
              format="money"
              hint={count > 1 ? `Cumul des ${formatNumber(count)} clients classés` : 'Client classé'}
            />
            <StatTile
              label="Moyenne par client"
              value={avgPerClient}
              format="money"
              hint="Chiffre d’affaires moyen par client"
            />
          </StatGrid>

          {/* Classement en barres horizontales : les noms restent lisibles à 390 px. */}
          <Card>
            <CardHeader>
              <CardTitle>{count > 1 ? `${formatNumber(count)} meilleurs clients par chiffre d’affaires` : 'Meilleur client par chiffre d’affaires'}</CardTitle>
              <CardDescription>
                Montant facturé à chaque client, factures annulées exclues
                {leader >= 0 ? ` — en tête : ${barData[leader].nom}` : ''}. Les montants exacts sont dans le
                classement détaillé.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Décoratif pour les lecteurs d'écran : le classement détaillé porte les mêmes chiffres. */}
              <div aria-hidden="true">
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(160, barData.length * 36 + 40)}
                  minWidth={0}
                  initialDimension={{ width: 1, height: 1 }}
                >
                  <BarChart
                    data={barData}
                    layout="vertical"
                    accessibilityLayer={false}
                    margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={CHART_TICK_STYLE}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={chartMoneyTick}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={<NameTick />}
                      tickLine={false}
                      axisLine={false}
                      width={wideChart ? 180 : 112}
                      interval={0}
                    />
                    <Tooltip
                      formatter={chartMoneyTooltip}
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.nom ?? ''}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }}
                    />
                    {/* Graphite, le premier client à l'encre (nommé dans la description). */}
                    <Bar
                      dataKey="chiffreAffaires"
                      name="Chiffre d’affaires"
                      fill={CHART_REST}
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={!reduceMotion}
                    >
                      {barData.map((c, i) => (
                        <Cell key={`${c.id ?? c.nom}-${i}`} fill={i === leader ? CHART_PRIMARY : CHART_REST} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-2">
            {/* Répartition : une seule barre empilée (le premier client à l'encre,
                les autres en marches de graphite) + la légende chiffrée. L'anneau à
                huit couleurs redisait le classement sans rien ajouter. */}
            <Card>
              <CardHeader>
                <CardTitle>Répartition du chiffre d’affaires</CardTitle>
                <CardDescription>
                  Part de chaque client dans le chiffre d’affaires des {formatNumber(count)} clients classés
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  role="img"
                  aria-label={
                    slices.length > 0
                      ? `Barre de répartition : ${slices[0].name} pèse ${formatPercent(share(slices[0].value))} du chiffre d’affaires des clients classés`
                      : 'Barre de répartition vide'
                  }
                  className="flex h-4 w-full overflow-hidden rounded-full bg-muted"
                >
                  {slices.map((s, i) => (
                    <span
                      key={s.name}
                      className={cn('h-full shrink-0', shareStep(i), i > 0 && 'border-l-2 border-card')}
                      style={{ width: `${share(s.value)}%` }}
                    />
                  ))}
                </div>
                <ul className="grid gap-1.5 text-sm" aria-label="Part de chaque client">
                  {slices.map((s, i) => (
                    <li key={s.name} className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', shareStep(i))} />
                      <span className="min-w-0 flex-1 truncate" title={s.name}>
                        {s.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{formatPercent(share(s.value))}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Classement détaillé */}
            <Card>
              <CardHeader>
                <CardTitle>Classement détaillé</CardTitle>
                <CardDescription>Factures et chiffre d’affaires par client</CardDescription>
              </CardHeader>
              <CardContent inset="flush">
                <ResponsiveTable
                  table={
                    <Table aria-label="Classement détaillé des clients">
                      <TableHeader>
                        <TableRow>
                          <TableHead numeric className="w-12">
                            Rang
                          </TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead numeric>Factures</TableHead>
                          <TableHead numeric>Chiffre d’affaires</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clients.map((client, index) => (
                          <TableRow key={`${client.id ?? client.nom}-${index}`}>
                            <TableCell numeric className="text-muted-foreground">
                              {index + 1}
                            </TableCell>
                            <TableCell className="font-medium">
                              {client.id && canOpen('/tiers') ? (
                                <Link to={`/tiers/${client.id}`} className="underline-offset-4 hover:underline">
                                  {client.nom}
                                </Link>
                              ) : (
                                client.nom
                              )}
                            </TableCell>
                            <TableCell numeric>{formatNumber(client.nombreFactures)}</TableCell>
                            <TableCell numeric>
                              <Money value={client.chiffreAffaires} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  }
                  cards={
                    <ol aria-label="Classement détaillé des clients" className="divide-y border-t">
                      {clients.map((client, index) => (
                        <li key={`${client.id ?? client.nom}-${index}`} className="flex items-center gap-3 px-4 py-3">
                          <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium" title={client.nom}>
                              {client.id && canOpen('/tiers') ? (
                                <Link to={`/tiers/${client.id}`} className="underline-offset-4 hover:underline">
                                  {client.nom}
                                </Link>
                              ) : (
                                client.nom
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(client.nombreFactures)} {client.nombreFactures > 1 ? 'factures' : 'facture'}
                            </p>
                          </div>
                          <Money value={client.chiffreAffaires} className="shrink-0" />
                        </li>
                      ))}
                    </ol>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </QueryState>
    </PageShell>
  );
}
