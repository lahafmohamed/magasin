import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardList, PackageCheck, Pencil, Send, Truck, XCircle } from 'lucide-react';
import { demandeService } from '@/services/api';
import { useAuth } from '@/lib/AuthContext';
import { usePermission, Permissions } from '@/hooks/usePermission';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentCode } from '@/components/ui/document-code';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState } from '@/components/ui/query-state';
import { Spinner } from '@/components/ui/loading';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge, { getStatusDescription, getStatusLabel } from '@/components/StatusBadge';
import { DemandeDecisionDialog, type DecisionPayload } from '@/components/DemandeDecisionDialog';
import { DemandeClotureDialog } from '@/components/DemandeClotureDialog';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { formatDateTime, formatNumber } from '@/utils/format';

interface Ligne {
  id: number;
  produit_id: number;
  produit_nom: string;
  reference: string | null;
  quantite_demandee: number;
  quantite_approuvee: number | null;
  quantite_livree: number | null;
  notes: string | null;
}

interface HistoriqueEntry {
  id: number;
  from_statut: string | null;
  to_statut: string;
  timestamp: string;
  username: string | null;
  nom_complet: string | null;
}

interface DemandeData {
  id: number;
  numero: string;
  statut: string;
  magasin_id: number;
  magasin_nom: string;
  magasin_code: string;
  depot_id: number;
  depot_nom: string;
  depot_code: string;
  created_by_user_id: number;
  created_by_nom: string | null;
  decided_by_nom: string | null;
  executed_by_nom: string | null;
  closed_by_nom: string | null;
  date_creation: string;
  date_envoi: string | null;
  date_decision: string | null;
  date_execution: string | null;
  date_livraison: string | null;
  date_cloture: string | null;
  motif: string | null;
  raison_refus: string | null;
  numero_transfer: string | null;
  transfert_id: number | null;
  lignes: Ligne[];
  historique: HistoriqueEntry[];
}

type Action = 'send' | 'decide' | 'execute' | 'close' | 'cancel';

/** Une annulation est enregistrée comme un refus annoté par le serveur (DemandeService.cancel). */
const CANCEL_MARK = '[Annulée par le magasin]';

const isNotFound = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status === 404;

const qty = (n: number | null | undefined) =>
  n == null ? (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">Non renseigné</span>
    </>
  ) : (
    formatNumber(n)
  );

/** Écart d'approbation dit en mots, pas par la seule couleur (VB-DMD-02). */
function ApprovalBadge({ ligne }: { ligne: Ligne }) {
  if (ligne.quantite_approuvee == null) return null;
  if (ligne.quantite_approuvee === 0) return <Badge variant="destructive">Refusé</Badge>;
  if (ligne.quantite_approuvee < ligne.quantite_demandee) {
    return <Badge variant="warning">Partiel</Badge>;
  }
  return null;
}

/**
 * Une étape de l'historique dit le nouvel état seulement (« Livrée »,
 * « Clôturée ») : « Livrée → Clôturée » répétait l'état de la ligne d'en dessous.
 */
function historyLabel(entry: HistoriqueEntry): string {
  const to = getStatusLabel('demande', entry.to_statut);
  if (entry.from_statut) return to;
  return entry.to_statut === 'brouillon' ? 'Créée en brouillon' : `Créée · ${to}`;
}

/**
 * Étapes que l'historique raconte déjà (qui, quand). La création est la ligne
 * sans état de départ ; les autres se reconnaissent à leur nouvel état.
 */
function loggedSteps(historique: HistoriqueEntry[]) {
  const steps = new Set(historique.map((h) => (h.from_statut ? h.to_statut : 'creation')));
  const any = (...statuts: string[]) => statuts.some((s) => steps.has(s));
  return {
    creation: steps.has('creation'),
    envoi: steps.has('envoyee'),
    decision: any('approuvee', 'partiellement_approuvee', 'refusee'),
    execution: any('en_cours', 'livree'),
    cloture: steps.has('cloturee'),
  };
}

