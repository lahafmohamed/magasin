import { useEffect, useState } from 'react';
import { comptabiliteService } from '../services/api';
import { formatCurrency } from '../utils/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Loader2, Wallet, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  CHART_POSITIVE,
  CHART_NEGATIVE,
  CHART_GRID,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/lib/chartColors';

export default function TresoreriePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [jours, setJours] = useState(90);

  useEffect(() => {
    setLoading(true);
    comptabiliteService.getTresorerie(jours)
      .then(setData)
      .catch(() => toast.error('Erreur chargement trésorerie'))
      .finally(() => setLoading(false));
  }, [jours]);

  const soldeNet = (data?.total_encaissements ?? 0) - (data?.total_decaissements ?? 0);

  if (loading) return (
    <div className="flex justify-center items-center min-h-[50vh]">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );

  return (
    <div className="p-3 sm:p-6 w-full max-w-full">
      <div className="mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <Wallet className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trésorerie prévisionnelle</h1>
            <p className="text-muted-foreground mt-1">Projection à {jours} jours</p>
          </div>
        </div>

        {/* Période selector */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {[30, 60, 90].map(j => (
            <Button key={j} variant={jours === j ? 'default' : 'outline'} size="sm" onClick={() => setJours(j)}>
              {j} jours
            </Button>
          ))}
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase">Encaissements prévus</p>
                <TrendingUp className="h-4 w-4 text-success-700" />
              </div>
              <p className="text-2xl font-bold text-success-700 mt-2">+{formatCurrency(data?.total_encaissements || 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data?.encaissements?.length || 0} facture(s) en attente</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase">Décaissements prévus</p>
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
              <p className="text-2xl font-bold text-destructive mt-2">−{formatCurrency(data?.total_decaissements || 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">Commandes + dépenses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase">Solde net prévisionnel</p>
                <Wallet className={`h-4 w-4 ${soldeNet >= 0 ? 'text-success-700' : 'text-destructive'}`} />
              </div>
              <p className={`text-2xl font-bold mt-2 ${soldeNet >= 0 ? 'text-success-700' : 'text-destructive'}`}>
                {formatCurrency(soldeNet)}
              </p>
              {soldeNet < 0 && (
                <Badge variant="destructive" className="mt-2">Trésorerie négative prévue</Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Échéancier graphique */}
        {(!data?.echeancier || data.echeancier.length === 0) && (
          <Card>
            <CardContent>
              <EmptyState icon={Calendar} title="Aucune échéance" description="Aucun flux de trésorerie projeté sur la période." />
            </CardContent>
          </Card>
        )}
        {data?.echeancier?.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Échéancier par semaine</CardTitle>
              <CardDescription className="text-xs">Projection des flux de trésorerie</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                <BarChart accessibilityLayer data={data.echeancier.map((e: any) => ({
                  periode: `${e.debut}-${e.fin}`,
                  Encaissements: e.encaissements,
                  Décaissements: e.decaissements,
                  Solde: e.solde,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                  <XAxis dataKey="periode" tick={{ fontSize: 10, fill: CHART_AXIS }} />
                  <YAxis tick={{ fontSize: 11, fill: CHART_AXIS }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }} />
                  <Bar dataKey="Encaissements" fill={CHART_POSITIVE} stackId="a" />
                  <Bar dataKey="Décaissements" fill={CHART_NEGATIVE} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Détail des encaissements */}
        {data?.encaissements?.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Encaissements attendus</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {data.encaissements.map((e: any, i: number) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{e.tiers_nom}</p>
                      <p className="text-xs text-muted-foreground">{e.reference} — Échéance: {new Date(e.echeance).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <span className="font-semibold text-success-700">{formatCurrency(e.montant)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Détail des décaissements */}
        {data?.decaissements?.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Décaissements prévus (commandes)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {data.decaissements.map((e: any, i: number) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{e.tiers_nom}</p>
                      <p className="text-xs text-muted-foreground">{e.reference} — Échéance: {new Date(e.echeance).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <span className="font-semibold text-destructive">{formatCurrency(e.montant)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
