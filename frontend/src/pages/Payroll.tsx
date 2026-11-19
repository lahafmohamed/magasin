import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileDown, Plus, Trash2, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { payrollService } from '../services/api';
import { useAuth } from '@/lib/AuthContext';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/loading';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { ToggleChip } from '@/components/ui/choice-chips';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { RequiredMark } from '@/components/ui/required-mark';
import { StatusBadge, getStatusOptions } from '@/components/StatusBadge';
import { formatCurrency, formatDate, formatMonthYear, formatNumber, toNumber } from '../utils/format';
import { PAYMENT_METHOD_OPTIONS } from '@/utils/paymentMethod';
import { getErrorMessage } from '@/utils/errors';

type RunStatut = 'brouillon' | 'valide' | 'paye' | 'annule';

interface PayrollRun {
  id: number;
  numero: string;
  periode: string;
  date_debut: string;
  date_fin: string;
  statut: RunStatut;
  total_brut: string;
  total_commissions: string;
  total_primes: string;
  total_deductions: string;
  total_cnps?: string;
  total_its?: string;
  total_charges_patronales?: string;
  total_net: string;
  nb_bulletins?: string;
  notes: string | null;
}

interface Payslip {
  id: number;
  employe_id: number;
  nom_complet: string;
  matricule: string;
  poste: string | null;
  salaire_base: string;
  commissions: string;
  primes: string;
  deductions: string;
  retenue_cnps: string;
  retenue_its: string;
  cotisations_patronales: string;
  salaire_brut: string;
  salaire_net: string;
  statut: 'en_attente' | 'paye';
}

type RunDetail = PayrollRun & { payslips?: Payslip[] };

interface PayrollConfig {
  cotisations?: Array<{ actif?: boolean }>;
}

const PAYSLIPS_PAGE_SIZE = 50;
const STATUT_FILTERS: ReadonlyArray<{ value: 'all' | RunStatut; label: string }> = [
  { value: 'all', label: 'Tous' },
  ...getStatusOptions('paie'),
];

const n = (v: string | number | null | undefined) => toNumber(v) ?? 0;
const retenuesOf = (cnps: string | number | null | undefined, its: string | number | null | undefined, autres: string | number | null | undefined) =>
  n(cnps) + n(its) + n(autres);

function asRuns(value: unknown): PayrollRun[] {
  if (Array.isArray(value)) return value as PayrollRun[];
  const data = (value as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as PayrollRun[]) : [];
}

/** Rend le focus au bouton du cycle quitté (carte mobile ou ligne de tableau, celui qui est visible). */
function focusRunTrigger(id: number) {
  requestAnimationFrame(() => {
    const triggers = Array.from(document.querySelectorAll<HTMLElement>(`[data-run-id="${id}"]`))
      .map((el) => (el.matches('button, a') ? el : el.closest<HTMLElement>('button, a')))
      .filter((el): el is HTMLElement => !!el);
    triggers.find((el) => el.offsetParent !== null)?.focus();
  });
}

