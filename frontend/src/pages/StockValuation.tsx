import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Download, Package } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { produitService } from '../services/api';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { QueryErrorState } from '@/components/ui/query-state';
import { CardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { DataCard, ResponsiveTable } from '@/components/ui/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadCsv } from '../utils/csv';
import { formatNumber, formatPercent, toNumber } from '../utils/format';
import { getErrorMessage } from '@/utils/errors';
import {
  CHART_PRIMARY,
  CHART_REST,
  CHART_GRID,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
  chartMoneyTick,
  chartMoneyTooltip,
  type ChartTooltipValue,
} from '@/lib/chartColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useMediaQuery } from '@/components/useMediaQuery';


/** Nom de catégorie raccourci pour l'axe ; le nom entier reste dans l'infobulle et le tableau. */
const shortLabel = (name: string, max: number) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

/**
 * Borne haute « ronde » de l'axe des montants (12 345 678 → 20 000 000,
 * 870 000 → 900 000) : des graduations lisibles au lieu de valeurs tombées
 * au hasard du plus grand total.
 */
const roundAxisMax = (max: number) => {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / p) * p;
};

/** Case d'une carte mobile : libellé au-dessus, valeur dessous, deux par ligne. */
function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 tabular-nums">{children}</dd>
    </div>
  );
}

interface Valuation {
  total_produits: number;
  total_unites: number;
  valeur_achat: number;
  valeur_vente: number;
  marge_potentielle: number;
}

interface CategoryValuation {
  categorie: string;
  nombre_produits: number;
  total_unites: number;
  valeur_achat: number;
  valeur_vente: number;
  marge: number;
}

type RawRecord = Record<string, unknown>;
const num = (value: unknown): number => toNumber(value as number | string | null | undefined) ?? 0;