export default function DemandeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const canOpen = useRouteAccess();
  const { user } = useAuth();
  const { hasPermission, userRole } = usePermission();
  const [searchParams] = useSearchParams();
  const patchParams = useSearchParamsPatch();

  const [demande, setDemande] = useState<DemandeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState<Action | null>(null);
  const [showDecisionDialog, setShowDecisionDialog] = useState(false);
  const [showClotureDialog, setShowClotureDialog] = useState(false);

  const loadDemande = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDemande((await demandeService.getById(Number(id))) as DemandeData);
    } catch (err) {
      setDemande(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDemande();
  }, [loadDemande]);

  // Actions permises : permission du rôle ET statut (D2 : le gérant agit comme l'administrateur).
  const supervisor = userRole === 'admin' || userRole === 'manager';
  const ownsDemande = !!demande && !!user && demande.created_by_user_id === user.id;
  const statut = demande?.statut;
  const canEdit = hasPermission(Permissions.DEMANDE_UPDATE) && statut === 'brouillon' && (supervisor || ownsDemande);
  const canSend = hasPermission(Permissions.DEMANDE_SEND) && statut === 'brouillon' && (supervisor || ownsDemande);
  const canDecide = hasPermission(Permissions.DEMANDE_DECIDE) && statut === 'envoyee';
  const canExecute =
    hasPermission(Permissions.DEMANDE_EXECUTE) && (statut === 'approuvee' || statut === 'partiellement_approuvee');
  const canClose = hasPermission(Permissions.DEMANDE_CLOSE) && statut === 'livree';
  const canCancel =
    hasPermission(Permissions.DEMANDE_CANCEL) &&
    (statut === 'brouillon' || statut === 'envoyee') &&
    (supervisor || ownsDemande);

  // Liens « Décider » / « Clôturer » de la liste : ouvrent directement le dialogue.
  useEffect(() => {
    const action = searchParams.get('action');
    if (!demande || !action) return;
    if (action === 'decider' && canDecide) setShowDecisionDialog(true);
    if (action === 'cloturer' && canClose) setShowClotureDialog(true);
    patchParams({ action: null });
  }, [demande, searchParams, patchParams, canDecide, canClose]);

  const run = async (action: Action, work: () => Promise<string>, fallback: string) => {
    setActionLoading(action);
    try {
      toast.success(await work());
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, fallback));
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <PageShell title="Demande" backTo="/demandes" width="wide">
        <Card>
          <CardContent inset="standalone">
            <CardSkeleton lines={6} />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (error || !demande) {
    if (isNotFound(error) || (!error && !demande)) {
      return (
        <PageShell title="Demande introuvable" backTo="/demandes" width="wide">
          <Card>
            <EmptyState
              icon={ClipboardList}
              title="Demande introuvable"
              description="Cette demande n’existe pas ou a été supprimée"
              action={
                <Link to="/demandes" className={buttonVariants({ variant: 'outline', size: 'touch' })}>
                  Retour aux demandes
                </Link>
              }
            />
          </Card>
        </PageShell>
      );
    }
    return (
      <PageShell title="Demande" backTo="/demandes" width="wide">
        <Card>
          <QueryErrorState error={error} title="Impossible de charger la demande" onRetry={() => void loadDemande()} />
        </Card>
      </PageShell>
    );
  }

  const handleSend = () =>
    void run(
      'send',
      async () => {
        await demandeService.send(demande.id);
        await loadDemande();
        return `Demande ${demande.numero} envoyée au dépôt`;
      },
      'Impossible d’envoyer la demande. Réessayez.'
    );

  const handleDecide = async (payload: DecisionPayload) => {
    const ok = await run(
      'decide',
      async () => {
        await demandeService.decide(demande.id, payload);
        await loadDemande();
        if (payload.decision === 'refusee') return `Demande ${demande.numero} refusée`;
        const approved = (payload.lignes_decision ?? []).reduce((s, l) => s + l.quantite_approuvee, 0);
        if (approved === 0) return `Demande ${demande.numero} refusée`;
        const full = demande.lignes.every(
          (l) => payload.lignes_decision?.find((d) => d.ligne_id === l.id)?.quantite_approuvee === l.quantite_demandee
        );
        return full ? `Demande ${demande.numero} approuvée` : `Demande ${demande.numero} approuvée partiellement`;
      },
      'Impossible d’enregistrer la décision. Réessayez.'
    );
    if (ok) setShowDecisionDialog(false);
  };

  const handleExecute = async () => {
    const confirmed = await confirm({
      title: `Exécuter le transfert de la demande ${demande.numero} ?`,
      description: `Les quantités approuvées quitteront le stock de ${demande.depot_nom} pour ${demande.magasin_nom}. Le magasin devra ensuite confirmer la réception.`,
      confirmLabel: 'Exécuter le transfert',
    });
    if (!confirmed) return;
    await run(
      'execute',
      async () => {
        const result = (await demandeService.execute(demande.id)) as { numero_transfer?: string } | null;
        await loadDemande();
        return result?.numero_transfer
          ? `Transfert ${result.numero_transfer} exécuté : le stock est arrivé à ${demande.magasin_nom}`
          : `Transfert exécuté : le stock est arrivé à ${demande.magasin_nom}`;
      },
      'Impossible d’exécuter le transfert. Réessayez.'
    );
  };

  const handleClose = async () => {
    const ok = await run(
      'close',
      async () => {
        await demandeService.close(demande.id);
        await loadDemande();
        return `Demande ${demande.numero} clôturée`;
      },
      'Impossible de clôturer la demande. Réessayez.'
    );
    if (ok) setShowClotureDialog(false);
  };

  const handleCancel = async () => {
    const confirmed = await confirm({
      title: `Annuler la demande ${demande.numero} ?`,
      description: 'Le dépôt ne la traitera pas.',
      confirmLabel: 'Annuler la demande',
      cancelLabel: 'Garder la demande',
      destructive: true,
    });
    if (!confirmed) return;
    const ok = await run(
      'cancel',
      async () => {
        await demandeService.cancel(demande.id);
        return `Demande ${demande.numero} annulée`;
      },
      'Impossible d’annuler la demande. Réessayez.'
    );
    if (ok) navigate('/demandes');
  };

  // Une seule action principale : l'étape suivante qui revient à cet utilisateur (VB-DMD-01).
  const busy = actionLoading !== null;
  const primaryAction = canSend ? (
    <Button size="touch" className="gap-2" onClick={handleSend} disabled={busy}>
      {actionLoading === 'send' ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />}
      Envoyer au dépôt
    </Button>
  ) : canDecide ? (
    <Button size="touch" className="gap-2" onClick={() => setShowDecisionDialog(true)} disabled={busy}>
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      Prendre une décision
    </Button>
  ) : canExecute ? (
    <Button size="touch" className="gap-2" onClick={() => void handleExecute()} disabled={busy}>
      {actionLoading === 'execute' ? <Spinner /> : <Truck className="h-4 w-4" aria-hidden="true" />}
      Exécuter le transfert
    </Button>
  ) : canClose ? (
    <Button size="touch" className="gap-2" onClick={() => setShowClotureDialog(true)} disabled={busy}>
      <PackageCheck className="h-4 w-4" aria-hidden="true" />
      Clôturer la demande
    </Button>
  ) : undefined;

  const cancelled = !!demande.raison_refus && demande.raison_refus.includes(CANCEL_MARK);
  const refusalText = demande.raison_refus?.replace(CANCEL_MARK, '').trim();
  const transferLink =
    demande.transfert_id && canOpen('/stock-transfers') ? `/stock-transfers?transfert=${demande.transfert_id}` : null;
  const statusDescription = cancelled
    ? 'La demande a été annulée avant d’être traitée par le dépôt'
    : getStatusDescription('demande', demande.statut);
  const logged = loggedSteps(demande.historique);

  return (
    <PageShell
      title={`Demande ${demande.numero}`}
      backTo="/demandes"
      width="wide"
      description={statusDescription}
      meta={<StatusBadge type="demande" statut={demande.statut} size="md" />}
      actions={
        canEdit ? (
          <Link
            to={`/demandes/${demande.id}/edit`}
            className={cn(buttonVariants({ variant: 'outline', size: 'touch' }), 'gap-2')}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Modifier la demande
          </Link>
        ) : undefined
      }
      primaryAction={primaryAction}
      moreActions={[
        canCancel && {
          label: 'Annuler la demande',
          icon: XCircle,
          destructive: true,
          disabled: busy,
          onSelect: () => void handleCancel(),
        },
      ]}
    >
      {/* Trois cartes enfants directs de la grille : sur téléphone on lit les
          produits, puis le magasin et le dépôt, puis l'historique (les
          informations venaient après tout l'historique) ; sur grand écran les
          informations restent dans la colonne de droite. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Produits demandés</CardTitle>
          </CardHeader>
          <CardContent inset="flush">
            <ResponsiveTable
              className="px-4 pb-4 md:px-0 md:pb-0"
              table={
                <Table aria-label={`Produits de la demande ${demande.numero}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead numeric>Demandée</TableHead>
                      <TableHead numeric>Approuvée</TableHead>
                      <TableHead numeric>Livrée</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demande.lignes.map((ligne) => (
                      <TableRow key={ligne.id}>
                        <TableCell>
                          <span className="block font-medium">{ligne.produit_nom}</span>
                          {ligne.reference && (
                            <DocumentCode className="block text-xs text-muted-foreground">{ligne.reference}</DocumentCode>
                          )}
                          {ligne.notes && <span className="mt-1 block text-xs text-muted-foreground">{ligne.notes}</span>}
                        </TableCell>
                        <TableCell numeric>{formatNumber(ligne.quantite_demandee)}</TableCell>
                        <TableCell numeric>
                          <span className="inline-flex items-center justify-end gap-2">
                            <ApprovalBadge ligne={ligne} />
                            {qty(ligne.quantite_approuvee)}
                          </span>
                        </TableCell>
                        <TableCell numeric>{qty(ligne.quantite_livree)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={demande.lignes.map((ligne) => (
                <DataCard key={ligne.id} title={ligne.produit_nom} badge={<ApprovalBadge ligne={ligne} />}>
                  {ligne.reference && (
                    <DataCardRow label="Référence" value={<DocumentCode>{ligne.reference}</DocumentCode>} />
                  )}
                  <DataCardRow label="Demandée" value={formatNumber(ligne.quantite_demandee)} numeric />
                  <DataCardRow label="Approuvée" value={qty(ligne.quantite_approuvee)} numeric />
                  <DataCardRow label="Livrée" value={qty(ligne.quantite_livree)} numeric />
                  {ligne.notes && <DataCardRow label="Note" value={ligne.notes} />}
                </DataCard>
              ))}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-start">
          <CardHeader className="pb-3">
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Qui a créé, envoyé, décidé, exécuté et clôturé, et quand : c'est
                l'historique. Une étape n'est reprise ici que si l'historique ne
                la montre pas (demande antérieure à son enregistrement). */}
            <KeyValueList columns={1}>
              <KeyValue label="Magasin demandeur">{demande.magasin_nom}</KeyValue>
              <KeyValue label="Dépôt">{demande.depot_nom}</KeyValue>
              {!logged.creation && (
                <KeyValue label="Créée par">
                  {demande.created_by_nom || '—'}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatDateTime(demande.date_creation)}
                  </span>
                </KeyValue>
              )}
              {!logged.envoi && demande.date_envoi && (
                <KeyValue label="Envoyée le">{formatDateTime(demande.date_envoi)}</KeyValue>
              )}
              {!logged.decision && demande.decided_by_nom && !cancelled && (
                <KeyValue label="Décision par">
                  {demande.decided_by_nom}
                  {demande.date_decision && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatDateTime(demande.date_decision)}
                    </span>
                  )}
                </KeyValue>
              )}
              {!logged.execution && demande.executed_by_nom && (
                <KeyValue label="Transfert exécuté par">
                  {demande.executed_by_nom}
                  {demande.date_execution && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatDateTime(demande.date_execution)}
                    </span>
                  )}
                </KeyValue>
              )}
              {demande.numero_transfer && (
                <KeyValue label="Transfert">
                  {transferLink ? (
                    <Link to={transferLink} className="text-primary underline-offset-4 hover:underline">
                      <DocumentCode>{demande.numero_transfer}</DocumentCode>
                    </Link>
                  ) : (
                    <DocumentCode>{demande.numero_transfer}</DocumentCode>
                  )}
                </KeyValue>
              )}
              {!logged.cloture && demande.closed_by_nom && (
                <KeyValue label="Clôturée par">
                  {demande.closed_by_nom}
                  {demande.date_cloture && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatDateTime(demande.date_cloture)}
                    </span>
                  )}
                </KeyValue>
              )}
              {demande.motif && <KeyValue label="Notes pour le dépôt">{demande.motif}</KeyValue>}
            </KeyValueList>

            {demande.statut === 'refusee' && refusalText && !cancelled && (
              <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
                <p className="font-medium">Motif du refus</p>
                <p className="mt-0.5">{refusalText}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Historique</CardTitle>
          </CardHeader>
          <CardContent>
            {demande.historique.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun changement de statut enregistré</p>
            ) : (
              // L'API liste du plus récent au plus ancien : le premier point,
              // plein, est l'état actuel ; les étapes passées sont estompées.
              <ol className="space-y-3">
                {demande.historique.map((entry, i) => (
                  <li key={entry.id} className="relative border-l pl-4">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -left-1 top-1.5 h-2 w-2 rounded-full',
                        i === 0 ? 'bg-foreground' : 'bg-muted-foreground'
                      )}
                    />
                    <p className="text-sm font-medium">{historyLabel(entry)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Par {entry.nom_complet || entry.username || 'le système'} · {formatDateTime(entry.timestamp)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {showDecisionDialog && (
        <DemandeDecisionDialog
          demande={demande}
          onClose={() => setShowDecisionDialog(false)}
          onSubmit={(payload) => void handleDecide(payload)}
          loading={actionLoading === 'decide'}
        />
      )}

      {showClotureDialog && (
        <DemandeClotureDialog
          demande={demande}
          onClose={() => setShowClotureDialog(false)}
          onSubmit={() => void handleClose()}
          loading={actionLoading === 'close'}
        />
      )}
    </PageShell>
  );
}
