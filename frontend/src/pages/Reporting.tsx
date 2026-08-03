import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Search } from 'lucide-react';
import { api } from '../services/authService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { formatCurrency } from '../utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoading, Spinner } from '@/components/ui/loading';
import { getErrorMessage } from '@/utils/errors';
import { downloadCsv } from '@/utils/csv';
import {
  ReceivableBucket,
  ReceivableRow,
} from '@/utils/receivables';
import {
  CHART_COLORS as COLORS,
  CHART_PRIMARY,
  CHART_POSITIVE,
  chartColor,
  CHART_GRID,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/lib/chartColors';

const TABLE_HEAD = 'px-3 py-2 font-medium';

interface ReceivableLocation {
  id: number;
  code: string;
  nom: string;
}

export default function Reporting() {
  const [activeTab, setActiveTab] = useState<'general' | 'margins'>('general');
  const [kpis, setKpis] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [salesByCategory, setSalesByCategory] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [receivableSearch, setReceivableSearch] = useState('');
  const [receivableMinAmount, setReceivableMinAmount] = useState('');
  const [receivableBucket, setReceivableBucket] = useState<ReceivableBucket>('all');
  const [receivableLocationId, setReceivableLocationId] = useState('all');
  const [receivablePage, setReceivablePage] = useState(1);
  const [receivableLimit, setReceivableLimit] = useState(20);
  const [receivableTotal, setReceivableTotal] = useState(0);
  const [receivableTotalPages, setReceivableTotalPages] = useState(1);
  const [receivableTotalAmount, setReceivableTotalAmount] = useState(0);
  const [receivableLocations, setReceivableLocations] = useState<ReceivableLocation[]>([]);
  const [receivablesLoading, setReceivablesLoading] = useState(true);
  const [receivablesError, setReceivablesError] = useState<unknown>(null);
  const [exportingReceivables, setExportingReceivables] = useState(false);
  const [marginsReport, setMarginsReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  /** Identifiant de requête pour ignorer les réponses obsolètes (changements rapides de dates). */
  const reqIdRef = useRef(0);
  const receivablesReqIdRef = useRef(0);

  const today = new Date();
  const [dateDebut, setDateDebut] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(today.toISOString().split('T')[0]);

  useEffect(() => {
    setReceivablePage(1);
  }, [receivableSearch, receivableMinAmount, receivableBucket, receivableLocationId, receivableLimit]);

  useEffect(() => {
    if (receivablePage > receivableTotalPages) setReceivablePage(receivableTotalPages);
  }, [receivablePage, receivableTotalPages]);

  useEffect(() => {
    fetchAllData();
  }, [dateDebut, dateFin]);

  useEffect(() => {
    api.get('/stock-locations', { params: { actif: true } })
      .then((response) => setReceivableLocations(response.data.data || []))
      .catch(() => setReceivableLocations([]));
  }, []);

  const receivableQueryParams = useCallback((includePage = true) => {
    const params: Record<string, string | number> = {
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
  }, [
    receivableSearch,
    receivableMinAmount,
    receivableBucket,
    receivableLocationId,
    receivablePage,
    receivableLimit,
  ]);

  const fetchReceivables = useCallback(async () => {
    const requestId = ++receivablesReqIdRef.current;
    setReceivablesLoading(true);
    setReceivablesError(null);

    try {
      const response = await api.get('/reports/receivables', {
        params: receivableQueryParams(),
      });
      if (requestId !== receivablesReqIdRef.current) return;

      setReceivables(response.data.data || []);
      setReceivableTotal(Number(response.data.pagination?.total || 0));
      setReceivableTotalPages(Math.max(1, Number(response.data.pagination?.totalPages || 1)));
      setReceivableTotalAmount(Number(response.data.summary?.montant_total || 0));
    } catch (requestError) {
      if (requestId !== receivablesReqIdRef.current) return;
      setReceivablesError(requestError);
      setReceivables([]);
      setReceivableTotal(0);
      setReceivableTotalPages(1);
      setReceivableTotalAmount(0);
    } finally {
      if (requestId === receivablesReqIdRef.current) setReceivablesLoading(false);
    }
  }, [receivableQueryParams]);

  useEffect(() => {
    const debounceMs = receivableSearch.trim() ? 300 : 0;
    const timeoutId = window.setTimeout(() => {
      void fetchReceivables();
    }, debounceMs);
    return () => window.clearTimeout(timeoutId);
  }, [fetchReceivables, receivableSearch]);

  const fetchAllData = async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [kpisRes, pnlRes, catRes, prodRes, marginsRes] = await Promise.all([
        api.get('/reports/dashboard'),
        api.get(`/reports/pnl?date_debut=${dateDebut}&date_fin=${dateFin}`),
        api.get(`/reports/sales-by-category?date_debut=${dateDebut}&date_fin=${dateFin}`),
        api.get(`/reports/products?date_debut=${dateDebut}&date_fin=${dateFin}&limit=10`),
        api.get(`/reports/margins?date_debut=${dateDebut}&date_fin=${dateFin}`),
      ]);

      if (reqId !== reqIdRef.current) return; // réponse obsolète (dates modifiées entre-temps)
      setKpis(kpisRes.data.data);
      setPnl(pnlRes.data.data);
      setSalesByCategory(catRes.data.data);
      setTopProducts(prodRes.data.data);
      setMarginsReport(marginsRes.data.data);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e);
      toast.error(getErrorMessage(e, 'Erreur lors du chargement des rapports'));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  };

  const exportReceivables = async () => {
    setExportingReceivables(true);
    try {
      const response = await api.get('/reports/receivables/export', {
        params: receivableQueryParams(false),
      });
      const exportedRows: ReceivableRow[] = response.data.data || [];
      downloadCsv(
        `creances_clients_${new Date().toISOString().slice(0, 10)}.csv`,
        ['Client', 'Total dû', 'Moins de 30 jours', '30 à 60 jours', 'Plus de 60 jours'],
        exportedRows.map((client) => [
          `${client.nom || ''} ${client.prenom || ''}`.trim(),
          String(client.total_du),
          String(client.moins_30_jours),
          String(client.entre_30_60_jours),
          String(client.plus_60_jours),
        ])
      );
      if (response.data.truncated) {
        toast.warning(`Export limité aux ${exportedRows.length} premières créances`);
      } else {
        toast.success(`${exportedRows.length} créance(s) exportée(s)`);
      }
    } catch (exportError) {
      toast.error(getErrorMessage(exportError, "Impossible d'exporter les créances"));
    } finally {
      setExportingReceivables(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      {/* Title & Date range — restent affichés pendant le chargement / en cas d'erreur */}
      <PageHeader
        title="Rapports et analyses"
        className="mb-6"
        actions={
          <div className="flex items-center gap-2">
            <DatePicker className="h-8 w-44 text-xs" value={dateDebut} onChange={setDateDebut} aria-label="Date début" />
            <span className="text-muted-foreground">→</span>
            <DatePicker className="h-8 w-44 text-xs" value={dateFin} onChange={setDateFin} aria-label="Date fin" />
          </div>
        }
      />

      <QueryState
        loading={loading}
        error={error}
        onRetry={fetchAllData}
        skeleton={<PageLoading />}
      >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'general' | 'margins')}>
      <TabsList className="mb-6">
        <TabsTrigger value="general">Vue Générale</TabsTrigger>
        <TabsTrigger value="margins">Analyse des Marges & Rentabilité</TabsTrigger>
      </TabsList>

      {/* KPI Cards (5 columns when Margins is loaded) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Chiffre d'affaires (mois)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold num">{formatCurrency(kpis?.revenue_mois?.total || 0)}</div>
            <p className="text-xs text-muted-foreground">{kpis?.revenue_mois?.count || 0} factures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Marge brute (mois)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold num text-success-700">
              {formatCurrency(kpis?.marge_mois?.marge_brute || 0)}
            </div>
            <p className="text-xs text-muted-foreground text-success-800">
              Taux: {kpis?.marge_mois?.marge_pourcentage || 0}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Créances clients</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold num">{formatCurrency(kpis?.creances?.total || 0)}</div>
            <p className="text-xs text-muted-foreground">{kpis?.creances?.count || 0} factures impayées</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Valeur du stock</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold num">{formatCurrency(kpis?.valeur_stock?.valeur || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Alertes stock</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-danger-700 num">{kpis?.alertes_stock || 0}</div>
            <p className="text-xs text-muted-foreground">produits sous le minimum</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab 1: General View */}
      <TabsContent value="general">
        <div className="space-y-6">
          {pnl && (
            <Card>
              <CardHeader><CardTitle>Compte de résultat</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Chiffre d'affaires</p>
                    <p className="text-xl font-semibold text-success-700 num">+{formatCurrency(pnl.chiffre_affaires)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Coût des ventes</p>
                    <p className="text-xl font-semibold text-danger-700 num">−{formatCurrency(pnl.cout_ventes)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Marge brute</p>
                    <p className="text-xl font-semibold num">{formatCurrency(pnl.marge_brute)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Marge %</p>
                    <p className="text-xl font-semibold num">{pnl.marge_pourcentage}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Ventes par catégorie</CardTitle></CardHeader>
              <CardContent>
                {salesByCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                    <PieChart accessibilityLayer>
                      <Pie
                        data={salesByCategory.map((c) => ({ name: c.categorie, value: parseFloat(c.chiffre_affaires) }))}
                        cx="50%" cy="50%" outerRadius={80} fill={CHART_PRIMARY}
                        dataKey="value" label
                      >
                        {salesByCategory.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    title="Aucune vente sur la période"
                    description="Aucune catégorie n'a enregistré de vente entre ces deux dates."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top 10 produits par marge</CardTitle></CardHeader>
              <CardContent>
                {topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                    <BarChart accessibilityLayer data={topProducts.map((p) => ({ nom: p.nom.substring(0, 20), marge: parseFloat(p.marge_brute) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis dataKey="nom" tick={{ fontSize: 10, fill: CHART_AXIS }} />
                      <YAxis tick={{ fontSize: 11, fill: CHART_AXIS }} />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                      <Bar dataKey="marge" fill={CHART_POSITIVE} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    title="Aucun produit vendu sur la période"
                    description="Aucune marge produit à classer entre ces deux dates."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Créances clients par ancienneté</CardTitle>
              <p className="text-sm text-muted-foreground">
                Situation actuelle, triée du solde le plus élevé au plus faible
                {!receivablesLoading && ` · ${receivableTotal} client(s) · ${formatCurrency(receivableTotalAmount)}`}.
              </p>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_170px_190px_190px_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={receivableSearch}
                    onChange={(event) => setReceivableSearch(event.target.value)}
                    placeholder="Rechercher un client"
                    aria-label="Rechercher un client débiteur"
                    className="pl-9"
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  value={receivableMinAmount}
                  onChange={(event) => setReceivableMinAmount(event.target.value)}
                  placeholder="Solde minimum"
                  aria-label="Solde minimum en FCFA"
                />
                <Select
                  value={receivableBucket}
                  onValueChange={(value) => setReceivableBucket(value as ReceivableBucket)}
                >
                  <SelectTrigger aria-label="Filtrer par ancienneté">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les anciennetés</SelectItem>
                    <SelectItem value="moins_30_jours">Moins de 30 jours</SelectItem>
                    <SelectItem value="entre_30_60_jours">30 à 60 jours</SelectItem>
                    <SelectItem value="plus_60_jours">Plus de 60 jours</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={receivableLocationId} onValueChange={setReceivableLocationId}>
                  <SelectTrigger aria-label="Filtrer par emplacement">
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
                <Button
                  variant="outline"
                  onClick={() => void exportReceivables()}
                  disabled={receivableTotal === 0 || exportingReceivables}
                  className="gap-2"
                >
                  {exportingReceivables
                    ? <Spinner />
                    : <Download className="h-4 w-4" />}
                  Exporter
                </Button>
              </div>

              {receivablesLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" aria-live="polite">
                  <Spinner size="md" />
                  Chargement des créances…
                </div>
              ) : receivablesError ? (
                <div className="py-8 text-center" role="alert">
                  <p className="text-sm text-danger-700">
                    {getErrorMessage(receivablesError, 'Impossible de charger les créances.')}
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void fetchReceivables()}>
                    Réessayer
                  </Button>
                </div>
              ) : receivables.length > 0 ? (
                <>
                  <div className="hidden overflow-x-auto rounded-md border md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                          <th className={TABLE_HEAD}>Client</th>
                          <th className={TABLE_HEAD + ' text-right'}>Total dû</th>
                          <th className={TABLE_HEAD + ' text-right'}>&lt; 30 jours</th>
                          <th className={TABLE_HEAD + ' text-right'}>30-60 jours</th>
                          <th className={TABLE_HEAD + ' text-right'}>&gt; 60 jours</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {receivables.map((client) => (
                          <tr key={client.client_id} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">{client.nom} {client.prenom}</td>
                            <td className="px-3 py-2 text-right font-semibold text-danger-700 num">{formatCurrency(client.total_du)}</td>
                            <td className="px-3 py-2 text-right text-success-700 num">{formatCurrency(client.moins_30_jours)}</td>
                            <td className="px-3 py-2 text-right text-warning-700 num">{formatCurrency(client.entre_30_60_jours)}</td>
                            <td className="px-3 py-2 text-right text-danger-700 num">{formatCurrency(client.plus_60_jours)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {receivables.map((client) => (
                      <article key={client.client_id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="min-w-0 break-words font-semibold">
                            {client.nom} {client.prenom}
                          </h3>
                          <span className="shrink-0 font-semibold text-danger-700 num">
                            {formatCurrency(client.total_du)}
                          </span>
                        </div>
                        <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                          <div>
                            <dt className="text-muted-foreground">&lt; 30 j</dt>
                            <dd className="mt-1 break-words text-success-700 num">{formatCurrency(client.moins_30_jours)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">30–60 j</dt>
                            <dd className="mt-1 break-words text-warning-700 num">{formatCurrency(client.entre_30_60_jours)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">&gt; 60 j</dt>
                            <dd className="mt-1 break-words text-danger-700 num">{formatCurrency(client.plus_60_jours)}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>

                  <Pagination
                    page={receivablePage}
                    totalPages={receivableTotalPages}
                    total={receivableTotal}
                    limit={receivableLimit}
                    onPageChange={setReceivablePage}
                    onLimitChange={setReceivableLimit}
                  />
                </>
              ) : (
                <EmptyState
                  title="Aucune créance client"
                  description="Aucun client débiteur ne correspond aux filtres appliqués."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Tab 2: Margins & Profitability Dashboard */}
      <TabsContent value="margins">
        {marginsReport && (
        <div className="space-y-6">
          {/* Trend & Category Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Évolution mensuelle des Marges</CardTitle>
              </CardHeader>
              <CardContent>
                {marginsReport.monthly_trend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                    <BarChart accessibilityLayer data={marginsReport.monthly_trend.map((m: any) => ({
                      mois: new Date(m.mois).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
                      CA: parseFloat(m.chiffre_affaires),
                      Marge: parseFloat(m.marge_brute),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis dataKey="mois" tick={{ fontSize: 11, fill: CHART_AXIS }} />
                      <YAxis tick={{ fontSize: 11, fill: CHART_AXIS }} />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                      <Legend />
                      <Bar dataKey="CA" fill={CHART_PRIMARY} name="Chiffre d'Affaires" />
                      <Bar dataKey="Marge" fill={CHART_POSITIVE} name="Marge Brute" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    title="Aucune marge mensuelle"
                    description="Aucune vente enregistrée sur les mois de la période."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Taux de Marge par Catégorie</CardTitle>
              </CardHeader>
              <CardContent>
                {marginsReport.top_categories?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                    <BarChart
                      accessibilityLayer
                      layout="vertical"
                      data={marginsReport.top_categories.map((c: any) => ({
                        categorie: c.categorie,
                        taux: parseFloat(c.marge_pourcentage),
                      }))}
                      margin={{ left: 50 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: CHART_AXIS }} />
                      <YAxis dataKey="categorie" type="category" tick={{ fontSize: 11, fill: CHART_AXIS }} />
                      <Tooltip formatter={(value: any) => `${value}%`} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                      <Bar dataKey="taux" fill={chartColor(3)} name="Taux de Marge (%)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    title="Aucune catégorie vendue"
                    description="Aucun taux de marge calculable sur la période."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top client profitability & product profit list */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top client profitability */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Top Clients les plus Profitables</CardTitle>
              </CardHeader>
              <CardContent>
                {marginsReport.top_tiers?.length > 0 ? (
                  <div className="space-y-4">
                    {marginsReport.top_tiers.slice(0, 5).map((t: any) => (
                      <div key={t.tiers_id} className="flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0">
                        <div>
                          <p className="font-semibold text-sm">{t.nom} {t.prenom || ''}</p>
                          <p className="text-xs text-muted-foreground">CA: {formatCurrency(t.chiffre_affaires)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm text-success-700">+{formatCurrency(t.marge_brute)}</p>
                          <p className="text-xs text-muted-foreground">Marge: {t.marge_pourcentage}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Aucun client facturé"
                    description="Aucun client n'a généré de marge sur la période."
                  />
                )}
              </CardContent>
            </Card>

            {/* Product Profitability list */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Rentabilité par Produit</CardTitle>
              </CardHeader>
              <CardContent>
                {marginsReport.top_products?.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                          <th className={TABLE_HEAD}>Produit</th>
                          <th className={TABLE_HEAD + ' text-right'}>Qté</th>
                          <th className={TABLE_HEAD + ' text-right'}>CA</th>
                          <th className={TABLE_HEAD + ' text-right'}>Coût</th>
                          <th className={TABLE_HEAD + ' text-right'}>Profit</th>
                          <th className={TABLE_HEAD + ' text-right'}>Marge %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {marginsReport.top_products.map((p: any) => (
                          <tr key={p.produit_id} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium truncate max-w-[150px]" title={p.nom}>
                              {p.nom}
                            </td>
                            <td className="px-3 py-2 text-right num">{p.unites_vendues}</td>
                            <td className="px-3 py-2 text-right num">{formatCurrency(p.chiffre_affaires)}</td>
                            <td className="px-3 py-2 text-right num">{formatCurrency(p.cout_ventes)}</td>
                            <td className="px-3 py-2 text-right text-success-700 font-medium num">
                              {formatCurrency(p.marge_brute)}
                            </td>
                            <td className="px-3 py-2 text-right num">{p.marge_pourcentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="Aucun produit vendu sur la période"
                    description="Aucune rentabilité produit à afficher entre ces deux dates."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        )}
      </TabsContent>
      </Tabs>
      </QueryState>
    </div>
  );
}
