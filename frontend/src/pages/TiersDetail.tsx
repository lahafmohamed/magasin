import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tiersService, acompteService, acompteFournisseurService, crmService, api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { badgeVariants } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { CardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import {
  Users, Truck, Wallet,
  Plus, RefreshCw, GitMerge, Phone, Mail, MapPin, FileText,
  Calendar, CheckCircle2, Clock, MessageSquare,
  Trash2, AlertCircle, FileDown
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getErrorMessage } from '@/utils/errors';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDateShort } from '@/utils/format';
import { formatPaymentMethod, PAYMENT_METHODS } from '@/utils/paymentMethod';

const METHODES = PAYMENT_METHODS;

const LEDGER_PAGE_SIZE = 25;

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  facture_client:    { label: 'Facture',         color: 'text-danger-600' },
  paiement_client:  { label: 'Paiement',         color: 'text-success-600' },
  avoir_client:     { label: 'Avoir',            color: 'text-info-600' },
  acompte_client:   { label: 'Acompte reçu',     color: 'text-success-600' },
  compensation_client: { label: 'Compensation',  color: 'text-purple-600' },
  facture_fourn:    { label: 'Facture fourn.',   color: 'text-warning-600' },
  paiement_fourn:   { label: 'Paiement fourn.',  color: 'text-success-600' },
  acompte_fourn:    { label: 'Acompte versé',    color: 'text-warning-600' },
  compensation_fourn: { label: 'Compensation',   color: 'text-purple-600' },
};