export default function StockValuation() {
  const reduceMotion = useReducedMotion();
  // Axe des catégories plus étroit sur téléphone : le tracé garde de la place.
  const wideChart = useMediaQuery('(min-width: 640px)');
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [byCategory, setByCategory] = useState<CategoryValuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadValuation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [valuationData, categoryData] = (await Promise.all([
        produitService.getStockValuation(),
        produitService.getStockByCategory(),
      ])) as [RawRecord, RawRecord[]];

      setValuation({
        total_produits: num(valuationData?.total_produits),
        total_unites: num(valuationData?.total_unites),
        valeur_achat: num(valuationData?.valeur_achat),
        valeur_vente: num(valuationData?.valeur_vente),
        marge_potentielle: num(valuationData?.marge_potentielle),
      });
      setByCategory(
        (Array.isArray(categoryData) ? categoryData : []).map((cat) => {
          const valeurAchat = num(cat.valeur_achat);
          const valeurVente = num(cat.valeur_vente);
          return {
            categorie: typeof cat.categorie === 'string' && cat.categorie ? cat.categorie : 'Sans catégorie',
            nombre_produits: num(cat.nombre_produits),
            total_unites: num(cat.total_unites),
            valeur_achat: valeurAchat,
            valeur_vente: valeurVente,
            marge: valeurVente - valeurAchat,
          };
        })
      );
    } catch (err) {
      setError(err);
      setValuation(null);
      setByCategory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadValuation();
  }, [loadValuation]);

  const exportToCSV = () => {
    try {
      const headers = ['Catégorie', 'Produits', 'Unités', 'Valeur d’achat', 'Valeur de vente', 'Marge'];
      const rows = byCategory.map((cat) => [
        cat.categorie,
        cat.nombre_produits,
        cat.total_unites,
        cat.valeur_achat.toFixed(2),
        cat.valeur_vente.toFixed(2),
        cat.marge.toFixed(2),
      ]);
      downloadCsv(`valorisation-stock_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
      toast.success('Fichier CSV téléchargé');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’exporter en CSV. Réessayez.'));
    }
  };

  const margePercent =
    valuation && valuation.valeur_achat > 0 ? (valuation.marge_potentielle / valuation.valeur_achat) * 100 : null;
  const unavailable = !!error;

  // Une barre empilée par catégorie, triée par valeur de vente (GV-09) : le coût
  // d'achat en graphite, la marge à son bout en bleu — la barre entière vaut la
  // valeur de vente. Deux barres côte à côte par catégorie doublaient le
  // graphique sans rien dire de plus.
  const chartData = useMemo(
    () =>
      [...byCategory]
        .sort((a, b) => b.valeur_vente - a.valeur_vente)
        // L'axe passe le nom sur deux lignes dans sa largeur : on ne coupe que les
        // noms vraiment longs (« Ordinateurs portables » et « Ordinateurs de
        // bureau » restent distincts, même sur téléphone).
        .map((cat) => ({
          ...cat,
          label: shortLabel(cat.categorie, wideChart ? 32 : 24),
          // Une marge négative (vente sous le coût) ne se dessine pas ; l'infobulle la donne.
          marge_barre: Math.max(0, cat.marge),
        })),
    [byCategory, wideChart]
  );
  // Une barre par catégorie : 32 px par ligne, plus l'axe.
  const chartHeight = chartData.length * 32 + 64;

  const categoryTable = (
    <Table aria-label="Valorisation du stock par catégorie">
      <TableHeader>
        <TableRow>
          <TableHead>Catégorie</TableHead>
          <TableHead numeric>Produits</TableHead>
          <TableHead numeric>Unités</TableHead>
          <TableHead numeric>Valeur d’achat</TableHead>
          <TableHead numeric>Valeur de vente</TableHead>
          <TableHead numeric>Marge</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {byCategory.map((cat) => (
          <TableRow key={cat.categorie}>
            <TableCell className="font-medium">{cat.categorie}</TableCell>
            <TableCell numeric>{formatNumber(cat.nombre_produits)}</TableCell>
            <TableCell numeric>{formatNumber(cat.total_unites)}</TableCell>
            <TableCell numeric>
              <Money value={cat.valeur_achat} />
            </TableCell>
            <TableCell numeric>
              <Money value={cat.valeur_vente} />
            </TableCell>
            <TableCell numeric>
              {/* Montant neutre ; seul un négatif passe en rouge, avec « − ». */}
              <Money value={cat.marge} tone="auto" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  // Sur téléphone, cinq valeurs en deux colonnes plutôt que cinq lignes empilées.
  const categoryCards = byCategory.map((cat) => (
    <DataCard key={cat.categorie} title={cat.categorie}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Figure label="Produits">{formatNumber(cat.nombre_produits)}</Figure>
        <Figure label="Unités">{formatNumber(cat.total_unites)}</Figure>
        <Figure label="Valeur d’achat">
          <Money value={cat.valeur_achat} />
        </Figure>
        <Figure label="Valeur de vente">
          <Money value={cat.valeur_vente} />
        </Figure>
        <Figure label="Marge">
          <Money value={cat.marge} tone="auto" />
        </Figure>
      </dl>
    </DataCard>
  ));

  return (
    <PageShell
      title="Valorisation du stock"
      description="Ce que vaut votre stock au prix de revient et au prix de vente, catégorie par catégorie"
      actions={
        <Button
          variant="outline"
          size="touch"
          onClick={exportToCSV}
          disabled={loading || byCategory.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter en CSV
        </Button>
      }
    >
      <StatGrid>
        <StatTile
          label="Total des produits"
          value={valuation?.total_produits}
          hint={valuation ? `${formatNumber(valuation.total_unites)} ${valuation.total_unites > 1 ? 'unités' : 'unité'} en stock` : undefined}
          loading={loading}
          unavailable={unavailable}
        />
        <StatTile
          label="Valeur d’achat"
          value={valuation?.valeur_achat}
          format="money"
          hint="Coût total du stock"
          loading={loading}
          unavailable={unavailable}
        />
        <StatTile
          label="Valeur de vente"
          value={valuation?.valeur_vente}
          format="money"
          hint="Si tout le stock est vendu"
          loading={loading}
          unavailable={unavailable}
        />
        <StatTile
          label="Marge potentielle"
          value={valuation?.marge_potentielle}
          format="money"
          tone={valuation && valuation.marge_potentielle < 0 ? 'danger' : 'default'}
          hint={margePercent !== null ? `${formatPercent(margePercent, 1)} du prix de revient` : undefined}
          loading={loading}
          unavailable={unavailable}
        />
      </StatGrid>

      {error ? (
        <Card>
          <QueryErrorState
            error={error}
            title="Impossible de charger la valorisation du stock"
            onRetry={() => void loadValuation()}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Valeur du stock par catégorie</CardTitle>
              {/* Légende en mots : la couleur n'est jamais seule à dire quelle part est la marge. */}
              <CardDescription>Graphite : coût d’achat · bleu : marge</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <CardSkeleton lines={6} />
              ) : byCategory.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Aucune catégorie valorisée"
                  description="Aucun produit en stock à répartir par catégorie"
                />
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={chartHeight}
                  minWidth={0}
                  initialDimension={{ width: 1, height: 1 }}
                >
                  <BarChart
                    accessibilityLayer
                    layout="vertical"
                    data={chartData}
                    margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, roundAxisMax]}
                      tickCount={5}
                      tick={CHART_TICK_STYLE}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={chartMoneyTick}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={wideChart ? 150 : 92}
                      tick={CHART_TICK_STYLE}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                    />
                    <Tooltip
                      formatter={(value, name, item) => {
                        // La barre de marge est bornée à 0 : l'infobulle donne la marge réelle.
                        const row = item?.payload as { marge?: number } | undefined;
                        const shown = item?.dataKey === 'marge_barre' && row ? row.marge : value;
                        return [chartMoneyTooltip(shown as ChartTooltipValue), String(name)];
                      }}
                      labelFormatter={(label, payload) => {
                        const full = (payload?.[0]?.payload as { categorie?: string } | undefined)?.categorie;
                        return full ?? String(label);
                      }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }}
                    />
                    <Bar
                      dataKey="valeur_achat"
                      stackId="v"
                      fill={CHART_REST}
                      name="Coût d’achat"
                      maxBarSize={16}
                      isAnimationActive={!reduceMotion}
                    />
                    <Bar
                      dataKey="marge_barre"
                      stackId="v"
                      fill={CHART_PRIMARY}
                      name="Marge"
                      maxBarSize={16}
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={!reduceMotion}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:px-0">
              <CardTitle>Détail par catégorie</CardTitle>
              <CardDescription>Produits, unités, valeurs et marge</CardDescription>
            </CardHeader>
            <CardContent inset="flush">
              {loading ? (
                <TableSkeleton rows={6} columns={6} />
              ) : byCategory.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Aucune catégorie à détailler"
                  description="Aucun produit en stock pour alimenter le détail par catégorie"
                />
              ) : (
                <ResponsiveTable table={categoryTable} cards={categoryCards} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
