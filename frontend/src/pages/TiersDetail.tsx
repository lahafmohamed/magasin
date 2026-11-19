import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileDown,
  FileText,
  GitMerge,
  ListTodo,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { acompteFournisseurService, acompteService, caisseService, crmService, tiersService } from '../services/api';
import { useAuth } from '@/lib/AuthContext';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { QueryErrorState, QueryState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { CardSkeleton, ListSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { Pagination } from '@/components/ui/pagination';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { RequiredMark } from '@/components/ui/required-mark';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/StatusBadge';
import { TiersRoleBadge } from '@/components/TiersRoleBadge';
import { getErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate, formatNumber, toNumber } from '@/utils/format';
import { formatPaymentMethod, PAYMENT_METHOD_OPTIONS } from '@/utils/paymentMethod';
import { balanceDirection, tiersMovementHref, tiersMovementLabel, tiersMovementOpenLabel, type BalanceSide } from '@/utils/ledger';

const LEDGER_PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/* Types — réponses de l'API                                           */
/* ------------------------------------------------------------------ */

type Amount = number | string | null | undefined;

interface TiersInfo {
  id: number;
  code: string;
  raison_sociale: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  nif: string | null;
  rccm: string | null;
  est_client: boolean;
  est_fournisseur: boolean;
  credit_max: Amount;
}

interface CompteTotaux {
  client: {
    total_facture: number;
    total_paye: number;
    total_avoir: number;
    total_acompte: number;
    solde_client: number;
  };
  fournisseur: {
    total_facture_fourn: number;
    total_paye_fourn: number;
    total_acompte_fourn: number;
    solde_fournisseur: number;
  };
  solde_net: number;
}

interface Mouvement {
  date: string;
  type: string;
  reference: string | null;
  libelle: string;
  debit: number;
  credit: number;
  document_id: number | null;
  role: 'Client' | 'Fournisseur';
}

interface Compte {
  tiers: TiersInfo;
  totaux: CompteTotaux;
  mouvements: Mouvement[];
}

interface Acompte {
  id: number;
  date_acompte: string;
  methode_paiement: string | null;
  montant: Amount;
  montant_restant: Amount;
  statut: string;
}

interface Compensation {
  id: number;
  date_compensation: string;
  montant: Amount;
  notes: string | null;
}

interface Interaction {
  id: number;
  type: string;
  sujet: string;
  description: string | null;
  priorite: string | null;
  date_interaction: string | null;
  date_rappel: string | null;
}

interface Tache {
  id: number;
  titre: string;
  description: string | null;
  priorite: string | null;
  statut: string;
  date_echeance: string | null;
}

interface Magasin {
  id: number;
  nom: string;
  code: string;
}

interface LoadState {
  loading: boolean;
  error: unknown;
}

type AcompteKind = 'client' | 'fournisseur';

/* ------------------------------------------------------------------ */
/* Constantes d'affichage                                              */
/* ------------------------------------------------------------------ */

const INTERACTION_TYPES: ReadonlyArray<{ value: string; label: string; icon: LucideIcon }> = [
  { value: 'appel', label: 'Appel', icon: Phone },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'reunion', label: 'Réunion', icon: Users },
  { value: 'note', label: 'Note interne', icon: MessageSquare },
  { value: 'relance', label: 'Relance', icon: AlertCircle },
];

const PRIORITES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'basse', label: 'Basse' },
  { value: 'normale', label: 'Normale' },
  { value: 'haute', label: 'Haute' },
  { value: 'urgente', label: 'Urgente' },
];

/** Seules les priorités qui demandent de l'attention prennent une couleur (texte -700). */
const PRIORITE_CLASS: Record<string, string> = {
  haute: 'text-warning-700',
  urgente: 'text-danger-700',
};

function prioriteLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return PRIORITES.find((p) => p.value === code)?.label ?? code;
}

const today = () => new Date().toISOString().split('T')[0];

/** Colonnes des tuiles de solde selon leur nombre (remplace la grille par défaut de `StatGrid`). */
const TILE_GRID: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 [&>:last-child]:col-span-1 sm:[&>:last-child]:col-span-2 lg:[&>:last-child]:col-span-1',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

const BLANK_ACOMPTE = { montant: '', methode: 'espece', notes: '', magasin_id: '', reference_number: '' };
const BLANK_INTERACTION = { type: 'appel', sujet: '', description: '', date_rappel: '', priorite: 'normale' };
const BLANK_TACHE = { titre: '', description: '', priorite: 'normale', date_echeance: '' };

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 404;
}

