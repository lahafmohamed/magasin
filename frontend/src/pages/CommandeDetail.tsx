import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  CircleAlert,
  Clock,
  Download,
  PackageCheck,
  ShoppingCart,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { commandeService } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { TiersPicker } from '../components/TiersPicker';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { CommandeLinesEditor, type CommandeLigneDraft } from '../components/CommandeProductPicker';
import type { Tiers } from '../types';
import StatusBadge, { getStatusLabel } from '@/components/StatusBadge';
import { PageShell } from '@/components/ui/page-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { DocumentTotals } from '@/components/ui/document-totals';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState } from '@/components/ui/query-state';
import { CardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { cn } from '@/lib/utils';
import { formatDate, formatNumber, toNumber } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';

interface CommandeLigne {
  id: number;
  produit_id: number;
  produit_nom: string | null;
  produit_reference: string | null;
  quantite: number | string;
  prix_unitaire: number | string;
  total_ligne: number | string;
  stock?: number | string | null;
  stock_min?: number | string | null;
}

interface CommandeData {
  id: number;
  numero_commande: string;
  tiers_id: number;
  fournisseur_nom: string | null;
  fournisseur_telephone: string | null;
  fournisseur_email: string | null;
  date_commande: string;
  date_livraison_prevue: string | null;
  date_livraison_reelle?: string | null;
  statut: string;
  sous_total: number | string;
  notes: string | null;
  lignes: CommandeLigne[];
}

interface MatchLigne {
  produit_id: number;
  produit_nom: string | null;
  reference: string | null;
  qte_commandee: number;
  qte_recue: number;
  qte_facturee: number;
  prix_commande: number | null;
  prix_facture: number | null;
  coherent: boolean;
  within_tolerance: boolean;
}

interface MatchResult {
  coherent: boolean;
  within_tolerance: boolean;
  config?: { bloquer?: boolean };
  violations?: { produit_id: number; produit_nom: string | null; reasons: string[] }[];
  lignes: MatchLigne[];
}

type Transition = 'validee' | 'expediee' | 'annulee';

/**
 * Créer, modifier ou faire avancer une commande fournisseur : gérant et
 * administrateur (E2, 2026-10-24 — miroir de `POST/PUT /commandes`).
 */
const WRITE_ROLES = ['admin', 'manager'];
const CANCELLABLE = ['en_attente', 'validee', 'expediee'];
const RECEIVABLE = ['validee', 'expediee'];

const STEPS = ['en_attente', 'validee', 'expediee', 'livree'] as const;

function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 404;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Étapes de la commande : statiques, l'étape en cours porte `aria-current`.
 * Faite = coche dans un disque plein ; en cours = point dans un anneau ; à
 * venir = anneau vide. Une icône par étape faisait lire « Validée » comme
 * terminée, et le bleu n'y désignait rien sur quoi agir. « Reçue » est la
 * fin du parcours : atteinte, elle est faite, pas en cours.
 */
function CommandeSteps({ statut }: { statut: string }) {
  if (statut === 'annulee') {
    return (
      <p className="flex items-center gap-2 text-sm">
        <XCircle className="h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
        Cette commande a été annulée : elle ne peut plus être réceptionnée
      </p>
    );
  }
  const current = STEPS.findIndex((s) => s === statut);
  const finished = statut === 'livree';
  return (
    <ol aria-label="Étapes de la commande" className="flex items-start">
      {STEPS.map((step, i) => {
        const isCurrent = i === current;
        const done = i < current || (finished && isCurrent);
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn('absolute left-0 right-1/2 top-4 h-0.5', i <= current ? 'bg-foreground' : 'bg-border')}
              />
            )}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={cn('absolute left-1/2 right-0 top-4 h-0.5', i < current ? 'bg-foreground' : 'bg-border')}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative flex h-8 w-8 items-center justify-center rounded-full border-2',
                done
                  ? 'border-foreground bg-foreground text-background'
                  : isCurrent
                    ? 'border-foreground bg-card text-foreground'
                    : 'border-border bg-card'
              )}
            >
              {done ? (
                <Check className="h-4 w-4" />
              ) : isCurrent ? (
                <span className="h-2 w-2 rounded-full bg-current" />
              ) : null}
            </span>
            <span className={cn('text-xs', isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {getStatusLabel('commande', step)}
              {done && !isCurrent && <span className="sr-only"> (terminée)</span>}
              {isCurrent && <span className="sr-only"> (étape actuelle)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * État d'une ligne du contrôle commande / réception / facture (GV-10).
 *
 * `coherent` côté API veut seulement dire « rien de facturé au-delà du reçu,
 * prix identique » : il est vrai pour une commande où rien n'est encore arrivé.
 * Le vert est donc réservé à la concordance complète (commandé = reçu =
 * facturé) ; ce qui reste à faire est un état neutre, pas une réussite.
 */
type MatchLineState = 'conforme' | 'a_recevoir' | 'a_facturer' | 'recu_en_trop' | 'ecart_tolere' | 'ecart';

const QTY_EPSILON = 0.0001;

function matchLineState(l: MatchLigne): MatchLineState {
  if (!l.within_tolerance) return 'ecart';
  if (!l.coherent) return 'ecart_tolere';
  if (l.qte_recue > l.qte_commandee + QTY_EPSILON) return 'recu_en_trop';
  if (l.qte_recue < l.qte_commandee - QTY_EPSILON) return 'a_recevoir';
  if (l.qte_facturee < l.qte_recue - QTY_EPSILON) return 'a_facturer';
  return 'conforme';
}

const MATCH_STATE: Record<
  MatchLineState,
  { label: string; icon: typeof CheckCircle; className: string }
> = {
  conforme: { label: 'Conforme', icon: CheckCircle, className: 'text-success-700' },
  a_recevoir: { label: 'À recevoir', icon: Clock, className: 'text-muted-foreground' },
  a_facturer: { label: 'À facturer', icon: Clock, className: 'text-muted-foreground' },
  recu_en_trop: { label: 'Reçu en trop', icon: AlertTriangle, className: 'text-warning-700' },
  ecart_tolere: { label: 'Écart toléré', icon: AlertTriangle, className: 'text-warning-700' },
  ecart: { label: 'Écart', icon: CircleAlert, className: 'text-danger-700' },
};

/** État d'une ligne du contrôle : icône + mot, jamais la couleur seule. */
function MatchState({ ligne }: { ligne: MatchLigne }) {
  const { label, icon: Icon, className } = MATCH_STATE[matchLineState(ligne)];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {label}
    </span>
  );
}

/** Pluriel français : 0 et 1 au singulier. */
const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/**
 * Ligne de synthèse sous le titre du contrôle. Le vert « concordent » n'est
 * donné qu'à une commande entièrement reçue et facturée, sans écart.
 */
function MatchSummary({ match }: { match: MatchResult }) {
  const states = match.lignes.map(matchLineState);
  if (states.every((s) => s === 'conforme') && match.coherent) {
    return (
      <p className="flex items-center gap-2 text-sm text-success-700">
        <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Commande, réceptions et facture concordent
      </p>
    );
  }
  const notes: Array<{ key: string; text: string; tone: 'warning' | 'muted' }> = [];
  const tolerated = states.filter((s) => s === 'ecart_tolere' || s === 'recu_en_trop').length;
  if (tolerated > 0) {
    notes.push({
      key: 'tolere',
      tone: 'warning',
      text: `Écarts dans la tolérance sur ${plural(tolerated, 'produit', 'produits')} : contrôlez-les avant de payer la facture fournisseur`,
    });
  }
  const nothingYet = match.lignes.every((l) => l.qte_recue <= QTY_EPSILON && l.qte_facturee <= QTY_EPSILON);
  const toReceive = states.filter((s) => s === 'a_recevoir').length;
  const toInvoice = states.filter((s) => s === 'a_facturer').length;
  if (nothingYet) {
    notes.push({ key: 'attente', tone: 'muted', text: 'Rien n’a encore été reçu ni facturé' });
  } else if (toReceive > 0) {
    notes.push({
      key: 'reception',
      tone: 'muted',
      text: `Réception partielle : ${plural(toReceive, 'produit reste', 'produits restent')} à recevoir`,
    });
  } else if (toInvoice > 0) {
    notes.push({
      key: 'facture',
      tone: 'muted',
      text: `Tout est reçu : ${plural(toInvoice, 'produit reste', 'produits restent')} à facturer par le fournisseur`,
    });
  }
  if (notes.length === 0) return null;
  return (
    <div className="space-y-1">
      {notes.map((n) =>
        n.tone === 'warning' ? (
          <p key={n.key} className="flex items-start gap-2 text-sm text-warning-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {n.text}
          </p>
        ) : (
          <p key={n.key} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {n.text}
          </p>
        )
      )}
    </div>
  );
}

export default function CommandeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const canOpen = useRouteAccess();
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.includes(user?.role ?? '');

  const [commande, setCommande] = useState<CommandeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [matchError, setMatchError] = useState<unknown>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [busy, setBusy] = useState(false);

  // Modification (commande en attente uniquement)
  const [isEditing, setIsEditing] = useState(false);
  const [fournisseur, setFournisseur] = useState<Tiers | null>(null);
  const [draftLignes, setDraftLignes] = useState<CommandeLigneDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [dateLivraison, setDateLivraison] = useState('');
  const [saving, setSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<{ fournisseur?: string; lignes?: string }>({});

  const loadCommande = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = (await commandeService.getById(parseInt(id, 10))) as CommandeData;
      setCommande(data);
    } catch (err) {
      setCommande(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadMatch = useCallback(async () => {
    if (!id) return;
    setMatchLoading(true);
    setMatchError(null);
    try {
      setMatch((await commandeService.getMatch(parseInt(id, 10))) as MatchResult);
    } catch (err) {
      setMatch(null);
      setMatchError(err);
    } finally {
      setMatchLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadCommande();
    void loadMatch();
  }, [loadCommande, loadMatch]);

  const downloadBonCommande = async () => {
    if (!commande) return;
    setDownloadingPdf(true);
    try {
      await commandeService.downloadPdf(commande.id, commande.numero_commande);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de télécharger le bon de commande. Réessayez.'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const updateStatut = async (statut: Transition) => {
    if (!commande) return;
    const numero = commande.numero_commande;
    const opts =
      statut === 'annulee'
        ? {
            title: `Annuler la commande ${numero} ?`,
            description: 'Elle ne pourra plus être réceptionnée.',
            confirmLabel: 'Annuler la commande',
            cancelLabel: 'Garder la commande',
            destructive: true,
          }
        : statut === 'validee'
          ? {
              title: `Valider la commande ${numero} ?`,
              description:
                'Une fois validée, la commande ne peut plus être modifiée. Elle pourra être réceptionnée à l’arrivée des produits.',
              confirmLabel: 'Valider la commande',
            }
          : {
              title: `Marquer la commande ${numero} comme expédiée ?`,
              description: 'Le fournisseur a envoyé les produits : vous les réceptionnerez à leur arrivée.',
              confirmLabel: 'Marquer comme expédiée',
            };
    if (!(await confirm(opts))) return;
    setBusy(true);
    try {
      await commandeService.updateStatut(commande.id, statut);
      const done = statut === 'annulee' ? 'annulée' : statut === 'validee' ? 'validée' : 'marquée comme expédiée';
      toast.success(`Commande ${numero} ${done}`);
      await loadCommande();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de mettre à jour la commande. Réessayez.'));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    if (!commande) return;
    setFournisseur({
      id: commande.tiers_id,
      raison_sociale: commande.fournisseur_nom ?? '',
      telephone: commande.fournisseur_telephone,
      email: commande.fournisseur_email,
    } as Tiers);
    setDateLivraison(commande.date_livraison_prevue ? commande.date_livraison_prevue.slice(0, 10) : '');
    setNotes(commande.notes ?? '');
    setDraftLignes(
      commande.lignes.map((l) => ({
        produit_id: l.produit_id,
        produit_nom: l.produit_nom ?? 'Produit supprimé',
        produit_reference: l.produit_reference ?? '',
        quantite: toNumber(l.quantite) ?? 1,
        prix_unitaire: toNumber(l.prix_unitaire) ?? 0,
        stock: toNumber(l.stock) ?? 0,
        stock_min: toNumber(l.stock_min) ?? 0,
      }))
    );
    setEditErrors({});
    setIsEditing(true);
  };

  const saveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget || !commande) return;
    const next: { fournisseur?: string; lignes?: string } = {};
    if (!fournisseur) next.fournisseur = 'Choisissez le fournisseur.';
    if (draftLignes.length === 0) next.lignes = 'Ajoutez au moins un produit à la commande.';
    setEditErrors(next);
    if (next.fournisseur) {
      document.getElementById('cmd-edit-fournisseur')?.focus();
      return;
    }
    if (next.lignes) {
      document.getElementById('cmd-edit-produit')?.focus();
      return;
    }
    setSaving(true);
    try {
      await commandeService.update(commande.id, {
        tiers_id: fournisseur!.id,
        lignes: draftLignes.map((l) => ({ produit_id: l.produit_id, quantite: l.quantite, prix_unitaire: l.prix_unitaire })),
        notes: notes.trim() || undefined,
        date_livraison_prevue: dateLivraison || undefined,
      });
      toast.success(`Commande ${commande.numero_commande} enregistrée`);
      setIsEditing(false);
      await Promise.all([loadCommande(), loadMatch()]);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer la commande. Réessayez.'));
    } finally {
      setSaving(false);
    }
  };

  const shellBase = {
    width: 'wide' as const,
    backTo: '/commandes',
  };

  if (loading) {
    return (
      <PageShell title="Commande fournisseur" {...shellBase}>
        <Card aria-busy="true">
          <CardContent inset="standalone">
            <CardSkeleton lines={4} />
          </CardContent>
        </Card>
        <Card>
          <CardContent inset="standalone">
            <TableSkeleton rows={4} columns={5} />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (error || !commande) {
    const notFound = !error || isNotFound(error);
    return (
      <PageShell title={notFound ? 'Commande introuvable' : 'Commande fournisseur'} {...shellBase}>
        <Card>
          {notFound ? (
            <EmptyState
              icon={ShoppingCart}
              title="Commande introuvable"
              description="Cette commande fournisseur n’existe pas ou a été supprimée"
              action={
                <Link to="/commandes" className={buttonVariants({ variant: 'outline' })}>
                  Retour aux commandes fournisseur
                </Link>
              }
            />
          ) : (
            <QueryErrorState
              error={error}
              title="Impossible de charger la commande"
              onRetry={() => void loadCommande()}
            />
          )}
        </Card>
      </PageShell>
    );
  }

  const numero = commande.numero_commande;

  // ---------------------------------------------------------------- Modification
  if (isEditing) {
    const cancelEdit = () => setIsEditing(false);
    const saveButton = (
      <Button type="submit" form="commande-edit-form" size="touch" disabled={saving} className="gap-2">
        {saving ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />}
        {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
      </Button>
    );
    return (
      <PageShell
        title={`Modifier la commande ${numero}`}
        width="wide"
        onBack={cancelEdit}
        backLabel={`Commande ${numero}`}
        focusOnMount
        description="Modifiez les produits, les quantités et la date de livraison prévue"
        actions={
          <Button type="button" variant="outline" size="touch" onClick={cancelEdit}>
            Annuler
          </Button>
        }
        primaryAction={saveButton}
      >
        <form
          id="commande-edit-form"
          onSubmit={saveEdit}
          onKeyDown={(e) => {
            const target = e.target as HTMLElement;
            if (e.key === 'Enter' && e.currentTarget.contains(target) && target.tagName === 'INPUT') e.preventDefault();
          }}
          noValidate
          className="space-y-4 sm:space-y-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
            <div className="space-y-4 sm:space-y-6 md:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Fournisseur</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  <Label htmlFor="cmd-edit-fournisseur">
                    Fournisseur <RequiredMark />
                  </Label>
                  <TiersPicker
                    id="cmd-edit-fournisseur"
                    role="fournisseur"
                    value={fournisseur}
                    onChange={setFournisseur}
                    {...fieldErrorProps('cmd-edit-fournisseur', editErrors.fournisseur)}
                  />
                  <FieldError id="cmd-edit-fournisseur">{editErrors.fournisseur}</FieldError>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Livraison et notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cmd-edit-date">Date de livraison prévue</Label>
                    <DatePicker id="cmd-edit-date" value={dateLivraison} onChange={setDateLivraison} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cmd-edit-notes">Notes</Label>
                    <Textarea
                      id="cmd-edit-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Instructions de livraison, références…"
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="md:col-span-2">
              <CommandeLinesEditor
                idPrefix="cmd-edit"
                lignes={draftLignes}
                onChange={setDraftLignes}
                error={editErrors.lignes}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="touch" onClick={cancelEdit}>
              Annuler
            </Button>
            {saveButton}
          </div>
        </form>
      </PageShell>
    );
  }

  // ---------------------------------------------------------------- Consultation
  const late =
    !!commande.date_livraison_prevue &&
    CANCELLABLE.includes(commande.statut) &&
    commande.date_livraison_prevue.slice(0, 10) < todayIso();
  const canReceive = canWrite && RECEIVABLE.includes(commande.statut) && canOpen('/receptions');

  // Une seule icône dans l'en-tête : celle de l'action principale. Le bon de
  // commande se télécharge depuis « Plus d’actions », comme dans la liste.
  const primaryAction =
    canWrite && commande.statut === 'en_attente' ? (
      <Button size="touch" className="gap-2" disabled={busy} onClick={() => void updateStatut('validee')}>
        <CheckCircle className="h-4 w-4" aria-hidden="true" />
        Valider la commande
      </Button>
    ) : canReceive ? (
      <Button size="touch" className="gap-2" onClick={() => navigate(`/receptions?commande_id=${commande.id}`)}>
        <PackageCheck className="h-4 w-4" aria-hidden="true" />
        Réceptionner la commande
      </Button>
    ) : undefined;

  const actions =
    canWrite && commande.statut === 'en_attente' ? (
      <Button variant="outline" size="touch" onClick={startEditing}>
        Modifier la commande
      </Button>
    ) : canWrite && commande.statut === 'validee' ? (
      <Button variant="outline" size="touch" disabled={busy} onClick={() => void updateStatut('expediee')}>
        Marquer comme expédiée
      </Button>
    ) : undefined;

  const total = toNumber(commande.sous_total);
  const violations = match?.violations ?? [];
  const hasContact = !!(commande.fournisseur_telephone || commande.fournisseur_email);

  return (
    <PageShell
      title={`Commande ${numero}`}
      {...shellBase}
      meta={<StatusBadge type="commande" statut={commande.statut} size="md" />}
      description={`${commande.fournisseur_nom ?? 'Fournisseur non renseigné'} · commandée le ${formatDate(commande.date_commande)}`}
      actions={actions}
      primaryAction={primaryAction}
      moreActions={[
        {
          label: 'Télécharger le bon de commande',
          icon: Download,
          disabled: downloadingPdf,
          onSelect: () => void downloadBonCommande(),
        },
        canWrite &&
          CANCELLABLE.includes(commande.statut) && {
            label: 'Annuler la commande',
            icon: XCircle,
            destructive: true,
            disabled: busy,
            onSelect: () => void updateStatut('annulee'),
          },
      ]}
    >
      {/* Une rangée de quatre étapes : pas de titre de carte, la liste
          s'annonce « Étapes de la commande ». */}
      <Card>
        <CardContent inset="standalone">
          <CommandeSteps statut={commande.statut} />
        </CardContent>
      </Card>

      {/* Une seule carte : le nom du fournisseur, le numéro, la date de
          commande et le total sont déjà dans l'en-tête et sous les produits. */}
      <Card>
        <CardHeader>
          <CardTitle>{hasContact ? 'Fournisseur et livraison' : 'Livraison'}</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValueList columns={3}>
            {commande.fournisseur_telephone && <KeyValue label="Téléphone">{commande.fournisseur_telephone}</KeyValue>}
            {commande.fournisseur_email && <KeyValue label="Adresse e-mail">{commande.fournisseur_email}</KeyValue>}
            <KeyValue label="Livraison prévue">
              {commande.date_livraison_prevue ? (
                <span className="inline-flex flex-wrap items-center gap-x-2">
                  {formatDate(commande.date_livraison_prevue)}
                  {late && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-danger-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      En retard
                    </span>
                  )}
                </span>
              ) : (
                '—'
              )}
            </KeyValue>
            {commande.date_livraison_reelle && (
              <KeyValue label="Livraison effective">{formatDate(commande.date_livraison_reelle)}</KeyValue>
            )}
          </KeyValueList>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produits commandés</CardTitle>
          <CardDescription>
            {commande.lignes.length > 1
              ? `${formatNumber(commande.lignes.length)} produits différents`
              : `${formatNumber(commande.lignes.length)} produit`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commande.lignes.length === 0 ? (
            <EmptyState compact icon={ShoppingCart} title="Aucun produit sur cette commande" />
          ) : (
            <ResponsiveTable
              table={
                <Table aria-label="Produits de la commande">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Référence</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead numeric>Quantité</TableHead>
                      <TableHead numeric>Prix unitaire</TableHead>
                      <TableHead numeric>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commande.lignes.map((ligne) => (
                      <TableRow key={ligne.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {ligne.produit_reference ? <DocumentCode>{ligne.produit_reference}</DocumentCode> : '—'}
                        </TableCell>
                        <TableCell>{ligne.produit_nom ?? 'Produit supprimé'}</TableCell>
                        <TableCell numeric>{formatNumber(toNumber(ligne.quantite) ?? 0)}</TableCell>
                        <TableCell numeric>
                          <Money value={ligne.prix_unitaire} />
                        </TableCell>
                        <TableCell numeric>
                          <Money value={ligne.total_ligne} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={commande.lignes.map((ligne) => (
                <DataCard key={ligne.id} title={ligne.produit_nom ?? 'Produit supprimé'}>
                  <DataCardRow
                    label="Référence"
                    value={ligne.produit_reference ? <DocumentCode>{ligne.produit_reference}</DocumentCode> : '—'}
                  />
                  <DataCardRow label="Quantité" value={formatNumber(toNumber(ligne.quantite) ?? 0)} numeric />
                  <DataCardRow label="Prix unitaire" value={<Money value={ligne.prix_unitaire} />} numeric />
                  <DataCardRow label="Total" value={<Money value={ligne.total_ligne} />} numeric />
                </DataCard>
              ))}
            />
          )}
          <DocumentTotals total={{ label: 'Total', value: total }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contrôle commande, réception, facture</CardTitle>
          <CardDescription>Quantités et prix commandés, reçus et facturés, par produit</CardDescription>
        </CardHeader>
        <CardContent>
          {matchLoading ? (
            <div aria-busy="true">
              <TableSkeleton rows={3} columns={7} />
            </div>
          ) : matchError ? (
            <QueryErrorState
              error={matchError}
              title="Impossible de charger le contrôle de la commande"
              onRetry={() => void loadMatch()}
            />
          ) : !match || match.lignes.length === 0 ? (
            <EmptyState
              compact
              icon={PackageCheck}
              title="Rien à contrôler pour l’instant"
              description="Le contrôle apparaît dès qu’un produit est commandé"
            />
          ) : (
            <div className="space-y-4">
              {violations.length > 0 ? (
                <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
                  <p className="flex items-center gap-2 font-medium">
                    <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {match.config?.bloquer
                      ? 'Écarts détectés : la facture fournisseur de cette commande est bloquée'
                      : 'Écarts détectés : vérifiez-les avant de payer la facture fournisseur'}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-9">
                    {violations.map((v, i) => (
                      <li key={`${v.produit_id}-${i}`}>
                        {v.produit_nom ?? 'Produit supprimé'} — {v.reasons.join(' ; ')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <MatchSummary match={match} />
              )}
              <ResponsiveTable
                table={
                  <Table aria-label="Contrôle par produit">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead numeric>Commandé</TableHead>
                        <TableHead numeric>Reçu</TableHead>
                        <TableHead numeric>Facturé</TableHead>
                        <TableHead numeric>Prix commandé</TableHead>
                        <TableHead numeric>Prix facturé</TableHead>
                        <TableHead>État</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {match.lignes.map((l) => (
                        <TableRow key={l.produit_id}>
                          <TableCell>
                            {l.produit_nom ?? 'Produit supprimé'}
                            {l.reference && (
                              <DocumentCode className="block text-xs text-muted-foreground">{l.reference}</DocumentCode>
                            )}
                          </TableCell>
                          <TableCell numeric>{formatNumber(l.qte_commandee)}</TableCell>
                          <TableCell numeric>{formatNumber(l.qte_recue)}</TableCell>
                          <TableCell numeric>{formatNumber(l.qte_facturee)}</TableCell>
                          <TableCell numeric>
                            <Money value={l.prix_commande} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={l.prix_facture} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <MatchState ligne={l} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
                cards={match.lignes.map((l) => (
                  <DataCard key={l.produit_id} title={l.produit_nom ?? 'Produit supprimé'} badge={<MatchState ligne={l} />}>
                    <DataCardRow label="Commandé" value={formatNumber(l.qte_commandee)} numeric />
                    <DataCardRow label="Reçu" value={formatNumber(l.qte_recue)} numeric />
                    <DataCardRow label="Facturé" value={formatNumber(l.qte_facturee)} numeric />
                    <DataCardRow label="Prix commandé" value={<Money value={l.prix_commande} />} numeric />
                    <DataCardRow label="Prix facturé" value={<Money value={l.prix_facture} />} numeric />
                  </DataCard>
                ))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {commande.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-prose whitespace-pre-wrap text-sm">{commande.notes}</p>
          </CardContent>
        </Card>
      )}

      <AttachmentPanel entityType="commande" entityId={commande.id} />
    </PageShell>
  );
}
