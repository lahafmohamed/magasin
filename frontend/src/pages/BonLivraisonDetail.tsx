import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatFCFA as formatXOF } from '../utils/format';
import { getErrorMessage } from '@/utils/errors';
import { AlertCircle, ArrowLeft, FileCheck, Truck, Printer, Download, RefreshCw } from 'lucide-react';
import { bonLivraisonService } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatusBadge from '@/components/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DocumentPrint } from '@/components/ui/print-layout';
import { PrintPreview, usePrintFormat } from '@/components/ui/print-preview';
import { DocumentLifecycle } from '@/components/ui/document-lifecycle';
import { PageLoading } from '@/components/ui/loading';

export default function BonLivraisonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [bon, setBon] = useState<any>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [showDeliverDialog, setShowDeliverDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [printFormat, setPrintFormat] = usePrintFormat();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await bonLivraisonService.getById(Number(id));
      setBon(data?.data || data);
    } catch (err) {
      setBon(null);
      setError(err);
      toast.error(getErrorMessage(err, 'Impossible de charger ce bon de livraison'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const canMarkDelivered = bon?.statut === 'valide' || bon?.statut === 'brouillon';
  const canConvert = bon?.statut === 'livre';
  const downloadPDF = () => {
    setShowPrint(true);
    setTimeout(() => window.print(), 300);
  };

  const handleMarkDelivered = async () => {
    if (!bon?.id) return;

    try {
      setActionLoading(true);
      await bonLivraisonService.updateStatut(Number(bon.id), 'livre');
      toast.success('Bon de livraison marqué comme livré');
      setShowDeliverDialog(false);
      const refreshed = await bonLivraisonService.getById(Number(bon.id));
      setBon(refreshed?.data || refreshed);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la mise à jour du statut'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!bon?.id) return;

    try {
      setActionLoading(true);
      const result = await bonLivraisonService.convertToFacture(Number(bon.id));
      const factureId = result?.facture_id || result?.data?.facture_id;
      toast.success(`Facture ${result?.numero_facture || ''} créée`.trim());
      setShowConvertDialog(false);
      if (factureId) {
        navigate(`/factures/${factureId}`);
        return;
      }
      const refreshed = await bonLivraisonService.getById(Number(bon.id));
      setBon(refreshed?.data || refreshed);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la conversion en facture'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <PageLoading message="Chargement du bon de livraison…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center" role="alert">
        <AlertCircle className="h-12 w-12 text-destructive opacity-80" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Échec du chargement</h2>
          <p className="text-muted-foreground">{getErrorMessage(error, 'Impossible de charger ce bon de livraison')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/bons-livraison')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux bons de livraison
          </Button>
          <Button onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (!bon) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" onClick={() => navigate('/bons-livraison')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux bons de livraison
        </Button>
        <Card>
          <CardContent className="pt-6">Bon de livraison introuvable</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/bons-livraison')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{bon.numero_bl || `BL #${bon.id}`}</h1>
          <p className="text-muted-foreground">Client: {bon.client_nom || bon.tiers_id || '-'}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setShowPrint(true)}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimer
          </Button>
          <Button variant="outline" onClick={downloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Télécharger PDF
          </Button>
          {canMarkDelivered && (
            <Button onClick={() => setShowDeliverDialog(true)} disabled={actionLoading}>
              <Truck className="h-4 w-4 mr-2" />
              Marquer livré
            </Button>
          )}
          {canConvert && (
            <Button onClick={() => setShowConvertDialog(true)} disabled={actionLoading}>
              <FileCheck className="h-4 w-4 mr-2" />
              Créer facture
            </Button>
          )}
        </div>
      </div>

      <DocumentLifecycle
        steps={[
          {
            label: 'Devis',
            numero: bon.devis_numero,
            to: bon.devis_id ? `/devis/${bon.devis_id}` : null,
          },
          { label: 'Bon de livraison', numero: bon.numero_bl || `BL #${bon.id}`, current: true },
          {
            label: 'Facture',
            numero: bon.facture_numero,
            to: bon.facture_id ? `/factures/${bon.facture_id}` : null,
          },
          {
            label: 'Avoir',
            numero: bon.numero_avoir ?? null,
            to: bon.avoir_id ? `/avoirs/${bon.avoir_id}` : null,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Détails</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <p><strong>Date:</strong> {bon.date_bl ? new Date(bon.date_bl).toLocaleDateString('fr-FR') : '-'}</p>
          <p className="flex items-center gap-2"><strong>Statut:</strong> {bon.statut ? <StatusBadge type="bl" statut={bon.statut} /> : '-'}</p>
          <p><strong>Devis:</strong> {bon.devis_numero || bon.devis_id || '-'}</p>
          <p><strong>Total:</strong> <span className="tabular-nums font-semibold">{formatXOF(bon.total)}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lignes du bon de livraison</CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(bon.lignes) && bon.lignes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Qté commandée</TableHead>
                  <TableHead>Qté livrée</TableHead>
                  <TableHead>Prix unitaire</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bon.lignes.map((ligne: any, idx: number) => {
                  const qteLivree = Number(ligne.quantite_livree || 0);
                  const pu = Number(ligne.prix_unitaire || 0);
                  const totalLigne = Number(ligne.total_ligne || qteLivree * pu);
                  return (
                    <TableRow key={idx}>
                      <TableCell>{ligne.produit_nom || ligne.description || ligne.produit_id}</TableCell>
                      <TableCell>{Number(ligne.quantite_commandee || 0)}</TableCell>
                      <TableCell>{qteLivree}</TableCell>
                      <TableCell>{formatXOF(pu)}</TableCell>
                      <TableCell>{formatXOF(totalLigne)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune ligne à afficher</p>
          )}
        </CardContent>
      </Card>

      <PrintPreview
        open={showPrint}
        onOpenChange={setShowPrint}
        format={printFormat}
        onFormatChange={setPrintFormat}
      >
        <DocumentPrint
          format={printFormat}
          docType="bl"
          numero={bon.numero_bl || `BL${String(bon.id).padStart(5, '0')}`}
          dateDoc={bon.date_bl}
          dateEcheance={bon.date_livraison_prevue || bon.date_livraison}
          vendeur={bon.cree_par_nom || 'Administrator'}
          clientNom={bon.client_nom}
          lignes={Array.isArray(bon.lignes) ? bon.lignes : []}
          hideTotals={false}
        />
      </PrintPreview>

      {/* Mark delivered Dialog */}
      <Dialog
        open={showDeliverDialog}
        onOpenChange={(open) => {
          if (!actionLoading) setShowDeliverDialog(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marquer comme livré</DialogTitle>
            <DialogDescription>
              Marquer ce bon de livraison comme livré ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeliverDialog(false)} disabled={actionLoading}>
              Annuler
            </Button>
            <Button onClick={handleMarkDelivered} disabled={actionLoading}>
              <Truck className="h-4 w-4 mr-2" />
              {actionLoading ? 'En cours…' : 'Marquer livré'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to facture Dialog */}
      <Dialog
        open={showConvertDialog}
        onOpenChange={(open) => {
          if (!actionLoading) setShowConvertDialog(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer la facture</DialogTitle>
            <DialogDescription>
              Créer la facture depuis ce bon de livraison ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)} disabled={actionLoading}>
              Annuler
            </Button>
            <Button onClick={handleConvert} disabled={actionLoading}>
              <FileCheck className="h-4 w-4 mr-2" />
              {actionLoading ? 'En cours…' : 'Créer facture'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
