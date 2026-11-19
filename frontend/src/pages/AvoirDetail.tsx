import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertCircle, Banknote, Download, FileMinus, Link2, Lock, Printer } from 'lucide-react';
import { caisseService, creditNoteService, factureService } from '../services/api';
import { METHODES_PAIEMENT, type AvoirComplete, type AvoirLigne } from '../types';
import type { CashTillState } from '@/components/PaymentModal';
import type { PageHeaderMenuAction } from '@/components/ui/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChoiceGroup } from '@/components/ui/choice-chips';
import { DocumentPicker, type DocumentOption } from '@/components/DocumentPicker';
import StatusBadge from '@/components/StatusBadge';
import { PageShell } from '@/components/ui/page-shell';
import { QueryErrorState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DocumentTotals } from '@/components/ui/document-totals';
import { DocumentCode } from '@/components/ui/document-code';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { Money } from '@/components/ui/money';
import { DocumentPrint } from '@/components/ui/print-layout';
import { PrintPreview, usePrintFormat } from '@/components/ui/print-preview';
import { DocumentLifecycle } from '@/components/ui/document-lifecycle';
import { PageLoading, Spinner } from '@/components/ui/loading';
import { useAuth } from '@/lib/AuthContext';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { formatCurrency, formatDate, formatDateTime, formatNumber, toNumber } from '@/utils/format';
import { formatAvoirType } from '@/utils/avoirTypes';
import { getErrorCode, getErrorMessage } from '@/utils/errors';
import {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodPhrase,
  type PaymentMethod,
} from '@/utils/paymentMethod';

/** Remboursement d'un avoir (E3), lu dans le journal d'audit par le serveur. */
interface AvoirRemboursement {
  date?: string | null;
  montant?: number | string | null;
  methode_paiement?: string | null;
  reference?: string | null;
  mouvement_caisse_id?: number | null;
  rembourse_par_nom?: string | null;
}

type AvoirDetailData = AvoirComplete & {
  /** Colonne réelle (`factures_avoir.tiers_id`) ; `client_id` n'existe pas en base. */
  tiers_id?: number | null;
  location_id?: number | null;
  location_nom?: string | null;
  facture_appliquee_id?: number | null;
  /** Présent quand l'avoir a été remboursé au client (E3). */
  remboursement?: AvoirRemboursement | null;
};

interface MagasinCaisse {
  id: number;
  nom?: string | null;
  location_id?: number | null;
}

/** Rôles que l'API laisse imputer et rembourser un avoir (`/avoirs/:id/…`). */
const MANAGER_ROLES = ['admin', 'manager'];

const METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS.map((o) => ({ ...o, icon: METHODES_PAIEMENT[o.value].Icon }));

const REFUND_ERROR = 'Le remboursement n’a pas pu être enregistré. Réessayez ; si le problème persiste, prévenez l’administrateur.';

/** Séparateur de la ligne d'en-tête : l'insécable garde « · » avec ce qui le précède, la ligne ne coupe qu'après. */
const SEP = '\u00A0· ';
/** Lien dans la ligne d'en-tête : souligné en permanence, le bleu seul se distingue mal du gris qui l'entoure (1,6:1). */
const HEADER_LINK_CLASS =
  'rounded-sm text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface FactureCandidate {
  id: number;
  numero_facture: string;
  tiers_id?: number | null;
  client_id?: number | null;
  client_nom?: string | null;
  client_prenom?: string | null;
  remaining_due?: number | string | null;
  total?: number | string | null;
  date_facture?: string | null;
  statut?: string | null;
}

const quantiteOf = (l: AvoirLigne) => toNumber(l.quantite) ?? 0;

