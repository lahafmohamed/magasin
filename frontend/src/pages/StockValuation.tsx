import { useCallback, useEffect, useState } from 'react';
import { produitService } from '../services/api';
import { formatFCFA as formatXOF } from '../utils/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryState } from '@/components/ui/query-state';
import { PageLoading } from '@/components/ui/loading';
import { Package, DollarSign, TrendingUp, BarChart3, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errors';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { downloadCsv } from '../utils/csv';
import {
  CHART_PRIMARY,
  CHART_SECONDARY,
  CHART_GRID,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/lib/chartColors';

export default function StockValuation() {
  const [valuation, setValuation] = useState<any>(null);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadValuation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [valuationData, categoryData] = await Promise.all([
        produitService.getStockValuation(),
        produitService.getStockByCategory(),
      ]);
      
      setValuation({
        total_produits: parseInt(valuationData.total_produits),
        total_unites: parseInt(valuationData.total_unites),
        valeur_achat: parseFloat(valuationData.valeur_achat),
        valeur_vente: parseFloat(valuationData.valeur_vente),
        marge_potentielle: parseFloat(valuationData.marge_potentielle),
      });
      
      setByCategory(categoryData.map((cat: any) => ({
        ...cat,
        nombre_produits: parseInt(cat.nombre_produits),
        total_unites: parseInt(cat.total_unites),
        valeur_achat: parseFloat(cat.valeur_achat),
        valeur_vente: parseFloat(cat.valeur_vente),
      })));
    } catch (err) {
      setError(err);
      setValuation(null);
      setByCategory([]);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement de la valorisation'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadValuation();
  }, [loadValuation]);

  const exportToCSV = () => {
    const headers = ['Catégorie', 'Produits', 'Unités', 'Valeur Achat', 'Valeur Vente', 'Marge'];
    const rows = byCategory.map(cat => [
      cat.categorie,
      cat.nombre_produits,
      cat.total_unites,
      cat.valeur_achat.toFixed(2),
      cat.valeur_vente.toFixed(2),
      (cat.valeur_vente - cat.valeur_achat).toFixed(2),
    ]);

    downloadCsv('stock-valuation.csv', headers, rows);
    toast.success('Export CSV réussi');
  };

  const margePercent = valuation ? ((valuation.marge_potentielle / valuation.valeur_achat) * 100).toFixed(1) : 0;

  return (
    <div className="p-3 sm:p-6 w-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Valorisation du stock
          </h1>
          <p className="text-muted-foreground mt-1">Analyse de la valeur de votre inventaire</p>
        </div>
        <Button onClick={exportToCSV} className="gap-2" disabled={byCategory.length === 0}>
          <Download className="h-4 w-4" />
          Exporter CSV
        </Button>
      </div>

      <QueryState
        loading={loading}
        error={error}
        onRetry={loadValuation}
        skeleton={<PageLoading />}
      >
      {/* Summary Cards */}
      {valuation && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Produits</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{valuation.total_produits}</div>
                <p className="text-xs text-muted-foreground mt-1">{valuation.total_unites} unités en stock</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valeur d'Achat</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatXOF(valuation.valeur_achat)}</div>
                <p className="text-xs text-muted-foreground mt-1">Coût total du stock</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valeur de vente</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatXOF(valuation.valeur_vente)}</div>
                <p className="text-xs text-muted-foreground mt-1">Si tout est vendu</p>
              </CardContent>
            </Card>

            <Card className="bg-primary text-primary-foreground">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Marge Potentielle</CardTitle>
                <TrendingUp className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatXOF(valuation.marge_potentielle)}</div>
                <p className="text-xs opacity-80 mt-1">+{margePercent}% de marge</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Valeur du Stock par Catégorie</CardTitle>
              <CardDescription>Comparaison valeur d'achat vs valeur de vente</CardDescription>
            </CardHeader>
            <CardContent>
              {byCategory.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Aucune catégorie valorisée"
                  description="Aucun produit en stock à répartir par catégorie."
                />
              ) : (
                <ResponsiveContainer width="100%" height={300} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <BarChart accessibilityLayer data={byCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="categorie" tick={{ fontSize: 11, fill: CHART_AXIS }} />
                    <YAxis tick={{ fontSize: 11, fill: CHART_AXIS }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any) => formatXOF(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                    <Legend />
                    <Bar dataKey="valeur_achat" fill={CHART_SECONDARY} name="Valeur Achat" />
                    <Bar dataKey="valeur_vente" fill={CHART_PRIMARY} name="Valeur Vente" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Category Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Détail par Catégorie</CardTitle>
          <CardDescription>Répartition complète de l'inventaire</CardDescription>
        </CardHeader>
        <CardContent>
          {byCategory.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Aucune catégorie à détailler"
              description="Aucun produit en stock pour alimenter le détail par catégorie."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Produits</TableHead>
                  <TableHead className="text-right">Unités</TableHead>
                  <TableHead className="text-right">Valeur Achat</TableHead>
                  <TableHead className="text-right">Valeur Vente</TableHead>
                  <TableHead className="text-right">Marge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCategory.map((cat) => {
                  const marge = cat.valeur_vente - cat.valeur_achat;
                  return (
                    <TableRow key={cat.categorie}>
                      <TableCell className="font-semibold">{cat.categorie}</TableCell>
                      <TableCell className="text-right">{cat.nombre_produits}</TableCell>
                      <TableCell className="text-right">{cat.total_unites}</TableCell>
                      <TableCell className="text-right">{formatXOF(cat.valeur_achat)}</TableCell>
                      <TableCell className="text-right font-bold">{formatXOF(cat.valeur_vente)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="success">{formatXOF(marge)}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </QueryState>
    </div>
  );
}
