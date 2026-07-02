import { useEffect, useMemo, useState, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  factureService,
  produitService,
  commandeService,
  paiementService,
  reportService,
} from '../services/api';
import { StatsDashboard } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  PlusCircle,
  Package,
  Users,
  ArrowRight,
  ShoppingCart,
  Clock,
  CheckCircle2,
  Truck,
  PackageCheck,
  Target,
  Receipt,
  RefreshCw,
  Calendar,
  Activity,
  CreditCard,
  Wallet,
  BadgeCheck,
  ChevronRight,
} from 'lucide-react';
import { DashboardDemandeWidgets } from '../components/DashboardDemandeWidgets';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Line,
  LineChart,
} from 'recharts';
import { formatFCFA as formatXOF } from '../utils/format';
import {
  CHART_COLORS as COLORS,
  CHART_PRIMARY,
  CHART_SECONDARY,
  CHART_GRID,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/lib/chartColors';
const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

type Period = 7 | 30 | 90;

interface RevenuePoint {
  date: string;
  rawDate: string;
  total: number;
  weekday: number;
}

function Progress({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full rounded-full bg-muted overflow-hidden ${className}`}>
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Initials({ name, idx }: { name: string; idx: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <div
      className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white"
      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
    >
      {initials || '?'}
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null || !isFinite(value)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        positive ? 'text-success-600' : 'text-destructive'
      }`}
    >
      <Icon className="h-3 w-3" />
      {positive ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

function AlertBanner({ alerts }: { alerts: { low_stock: any[]; overdue_invoices: any[]; pending_orders: any[] } }) {
  const totalAlerts = alerts.low_stock.length + alerts.overdue_invoices.length + alerts.pending_orders.length;
  if (totalAlerts === 0) return null;

  const chipCls =
    "inline-flex items-center gap-1 rounded-md bg-white dark:bg-warning-500/15 px-2.5 py-1.5 text-warning-700 dark:text-warning-200 hover:bg-warning-100 dark:hover:bg-warning-500/25 transition-colors";

  return (
    <div className="rounded-lg border border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10 p-3 space-y-2 animate-in fade-in-0">
      <div className="flex items-center gap-2 text-warning-800 dark:text-warning-200 font-semibold text-sm">
        <AlertTriangle className="h-4 w-4" />
        Alertes ({totalAlerts})
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {alerts.low_stock.length > 0 && (
          <Link to="/inventaire" className={chipCls}>
            <Package className="h-3.5 w-3.5" />
            Stock faible: {alerts.low_stock.length} produit(s)
          </Link>
        )}
        {alerts.overdue_invoices.length > 0 && (
          <Link to="/factures" className={chipCls}>
            <FileText className="h-3.5 w-3.5" />
            Factures impayées (+30j): {alerts.overdue_invoices.length}
          </Link>
        )}
        {alerts.pending_orders.length > 0 && (
          <Link to="/commandes" className={chipCls}>
            <ShoppingCart className="h-3.5 w-3.5" />
            Commandes en retard: {alerts.pending_orders.length}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>(30);

  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [prevRevenueData, setPrevRevenueData] = useState<RevenuePoint[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [stockByCategory, setStockByCategory] = useState<any[]>([]);
  const [commandeStats, setCommandeStats] = useState<any>(null);
  const [paiementStats, setPaiementStats] = useState<any>(null);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [alertsData, setAlertsData] = useState<{ low_stock: any[]; overdue_invoices: any[]; pending_orders: any[] } | null>(null);
  const [yoyData, setYoyData] = useState<any>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useLayoutEffect(() => {
    const updateWidth = () => setContainerWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const chartHeight = containerWidth < 640 ? 200 : containerWidth < 1024 ? 260 : 300;

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadDashboard = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [
        statsData,
        trendsData,
        topProductsData,
        topClientsData,
        stockCategoryData,
        commandesData,
        paiementsData,
        lowStockData,
        recentInvoicesData,
        alertsResult,
        yoyResult,
        forecastResult,
      ] = await Promise.all([
        factureService.getStats(),
        factureService.getRevenueTrends(period * 2),
        factureService.getTopProducts(5),
        factureService.getTopClients(5),
        produitService.getStockByCategory(),
        commandeService.getStats(),
        paiementService.getStats().catch(() => null),
        produitService
          .getAll(undefined, undefined, true, 1, 5, 'nom', 'asc')
          .catch(() => ({ data: [] })),
        factureService
          .getAll(undefined, undefined, 1, 5, 'date_facture', 'desc')
          .catch(() => ({ data: [] })),
        reportService.getAlerts().catch(() => null),
        reportService.getYoYComparison?.(3) || Promise.resolve(null),
        reportService.getRevenueForecast?.() || Promise.resolve(null),
      ]);

      setAlertsData(alertsResult?.data || null);
      setStats(statsData);

      const formatted: RevenuePoint[] = trendsData.map((item: any) => {
        const d = new Date(item.date);
        return {
          rawDate: item.date,
          date: d.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }),
          total: parseFloat(item.total) || 0,
          weekday: d.getDay(),
        };
      });
      // Split into current vs previous window. With a full 2×period of data, compare
      // the last `period` days against the `period` days before that; otherwise split
      // whatever we have in half.
      if (formatted.length >= period * 2) {
        setRevenueData(formatted.slice(-period));
        setPrevRevenueData(formatted.slice(-period * 2, -period));
      } else {
        const half = Math.ceil(formatted.length / 2);
        setRevenueData(formatted.slice(half));
        setPrevRevenueData(formatted.slice(0, half));
      }

      setTopProducts(
        topProductsData.map((p: any) => ({
          ...p,
          total_ventes: parseFloat(p.total_ventes) || 0,
          total_quantite: parseInt(p.total_quantite) || 0,
        }))
      );

      setTopClients(
        topClientsData.map((c: any) => ({
          ...c,
          total_depenses: parseFloat(c.total_depenses) || 0,
          nombre_factures: parseInt(c.nombre_factures) || 0,
        }))
      );

      setStockByCategory(
        stockCategoryData.map((cat: any) => ({
          ...cat,
          valeur_vente: parseFloat(cat.valeur_vente) || 0,
          valeur_achat: parseFloat(cat.valeur_achat) || 0,
          total_unites: parseInt(cat.total_unites) || 0,
        }))
      );

      setCommandeStats(commandesData);
      setPaiementStats(paiementsData);
      setLowStockProducts(lowStockData?.data || lowStockData || []);
      setRecentInvoices(recentInvoicesData?.data || recentInvoicesData || []);
      setYoyData(yoyResult);
      setForecastData(forecastResult);
    } catch (error) {
      toast.error('Erreur lors du chargement du dashboard');
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const currentCA = useMemo(
    () => revenueData.reduce((s, p) => s + p.total, 0),
    [revenueData]
  );
  const previousCA = useMemo(
    () => prevRevenueData.reduce((s, p) => s + p.total, 0),
    [prevRevenueData]
  );
  const caDelta = useMemo(() => {
    if (previousCA === 0) return null;
    return ((currentCA - previousCA) / previousCA) * 100;
  }, [currentCA, previousCA]);

  const avgDaily = revenueData.length > 0 ? currentCA / revenueData.length : 0;
  const bestDay = useMemo(
    () => revenueData.reduce((b, p) => (p.total > (b?.total || 0) ? p : b), null as RevenuePoint | null),
    [revenueData]
  );

  const panierMoyen = useMemo(() => {
    const c = stats?.factures_mois.count || 0;
    const m = parseFloat((stats?.factures_mois.montant as any) || 0);
    return c > 0 ? m / c : 0;
  }, [stats]);

  // Objectif = CA de la période précédente (ou défaut)
  const objectif = previousCA > 0 ? previousCA : currentCA * 1.1;
  const objectifPct = objectif > 0 ? (currentCA / objectif) * 100 : 0;

  // Weekday breakdown
  const weekdayBreakdown = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, i) => ({
      day: WEEKDAYS[i],
      total: 0,
      count: 0,
    }));
    revenueData.forEach((p) => {
      buckets[p.weekday].total += p.total;
      buckets[p.weekday].count += 1;
    });
    return buckets.map((b) => ({
      day: b.day,
      moyenne: b.count > 0 ? b.total / b.count : 0,
    }));
  }, [revenueData]);

  const maxProduct = topProducts[0]?.total_quantite || 1;
  const maxClient = topClients[0]?.total_depenses || 1;

  // Sparkline series (per KPI)
  const sparkRevenue = revenueData.map((p) => ({ v: p.total }));
  const sparkCountStub = revenueData.map((p, i) => ({ v: (p.total > 0 ? 1 : 0) + (i % 3) }));

  if (loading) {
    return (
      <div className="p-3 sm:p-6 w-full max-w-full">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 w-full max-w-full">
      <div className="mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tableau de Bord</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Vue d'ensemble de votre activité commerciale
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-md border bg-background p-1 text-xs">
              <Calendar className="h-3.5 w-3.5 mx-1.5 text-muted-foreground" />
              {([7, 30, 90] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                    period === p
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p}j
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
            <Link to="/factures/nouvelle">
              <Button className="gap-2">
                <PlusCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Nouvelle Facture</span>
                <span className="sm:hidden">Facture</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Alert Banner */}
        {alertsData && (
          <AlertBanner alerts={alertsData} />
        )}

        {/* KPI Cards w/ sparklines + deltas */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Link to="/reporting" className="block">
            <Card className="hover:shadow-md transition-shadow overflow-hidden cursor-pointer">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    CA {period} derniers jours
                  </p>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">{formatXOF(currentCA)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <Delta value={caDelta} />
                  <span className="text-[10px] text-muted-foreground">vs. période préc.</span>
                </div>
                <div className="-mx-1 -mb-1 mt-2 h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkRevenue}>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke={CHART_PRIMARY}
                        fill={CHART_PRIMARY}
                        fillOpacity={0.2}
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/factures" className="block">
            <Card className="hover:shadow-md transition-shadow overflow-hidden cursor-pointer">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Factures du mois
                  </p>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">
                    {stats?.factures_mois.count || 0}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatXOF(parseFloat((stats?.factures_mois.montant as any) || 0))}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Total: {stats?.total_factures.count || 0} factures
                </p>
                <div className="-mx-1 -mb-1 mt-2 h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkCountStub}>
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke={CHART_PRIMARY}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card className="hover:shadow-md transition-shadow overflow-hidden">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Panier moyen
                </p>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold tracking-tight">{formatXOF(panierMoyen)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Moy. journalière: {formatXOF(avgDaily)}
              </p>
              {bestDay && (
                <p className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <BadgeCheck className="h-3 w-3 text-success-600" />
                  Meilleur jour: <span className="font-semibold">{bestDay.date}</span> ·{' '}
                  {formatXOF(bestDay.total)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow overflow-hidden">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Alertes stock
                </p>
                <AlertTriangle
                  className={`h-4 w-4 ${
                    stats && stats.alertes_stock > 0 ? 'text-destructive' : 'text-success-500'
                  }`}
                />
              </div>
              <div className="mt-2">
                <span
                  className={`text-2xl font-bold tracking-tight ${
                    stats && stats.alertes_stock > 0 ? 'text-destructive' : 'text-success-600'
                  }`}
                >
                  {stats?.alertes_stock || 0}
                </span>
              </div>
              {stats && stats.alertes_stock > 0 ? (
                <Link
                  to="/inventaire?low_stock=true"
                  className="mt-1 text-xs text-destructive hover:underline inline-flex items-center gap-1"
                >
                  Voir les produits <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                <Badge variant="success" className="mt-2">
                  Stock OK
                </Badge>
              )}
              {commandeStats && (
                <p className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {commandeStats.en_attente || 0} commandes en attente
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Forecast */}
        {forecastData && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Prévision mois prochain
              </CardTitle>
              <CardDescription className="text-xs">Moyenne mobile sur 3 mois</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Prévision</p>
                  <p className="text-lg font-bold mt-1">{formatXOF(forecastData.forecast?.prevision)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Min estimé</p>
                  <p className="text-lg font-bold mt-1 text-warning-600">{formatXOF(forecastData.forecast?.min)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Max estimé</p>
                  <p className="text-lg font-bold mt-1 text-success-600">{formatXOF(forecastData.forecast?.max)}</p>
                </div>
              </div>
              {forecastData.historique?.length > 1 && (
                <div className="mt-3">
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={[
                      ...forecastData.historique.map((h: any) => ({ mois: h.mois?.slice(5,7) || '', value: parseFloat(h.chiffre_affaires) || 0 })),
                      { mois: 'Prévi', value: forecastData.forecast?.prevision || 0 },
                    ]}>
                      <Area type="monotone" dataKey="value" stroke={CHART_PRIMARY} fill={CHART_PRIMARY} fillOpacity={0.2} strokeWidth={2} />
                      <Tooltip formatter={(v: any) => formatXOF(v)} contentStyle={CHART_TOOLTIP_STYLE} />
                      <XAxis dataKey="mois" tick={{ fontSize: 10, fill: CHART_AXIS }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Objectif + Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Objectif {period}j
              </CardTitle>
              <CardDescription className="text-xs">
                Cible: période précédente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold">{objectifPct.toFixed(0)}%</span>
                <span className="text-xs text-muted-foreground">
                  {formatXOF(currentCA)} / {formatXOF(objectif)}
                </span>
              </div>
              <Progress value={objectifPct} />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>0</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              {objectifPct >= 100 ? (
                <Badge variant="success" className="w-full justify-center py-1">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Objectif atteint
                </Badge>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Reste à réaliser:{' '}
                  <span className="font-semibold text-foreground">
                    {formatXOF(Math.max(0, objectif - currentCA))}
                  </span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Pipeline commandes
              </CardTitle>
              <CardDescription className="text-xs">
                Flux des commandes par statut
              </CardDescription>
            </CardHeader>
            <CardContent>
              {commandeStats ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'En attente',
                      count: commandeStats.en_attente || 0,
                      Icon: Clock,
                      color: 'text-warning-600 dark:text-warning-200',
                      bg: 'bg-warning-50 dark:bg-warning-500/10',
                    },
                    {
                      label: 'Validées',
                      count: commandeStats.validee || 0,
                      Icon: CheckCircle2,
                      color: 'text-blue-600 dark:text-blue-300',
                      bg: 'bg-blue-50 dark:bg-blue-500/10',
                    },
                    {
                      label: 'Expédiées',
                      count: commandeStats.expediee || 0,
                      Icon: Truck,
                      color: 'text-indigo-600 dark:text-indigo-300',
                      bg: 'bg-indigo-50 dark:bg-indigo-500/10',
                    },
                    {
                      label: 'Livrées',
                      count: commandeStats.livree || 0,
                      Icon: PackageCheck,
                      color: 'text-success-600 dark:text-success-300',
                      bg: 'bg-success-50 dark:bg-success-500/10',
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className={`rounded-lg border p-3 ${s.bg} flex flex-col gap-1`}
                    >
                      <div className="flex items-center justify-between">
                        <s.Icon className={`h-4 w-4 ${s.color}`} />
                        <span className={`text-xl font-bold ${s.color}`}>{s.count}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune donnée.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Demande workflow widgets */}
        <DashboardDemandeWidgets />

        {/* Revenue chart */}
        {revenueData.length === 0 && (
          <Card>
            <CardContent>
              <EmptyState icon={TrendingUp} title="Aucune vente" description="Aucun chiffre d'affaires sur la période sélectionnée." />
            </CardContent>
          </Card>
        )}
        {revenueData.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Chiffre d'affaires — {period} derniers jours
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Total: {formatXOF(currentCA)} · Moy/jour: {formatXOF(avgDaily)}
                  </CardDescription>
                </div>
                <Delta value={caDelta} />
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_AXIS }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: CHART_AXIS }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(value: any) => formatXOF(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke={CHART_PRIMARY}
                    strokeWidth={2}
                    fill="url(#caGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* YoY Comparison */}
        {yoyData && yoyData.current_year?.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Comparaison Année sur Année
              </CardTitle>
              <CardDescription className="text-xs">
                Variation: {yoyData.variation_pct > 0 ? '+' : ''}{yoyData.variation_pct?.toFixed(1)}% vs. année précédente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={yoyData.current_year.map((c: any, i: number) => ({
                  mois: c.mois_nom?.trim().slice(0, 3) || '',
                  current: parseFloat(c.chiffre_affaires) || 0,
                  previous: parseFloat(yoyData.previous_year?.[i]?.chiffre_affaires || 0),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                  <XAxis dataKey="mois" tick={{ fontSize: 11, fill: CHART_AXIS }} />
                  <YAxis tick={{ fontSize: 11, fill: CHART_AXIS }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatXOF(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                  <Bar dataKey="current" fill={CHART_PRIMARY} name="Cette année" radius={[4,4,0,0]} />
                  <Bar dataKey="previous" fill={CHART_SECONDARY} name="Année préc." radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top products & top clients — ranked list w/ progress */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-primary" />
                Top 5 Produits
              </CardTitle>
              <CardDescription className="text-xs">
                Classement par quantité vendue
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topProducts.length > 0 ? (
                <div className="space-y-3">
                  {topProducts.map((p, i) => {
                    const pct = (p.total_quantite / maxProduct) * 100;
                    return (
                      <div key={p.id || i} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">
                              {i + 1}
                            </span>
                            <span className="text-sm font-medium truncate">{p.nom}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold">{p.total_quantite} u.</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatXOF(p.total_ventes)}
                            </p>
                          </div>
                        </div>
                        <Progress value={pct} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mb-2" />
                  <p className="text-sm">Aucune vente enregistrée</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Top 5 Clients
              </CardTitle>
              <CardDescription className="text-xs">
                Classement par montant dépensé
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topClients.length > 0 ? (
                <div className="space-y-3">
                  {topClients.map((c, i) => {
                    const pct = (c.total_depenses / maxClient) * 100;
                    return (
                      <div key={c.id || i} className="flex items-center gap-3">
                        <Initials name={c.nom || '?'} idx={i} />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">{c.nom}</span>
                            <span className="text-sm font-semibold shrink-0">
                              {formatXOF(c.total_depenses)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <Progress value={pct} className="flex-1" />
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {c.nombre_factures} fact.
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Users className="h-10 w-10 mb-2" />
                  <p className="text-sm">Aucun client avec achats</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stock category + Weekday performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {stockByCategory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4 text-primary" />
                  Valorisation par catégorie
                </CardTitle>
                <CardDescription className="text-xs">
                  Répartition de la valeur d'inventaire
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={chartHeight * 0.75}>
                  <PieChart>
                    <Pie
                      data={stockByCategory}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                      dataKey="valeur_vente"
                    >
                      {stockByCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatXOF(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {stockByCategory.slice(0, 5).map((cat, index) => (
                    <div
                      key={cat.categorie}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="truncate font-medium">{cat.categorie}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-semibold">{formatXOF(cat.valeur_vente)}</span>
                        <span className="text-muted-foreground ml-2">
                          {cat.total_unites} u.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-primary" />
                Performance par jour de semaine
              </CardTitle>
              <CardDescription className="text-xs">
                CA moyen par jour (période courante)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={chartHeight * 0.75}>
                <BarChart data={weekdayBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: CHART_AXIS }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: CHART_AXIS }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(value: any) => formatXOF(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                  <Bar dataKey="moyenne" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Low stock list + Recent invoices */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Produits en alerte stock
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Stock sous le seuil minimum
                  </CardDescription>
                </div>
                <Link to="/inventaire?low_stock=true">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    Tout voir
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {lowStockProducts.length > 0 ? (
                <ScrollArea className="max-h-[260px] pr-2">
                  <div className="space-y-2">
                    {lowStockProducts.map((p: any) => {
                      const qte = parseInt(p.quantite_stock ?? p.stock ?? 0);
                      const seuil = parseInt(p.seuil_alerte ?? p.stock_min ?? 10);
                      const pct = seuil > 0 ? Math.min(100, (qte / seuil) * 100) : 0;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-lg border p-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.nom}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <Progress value={pct} className="flex-1" />
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {qte}/{seuil}
                              </span>
                            </div>
                          </div>
                          <Badge
                            variant={qte === 0 ? 'destructive' : 'warning'}
                            className="shrink-0"
                          >
                            {qte === 0 ? 'Rupture' : 'Bas'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mb-2 text-success-500" />
                  <p className="text-sm">Aucun produit en alerte</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Receipt className="h-4 w-4 text-primary" />
                    Factures récentes
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Dernières factures émises
                  </CardDescription>
                </div>
                <Link to="/factures">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    Tout voir
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentInvoices.length > 0 ? (
                <div className="space-y-1">
                  {recentInvoices.slice(0, 5).map((f: any, i: number) => {
                    const statut = (f.statut || 'brouillon').toLowerCase();
                    const variant: any =
                      statut === 'payee' || statut === 'payée'
                        ? 'success'
                        : statut === 'annulee' || statut === 'annulée'
                        ? 'destructive'
                        : 'warning';
                    return (
                      <Link
                        key={f.id || i}
                        to={`/factures/${f.id}`}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted/60 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">
                              {f.numero_facture || `#${f.id}`}
                            </span>
                            <Badge variant={variant} className="text-[10px] py-0">
                              {statut}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {f.client_nom || f.nom_client || 'Client'} ·{' '}
                            {f.date_facture
                              ? new Date(f.date_facture).toLocaleDateString('fr-FR')
                              : ''}
                          </p>
                        </div>
                        <span className="text-sm font-semibold shrink-0">
                          {formatXOF(parseFloat(f.total_ttc || f.montant || 0))}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mb-2" />
                  <p className="text-sm">Aucune facture récente</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Méthodes de paiement (si dispo) */}
        {paiementStats && Array.isArray(paiementStats.par_methode) && paiementStats.par_methode.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-primary" />
                Répartition par méthode de paiement
              </CardTitle>
              <CardDescription className="text-xs">
                Encaissements par moyen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {paiementStats.par_methode.map((m: any, i: number) => (
                  <div
                    key={m.methode || i}
                    className="rounded-lg border p-3 bg-muted/30"
                  >
                    <div className="flex items-center justify-between">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs uppercase font-medium text-muted-foreground">
                        {m.methode}
                      </span>
                    </div>
                    <p className="mt-2 text-lg font-bold">
                      {formatXOF(parseFloat(m.total || 0))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{m.count || 0} ops</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Navigation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Navigation rapide</CardTitle>
            <CardDescription className="text-xs">
              Accès direct aux sections principales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { to: '/inventaire', label: 'Stock', Icon: Package },
                { to: '/tiers', label: 'Contacts', Icon: Users },
                { to: '/factures', label: 'Factures', Icon: FileText },
                { to: '/commandes', label: 'Commandes', Icon: ShoppingCart },
                { to: '/caisse', label: 'Caisse', Icon: Wallet },
                { to: '/devis', label: 'Devis', Icon: Receipt },
              ].map((n) => (
                <Link key={n.to} to={n.to}>
                  <div className="group rounded-lg border-2 p-4 transition-colors hover:border-primary/50 hover:bg-muted/40 cursor-pointer">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="p-2.5 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <n.Icon className="h-5 w-5 text-primary" />
                      </div>
                      <p className="text-sm font-semibold">{n.label}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Separator />
        <p className="text-center text-[11px] text-muted-foreground py-2">
          Mis à jour {new Date().toLocaleString('fr-FR')}
        </p>
      </div>
    </div>
  );
}
