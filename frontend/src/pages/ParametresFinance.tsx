import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Percent, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { payrollService, factureFournisseurService } from '@/services/api';
import { useModules } from '@/lib/ModulesContext';
import { libelleParametresFinance } from '@/config/modules';
import { getErrorMessage } from '@/utils/errors';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DocumentCode } from '@/components/ui/document-code';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataCard, ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';

/** Cotisation telle qu'éditée : taux en POURCENTAGE (chaîne saisie), plafond en FCFA entiers. */
interface CotisationRow {
  id: number;
  code: string;
  libelle: string;
  tauxSalarial: string;
  tauxPatronal: string;
  plafond: string;
  actif: boolean;
}

/** Tranche ITS éditée : bornes en FCFA entiers (chaînes de chiffres), taux en %. */
interface BaremeRow {
  key: string;
  min: string;
  max: string;
  taux: string;
}

interface ApiCotisation {
  id: number;
  code: string;
  libelle: string;
  taux_salarial: number | string;
  taux_patronal: number | string;
  plafond: number | string | null;
  actif: boolean;
}

interface ApiBareme {
  id?: number;
  tranche_min: number | string;
  tranche_max: number | string | null;
  taux: number | string;
}

interface MatchConfig {
  qte_tolerance_pct: number;
  prix_tolerance_pct: number;
  bloquer: boolean;
}

/** Fraction stockée (0,063) → pourcentage affiché en décimale française (« 6,3 »), relu par `pctToFraction`. */
const toPct = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 10000) / 100).replace('.', ',') : '';
};
/** Pourcentage saisi (« 6,3 » ou « 6.3 ») → fraction (0,063). */
const pctToFraction = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n / 100 : NaN;
};
/** Montant de l'API (« 2400000.00 ») → chiffres entiers pour `MoneyInput` (qui retire tout non-chiffre). */
const toDigits = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : '';
};

let baremeSeq = 0;
const newKey = () => `tranche-${++baremeSeq}`;

const toCotisationRow = (c: ApiCotisation): CotisationRow => ({
  id: c.id,
  code: c.code,
  libelle: c.libelle,
  tauxSalarial: toPct(c.taux_salarial),
  tauxPatronal: toPct(c.taux_patronal),
  plafond: toDigits(c.plafond),
  actif: c.actif,
});

const toBaremeRow = (b: ApiBareme): BaremeRow => ({
  key: newKey(),
  min: toDigits(b.tranche_min),
  max: toDigits(b.tranche_max),
  taux: toPct(b.taux),
});

const validPct = (v: string) => {
  const f = pctToFraction(v);
  return v.trim() !== '' && Number.isFinite(f) && f >= 0 && f <= 1;
};

interface NewCotisationForm {
  code: string;
  libelle: string;
  tauxSalarial: string;
  tauxPatronal: string;
  plafond: string;
  actif: boolean;
}

const emptyCotisation = (): NewCotisationForm => ({
  code: '',
  libelle: '',
  tauxSalarial: '',
  tauxPatronal: '',
  plafond: '',
  actif: true,
});

type NewCotisationErrors = Partial<Record<'code' | 'libelle' | 'tauxSalarial' | 'tauxPatronal', string>>;

