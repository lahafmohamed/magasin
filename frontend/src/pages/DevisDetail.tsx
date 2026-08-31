import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, FileCheck, Trash2, Printer, Download, Pencil, RefreshCw } from 'lucide-react';
import { devisService } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
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

export default function DevisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [devis, setDevis] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [printFormat, setPrintFormat] = usePrintFormat();
  const canConfirm = (statut: string) => ['brouillon', 'envoye'].includes(statut);
  const downloadPDF = () => {
    setShowPrint(true);
    setTimeout(() => window.print(), 300);
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await devisService.getById(Number(id));
      setDevis(data?.data || data);
    } catch (err) {
      setDevis(null);
      setError(err);
      toast.error(getErrorMessage(err, 'Impossible de charger ce devis'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(() => {
    if (!devis?.lignes || !Array.isArray(devis.lignes)) return devis?.total || 0;
    return devis.lignes.reduce(
      (sum: number, l: any) => sum + Number(l.quantite || 0) * Number(l.prix_unitaire || 0),
      0
    );
  }, [devis]);

  const handleConfirm = async () => {
    if (!devis?.id) return;

    try {
      setActionLoading(true);
      await devisService.updateStatut(Number(devis.id), 'accepte');
      toast.success('Devis confirmé et bon de livraison généré');
      setShowConfirmDialog(false);
      const refreshed = await devisService.getById(Number(devis.id));
      setDevis(refreshed?.data || refreshed);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la confirmation'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!devis?.id) return;

    try {
      setActionLoading(true);
      await devisService.delete(Number(devis.id));
      toast.success('Devis supprimé');
      navigate('/devis');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la suppression'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <PageLoading message="Chargement du devis…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center" role="alert">
        <AlertCircle className="h-12 w-12 text-destructive opacity-80" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Échec du chargement</h2>
          <p className="text-muted-foreground">{getErrorMessage(error, 'Impossible de charger ce devis')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/devis')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux devis
          </Button>
          <Button onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (!devis) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" onClick={() => navigate('/devis')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux devis
        </Button>
        <Card>
          <CardContent className="pt-6">Devis introuvable</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/devis')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{devis.numero_devis || `Devis #${devis.id}`}</h1>
          <p className="text-muted-foreground">Client: {devis.client_nom || devis.tiers_id || '-'}</p>
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
          {canConfirm(devis.statut) && (
            <Button variant="outline" onClick={() => navigate(`/devis/${devis.id}/edit`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          )}
          {canConfirm(devis.statut) && (
            <Button onClick={() => setShowConfirmDialog(true)} disabled={actionLoading}>
              <FileCheck className="h-4 w-4 mr-2" />
              Confirmer
            </Button>
          )}
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)} disabled={actionLoading}>
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </Button>
        </div>
      </div>

      <DocumentLifecycle
        steps={[
          { label: 'Devis', numero: devis.numero_devis || `Devis #${devis.id}`, current: true },
          {
            label: 'Bon de livraison',
            numero: devis.bl_numero,
            to: devis.bl_id ? `/bons-livraison/${devis.bl_id}` : null,
          },
          {
            label: 'Facture',
            numero: devis.facture_numero,
            to: devis.facture_id ? `/factures/${devis.facture_id}` : null,
          },
          {
            label: 'Avoir',
            numero: devis.numero_avoir ?? null,
            to: devis.avoir_id ? `/avoirs/${devis.avoir_id}` : null,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Détails</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <p><strong>Date:</strong> {devis.date_devis ? new Date(devis.date_devis).toLocaleDateString('fr-FR') : '-'}</p>
          <p><strong>Validité:</strong> {devis.date_validite ? new Date(devis.date_validite).toLocaleDateString('fr-FR') : '-'}</p>
          <p className="flex items-center gap-2"><strong>Statut:</strong> {devis.statut ? <StatusBadge type="devis" statut={devis.statut} /> : '-'}</p>
          <p><strong>Total:</strong> <span className="tabular-nums font-semibold">{formatCurrency(Number(total || 0))}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lignes du devis</CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(devis.lignes) && devis.lignes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Qté</TableHead>
                  <TableHead>Prix unitaire</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devis.lignes.map((ligne: any, idx: number) => {
                  const qte = Number(ligne.quantite || 0);
                  const pu = Number(ligne.prix_unitaire || 0);
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        {ligne.produit_nom || ligne.produit_id}
                        {(ligne as any).is_depot_only_history && (
                          <span
                            className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                            title="Cet article n'a plus de stock magasin — il était disponible en dépôt au moment de la création"
                          >
                            stock dépôt (historique)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{qte}</TableCell>
                      <TableCell>{formatCurrency(pu)}</TableCell>
                      <TableCell>{formatCurrency(qte * pu)}</TableCell>
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
          docType="devis"
          numero={devis.numero_devis || `S${String(devis.id).padStart(5, '0')}`}
          dateDoc={devis.date_devis}
          dateEcheance={devis.date_validite}
          vendeur={devis.cree_par_nom || 'Administrator'}
          clientNom={devis.client_nom}
          lignes={Array.isArray(devis.lignes) ? devis.lignes : []}
        />
      </PrintPreview>

      {/* Confirm devis Dialog */}
      <Dialog
        open={showConfirmDialog}
        onOpenChange={(open) => {
          if (!actionLoading) setShowConfirmDialog(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer le devis</DialogTitle>
            <DialogDescription>
              Confirmer ce devis ? Cela générera automatiquement un bon de livraison.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={actionLoading}>
              Annuler
            </Button>
            <Button onClick={handleConfirm} disabled={actionLoading}>
              <FileCheck className="h-4 w-4 mr-2" />
              {actionLoading ? 'En cours…' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete devis Dialog */}
      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!actionLoading) setShowDeleteDialog(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer le devis</DialogTitle>
            <DialogDescription>
              Supprimer ce devis ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={actionLoading}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={actionLoading}>
              <Trash2 className="h-4 w-4 mr-2" />
              {actionLoading ? 'Suppression…' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
