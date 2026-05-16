import { useEffect, useState, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { factureService, produitService, commandeService } from '../services/api';
import { StatsDashboard } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, TrendingUp, AlertTriangle, PlusCircle, Package, Users, ArrowRight, DollarSign, ShoppingCart, Clock } from 'lucide-react';
import { DashboardDemandeWidgets } from '../components/DashboardDemandeWidgets';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export default function Dashboard() {
  const [stats, setStats] = useState<StatsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [stockByCategory, setStockByCategory] = useState<any[]>([]);
  const [commandeStats, setCommandeStats] = useState<any>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    loadDashboard();
  }, []);

  // Responsive chart height calculation
  useLayoutEffect(() => {
    const updateWidth = () => {
      setContainerWidth(window.innerWidth);
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const chartHeight = containerWidth < 640 ? 200 : containerWidth < 1024 ? 250 : 300;

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [statsData, revenueData, topProductsData, topClientsData, stockCategoryData, commandesData] = await Promise.all([
        factureService.getStats(),
        factureService.getRevenueTrends(30),
        factureService.getTopProducts(5),
        factureService.getTopClients(5),
        produitService.getStockByCategory(),
        commandeService.getStats(),
      ]);
      
      setStats(statsData);
      
      // Format revenue data for chart
      const formattedRevenue = revenueData.map((item: any) => ({
        ...item,
        date: new Date(item.date).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }),
        total: parseFloat(item.total) || 0,
      }));
      setRevenueData(formattedRevenue);
      
      setTopProducts(topProductsData.map((p: any) => ({
        ...p,
        total_ventes: parseFloat(p.total_ventes) || 0,
        total_quantite: parseInt(p.total_quantite) || 0,
      })));
      
      setTopClients(topClientsData.map((c: any) => ({
        ...c,
        total_depenses: parseFloat(c.total_depenses) || 0,
        nombre_factures: parseInt(c.nombre_factures) || 0,
      })));
      
      setStockByCategory(stockCategoryData.map((cat: any) => ({
        ...cat,
        valeur_vente: parseFloat(cat.valeur_vente) || 0,
        valeur_achat: parseFloat(cat.valeur_achat) || 0,
        total_unites: parseInt(cat.total_unites) || 0,
      })));
      
      setCommandeStats(commandesData);
    } catch (error) {
      toast.error('Erreur lors du chargement du dashboard');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="text-muted-foreground">Chargement des données...</p>
        </div>
      </div>
    );
  }

  const formatXOF = (value: number) => `${value.toFixed(0)} XOF`;

  return (
    <div className="p-3 sm:p-6 w-full max-w-full">
      <div className="mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tableau de Bord</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Vue d'ensemble de votre activité</p>
          </div>
          <Link to="/factures/nouvelle">
            <Button className="gap-2 w-full sm:w-auto">
              <PlusCircle className="h-4 w-4" />
              Nouvelle Facture
            </Button>
          </Link>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Factures</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.total_factures.count || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Montant total</p>
            <p className="text-lg font-semibold text-primary">{parseFloat(stats?.total_factures.montant as any || 0).toFixed(0)} XOF</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Factures du Mois</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.factures_mois.count || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Ce mois-ci</p>
            <p className="text-lg font-semibold text-primary">{parseFloat(stats?.factures_mois.montant as any || 0).toFixed(0)} XOF</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertes Stock</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${stats && stats.alertes_stock > 0 ? 'text-destructive' : 'text-green-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${stats && stats.alertes_stock > 0 ? 'text-destructive' : 'text-green-500'}`}>
              {stats?.alertes_stock || 0}
            </div>
            {stats && stats.alertes_stock > 0 ? (
              <Link to="/inventaire?low_stock=true" className="text-xs text-destructive hover:underline flex items-center gap-1 mt-2">
                Voir les produits <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <Badge variant="success" className="mt-2">Stock OK</Badge>
            )}
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Action Rapide</CardTitle>
            <PlusCircle className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Link to="/factures/nouvelle">
              <Button variant="secondary" className="w-full gap-2 mt-2">
                Créer une facture
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Pending Orders Widget */}
      {commandeStats && parseInt(commandeStats.en_attente) > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium flex items-center gap-2 text-orange-800">
              <Clock className="h-5 w-5" />
              Commandes en attente: {commandeStats.en_attente}
            </CardTitle>
            <Link to="/commandes">
              <Button variant="outline" size="sm" className="gap-2">
                Voir les commandes
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 text-sm">
              <span className="text-orange-700">✅ Validées: {commandeStats.validee}</span>
              <span className="text-orange-700">🚚 Expédiées: {commandeStats.expediee}</span>
              <span className="text-orange-700">📦 Livrées: {commandeStats.livree}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demande Workflow Widgets */}
      <DashboardDemandeWidgets />

      {/* Revenue Trend Chart */}
      {revenueData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Évolution du Chiffre d'Affaires (30 derniers jours)
            </CardTitle>
            <CardDescription>Historique des ventes journalières</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <AreaChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: any) => `${formatXOF(value)}`} />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Products and Top Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Top 5 Produits les Plus Vendus
            </CardTitle>
            <CardDescription>Classement par quantité vendue</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height={chartHeight * 0.8}>
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nom" tick={{ fontSize: 11 }} tickFormatter={(value) => value.substring(0, 15) + '...'} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: any) => `${value} unités`} />
                  <Bar dataKey="total_quantite" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center" style={{ height: `${chartHeight * 0.8}px` }}>
                <ShoppingCart className="h-12 w-12 mb-2" />
                <p>Aucune vente enregistrée</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Top 5 Meilleurs Clients
            </CardTitle>
            <CardDescription>Classement par montant dépensé</CardDescription>
          </CardHeader>
          <CardContent>
            {topClients.length > 0 ? (
              <ResponsiveContainer width="100%" height={chartHeight * 0.8}>
                <BarChart data={topClients}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nom" tick={{ fontSize: 11 }} tickFormatter={(value) => value.substring(0, 15) + '...'} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatXOF(value)} />
                  <Bar dataKey="total_depenses" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center" style={{ height: `${chartHeight * 0.8}px` }}>
                <Users className="h-12 w-12 mb-2" />
                <p>Aucun client avec des achats</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stock by Category */}
      {stockByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Valorisation du Stock par Catégorie
            </CardTitle>
            <CardDescription>Répartition de la valeur de l'inventaire</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={chartHeight * 0.8}>
                <PieChart>
                  <Pie
                    data={stockByCategory}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name }) => `${String(name).substring(0, 15)}`}
                    outerRadius="80%"
                    fill="#8884d8"
                    dataKey="valeur_vente"
                  >
                    {stockByCategory.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatXOF(value)} />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-3">
                <h3 className="font-semibold">Détail par catégorie</h3>
                <div className="space-y-2">
                  {stockByCategory.slice(0, 5).map((cat, index) => (
                    <div key={cat.categorie} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-sm font-medium">{cat.categorie}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatXOF(cat.valeur_vente)}</p>
                        <p className="text-xs text-muted-foreground">{cat.total_unites} unités</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Navigation Rapide</CardTitle>
          <CardDescription>Accédez rapidement aux sections principales</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link to="/inventaire">
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/50">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-primary/10">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold">Gestion Stock</p>
                      <p className="text-sm text-muted-foreground">Inventaire produits</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link to="/clients">
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/50">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-primary/10">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold">Clients</p>
                      <p className="text-sm text-muted-foreground">Gestion clients</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link to="/factures">
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/50">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-primary/10">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold">Factures</p>
                      <p className="text-sm text-muted-foreground">Historique complet</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
