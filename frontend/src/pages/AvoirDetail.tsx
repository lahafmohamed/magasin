import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { creditNoteService } from '../services/api';
import { AvoirComplete } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/StatusBadge';
import { DocumentPrint } from '@/components/ui/print-layout';
import { formatXOF, formatDate } from '@/utils/format';
import { ArrowLeft, FileText, User, Calendar, Printer } from 'lucide-react';
import { toast } from 'sonner';

export default function AvoirDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [avoir, setAvoir] = useState<AvoirComplete | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPrintLayout, setShowPrintLayout] = useState(false);

  useEffect(() => {
    loadAvoir();
  }, [id]);

  const loadAvoir = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await creditNoteService.getById(parseInt(id));
      setAvoir(data);
    } catch (error) {
      toast.error('Erreur lors du chargement de l\'avoir');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Chargement de l'avoir...</p>
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
              <span className="font-mono font-semibold">{avoir.numero_avoir}</span>
            </div>
            {avoir.facture_origine_numero && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Facture d'origine:</span>
                <span className="font-mono font-semibold">{avoir.facture_origine_numero}</span>
              </div>
            )}
            {avoir.numero_retour && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Retour:</span>
                <span className="font-mono font-semibold">{avoir.numero_retour}</span>
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
                    <TableCell className="font-mono">{ligne.produit_reference || '-'}</TableCell>
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

      {showPrintLayout && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto print:bg-white print:p-0 print:static print:overflow-visible">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8 print:max-w-none print:w-full print:my-0 print:shadow-none print:rounded-none">
            <div className="sticky top-0 z-10 bg-white border-b p-4 flex justify-between items-center print:hidden">
              <h2 className="text-lg font-semibold">Aperçu d'impression</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowPrintLayout(false)}>Fermer</Button>
                <Button onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimer
                </Button>
              </div>
            </div>
            <DocumentPrint
              docType="avoir"
              numero={avoir.numero_avoir || `AV${String(avoir.id).padStart(5, '0')}`}
              dateDoc={avoir.date_avoir}
              clientNom={avoir.client_nom}
              clientPrenom={(avoir as any).client_prenom}
              lignes={lignes as any}
            />
          </div>
        </div>
      )}
    </div>
  );
}
