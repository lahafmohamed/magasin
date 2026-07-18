import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../services/authService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { formatCurrency } from '../utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
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

export default function Reporting() {
  const [activeTab, setActiveTab] = useState<'general' | 'margins'>('general');
  const [kpis, setKpis] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [salesByCategory, setSalesByCategory] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [marginsReport, setMarginsReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  /** Identifiant de requête pour ignorer les réponses obsolètes (changements rapides de dates). */
  const reqIdRef = useRef(0);

  const today = new Date();
  const [dateDebut, setDateDebut] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(today.toISOString().split('T')[0]);

  useEffect(() => {
    fetchAllData();
  }, [dateDebut, dateFin]);

  const fetchAllData = async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [kpisRes, pnlRes, catRes, prodRes, recvRes, marginsRes] = await Promise.all([
        api.get('/reports/dashboard'),
        api.get(`/reports/pnl?date_debut=${dateDebut}&date_fin=${dateFin}`),
        api.get(`/reports/sales-by-category?date_debut=${dateDebut}&date_fin=${dateFin}`),
        api.get(`/reports/products?date_debut=${dateDebut}&date_fin=${dateFin}&limit=10`),
        api.get('/reports/receivables'),
        api.get(`/reports/margins?date_debut=${dateDebut}&date_fin=${dateFin}`),
      ]);

      if (reqId !== reqIdRef.current) return; // réponse obsolète (dates modifiées entre-temps)
      setKpis(kpisRes.data.data);
      setPnl(pnlRes.data.data);
      setSalesByCategory(catRes.data.data);
      setTopProducts(prodRes.data.data);
      setReceivables(recvRes.data.data);
      setMarginsReport(marginsRes.data.data);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e);
      toast.error('Erreur lors du chargement des rapports');
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
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
            <Input type="date" className="h-8 w-auto" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
            <span className="text-muted-foreground">→</span>
            <Input type="date" className="h-8 w-auto" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </div>
        }
      />

      <QueryState
        loading={loading}
        error={error}
        onRetry={fetchAllData}
        skeleton={<div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
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
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
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
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top 10 produits par marge</CardTitle></CardHeader>
              <CardContent>
                {topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProducts.map((p) => ({ nom: p.nom.substring(0, 20), marge: parseFloat(p.marge_brute) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis dataKey="nom" tick={{ fontSize: 10, fill: CHART_AXIS }} />
                      <YAxis tick={{ fontSize: 11, fill: CHART_AXIS }} />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                      <Bar dataKey="marge" fill={CHART_POSITIVE} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Créances clients (aging)</CardTitle></CardHeader>
            <CardContent>
              {receivables.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
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
              ) : (
                <p className="text-center text-muted-foreground py-8 text-sm">Aucune créance</p>
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
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={marginsReport.monthly_trend.map((m: any) => ({
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
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Taux de Marge par Catégorie</CardTitle>
              </CardHeader>
              <CardContent>
                {marginsReport.top_categories?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
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
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
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
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
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
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
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