export default function TiersDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const tiersId = parseInt(id!);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);

  const [showAcompteClient, setShowAcompteClient] = useState(false);
  const [showAcompteForun, setShowAcompteFourn] = useState(false);
  const [showCompensation, setShowCompensation] = useState(false);
  const [acompteForm, setAcompteForm] = useState({ montant: '', methode: 'espece', notes: '', magasin_id: '', reference_number: '' });
  const [magasinsList, setMagasinsList] = useState<Array<{ id: number; nom: string; code: string }>>([]);

  // CRM state
  const [interactions, setInteractions] = useState<any[]>([]);
  const [taches, setTaches] = useState<any[]>([]);
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [showTacheForm, setShowTacheForm] = useState(false);
  const [crmSubmitting, setCrmSubmitting] = useState(false);
  const [interactionForm, setInteractionForm] = useState({ type: 'appel', sujet: '', description: '', date_rappel: '', priorite: 'normale' });
  const [tacheForm, setTacheForm] = useState({ titre: '', description: '', priorite: 'normale', date_echeance: '' });

  useEffect(() => {
    api.get('/caisse/magasins')
      .then(response => {
        const data = response.data;
        setMagasinsList(data || []);
        if (data && data.length === 1) {
          setAcompteForm(p => ({ ...p, magasin_id: String(data[0].id) }));
        }
      })
      .catch(() => {});
  }, []);
  const [compForm, setCompForm] = useState({ date: new Date().toISOString().split('T')[0], montant: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const [compensations, setCompensations] = useState<any[]>([]);
  const [acomptesClient, setAcomptesClient] = useState<any[]>([]);
  const [acomptesFourn, setAcomptesFourn] = useState<any[]>([]);
  const [refundTarget, setRefundTarget] = useState<{ kind: 'client' | 'fournisseur'; acompte: any } | null>(null);
  const [refundForm, setRefundForm] = useState({ montant: '', methode: 'espece', session_caisse_id: '', notes: '' });

  useEffect(() => { setLedgerPage(1); loadData(); }, [tiersId, dateFrom, dateTo]);
  useEffect(() => { tiersService.getCompensations(tiersId).then(setCompensations).catch(() => {}); }, [tiersId]);
  useEffect(() => { loadAcomptes(); }, [tiersId]);

  // Chargement CRM
  useEffect(() => {
    crmService.getInteractions(tiersId).then(setInteractions).catch(() => {});
    crmService.getTaches(tiersId).then(setTaches).catch(() => {});
  }, [tiersId]);

  const loadAcomptes = async () => {
    try {
      const [cliRes, fouRes] = await Promise.all([
        api.get(`/tiers/${tiersId}/acomptes-client/disponibles`).catch(() => ({ data: [] })),
        api.get(`/tiers/${tiersId}/acomptes-fournisseur/disponibles`).catch(() => ({ data: [] })),
      ]);
      setAcomptesClient(cliRes.data || []);
      setAcomptesFourn(fouRes.data || []);
    } catch { /* silent */ }
  };

  const openRefund = (kind: 'client' | 'fournisseur', acompte: any) => {
    setRefundTarget({ kind, acompte });
    setRefundForm({
      montant: String(acompte.montant_restant),
      methode: acompte.methode_paiement || 'espece',
      session_caisse_id: '',
      notes: '',
    });
  };

  // CRM
  const handleCreateInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (crmSubmitting) return;
    setCrmSubmitting(true);
    try {
      const newItem = await crmService.createInteraction({
        tiers_id: tiersId,
        ...interactionForm,
      });
      setInteractions(prev => [newItem, ...prev]);
      setShowInteractionForm(false);
      setInteractionForm({ type: 'appel', sujet: '', description: '', date_rappel: '', priorite: 'normale' });
      toast.success('Interaction enregistrée');
    } catch (err) {
      toast.error(getErrorMessage(err, "Erreur lors de l'enregistrement"));
    } finally {
      setCrmSubmitting(false);
    }
  };

  const handleDeleteInteraction = async (id: number) => {
    if (!(await confirm({ title: 'Supprimer cette interaction ?', confirmLabel: 'Supprimer', destructive: true }))) return;
    try {
      await crmService.deleteInteraction(id);
      setInteractions(prev => prev.filter(i => i.id !== id));
      toast.success('Interaction supprimée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la suppression'));
    }
  };

  const handleCreateTache = async (e: React.FormEvent) => {
    e.preventDefault();
    if (crmSubmitting) return;
    setCrmSubmitting(true);
    try {
      const newTache = await crmService.createTache({
        tiers_id: tiersId,
        ...tacheForm,
      });
      setTaches(prev => [newTache, ...prev]);
      setShowTacheForm(false);
      setTacheForm({ titre: '', description: '', priorite: 'normale', date_echeance: '' });
      toast.success('Tâche créée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la création'));
    } finally {
      setCrmSubmitting(false);
    }
  };

  const handleCompleteTache = async (id: number) => {
    try {
      await crmService.updateTacheStatut(id, 'terminee');
      setTaches(prev => prev.map(t => t.id === id ? { ...t, statut: 'terminee' } : t));
      toast.success('Tâche terminée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de terminer la tâche'));
    }
  };

  const handleDeleteTache = async (id: number) => {
    if (!(await confirm({ title: 'Supprimer cette tâche ?', confirmLabel: 'Supprimer', destructive: true }))) return;
    try {
      await crmService.deleteTache(id);
      setTaches(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer la tâche'));
    }
  };

  const INTERACTION_TYPES = [
    { value: 'appel', label: 'Appel', icon: Phone },
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'reunion', label: 'Réunion', icon: Users },
    { value: 'note', label: 'Note interne', icon: MessageSquare },
    { value: 'relance', label: 'Relance', icon: AlertCircle },
  ];

  const PRIORITE_LABELS: Record<string, { label: string; color: string }> = {
    basse: { label: 'Basse', color: 'text-muted-foreground' },
    normale: { label: 'Normale', color: 'text-info-600' },
    haute: { label: 'Haute', color: 'text-warning-600' },
    urgente: { label: 'Urgente', color: 'text-destructive' },
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    setSubmitting(true);
    try {
      const payload = {
        montant: parseFloat(refundForm.montant),
        methode_paiement: refundForm.methode,
        session_caisse_id: refundForm.session_caisse_id ? parseInt(refundForm.session_caisse_id) : undefined,
        notes: refundForm.notes || undefined,
      };
      if (refundTarget.kind === 'client') {
        await acompteService.refund(refundTarget.acompte.id, payload);
      } else {
        await acompteFournisseurService.refund(refundTarget.acompte.id, payload);
      }
      toast.success('Remboursement enregistré');
      setRefundTarget(null);
      loadData();
      loadAcomptes();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur remboursement'));
    } finally {
      setSubmitting(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tiersService.getCompte(tiersId, dateFrom || undefined, dateTo || undefined);
      setData(res);
    } catch (err) { setError(err); toast.error('Erreur chargement compte tiers'); }
    finally { setLoading(false); }
  };

  const handleAcompteClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (acompteForm.methode === 'espece' && !acompteForm.magasin_id) {
      toast.error('Sélectionnez un magasin pour un acompte en espèces.');
      return;
    }
    setSubmitting(true);
    const idemKey = `aco-${tiersId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      await tiersService.recordAcompteClient(tiersId, {
        montant: parseFloat(acompteForm.montant),
        methode_paiement: acompteForm.methode,
        notes: acompteForm.notes || undefined,
        magasin_id: acompteForm.magasin_id ? parseInt(acompteForm.magasin_id) : undefined,
        reference_number: acompteForm.reference_number || undefined,
        idempotency_key: idemKey,
      });
      toast.success('Acompte client enregistré');
      setShowAcompteClient(false);
      setAcompteForm(p => ({ ...p, montant: '', notes: '', reference_number: '' }));
      loadData();
      loadAcomptes();
    } catch (err) { toast.error(getErrorMessage(err, "Erreur lors de l'enregistrement de l'acompte client")); }
    finally { setSubmitting(false); }
  };

  const handleAcompteFourn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (acompteForm.methode === 'espece' && !acompteForm.magasin_id) {
      toast.error('Sélectionnez un magasin pour un acompte en espèces.');
      return;
    }
    setSubmitting(true);
    try {
      await tiersService.recordAcompteFournisseur(tiersId, {
        montant: parseFloat(acompteForm.montant),
        methode_paiement: acompteForm.methode,
        notes: acompteForm.notes || undefined,
        magasin_id: acompteForm.magasin_id ? parseInt(acompteForm.magasin_id) : undefined,
        reference_number: acompteForm.reference_number || undefined,
      });
      toast.success('Acompte fournisseur enregistré');
      setShowAcompteFourn(false);
      setAcompteForm(p => ({ ...p, montant: '', notes: '', reference_number: '' }));
      loadData();
      loadAcomptes();
    } catch (err) { toast.error(getErrorMessage(err, "Erreur lors de l'enregistrement de l'acompte fournisseur")); }
    finally { setSubmitting(false); }
  };

  const handleCompensation = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await tiersService.createCompensation(tiersId, { date_compensation: compForm.date, montant: parseFloat(compForm.montant), notes: compForm.notes });
      toast.success('Compensation enregistrée');
      setShowCompensation(false);
      setCompForm({ date: new Date().toISOString().split('T')[0], montant: '', notes: '' });
      loadData();
      const comps = await tiersService.getCompensations(tiersId);
      setCompensations(comps);
    } catch (err) { toast.error(getErrorMessage(err, 'Erreur compensation')); }
    finally { setSubmitting(false); }
  };

  const handleRecompute = async () => {
    try {
      await tiersService.recomputeAllocation(tiersId);
      toast.success('Allocation FIFO recalculée');
      loadData();
    } catch (err) { toast.error(getErrorMessage(err, 'Erreur recalcul')); }
  };

  if (loading || error || !data) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
        <PageHeader backTo="/tiers" title="Compte tiers" />
        <QueryState
          loading={loading}
          error={error}
          isEmpty={!data}
          onRetry={loadData}
          skeleton={
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}><CardSkeleton lines={2} /></Card>
                ))}
              </div>
              <Card><TableSkeleton rows={8} columns={6} /></Card>
            </div>
          }
          emptyTitle="Tiers introuvable"
          emptyDescription="Ce tiers n'existe pas ou n'est plus accessible."
          emptyIcon={Users}
        >
          {null}
        </QueryState>
      </div>
    );
  }

  const { tiers, totaux, mouvements } = data;
  const soldeNet = totaux.solde_net;
  // Convention: solde_net = solde_client - solde_fournisseur
  //   > 0 → ils nous doivent (créance nette, favorable)
  //   < 0 → nous leur devons (dette nette, défavorable)
  const soldeNetColor = soldeNet > 0 ? 'text-success-600' : soldeNet < 0 ? 'text-danger-600' : 'text-muted-foreground';
  const canCompensate = tiers.est_client && tiers.est_fournisseur && totaux.client.solde_client > 0 && totaux.fournisseur.solde_fournisseur > 0;
  const maxComp = canCompensate ? Math.min(totaux.client.solde_client, totaux.fournisseur.solde_fournisseur) : 0;
  const ledgerTotalPages = Math.max(1, Math.ceil(mouvements.length / LEDGER_PAGE_SIZE));
  const currentLedgerPage = Math.min(ledgerPage, ledgerTotalPages);
  const pagedMouvements = mouvements.slice((currentLedgerPage - 1) * LEDGER_PAGE_SIZE, currentLedgerPage * LEDGER_PAGE_SIZE);

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      {/* Back + Header */}
      <PageHeader
        backTo="/tiers"
        title={`${tiers.raison_sociale}${tiers.prenom ? ` ${tiers.prenom}` : ''}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono">{tiers.code}</span>
            {tiers.est_client && (
              <span className={cn(badgeVariants({ variant: 'outline' }), 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-xs py-0')}>
                <Users className="h-3 w-3 mr-1" />Client
              </span>
            )}
            {tiers.est_fournisseur && (
              <span className={cn(badgeVariants({ variant: 'outline' }), 'text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 text-xs py-0')}>
                <Truck className="h-3 w-3 mr-1" />Fournisseur
              </span>
            )}
          </span>
        }
        actions={
          <>
            {tiers.est_client && (
              <Button variant="outline" size="sm" onClick={() => setShowAcompteClient(true)} className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Acompte client
              </Button>
            )}
            {tiers.est_fournisseur && (
              <Button variant="outline" size="sm" onClick={() => setShowAcompteFourn(true)} className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Acompte fourn.
              </Button>
            )}
            {canCompensate && (
              <Button size="sm" onClick={() => { setCompForm(p => ({ ...p, montant: maxComp.toString() })); setShowCompensation(true); }} className="gap-1 text-xs bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600">
                <GitMerge className="h-3.5 w-3.5" /> Compenser
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRecompute} title="Recalculer allocation FIFO">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />

      {/* Contact info */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {tiers.telephone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{tiers.telephone}</span>}
            {tiers.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{tiers.email}</span>}
            {tiers.adresse && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{tiers.adresse}</span>}
            {tiers.nif && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />NIF: {tiers.nif}</span>}
            {tiers.rccm && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />RCCM: {tiers.rccm}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Net balance summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiers.est_client && (
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Users className="h-3 w-3" /> Solde client</div>
              <div className={`text-xl font-bold ${totaux.client.solde_client > 0 ? 'text-danger-600' : totaux.client.solde_client < 0 ? 'text-success-600' : ''}`}>
                {formatCurrency(totaux.client.solde_client)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Facturé: {formatCurrency(totaux.client.total_facture)} · Payé: {formatCurrency(totaux.client.total_paye)}
                {totaux.client.total_acompte > 0 && <> · Acomptes/comp.: {formatCurrency(totaux.client.total_acompte)}</>}
              </div>
            </CardContent>
          </Card>
        )}
        {tiers.est_fournisseur && (
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Truck className="h-3 w-3" /> Solde fournisseur</div>
              <div className={`text-xl font-bold ${totaux.fournisseur.solde_fournisseur > 0 ? 'text-warning-600' : ''}`}>
                {formatCurrency(totaux.fournisseur.solde_fournisseur)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Facturé: {formatCurrency(totaux.fournisseur.total_facture_fourn)} · Payé: {formatCurrency(totaux.fournisseur.total_paye_fourn)}
                {totaux.fournisseur.total_acompte_fourn > 0 && <> · Acomptes/comp.: {formatCurrency(totaux.fournisseur.total_acompte_fourn)}</>}
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="border-2 border-primary/20">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Wallet className="h-3 w-3" /> Solde NET</div>
            <div className={`text-2xl font-bold ${soldeNetColor}`}>{formatCurrency(soldeNet)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {soldeNet > 0 ? 'Il nous doit' : soldeNet < 0 ? 'Nous lui devons' : 'Compte soldé'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Date filter */}
      <div className="flex gap-3 items-end">
        <div>
          <Label htmlFor="ledger-date-from" className="text-xs">Du</Label>
          <DatePicker id="ledger-date-from" value={dateFrom} onChange={setDateFrom} className="h-8 w-44 text-xs" />
        </div>
        <div>
          <Label htmlFor="ledger-date-to" className="text-xs">Au</Label>
          <DatePicker id="ledger-date-to" value={dateTo} onChange={setDateTo} className="h-8 w-44 text-xs" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs">Réinitialiser</Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-1 ml-auto"
          onClick={() =>
            tiersService
              .downloadRelevePdf(tiersId, tiers.raison_sociale || `client-${tiersId}`, dateFrom || undefined, dateTo || undefined)
              .catch(() => toast.error('Erreur lors de la génération du relevé'))
          }
        >
          <FileDown className="h-4 w-4" /> Relevé détaillé (PDF)
        </Button>
      </div>

      {/* Unified ledger */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">Ledger unifié ({mouvements.length} mouvements)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Rôle</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Référence</TableHead>
                <TableHead className="text-xs text-right">Débit</TableHead>
                <TableHead className="text-xs text-right">Crédit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mouvements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0 sm:p-0">
                    <EmptyState
                      icon={FileText}
                      title="Aucun mouvement sur ce compte"
                      description="Aucune facture, aucun paiement ni acompte sur la période sélectionnée."
                      className="py-8"
                    />
                  </TableCell>
                </TableRow>
              ) : pagedMouvements.map((m: any, i: number) => {
                const meta = TYPE_LABELS[m.type] || { label: m.type, color: '' };
                const getDocumentLink = (movement: any): string | null => {
                  switch (movement.type) {
                    case 'facture_client': return `/factures/${movement.document_id}`;
                    case 'avoir_client': return `/avoirs/${movement.document_id}`;
                    case 'facture_fourn': return `/factures-fournisseur`;
                    default: return null;
                  }
                };
                const link = getDocumentLink(m);
                return (
                  <TableRow
                    key={(currentLedgerPage - 1) * LEDGER_PAGE_SIZE + i}
                    className={`text-sm ${link ? 'cursor-pointer hover:bg-muted/80 transition-colors' : ''}`}
                    onClick={link ? () => navigate(link) : undefined}
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{m.date ? formatDateShort(m.date) : '—'}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${m.role === 'Client' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300'}`}>
                        {m.role}
                      </span>
                    </TableCell>
                    <TableCell className={`text-xs font-medium ${meta.color}`}>{meta.label}</TableCell>
                    <TableCell className={`text-xs font-mono ${link ? 'text-primary underline' : ''}`}>{m.reference || m.libelle}</TableCell>
                    <TableCell className="text-right text-xs text-danger-600">{m.debit > 0 ? formatCurrency(m.debit) : ''}</TableCell>
                    <TableCell className="text-right text-xs text-success-600">{m.credit > 0 ? formatCurrency(m.credit) : ''}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {mouvements.length > LEDGER_PAGE_SIZE && (
            <div className="border-t">
              <Pagination
                page={currentLedgerPage}
                totalPages={ledgerTotalPages}
                total={mouvements.length}
                limit={LEDGER_PAGE_SIZE}
                onPageChange={setLedgerPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acomptes actifs (client + fournisseur) */}
      {(acomptesClient.length > 0 || acomptesFourn.length > 0) && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-1">
              <Wallet className="h-4 w-4 text-blue-600" /> Acomptes actifs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Côté</TableHead>
                  <TableHead className="text-xs">#</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Méthode</TableHead>
                  <TableHead className="text-xs text-right">Initial</TableHead>
                  <TableHead className="text-xs text-right">Restant</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acomptesClient.map((a: any) => (
                  <TableRow key={`c-${a.id}`} className="text-sm">
                    <TableCell><span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">Client</span></TableCell>
                    <TableCell className="text-xs font-mono">{a.id}</TableCell>
                    <TableCell className="text-xs">{formatDateShort(a.date_acompte)}</TableCell>
                    <TableCell className="text-xs">{formatPaymentMethod(a.methode_paiement)}</TableCell>
                    <TableCell className="text-right text-xs">{formatCurrency(a.montant)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatCurrency(a.montant_restant)}</TableCell>
                    <TableCell className="text-xs">{a.statut}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openRefund('client', a)}>Rembourser</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {acomptesFourn.map((a: any) => (
                  <TableRow key={`f-${a.id}`} className="text-sm">
                    <TableCell><span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300">Fourn.</span></TableCell>
                    <TableCell className="text-xs font-mono">{a.id}</TableCell>
                    <TableCell className="text-xs">{formatDateShort(a.date_acompte)}</TableCell>
                    <TableCell className="text-xs">{formatPaymentMethod(a.methode_paiement)}</TableCell>
                    <TableCell className="text-right text-xs">{formatCurrency(a.montant)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatCurrency(a.montant_restant)}</TableCell>
                    <TableCell className="text-xs">{a.statut}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openRefund('fournisseur', a)}>Rembourser</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Compensations history */}
      {compensations.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-1"><GitMerge className="h-4 w-4 text-purple-600" /> Compensations ({compensations.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Montant</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compensations.map((c: any) => (
                  <TableRow key={c.id} className="text-sm">
                    <TableCell className="text-xs">{formatDateShort(c.date_compensation)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold text-purple-700 dark:text-purple-300">{formatCurrency(c.montant)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ========== CRM INTERACTIONS ========== */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1">
              <MessageSquare className="h-4 w-4 text-primary" />
              Interactions CRM ({interactions.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowInteractionForm(true)} className="gap-1 text-xs">
              <Plus className="h-3 w-3" /> Nouvelle
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {interactions.length > 0 ? (
            <div className="divide-y">
              {interactions.map((item: any) => {
                const typeConfig = INTERACTION_TYPES.find(t => t.value === item.type) || { label: item.type, icon: MessageSquare };
                const TypeIcon = typeConfig.icon;
                const pConfig = PRIORITE_LABELS[item.priorite] || { label: item.priorite, color: '' };
                return (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30">
                    <div className="mt-0.5 p-1.5 rounded-full bg-primary/10">
                      <TypeIcon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{item.sujet}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleDeleteInteraction(item.id)} aria-label="Supprimer cette interaction">
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description || ''}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{typeConfig.label}</span>
                        <span className={`text-[10px] ${pConfig.color}`}>{pConfig.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateShort(item.date_interaction)}
                        </span>
                        {item.date_rappel && (
                          <span className="text-[10px] text-warning-600 flex items-center gap-0.5">
                            <Clock className="h-3 w-3" /> Rappel: {formatDateShort(item.date_rappel)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={MessageSquare} title="Aucune interaction enregistrée" className="py-8" />
          )}
        </CardContent>
      </Card>

      {/* ========== CRM TÂCHES ========== */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Tâches ({taches.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowTacheForm(true)} className="gap-1 text-xs">
              <Plus className="h-3 w-3" /> Nouvelle tâche
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {taches.length > 0 ? (
            <div className="divide-y">
              {taches.map((t: any) => (
                <div key={t.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30">
                  <div className="mt-0.5">
                    {t.statut === 'terminee' ? (
                      <CheckCircle2 className="h-4 w-4 text-success-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-warning-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-medium ${t.statut === 'terminee' ? 'line-through text-muted-foreground' : ''}`}>{t.titre}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {t.statut !== 'terminee' && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCompleteTache(t.id)} title="Marquer terminée">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteTache(t.id)} aria-label="Supprimer cette tâche">
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      {t.priorite && (
                        <span className={`text-[10px] ${PRIORITE_LABELS[t.priorite]?.color || ''} bg-muted px-1.5 py-0.5 rounded`}>
                          {PRIORITE_LABELS[t.priorite]?.label || t.priorite}
                        </span>
                      )}
                      {t.date_echeance && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Calendar className="h-3 w-3" /> Échéance: {formatDateShort(t.date_echeance)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="Aucune tâche" className="py-8" />
          )}
        </CardContent>
      </Card>

      {/* ========== DIALOGS CRM ========== */}
      <Dialog open={showInteractionForm} onOpenChange={setShowInteractionForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouvelle interaction</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateInteraction} className="space-y-3">
            <div>
              <Label htmlFor="interaction-type">Type *</Label>
              <Select value={interactionForm.type} onValueChange={v => setInteractionForm(p => ({ ...p, type: v }))}>
                <SelectTrigger id="interaction-type" className="w-full" aria-label="Type d'interaction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="crm-int-sujet">Sujet *</Label>
              <Input id="crm-int-sujet" value={interactionForm.sujet} onChange={e => setInteractionForm(p => ({ ...p, sujet: e.target.value }))} required />
            </div>
            <div>
              <Label htmlFor="crm-int-desc">Description</Label>
              <Textarea id="crm-int-desc" value={interactionForm.description} onChange={e => setInteractionForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="crm-int-priorite">Priorité</Label>
                <Select value={interactionForm.priorite} onValueChange={v => setInteractionForm(p => ({ ...p, priorite: v }))}>
                  <SelectTrigger id="crm-int-priorite" className="w-full" aria-label="Priorité">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basse">Basse</SelectItem>
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="haute">Haute</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="crm-int-rappel">Rappel le</Label>
                <DatePicker id="crm-int-rappel" value={interactionForm.date_rappel} onChange={(date_rappel) => setInteractionForm(p => ({ ...p, date_rappel }))} aria-label="Rappel le" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInteractionForm(false)}>Annuler</Button>
              <Button type="submit" disabled={crmSubmitting}>{crmSubmitting ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showTacheForm} onOpenChange={setShowTacheForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouvelle tâche</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateTache} className="space-y-3">
            <div>
              <Label htmlFor="crm-tache-titre">Titre *</Label>
              <Input id="crm-tache-titre" value={tacheForm.titre} onChange={e => setTacheForm(p => ({ ...p, titre: e.target.value }))} required />
            </div>
            <div>
              <Label htmlFor="crm-tache-desc">Description</Label>
              <Textarea id="crm-tache-desc" value={tacheForm.description} onChange={e => setTacheForm(p => ({ ...p, description: e.target.value }))} rows={2} className="min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="crm-tache-priorite">Priorité</Label>
                <Select value={tacheForm.priorite} onValueChange={v => setTacheForm(p => ({ ...p, priorite: v }))}>
                  <SelectTrigger id="crm-tache-priorite" className="w-full" aria-label="Priorité">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basse">Basse</SelectItem>
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="haute">Haute</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="crm-tache-echeance">Échéance</Label>
                <DatePicker id="crm-tache-echeance" value={tacheForm.date_echeance} onChange={(date_echeance) => setTacheForm(p => ({ ...p, date_echeance }))} aria-label="Échéance" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowTacheForm(false)}>Annuler</Button>
              <Button type="submit" disabled={crmSubmitting}>{crmSubmitting ? 'Création...' : 'Créer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Acompte client dialog */}
      <Dialog open={showAcompteClient} onOpenChange={setShowAcompteClient}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Acompte client reçu</DialogTitle></DialogHeader>
          <form onSubmit={handleAcompteClient} className="space-y-3">
            <div><Label htmlFor="ac-client-montant">Montant *</Label><MoneyInput id="ac-client-montant" value={acompteForm.montant} onChange={v => setAcompteForm(p => ({ ...p, montant: v }))} required placeholder="0" /></div>
            <div>
              <Label htmlFor="ac-client-methode">Méthode</Label>
              <Select value={acompteForm.methode} onValueChange={v => setAcompteForm(p => ({ ...p, methode: v }))}>
                <SelectTrigger id="ac-client-methode" className="w-full" aria-label="Méthode de paiement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODES.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ac-client-magasin">Magasin {acompteForm.methode === 'espece' && <span className="text-danger-500">*</span>}</Label>
              <Select
                value={acompteForm.magasin_id || undefined}
                onValueChange={v => setAcompteForm(p => ({ ...p, magasin_id: v }))}
              >
                <SelectTrigger id="ac-client-magasin" aria-label="Magasin">
                  <SelectValue placeholder="— Choisir —" />
                </SelectTrigger>
                <SelectContent>
                  {magasinsList.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.code} - {m.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {acompteForm.methode === 'espece' && (
                <p className="text-xs text-warning-600 mt-1">Caisse du magasin doit être ouverte.</p>
              )}
            </div>
            {acompteForm.methode !== 'espece' && (
              <div>
                <Label htmlFor="ac-client-reference">Référence (chèque/virement)</Label>
                <Input id="ac-client-reference" value={acompteForm.reference_number} onChange={e => setAcompteForm(p => ({ ...p, reference_number: e.target.value }))} placeholder="N° de pièce" />
              </div>
            )}
            <div><Label htmlFor="ac-client-notes">Notes</Label><Input id="ac-client-notes" value={acompteForm.notes} onChange={e => setAcompteForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAcompteClient(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Acompte fournisseur dialog */}
      <Dialog open={showAcompteForun} onOpenChange={setShowAcompteFourn}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Acompte versé au fournisseur</DialogTitle></DialogHeader>
          <form onSubmit={handleAcompteFourn} className="space-y-3">
            <div><Label htmlFor="ac-fourn-montant">Montant *</Label><MoneyInput id="ac-fourn-montant" value={acompteForm.montant} onChange={v => setAcompteForm(p => ({ ...p, montant: v }))} required placeholder="0" /></div>
            <div>
              <Label htmlFor="ac-fourn-methode">Méthode</Label>
              <Select value={acompteForm.methode} onValueChange={v => setAcompteForm(p => ({ ...p, methode: v }))}>
                <SelectTrigger id="ac-fourn-methode" className="w-full" aria-label="Méthode de paiement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODES.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ac-fourn-magasin">Magasin {acompteForm.methode === 'espece' && <span className="text-danger-500">*</span>}</Label>
              <Select
                value={acompteForm.magasin_id || undefined}
                onValueChange={v => setAcompteForm(p => ({ ...p, magasin_id: v }))}
              >
                <SelectTrigger id="ac-fourn-magasin" aria-label="Magasin">
                  <SelectValue placeholder="— Choisir —" />
                </SelectTrigger>
                <SelectContent>
                  {magasinsList.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.code} - {m.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {acompteForm.methode === 'espece' && (
                <p className="text-xs text-muted-foreground mt-1">Session caisse de ce magasin doit être ouverte.</p>
              )}
            </div>
            {acompteForm.methode !== 'espece' && (
              <div>
                <Label htmlFor="ac-fourn-reference2">Référence</Label>
                <Input id="ac-fourn-reference2" value={acompteForm.reference_number} onChange={e => setAcompteForm(p => ({ ...p, reference_number: e.target.value }))} placeholder="N° de pièce" />
              </div>
            )}
            <div><Label htmlFor="ac-fourn-notes">Notes</Label><Input id="ac-fourn-notes" value={acompteForm.notes} onChange={e => setAcompteForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAcompteFourn(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Compensation dialog */}
      <Dialog open={showCompensation} onOpenChange={setShowCompensation}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><GitMerge className="h-4 w-4 text-purple-600" /> Compensation (netting)</DialogTitle></DialogHeader>
          <div className="text-xs text-muted-foreground mb-3 p-3 bg-purple-50 dark:bg-purple-500/10 rounded-md">
            Créance client : <strong>{formatCurrency(totaux.client.solde_client)}</strong><br />
            Dette fournisseur : <strong>{formatCurrency(totaux.fournisseur.solde_fournisseur)}</strong><br />
            Maximum compensable : <strong className="text-purple-700 dark:text-purple-300">{formatCurrency(maxComp)}</strong>
          </div>
          <form onSubmit={handleCompensation} className="space-y-3">
            <div><Label htmlFor="comp-date">Date *</Label><DatePicker id="comp-date" value={compForm.date} onChange={(date) => setCompForm(p => ({ ...p, date }))} required aria-label="Date de compensation" /></div>
            <div>
              <Label htmlFor="comp-montant">Montant à compenser *</Label>
              <MoneyInput id="comp-montant" value={compForm.montant} onChange={v => setCompForm(p => ({ ...p, montant: v }))} required placeholder="0" />
              <p className="text-xs text-muted-foreground mt-0.5">Maximum: {formatCurrency(maxComp)}</p>
            </div>
            <div><Label htmlFor="comp-notes">Notes</Label><Input id="comp-notes" value={compForm.notes} onChange={e => setCompForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCompensation(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting} className="bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600">{submitting ? 'Enregistrement...' : 'Compenser'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Refund acompte dialog */}
      <Dialog open={refundTarget !== null} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Rembourser acompte {refundTarget?.kind === 'client' ? 'client' : 'fournisseur'} #{refundTarget?.acompte?.id}
            </DialogTitle>
          </DialogHeader>
          {refundTarget && (
            <form onSubmit={handleRefund} className="space-y-3">
              <div className="text-xs p-2 bg-muted rounded">
                Restant : <strong>{formatCurrency(refundTarget.acompte.montant_restant)}</strong>
                {refundTarget.kind === 'fournisseur' && (
                  <div className="mt-1 text-warning-600">Fournisseur restitue le cash → encaissement caisse.</div>
                )}
                {refundTarget.kind === 'client' && (
                  <div className="mt-1 text-blue-600">Cash sort de la caisse vers le client.</div>
                )}
              </div>
              <div>
                <Label htmlFor="refund-montant">Montant *</Label>
                <MoneyInput id="refund-montant" value={refundForm.montant}
                  onChange={v => setRefundForm(p => ({ ...p, montant: v }))}
                  required placeholder="0" />
              </div>
              <div>
                <Label htmlFor="refund-methode">Méthode</Label>
                <Select value={refundForm.methode}
                  onValueChange={v => setRefundForm(p => ({ ...p, methode: v }))}>
                  <SelectTrigger id="refund-methode" className="w-full" aria-label="Méthode de remboursement">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODES.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="refund-session">Session caisse (optionnel)</Label>
                <Input id="refund-session" type="number" value={refundForm.session_caisse_id}
                  onChange={e => setRefundForm(p => ({ ...p, session_caisse_id: e.target.value }))}
                  placeholder="Auto si magasin acompte" />
                <p className="text-xs text-muted-foreground mt-0.5">
                  Si vide, session ouverte du magasin de l'acompte utilisée.
                </p>
              </div>
              <div><Label htmlFor="refund-notes">Notes</Label><Input id="refund-notes" value={refundForm.notes} onChange={e => setRefundForm(p => ({ ...p, notes: e.target.value }))} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRefundTarget(null)}>Annuler</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Remboursement...' : 'Rembourser'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