export default function AvoirDetail() {
  const { id } = useParams<{ id: string }>();
  const canOpen = useRouteAccess();
  const { user } = useAuth();
  const canManage = MANAGER_ROLES.includes(user?.role ?? '');
  const [avoir, setAvoir] = useState<AvoirDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showPrintLayout, setShowPrintLayout] = useState(false);
  const [printFormat, setPrintFormat] = usePrintFormat();
  const [applyOpen, setApplyOpen] = useState(false);
  const [targetFacture, setTargetFacture] = useState<DocumentOption | null>(null);
  const [applying, setApplying] = useState(false);

  // « Rembourser l’avoir » (E3)
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundMethode, setRefundMethode] = useState<PaymentMethod>('espece');
  const [refundReference, setRefundReference] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundTill, setRefundTill] = useState<CashTillState>('unknown');
  const [refundTillName, setRefundTillName] = useState<string | null>(null);
  const [refundClosedByServer, setRefundClosedByServer] = useState(false);
  const refundTillNoteRef = useRef<HTMLDivElement>(null);

  const loadAvoir = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setAvoir(((await creditNoteService.getById(Number(id))) as AvoirDetailData | null) ?? null);
    } catch (err) {
      setAvoir(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAvoir();
  }, [loadAvoir]);

  const clientId = avoir?.tiers_id ?? avoir?.client_id ?? null;

  /**
   * Factures imputables : celles du client de l'avoir, hors factures annulées.
   * Une facture déjà payée est acceptée : l'avoir passe alors au crédit du
   * client. Le serveur revérifie le client et refuse une facture annulée — ce
   * filtre évite surtout de proposer un choix qui sera rejeté.
   */
  const searchFacturesClient = useCallback(
    async (query: string): Promise<DocumentOption[]> => {
      const nomClient = `${avoir?.client_nom ?? ''} ${avoir?.client_prenom ?? ''}`.trim();
      const res = (await factureService.getAll(query || nomClient, undefined, 1, 20)) as
        | { data?: FactureCandidate[] }
        | FactureCandidate[]
        | null;
      const rows: FactureCandidate[] = Array.isArray(res) ? res : res?.data ?? [];
      return rows
        .filter((f) => clientId !== null && Number(f.tiers_id ?? f.client_id) === Number(clientId))
        .filter((f) => f.statut !== 'annulee')
        .map((f) => ({
          id: f.id,
          numero: f.numero_facture,
          tiers_nom: `${f.client_nom ?? ''} ${f.client_prenom ?? ''}`.trim() || null,
          montant: toNumber(f.remaining_due) ?? toNumber(f.total),
          date: f.date_facture ?? null,
          statut: f.statut ?? null,
        }));
    },
    [avoir?.client_nom, avoir?.client_prenom, clientId]
  );

  const submitApply = async () => {
    if (!avoir || !targetFacture) return;
    setApplying(true);
    try {
      const result = await creditNoteService.applyToFacture(avoir.id, targetFacture.id);
      // E1 : l'avoir réduit la facture choisie ; la phrase du serveur la nomme
      // et dit ce qui reste dû (ou ce qui passe au crédit du client).
      toast.success(result?.message || `Avoir ${avoir.numero_avoir} imputé sur la facture ${targetFacture.numero}.`);
      setApplyOpen(false);
      setTargetFacture(null);
      void loadAvoir();
    } catch (err) {
      toast.error(
        getErrorMessage(
          err,
          'L’avoir n’a pas pu être imputé. Réessayez ; si le problème persiste, prévenez l’administrateur.'
        )
      );
    } finally {
      setApplying(false);
    }
  };

  // ===== Remboursement (E3) =====
  const openRefund = () => {
    setRefundMethode('espece');
    setRefundReference('');
    setRefundNotes('');
    setRefundError(null);
    setRefundClosedByServer(false);
    setRefundOpen(true);
  };

  // Caisse du magasin de l'avoir : vérifiée à l'ouverture, pour prévenir avant
  // l'envoi qu'un remboursement en espèces est impossible caisse fermée.
  const avoirLocationId = avoir?.location_id ?? null;
  useEffect(() => {
    if (!refundOpen) return;
    setRefundTill('unknown');
    setRefundTillName(null);
    if (!avoirLocationId) return;
    let cancelled = false;
    (async () => {
      try {
        const magasins = (await caisseService.getMagasins()) as MagasinCaisse[];
        const magasin = magasins.find((m) => Number(m.location_id) === Number(avoirLocationId));
        if (!magasin) return; // magasin non affecté : le serveur tranchera
        if (!cancelled) setRefundTillName(magasin.nom ?? null);
        const session = await caisseService.getSessionActive(magasin.id);
        if (!cancelled) setRefundTill(session ? 'open' : 'closed');
      } catch {
        if (!cancelled) setRefundTill('unknown');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refundOpen, avoirLocationId]);

  const submitRefund = async (e: FormEvent) => {
    e.preventDefault();
    if (!avoir || refunding) return;
    setRefundError(null);
    setRefunding(true);
    try {
      const result = await creditNoteService.refund(avoir.id, {
        methode_paiement: refundMethode,
        reference: refundReference.trim() || undefined,
        notes: refundNotes.trim() || undefined,
      });
      toast.success(
        result?.message ||
          `Avoir ${avoir.numero_avoir} remboursé : ${formatCurrency(avoir.total)} ${paymentMethodPhrase(refundMethode)}.`
      );
      setRefundOpen(false);
      void loadAvoir();
    } catch (err) {
      if (getErrorCode(err) === 'CAISSE_FERMEE') {
        // Le refus nomme le magasin dont la caisse est fermée (`magasin_nom`).
        const magasinNom = (err as { response?: { data?: { magasin_nom?: unknown } } } | null)?.response?.data
          ?.magasin_nom;
        if (typeof magasinNom === 'string' && magasinNom.trim()) setRefundTillName(magasinNom.trim());
        setRefundClosedByServer(true);
        requestAnimationFrame(() => refundTillNoteRef.current?.focus());
      } else {
        setRefundError(getErrorMessage(err, REFUND_ERROR));
      }
    } finally {
      setRefunding(false);
    }
  };

  if (loading && !avoir) {
    return (
      <PageShell title="Avoir" backTo="/avoirs" width="wide">
        <PageLoading message="Chargement de l’avoir…" />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Avoir" backTo="/avoirs" width="wide">
        <Card>
          <QueryErrorState error={error} title="Impossible de charger l’avoir" onRetry={() => void loadAvoir()} />
        </Card>
      </PageShell>
    );
  }

  if (!avoir) {
    return (
      <PageShell title="Avoir introuvable" backTo="/avoirs" width="wide">
        <Card>
          <EmptyState
            icon={FileMinus}
            title="Avoir introuvable"
            description="Il a peut-être été supprimé"
            action={
              <Link to="/avoirs" className={buttonVariants({ variant: 'outline' })}>
                Retour aux avoirs
              </Link>
            }
          />
        </Card>
      </PageShell>
    );
  }

  const total = toNumber(avoir.total) ?? 0;
  const lignes = avoir.lignes || [];
  const numero = avoir.numero_avoir || `n° ${avoir.id}`;
  const clientNom = `${avoir.client_nom ?? ''} ${avoir.client_prenom ?? ''}`.trim() || '—';
  const libelle = (l: AvoirLigne) => l.produit_nom || l.description || 'Produit';

  // Référence sous le nom du produit, comme sur le devis et le bon de livraison.
  const table = (
    <Table aria-label={`Produits de l’avoir ${numero}`}>
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
              {libelle(ligne)}
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

  const cards = lignes.map((ligne) => (
    <DataCard key={ligne.id} title={libelle(ligne)} wrapTitle titleAs="h3">
      {ligne.produit_reference && (
        <DataCardRow label="Référence" value={<DocumentCode>{ligne.produit_reference}</DocumentCode>} />
      )}
      <DataCardRow label="Quantité" value={formatNumber(quantiteOf(ligne))} numeric />
      <DataCardRow label="Prix unitaire" value={<Money value={ligne.prix_unitaire} />} numeric />
      <DataCardRow label="Total" value={<Money value={ligne.total_ligne} className="font-medium" />} numeric />
    </DataCard>
  ));

  const downloadPdf = async () => {
    try {
      await creditNoteService.downloadPdf(avoir.id, avoir.numero_avoir || undefined);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de télécharger le PDF de l’avoir. Réessayez.'));
    }
  };

  const usable = canManage && avoir.statut === 'valide';
  const remboursement = avoir.remboursement ?? null;
  // Ce que ni l'en-tête (client, date) ni le cycle du document (facture
  // d'origine) ne disent déjà.
  const hasDetails = !!(avoir.avoir_type || avoir.numero_retour || avoir.facture_appliquee_id || remboursement);
  const refundTillClosed = refundTill === 'closed' || refundClosedByServer;
  const showRefundTillWarning = refundMethode === 'espece' && refundTillClosed;
  const caisseHref = canOpen('/caisse') ? '/caisse' : null;
  const refundSubmitLabel = `Rembourser ${formatCurrency(total)} ${paymentMethodPhrase(refundMethode)}`;

  // Une action principale (imputer), « Imprimer » à côté ; le remboursement,
  // plus rare, rejoint le PDF dans « Plus d’actions » (quatre commandes dans
  // l'en-tête avant). Même fenêtre de confirmation, mêmes rôles.
  const moreActions: Array<PageHeaderMenuAction | false> = [
    { label: 'Télécharger le PDF', icon: Download, onSelect: () => void downloadPdf() },
    usable && { label: 'Rembourser l’avoir', icon: Banknote, onSelect: openRefund },
  ];

  return (
    <PageShell
      title={`Avoir ${numero}`}
      backTo="/avoirs"
      width="wide"
      meta={<StatusBadge type="avoir" statut={avoir.statut} size="md" />}
      description={
        <>
          {clientId && canOpen(`/tiers/${clientId}`) ? (
            <Link to={`/tiers/${clientId}`} className={HEADER_LINK_CLASS}>
              {clientNom}
            </Link>
          ) : (
            clientNom
          )}
          {SEP}
          <span className="whitespace-nowrap">{formatDate(avoir.date_avoir)}</span>
        </>
      }
      actions={
        <Button variant="outline" size="touch" onClick={() => setShowPrintLayout(true)} className="gap-2">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimer
        </Button>
      }
      primaryAction={
        usable ? (
          <Button size="touch" onClick={() => setApplyOpen(true)} className="gap-2">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Imputer sur une facture
          </Button>
        ) : undefined
      }
      moreActions={moreActions}
    >
      <DocumentLifecycle
        steps={[
          { label: 'Devis', numero: null },
          { label: 'Bon de livraison', numero: null },
          {
            label: 'Facture',
            numero: avoir.facture_origine_numero ?? null,
            to: avoir.facture_origine_id ? `/factures/${avoir.facture_origine_id}` : null,
          },
          { label: 'Avoir', numero, current: true },
        ]}
      />

      {/* Client et date sont dans l'en-tête, la facture d'origine dans le cycle
          ci-dessus : la carte ne garde que le reste, sans titre. */}
      {hasDetails && (
        <Card>
          <CardContent inset="standalone">
            <KeyValueList columns={3}>
              {avoir.avoir_type && <KeyValue label="Type">{formatAvoirType(avoir.avoir_type)}</KeyValue>}
              {avoir.numero_retour && (
                <KeyValue label="Retour client">
                  <DocumentCode>{avoir.numero_retour}</DocumentCode>
                </KeyValue>
              )}
              {avoir.facture_appliquee_id && (
                <KeyValue label="Imputé sur">
                  <Link
                    to={`/factures/${avoir.facture_appliquee_id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Voir la facture
                  </Link>
                </KeyValue>
              )}
              {remboursement && (
                <KeyValue label="Remboursé au client">
                  <span className="block">
                    <Money value={remboursement.montant ?? total} /> {paymentMethodPhrase(remboursement.methode_paiement)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[
                      remboursement.date ? `le ${formatDateTime(remboursement.date)}` : null,
                      remboursement.rembourse_par_nom ? `par ${remboursement.rembourse_par_nom}` : null,
                      remboursement.reference ? `réf. ${remboursement.reference}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </KeyValue>
              )}
            </KeyValueList>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Produits</CardTitle>
          <CardDescription>
            {lignes.length} {lignes.length > 1 ? 'lignes' : 'ligne'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <EmptyState compact icon={FileMinus} title="Cet avoir ne contient aucune ligne" />
          ) : (
            <ResponsiveTable table={table} cards={cards} />
          )}
          <DocumentTotals
            aria-label="Montant de l’avoir"
            total={{ label: 'Montant de l’avoir', value: total }}
          />
        </CardContent>
      </Card>

      {avoir.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{avoir.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Imputation de l'avoir sur une facture du même client */}
      <Dialog
        open={applyOpen}
        onOpenChange={(open) => {
          if (!applying) setApplyOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Imputer l’avoir <span className="whitespace-nowrap">{numero}</span>
            </DialogTitle>
            <DialogDescription>
              {formatCurrency(total)} viendront en déduction du reste dû de la facture choisie. Ce qui dépasse ce reste dû
              (tout le montant si la facture est déjà payée) passe au crédit du client. Seules les factures de{' '}
              {clientNom} sont proposées.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="avoir-facture-cible">Facture</Label>
            <DocumentPicker
              inputId="avoir-facture-cible"
              value={targetFacture}
              onChange={setTargetFacture}
              search={searchFacturesClient}
              placeholder="Rechercher une facture (numéro ou client)…"
              disabled={applying}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="touch" onClick={() => setApplyOpen(false)} disabled={applying}>
              Annuler
            </Button>
            <Button size="touch" onClick={() => void submitApply()} disabled={!targetFacture || applying} className="gap-2">
              {applying && <Spinner />}
              Imputer l’avoir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remboursement de l'avoir (E3) : le formulaire et son bouton, qui nomment
          le montant et le mode, valent confirmation. */}
      <Dialog
        open={refundOpen}
        onOpenChange={(open) => {
          if (!refunding) setRefundOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submitRefund} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <DialogHeader>
              <DialogTitle>
                Rembourser l’avoir <span className="whitespace-nowrap">{numero}</span>
              </DialogTitle>
              <DialogDescription>
                {formatCurrency(total)} seront rendus à {clientNom}. L’avoir sera marqué utilisé : il ne pourra plus être
                imputé sur une facture.
              </DialogDescription>
            </DialogHeader>

            <KeyValueList columns={1} className="rounded-md border bg-muted/40 p-3">
              <KeyValue label="Montant à rembourser" numeric>
                <Money value={total} emphasis />
              </KeyValue>
            </KeyValueList>

            <ChoiceGroup
              label="Mode de remboursement"
              value={refundMethode}
              onValueChange={(value) => {
                setRefundMethode(value);
                setRefundError(null);
              }}
              options={METHOD_OPTIONS}
              layout="grid-2"
              shape="tile"
              size="touch"
              // Sous 360 px, une colonne : « Orange Money » ne devient pas « Orange … ».
              className="max-[359px]:[&_[role=radiogroup]]:grid-cols-1"
              aria-describedby={showRefundTillWarning ? 'refund-till-closed' : undefined}
            />

            {showRefundTillWarning ? (
              <div
                id="refund-till-closed"
                ref={refundTillNoteRef}
                tabIndex={-1}
                role={refundClosedByServer ? 'alert' : 'status'}
                className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <p>
                    La caisse {refundTillName ? `de ${refundTillName} ` : ''}est fermée : ouvrez-la pour rembourser en
                    espèces, ou choisissez un autre mode.
                  </p>
                  {caisseHref && (
                    <Link
                      to={caisseHref}
                      className="inline-flex min-h-6 items-center font-medium underline underline-offset-4 hover:text-warning-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ouvrir la caisse
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              refundMethode === 'espece' &&
              refundTill === 'open' && (
                <p className="text-sm text-muted-foreground">
                  Les espèces sortent de la caisse ouverte{refundTillName ? ` de ${refundTillName}` : ''}
                </p>
              )
            )}

            <div className="space-y-1.5">
              <Label htmlFor="refund-reference">
                Référence <span className="font-normal text-muted-foreground">(facultatif)</span>
              </Label>
              <Input
                id="refund-reference"
                value={refundReference}
                onChange={(e) => setRefundReference(e.target.value)}
                placeholder={
                  refundMethode === 'cheque'
                    ? 'Ex. : 0012345'
                    : refundMethode === 'virement'
                      ? 'Ex. : VIR-2026-118'
                      : ''
                }
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="refund-notes">
                Notes <span className="font-normal text-muted-foreground">(facultatif)</span>
              </Label>
              <Textarea
                id="refund-notes"
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>

            {refundError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{refundError}</span>
              </div>
            )}

            <DialogFooter sticky className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => setRefundOpen(false)}
                disabled={refunding}
              >
                Annuler
              </Button>
              {/* Le libellé nomme le montant et le mode : il peut passer sur deux lignes au téléphone. */}
              <Button
                type="submit"
                size="touch"
                disabled={refunding}
                aria-busy={refunding || undefined}
                className="h-auto min-h-11 gap-2 whitespace-normal py-2 text-center sm:min-h-10"
              >
                {refunding && <Spinner />}
                {refundSubmitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PrintPreview
        open={showPrintLayout}
        onOpenChange={setShowPrintLayout}
        format={printFormat}
        onFormatChange={setPrintFormat}
      >
        <DocumentPrint
          format={printFormat}
          docType="avoir"
          numero={avoir.numero_avoir || `AV${String(avoir.id).padStart(5, '0')}`}
          dateDoc={avoir.date_avoir}
          clientNom={avoir.client_nom}
          clientPrenom={avoir.client_prenom ?? undefined}
          lignes={lignes.map((l) => ({
            produit_nom: l.produit_nom ?? undefined,
            produit_reference: l.produit_reference ?? undefined,
            description: l.description ?? undefined,
            quantite: l.quantite,
            prix_unitaire: l.prix_unitaire,
          }))}
        />
      </PrintPreview>
    </PageShell>
  );
}
