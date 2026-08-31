import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { creditNoteService } from '../services/api';
import { AvoirComplete } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/StatusBadge';
import { DocumentPrint } from '@/components/ui/print-layout';
import { PrintPreview, usePrintFormat } from '@/components/ui/print-preview';
import { DocumentLifecycle } from '@/components/ui/document-lifecycle';
import { PageLoading } from '@/components/ui/loading';
import { formatXOF, formatDate } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { AlertCircle, ArrowLeft, FileText, User, Calendar, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function AvoirDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [avoir, setAvoir] = useState<AvoirComplete | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showPrintLayout, setShowPrintLayout] = useState(false);
  const [printFormat, setPrintFormat] = usePrintFormat();

  const loadAvoir = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await creditNoteService.getById(parseInt(id));
      setAvoir(data);
    } catch (err) {
      setAvoir(null);
      setError(err);
      toast.error(getErrorMessage(err, "Erreur lors du chargement de l'avoir"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAvoir();
  }, [loadAvoir]);

  if (loading) {
    return <PageLoading message="Chargement de l'avoir…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center" role="alert">
        <AlertCircle className="h-12 w-12 text-destructive opacity-80" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Échec du chargement</h2>
          <p className="text-muted-foreground">{getErrorMessage(error, "Erreur lors du chargement de l'avoir")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/avoirs')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux avoirs
          </Button>
          <Button onClick={loadAvoir} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (!avoir) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <FileText className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold">Avoir non trouvé</h2>
        <Button onClick={() => navigate('/avoirs')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux avoirs
        </Button>
      </div>
    );
  }

  const total = parseFloat(avoir.total as any) || 0;
  const lignes = avoir.lignes || [];

  return (
    <div className="p-3 sm:p-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/avoirs')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-8 w-8" />
              Avoir {avoir.numero_avoir}
            </h1>
            <p className="text-muted-foreground mt-1">Détails de l'avoir</p>
          </div>
        </div>
        <div className="flex gap-2">
          <StatusBadge type="avoir" statut={avoir.statut} />
          <Button variant="outline" onClick={() => setShowPrintLayout(true)} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimer
          </Button>
        </div>
      </div>

      {/* Document lifecycle strip */}
      <DocumentLifecycle
        steps={[
          { label: 'Devis', numero: null },
          { label: 'Bon de livraison', numero: null },
          {
            label: 'Facture',
            numero: avoir.facture_origine_numero,
            to: avoir.facture_origine_id ? `/factures/${avoir.facture_origine_id}` : null,
          },
          { label: 'Avoir', numero: avoir.numero_avoir || `Avoir #${avoir.id}`, current: true },
        ]}
      />

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-semibold text-lg">{avoir.client_nom} {avoir.client_prenom}</p>
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
              <span className="text-muted-foreground">Date:</span>
              <span className="font-semibold">{formatDate(avoir.date_avoir)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">N° Avoir:</span>
              <span className="font-mono break-words font-semibold">{avoir.numero_avoir}</span>
            </div>
            {avoir.facture_origine_numero && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Facture d'origine:</span>
                <span className="font-mono break-words font-semibold">{avoir.facture_origine_numero}</span>
              </div>
            )}
            {avoir.numero_retour && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Retour:</span>
                <span className="font-mono break-words font-semibold">{avoir.numero_retour}</span>
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
                    <TableCell className="font-mono break-words">{ligne.produit_reference || '-'}</TableCell>
                    <TableCell className="font-semibold">{ligne.produit_nom || ligne.description || 'Article'}</TableCell>
                    <TableCell className="text-right">{quantite}</TableCell>
                    <TableCell className="text-right">{formatXOF(prixUnitaire)}</TableCell>
                    <TableCell className="text-right font-bold">{formatXOF(totalLigne)}</TableCell>
                  </TableRow>
                );
              })}
              {lignes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Aucune ligne
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="pt-6">
          <div className="flex justify-between text-2xl font-bold">
            <span>Total</span>
            <span>{formatXOF(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {avoir.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{avoir.notes}</p>
          </CardContent>
        </Card>
      )}

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
          clientPrenom={(avoir as any).client_prenom}
          lignes={lignes as any}
        />
      </PrintPreview>
    </div>
  );
}
