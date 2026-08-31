import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { factureService, paiementService, acompteService, tiersService } from '../services/api';
import { FactureComplete, Paiement } from '../types';
import { PaymentStatusBar } from '../components/PaymentStatusBar';
import { PaymentHistory } from '../components/PaymentHistory';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { PaymentModal } from '../components/PaymentModal';
import { Button } from '@/components/ui/button';
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
import StatusBadge from '@/components/StatusBadge';
import { formatCurrency, formatXOF } from '@/utils/format';
import { formatPaymentMethod, type PaymentMethod } from '@/utils/paymentMethod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DocumentPrint } from '@/components/ui/print-layout';
import { PrintPreview, usePrintFormat } from '@/components/ui/print-preview';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DocumentLifecycle } from '@/components/ui/document-lifecycle';
import { PageLoading } from '@/components/ui/loading';
import { getErrorMessage } from '@/utils/errors';
import { AlertCircle, ArrowLeft, FileText, User, Calendar, Printer, Download, CreditCard, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function FactureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [facture, setFacture] = useState<FactureComplete | null>(null);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showPrintLayout, setShowPrintLayout] = useState(false);
  const [printFormat, setPrintFormat] = usePrintFormat();
  const [acomptesDispo, setAcomptesDispo] = useState<any[]>([]);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [compensationMontant, setCompensationMontant] = useState('');
  const [compensationLoading, setCompensationLoading] = useState(false);
  const [soldeFourn, setSoldeFourn] = useState<number>(0);
  const [acompteToApply, setAcompteToApply] = useState<any | null>(null);
  const [applyMontant, setApplyMontant] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);

  const loadFacture = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await factureService.getById(parseInt(id));
      setFacture(data);
      setPaiements(data.paiements || []);
      // Load client's available acomptes
      const clientId = (data as any).tiers_id || (data as any).client_id;
      if (clientId) {
        try {
          const acs = await acompteService.listForClient(clientId);
          setAcomptesDispo(acs);
        } catch (err) {
          setAcomptesDispo([]);
          toast.error(getErrorMessage(err, 'Erreur lors du chargement des acomptes du client'));
        }
        try {
          const tiersResp = await tiersService.getById(clientId);
          const tiers = tiersResp?.data ?? tiersResp;
          if (tiers?.est_fournisseur) {
            const fourn = parseFloat((tiers as any).solde_fournisseur_live ?? (tiers as any).solde_fournisseur ?? 0);
            setSoldeFourn(fourn > 0 ? fourn : 0);
          } else {
            setSoldeFourn(0);
          }
        } catch (err) {
          setSoldeFourn(0);
          toast.error(getErrorMessage(err, 'Erreur lors du chargement du solde fournisseur'));
        }
      }
    } catch (err) {
      setFacture(null);
      setPaiements([]);
      setError(err);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement de la facture'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadFacture();
  }, [loadFacture]);

  const handleCompensation = async () => {
    if (!facture) return;
    const tiersId = (facture as any).tiers_id || (facture as any).client_id;
    const montant = parseFloat(compensationMontant);
    if (Number.isNaN(montant) || montant <= 0) {
      toast.error('Montant invalide');
      return;
    }
    const maxComp = Math.min(remainingDue, soldeFourn);
    if (montant > maxComp + 0.005) {
      toast.error(`Montant trop élevé (max compensable: ${formatCurrency(maxComp)})`);
      return;
    }
    setCompensationLoading(true);
    try {
      await tiersService.createCompensation(tiersId, {
        date_compensation: new Date().toISOString().split('T')[0],
        montant,
        notes: `Compensation sur facture ${facture.numero_facture}`,
      });
      toast.success(`Compensation de ${formatCurrency(montant)} appliquée`);
      setShowCompensationModal(false);
      setCompensationMontant('');
      await loadFacture();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Erreur lors de la compensation'));
    } finally {
      setCompensationLoading(false);
    }
  };

  const acompteMaxApply = (() => {
    if (!facture || !acompteToApply) return 0;
    const restant = parseFloat(acompteToApply.montant_restant ?? acompteToApply.montant);
    const factureReste = parseFloat(facture.remaining_due as any) || (parseFloat(facture.total as any) - parseFloat(facture.montant_paye as any));
    return Math.min(restant, factureReste);
  })();

  const openApplyAcompte = (acompte: any) => {
    if (!facture) return;
    const restant = parseFloat(acompte.montant_restant ?? acompte.montant);
    const factureReste = parseFloat(facture.remaining_due as any) || (parseFloat(facture.total as any) - parseFloat(facture.montant_paye as any));
    const maxApply = Math.min(restant, factureReste);
    setAcompteToApply(acompte);
    setApplyMontant(maxApply.toFixed(2));
  };

  const handleApplyAcompte = async () => {
    if (!facture || !acompteToApply) return;
    const maxApply = acompteMaxApply;
    const montant = parseFloat(applyMontant);
    if (Number.isNaN(montant) || montant <= 0 || montant > maxApply + 0.005) {
      toast.error(`Montant invalide (max ${formatCurrency(maxApply)})`);
      return;
    }
    if (!(await confirm({
      title: "Appliquer l'acompte ?",
      description: `${formatCurrency(montant)} de l'acompte #${acompteToApply.id} seront appliqués sur la facture ${facture.numero_facture}.`,
      confirmLabel: 'Appliquer',
    }))) return;
    setApplyLoading(true);
    try {
      await acompteService.apply(acompteToApply.id, {
        facture_id: facture.id,
        montant,
        idempotency_key: `apply-${acompteToApply.id}-${facture.id}-${Date.now()}`,
      });
      toast.success(`Acompte appliqué: ${formatCurrency(montant)}`);
      setAcompteToApply(null);
      setApplyMontant('');
      await loadFacture();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Erreur application acompte'));
    } finally {
      setApplyLoading(false);
    }
  };

  const handleAddPayment = async (paiement: {
    montant: number;
    methode_paiement: PaymentMethod;
    reference?: string;
    notes?: string;
  }) => {
    if (!facture) return;

    await paiementService.create(facture.id, paiement);
    toast.success('Paiement enregistré avec succès');
    await loadFacture();
  };

  const handleDeletePayment = async (paiementId: number) => {
    if (!(await confirm({
      title: 'Supprimer le paiement',
      description: 'Êtes-vous sûr de vouloir supprimer ce paiement ? Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      destructive: true,
    }))) return;
    try {
      await paiementService.delete(paiementId);
      toast.success('Paiement supprimé');
      await loadFacture();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la suppression du paiement'));
    }
  };


  // Calculate values before early returns to maintain hook order
  const sousTotal = facture ? parseFloat(facture.sous_total as any) || 0 : 0;
  const total = facture ? parseFloat(facture.total as any) || 0 : 0;
  const montantPaye = facture ? parseFloat(facture.montant_paye as any) || 0 : 0;
  const remainingDue = facture ? parseFloat(facture.remaining_due as any) || total : 0;
  const lignes = facture ? facture.lignes || [] : [];

  const userStr = localStorage.getItem('auth_user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const totalCost = lignes.reduce((sum, line) => {
    const prixAchat = parseFloat((line as any).prix_achat_unitaire) || 0;
    const quantite = typeof line.quantite === 'string' ? parseInt(line.quantite) : line.quantite;
    return sum + (prixAchat * quantite);
  }, 0);

  const profit = total - totalCost;
  const marginPercentage = total > 0 ? parseFloat(((profit / total) * 100).toFixed(2)) : 0;

  if (loading) {
    return <PageLoading message="Chargement de la facture…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center" role="alert">
        <AlertCircle className="h-12 w-12 text-destructive opacity-80" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Échec du chargement</h2>
          <p className="text-muted-foreground">{getErrorMessage(error, 'Erreur lors du chargement de la facture')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/factures')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux factures
          </Button>
          <Button onClick={loadFacture} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (!facture) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <FileText className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold">Facture non trouvée</h2>
        <Button onClick={() => navigate('/factures')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux factures
        </Button>
      </div>
    );
  }

  const downloadPDF = () => {
    setShowPrintLayout(true);
    setTimeout(() => window.print(), 300);
  };

  return (
    <div className="p-3 sm:p-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/factures')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-8 w-8" />
              Facture {facture.numero_facture}
            </h1>
            <p className="text-muted-foreground mt-1">Détails de la facture</p>
          </div>
        </div>
        <div className="flex gap-2">
          <StatusBadge type="facture" statut={facture.statut} />
          <Button variant="outline" onClick={() => setShowPrintLayout(true)} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimer
          </Button>
          <Button variant="outline" onClick={downloadPDF} className="gap-2">
            <Download className="h-4 w-4" />
            Télécharger PDF
          </Button>
        </div>
      </div>

      {/* Document lifecycle strip */}
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
          { label: 'Facture', numero: facture.numero_facture || `Facture #${facture.id}`, current: true },
          {
            label: 'Avoir',
            numero: facture.origine?.numero_avoir ?? null,
            to: facture.origine?.avoir_id ? `/avoirs/${facture.origine.avoir_id}` : null,
          },
        ]}
      />

      {/* Payment Status Bar */}
      {facture.statut !== 'annulee' && (
        <PaymentStatusBar
          montantPaye={montantPaye}
          remainingDue={remainingDue}
          total={total}
          statut={facture.statut}
          onAddPayment={facture.statut !== 'payee' ? () => setShowPaymentModal(true) : undefined}
        />
      )}

      {/* Compensation fournisseur banner */}
      {soldeFourn > 0 && remainingDue > 0 && facture.statut !== 'annulee' && facture.statut !== 'payee' && (
        <div className="flex items-center justify-between rounded-lg border border-warning-300 bg-warning-50 px-4 py-3">
          <div className="flex items-center gap-2 text-warning-800">
            <ArrowLeftRight className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">
              Ce client est aussi fournisseur — vous lui devez <strong>{formatXOF(soldeFourn)}</strong>. Vous pouvez compenser jusqu'à <strong>{formatXOF(Math.min(remainingDue, soldeFourn))}</strong> sur cette facture.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-warning-400 text-warning-800 hover:bg-warning-100 ml-4 flex-shrink-0"
            onClick={() => {
              setCompensationMontant(Math.min(remainingDue, soldeFourn).toFixed(2));
              setShowCompensationModal(true);
            }}
          >
            <ArrowLeftRight className="h-4 w-4 mr-1" />
            Compenser
          </Button>
        </div>
      )}

      {/* Invoice Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-semibold text-lg">{facture.client_nom} {facture.client_prenom}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Informations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date de facture:</span>
              <span className="font-semibold">
                {new Date(facture.date_facture).toLocaleDateString('fr-FR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">N° Facture:</span>
              <span className="font-mono font-semibold break-words">{facture.numero_facture}</span>
            </div>
            {facture.origine && 'devis_id' in facture.origine && facture.origine.devis_id && (
              <div className="text-sm">
                <span className="text-muted-foreground">Devis d'origine: </span>
                <Link to={`/devis/${facture.origine.devis_id}`} className="font-mono font-semibold text-primary hover:underline">
                  {facture.origine.numero_devis}
                </Link>
              </div>
            )}
            {facture.origine && 'bl_id' in facture.origine && facture.origine.bl_id && (
              <div className="text-sm">
                <span className="text-muted-foreground">Bon de livraison: </span>
                <Link to={`/bons-livraison/${facture.origine.bl_id}`} className="font-mono font-semibold text-primary hover:underline">
                  {facture.origine.numero_bl}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Articles</CardTitle>
          <CardDescription>{lignes.length} article(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead className="text-right">Prix unitaire</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.map((ligne) => {
                const prixUnitaire = parseFloat(ligne.prix_unitaire as any) || 0;
                const quantite = typeof ligne.quantite === 'string' ? parseInt(ligne.quantite) : ligne.quantite;
                const totalLigne = parseFloat(ligne.total_ligne as any) || 0;
                
                return (
                  <TableRow key={ligne.id}>
                    <TableCell className="font-mono">{ligne.produit_reference}</TableCell>
                    <TableCell className="font-semibold">
                      {ligne.produit_nom}
                      {(ligne as any).is_depot_only_history && (
                        <span
                          className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                          title="Cet article n'a plus de stock magasin — il était disponible en dépôt au moment de la création"
                        >
                          stock dépôt (historique)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{quantite}</TableCell>
                    <TableCell className="text-right">{formatXOF(prixUnitaire)}</TableCell>
                    <TableCell className="text-right font-bold">{formatXOF(totalLigne)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex justify-between text-lg">
                <span className="text-primary-foreground/80">Sous-total</span>
                <span className="font-semibold">{formatXOF(sousTotal)}</span>
              </div>
              <div className="border-t border-primary-foreground/20 pt-3">
                <div className="flex justify-between text-2xl font-bold">
                  <span>Total</span>
                  <span>{formatXOF(total)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isManagerOrAdmin && (
          <Card className="border-success-300 bg-success-50 text-success-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-success-800">
                Analyse de rentabilité (Restreint)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-lg">
                <span className="text-success-800">Coût total d'achat:</span>
                <span className="font-semibold">{formatXOF(totalCost)}</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="text-success-800">Marge brute:</span>
                <span className="font-bold text-success-700">{formatXOF(profit)}</span>
              </div>
              <div className="border-t border-success-200 pt-2">
                <div className="flex justify-between text-xl font-bold">
                  <span>Taux de marge:</span>
                  <span>{marginPercentage}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Notes */}
      {facture.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{facture.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      {paiements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Historique des paiements
            </CardTitle>
            <CardDescription>
              {paiements.length} paiement(s) enregistré(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentHistory
              paiements={paiements}
              onDelete={handleDeletePayment}
            />
          </CardContent>
        </Card>
      )}

      {facture?.id && <AttachmentPanel entityType="facture" entityId={facture.id} />}

      {/* Acomptes disponibles pour ce client */}
      {acomptesDispo.length > 0 && remainingDue > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-info-700" />
              Acomptes disponibles ({acomptesDispo.length})
            </CardTitle>
            <CardDescription>
              Crédit client utilisable sur cette facture
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead className="text-right">Restant</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acomptesDispo.map((a) => {
                  const restant = parseFloat(a.montant_restant ?? a.montant);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-sm">#{a.id}</TableCell>
                      <TableCell className="text-sm">
                        {a.date_acompte ? new Date(a.date_acompte).toLocaleDateString('fr-FR') : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{formatPaymentMethod(a.methode_paiement)}</TableCell>
                      <TableCell className="text-right font-semibold text-info-700">
                        {formatXOF(restant)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openApplyAcompte(a)}>
                          Appliquer
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Compensation Modal */}
      <Dialog
        open={showCompensationModal}
        onOpenChange={(open) => {
          if (!compensationLoading) setShowCompensationModal(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-warning-600" />
              Compenser avec dette fournisseur
            </DialogTitle>
            <DialogDescription>
              Ce montant sera déduit à la fois de ce que le client vous doit (facture client) et de ce que vous lui devez (compte fournisseur).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium block mb-1">Reste dû sur la facture</span>
              <p className="text-lg font-bold text-danger-600">{formatXOF(remainingDue)}</p>
            </div>
            <div>
              <span className="text-sm font-medium block mb-1">Votre dette fournisseur envers ce tiers</span>
              <p className="text-lg font-bold text-info-700">{formatXOF(soldeFourn)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compensation-montant">
                Montant à compenser (max {formatXOF(Math.min(remainingDue, soldeFourn))})
              </Label>
              <Input
                id="compensation-montant"
                type="number" inputMode="decimal"
                value={compensationMontant}
                onChange={(e) => setCompensationMontant(e.target.value)}
                min={0.01}
                max={Math.min(remainingDue, soldeFourn)}
                step={0.01}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompensationModal(false)} disabled={compensationLoading}>
              Annuler
            </Button>
            <Button variant="warning" onClick={handleCompensation} disabled={compensationLoading}>
              {compensationLoading ? 'En cours…' : 'Confirmer la compensation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply acompte Dialog */}
      <Dialog
        open={!!acompteToApply}
        onOpenChange={(open) => {
          if (!open && !applyLoading) setAcompteToApply(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-info-700" />
              Appliquer l'acompte
            </DialogTitle>
            <DialogDescription>
              Indiquez le montant de l'acompte à appliquer sur cette facture.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="apply-acompte-montant">
              Montant à appliquer (max {formatCurrency(acompteMaxApply)})
            </Label>
            <Input
              id="apply-acompte-montant"
              type="number" inputMode="decimal"
              value={applyMontant}
              onChange={(e) => setApplyMontant(e.target.value)}
              min={0.01}
              max={acompteMaxApply}
              step={0.01}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcompteToApply(null)} disabled={applyLoading}>
              Annuler
            </Button>
            <Button onClick={handleApplyAcompte} disabled={applyLoading}>
              {applyLoading ? 'En cours…' : 'Valider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSubmit={handleAddPayment}
        remainingDue={remainingDue}
        total={total}
      />

      <PrintPreview
        open={showPrintLayout}
        onOpenChange={setShowPrintLayout}
        format={printFormat}
        onFormatChange={setPrintFormat}
      >
        <DocumentPrint
          format={printFormat}
          docType="facture"
          numero={facture.numero_facture || `F${String(facture.id).padStart(5, '0')}`}
          dateDoc={facture.date_facture}
          dateEcheance={(facture as any).date_echeance}
          vendeur={(facture as any).cree_par_nom || 'Administrator'}
          clientNom={facture.client_nom}
          clientPrenom={(facture as any).client_prenom}
          lignes={lignes as any}
        />
      </PrintPreview>
    </div>
  );
}