export default function ParametresFinance() {
  // Sans le module Paie (hors périmètre v1), la page ne porte que les achats :
  // ni cartes CNPS/ITS, ni appel à la configuration de la paie.
  const { estModuleActif } = useModules();
  const paieActive = estModuleActif('paie');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [cotisations, setCotisations] = useState<CotisationRow[]>([]);
  const [baremes, setBaremes] = useState<BaremeRow[]>([]);
  const [match, setMatch] = useState<{ qte: string; prix: string; bloquer: boolean } | null>(null);
  const [savingC, setSavingC] = useState<number | null>(null);
  const [savingB, setSavingB] = useState(false);
  const [savingM, setSavingM] = useState(false);

  // Nouvelle cotisation (U-11)
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCot, setNewCot] = useState<NewCotisationForm>(emptyCotisation);
  const [newCotErrors, setNewCotErrors] = useState<NewCotisationErrors>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, mc] = (await Promise.all([
        paieActive ? payrollService.getConfig() : Promise.resolve(null),
        factureFournisseurService.getMatchConfig(),
      ])) as [
        { cotisations?: ApiCotisation[]; baremes?: ApiBareme[] } | null,
        MatchConfig | null,
      ];
      setCotisations((cfg?.cotisations ?? []).map(toCotisationRow));
      setBaremes((cfg?.baremes ?? []).map(toBaremeRow));
      setMatch(
        mc
          ? { qte: toPct(mc.qte_tolerance_pct), prix: toPct(mc.prix_tolerance_pct), bloquer: !!mc.bloquer }
          : null
      );
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [paieActive]);

  useEffect(() => {
    void load();
  }, [load]);

  // ===== Cotisations =====
  const setCot = (id: number, patch: Partial<CotisationRow>) =>
    setCotisations((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const saveCotisation = async (c: CotisationRow) => {
    if (!validPct(c.tauxSalarial) || !validPct(c.tauxPatronal)) {
      toast.error(`Cotisation ${c.code} : saisissez des taux entre 0 et 100 %.`);
      return;
    }
    setSavingC(c.id);
    try {
      await payrollService.updateCotisation(c.id, {
        taux_salarial: pctToFraction(c.tauxSalarial),
        taux_patronal: pctToFraction(c.tauxPatronal),
        plafond: c.plafond === '' ? null : Number(c.plafond),
        actif: c.actif,
      });
      toast.success(`Cotisation ${c.code} enregistrée`);
    } catch (e) {
      toast.error(getErrorMessage(e, `Impossible d’enregistrer la cotisation ${c.code}. Réessayez.`));
    } finally {
      setSavingC(null);
    }
  };

  const openCreate = () => {
    setNewCot(emptyCotisation());
    setNewCotErrors({});
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (creating) return;
    const code = newCot.code.trim().toUpperCase();
    const errors: NewCotisationErrors = {};
    if (!/^[A-Z0-9_]+$/.test(code)) errors.code = 'Saisissez un code en majuscules, chiffres ou « _ » (ex. : CNPS_RET).';
    if (!newCot.libelle.trim()) errors.libelle = 'Saisissez le libellé de la cotisation.';
    if (!validPct(newCot.tauxSalarial)) errors.tauxSalarial = 'Saisissez un taux entre 0 et 100 %.';
    if (!validPct(newCot.tauxPatronal)) errors.tauxPatronal = 'Saisissez un taux entre 0 et 100 %.';
    setNewCotErrors(errors);
    const first = (['code', 'libelle', 'tauxSalarial', 'tauxPatronal'] as const).find((k) => errors[k]);
    if (first) {
      document.getElementById(`cot-${first}`)?.focus();
      return;
    }
    setCreating(true);
    try {
      await payrollService.createCotisation({
        code,
        libelle: newCot.libelle.trim(),
        // Taux saisis en pourcentage, envoyés en fraction (6,3 % → 0,063).
        taux_salarial: pctToFraction(newCot.tauxSalarial),
        taux_patronal: pctToFraction(newCot.tauxPatronal),
        plafond: newCot.plafond === '' ? null : Number(newCot.plafond),
        actif: newCot.actif,
      });
      toast.success(`Cotisation ${code} ajoutée`);
      setCreateOpen(false);
      void load();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible d’ajouter la cotisation. Réessayez.'));
    } finally {
      setCreating(false);
    }
  };

  // ===== Barème ITS =====
  const setBar = (key: string, patch: Partial<BaremeRow>) =>
    setBaremes((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addBar = () =>
    setBaremes((bs) => [...bs, { key: newKey(), min: bs.length ? bs[bs.length - 1].max : '0', max: '', taux: '' }]);
  const delBar = (key: string) => setBaremes((bs) => bs.filter((b) => b.key !== key));

  const saveBaremes = async () => {
    const invalid = baremes.findIndex((b) => !validPct(b.taux));
    if (invalid >= 0) {
      toast.error(`Tranche ${invalid + 1} : saisissez un taux entre 0 et 100 %.`);
      return;
    }
    setSavingB(true);
    try {
      await payrollService.replaceBaremes(
        baremes.map((b) => ({
          tranche_min: Number(b.min) || 0,
          tranche_max: b.max === '' ? null : Number(b.max),
          taux: pctToFraction(b.taux),
        }))
      );
      toast.success('Barème ITS enregistré');
      void load();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible d’enregistrer le barème ITS. Réessayez.'));
    } finally {
      setSavingB(false);
    }
  };

  // ===== Contrôle commande, réception, facture =====
  const saveMatch = async () => {
    if (!match) return;
    if (!validPct(match.qte) || !validPct(match.prix)) {
      toast.error('Saisissez des tolérances entre 0 et 100 %.');
      return;
    }
    setSavingM(true);
    try {
      await factureFournisseurService.updateMatchConfig({
        qte_tolerance_pct: pctToFraction(match.qte),
        prix_tolerance_pct: pctToFraction(match.prix),
        bloquer: match.bloquer,
      });
      toast.success('Tolérances enregistrées');
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible d’enregistrer les tolérances. Réessayez.'));
    } finally {
      setSavingM(false);
    }
  };

  // Champs d'une cotisation, partagés entre le tableau (bureau) et la carte (téléphone).
  const cotisationFields = (c: CotisationRow, withLabels: boolean) => {
    const field = (label: string, control: ReactNode) =>
      withLabels ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {label}
          {control}
        </label>
      ) : (
        control
      );
    return {
      salarial: field(
        'Taux salarial (%)',
        <Input
          type="text"
          inputMode="decimal"
          className="text-right tabular-nums"
          value={c.tauxSalarial}
          aria-label={`Taux salarial (%) — ${c.libelle}`}
          onChange={(e) => setCot(c.id, { tauxSalarial: e.target.value })}
        />
      ),
      patronal: field(
        'Taux patronal (%)',
        <Input
          type="text"
          inputMode="decimal"
          className="text-right tabular-nums"
          value={c.tauxPatronal}
          aria-label={`Taux patronal (%) — ${c.libelle}`}
          onChange={(e) => setCot(c.id, { tauxPatronal: e.target.value })}
        />
      ),
      plafond: field(
        'Plafond mensuel',
        <MoneyInput
          value={c.plafond}
          aria-label={`Plafond mensuel — ${c.libelle}`}
          placeholder="Sans plafond"
          onChange={(v) => setCot(c.id, { plafond: v })}
        />
      ),
      actif: (
        <label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={c.actif}
            onChange={(e) => setCot(c.id, { actif: e.target.checked })}
            aria-label={withLabels ? undefined : `Cotisation ${c.code} active`}
          />
          {withLabels ? 'Active' : <span className="sr-only">Active</span>}
        </label>
      ),
      save: (
        <Button
          size={withLabels ? 'touch' : 'icon'}
          variant="outline"
          disabled={savingC === c.id}
          onClick={() => void saveCotisation(c)}
          aria-label={withLabels ? undefined : `Enregistrer la cotisation ${c.code}`}
          title={withLabels ? undefined : `Enregistrer la cotisation ${c.code}`}
        >
          {savingC === c.id ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {withLabels && <span className="ml-2">Enregistrer la cotisation</span>}
        </Button>
      ),
    };
  };

  return (
    <PageShell
      title={libelleParametresFinance(paieActive)}
      width="wide"
      description={
        paieActive
          ? 'Taux légaux de la paie (CNPS, ITS) et tolérances du contrôle commande, réception, facture'
          : 'Tolérances du contrôle commande, réception, facture'
      }
    >
      <QueryState
        loading={loading}
        error={error}
        errorTitle="Impossible de charger les paramètres"
        onRetry={() => void load()}
        skeleton={<TableSkeleton rows={5} columns={6} />}
      >
        {paieActive && (
          <>
        {/* Cotisations sociales */}
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="space-y-1">
              <CardTitle>Cotisations sociales (CNPS)</CardTitle>
              <CardDescription>
                Taux salarial et patronal en %, plafond mensuel facultatif. Retenues sur chaque bulletin de paie.
              </CardDescription>
            </div>
            <Button variant="outline" size="touch" onClick={openCreate} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Ajouter une cotisation
            </Button>
          </CardHeader>
          <CardContent>
            {cotisations.length === 0 ? (
              <EmptyState
                icon={Percent}
                title="Aucune cotisation configurée"
                description="Les cotisations (CNPS…) sont retenues sur chaque bulletin de paie : sans elles, les bulletins sont calculés sans retenue sociale"
                action={
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Ajouter une cotisation
                  </Button>
                }
              />
            ) : (
              <ResponsiveTable
                table={
                  <Table aria-label="Cotisations sociales">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Libellé</TableHead>
                        <TableHead numeric className="w-28">
                          Salarial (%)
                        </TableHead>
                        <TableHead numeric className="w-28">
                          Patronal (%)
                        </TableHead>
                        <TableHead className="w-44">Plafond mensuel</TableHead>
                        <TableHead className="w-20">Active</TableHead>
                        <TableHead className="w-14">
                          <span className="sr-only">Enregistrer</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cotisations.map((c) => {
                        const f = cotisationFields(c, false);
                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <DocumentCode>{c.code}</DocumentCode>
                            </TableCell>
                            <TableCell>{c.libelle}</TableCell>
                            <TableCell>{f.salarial}</TableCell>
                            <TableCell>{f.patronal}</TableCell>
                            <TableCell>{f.plafond}</TableCell>
                            <TableCell>{f.actif}</TableCell>
                            <TableCell>{f.save}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                }
                cards={cotisations.map((c) => {
                  const f = cotisationFields(c, true);
                  return (
                    <DataCard key={c.id} title={`${c.code} — ${c.libelle}`} actions={f.save}>
                      <div className="grid grid-cols-2 gap-3">
                        {f.salarial}
                        {f.patronal}
                        <div className="col-span-2">{f.plafond}</div>
                        <div className="col-span-2">{f.actif}</div>
                      </div>
                    </DataCard>
                  );
                })}
              />
            )}
          </CardContent>
        </Card>

        {/* Barème ITS */}
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="space-y-1">
              <CardTitle>Barème ITS (impôt progressif)</CardTitle>
              <CardDescription>
                Tranches mensuelles sur la base imposable (brut − CNPS), taux marginal en %
              </CardDescription>
            </div>
            <Button variant="outline" size="touch" onClick={addBar} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Ajouter une tranche
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {baremes.length === 0 ? (
              <EmptyState
                icon={Percent}
                title="Aucune tranche définie"
                description="Le barème ITS calcule l’impôt retenu sur chaque bulletin : ajoutez les tranches en vigueur"
                action={
                  <Button variant="outline" onClick={addBar}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Ajouter une tranche
                  </Button>
                }
              />
            ) : (
              <ol className="space-y-3 sm:space-y-2" aria-label="Tranches du barème ITS">
                <li aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_2.5rem] gap-3 px-1 text-xs font-medium text-muted-foreground sm:grid">
                  <span>De</span>
                  <span>À</span>
                  <span className="text-right">Taux (%)</span>
                  <span />
                </li>
                {baremes.map((b, i) => (
                  <li
                    key={b.key}
                    className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_2.5rem] sm:items-center sm:rounded-none sm:border-0 sm:p-0"
                  >
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:block">
                      <span className="sm:sr-only">De</span>
                      <MoneyInput
                        value={b.min}
                        aria-label={`Début de la tranche ${i + 1}`}
                        onChange={(v) => setBar(b.key, { min: v })}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:block">
                      <span className="sm:sr-only">À</span>
                      <MoneyInput
                        value={b.max}
                        aria-label={`Fin de la tranche ${i + 1}`}
                        placeholder="Sans plafond"
                        onChange={(v) => setBar(b.key, { max: v })}
                      />
                    </label>
                    <div className="flex items-end gap-3 sm:contents">
                    <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground sm:block">
                      <span className="sm:sr-only">Taux (%)</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="text-right tabular-nums"
                        value={b.taux}
                        aria-label={`Taux de la tranche ${i + 1} (%)`}
                        onChange={(e) => setBar(b.key, { taux: e.target.value })}
                      />
                    </label>
                    <div className="flex items-end justify-end sm:items-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                        onClick={() => delBar(b.key)}
                        aria-label={`Supprimer la tranche ${i + 1}`}
                        title={`Supprimer la tranche ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void saveBaremes()} disabled={savingB} size="touch">
                {savingB ? <Spinner className="mr-2" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
                Enregistrer le barème
              </Button>
            </div>
          </CardContent>
        </Card>

          </>
        )}

        {/* Contrôle commande, réception, facture */}
        {match && (
          <Card>
            <CardHeader>
              <CardTitle>Contrôle commande, réception, facture</CardTitle>
              <CardDescription>
                Écarts tolérés avant alerte ou blocage à la saisie d’une facture fournisseur
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="match-tol-qte">Tolérance sur les quantités (%)</Label>
                  <Input
                    id="match-tol-qte"
                    type="text"
                    inputMode="decimal"
                    className="mt-1 text-right tabular-nums sm:max-w-[8rem]"
                    value={match.qte}
                    onChange={(e) => setMatch({ ...match, qte: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="match-tol-prix">Tolérance sur les prix (%)</Label>
                  <Input
                    id="match-tol-prix"
                    type="text"
                    inputMode="decimal"
                    className="mt-1 text-right tabular-nums sm:max-w-[8rem]"
                    value={match.prix}
                    onChange={(e) => setMatch({ ...match, prix: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-0.5">
                <label htmlFor="match-bloquer" className="flex items-start gap-2 text-sm">
                  <Checkbox
                    id="match-bloquer"
                    checked={match.bloquer}
                    onChange={(e) => setMatch({ ...match, bloquer: e.target.checked })}
                    aria-describedby="match-bloquer-help"
                    className="mt-0.5"
                  />
                  Bloquer la facture fournisseur si un écart dépasse la tolérance
                </label>
                {/* Retrait = case (16 px) + écart (8 px) : l'aide s'aligne sur le libellé. */}
                <p id="match-bloquer-help" className="ps-6 text-sm text-muted-foreground">
                  Sinon, un avertissement s’affiche
                </p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => void saveMatch()} disabled={savingM} size="touch">
                  {savingM ? <Spinner className="mr-2" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Enregistrer les tolérances
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </QueryState>

      <Dialog open={createOpen} onOpenChange={(o) => !creating && setCreateOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitCreate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Ajouter une cotisation</DialogTitle>
              <DialogDescription>
                Saisissez les taux en pourcentage du salaire brut (ex. : 6,3). Les champs marqués d’un * sont
                obligatoires.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cot-code">
                  Code
                  <RequiredMark />
                </Label>
                <Input
                  id="cot-code"
                  autoFocus
                  value={newCot.code}
                  maxLength={30}
                  autoCapitalize="characters"
                  placeholder="Ex. : CNPS_RET"
                  className="mt-1 uppercase"
                  onChange={(e) => {
                    setNewCot((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }));
                    if (newCotErrors.code) setNewCotErrors((er) => ({ ...er, code: undefined }));
                  }}
                  {...fieldErrorProps('cot-code', newCotErrors.code)}
                />
                <FieldError id="cot-code">{newCotErrors.code}</FieldError>
              </div>
              <div>
                <Label htmlFor="cot-libelle">
                  Libellé
                  <RequiredMark />
                </Label>
                <Input
                  id="cot-libelle"
                  value={newCot.libelle}
                  maxLength={120}
                  placeholder="Ex. : CNPS Retraite"
                  className="mt-1"
                  onChange={(e) => {
                    setNewCot((f) => ({ ...f, libelle: e.target.value }));
                    if (newCotErrors.libelle) setNewCotErrors((er) => ({ ...er, libelle: undefined }));
                  }}
                  {...fieldErrorProps('cot-libelle', newCotErrors.libelle)}
                />
                <FieldError id="cot-libelle">{newCotErrors.libelle}</FieldError>
              </div>
              <div>
                <Label htmlFor="cot-tauxSalarial">
                  Taux salarial (%)
                  <RequiredMark />
                </Label>
                <Input
                  id="cot-tauxSalarial"
                  type="text"
                  inputMode="decimal"
                  value={newCot.tauxSalarial}
                  placeholder="6,3"
                  className="mt-1 text-right tabular-nums"
                  onChange={(e) => {
                    setNewCot((f) => ({ ...f, tauxSalarial: e.target.value }));
                    if (newCotErrors.tauxSalarial) setNewCotErrors((er) => ({ ...er, tauxSalarial: undefined }));
                  }}
                  {...fieldErrorProps('cot-tauxSalarial', newCotErrors.tauxSalarial)}
                />
                <FieldError id="cot-tauxSalarial">{newCotErrors.tauxSalarial}</FieldError>
              </div>
              <div>
                <Label htmlFor="cot-tauxPatronal">
                  Taux patronal (%)
                  <RequiredMark />
                </Label>
                <Input
                  id="cot-tauxPatronal"
                  type="text"
                  inputMode="decimal"
                  value={newCot.tauxPatronal}
                  placeholder="7,7"
                  className="mt-1 text-right tabular-nums"
                  onChange={(e) => {
                    setNewCot((f) => ({ ...f, tauxPatronal: e.target.value }));
                    if (newCotErrors.tauxPatronal) setNewCotErrors((er) => ({ ...er, tauxPatronal: undefined }));
                  }}
                  {...fieldErrorProps('cot-tauxPatronal', newCotErrors.tauxPatronal)}
                />
                <FieldError id="cot-tauxPatronal">{newCotErrors.tauxPatronal}</FieldError>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="cot-plafond">Plafond mensuel (facultatif)</Label>
                <MoneyInput
                  id="cot-plafond"
                  value={newCot.plafond}
                  placeholder="Sans plafond"
                  className="mt-1"
                  onChange={(v) => setNewCot((f) => ({ ...f, plafond: v }))}
                />
              </div>
              <label htmlFor="cot-actif" className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  id="cot-actif"
                  checked={newCot.actif}
                  onChange={(e) => setNewCot((f) => ({ ...f, actif: e.target.checked }))}
                />
                Appliquer dès maintenant aux prochains bulletins
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Annuler
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <Spinner className="mr-2" />
                    Ajout…
                  </>
                ) : (
                  'Ajouter la cotisation'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
