import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Wallet, CheckCircle2, BadgeDollarSign, XCircle, Trash2, ArrowLeft, FileDown } from 'lucide-react';
import { payrollService } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { formatFCFA } from '../utils/format';

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
  brouillon: 'Brouillon', valide: 'Validé', paye: 'Payé', annule: 'Annulé',
};
const STATUT_CLASS: Record<string, string> = {
  brouillon: 'bg-warning-100 dark:bg-warning-500/20 text-warning-800 dark:text-warning-200',
  valide: 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-200',
  paye: 'bg-success-100 dark:bg-success-500/20 text-success-800 dark:text-success-200',
  annule: 'bg-danger-100 dark:bg-danger-500/20 text-danger-800 dark:text-danger-200',
};

function StatutBadge({ statut }: { statut: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUT_CLASS[statut] || 'bg-muted'}`}>
      {STATUT_LABEL[statut] || statut}
    </span>
  );
}

export default function Payroll() {
  const confirm = useConfirm();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<(PayrollRun & { payslips: Payslip[] }) | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterStatut, setFilterStatut] = useState<'all' | PayrollRun['statut']>('all');

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await payrollService.getAll(1, 100);
      setRuns(Array.isArray(data) ? data : data?.data ?? []);
    } catch {
      toast.error('Erreur lors du chargement des cycles de paie');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const openRun = async (id: number) => {
    try {
      setSelected(await payrollService.getById(id));
    } catch {
      toast.error('Erreur lors du chargement du cycle');
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
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erreur lors de la génération');
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
    } catch {
      toast.error('Erreur lors du téléchargement du bulletin');
    }
  };

  const runAction = async (fn: () => Promise<any>, okMsg: string) => {
    setBusy(true);
    try {
      const updated = await fn();
      toast.success(okMsg);
      await loadRuns();
      if (updated?.id) setSelected(updated);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Action impossible');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Detail view ----------
  if (selected) {
    return (
      <div className="space-y-4 p-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{selected.numero}</h1>
            <p className="text-sm text-muted-foreground">
              Période {selected.periode} · {selected.date_debut} → {selected.date_fin}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatutBadge statut={selected.statut} />
            {selected.statut === 'brouillon' && (
              <Button size="sm" disabled={busy} onClick={async () => {
                if (!(await confirm({ title: 'Valider ce cycle de paie ?', description: `Le cycle ${selected.numero} (net à payer : ${formatFCFA(Number(selected.total_net))}) sera validé.`, confirmLabel: 'Valider' }))) return;
                runAction(() => payrollService.validate(selected.id), 'Cycle validé');
              }}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Valider
              </Button>
            )}
            {selected.statut === 'valide' && (
              <Button size="sm" disabled={busy} onClick={async () => {
                if (!(await confirm({ title: 'Marquer ce cycle comme payé ?', description: `Le paiement de ${formatFCFA(Number(selected.total_net))} (virement) sera enregistré pour le cycle ${selected.numero}.`, confirmLabel: 'Marquer payé' }))) return;
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
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Brut</p><p className="num font-semibold">{formatFCFA(Number(selected.total_brut))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Commissions</p><p className="num font-semibold">{formatFCFA(Number(selected.total_commissions))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Retenues (CNPS+ITS+autres)</p><p className="num font-semibold">{formatFCFA(Number(selected.total_cnps || 0) + Number(selected.total_its || 0) + Number(selected.total_deductions))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Net à payer</p><p className="num font-semibold text-primary">{formatFCFA(Number(selected.total_net))}</p></div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Employé</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2 text-right">Commissions</th>
                <th className="px-3 py-2 text-right">Primes</th>
                <th className="px-3 py-2 text-right">CNPS</th>
                <th className="px-3 py-2 text-right">ITS</th>
                <th className="px-3 py-2 text-right">Déductions</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {selected.payslips?.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.nom_complet}</div>
                    <div className="text-xs text-muted-foreground">{p.matricule}{p.poste ? ` · ${p.poste}` : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-right num">{formatFCFA(Number(p.salaire_base))}</td>
                  <td className="px-3 py-2 text-right num">{formatFCFA(Number(p.commissions))}</td>
                  <td className="px-3 py-2 text-right num">{formatFCFA(Number(p.primes))}</td>
                  <td className="px-3 py-2 text-right num">{formatFCFA(Number(p.retenue_cnps))}</td>
                  <td className="px-3 py-2 text-right num">{formatFCFA(Number(p.retenue_its))}</td>
                  <td className="px-3 py-2 text-right num">{formatFCFA(Number(p.deductions))}</td>
                  <td className="px-3 py-2 text-right num font-medium">{formatFCFA(Number(p.salaire_net))}</td>
                  <td className="px-3 py-2"><StatutBadge statut={p.statut} /></td>
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" title="Télécharger le bulletin PDF" onClick={() => downloadPayslipPdf(p.id, p.nom_complet)}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(!selected.payslips || selected.payslips.length === 0) && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Aucun bulletin</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Paie</h1>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Générer un cycle
        </Button>
      </div>

      {/* Statut filter */}
      {!loading && runs.length > 0 && (
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
          {(['all', 'brouillon', 'valide', 'paye', 'annule'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatut(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filterStatut === s ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {s === 'all' ? 'Tous' : STATUT_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : runs.length === 0 ? (
        <EmptyState icon={Wallet} title="Aucun cycle de paie" description="Générez votre premier cycle de paie pour une période." />
      ) : (() => {
        const filtered = filterStatut === 'all' ? runs : runs.filter((r) => r.statut === filterStatut);
        if (filtered.length === 0) {
          return <EmptyState icon={Wallet} title="Aucun cycle pour ce statut" />;
        }
        const deleteBtn = (r: PayrollRun) => r.statut === 'brouillon' && (
          <Button
            size="icon" variant="ghost"
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
                <DataCardRow label="Net" value={<span className="num font-semibold">{formatFCFA(Number(r.total_net))}</span>} />
                {r.statut === 'brouillon' && (
                  <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>{deleteBtn(r)}</div>
                )}
              </DataCard>
            ))}
            table={
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2">Numéro</th>
                      <th className="px-3 py-2">Période</th>
                      <th className="px-3 py-2 text-right">Bulletins</th>
                      <th className="px-3 py-2 text-right">Net</th>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((r) => (
                      <tr key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openRun(r.id)}>
                        <td className="px-3 py-2 font-medium">{r.numero}</td>
                        <td className="px-3 py-2">{r.periode}</td>
                        <td className="px-3 py-2 text-right num">{r.nb_bulletins ?? '—'}</td>
                        <td className="px-3 py-2 text-right num">{formatFCFA(Number(r.total_net))}</td>
                        <td className="px-3 py-2"><StatutBadge statut={r.statut} /></td>
                        <td className="px-3 py-2 text-right">{deleteBtn(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />
        );
      })()}

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
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
