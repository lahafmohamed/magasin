import { useState, useEffect, useCallback } from 'react';
import { Plus, Wallet, CheckCircle2, BadgeDollarSign, XCircle, Trash2, ArrowLeft, FileDown } from 'lucide-react';
import { payrollService } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/loading';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination } from '@/components/ui/pagination';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { formatCurrency, formatDate } from '../utils/format';
import { getErrorMessage } from '@/utils/errors';

interface PayrollRun {
  id: number;
  numero: string;
  periode: string;
  date_debut: string;
  date_fin: string;
  statut: 'brouillon' | 'valide' | 'paye' | 'annule';
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

const STATUT_LABEL: Record<string, string> = {
  brouillon: 'Brouillon', valide: 'Validé', paye: 'Payé', annule: 'Annulé', en_attente: 'En attente',
};
const STATUT_VARIANT: Record<string, 'secondary' | 'info' | 'success' | 'destructive' | 'warning'> = {
  brouillon: 'secondary', valide: 'info', paye: 'success', annule: 'destructive', en_attente: 'warning',
};

function StatutBadge({ statut }: { statut: string }) {
  return (
    <Badge variant={STATUT_VARIANT[statut] ?? 'outline'}>
      {STATUT_LABEL[statut] || statut}
    </Badge>
  );
}

const PAYSLIPS_PAGE_SIZE = 50;

export default function Payroll() {
  const confirm = useConfirm();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<(PayrollRun & { payslips: Payslip[] }) | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterStatut, setFilterStatut] = useState<'all' | PayrollRun['statut']>('all');
  const [payslipPage, setPayslipPage] = useState(1);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await payrollService.getAll(1, 100);
      setRuns(Array.isArray(data) ? data : data?.data ?? []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const openRun = async (id: number) => {
    try {
      setPayslipPage(1);
      setSelected(await payrollService.getById(id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors du chargement du cycle'));
    }
  };

  const handleCreate = async () => {
    if (!/^\d{4}-\d{2}$/.test(periode)) { toast.error("Période au format 'AAAA-MM' requise"); return; }
    setBusy(true);
    try {
      const run = await payrollService.create(periode, notes || undefined);
      toast.success('Cycle de paie généré');
      setCreateOpen(false);
      setNotes('');
      await loadRuns();
      if (run?.id) await openRun(run.id);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Erreur lors de la génération'));
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
      toast.error(getErrorMessage(err, 'Erreur lors du téléchargement du bulletin'));
    }
  };

  const runAction = async (fn: () => Promise<any>, okMsg: string) => {
    setBusy(true);
    try {
      const updated = await fn();
      toast.success(okMsg);
      await loadRuns();
      if (updated?.id) setSelected(updated);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Action impossible'));
    } finally {
      setBusy(false);
    }
  };

  // ---------- Detail view ----------
  if (selected) {
    const payslips = selected.payslips ?? [];
    const payslipTotalPages = Math.ceil(payslips.length / PAYSLIPS_PAGE_SIZE);
    const pagedPayslips = payslipTotalPages > 1
      ? payslips.slice((payslipPage - 1) * PAYSLIPS_PAGE_SIZE, payslipPage * PAYSLIPS_PAGE_SIZE)
      : payslips;

    return (
      <div className="space-y-4 p-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Button>

        <PageHeader
          title={selected.numero}
          description={`Période ${selected.periode} · ${formatDate(selected.date_debut)} → ${formatDate(selected.date_fin)}`}
          actions={
            <>
              <StatutBadge statut={selected.statut} />
              {selected.statut === 'brouillon' && (
                <Button size="sm" disabled={busy} onClick={async () => {
                  if (!(await confirm({ title: 'Valider ce cycle de paie ?', description: `Le cycle ${selected.numero} (net à payer : ${formatCurrency(Number(selected.total_net))}) sera validé.`, confirmLabel: 'Valider' }))) return;
                  runAction(() => payrollService.validate(selected.id), 'Cycle validé');
                }}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Valider
                </Button>
              )}
              {selected.statut === 'valide' && (
                <Button size="sm" disabled={busy} onClick={async () => {
                  if (!(await confirm({ title: 'Marquer ce cycle comme payé ?', description: `Le paiement de ${formatCurrency(Number(selected.total_net))} (virement) sera enregistré pour le cycle ${selected.numero}.`, confirmLabel: 'Marquer payé' }))) return;
                  runAction(() => payrollService.markPaid(selected.id, 'virement'), 'Cycle payé');
                }}>
                  <BadgeDollarSign className="mr-1 h-4 w-4" /> Marquer payé
                </Button>
              )}
              {(selected.statut === 'brouillon' || selected.statut === 'valide') && (
                <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                  if (!(await confirm({ title: 'Annuler ce cycle de paie ?', description: `Le cycle ${selected.numero} sera annulé.`, confirmLabel: 'Annuler le cycle', cancelLabel: 'Retour', destructive: true }))) return;
                  runAction(() => payrollService.cancel(selected.id), 'Cycle annulé');
                }}>
                  <XCircle className="mr-1 h-4 w-4" /> Annuler
                </Button>
              )}
            </>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Brut</p><p className="num font-semibold">{formatCurrency(Number(selected.total_brut))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Commissions</p><p className="num font-semibold">{formatCurrency(Number(selected.total_commissions))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Retenues (CNPS+ITS+autres)</p><p className="num font-semibold">{formatCurrency(Number(selected.total_cnps || 0) + Number(selected.total_its || 0) + Number(selected.total_deductions))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Net à payer</p><p className="num font-semibold text-primary">{formatCurrency(Number(selected.total_net))}</p></div>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employé</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Commissions</TableHead>
                <TableHead className="text-right">Primes</TableHead>
                <TableHead className="text-right">CNPS</TableHead>
                <TableHead className="text-right">ITS</TableHead>
                <TableHead className="text-right">Déductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedPayslips.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.nom_complet}</div>
                    <div className="text-xs text-muted-foreground">{p.matricule}{p.poste ? ` · ${p.poste}` : ''}</div>
                  </TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(p.salaire_base))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(p.commissions))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(p.primes))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(p.retenue_cnps))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(p.retenue_its))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(p.deductions))}</TableCell>
                  <TableCell className="text-right num font-medium">{formatCurrency(Number(p.salaire_net))}</TableCell>
                  <TableCell><StatutBadge statut={p.statut} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" aria-label={`Télécharger le bulletin PDF de ${p.nom_complet}`} title="Télécharger le bulletin PDF" onClick={() => downloadPayslipPdf(p.id, p.nom_complet)}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {payslips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="p-0 sm:p-0">
                    <EmptyState
                      icon={Wallet}
                      title="Aucun bulletin dans ce cycle"
                      description="Aucun employé actif n'a été retenu lors de la génération de la période."
                      className="py-8"
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {payslipTotalPages > 1 && (
          <Pagination
            page={payslipPage}
            totalPages={payslipTotalPages}
            total={payslips.length}
            limit={PAYSLIPS_PAGE_SIZE}
            onPageChange={setPayslipPage}
          />
        )}
        {selected.statut === 'brouillon' && (
          <p className="text-xs text-muted-foreground">
            Astuce: les primes/déductions par bulletin sont modifiables via l'API tant que le cycle est en brouillon.
          </p>
        )}
      </div>
    );
  }

  // ---------- List view ----------
  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Paie"
        icon={Wallet}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Générer un cycle
          </Button>
        }
      />

      {/* Statut filter */}
      {!loading && !error && runs.length > 0 && (
        <Tabs value={filterStatut} onValueChange={(v) => setFilterStatut(v as 'all' | PayrollRun['statut'])}>
          <TabsList>
            {(['all', 'brouillon', 'valide', 'paye', 'annule'] as const).map((s) => (
              <TabsTrigger key={s} value={s}>
                {s === 'all' ? 'Tous' : STATUT_LABEL[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <QueryState
        loading={loading}
        error={error}
        isEmpty={runs.length === 0}
        onRetry={loadRuns}
        skeleton={<TableSkeleton rows={6} columns={6} />}
        emptyIcon={Wallet}
        emptyTitle="Aucun cycle de paie"
        emptyDescription="Générez votre premier cycle de paie pour une période."
      >
        {(() => {
          const filtered = filterStatut === 'all' ? runs : runs.filter((r) => r.statut === filterStatut);
          if (filtered.length === 0) {
            return <EmptyState icon={Wallet} title="Aucun cycle pour ce statut" />;
          }
          const deleteBtn = (r: PayrollRun) => r.statut === 'brouillon' && (
            <Button
              size="icon" variant="ghost"
              aria-label={`Supprimer le cycle de paie ${r.numero}`}
              onClick={async (e) => {
                e.stopPropagation();
                if (!(await confirm({ title: 'Supprimer ce cycle de paie ?', description: `Le cycle ${r.numero} (brouillon) et ses bulletins seront supprimés. Cette action est irréversible.`, confirmLabel: 'Supprimer', destructive: true }))) return;
                runAction(() => payrollService.remove(r.id).then(() => ({})), 'Cycle supprimé');
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          );
          return (
            <ResponsiveTable
              cards={filtered.map((r) => (
                <DataCard key={r.id} onClick={() => openRun(r.id)} title={r.numero} badge={<StatutBadge statut={r.statut} />}>
                  <DataCardRow label="Période" value={r.periode} />
                  <DataCardRow label="Bulletins" value={<span className="num">{r.nb_bulletins ?? '—'}</span>} />
                  <DataCardRow label="Net" value={<span className="num font-semibold">{formatCurrency(Number(r.total_net))}</span>} />
                  {r.statut === 'brouillon' && (
                    <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>{deleteBtn(r)}</div>
                  )}
                </DataCard>
              ))}
              table={
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Numéro</TableHead>
                        <TableHead>Période</TableHead>
                        <TableHead className="text-right">Bulletins</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => openRun(r.id)}>
                          <TableCell className="font-medium">{r.numero}</TableCell>
                          <TableCell>{r.periode}</TableCell>
                          <TableCell className="text-right num">{r.nb_bulletins ?? '—'}</TableCell>
                          <TableCell className="text-right num">{formatCurrency(Number(r.total_net))}</TableCell>
                          <TableCell><StatutBadge statut={r.statut} /></TableCell>
                          <TableCell className="text-right">{deleteBtn(r)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              }
            />
          );
        })()}
      </QueryState>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Générer un cycle de paie</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="periode">Période (AAAA-MM)</Label>
              <Input id="periode" type="month" value={periode} onChange={(e) => setPeriode(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <p className="text-xs text-muted-foreground">
              Un bulletin sera créé pour chaque employé actif, avec son salaire de base et les commissions de la période.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>Annuler</Button>
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? <Spinner className="mr-1" /> : null} Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