function pluralize(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n > 1 ? many : one}`;
}

/**
 * Référence d'un mouvement du relevé : le numéro de pièce en mono (taille du
 * texte, jamais `text-xs`) ; un libellé libre, à défaut de numéro, reste en
 * texte courant.
 */
function MovementRef({ reference, text }: { reference?: string | null; text?: string | null }) {
  if (reference) return <DocumentCode>{reference}</DocumentCode>;
  return <>{text || '—'}</>;
}

/** Sens d'un solde en mots seuls (« Il vous doit ») : ni flèche ni couleur pour le redire. */
function BalanceHint({ solde, side }: { solde: number; side: BalanceSide }) {
  return <span>{balanceDirection(solde, side).label}</span>;
}

/** Détail d'un solde (facturé, payé…) sous la valeur d'une tuile. */
function BalanceBreakdown({ rows }: { rows: Array<{ label: string; value: Amount; show?: boolean }> }) {
  const visible = rows.filter((r) => r.show !== false);
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-xs">
      {visible.map((r) => (
        <div key={r.label} className="contents">
          <dt className="truncate text-muted-foreground">{r.label}</dt>
          <dd className="text-right">
            <Money value={r.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TiersDetail() {
  const { id } = useParams<{ id: string }>();
  const tiersId = Number.parseInt(id ?? '', 10);
  const confirm = useConfirm();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  // Compte (soldes + relevé)
  const [compte, setCompte] = useState<Compte | null>(null);
  const [ledgerState, setLedgerState] = useState<LoadState>({ loading: true, error: null });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const requestSeq = useRef(0);

  // Acomptes, compensations, CRM
  const [acomptesClient, setAcomptesClient] = useState<Acompte[]>([]);
  const [acomptesFourn, setAcomptesFourn] = useState<Acompte[]>([]);
  const [acomptesState, setAcomptesState] = useState<LoadState>({ loading: true, error: null });
  const [compensations, setCompensations] = useState<Compensation[]>([]);
  const [compensationsError, setCompensationsError] = useState<unknown>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [interactionsState, setInteractionsState] = useState<LoadState>({ loading: true, error: null });
  const [taches, setTaches] = useState<Tache[]>([]);
  const [tachesState, setTachesState] = useState<LoadState>({ loading: true, error: null });
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [magasinsError, setMagasinsError] = useState<unknown>(null);

  // Dialogues
  const [acompteKind, setAcompteKind] = useState<AcompteKind | null>(null);
  const [acompteForm, setAcompteForm] = useState(BLANK_ACOMPTE);
  const [acompteErrors, setAcompteErrors] = useState<{ montant?: string; magasin?: string }>({});
  const acompteKey = useRef('');
  const [showCompensation, setShowCompensation] = useState(false);
  const [compForm, setCompForm] = useState({ date: today(), montant: '', notes: '' });
  const [compError, setCompError] = useState<string | undefined>();
  const [refundTarget, setRefundTarget] = useState<{ kind: AcompteKind; acompte: Acompte } | null>(null);
  const [refundForm, setRefundForm] = useState({ montant: '', methode: 'espece', session_caisse_id: '', notes: '' });
  const [refundError, setRefundError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [interactionForm, setInteractionForm] = useState(BLANK_INTERACTION);
  const [showTacheForm, setShowTacheForm] = useState(false);
  const [tacheForm, setTacheForm] = useState(BLANK_TACHE);
  const [crmSubmitting, setCrmSubmitting] = useState(false);

  /* ---------------- Chargements ---------------- */

  const loadCompte = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLedgerState({ loading: true, error: null });
    try {
      const res = (await tiersService.getCompte(tiersId, dateFrom || undefined, dateTo || undefined)) as Compte | null;
      if (seq !== requestSeq.current) return;
      if (!res?.tiers) {
        // Réponse vide : traitée comme un contact introuvable, jamais comme une page blanche.
        setLedgerState({ loading: false, error: { response: { status: 404 } } });
        return;
      }
      setCompte(res);
      setLedgerState({ loading: false, error: null });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setLedgerState({ loading: false, error: err });
    }
  }, [tiersId, dateFrom, dateTo]);

  const loadAcomptes = useCallback(async () => {
    setAcomptesState({ loading: true, error: null });
    try {
      const [cli, fou] = await Promise.all([
        acompteService.listForClient(tiersId),
        acompteFournisseurService.listForFournisseur(tiersId),
      ]);
      setAcomptesClient(asArray<Acompte>(cli));
      setAcomptesFourn(asArray<Acompte>(fou));
      setAcomptesState({ loading: false, error: null });
    } catch (err) {
      setAcomptesState({ loading: false, error: err });
    }
  }, [tiersId]);

  const loadCompensations = useCallback(async () => {
    setCompensationsError(null);
    try {
      setCompensations(asArray<Compensation>(await tiersService.getCompensations(tiersId)));
    } catch (err) {
      setCompensationsError(err);
    }
  }, [tiersId]);

  const loadInteractions = useCallback(async () => {
    setInteractionsState({ loading: true, error: null });
    try {
      setInteractions(asArray<Interaction>(await crmService.getInteractions(tiersId)));
      setInteractionsState({ loading: false, error: null });
    } catch (err) {
      setInteractionsState({ loading: false, error: err });
    }
  }, [tiersId]);

  const loadTaches = useCallback(async () => {
    setTachesState({ loading: true, error: null });
    try {
      setTaches(asArray<Tache>(await crmService.getTaches(tiersId)));
      setTachesState({ loading: false, error: null });
    } catch (err) {
      setTachesState({ loading: false, error: err });
    }
  }, [tiersId]);

  // Un autre contact : on n'affiche jamais les soldes du précédent pendant le chargement.
  useEffect(() => {
    setCompte(null);
  }, [tiersId]);

  useEffect(() => {
    setLedgerPage(1);
    void loadCompte();
  }, [loadCompte]);

  useEffect(() => {
    void loadAcomptes();
    void loadCompensations();
    void loadInteractions();
    void loadTaches();
  }, [loadAcomptes, loadCompensations, loadInteractions, loadTaches]);

  useEffect(() => {
    let active = true;
    caisseService
      .getMagasins()
      .then((list) => {
        if (!active) return;
        const rows = asArray<Magasin>(list);
        setMagasins(rows);
        if (rows.length === 1) setAcompteForm((p) => ({ ...p, magasin_id: String(rows[0].id) }));
      })
      .catch((err) => {
        if (active) setMagasinsError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  const mouvements = useMemo(() => compte?.mouvements ?? [], [compte]);
  const ledgerTotalPages = Math.max(1, Math.ceil(mouvements.length / LEDGER_PAGE_SIZE));
  const currentLedgerPage = Math.min(ledgerPage, ledgerTotalPages);
  const pagedMouvements = mouvements.slice(
    (currentLedgerPage - 1) * LEDGER_PAGE_SIZE,
    currentLedgerPage * LEDGER_PAGE_SIZE
  );

  /* ---------------- Premier chargement / introuvable / erreur ---------------- */

  if (!compte) {
    const notFound = !ledgerState.loading && isNotFound(ledgerState.error);
    return (
      <PageShell title="Contact" backTo="/tiers" width="wide">
        {notFound ? (
          <Card>
            <EmptyState
              icon={Users}
              title="Contact introuvable"
              description="Ce contact n’existe pas ou a été supprimé"
              action={
                <Link to="/tiers" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Retour aux contacts
                </Link>
              }
            />
          </Card>
        ) : (
          <QueryState
            loading={ledgerState.loading}
            error={ledgerState.error}
            onRetry={() => void loadCompte()}
            errorTitle="Impossible de charger le contact"
            skeleton={
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i}>
                      <CardSkeleton lines={2} />
                    </Card>
                  ))}
                </div>
                <Card>
                  <TableSkeleton rows={8} columns={5} />
                </Card>
              </div>
            }
          >
            {null}
          </QueryState>
        )}
      </PageShell>
    );
  }

  const { tiers, totaux } = compte;
  const isClient = tiers.est_client;
  const isFourn = tiers.est_fournisseur;
  const isMixed = isClient && isFourn;
  const nom = `${tiers.raison_sociale}${tiers.prenom ? ` ${tiers.prenom}` : ''}`;
  const soldeClient = totaux.client.solde_client;
  const soldeFourn = totaux.fournisseur.solde_fournisseur;
  const canCompensate = isMixed && soldeClient > 0 && soldeFourn > 0;
  const maxComp = canCompensate ? Math.min(soldeClient, soldeFourn) : 0;
  const creditMax = toNumber(tiers.credit_max) ?? 0;
  const acomptesClientDispo = acomptesClient.reduce((s, a) => s + (toNumber(a.montant_restant) ?? 0), 0);
  const acomptesFournDispo = acomptesFourn.reduce((s, a) => s + (toNumber(a.montant_restant) ?? 0), 0);
  const allAcomptes: Array<{ kind: AcompteKind; acompte: Acompte }> = [
    ...acomptesClient.map((acompte) => ({ kind: 'client' as const, acompte })),
    ...acomptesFourn.map((acompte) => ({ kind: 'fournisseur' as const, acompte })),
  ];

  /* ---------------- Actions ---------------- */

  const openAcompte = (kind: AcompteKind) => {
    acompteKey.current = `aco-${kind}-${tiersId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setAcompteErrors({});
    setAcompteForm((p) => ({ ...BLANK_ACOMPTE, magasin_id: p.magasin_id }));
    setAcompteKind(kind);
  };

  const handleAcompte = async (e: FormEvent) => {
    e.preventDefault();
    if (!acompteKind) return;
    const montant = Number.parseFloat(acompteForm.montant);
    const errors: { montant?: string; magasin?: string } = {};
    if (!(montant > 0)) errors.montant = 'Saisissez un montant supérieur à 0.';
    if (acompteForm.methode === 'espece' && !acompteForm.magasin_id) {
      errors.magasin = 'Choisissez le magasin dont la caisse reçoit ou verse les espèces.';
    }
    setAcompteErrors(errors);
    if (errors.montant || errors.magasin) {
      requestAnimationFrame(() =>
        document.getElementById(errors.montant ? 'acompte-montant' : 'acompte-magasin')?.focus()
      );
      return;
    }
    setSubmitting(true);
    const payload = {
      montant,
      methode_paiement: acompteForm.methode,
      notes: acompteForm.notes || undefined,
      magasin_id: acompteForm.magasin_id ? Number.parseInt(acompteForm.magasin_id, 10) : undefined,
      reference_number: acompteForm.reference_number || undefined,
      idempotency_key: acompteKey.current,
    };
    try {
      if (acompteKind === 'client') {
        await tiersService.recordAcompteClient(tiersId, payload);
        toast.success(`Acompte de ${formatCurrency(montant)} encaissé`);
      } else {
        await tiersService.recordAcompteFournisseur(tiersId, payload);
        toast.success(`Acompte de ${formatCurrency(montant)} versé au fournisseur`);
      }
      setAcompteKind(null);
      void loadCompte();
      void loadAcomptes();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer l’acompte. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openCompensation = () => {
    setCompError(undefined);
    setCompForm({ date: today(), montant: String(Math.round(maxComp)), notes: '' });
    setShowCompensation(true);
  };

  const handleCompensation = async (e: FormEvent) => {
    e.preventDefault();
    const montant = Number.parseFloat(compForm.montant);
    if (!(montant > 0) || montant > maxComp) {
      setCompError(`Saisissez un montant entre 1 et ${formatCurrency(maxComp)}.`);
      requestAnimationFrame(() => document.getElementById('comp-montant')?.focus());
      return;
    }
    setCompError(undefined);
    setSubmitting(true);
    try {
      await tiersService.createCompensation(tiersId, {
        date_compensation: compForm.date,
        montant,
        notes: compForm.notes,
      });
      toast.success(`Compensation de ${formatCurrency(montant)} enregistrée`);
      setShowCompensation(false);
      void loadCompte();
      void loadCompensations();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer la compensation.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecompute = async () => {
    if (
      !(await confirm({
        title: 'Recalculer les soldes des factures de ce client ?',
        description:
          'Chaque paiement est reporté sur la facture où il a été enregistré ; les acomptes et avoirs sans facture désignée règlent d’abord les factures les plus anciennes. Le statut de chaque facture est ensuite recalculé.',
        confirmLabel: 'Recalculer les soldes',
      }))
    )
      return;
    try {
      const result = await tiersService.recomputeAllocation(tiersId);
      toast.success(result?.message || 'Soldes des factures recalculés');
      void loadCompte();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de recalculer les soldes des factures. Réessayez.'));
    }
  };

  const openRefund = (kind: AcompteKind, acompte: Acompte) => {
    setRefundError(undefined);
    setRefundTarget({ kind, acompte });
    setRefundForm({
      montant: String(Math.round(toNumber(acompte.montant_restant) ?? 0)),
      methode: acompte.methode_paiement || 'espece',
      session_caisse_id: '',
      notes: '',
    });
  };

  const handleRefund = async (e: FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    const montant = Number.parseFloat(refundForm.montant);
    const max = toNumber(refundTarget.acompte.montant_restant) ?? 0;
    if (!(montant > 0) || montant > max) {
      setRefundError(`Saisissez un montant entre 1 et ${formatCurrency(max)}.`);
      requestAnimationFrame(() => document.getElementById('refund-montant')?.focus());
      return;
    }
    setRefundError(undefined);
    setSubmitting(true);
    try {
      const payload = {
        montant,
        methode_paiement: refundForm.methode,
        session_caisse_id: refundForm.session_caisse_id ? Number.parseInt(refundForm.session_caisse_id, 10) : undefined,
        notes: refundForm.notes || undefined,
      };
      if (refundTarget.kind === 'client') await acompteService.refund(refundTarget.acompte.id, payload);
      else await acompteFournisseurService.refund(refundTarget.acompte.id, payload);
      toast.success(`Remboursement de ${formatCurrency(montant)} enregistré`);
      setRefundTarget(null);
      void loadCompte();
      void loadAcomptes();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer le remboursement.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadReleve = async () => {
    setDownloading(true);
    try {
      await tiersService.downloadRelevePdf(
        tiersId,
        tiers.raison_sociale || `contact-${tiersId}`,
        dateFrom || undefined,
        dateTo || undefined
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de générer le relevé. Réessayez.'));
    } finally {
      setDownloading(false);
    }
  };

  const handleCreateInteraction = async (e: FormEvent) => {
    e.preventDefault();
    if (crmSubmitting) return;
    setCrmSubmitting(true);
    try {
      const created = (await crmService.createInteraction({ tiers_id: tiersId, ...interactionForm })) as Interaction;
      setInteractions((prev) => [created, ...prev]);
      setShowInteractionForm(false);
      setInteractionForm(BLANK_INTERACTION);
      toast.success('Interaction enregistrée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer l’interaction. Réessayez.'));
    } finally {
      setCrmSubmitting(false);
    }
  };

  const handleDeleteInteraction = async (item: Interaction) => {
    if (
      !(await confirm({
        title: `Supprimer l’interaction «\u00A0${item.sujet}\u00A0» ?`,
        description: 'Elle sera retirée de l’historique de ce contact.',
        confirmLabel: 'Supprimer l’interaction',
        destructive: true,
      }))
    )
      return;
    try {
      await crmService.deleteInteraction(item.id);
      setInteractions((prev) => prev.filter((i) => i.id !== item.id));
      toast.success('Interaction supprimée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer l’interaction.'));
    }
  };

  const handleCreateTache = async (e: FormEvent) => {
    e.preventDefault();
    if (crmSubmitting) return;
    setCrmSubmitting(true);
    try {
      const created = (await crmService.createTache({ tiers_id: tiersId, ...tacheForm })) as Tache;
      setTaches((prev) => [created, ...prev]);
      setShowTacheForm(false);
      setTacheForm(BLANK_TACHE);
      toast.success('Tâche créée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de créer la tâche. Réessayez.'));
    } finally {
      setCrmSubmitting(false);
    }
  };

  const handleCompleteTache = async (tache: Tache) => {
    try {
      await crmService.updateTacheStatut(tache.id, 'terminee');
      setTaches((prev) => prev.map((t) => (t.id === tache.id ? { ...t, statut: 'terminee' } : t)));
      toast.success('Tâche terminée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de terminer la tâche.'));
    }
  };

  const handleDeleteTache = async (tache: Tache) => {
    if (
      !(await confirm({
        title: `Supprimer la tâche «\u00A0${tache.titre}\u00A0» ?`,
        description: 'Elle sera retirée de la liste des tâches de ce contact.',
        confirmLabel: 'Supprimer la tâche',
        destructive: true,
      }))
    )
      return;
    try {
      await crmService.deleteTache(tache.id);
      setTaches((prev) => prev.filter((t) => t.id !== tache.id));
      toast.success('Tâche supprimée');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer la tâche.'));
    }
  };

  /* ---------------- En-tête : une action principale ---------------- */

  const encaisserBtn = (variant: 'default' | 'outline') => (
    <Button variant={variant} size="touch" className="gap-2" onClick={() => openAcompte('client')}>
      <Plus className="h-4 w-4" aria-hidden="true" /> Encaisser un acompte
    </Button>
  );
  const verserBtn = (variant: 'default' | 'outline') => (
    <Button variant={variant} size="touch" className="gap-2" onClick={() => openAcompte('fournisseur')}>
      <Plus className="h-4 w-4" aria-hidden="true" /> Verser un acompte
    </Button>
  );

  let primaryAction: ReactNode;
  let secondaryActions: ReactNode = null;
  if (canCompensate) {
    primaryAction = (
      <Button size="touch" className="gap-2" onClick={openCompensation}>
        <GitMerge className="h-4 w-4" aria-hidden="true" /> Compenser
      </Button>
    );
    secondaryActions = (
      <>
        {encaisserBtn('outline')}
        {verserBtn('outline')}
      </>
    );
  } else if (isClient) {
    primaryAction = encaisserBtn('default');
    secondaryActions = isFourn ? verserBtn('outline') : null;
  } else if (isFourn) {
    primaryAction = verserBtn('default');
  }

  /* ---------------- Soldes ---------------- */

  const tiles: ReactNode[] = [];
  if (isClient) {
    tiles.push(
      <StatTile
        key="client"
        label="Solde client"
        value={<Money value={Math.abs(soldeClient)} unit="subtle" />}
        hint={<BalanceHint solde={soldeClient} side="client" />}
        footer={
          <BalanceBreakdown
            rows={[
              { label: 'Facturé', value: totaux.client.total_facture },
              { label: 'Payé', value: totaux.client.total_paye },
              { label: 'Avoirs', value: totaux.client.total_avoir, show: totaux.client.total_avoir > 0 },
              {
                label: 'Acomptes et compensations',
                value: totaux.client.total_acompte,
                show: totaux.client.total_acompte > 0,
              },
            ]}
          />
        }
      />
    );
  }
  if (isFourn) {
    tiles.push(
      <StatTile
        key="fournisseur"
        label="Solde fournisseur"
        value={<Money value={Math.abs(soldeFourn)} unit="subtle" />}
        hint={<BalanceHint solde={soldeFourn} side="fournisseur" />}
        footer={
          <BalanceBreakdown
            rows={[
              { label: 'Facturé', value: totaux.fournisseur.total_facture_fourn },
              { label: 'Payé', value: totaux.fournisseur.total_paye_fourn },
              {
                label: 'Acomptes versés',
                value: totaux.fournisseur.total_acompte_fourn,
                show: totaux.fournisseur.total_acompte_fourn > 0,
              },
            ]}
          />
        }
      />
    );
  }
  if (isMixed) {
    tiles.push(
      <StatTile
        key="net"
        label="Solde net"
        value={<Money value={Math.abs(totaux.solde_net)} unit="subtle" />}
        hint={<BalanceHint solde={totaux.solde_net} side="net" />}
        footer={<p className="text-xs text-muted-foreground">Solde client moins solde fournisseur</p>}
      />
    );
  } else if (isClient) {
    tiles.push(
      <StatTile
        key="acomptes-client"
        label="Acomptes disponibles"
        value={acomptesClientDispo}
        format="money"
        loading={acomptesState.loading}
        unavailable={!!acomptesState.error}
        hint={acomptesClient.length > 0 ? pluralize(acomptesClient.length, 'acompte', 'acomptes') : 'Aucun acompte en cours'}
      />
    );
  } else if (isFourn) {
    tiles.push(
      <StatTile
        key="acomptes-fourn"
        label="Acomptes versés disponibles"
        value={acomptesFournDispo}
        format="money"
        loading={acomptesState.loading}
        unavailable={!!acomptesState.error}
        hint={acomptesFourn.length > 0 ? pluralize(acomptesFourn.length, 'acompte', 'acomptes') : 'Aucun acompte en cours'}
      />
    );
  }
  if (isClient) {
    tiles.push(
      <StatTile
        key="plafond"
        label="Plafond de crédit"
        value={creditMax > 0 ? <Money value={creditMax} unit="subtle" /> : 'Aucune limite'}
        hint={
          creditMax > 0
            ? 'Les ventes à crédit qui le dépassent sont refusées'
            : 'Les ventes à crédit ne sont pas plafonnées'
        }
      />
    );
  }

  const hasCoordonnees = !!(tiers.telephone || tiers.email || tiers.adresse || tiers.nif || tiers.rccm);
  const periodText =
    dateFrom && dateTo
      ? `Du ${formatDate(dateFrom)} au ${formatDate(dateTo)}`
      : dateFrom
        ? `Depuis le ${formatDate(dateFrom)}`
        : dateTo
          ? `Jusqu’au ${formatDate(dateTo)}`
          : 'Tous les mouvements';

  /* ---------------- Rendu ---------------- */

  return (
    <PageShell
      title={nom}
      documentTitle={`Contact ${nom}`}
      backTo="/tiers"
      width="wide"
      meta={
        <>
          {isClient && <TiersRoleBadge role="client" />}
          {isFourn && <TiersRoleBadge role="fournisseur" />}
        </>
      }
      actions={secondaryActions}
      primaryAction={primaryAction}
      moreActions={[
        isAdmin &&
          isClient && {
            label: 'Recalculer les soldes des factures',
            icon: RefreshCw,
            onSelect: () => void handleRecompute(),
          },
      ]}
    >
      {/* Tuiles pleine largeur sur téléphone : le détail facturé / payé n'y tient pas à deux colonnes. */}
      <StatGrid className={TILE_GRID[tiles.length]}>{tiles}</StatGrid>

      {/* Coordonnées */}
      <Card>
        <CardHeader>
          <CardTitle>Coordonnées</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValueList columns={3}>
            <KeyValue label="Code">
              <DocumentCode>{tiers.code}</DocumentCode>
            </KeyValue>
            {tiers.telephone && (
              <KeyValue label="Téléphone">
                <a
                  href={`tel:${tiers.telephone.replace(/\s+/g, '')}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {tiers.telephone}
                </a>
              </KeyValue>
            )}
            {tiers.email && (
              <KeyValue label="Adresse e-mail">
                <a href={`mailto:${tiers.email}`} className="break-all text-primary underline-offset-4 hover:underline">
                  {tiers.email}
                </a>
              </KeyValue>
            )}
            {tiers.adresse && <KeyValue label="Adresse">{tiers.adresse}</KeyValue>}
            {tiers.nif && <KeyValue label="NIF">{tiers.nif}</KeyValue>}
            {tiers.rccm && <KeyValue label="RCCM">{tiers.rccm}</KeyValue>}
          </KeyValueList>
          {!hasCoordonnees && (
            <p className="mt-3 text-sm text-muted-foreground">Aucune coordonnée enregistrée pour ce contact</p>
          )}
        </CardContent>
      </Card>

      {/* Relevé de compte : une seule carte — titre, téléchargement et période
          en en-tête, le tableau et sa pagination dessous (deux boîtes empilées
          avant). Sous 768 px la carte s'efface : les mouvements deviennent des
          cartes et portent la surface. */}
      <section aria-labelledby="releve-title">
        <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
          <CardHeader className="gap-4 space-y-0 max-md:px-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle id="releve-title">Relevé de compte</CardTitle>
                <CardDescription>
                  {periodText} · {pluralize(mouvements.length, 'mouvement', 'mouvements')}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="touch"
                className="gap-2 self-start"
                onClick={() => void handleDownloadReleve()}
                disabled={downloading}
              >
                {downloading ? <Spinner /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
                Télécharger le relevé (PDF)
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ledger-date-from">Du</Label>
                <DatePicker id="ledger-date-from" value={dateFrom} onChange={setDateFrom} className="w-44" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ledger-date-to">Au</Label>
                <DatePicker id="ledger-date-to" value={dateTo} onChange={setDateTo} className="w-44" />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-muted-foreground"
                >
                  Effacer les filtres
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent inset="flush" className="md:border-t">
            <QueryState
              loading={ledgerState.loading}
              error={ledgerState.error}
              onRetry={() => void loadCompte()}
              errorTitle="Impossible de charger le relevé de compte"
              isEmpty={mouvements.length === 0}
              emptyIcon={FileText}
              emptyTitle="Aucun mouvement sur ce compte"
              emptyDescription={
                dateFrom || dateTo
                  ? 'Aucune facture, aucun paiement ni acompte sur la période choisie'
                  : 'Les factures, paiements et acomptes de ce contact apparaîtront ici'
              }
              skeleton={<TableSkeleton rows={6} columns={5} />}
            >
              <ResponsiveTable
                table={
                  <Table aria-label="Relevé de compte">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        {isMixed && <TableHead>Compte</TableHead>}
                        <TableHead>Type</TableHead>
                        <TableHead>Référence</TableHead>
                        <TableHead numeric>Débit</TableHead>
                        <TableHead numeric>Crédit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedMouvements.map((m, i) => {
                        const href = tiersMovementHref(m);
                        const ref = m.reference || m.libelle;
                        const label = tiersMovementLabel(m.type);
                        return (
                          <TableRow key={`${m.type}-${m.document_id ?? ''}-${i}`}>
                            <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(m.date)}</TableCell>
                            {isMixed && (
                              <TableCell>
                                <TiersRoleBadge role={m.role === 'Client' ? 'client' : 'fournisseur'} />
                              </TableCell>
                            )}
                            <TableCell>{label}</TableCell>
                            <TableCell>
                              {href ? (
                                <Link
                                  to={href}
                                  className="rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={tiersMovementOpenLabel(m.type, ref)}
                                >
                                  <MovementRef reference={m.reference} text={ref} />
                                </Link>
                              ) : (
                                <MovementRef reference={m.reference} text={ref} />
                              )}
                            </TableCell>
                            <TableCell numeric>{m.debit > 0 ? <Money value={m.debit} /> : null}</TableCell>
                            <TableCell numeric>{m.credit > 0 ? <Money value={m.credit} /> : null}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                }
                cards={pagedMouvements.map((m, i) => {
                  const href = tiersMovementHref(m);
                  const label = tiersMovementLabel(m.type);
                  const ref = m.reference || m.libelle;
                  return (
                    <DataCard
                      key={`${m.type}-${m.document_id ?? ''}-${i}`}
                      href={href ?? undefined}
                      linkLabel={href ? tiersMovementOpenLabel(m.type, ref) : undefined}
                      title={<MovementRef reference={m.reference} text={ref} />}
                      badge={
                        isMixed ? <TiersRoleBadge role={m.role === 'Client' ? 'client' : 'fournisseur'} /> : undefined
                      }
                    >
                      <DataCardRow label="Date" value={formatDate(m.date)} />
                      <DataCardRow label="Type" value={label} />
                      {m.debit > 0 && <DataCardRow label="Débit" value={<Money value={m.debit} />} numeric />}
                      {m.credit > 0 && <DataCardRow label="Crédit" value={<Money value={m.credit} />} numeric />}
                    </DataCard>
                  );
                })}
              />
            </QueryState>
            {!ledgerState.loading && !ledgerState.error && mouvements.length > LEDGER_PAGE_SIZE && (
              // Dans la carte, sous le tableau : 12 px du bord comme ses cellules.
              <div className="md:border-t md:px-1">
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
      </section>

      {/* Acomptes en cours */}
      {(acomptesState.error || allAcomptes.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Acomptes disponibles</CardTitle>
            <CardDescription>Avances encore utilisables ou remboursables</CardDescription>
          </CardHeader>
          <CardContent inset="flush">
            {acomptesState.error ? (
              <QueryErrorState
                error={acomptesState.error}
                title="Impossible de charger les acomptes"
                onRetry={() => void loadAcomptes()}
                className="py-8"
              />
            ) : (
              <ResponsiveTable
                className="max-md:px-4 max-md:pb-4"
                table={
                  <Table aria-label="Acomptes disponibles">
                    <TableHeader>
                      <TableRow>
                        {isMixed && <TableHead>Type</TableHead>}
                        <TableHead>N°</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Mode de paiement</TableHead>
                        <TableHead numeric>Montant initial</TableHead>
                        <TableHead numeric>Disponible</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allAcomptes.map(({ kind, acompte: a }) => (
                        <TableRow key={`${kind}-${a.id}`}>
                          {isMixed && (
                            <TableCell>
                              <TiersRoleBadge role={kind} />
                            </TableCell>
                          )}
                          <TableCell>
                            <DocumentCode>{a.id}</DocumentCode>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(a.date_acompte)}</TableCell>
                          <TableCell>{formatPaymentMethod(a.methode_paiement)}</TableCell>
                          <TableCell numeric>
                            <Money value={a.montant} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={a.montant_restant} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge type="acompte" statut={a.statut} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              onClick={() => openRefund(kind, a)}
                              aria-label={`Rembourser l’acompte n° ${a.id}`}
                            >
                              Rembourser
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
                cards={allAcomptes.map(({ kind, acompte: a }) => (
                  <DataCard
                    key={`${kind}-${a.id}`}
                    title={`Acompte n° ${a.id}`}
                    badge={<StatusBadge type="acompte" statut={a.statut} />}
                    actions={
                      <Button variant="outline" size="touch" onClick={() => openRefund(kind, a)}>
                        Rembourser l’acompte
                      </Button>
                    }
                  >
                    {isMixed && <DataCardRow label="Type" value={kind === 'client' ? 'Client' : 'Fournisseur'} />}
                    <DataCardRow label="Date" value={formatDate(a.date_acompte)} />
                    <DataCardRow label="Mode de paiement" value={formatPaymentMethod(a.methode_paiement)} />
                    <DataCardRow label="Montant initial" value={<Money value={a.montant} />} numeric />
                    <DataCardRow label="Disponible" value={<Money value={a.montant_restant} />} numeric />
                  </DataCard>
                ))}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Compensations */}
      {isMixed && (compensationsError || compensations.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Compensations</CardTitle>
            <CardDescription>
              {compensationsError
                ? 'Créance client et dette fournisseur réduites du même montant'
                : `${pluralize(compensations.length, 'compensation enregistrée', 'compensations enregistrées')} : créance client et dette fournisseur réduites du même montant`}
            </CardDescription>
          </CardHeader>
          <CardContent inset="flush">
            {compensationsError ? (
              <QueryErrorState
                error={compensationsError}
                title="Impossible de charger les compensations"
                onRetry={() => void loadCompensations()}
                className="py-8"
              />
            ) : (
              <Table aria-label="Compensations">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead numeric>Montant</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compensations.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(c.date_compensation)}</TableCell>
                      <TableCell numeric>
                        <Money value={c.montant} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Interactions */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>
            Interactions
            {!interactionsState.loading && !interactionsState.error && (
              <>
                {' '}
                <span className="font-normal tabular-nums text-muted-foreground">{formatNumber(interactions.length)}</span>
              </>
            )}
          </CardTitle>
          <Button variant="outline" className="gap-1.5" onClick={() => setShowInteractionForm(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle interaction
          </Button>
        </CardHeader>
        <CardContent inset="flush">
          <QueryState
            loading={interactionsState.loading}
            error={interactionsState.error}
            onRetry={() => void loadInteractions()}
            errorTitle="Impossible de charger les interactions"
            isEmpty={interactions.length === 0}
            emptyIcon={MessageSquare}
            emptyTitle="Aucune interaction enregistrée"
            emptyDescription="Notez ici vos appels, visites et relances avec ce contact"
            compact
            className="py-6"
            skeleton={<ListSkeleton items={2} />}
          >
            <ul className="divide-y border-t">
              {interactions.map((item) => {
                const typeConfig = INTERACTION_TYPES.find((t) => t.value === item.type);
                const TypeIcon = typeConfig?.icon ?? MessageSquare;
                const priorite = prioriteLabel(item.priorite);
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <span className="mt-0.5 rounded-full bg-muted p-1.5" aria-hidden="true">
                      <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.sujet}</p>
                      {item.description && <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>}
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{typeConfig?.label ?? item.type}</span>
                        {priorite && (
                          <span className={PRIORITE_CLASS[item.priorite ?? ''] ?? undefined}>Priorité {priorite.toLowerCase()}</span>
                        )}
                        <span>{formatDate(item.date_interaction)}</span>
                        {item.date_rappel && (
                          <span className="inline-flex items-center gap-1 text-warning-700">
                            <Clock className="h-3 w-3" aria-hidden="true" /> Rappel le {formatDate(item.date_rappel)}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                      onClick={() => void handleDeleteInteraction(item)}
                      aria-label={`Supprimer l’interaction « ${item.sujet} »`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </QueryState>
        </CardContent>
      </Card>

      {/* Tâches */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>
            Tâches
            {!tachesState.loading && !tachesState.error && (
              <>
                {' '}
                <span className="font-normal tabular-nums text-muted-foreground">{formatNumber(taches.length)}</span>
              </>
            )}
          </CardTitle>
          <Button variant="outline" className="gap-1.5" onClick={() => setShowTacheForm(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle tâche
          </Button>
        </CardHeader>
        <CardContent inset="flush">
          <QueryState
            loading={tachesState.loading}
            error={tachesState.error}
            onRetry={() => void loadTaches()}
            errorTitle="Impossible de charger les tâches"
            isEmpty={taches.length === 0}
            emptyIcon={ListTodo}
            emptyTitle="Aucune tâche"
            emptyDescription="Planifiez un rappel : relance, livraison ou rendez-vous"
            compact
            className="py-6"
            skeleton={<ListSkeleton items={2} />}
          >
            <ul className="divide-y border-t">
              {taches.map((t) => {
                const done = t.statut === 'terminee';
                const priorite = prioriteLabel(t.priorite);
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <span className="mt-0.5" aria-hidden="true">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-success-700" />
                      ) : (
                        <CircleDashed className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={done ? 'text-sm font-medium text-muted-foreground line-through' : 'text-sm font-medium'}>
                        {t.titre}
                        {done && <span className="sr-only"> (terminée)</span>}
                      </p>
                      {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {priorite && (
                          <span className={PRIORITE_CLASS[t.priorite ?? ''] ?? undefined}>Priorité {priorite.toLowerCase()}</span>
                        )}
                        {t.date_echeance && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" aria-hidden="true" /> Échéance le {formatDate(t.date_echeance)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!done && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleCompleteTache(t)}
                          aria-label={`Marquer « ${t.titre} » comme terminée`}
                          title="Marquer comme terminée"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                        onClick={() => void handleDeleteTache(t)}
                        aria-label={`Supprimer la tâche « ${t.titre} »`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </QueryState>
        </CardContent>
      </Card>

      {/* ---------- Dialogue : nouvelle interaction ---------- */}
      <Dialog open={showInteractionForm} onOpenChange={setShowInteractionForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle interaction</DialogTitle>
            <DialogDescription>Un appel, un e-mail, une visite ou une relance avec {nom}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateInteraction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="interaction-type">Type d’interaction</Label>
              <Select value={interactionForm.type} onValueChange={(v) => setInteractionForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger id="interaction-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-int-sujet">
                Sujet <RequiredMark />
              </Label>
              <Input
                id="crm-int-sujet"
                value={interactionForm.sujet}
                onChange={(e) => setInteractionForm((p) => ({ ...p, sujet: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-int-desc">Description</Label>
              <Textarea
                id="crm-int-desc"
                value={interactionForm.description}
                onChange={(e) => setInteractionForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="crm-int-priorite">Priorité</Label>
                <Select
                  value={interactionForm.priorite}
                  onValueChange={(v) => setInteractionForm((p) => ({ ...p, priorite: v }))}
                >
                  <SelectTrigger id="crm-int-priorite" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crm-int-rappel">Date de rappel</Label>
                <DatePicker
                  id="crm-int-rappel"
                  value={interactionForm.date_rappel}
                  onChange={(date_rappel) => setInteractionForm((p) => ({ ...p, date_rappel }))}
                  className="w-full"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInteractionForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={crmSubmitting}>
                {crmSubmitting ? 'Enregistrement…' : 'Enregistrer l’interaction'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialogue : nouvelle tâche ---------- */}
      <Dialog open={showTacheForm} onOpenChange={setShowTacheForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle tâche</DialogTitle>
            <DialogDescription>Un rappel à faire pour {nom} : relance, livraison ou rendez-vous</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTache} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="crm-tache-titre">
                Titre <RequiredMark />
              </Label>
              <Input
                id="crm-tache-titre"
                value={tacheForm.titre}
                onChange={(e) => setTacheForm((p) => ({ ...p, titre: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-tache-desc">Description</Label>
              <Textarea
                id="crm-tache-desc"
                value={tacheForm.description}
                onChange={(e) => setTacheForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="crm-tache-priorite">Priorité</Label>
                <Select value={tacheForm.priorite} onValueChange={(v) => setTacheForm((p) => ({ ...p, priorite: v }))}>
                  <SelectTrigger id="crm-tache-priorite" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crm-tache-echeance">Échéance</Label>
                <DatePicker
                  id="crm-tache-echeance"
                  value={tacheForm.date_echeance}
                  onChange={(date_echeance) => setTacheForm((p) => ({ ...p, date_echeance }))}
                  className="w-full"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowTacheForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={crmSubmitting}>
                {crmSubmitting ? 'Création…' : 'Créer la tâche'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialogue : acompte client / fournisseur ---------- */}
      <Dialog open={acompteKind !== null} onOpenChange={(o) => !o && setAcompteKind(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{acompteKind === 'fournisseur' ? 'Verser un acompte au fournisseur' : 'Encaisser un acompte client'}</DialogTitle>
            <DialogDescription>
              {acompteKind === 'fournisseur'
                ? `Argent versé d’avance à ${nom}`
                : `Argent reçu d’avance de ${nom}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAcompte} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="acompte-montant">
                Montant <RequiredMark />
              </Label>
              <MoneyInput
                id="acompte-montant"
                value={acompteForm.montant}
                onChange={(v) => {
                  setAcompteForm((p) => ({ ...p, montant: v }));
                  setAcompteErrors((p) => ({ ...p, montant: undefined }));
                }}
                placeholder="0"
                {...fieldErrorProps('acompte-montant', acompteErrors.montant)}
              />
              <FieldError id="acompte-montant">{acompteErrors.montant}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acompte-methode">Mode de paiement</Label>
              <Select value={acompteForm.methode} onValueChange={(v) => setAcompteForm((p) => ({ ...p, methode: v }))}>
                <SelectTrigger id="acompte-methode" className="w-full">
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
            <div className="space-y-1.5">
              <Label htmlFor="acompte-magasin">
                Magasin {acompteForm.methode === 'espece' && <RequiredMark />}
              </Label>
              <Select
                value={acompteForm.magasin_id || undefined}
                onValueChange={(v) => {
                  setAcompteForm((p) => ({ ...p, magasin_id: v }));
                  setAcompteErrors((p) => ({ ...p, magasin: undefined }));
                }}
              >
                <SelectTrigger
                  id="acompte-magasin"
                  className="w-full"
                  {...fieldErrorProps('acompte-magasin', acompteErrors.magasin)}
                >
                  <SelectValue placeholder="Choisir un magasin" />
                </SelectTrigger>
                <SelectContent>
                  {magasins.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.nom} ({m.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="acompte-magasin">{acompteErrors.magasin}</FieldError>
              {magasinsError ? (
                <p className="text-xs text-danger-700">Impossible de charger les magasins. Rechargez la page.</p>
              ) : (
                acompteForm.methode === 'espece' && (
                  <p className="text-xs text-muted-foreground">La caisse de ce magasin doit être ouverte</p>
                )
              )}
            </div>
            {acompteForm.methode !== 'espece' && (
              <div className="space-y-1.5">
                <Label htmlFor="acompte-reference">Référence (chèque ou virement)</Label>
                <Input
                  id="acompte-reference"
                  value={acompteForm.reference_number}
                  onChange={(e) => setAcompteForm((p) => ({ ...p, reference_number: e.target.value }))}
                  placeholder="N° de pièce"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="acompte-notes">Notes</Label>
              <Input
                id="acompte-notes"
                value={acompteForm.notes}
                onChange={(e) => setAcompteForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAcompteKind(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Enregistrement…' : 'Enregistrer l’acompte'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialogue : compensation ---------- */}
      <Dialog open={showCompensation} onOpenChange={setShowCompensation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Compensation client / fournisseur</DialogTitle>
            <DialogDescription>
              La créance du client et votre dette envers le fournisseur diminuent du même montant
            </DialogDescription>
          </DialogHeader>
          <KeyValueList columns={1} className="rounded-md border bg-muted/40 p-3">
            <KeyValue label="Créance client" numeric>
              <Money value={soldeClient} />
            </KeyValue>
            <KeyValue label="Dette fournisseur" numeric>
              <Money value={soldeFourn} />
            </KeyValue>
            <KeyValue label="Maximum compensable" numeric>
              <Money value={maxComp} emphasis />
            </KeyValue>
          </KeyValueList>
          <form onSubmit={handleCompensation} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="comp-date">
                Date <RequiredMark />
              </Label>
              <DatePicker
                id="comp-date"
                value={compForm.date}
                onChange={(date) => setCompForm((p) => ({ ...p, date }))}
                required
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-montant">
                Montant à compenser <RequiredMark />
              </Label>
              <MoneyInput
                id="comp-montant"
                value={compForm.montant}
                onChange={(v) => {
                  setCompForm((p) => ({ ...p, montant: v }));
                  setCompError(undefined);
                }}
                placeholder="0"
                aria-describedby={compError ? 'comp-montant-error' : 'comp-montant-help'}
                aria-invalid={compError ? true : undefined}
              />
              <p id="comp-montant-help" className="text-xs text-muted-foreground">
                Maximum : {formatCurrency(maxComp)}
              </p>
              <FieldError id="comp-montant">{compError}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-notes">Notes</Label>
              <Input id="comp-notes" value={compForm.notes} onChange={(e) => setCompForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCompensation(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Enregistrement…' : 'Enregistrer la compensation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialogue : remboursement d'acompte ---------- */}
      <Dialog open={refundTarget !== null} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rembourser l’acompte n° {refundTarget?.acompte.id}</DialogTitle>
            <DialogDescription>
              {refundForm.methode === 'espece'
                ? refundTarget?.kind === 'fournisseur'
                  ? 'Le fournisseur vous rend l’argent : le montant entre dans la caisse'
                  : 'L’argent sort de la caisse et est rendu au client'
                : refundTarget?.kind === 'fournisseur'
                  ? 'Le fournisseur vous rend l’argent par le mode de paiement choisi'
                  : 'L’argent est rendu au client par le mode de paiement choisi'}
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <form onSubmit={handleRefund} className="space-y-3" noValidate>
              <KeyValueList columns={1} className="rounded-md border bg-muted/40 p-3">
                <KeyValue label="Disponible sur l’acompte" numeric>
                  <Money value={refundTarget.acompte.montant_restant} emphasis />
                </KeyValue>
              </KeyValueList>
              <div className="space-y-1.5">
                <Label htmlFor="refund-montant">
                  Montant <RequiredMark />
                </Label>
                <MoneyInput
                  id="refund-montant"
                  value={refundForm.montant}
                  onChange={(v) => {
                    setRefundForm((p) => ({ ...p, montant: v }));
                    setRefundError(undefined);
                  }}
                  placeholder="0"
                  {...fieldErrorProps('refund-montant', refundError)}
                />
                <FieldError id="refund-montant">{refundError}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-methode">Mode de remboursement</Label>
                <Select value={refundForm.methode} onValueChange={(v) => setRefundForm((p) => ({ ...p, methode: v }))}>
                  <SelectTrigger id="refund-methode" className="w-full">
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
              <div className="space-y-1.5">
                <Label htmlFor="refund-session">Session de caisse (facultatif)</Label>
                <Input
                  id="refund-session"
                  type="number"
                  inputMode="numeric"
                  value={refundForm.session_caisse_id}
                  onChange={(e) => setRefundForm((p) => ({ ...p, session_caisse_id: e.target.value }))}
                  placeholder="Automatique"
                  aria-describedby="refund-session-help"
                />
                <p id="refund-session-help" className="text-xs text-muted-foreground">
                  Laissez vide pour utiliser la session ouverte du magasin de l’acompte
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-notes">Notes</Label>
                <Input
                  id="refund-notes"
                  value={refundForm.notes}
                  onChange={(e) => setRefundForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRefundTarget(null)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Remboursement…' : 'Rembourser l’acompte'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
