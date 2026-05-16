import { useState, useEffect } from 'react';
import { api } from '../services/authService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

export default function Reporting() {
  const [kpis, setKpis] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [salesByCategory, setSalesByCategory] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [dateDebut, setDateDebut] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(today.toISOString().split('T')[0]);

  useEffect(() => {
    fetchAllData();
  }, [dateDebut, dateFin]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [kpisRes, pnlRes, catRes, prodRes, recvRes] = await Promise.all([
        api.get('/reports/dashboard'),
        api.get(`/reports/pnl?date_debut=${dateDebut}&date_fin=${dateFin}`),
        api.get(`/reports/sales-by-category?date_debut=${dateDebut}&date_fin=${dateFin}`),
        api.get(`/reports/products?date_debut=${dateDebut}&date_fin=${dateFin}&limit=10`),
        api.get('/reports/receivables'),
      ]);

      setKpis(kpisRes.data.data);
      setPnl(pnlRes.data.data);
      setSalesByCategory(catRes.data.data);
      setTopProducts(prodRes.data.data);
      setReceivables(recvRes.data.data);
    } catch {
      toast.error('Erreur chargement données');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Rapports & Analyses</h1>
        <div className="flex gap-2">
          <input type="date" className="input input-bordered input-sm" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          <span className="self-center">→</span>
          <input type="date" className="input input-bordered input-sm" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Chiffre d'Affaires (Mois)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{parseFloat(kpis?.revenue_mois?.total || 0).toFixed(2)} XOF</div>
            <p className="text-xs text-base-content/60">{kpis?.revenue_mois?.count || 0} factures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Créances Clients</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{parseFloat(kpis?.creances?.total || 0).toFixed(2)} XOF</div>
            <p className="text-xs text-base-content/60">{kpis?.creances?.count || 0} factures impayées</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Valeur du Stock</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{parseFloat(kpis?.valeur_stock?.valeur || 0).toFixed(2)} XOF</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Alertes Stock</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-error">{kpis?.alertes_stock || 0}</div>
            <p className="text-xs text-base-content/60">produits sous le minimum</p>
          </CardContent>
        </Card>
      </div>

      {/* P&L Summary */}
      {pnl && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Compte de Résultat</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-base-content/60">Chiffre d'Affaires</p>
                <p className="text-xl font-bold text-success">{parseFloat(pnl.chiffre_affaires).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/60">Coût des Ventes</p>
                <p className="text-xl font-bold text-error">{parseFloat(pnl.cout_ventes).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/60">Marge Brute</p>
                <p className="text-xl font-bold">{parseFloat(pnl.marge_brute).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/60">Marge %</p>
                <p className="text-xl font-bold">{pnl.marge_pourcentage}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales by Category */}
        <Card>
          <CardHeader><CardTitle>Ventes par Catégorie</CardTitle></CardHeader>
          <CardContent>
            {salesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={salesByCategory.map((c) => ({ name: c.categorie, value: parseFloat(c.chiffre_affaires) }))}
                    cx="50%" cy="50%" outerRadius={80} fill="#8884d8"
                    dataKey="value" label
                  >
                    {salesByCategory.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-base-content/60 py-8">Aucune donnée</p>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader><CardTitle>Top 10 Produits par Marge</CardTitle></CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProducts.map((p) => ({ nom: p.nom.substring(0, 20), marge: parseFloat(p.marge_brute) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nom" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="marge" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-base-content/60 py-8">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Receivables Aging */}
      <Card>
        <CardHeader><CardTitle>Créances Clients (Aging)</CardTitle></CardHeader>
        <CardContent>
          {receivables.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="text-right">Total Dû</th>
                    <th className="text-right">{'< 30 jours'}</th>
                    <th className="text-right">30-60 jours</th>
                    <th className="text-right">{'> 60 jours'}</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((client) => (
                    <tr key={client.client_id}>
                      <td className="font-medium">{client.nom} {client.prenom}</td>
                      <td className="text-right font-bold text-error">{parseFloat(client.total_du).toFixed(2)}</td>
                      <td className="text-right text-success">{parseFloat(client.moins_30_jours).toFixed(2)}</td>
                      <td className="text-right text-warning">{parseFloat(client.entre_30_60_jours).toFixed(2)}</td>
                      <td className="text-right text-error">{parseFloat(client.plus_60_jours).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-base-content/60 py-8">Aucune créance</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
