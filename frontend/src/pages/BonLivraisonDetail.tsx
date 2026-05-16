import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, FileCheck, Truck } from 'lucide-react';
import { bonLivraisonService } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function BonLivraisonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [bon, setBon] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await bonLivraisonService.getById(Number(id));
        setBon(data?.data || data);
      } catch (error) {
        toast.error('Impossible de charger ce bon de livraison');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const canMarkDelivered = bon?.statut === 'valide' || bon?.statut === 'brouillon';
  const canConvert = bon?.statut === 'livre';

  const formatXOF = (amount: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(Number(amount || 0));

  const handleMarkDelivered = async () => {
    if (!bon?.id) return;
    if (!confirm('Marquer ce bon de livraison comme livré ?')) return;

    try {
      setActionLoading(true);
      await bonLivraisonService.updateStatut(Number(bon.id), 'livre');
      toast.success('Bon de livraison marqué comme livré');
      const refreshed = await bonLivraisonService.getById(Number(bon.id));
      setBon(refreshed?.data || refreshed);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur lors de la mise à jour du statut');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!bon?.id) return;
    if (!confirm('Créer la facture depuis ce bon de livraison ?')) return;

    try {
      setActionLoading(true);
      const result = await bonLivraisonService.convertToFacture(Number(bon.id));
      const factureId = result?.facture_id || result?.data?.facture_id;
      toast.success(`Facture ${result?.numero_facture || ''} créée`.trim());
      if (factureId) {
        navigate(`/factures/${factureId}`);
        return;
      }
      const refreshed = await bonLivraisonService.getById(Number(bon.id));
      setBon(refreshed?.data || refreshed);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur lors de la conversion en facture');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6">Chargement...</div>;
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
          {canMarkDelivered && (
            <Button onClick={handleMarkDelivered} disabled={actionLoading}>
              <Truck className="h-4 w-4 mr-2" />
              Marquer livré
            </Button>
          )}
          {canConvert && (
            <Button onClick={handleConvert} disabled={actionLoading}>
              <FileCheck className="h-4 w-4 mr-2" />
              Créer facture
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Détails</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <p><strong>Date:</strong> {bon.date_bl ? new Date(bon.date_bl).toLocaleDateString('fr-FR') : '-'}</p>
          <p><strong>Statut:</strong> {bon.statut || '-'}</p>
          <p><strong>Devis:</strong> {bon.devis_numero || bon.devis_id || '-'}</p>
          <p><strong>Total:</strong> {formatXOF(bon.total)}</p>
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
    </div>
  );
}