export default function Payroll() {
  const confirm = useConfirm();
  const { hasRole } = useAuth();
  const canOpen = useRouteAccess();
  // L'API refuse la suppression d'un cycle au gérant (DELETE /payroll/:id = admin).
  const canDelete = hasRole('admin');

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filterStatut, setFilterStatut] = useState<'all' | RunStatut>('all');

  const [selected, setSelected] = useState<RunDetail | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [payslipPage, setPayslipPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7));
  const [periodeError, setPeriodeError] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [config, setConfig] = useState<{ loading: boolean; error: unknown; cotisationsActives: number }>({
    loading: false,
    error: null,
    cotisationsActives: 0,
  });

  const [payOpen, setPayOpen] = useState(false);
  const [payMethode, setPayMethode] = useState('virement');

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(asRuns(await payrollService.getAll(1, 100)));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const openRun = async (id: number) => {
    setOpeningId(id);
    try {
      const run = (await payrollService.getById(id)) as RunDetail;
      setPayslipPage(1);
      setSelected(run);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’ouvrir le cycle de paie.'));
    } finally {
      setOpeningId(null);
    }
  };

  const closeRun = () => {
    const id = selected?.id;
    setSelected(null);
    if (id) focusRunTrigger(id);
  };

  const openCreate = async () => {
    setPeriodeError(undefined);
    setCreateOpen(true);
    setConfig({ loading: true, error: null, cotisationsActives: 0 });
    try {
      const cfg = (await payrollService.getConfig()) as PayrollConfig | null;
      const actives = (cfg?.cotisations ?? []).filter((c) => c.actif !== false).length;
      setConfig({ loading: false, error: null, cotisationsActives: actives });
    } catch (err) {
      setConfig({ loading: false, error: err, cotisationsActives: 0 });
    }
  };

  const handleCreate = async () => {
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      setPeriodeError('Saisissez la période au format AAAA-MM, par exemple 2026-10.');
      requestAnimationFrame(() => document.getElementById('periode')?.focus());
      return;
    }
    setBusy(true);
    try {
      const run = (await payrollService.create(periode, notes || undefined)) as RunDetail | null;
      const nb = run?.payslips?.length ?? toNumber(run?.nb_bulletins) ?? 0;
      toast.success(
        run?.numero
          ? `Cycle de paie ${run.numero} généré : ${formatNumber(nb)} ${nb > 1 ? 'bulletins' : 'bulletin'}`
          : 'Cycle de paie généré'
      );
      setCreateOpen(false);
      setNotes('');
      await loadRuns();
      if (run?.id) await openRun(run.id);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible de générer le cycle de paie. Réessayez.'));
    } finally {
      setBusy(false);
    }
  };

  const downloadPayslipPdf = async (payslipId: number, nom: string) => {
    try {
      const blob = await payrollService.getPayslipPdf(payslipId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bulletin-${nom.replace(/\s+/g, '_')}-${payslipId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de télécharger le bulletin. Réessayez.'));
    }
  };

  const runAction = async (fn: () => Promise<unknown>, okMsg: string, errMsg: string) => {
    setBusy(true);
    try {
      const updated = (await fn()) as RunDetail | null;
      toast.success(okMsg);
      await loadRuns();
      if (updated?.id) setSelected(updated);
      return true;
    } catch (e) {
      toast.error(getErrorMessage(e, errMsg));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (r: PayrollRun) => {
    if (
      !(await confirm({
        title: `Supprimer le cycle de paie ${r.numero} ?`,
        description: `Le cycle ${r.numero} (brouillon) et ses bulletins seront supprimés définitivement.`,
        confirmLabel: 'Supprimer le cycle',
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await payrollService.remove(r.id);
      toast.success(`Cycle ${r.numero} supprimé`);
      await loadRuns();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible de supprimer le cycle de paie.'));
    } finally {
      setBusy(false);
    }
  };

  /* ================= Détail d'un cycle ================= */

  if (selected) {
    const payslips = selected.payslips ?? [];
    const payslipTotalPages = Math.ceil(payslips.length / PAYSLIPS_PAGE_SIZE);
    const pagedPayslips =
      payslipTotalPages > 1
        ? payslips.slice((payslipPage - 1) * PAYSLIPS_PAGE_SIZE, payslipPage * PAYSLIPS_PAGE_SIZE)
        : payslips;
    const netAPayer = formatCurrency(n(selected.total_net));

    const validate = async () => {
      if (
        !(await confirm({
          title: `Valider le cycle de paie ${selected.numero} ?`,
          description: `Le cycle ${selected.numero} (net à payer : ${netAPayer}) sera validé : ses bulletins ne pourront plus être modifiés.`,
          confirmLabel: 'Valider le cycle',
        }))
      )
        return;
      await runAction(
        () => payrollService.validate(selected.id),
        `Cycle ${selected.numero} validé`,
        'Impossible de valider le cycle de paie.'
      );
    };

    const cancelRun = async () => {
      if (
        !(await confirm({
          title: `Annuler le cycle de paie ${selected.numero} ?`,
          description: `Le cycle ${selected.numero} et ses bulletins seront annulés.`,
          confirmLabel: 'Annuler le cycle',
          cancelLabel: 'Garder le cycle',
          destructive: true,
        }))
      )
        return;
      await runAction(
        () => payrollService.cancel(selected.id),
        `Cycle ${selected.numero} annulé`,
        'Impossible d’annuler le cycle de paie.'
      );
    };

    const markPaid = async () => {
      const ok = await runAction(
        () => payrollService.markPaid(selected.id, payMethode),
        `Cycle ${selected.numero} marqué comme payé`,
        'Impossible d’enregistrer le paiement du cycle.'
      );
      if (ok) setPayOpen(false);
    };

    const primaryAction =
      selected.statut === 'brouillon' ? (
        <Button size="touch" className="gap-2" disabled={busy} onClick={() => void validate()}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Valider le cycle
        </Button>
      ) : selected.statut === 'valide' ? (
        <Button
          size="touch"
          className="gap-2"
          disabled={busy}
          onClick={() => {
            setPayMethode('virement');
            setPayOpen(true);
          }}
        >
          <Wallet className="h-4 w-4" aria-hidden="true" /> Marquer comme payé
        </Button>
      ) : undefined;

    return (
      <PageShell
        title={selected.numero}
        documentTitle={`Cycle de paie ${selected.numero}`}
        width="wide"
        focusOnMount
        onBack={closeRun}
        backLabel="Retour aux cycles de paie"
        meta={<StatusBadge type="paie" statut={selected.statut} size="md" />}
        description={`${formatMonthYear(selected.periode)} · du ${formatDate(selected.date_debut)} au ${formatDate(selected.date_fin)}`}
        primaryAction={primaryAction}
        moreActions={[
          (selected.statut === 'brouillon' || selected.statut === 'valide') && {
            label: 'Annuler le cycle',
            icon: XCircle,
            destructive: true,
            disabled: busy,
            onSelect: () => void cancelRun(),
          },
        ]}
      >
        {/* Le net à payer conclut le calcul : dernier, plus grand, sur deux colonnes. */}
        <StatGrid className="grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-5">
          <StatTile label="Salaire brut" value={n(selected.total_brut)} format="money" />
          <StatTile label="Commissions" value={n(selected.total_commissions)} format="money" />
          <StatTile
            label="Retenues (CNPS, ITS et autres)"
            value={retenuesOf(selected.total_cnps, selected.total_its, selected.total_deductions)}
            format="money"
          />
          <StatTile
            label="Net à payer"
            size="lg"
            value={n(selected.total_net)}
            format="money"
            className="lg:col-span-2"
          />
        </StatGrid>

        <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
          <CardHeader className="max-md:px-0">
            <CardTitle>Bulletins</CardTitle>
            <CardDescription>
              {payslips.length > 0
                ? `${formatNumber(payslips.length)} ${payslips.length > 1 ? 'bulletins' : 'bulletin'} dans ce cycle`
                : 'Aucun bulletin dans ce cycle'}
            </CardDescription>
          </CardHeader>
          <CardContent inset="flush">
            {payslips.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Aucun bulletin dans ce cycle"
                description="Aucun employé actif n’a été retenu lors de la génération de la période"
                compact
              />
            ) : (
              <ResponsiveTable
                table={
                  <Table aria-label="Bulletins du cycle">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employé</TableHead>
                        <TableHead numeric>Salaire de base</TableHead>
                        <TableHead numeric>Commissions</TableHead>
                        <TableHead numeric>Primes</TableHead>
                        <TableHead numeric>CNPS</TableHead>
                        <TableHead numeric>ITS</TableHead>
                        <TableHead numeric>Autres retenues</TableHead>
                        <TableHead numeric>Net à payer</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>
                          <span className="sr-only">Bulletin PDF</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedPayslips.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="font-medium">{p.nom_complet}</div>
                            <div className="text-xs text-muted-foreground">
                              <DocumentCode>{p.matricule}</DocumentCode>
                              {p.poste ? ` · ${p.poste}` : ''}
                            </div>
                          </TableCell>
                          <TableCell numeric>
                            <Money value={p.salaire_base} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={p.commissions} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={p.primes} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={p.retenue_cnps} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={p.retenue_its} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={p.deductions} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={p.salaire_net} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge type="bulletin" statut={p.statut} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Télécharger le bulletin de ${p.nom_complet} (PDF)`}
                              title="Télécharger le bulletin (PDF)"
                              onClick={() => void downloadPayslipPdf(p.id, p.nom_complet)}
                            >
                              <FileDown className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
                cards={pagedPayslips.map((p) => (
                  <DataCard
                    key={p.id}
                    title={p.nom_complet}
                    badge={<StatusBadge type="bulletin" statut={p.statut} />}
                    actions={
                      <Button
                        variant="outline"
                        size="touch"
                        className="gap-2"
                        onClick={() => void downloadPayslipPdf(p.id, p.nom_complet)}
                      >
                        <FileDown className="h-4 w-4" aria-hidden="true" /> Télécharger le bulletin
                      </Button>
                    }
                  >
                    <DataCardRow label="Matricule" value={<DocumentCode>{p.matricule}</DocumentCode>} />
                    <DataCardRow label="Salaire brut" value={<Money value={p.salaire_brut} />} numeric />
                    <DataCardRow
                      label="Retenues"
                      value={<Money value={retenuesOf(p.retenue_cnps, p.retenue_its, p.deductions)} />}
                      numeric
                    />
                    <DataCardRow label="Net à payer" value={<Money value={p.salaire_net} />} numeric />
                  </DataCard>
                ))}
              />
            )}
          </CardContent>
        </Card>
        {payslipTotalPages > 1 && (
          <Pagination
            page={payslipPage}
            totalPages={payslipTotalPages}
            total={payslips.length}
            limit={PAYSLIPS_PAGE_SIZE}
            onPageChange={setPayslipPage}
          />
        )}

        {/* Paiement du cycle : le mode de paiement est un choix, plus un virement imposé. */}
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Marquer le cycle {selected.numero} comme payé ?</DialogTitle>
              <DialogDescription>
                Le paiement de {netAPayer} sera enregistré pour les {formatNumber(payslips.length)}{' '}
                {payslips.length > 1 ? 'bulletins' : 'bulletin'} du cycle
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="paie-methode">Mode de paiement</Label>
              <Select value={payMethode} onValueChange={setPayMethode}>
                <SelectTrigger id="paie-methode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)} disabled={busy}>
                Annuler
              </Button>
              <Button onClick={() => void markPaid()} disabled={busy} className="gap-2">
                {busy && <Spinner />} Marquer comme payé
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    );
  }

  /* ================= Liste des cycles ================= */

  const filtered = filterStatut === 'all' ? runs : runs.filter((r) => r.statut === filterStatut);

  const deleteButton = (r: PayrollRun, touch: boolean) =>
    canDelete && r.statut === 'brouillon' ? (
      <Button
        size={touch ? 'icon-touch' : 'icon'}
        variant={touch ? 'outline' : 'ghost'}
        className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
        aria-label={`Supprimer le cycle de paie ${r.numero}`}
        title="Supprimer le cycle"
        disabled={busy}
        onClick={() => void handleDelete(r)}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    ) : null;

  /** Clic sur la ligne = confort souris ; le numéro est le vrai contrôle (clavier). */
  const onRowClick = (ev: MouseEvent<HTMLTableRowElement>, r: PayrollRun) => {
    if ((ev.target as HTMLElement).closest('a,button,input,select,textarea')) return;
    void openRun(r.id);
  };

  return (
    <PageShell
      title="Paie"
      description="Un cycle par mois : les bulletins de tous les employés actifs, validés puis payés"
      primaryAction={
        <Button size="touch" className="gap-2" onClick={() => void openCreate()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Générer un cycle de paie
        </Button>
      }
    >
      {!loading && !error && runs.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
          {STATUT_FILTERS.map((f) => (
            <ToggleChip key={f.value} pressed={filterStatut === f.value} onPressedChange={() => setFilterStatut(f.value)}>
              {f.label}
            </ToggleChip>
          ))}
        </div>
      )}

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="flush">
          <QueryState
            loading={loading}
            error={error}
            isEmpty={runs.length === 0}
            onRetry={() => void loadRuns()}
            skeleton={<TableSkeleton rows={6} columns={6} />}
            errorTitle="Impossible de charger les cycles de paie"
            emptyIcon={Wallet}
            emptyTitle="Aucun cycle de paie"
            emptyDescription="Générez un cycle pour créer les bulletins de tous les employés actifs sur une période"
            emptyAction={
              <Button className="gap-2" onClick={() => void openCreate()}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Générer un cycle de paie
              </Button>
            }
          >
            {filtered.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Aucun cycle avec ce statut"
                action={
                  <Button variant="outline" onClick={() => setFilterStatut('all')}>
                    Afficher tous les cycles
                  </Button>
                }
              />
            ) : (
              <ResponsiveTable
                cards={filtered.map((r) => (
                  <DataCard
                    key={r.id}
                    onClick={() => void openRun(r.id)}
                    linkLabel={`Ouvrir le cycle de paie ${r.numero}`}
                    title={
                      <span data-run-id={r.id} className="inline-flex items-center gap-2">
                        <DocumentCode>{r.numero}</DocumentCode>
                        {openingId === r.id && <Spinner />}
                      </span>
                    }
                    badge={<StatusBadge type="paie" statut={r.statut} />}
                    actions={deleteButton(r, true)}
                  >
                    <DataCardRow label="Période" value={formatMonthYear(r.periode)} />
                    <DataCardRow label="Bulletins" value={formatNumber(n(r.nb_bulletins))} numeric />
                    <DataCardRow label="Net à payer" value={<Money value={r.total_net} />} numeric />
                  </DataCard>
                ))}
                table={
                  <Table aria-label="Cycles de paie">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Numéro</TableHead>
                        <TableHead>Période</TableHead>
                        <TableHead numeric>Bulletins</TableHead>
                        <TableHead numeric>Net à payer</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => (
                        <TableRow key={r.id} className="cursor-pointer" onClick={(ev) => onRowClick(ev, r)}>
                          <TableCell>
                            <button
                              type="button"
                              data-run-id={r.id}
                              onClick={() => void openRun(r.id)}
                              aria-label={`Ouvrir le cycle de paie ${r.numero}`}
                              className="inline-flex items-center gap-2 whitespace-nowrap rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <DocumentCode>{r.numero}</DocumentCode>
                              {openingId === r.id && <Spinner />}
                            </button>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatMonthYear(r.periode)}</TableCell>
                          <TableCell numeric>{formatNumber(n(r.nb_bulletins))}</TableCell>
                          <TableCell numeric>
                            <Money value={r.total_net} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge type="paie" statut={r.statut} />
                          </TableCell>
                          <TableCell className="w-px whitespace-nowrap text-right">{deleteButton(r, false)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
              />
            )}
          </QueryState>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Générer un cycle de paie</DialogTitle>
            <DialogDescription>
              Un bulletin sera créé pour chaque employé actif, avec son salaire de base et les commissions de la période
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            {config.loading ? null : config.error ? (
              <p className="text-sm text-muted-foreground">Impossible de vérifier les cotisations CNPS paramétrées</p>
            ) : (
              config.cotisationsActives === 0 && (
                <div role="note" className="rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
                  <p>Aucune cotisation CNPS n’est paramétrée : les bulletins seraient calculés sans retenue.</p>
                  {canOpen('/admin/parametres-finance') ? (
                    <Link to="/admin/parametres-finance" className="mt-1 inline-block font-medium underline underline-offset-4">
                      Paramétrer les cotisations
                    </Link>
                  ) : (
                    <p className="mt-1">Demandez à l’administrateur de les paramétrer</p>
                  )}
                </div>
              )
            )}
            <div className="space-y-1.5">
              <Label htmlFor="periode">
                Période <RequiredMark />
              </Label>
              <Input
                id="periode"
                type="month"
                value={periode}
                onChange={(e) => {
                  setPeriode(e.target.value);
                  setPeriodeError(undefined);
                }}
                {...fieldErrorProps('periode', periodeError)}
              />
              <FieldError id="periode">{periodeError}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
                Annuler
              </Button>
              <Button type="submit" disabled={busy} className="gap-2">
                {busy && <Spinner />} Générer le cycle
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
