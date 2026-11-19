import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeftRight, Download, FileText, Printer, ShoppingCart, Wallet } from 'lucide-react';
import {
  acompteService,
  caisseService,
  factureService,
  paiementService,
  tiersService,
  type PaiementResult,
} from '../services/api';
import type { FactureComplete, FactureLigne, Paiement } from '../types';
import { PaymentStatusBar } from '../components/PaymentStatusBar';
import { PaymentHistory } from '../components/PaymentHistory';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { PaymentModal, type CashTillState, type PaymentModalSubmit } from '../components/PaymentModal';
import StatusBadge from '@/components/StatusBadge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { PageShell } from '@/components/ui/page-shell';
import type { PageHeaderMenuAction } from '@/components/ui/page-header';
import { QueryErrorState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DocumentTotals } from '@/components/ui/document-totals';
import { DocumentCode } from '@/components/ui/document-code';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { Money } from '@/components/ui/money';
import { Tag } from '@/components/ui/tag';
import { DocumentPrint } from '@/components/ui/print-layout';
import { useVenteParDefaut } from '@/hooks/useVenteParDefaut';
import { printTicket } from '@/utils/ticket';
import { PrintPreview, usePrintFormat } from '@/components/ui/print-preview';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DocumentLifecycle } from '@/components/ui/document-lifecycle';
import { PageLoading, Spinner } from '@/components/ui/loading';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { getErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate, formatNumber, formatPercent, toNumber } from '@/utils/format';
import { formatPaymentMethod, paymentMethodHue } from '@/utils/paymentMethod';

interface LigneFacture extends FactureLigne {
  /** Coût d'achat unitaire figé à la vente (analyse de rentabilité, gérants). */
  prix_achat_unitaire?: number | string | null;
  /** Produit vendu depuis le stock du dépôt (plus de stock en magasin aujourd'hui). */
  is_depot_only_history?: boolean;
}

type FactureDetailData = Omit<FactureComplete, 'lignes'> & {
  lignes?: LigneFacture[];
  date_echeance?: string | null;
  location_id?: number | null;
};

interface AcompteDisponible {
  id: number;
  montant: number | string;
  montant_restant?: number | string | null;
  date_acompte?: string | null;
  methode_paiement?: string | null;
}

interface TiersSoldes {
  est_fournisseur?: boolean;
  solde_fournisseur_live?: number | string | null;
  solde_fournisseur?: number | string | null;
}

interface MagasinCaisse {
  id: number;
  location_id?: number | null;
}

/** Rôles que l'API laisse encaisser (`POST /factures/:id/paiements`). */
const PAY_ROLES = ['admin', 'manager', 'magasin_staff', 'caissier'];
/** Rôles qui annulent une facture ou compensent (`PUT /factures/:id/statut`, `POST /tiers/:id/compensation`). */
const MANAGER_ROLES = ['admin', 'manager'];

/** Séparateur de la ligne d'en-tête : l'insécable garde « · » avec ce qui le précède, la ligne ne coupe qu'après. */
const SEP = '\u00A0· ';
/** Lien dans la ligne d'en-tête : souligné en permanence, le bleu seul se distingue mal du gris qui l'entoure (1,6:1). */
const HEADER_LINK_CLASS =
  'rounded-sm text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const restantAcompte = (a: AcompteDisponible) => toNumber(a.montant_restant) ?? toNumber(a.montant) ?? 0;
const quantiteOf = (ligne: LigneFacture) => toNumber(ligne.quantite) ?? 0;

