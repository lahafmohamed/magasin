import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, Search } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { reportService, stockLocationService } from '@/services/api';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { Pagination } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataCard, DataCardRow, ResponsiveTable } from '@/components/ui/responsive-table';
import { QueryErrorState, QueryState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { getErrorMessage } from '@/utils/errors';
import { downloadCsv } from '@/utils/csv';
import { formatCurrency, formatNumber, formatPercent, toNumber } from '@/utils/format';
import { RECEIVABLE_BUCKETS, type ReceivableBucket, type ReceivableRow } from '@/utils/receivables';
import {
  CHART_GRID,
  CHART_PRIMARY,
  CHART_REST,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
  chartMoneyTick,
  chartMoneyTooltip,
  chartPercentTooltip,
  maxIndex,
} from '@/lib/chartColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type Num = number | string | null | undefined;

interface DashboardKpis {
  revenue_mois?: { total?: Num; count?: Num };
  marge_mois?: { marge_brute?: Num; marge_pourcentage?: Num };
  creances?: { total?: Num; count?: Num };
  valeur_stock?: { valeur?: Num };
  alertes_stock?: Num;
}

interface Pnl {
  chiffre_affaires: Num;
  cout_ventes: Num;
  marge_brute: Num;
  marge_pourcentage: Num;
  nombre_factures?: Num;
}

interface CategorySales {
  categorie: string | null;
  chiffre_affaires: Num;
}

interface ProductPerformance {
  id?: number;
  produit_id?: number;
  nom: string;
  unites_vendues?: Num;
  chiffre_affaires?: Num;
  cout_ventes?: Num;
  marge_brute: Num;
  marge_pourcentage?: Num;
}

interface MarginsReport {
  monthly_trend?: Array<{ mois: string; chiffre_affaires: Num; marge_brute: Num }>;
  top_categories?: Array<{ categorie: string | null; marge_pourcentage: Num }>;
  top_tiers?: Array<{ tiers_id: number; nom: string; prenom?: string | null; chiffre_affaires: Num; marge_brute: Num; marge_pourcentage: Num }>;
  top_products?: ProductPerformance[];
}

interface PeriodData {
  pnl: Pnl | null;
  categories: CategorySales[];
  products: ProductPerformance[];
  margins: MarginsReport | null;
}

interface ReceivableLocation {
  id: number;
  code: string;
  nom: string;
  actif?: boolean;
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const n = (v: Num) => toNumber(v) ?? 0;

/** Date locale « AAAA-MM-JJ » (toISOString décalerait vers UTC). */
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const LEGEND_FORMATTER = (value: string) => <span className="text-xs text-foreground">{value}</span>;

/** Hauteur d'un graphique en barres horizontales : 36 px par barre + axes. */
const barsHeight = (count: number) => Math.max(200, count * 36 + 48);

/**
 * Classement en liste (le second bloc d'une paire, jamais un deuxième
 * graphique de même taille) : nom · valeur · barre fine. Le premier — la
 * valeur la plus forte, la liste est triée — porte l'accent ; les autres
 * restent en graphite. La barre est décorative, la valeur est écrite.
 */
function RankedBars({
  items,
  label,
  renderValue,
}: {
  items: Array<{ key: string; name: string; value: number }>;
  label: string;
  renderValue: (value: number) => ReactNode;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <ol className="space-y-3" aria-label={label}>
      {items.map((item, i) => {
        const width = max > 0 ? (Math.max(0, item.value) / max) * 100 : 0;
        return (
          <li
            key={item.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]"
          >
            <span className="min-w-0 truncate" title={item.name}>
              {item.name}
            </span>
            <span className="text-right md:col-start-3 md:row-start-1">{renderValue(item.value)}</span>
            <span
              aria-hidden="true"
              className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted md:col-span-1 md:col-start-2 md:row-start-1"
            >
              <span
                className={i === 0 ? 'block h-full rounded-full bg-chart-1' : 'block h-full rounded-full bg-chart-rest'}
                style={{ width: `${width}%` }}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Tranche d'ancienneté vide : cellule blanche (le lecteur d'écran entend « 0 FCFA »), pas une colonne de « 0 FCFA ». */
function AgingAmount({ value, tone }: { value: Num; tone: 'neutral' | 'warning' | 'danger' }) {
  if (n(value) === 0) return <span className="sr-only">0 FCFA</span>;
  return <Money value={value} tone={tone} />;
}

/** Même tranche vide sur une carte mobile : un tiret estompé, l'étiquette ne reste pas orpheline. */
function AgingCardAmount({ value, tone }: { value: Num; tone: 'neutral' | 'warning' | 'danger' }) {
  if (n(value) === 0) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">0 FCFA</span>
      </span>
    );
  }
  return <Money value={value} tone={tone} />;
}

export default function Reporting() {
  const reduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<'general' | 'margins'>('general');

  // Indicateurs du mois en cours (indépendants de la période choisie)
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<unknown>(null);

  // Données de la période
  const today = new Date();
  const [dateDebut, setDateDebut] = useState(() => isoLocal(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateFin, setDateFin] = useState(() => isoLocal(today));
  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [periodError, setPeriodError] = useState<unknown>(null);
  const periodReq = useRef(0);

  // Créances clients (situation actuelle)
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [receivableSearch, setReceivableSearch] = useState('');
  const [receivableMinAmount, setReceivableMinAmount] = useState('');
  const [receivableBucket, setReceivableBucket] = useState<ReceivableBucket>('all');
  const [receivableLocationId, setReceivableLocationId] = useState('all');
  const [receivablePage, setReceivablePage] = useState(1);
  const [receivableLimit, setReceivableLimit] = useState(20);
  const [receivableTotal, setReceivableTotal] = useState(0);
  const [receivableTotalPages, setReceivableTotalPages] = useState(1);
  const [receivableTotalAmount, setReceivableTotalAmount] = useState<number | null>(null);
  const [receivableLocations, setReceivableLocations] = useState<ReceivableLocation[]>([]);
  const [receivablesLoading, setReceivablesLoading] = useState(true);
  const [receivablesError, setReceivablesError] = useState<unknown>(null);
  const [exportingReceivables, setExportingReceivables] = useState(false);
  const receivablesReq = useRef(0);

  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    setKpisError(null);
    try {
      setKpis((await reportService.getDashboard()) as DashboardKpis | null);
    } catch (err) {
      setKpis(null);
      setKpisError(err);
    } finally {
      setKpisLoading(false);
    }
  }, []);

  const loadPeriod = useCallback(async () => {
    const req = ++periodReq.current;
    setPeriodLoading(true);
    setPeriodError(null);
    const params = { date_debut: dateDebut, date_fin: dateFin };
    try {
      const [pnl, categories, products, margins] = await Promise.all([
        reportService.getPnl(params),
        reportService.getSalesByCategory(params),
        reportService.getProductPerformance({ ...params, limit: 10 }),
        reportService.getMargins(params),
      ]);
      if (req !== periodReq.current) return; // dates modifiées entre-temps
      setPeriod({
        pnl: (pnl ?? null) as Pnl | null,
        categories: asArray<CategorySales>(categories),
        products: asArray<ProductPerformance>(products),
        margins: (margins ?? null) as MarginsReport | null,
      });
    } catch (err) {
      if (req !== periodReq.current) return;
      setPeriod(null);
      setPeriodError(err);
    } finally {
      if (req === periodReq.current) setPeriodLoading(false);
    }
  }, [dateDebut, dateFin]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  useEffect(() => {
    stockLocationService
      .getAll()
      .then((data: unknown) =>
        setReceivableLocations(asArray<ReceivableLocation>(data).filter((l) => l.actif !== false))
      )
      .catch(() => setReceivableLocations([]));
  }, []);

  useEffect(() => {
    setReceivablePage(1);
  }, [receivableSearch, receivableMinAmount, receivableBucket, receivableLocationId, receivableLimit]);

  useEffect(() => {
    if (receivablePage > receivableTotalPages) setReceivablePage(receivableTotalPages);
  }, [receivablePage, receivableTotalPages]);

  const receivableQueryParams = useCallback(
    (includePage = true) => {
      const params: {
        search: string;
        min_amount: number;
        bucket: string;
        location_id?: number;
        page?: number;
        limit?: number;
      } = {
        search: receivableSearch.trim(),
        min_amount: Math.max(0, Number(receivableMinAmount) || 0),
        bucket: receivableBucket,
      };
      if (receivableLocationId !== 'all') params.location_id = Number(receivableLocationId);
      if (includePage) {
        params.page = receivablePage;
        params.limit = receivableLimit;
      }
      return params;
    },
    [receivableSearch, receivableMinAmount, receivableBucket, receivableLocationId, receivablePage, receivableLimit]
  );

  const fetchReceivables = useCallback(async () => {
    const req = ++receivablesReq.current;
    setReceivablesLoading(true);
    setReceivablesError(null);
    try {
      const page = await reportService.getReceivables(receivableQueryParams());
      if (req !== receivablesReq.current) return;
      setReceivables(asArray<ReceivableRow>(page?.data));
      setReceivableTotal(Number(page?.pagination?.total || 0));
      setReceivableTotalPages(Math.max(1, Number(page?.pagination?.totalPages || 1)));
      setReceivableTotalAmount(toNumber(page?.summary?.montant_total ?? null));
    } catch (err) {
      if (req !== receivablesReq.current) return;
      setReceivablesError(err);
      setReceivables([]);
      setReceivableTotal(0);
      setReceivableTotalPages(1);
      setReceivableTotalAmount(null);
    } finally {
      if (req === receivablesReq.current) setReceivablesLoading(false);
    }
  }, [receivableQueryParams]);

  useEffect(() => {
    const debounceMs = receivableSearch.trim() ? 300 : 0;
    const timeoutId = window.setTimeout(() => {
      void fetchReceivables();
    }, debounceMs);
    return () => window.clearTimeout(timeoutId);
  }, [fetchReceivables, receivableSearch]);

  const exportReceivables = async () => {
    setExportingReceivables(true);
    try {
      // `truncated` signale un export plafonné par le serveur.
      const body = await reportService.exportReceivables(receivableQueryParams(false));
      const rows = asArray<ReceivableRow>(body.data);
      downloadCsv(
        `creances_clients_${isoLocal(new Date())}.csv`,
        ['Client', 'Total dû', 'Moins de 30 jours', '30 à 60 jours', 'Plus de 60 jours'],
        rows.map((client) => [
          `${client.nom || ''} ${client.prenom || ''}`.trim(),
          String(client.total_du),
          String(client.moins_30_jours),
          String(client.entre_30_60_jours),
          String(client.plus_60_jours),
        ])
      );
      if (body.truncated) {
        toast.warning(`Export limité aux ${formatNumber(rows.length)} premières créances : affinez les filtres pour tout exporter.`);
      } else {
        toast.success(`Fichier CSV téléchargé : ${formatNumber(rows.length)} ${rows.length > 1 ? 'créances' : 'créance'}`);
      }
    } catch (exportError) {
      toast.error(getErrorMessage(exportError, 'Impossible d’exporter les créances. Réessayez.'));
    } finally {
      setExportingReceivables(false);
    }
  };

  // ===== Données des graphiques =====
  const categoryData = useMemo(
    () =>
      (period?.categories ?? [])
        .map((c) => ({ name: c.categorie || 'Sans catégorie', value: n(c.chiffre_affaires) }))
        .sort((a, b) => b.value - a.value),
    [period]
  );

  const topProductData = useMemo(
    () =>
      (period?.products ?? [])
        .map((p, i) => ({
          key: String(p.produit_id ?? p.id ?? `${p.nom}-${i}`),
          name: p.nom,
          value: n(p.marge_brute),
        }))
        .sort((a, b) => b.value - a.value),
    [period]
  );

  const monthlyData = useMemo(
    () =>
      (period?.margins?.monthly_trend ?? []).map((m) => ({
        mois: new Date(m.mois).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        ca: n(m.chiffre_affaires),
        marge: n(m.marge_brute),
      })),
    [period]
  );

  const categoryMarginData = useMemo(
    () =>
      (period?.margins?.top_categories ?? [])
        .map((c) => ({ name: c.categorie || 'Sans catégorie', value: n(c.marge_pourcentage) }))
        .sort((a, b) => b.value - a.value),
    [period]
  );

  // ===== Rendu =====
  const kpisUnavailable = !kpisLoading && !!kpisError;
  const factures = n(kpis?.revenue_mois?.count);
  const impayees = n(kpis?.creances?.count);
  const tauxMarge = toNumber(kpis?.marge_mois?.marge_pourcentage);

  const periodBlock = (content: () => ReactNode) => {
    if (periodLoading && !period) {
      return (
        // Même empilement que le contenu : un graphique pleine largeur, puis une liste.
        <div className="space-y-4 sm:space-y-6" aria-busy="true">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      );
    }
    if (periodError) {
      return (
        <Card>
          <QueryErrorState
            error={periodError}
            title="Impossible de charger les rapports de la période"
            onRetry={() => void loadPeriod()}
          />
        </Card>
      );
    }
    return content();
  };

  /** Barres horizontales : graphite, la plus forte à l'encre (une seule valeur mise en avant). */
  const horizontalBars = (
    data: Array<{ name: string; value: number; full?: string }>,
    options: { label: string; percent?: boolean }
  ) => {
    const best = maxIndex(data, (d) => d.value);
    return (
      <div style={{ height: barsHeight(data.length) }} className="w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
          <BarChart accessibilityLayer layout="vertical" data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={CHART_GRID} />
            <XAxis
              type="number"
              tick={CHART_TICK_STYLE}
              tickLine={false}
              axisLine={false}
              tickFormatter={options.percent ? (v: number) => formatPercent(v) : chartMoneyTick}
            />
            <YAxis type="category" dataKey="name" width={150} tick={CHART_TICK_STYLE} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: CHART_GRID, fillOpacity: 0.4 }}
              labelFormatter={(label, payload) => {
                const full = (payload?.[0]?.payload as { full?: string } | undefined)?.full;
                return full ?? String(label);
              }}
              formatter={(value) => [
                options.percent ? chartPercentTooltip(value) : chartMoneyTooltip(value),
                options.label,
              ]}
            />
            <Bar
              dataKey="value"
              name={options.label}
              fill={CHART_REST}
              maxBarSize={24}
              radius={[0, 4, 4, 0]}
              isAnimationActive={!reduceMotion}
            >
              {data.map((d, i) => (
                <Cell key={d.full ?? d.name} fill={i === best ? CHART_PRIMARY : CHART_REST} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const receivableTableBody = () => {
    if (receivablesLoading) return <TableSkeleton rows={5} columns={5} />;
    if (receivablesError) {
      return (
        <QueryErrorState
          error={receivablesError}
          title="Impossible de charger les créances"
          onRetry={() => void fetchReceivables()}
        />
      );
    }
    if (receivables.length === 0) {
      return (
        <EmptyState
          title="Aucune créance client"
          description="Aucun client débiteur ne correspond aux filtres appliqués"
        />
      );
    }
    const clientName = (c: ReceivableRow) => `${c.nom ?? ''} ${c.prenom ?? ''}`.trim() || '—';
    return (
      <>
        <ResponsiveTable
          table={
            <Table aria-label="Créances clients par ancienneté">
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead numeric>Total dû</TableHead>
                  <TableHead numeric>Moins de 30 jours</TableHead>
                  <TableHead numeric>30 à 60 jours</TableHead>
                  <TableHead numeric>Plus de 60 jours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivables.map((client) => (
                  <TableRow key={client.client_id}>
                    <TableCell className="font-medium">{clientName(client)}</TableCell>
                    <TableCell numeric>
                      <Money value={client.total_du} />
                    </TableCell>
                    <TableCell numeric>
                      <AgingAmount value={client.moins_30_jours} tone="neutral" />
                    </TableCell>
                    <TableCell numeric>
                      <AgingAmount value={client.entre_30_60_jours} tone="warning" />
                    </TableCell>
                    <TableCell numeric>
                      <AgingAmount value={client.plus_60_jours} tone="danger" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
          cards={receivables.map((client) => (
            <DataCard key={client.client_id} title={clientName(client)} badge={<Money value={client.total_du} />}>
              <DataCardRow
                label="Moins de 30 jours"
                value={<AgingCardAmount value={client.moins_30_jours} tone="neutral" />}
                numeric
              />
              <DataCardRow
                label="30 à 60 jours"
                value={<AgingCardAmount value={client.entre_30_60_jours} tone="warning" />}
                numeric
              />
              <DataCardRow
                label="Plus de 60 jours"
                value={<AgingCardAmount value={client.plus_60_jours} tone="danger" />}
                numeric
              />
            </DataCard>
          ))}
        />
        <Pagination
          page={receivablePage}
          totalPages={receivableTotalPages}
          total={receivableTotal}
          limit={receivableLimit}
          onPageChange={setReceivablePage}
          onLimitChange={setReceivableLimit}
        />
      </>
    );
  };

  return (
    <PageShell
      title="Rapports et analyses"
      description="Chiffre d’affaires, marges, créances clients et stock"
    >
      <section aria-labelledby="rapports-mois" className="space-y-2">
        <h2 id="rapports-mois" className="text-sm font-medium text-muted-foreground">
          Mois en cours
        </h2>
        <StatGrid>
          <StatTile
            label="Chiffre d’affaires"
            format="money"
            value={toNumber(kpis?.revenue_mois?.total ?? null) ?? undefined}
            loading={kpisLoading}
            unavailable={kpisUnavailable}
            hint={`${formatNumber(factures)} ${factures > 1 ? 'factures' : 'facture'}`}
          />
          <StatTile
            label="Marge brute"
            format="money"
            value={toNumber(kpis?.marge_mois?.marge_brute ?? null) ?? undefined}
            loading={kpisLoading}
            unavailable={kpisUnavailable}
            hint={tauxMarge !== null ? `Taux de marge : ${formatPercent(tauxMarge, 1)}` : undefined}
          />
          <StatTile
            label="Créances clients"
            format="money"
            value={toNumber(kpis?.creances?.total ?? null) ?? undefined}
            loading={kpisLoading}
            unavailable={kpisUnavailable}
            hint={`${formatNumber(impayees)} ${impayees > 1 ? 'factures impayées' : 'facture impayée'}`}
          />
          <StatTile
            label="Valeur du stock"
            format="money"
            value={toNumber(kpis?.valeur_stock?.valeur ?? null) ?? undefined}
            loading={kpisLoading}
            unavailable={kpisUnavailable}
          />
          <StatTile
            label="Produits en stock bas"
            value={toNumber(kpis?.alertes_stock ?? null) ?? undefined}
            tone="warning"
            loading={kpisLoading}
            unavailable={kpisUnavailable}
            hint="Sous leur stock minimum"
          />
        </StatGrid>
      </section>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'general' | 'margins')}>
        {/* La période vit dans la rangée des onglets qu'elle délimite (onglets à
            gauche, dates à droite ; dessous sur téléphone) : plus de carte posée
            au-dessus. Ce qu'elle délimite reste dit au lecteur d'écran. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4 md:border-b">
          <TabsList className="md:border-b-0">
            <TabsTrigger value="general">Vue générale</TabsTrigger>
            <TabsTrigger value="margins">Marges et rentabilité</TabsTrigger>
          </TabsList>
          <div
            role="group"
            aria-label="Période du compte de résultat, des ventes et des marges"
            className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-4 md:pb-1"
          >
            <div className="flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-2">
              <Label htmlFor="rapport-du">Du</Label>
              <DatePicker id="rapport-du" value={dateDebut} onChange={setDateDebut} className="w-full md:w-40" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-2">
              <Label htmlFor="rapport-au">Au</Label>
              <DatePicker id="rapport-au" value={dateFin} onChange={setDateFin} className="w-full md:w-40" />
            </div>
          </div>
        </div>

        <TabsContent value="general" className="mt-4 space-y-4 sm:space-y-6">
          {periodBlock(() => (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Compte de résultat</CardTitle>
                  <CardDescription>Ventes facturées sur la période, hors avoirs</CardDescription>
                </CardHeader>
                <CardContent>
                  {period?.pnl ? (
                    <KeyValueList columns={2} className="lg:grid-cols-4">
                      <KeyValue label="Chiffre d’affaires" numeric>
                        <Money value={period.pnl.chiffre_affaires} emphasis />
                      </KeyValue>
                      <KeyValue label="Coût des ventes" numeric>
                        <Money value={period.pnl.cout_ventes} emphasis />
                      </KeyValue>
                      <KeyValue label="Marge brute" numeric>
                        <Money value={period.pnl.marge_brute} tone="auto" emphasis />
                      </KeyValue>
                      <KeyValue label="Taux de marge" numeric>
                        {formatPercent(n(period.pnl.marge_pourcentage), 1)}
                      </KeyValue>
                    </KeyValueList>
                  ) : (
                    <EmptyState compact title="Compte de résultat indisponible" description="Aucune donnée pour cette période" />
                  )}
                </CardContent>
              </Card>

              {/* Un graphique principal pleine largeur ; le classement des produits
                  devient une liste, jamais deux graphiques de même taille côte à côte. */}
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Ventes par catégorie</CardTitle>
                  <CardDescription>
                    Chiffre d’affaires de la période, de la plus forte à la plus faible
                    {categoryData.length > 0 && categoryData[0].value > 0 ? ` · en tête : ${categoryData[0].name}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {categoryData.length > 0 ? (
                    horizontalBars(categoryData, { label: 'Chiffre d’affaires' })
                  ) : (
                    <EmptyState
                      compact
                      title="Aucune vente sur la période"
                      description="Aucune catégorie n’a enregistré de vente entre ces deux dates"
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Produits les plus rentables</CardTitle>
                  <CardDescription>Les 10 produits à la plus forte marge brute sur la période</CardDescription>
                </CardHeader>
                <CardContent>
                  {topProductData.length > 0 ? (
                    <RankedBars
                      label="Produits les plus rentables, par marge brute"
                      items={topProductData}
                      renderValue={(v) => <Money value={v} tone="auto" />}
                    />
                  ) : (
                    <EmptyState
                      compact
                      title="Aucun produit vendu sur la période"
                      description="Aucune marge produit à classer entre ces deux dates"
                    />
                  )}
                </CardContent>
              </Card>
            </>
          ))}

          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:px-0">
              <CardTitle>Créances clients par ancienneté</CardTitle>
              <CardDescription>
                Situation actuelle, du solde le plus élevé au plus faible
                {!receivablesLoading && !receivablesError && receivableTotalAmount !== null
                  ? ` · ${formatNumber(receivableTotal)} ${receivableTotal > 1 ? 'clients' : 'client'} · ${formatCurrency(receivableTotalAmount)}`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-md:p-0">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_10rem_12rem_15rem_auto] xl:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="creances-recherche">Client</Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="creances-recherche"
                      type="search"
                      value={receivableSearch}
                      onChange={(event) => setReceivableSearch(event.target.value)}
                      placeholder="Rechercher un client"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="creances-min">Solde minimum (FCFA)</Label>
                  <Input
                    id="creances-min"
                    type="text"
                    inputMode="numeric"
                    value={receivableMinAmount}
                    onChange={(event) => setReceivableMinAmount(event.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    className="text-right tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="creances-anciennete">Ancienneté</Label>
                  <Select value={receivableBucket} onValueChange={(value) => setReceivableBucket(value as ReceivableBucket)}>
                    <SelectTrigger id="creances-anciennete">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECEIVABLE_BUCKETS.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="creances-emplacement">Emplacement</Label>
                  <Select value={receivableLocationId} onValueChange={setReceivableLocationId}>
                    <SelectTrigger id="creances-emplacement">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les emplacements</SelectItem>
                      {receivableLocations.map((location) => (
                        <SelectItem key={location.id} value={String(location.id)}>
                          {location.nom} ({location.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void exportReceivables()}
                  disabled={receivableTotal === 0 || exportingReceivables}
                >
                  {exportingReceivables ? <Spinner className="mr-2" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Exporter en CSV
                </Button>
              </div>
              {receivableTableBody()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="margins" className="mt-4 space-y-4 sm:space-y-6">
          {periodBlock(() => {
            const margins = period?.margins;
            const topTiers = (margins?.top_tiers ?? []).slice(0, 5);
            const topProducts = margins?.top_products ?? [];
            return (
              <>
                {/* Le graphique mensuel pleine largeur ; les taux par catégorie en
                    liste classée en dessous. La marge est la série à l'encre, le
                    chiffre d'affaires sert de repère en graphite. */}
                <Card className="min-w-0">
                  <CardHeader>
                    <CardTitle>Évolution mensuelle des marges</CardTitle>
                    <CardDescription>Chiffre d’affaires et marge brute par mois de la période</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {monthlyData.length > 0 ? (
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                          <BarChart
                            accessibilityLayer
                            data={monthlyData}
                            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                            // Peu de mois : largeur fixe, les deux barres d'un mois restent côte
                            // à côte (avec `maxBarSize` seul, un mois unique les écartait d'un
                            // bord à l'autre). Au-delà, la largeur suit la place disponible.
                            barSize={monthlyData.length <= 3 ? 24 : undefined}
                            barGap={4}
                          >
                            <CartesianGrid vertical={false} stroke={CHART_GRID} />
                            <XAxis dataKey="mois" tick={CHART_TICK_STYLE} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                            <YAxis tick={CHART_TICK_STYLE} tickLine={false} axisLine={false} tickFormatter={chartMoneyTick} width={56} />
                            <Tooltip
                              contentStyle={CHART_TOOLTIP_STYLE}
                              cursor={{ fill: CHART_GRID, fillOpacity: 0.4 }}
                              formatter={(value, name) => [chartMoneyTooltip(value), String(name)]}
                            />
                            <Legend verticalAlign="top" height={32} iconSize={10} formatter={LEGEND_FORMATTER} />
                            <Bar
                              dataKey="ca"
                              name="Chiffre d’affaires"
                              fill={CHART_REST}
                              maxBarSize={24}
                              radius={[4, 4, 0, 0]}
                              isAnimationActive={!reduceMotion}
                            />
                            <Bar
                              dataKey="marge"
                              name="Marge brute"
                              fill={CHART_PRIMARY}
                              maxBarSize={24}
                              radius={[4, 4, 0, 0]}
                              isAnimationActive={!reduceMotion}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <EmptyState
                        compact
                        title="Aucune marge mensuelle"
                        description="Aucune vente enregistrée sur les mois de la période"
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className="min-w-0">
                  <CardHeader>
                    <CardTitle>Taux de marge par catégorie</CardTitle>
                    <CardDescription>Marge brute rapportée au chiffre d’affaires de chaque catégorie</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {categoryMarginData.length > 0 ? (
                      <RankedBars
                        label="Taux de marge par catégorie"
                        items={categoryMarginData.map((c, i) => ({ key: `${c.name}-${i}`, name: c.name, value: c.value }))}
                        renderValue={(v) => <span className="tabular-nums">{formatPercent(v, 1)}</span>}
                      />
                    ) : (
                      <EmptyState
                        compact
                        title="Aucune catégorie vendue"
                        description="Aucun taux de marge calculable sur la période"
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Le tableau de rentabilité prend toute la largeur sous 1536 px : sur deux
                    tiers de colonne, il débordait à 1366 et 1440 px et cachait le taux de
                    marge (GV-05). */}
                <div className="grid gap-4 sm:gap-6 2xl:grid-cols-3">
                  <Card className="min-w-0 2xl:col-span-1">
                    <CardHeader>
                      <CardTitle>Clients les plus rentables</CardTitle>
                      <CardDescription>Les 5 plus fortes marges brutes de la période</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {topTiers.length > 0 ? (
                        <ol className="divide-y">
                          {topTiers.map((t) => (
                            <li key={t.tiers_id} className="flex items-start justify-between gap-3 py-2.5">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-medium">
                                  {t.nom} {t.prenom || ''}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Chiffre d’affaires : <Money value={t.chiffre_affaires} />
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm">
                                  <Money value={t.marge_brute} />
                                </p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                  Marge : {formatPercent(n(t.marge_pourcentage), 1)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <EmptyState
                          compact
                          title="Aucun client facturé"
                          description="Aucun client n’a généré de marge sur la période"
                        />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="min-w-0 max-md:border-0 max-md:bg-transparent max-md:shadow-none 2xl:col-span-2">
                    <CardHeader className="max-md:px-0">
                      <CardTitle>Rentabilité par produit</CardTitle>
                    </CardHeader>
                    <CardContent className="max-md:p-0">
                      <QueryState
                        loading={false}
                        isEmpty={topProducts.length === 0}
                        skeleton={null}
                        emptyTitle="Aucun produit vendu sur la période"
                        emptyDescription="Aucune rentabilité produit à afficher entre ces deux dates"
                      >
                        <ResponsiveTable
                          table={
                            // Le coût se déduit du chiffre d'affaires et de la marge : il
                            // cède sa place sous 1280 px pour que la marge et son taux
                            // restent visibles.
                            <Table aria-label="Rentabilité par produit">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Produit</TableHead>
                                  <TableHead numeric>Qté</TableHead>
                                  <TableHead numeric>Chiffre d’affaires</TableHead>
                                  <TableHead numeric className="hidden xl:table-cell">
                                    Coût
                                  </TableHead>
                                  <TableHead numeric>Marge</TableHead>
                                  <TableHead numeric>Taux de marge</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {topProducts.map((p) => (
                                  <TableRow key={p.produit_id ?? p.id ?? p.nom}>
                                    <TableCell
                                      className="max-w-[12rem] truncate font-medium xl:max-w-[16rem]"
                                      title={p.nom}
                                    >
                                      {p.nom}
                                    </TableCell>
                                    <TableCell numeric>{formatNumber(n(p.unites_vendues))}</TableCell>
                                    <TableCell numeric>
                                      <Money value={p.chiffre_affaires} />
                                    </TableCell>
                                    <TableCell numeric className="hidden xl:table-cell">
                                      <Money value={p.cout_ventes} />
                                    </TableCell>
                                    <TableCell numeric>
                                      <Money value={p.marge_brute} tone="auto" />
                                    </TableCell>
                                    <TableCell numeric>{formatPercent(n(p.marge_pourcentage), 1)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          }
                          cards={topProducts.map((p) => (
                            <DataCard key={p.produit_id ?? p.id ?? p.nom} title={p.nom}>
                              <DataCardRow label="Quantité vendue" value={formatNumber(n(p.unites_vendues))} numeric />
                              <DataCardRow label="Chiffre d’affaires" value={<Money value={p.chiffre_affaires} />} numeric />
                              <DataCardRow
                                label="Marge"
                                value={<Money value={p.marge_brute} tone="auto" />}
                                numeric
                              />
                              <DataCardRow
                                label="Taux de marge"
                                value={formatPercent(n(p.marge_pourcentage), 1)}
                                numeric
                              />
                            </DataCard>
                          ))}
                        />
                      </QueryState>
                    </CardContent>
                  </Card>
                </div>
              </>
            );
          })}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
