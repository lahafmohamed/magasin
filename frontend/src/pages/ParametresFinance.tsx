import { useCallback, useEffect, useState } from 'react';
import { payrollService, factureFournisseurService } from '../services/api';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { Save, Plus, Trash2, Settings2, Percent } from 'lucide-react';

interface Cotisation { id: number; code: string; libelle: string; taux_salarial: string; taux_patronal: string; plafond: string | null; actif: boolean }
interface Bareme { id?: number; tranche_min: number | string; tranche_max: number | string | null; taux: number | string }

// stored fractions <-> percent for display
const toPct = (v: any) => (v == null || v === '' ? '' : String(Math.round(Number(v) * 10000) / 100));
const fromPct = (v: any) => (v === '' || v == null ? 0 : Number(v) / 100);

export default function ParametresFinance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [cotisations, setCotisations] = useState<Cotisation[]>([]);
  const [baremes, setBaremes] = useState<Bareme[]>([]);
  const [match, setMatch] = useState<{ qte_tolerance_pct: number; prix_tolerance_pct: number; bloquer: boolean } | null>(null);
  const [savingC, setSavingC] = useState<number | null>(null);
  const [savingB, setSavingB] = useState(false);
  const [savingM, setSavingM] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, mc] = await Promise.all([payrollService.getConfig(), factureFournisseurService.getMatchConfig()]);
      setCotisations(cfg.cotisations || []);
      setBaremes(cfg.baremes || []);
      setMatch(mc);
    } catch (err) {
      setError(err);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des paramètres'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setCot = (id: number, patch: Partial<Cotisation>) =>
    setCotisations((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const saveCotisation = async (c: Cotisation) => {
    setSavingC(c.id);
    try {
      await payrollService.updateCotisation(c.id, {
        taux_salarial: Number(c.taux_salarial),
        taux_patronal: Number(c.taux_patronal),
        plafond: c.plafond === '' || c.plafond == null ? null : Number(c.plafond),
        actif: c.actif,
      });
      toast.success(`${c.code} enregistré`);
    } catch (e) {
      toast.error(getErrorMessage(e, `Erreur lors de l'enregistrement de la cotisation ${c.code}`));
    } finally {
      setSavingC(null);
    }
  };

  const setBar = (i: number, patch: Partial<Bareme>) =>
    setBaremes((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const addBar = () => setBaremes((bs) => [...bs, { tranche_min: 0, tranche_max: null, taux: 0 }]);
  const delBar = (i: number) => setBaremes((bs) => bs.filter((_, idx) => idx !== i));

  const saveBaremes = async () => {
    setSavingB(true);
    try {
      await payrollService.replaceBaremes(
        baremes.map((b) => ({
          tranche_min: Number(b.tranche_min) || 0,
          tranche_max: b.tranche_max === '' || b.tranche_max == null ? null : Number(b.tranche_max),
          taux: Number(b.taux) || 0, // stored as a fraction in state
        }))
      );
      toast.success('Barème ITS enregistré');
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erreur lors de l'enregistrement du barème ITS"));
    } finally {
      setSavingB(false);
    }
  };

  const saveMatch = async () => {
    if (!match) return;
    setSavingM(true);
    try {
      await factureFournisseurService.updateMatchConfig(match);
      toast.success('Tolérances de rapprochement enregistrées');
    } catch (e) {
      toast.error(getErrorMessage(e, "Erreur lors de l'enregistrement des tolérances de rapprochement"));
    } finally {
      setSavingM(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 w-full max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Settings2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Paramètres paie &amp; achats</h1>
          <p className="text-sm text-muted-foreground">Taux légaux (CNPS/ITS) et tolérances de rapprochement 3 voies</p>
        </div>
      </div>

      <QueryState
        loading={loading}
        error={error}
        onRetry={load}
        skeleton={<TableSkeleton rows={5} columns={7} />}
      >
        {/* CNPS / cotisations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cotisations sociales (CNPS)</CardTitle>
            <CardDescription>Taux salarial et patronal (en %), plafond mensuel optionnel</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {cotisations.length === 0 ? (
              <EmptyState
                icon={Percent}
                title="Aucune cotisation configurée"
                description="Aucun taux CNPS n'est paramétré pour le moment."
              />
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead className="w-[120px]">Salarial %</TableHead>
                    <TableHead className="w-[120px]">Patronal %</TableHead>
                    <TableHead className="w-[140px]">Plafond</TableHead>
                    <TableHead className="w-[80px]">Actif</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cotisations.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell className="text-sm">{c.libelle}</TableCell>
                      <TableCell>
                        <Input type="number" inputMode="decimal" step="0.01" className="h-8" value={toPct(c.taux_salarial)}
                          onChange={(e) => setCot(c.id, { taux_salarial: String(fromPct(e.target.value)) })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" inputMode="decimal" step="0.01" className="h-8" value={toPct(c.taux_patronal)}
                          onChange={(e) => setCot(c.id, { taux_patronal: String(fromPct(e.target.value)) })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" inputMode="decimal" className="h-8" value={c.plafond ?? ''}
                          onChange={(e) => setCot(c.id, { plafond: e.target.value })} placeholder="aucun" />
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={c.actif}
                          onChange={(e) => setCot(c.id, { actif: e.target.checked })}
                          aria-label={`Activer la cotisation ${c.code}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" disabled={savingC === c.id} onClick={() => saveCotisation(c)} aria-label={`Enregistrer la cotisation ${c.code}`}>
                          {savingC === c.id ? <Spinner /> : <Save className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ITS brackets */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Barème ITS (impôt progressif)</CardTitle>
              <CardDescription>Tranches sur la base imposable (brut − CNPS), taux marginal en %</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={addBar} className="gap-1"><Plus className="h-4 w-4" /> Tranche</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {baremes.length === 0 ? (
              <EmptyState
                icon={Percent}
                title="Aucune tranche définie"
                description="Ajoutez une tranche pour construire le barème ITS."
                action={
                  <Button size="sm" variant="outline" onClick={addBar} className="gap-1">
                    <Plus className="h-4 w-4" /> Tranche
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[160px]">De</TableHead>
                    <TableHead className="w-[160px]">À (vide = ∞)</TableHead>
                    <TableHead className="w-[120px]">Taux %</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baremes.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input type="number" inputMode="decimal" className="h-8" value={b.tranche_min as any}
                          onChange={(e) => setBar(i, { tranche_min: e.target.value })} aria-label={`Début de la tranche ${i + 1}`} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" inputMode="decimal" className="h-8" value={(b.tranche_max ?? '') as any}
                          onChange={(e) => setBar(i, { tranche_max: e.target.value === '' ? null : e.target.value })} placeholder="∞" aria-label={`Fin de la tranche ${i + 1}`} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" inputMode="decimal" step="0.01" className="h-8" value={toPct(b.taux)}
                          onChange={(e) => setBar(i, { taux: fromPct(e.target.value) })} aria-label={`Taux de la tranche ${i + 1}`} />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => delBar(i)} aria-label={`Supprimer la tranche ${i + 1}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex justify-end pt-3">
              <Button onClick={saveBaremes} disabled={savingB} className="gap-2">
                {savingB ? <Spinner /> : <Save className="h-4 w-4" />} Enregistrer le barème
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3-way match tolerance */}
        {match && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rapprochement 3 voies</CardTitle>
              <CardDescription>Tolérances avant alerte/blocage à la création de facture fournisseur</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="match-tol-qte">Tolérance quantité (%)</Label>
                  <Input id="match-tol-qte" type="number" inputMode="decimal" step="0.01" value={toPct(match.qte_tolerance_pct)}
                    onChange={(e) => setMatch({ ...match, qte_tolerance_pct: fromPct(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="match-tol-prix">Tolérance prix (%)</Label>
                  <Input id="match-tol-prix" type="number" inputMode="decimal" step="0.01" value={toPct(match.prix_tolerance_pct)}
                    onChange={(e) => setMatch({ ...match, prix_tolerance_pct: fromPct(e.target.value) })} />
                </div>
              </div>
              <label htmlFor="match-bloquer" className="flex items-center gap-2 text-sm">
                <Checkbox
                  id="match-bloquer"
                  checked={match.bloquer}
                  onChange={(e) => setMatch({ ...match, bloquer: e.target.checked })}
                />
                Bloquer la création de facture en cas d'écart hors tolérance (sinon avertissement seul)
              </label>
              <div className="flex justify-end">
                <Button onClick={saveMatch} disabled={savingM} className="gap-2">
                  {savingM ? <Spinner /> : <Save className="h-4 w-4" />} Enregistrer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </QueryState>
    </div>
  );
}