export default function FactureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canOpen = useRouteAccess();
  const venteParDefaut = useVenteParDefaut();
  const role = user?.role ?? '';
  const isManager = MANAGER_ROLES.includes(role);
  const isAdmin = role === 'admin';
  const canPay = PAY_ROLES.includes(role);

  const [facture, setFacture] = useState<FactureDetailData | null>(null);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [cashTill, setCashTill] = useState<CashTillState>('unknown');
  const [showPrintLayout, setShowPrintLayout] = useState(false);
  const [printFormat, setPrintFormat] = usePrintFormat();

  const [acomptesDispo, setAcomptesDispo] = useState<AcompteDisponible[]>([]);
  const [soldeFourn, setSoldeFourn] = useState(0);

  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [compensationMontant, setCompensationMontant] = useState('');
  const [compensationError, setCompensationError] = useState<string | null>(null);
  const [compensationLoading, setCompensationLoading] = useState(false);

  const [acompteToApply, setAcompteToApply] = useState<AcompteDisponible | null>(null);
  const [applyMontant, setApplyMontant] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);

  const [cancelling, setCancelling] = useState(false);
  const autoOpened = useRef(false);

  /** Acomptes du client (tous rôles) et, pour les gérants, sa dette fournisseur (compensation). */
  const loadClientExtras = useCallback(
    async (clientId: number) => {
      const [acomptes, tiers] = await Promise.allSettled([
        acompteService.listForClient(clientId),
        isManager ? tiersService.getById(clientId) : Promise.resolve(null),
      ]);
      if (acomptes.status === 'fulfilled') {
        setAcomptesDispo(Array.isArray(acomptes.value) ? (acomptes.value as AcompteDisponible[]) : []);
      } else {
        setAcomptesDispo([]);
        toast.error(getErrorMessage(acomptes.reason, 'Impossible de charger les acomptes du client.'));
      }
      if (tiers.status === 'fulfilled') {
        const t = tiers.value as TiersSoldes | null;
        const fourn = t?.est_fournisseur
          ? toNumber(t.solde_fournisseur_live) ?? toNumber(t.solde_fournisseur) ?? 0
          : 0;
        setSoldeFourn(fourn > 0 ? fourn : 0);
      } else {
        setSoldeFourn(0);
        toast.error(getErrorMessage(tiers.reason, 'Impossible de charger le solde fournisseur du client.'));
      }
    },
    [isManager]
  );

  const loadFacture = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = (await factureService.getById(Number(id))) as FactureDetailData | null;
      setFacture(data ?? null);
      setPaiements(data?.paiements ?? []);
      const clientId = data?.tiers_id ?? data?.client_id;
      if (clientId) void loadClientExtras(clientId);
    } catch (err) {
      setFacture(null);
      setPaiements([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, loadClientExtras]);

  useEffect(() => {
    void loadFacture();
  }, [loadFacture]);

  const total = toNumber(facture?.total) ?? 0;
  const sousTotal = toNumber(facture?.sous_total) ?? total;
  const montantPaye = toNumber(facture?.montant_paye) ?? 0;
  const remainingDue = facture ? Math.max(0, toNumber(facture.remaining_due) ?? total - montantPaye) : 0;
  const lignes: LigneFacture[] = facture?.lignes ?? [];
  const isCancelled = facture?.statut === 'annulee';
  const isOpenForPayment = !!facture && !isCancelled && facture.statut !== 'payee' && remainingDue > 0;
  const acomptesTotal = acomptesDispo.reduce((sum, a) => sum + restantAcompte(a), 0);

  // U-15 : la facture vient d'être créée au comptoir → la saisie du paiement
  // s'ouvre d'elle-même. L'état de navigation est effacé aussitôt, pour qu'un
  // rafraîchissement ou un retour arrière ne la rouvre pas.
  useEffect(() => {
    const state = location.state as { justCreated?: boolean } | null;
    if (!state?.justCreated || !facture || autoOpened.current) return;
    autoOpened.current = true;
    navigate(location.pathname, { replace: true, state: null });
    if (isOpenForPayment && canPay) setShowPaymentModal(true);
  }, [location.state, location.pathname, facture, isOpenForPayment, canPay, navigate]);

  // U-23 : la caisse du magasin de la facture est-elle ouverte ? Vérifié à
  // l'ouverture de la saisie, pour prévenir avant l'envoi plutôt qu'après.
  useEffect(() => {
    if (!showPaymentModal) return;
    const locationId = facture?.location_id;
    setCashTill('unknown');
    if (!locationId) return;
    let cancelled = false;
    (async () => {
      try {
        const magasins = (await caisseService.getMagasins()) as MagasinCaisse[];
        const magasin = magasins.find((m) => Number(m.location_id) === Number(locationId));
        if (!magasin) return; // magasin non affecté : le serveur tranchera
        const session = await caisseService.getSessionActive(magasin.id);
        if (!cancelled) setCashTill(session ? 'open' : 'closed');
      } catch {
        if (!cancelled) setCashTill('unknown');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPaymentModal, facture?.location_id]);

  const downloadRecu = async (paiementId: number) => {
    try {
      await paiementService.downloadRecu(paiementId);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de générer le reçu. Réessayez.'));
    }
  };

  /** D3 : le paiement enregistre exactement le montant saisi ; le toast reprend la phrase du serveur. */
  const handleAddPayment = async (paiement: PaymentModalSubmit) => {
    if (!facture) return;
    const result: PaiementResult = await paiementService.create(facture.id, paiement);
    const message = result.idempotent
      ? 'Ce paiement était déjà enregistré : rien n’a été encaissé deux fois.'
      : result.message ||
        `Paiement de ${formatCurrency(result.montant_recu ?? paiement.montant)} enregistré. ${
          (toNumber(result.reste_du) ?? 0) > 0
            ? `Reste dû : ${formatCurrency(result.reste_du)}.`
            : 'Facture soldée.'
        }`;
    const recuId = result.direct_paiement_id;
    toast.success(message, recuId ? { action: { label: 'Imprimer le reçu', onClick: () => void downloadRecu(recuId) } } : undefined);
    await loadFacture();
  };

  const handleDeletePayment = async (paiement: Paiement) => {
    if (!facture) return;
    const ok = await confirm({
      title: `Supprimer ce paiement de ${formatCurrency(paiement.montant)} ?`,
      description: `Le montant redeviendra dû sur la facture ${facture.numero_facture}. S’il a été encaissé en caisse, une sortie du même montant sera enregistrée dans la session ouverte.`,
      confirmLabel: 'Supprimer le paiement',
      destructive: true,
    });
    if (!ok) return;
    try {
      await paiementService.delete(paiement.id);
      toast.success(`Paiement de ${formatCurrency(paiement.montant)} supprimé`);
      await loadFacture();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer le paiement. Réessayez.'));
    }
  };

  const maxCompensable = Math.min(remainingDue, soldeFourn);

  const openCompensation = () => {
    setCompensationMontant(String(Math.floor(maxCompensable)));
    setCompensationError(null);
    setShowCompensationModal(true);
  };

  const handleCompensation = async () => {
    if (!facture) return;
    const tiersId = facture.tiers_id ?? facture.client_id;
    const montant = Number(compensationMontant);
    if (!compensationMontant || !Number.isFinite(montant) || montant <= 0) {
      setCompensationError('Saisissez un montant supérieur à 0 FCFA.');
      return;
    }
    if (montant > maxCompensable + 0.005) {
      setCompensationError(`Le montant dépasse le maximum compensable (${formatCurrency(maxCompensable)}).`);
      return;
    }
    if (!tiersId) return;
    setCompensationLoading(true);
    try {
      await tiersService.createCompensation(tiersId, {
        date_compensation: new Date().toISOString().split('T')[0],
        montant,
        notes: `Compensation sur facture ${facture.numero_facture}`,
      });
      toast.success(`Compensation de ${formatCurrency(montant)} enregistrée sur la facture ${facture.numero_facture}`);
      setShowCompensationModal(false);
      await loadFacture();
    } catch (e) {
      setCompensationError(getErrorMessage(e, 'Impossible d’enregistrer la compensation. Réessayez.'));
    } finally {
      setCompensationLoading(false);
    }
  };

  const acompteMaxApply = acompteToApply ? Math.min(restantAcompte(acompteToApply), remainingDue) : 0;

  const openApplyAcompte = (acompte: AcompteDisponible) => {
    setAcompteToApply(acompte);
    setApplyMontant(String(Math.floor(Math.min(restantAcompte(acompte), remainingDue))));
    setApplyError(null);
  };

  const handleApplyAcompte = async () => {
    if (!facture || !acompteToApply) return;
    const montant = Number(applyMontant);
    if (!applyMontant || !Number.isFinite(montant) || montant <= 0 || montant > acompteMaxApply + 0.005) {
      setApplyError(`Saisissez un montant entre 1 et ${formatCurrency(acompteMaxApply)}.`);
      return;
    }
    setApplyLoading(true);
    try {
      await acompteService.apply(acompteToApply.id, {
        facture_id: facture.id,
        montant,
        idempotency_key: `apply-${acompteToApply.id}-${facture.id}-${Date.now()}`,
      });
      toast.success(`Acompte de ${formatCurrency(montant)} appliqué à la facture ${facture.numero_facture}`);
      setAcompteToApply(null);
      await loadFacture();
    } catch (e) {
      setApplyError(getErrorMessage(e, 'Impossible d’appliquer l’acompte. Réessayez.'));
    } finally {
      setApplyLoading(false);
    }
  };

  /** U-24 : annuler une facture sans paiement (gérant, administrateur). */
  const handleCancelFacture = async () => {
    if (!facture) return;
    const ok = await confirm({
      title: `Annuler la facture ${facture.numero_facture} ?`,
      description: `Le client ne devra plus les ${formatCurrency(total)} de cette facture : ses écritures comptables sont contre-passées et ses articles reviennent en stock. Si le client a emporté la marchandise, enregistrez plutôt un retour client.`,
      confirmLabel: 'Annuler la facture',
      cancelLabel: 'Garder la facture',
      destructive: true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const result = await factureService.updateStatut(facture.id, 'annulee');
      toast.success(result?.message ?? `Facture ${facture.numero_facture} annulée`);
      await loadFacture();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’annuler la facture. Réessayez.'));
    } finally {
      setCancelling(false);
    }
  };

  // ── États de chargement : chaque branche garde le cadre de page ──
  if (loading && !facture) {
    return (
      <PageShell title="Facture" backTo="/factures" width="wide">
        <PageLoading message="Chargement de la facture…" />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Facture" backTo="/factures" width="wide">
        <Card>
          <QueryErrorState error={error} title="Impossible de charger la facture" onRetry={() => void loadFacture()} />
        </Card>
      </PageShell>
    );
  }

  if (!facture) {
    return (
      <PageShell title="Facture introuvable" backTo="/factures" width="wide">
        <Card>
          <EmptyState
            icon={FileText}
            title="Facture introuvable"
            description="Elle a peut-être été supprimée"
            action={
              <Link to="/factures" className={buttonVariants({ variant: 'outline' })}>
                Retour aux factures
              </Link>
            }
          />
        </Card>
      </PageShell>
    );
  }

  const clientId = facture.tiers_id ?? facture.client_id;
  const clientNom = `${facture.client_nom ?? ''} ${facture.client_prenom ?? ''}`.trim() || '—';
  // Client, date et échéance tiennent sur la ligne d'en-tête : plus de carte
  // « Informations » qui la répétait.
  const headerLine = (
    <>
      {clientId && canOpen(`/tiers/${clientId}`) ? (
        <Link to={`/tiers/${clientId}`} className={HEADER_LINK_CLASS}>
          {clientNom}
        </Link>
      ) : (
        clientNom
      )}
      {SEP}
      <span className="whitespace-nowrap">{formatDate(facture.date_facture)}</span>
      {facture.date_echeance && (
        <>
          {SEP}
          <span className="whitespace-nowrap">échéance {formatDate(facture.date_echeance)}</span>
        </>
      )}
    </>
  );
  const totalCost = lignes.reduce(
    (sum, ligne) => sum + (toNumber(ligne.prix_achat_unitaire) ?? 0) * quantiteOf(ligne),
    0
  );
  const profit = total - totalCost;
  const marginPercentage = total > 0 ? (profit / total) * 100 : 0;
  const showCompensation = isManager && soldeFourn > 0 && isOpenForPayment;
  const showSousTotal = Math.round(sousTotal) !== Math.round(total);

  const downloadPdf = async () => {
    try {
      await factureService.downloadPdf(facture.id, facture.numero_facture);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de télécharger le PDF de la facture. Réessayez.'));
    }
  };

  // Ticket 80 mm (vente comptoir) : réimpression pour un client qui l'a perdu.
  const imprimerTicket = async () => {
    try {
      await printTicket(facture.id);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’imprimer le ticket. Réessayez.'));
    }
  };

  const moreActions: Array<PageHeaderMenuAction | false> = [
    { label: 'Télécharger le PDF', icon: Download, onSelect: () => void downloadPdf() },
    !isCancelled && { label: 'Imprimer le ticket de caisse', onSelect: () => void imprimerTicket() },
    montantPaye > 0 &&
      !isCancelled &&
      canOpen('/avoirs/nouveau') && {
        label: 'Créer un avoir',
        to: `/avoirs/nouveau?facture_id=${facture.id}`,
      },
    isManager &&
      !isCancelled &&
      montantPaye === 0 && {
        label: 'Annuler la facture',
        destructive: true,
        disabled: cancelling,
        onSelect: () => void handleCancelFacture(),
      },
  ];

  // Référence sous le nom du produit, comme sur le devis et le bon de livraison.
  const lignesTable = (
    <Table aria-label={`Produits de la facture ${facture.numero_facture}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Produit</TableHead>
          <TableHead numeric>Quantité</TableHead>
          <TableHead numeric>Prix unitaire</TableHead>
          <TableHead numeric>Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lignes.map((ligne) => (
          <TableRow key={ligne.id}>
            <TableCell className="font-medium">
              {ligne.produit_nom}
              {ligne.is_depot_only_history && (
                <Tag
                  className="ms-2"
                  title="Ce produit n’a plus de stock en magasin : il était disponible au dépôt lors de la vente."
                >
                  Vendu depuis le dépôt
                </Tag>
              )}
              {ligne.produit_reference && (
                <DocumentCode className="block text-xs font-normal text-muted-foreground">
                  {ligne.produit_reference}
                </DocumentCode>
              )}
            </TableCell>
            <TableCell numeric>{formatNumber(quantiteOf(ligne))}</TableCell>
            <TableCell numeric>
              <Money value={ligne.prix_unitaire} />
            </TableCell>
            <TableCell numeric className="font-medium">
              <Money value={ligne.total_ligne} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const lignesCards = lignes.map((ligne) => (
    <DataCard key={ligne.id} title={ligne.produit_nom} wrapTitle titleAs="h3">
      {ligne.produit_reference && (
        <DataCardRow label="Référence" value={<DocumentCode>{ligne.produit_reference}</DocumentCode>} />
      )}
      <DataCardRow label="Quantité" value={formatNumber(quantiteOf(ligne))} numeric />
      <DataCardRow label="Prix unitaire" value={<Money value={ligne.prix_unitaire} />} numeric />
      <DataCardRow label="Total" value={<Money value={ligne.total_ligne} className="font-medium" />} numeric />
    </DataCard>
  ));

  return (
    <PageShell
      title={`Facture ${facture.numero_facture}`}
      backTo="/factures"
      width="wide"
      meta={<StatusBadge type="facture" statut={facture.statut} size="md" />}
      description={headerLine}
      actions={
        <Button variant="outline" size="touch" onClick={() => setShowPrintLayout(true)} className="gap-2">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimer
        </Button>
      }
      primaryAction={
        isOpenForPayment && canPay ? (
          <Button size="touch" onClick={() => setShowPaymentModal(true)} className="gap-2">
            <Wallet className="h-4 w-4" aria-hidden="true" />
            Enregistrer un paiement
          </Button>
        ) : facture.statut === 'payee' && venteParDefaut ? (
          // P-M5 : la vente est soldée, la suivante commence d'ici (comptoir) —
          // sur l'écran de vente du profil métier.
          <Link to={venteParDefaut.path} className={cn(buttonVariants({ size: 'touch' }), 'gap-2')}>
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Nouvelle vente
          </Link>
        ) : undefined
      }
      moreActions={moreActions}
    >
      <DocumentLifecycle
        steps={[
          {
            label: 'Devis',
            numero: facture.origine?.numero_devis ?? null,
            to: facture.origine?.devis_id ? `/devis/${facture.origine.devis_id}` : null,
          },
          {
            label: 'Bon de livraison',
            numero: facture.origine?.numero_bl ?? null,
            to: facture.origine?.bl_id ? `/bons-livraison/${facture.origine.bl_id}` : null,
          },
          { label: 'Facture', numero: facture.numero_facture || `n° ${facture.id}`, current: true },
          {
            label: 'Avoir',
            numero: facture.origine?.numero_avoir ?? null,
            to: facture.origine?.avoir_id ? `/avoirs/${facture.origine.avoir_id}` : null,
          },
        ]}
      />

      {/* Annulée : un état neutre, comme sa pastille — plus rien n'est dû. */}
      {isCancelled ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          Cette facture est annulée : le client ne la doit plus
        </div>
      ) : (
        <PaymentStatusBar montantPaye={montantPaye} remainingDue={remainingDue} total={total} />
      )}

      {/* Une possibilité, pas une alerte : surface neutre, icône atténuée. */}
      {showCompensation && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm">
              Ce client est aussi votre fournisseur : vous lui devez{' '}
              <Money value={soldeFourn} className="font-medium" />. Vous pouvez compenser jusqu’à{' '}
              <Money value={maxCompensable} className="font-medium" /> sur cette facture.
            </p>
          </div>
          <Button variant="outline" size="touch" className="shrink-0 self-start sm:self-auto" onClick={openCompensation}>
            Compenser
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Produits</CardTitle>
          <CardDescription>
            {lignes.length} {lignes.length > 1 ? 'produits' : 'produit'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <EmptyState compact icon={FileText} title="Cette facture ne contient aucun produit" />
          ) : (
            <ResponsiveTable table={lignesTable} cards={lignesCards} />
          )}
          <DocumentTotals
            aria-label="Totaux de la facture"
            rows={showSousTotal ? [{ label: 'Sous-total', value: sousTotal }] : []}
            total={{ label: 'Total', value: total }}
          />
        </CardContent>
      </Card>

      {isManager && lignes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rentabilité</CardTitle>
            <p className="text-xs text-muted-foreground">Visible par les gérants et administrateurs</p>
          </CardHeader>
          <CardContent>
            <KeyValueList columns={3}>
              <KeyValue label="Coût d’achat" numeric>
                <Money value={totalCost} />
              </KeyValue>
              <KeyValue label="Marge brute" numeric>
                <Money value={profit} tone="delta" />
              </KeyValue>
              <KeyValue label="Taux de marge" numeric>
                {formatPercent(marginPercentage, 1)}
              </KeyValue>
            </KeyValueList>
          </CardContent>
        </Card>
      )}

      {facture.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{facture.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Paiements</CardTitle>
          {paiements.length > 0 && (
            <CardDescription>
              {paiements.length} {paiements.length > 1 ? 'paiements enregistrés' : 'paiement enregistré'}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <PaymentHistory
            paiements={paiements}
            onDelete={isAdmin ? handleDeletePayment : undefined}
            reports={{
              excedent_reporte: facture.excedent_reporte,
              recu_par_report: facture.recu_par_report,
              excedent_non_affecte: facture.excedent_non_affecte,
            }}
            factureAnnulee={isCancelled}
          />
        </CardContent>
      </Card>

      {acomptesDispo.length > 0 && isOpenForPayment && (
        <Card>
          <CardHeader>
            <CardTitle>Acomptes disponibles</CardTitle>
            <CardDescription>
              {formatCurrency(acomptesTotal)} versés d’avance par ce client. Pour les déduire de cette facture,
              utilisez « Appliquer ». Sinon, ils régleront automatiquement ses factures les plus anciennes lors de
              sa prochaine facture, de son prochain avoir ou de la prochaine compensation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              table={
                <Table aria-label="Acomptes disponibles du client">
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Mode de paiement</TableHead>
                      <TableHead numeric>Disponible</TableHead>
                      <TableHead className="w-[1%]">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acomptesDispo.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap">n° {a.id}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(a.date_acompte)}</TableCell>
                        <TableCell>
                          <Tag hue={paymentMethodHue(a.methode_paiement)}>{formatPaymentMethod(a.methode_paiement)}</Tag>
                        </TableCell>
                        <TableCell numeric className="font-medium">
                          <Money value={restantAcompte(a)} />
                        </TableCell>
                        <TableCell>
                          {/* Bouton de 36 px rattrapé par la marge négative : la ligne garde sa hauteur. */}
                          <div className="-my-2 flex justify-end">
                            <Button
                              variant="outline"
                              onClick={() => openApplyAcompte(a)}
                              aria-label={`Appliquer l’acompte n° ${a.id} à la facture`}
                            >
                              Appliquer
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={acomptesDispo.map((a) => (
                <DataCard
                  key={a.id}
                  title={`Acompte n° ${a.id}`}
                  titleAs="h3"
                  actions={
                    <Button variant="outline" size="touch" onClick={() => openApplyAcompte(a)}>
                      Appliquer l’acompte
                    </Button>
                  }
                >
                  <DataCardRow label="Date" value={formatDate(a.date_acompte)} />
                  <DataCardRow
                    label="Mode de paiement"
                    value={<Tag hue={paymentMethodHue(a.methode_paiement)}>{formatPaymentMethod(a.methode_paiement)}</Tag>}
                  />
                  <DataCardRow
                    label="Disponible"
                    value={<Money value={restantAcompte(a)} className="font-medium" />}
                    numeric
                  />
                </DataCard>
              ))}
            />
          </CardContent>
        </Card>
      )}

      <AttachmentPanel entityType="facture" entityId={facture.id} />

      {/* Compensation client / fournisseur */}
      <Dialog
        open={showCompensationModal}
        onOpenChange={(open) => {
          if (!compensationLoading) setShowCompensationModal(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Compenser avec ce que vous devez à ce fournisseur</DialogTitle>
            <DialogDescription>
              Le montant sera déduit à la fois de ce que le client vous doit sur cette facture et de ce que vous lui
              devez comme fournisseur
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Reste dû sur la facture</dt>
              <dd className="mt-0.5 font-medium">
                <Money value={remainingDue} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ce que vous devez à ce fournisseur</dt>
              <dd className="mt-0.5 font-medium">
                <Money value={soldeFourn} />
              </dd>
            </div>
          </dl>
          <div className="space-y-1.5">
            <Label htmlFor="compensation-montant">Montant à compenser</Label>
            <Input
              id="compensation-montant"
              type="number"
              inputMode="numeric"
              value={compensationMontant}
              onChange={(e) => {
                setCompensationMontant(e.target.value);
                setCompensationError(null);
              }}
              min={1}
              max={maxCompensable}
              step={1}
              {...fieldErrorProps('compensation-montant', compensationError)}
              aria-describedby={['compensation-montant-help', compensationError ? 'compensation-montant-error' : null]
                .filter(Boolean)
                .join(' ')}
            />
            <p id="compensation-montant-help" className="text-xs text-muted-foreground tabular-nums">
              Maximum : {formatCurrency(maxCompensable)}
            </p>
            <FieldError id="compensation-montant">{compensationError}</FieldError>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="touch"
              onClick={() => setShowCompensationModal(false)}
              disabled={compensationLoading}
            >
              Annuler
            </Button>
            <Button size="touch" onClick={handleCompensation} disabled={compensationLoading} className="gap-2">
              {compensationLoading && <Spinner />}
              Compenser {formatCurrency(Number(compensationMontant) || 0)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Application d'un acompte : le formulaire et son bouton valent confirmation. */}
      <Dialog
        open={!!acompteToApply}
        onOpenChange={(open) => {
          if (!open && !applyLoading) setAcompteToApply(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Appliquer l’acompte n° {acompteToApply?.id}</DialogTitle>
            <DialogDescription>
              {formatCurrency(Number(applyMontant) || 0)} de l’acompte n° {acompteToApply?.id} seront déduits du reste
              dû de la facture <DocumentCode>{facture.numero_facture}</DocumentCode>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="apply-acompte-montant">Montant à appliquer</Label>
            <Input
              id="apply-acompte-montant"
              type="number"
              inputMode="numeric"
              value={applyMontant}
              onChange={(e) => {
                setApplyMontant(e.target.value);
                setApplyError(null);
              }}
              min={1}
              max={acompteMaxApply}
              step={1}
              {...fieldErrorProps('apply-acompte-montant', applyError)}
              aria-describedby={['apply-acompte-montant-help', applyError ? 'apply-acompte-montant-error' : null]
                .filter(Boolean)
                .join(' ')}
            />
            <p id="apply-acompte-montant-help" className="text-xs text-muted-foreground tabular-nums">
              Maximum : {formatCurrency(acompteMaxApply)}
            </p>
            <FieldError id="apply-acompte-montant">{applyError}</FieldError>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="touch" onClick={() => setAcompteToApply(null)} disabled={applyLoading}>
              Annuler
            </Button>
            <Button size="touch" onClick={handleApplyAcompte} disabled={applyLoading} className="gap-2">
              {applyLoading && <Spinner />}
              Appliquer l’acompte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSubmit={handleAddPayment}
        remainingDue={remainingDue}
        total={total}
        numeroFacture={facture.numero_facture}
        acomptesDisponibles={acomptesTotal}
        cashTill={cashTill}
        caisseHref={canOpen('/caisse') ? '/caisse' : null}
      />

      <PrintPreview open={showPrintLayout} onOpenChange={setShowPrintLayout} format={printFormat} onFormatChange={setPrintFormat}>
        <DocumentPrint
          format={printFormat}
          docType="facture"
          numero={facture.numero_facture || `F${String(facture.id).padStart(5, '0')}`}
          dateDoc={facture.date_facture}
          dateEcheance={facture.date_echeance}
          clientNom={facture.client_nom}
          clientPrenom={facture.client_prenom ?? undefined}
          lignes={lignes}
          montantPaye={montantPaye}
          resteAPayer={remainingDue}
        />
      </PrintPreview>
    </PageShell>
  );
}
