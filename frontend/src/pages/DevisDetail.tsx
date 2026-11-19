import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileCheck, FilePlus, FileText, Printer, Truck } from 'lucide-react';
import { devisService } from '@/services/api';
import { formatDate, formatNumber, toNumber } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StatusBadge from '@/components/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { PageShell } from '@/components/ui/page-shell';
import type { PageHeaderMenuAction } from '@/components/ui/page-header';
import { QueryErrorState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DocumentTotals } from '@/components/ui/document-totals';
import { DocumentCode } from '@/components/ui/document-code';
import { Money } from '@/components/ui/money';
import { Tag } from '@/components/ui/tag';
import { DocumentPrint } from '@/components/ui/print-layout';
import { PrintPreview, usePrintFormat } from '@/components/ui/print-preview';
import { DocumentLifecycle } from '@/components/ui/document-lifecycle';
import { PageLoading } from '@/components/ui/loading';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/lib/AuthContext';
import { useRouteAccess } from '@/hooks/useRouteAccess';

interface DevisLigne {
  id?: number;
  produit_id?: number | null;
  produit_nom?: string | null;
  produit_reference?: string | null;
  description?: string | null;
  quantite: number | string;
  prix_unitaire: number | string;
  total_ligne?: number | string | null;
  is_depot_only_history?: boolean;
}

interface DevisDetailData {
  id: number;
  numero_devis?: string | null;
  statut: string;
  tiers_id?: number | null;
  client_nom?: string | null;
  client_prenom?: string | null;
  date_devis?: string | null;
  date_validite?: string | null;
  location_nom?: string | null;
  notes?: string | null;
  total?: number | string | null;
  cree_par_nom?: string | null;
  bl_id?: number | null;
  bl_numero?: string | null;
  facture_id?: number | null;
  facture_numero?: string | null;
  avoir_id?: number | null;
  numero_avoir?: string | null;
  lignes?: DevisLigne[];
}

/** Séparateur de la ligne d'en-tête : l'insécable garde « · » avec ce qui le précède, la ligne ne coupe qu'après. */
const SEP = '\u00A0· ';
/** Lien dans la ligne d'en-tête : souligné en permanence, le bleu seul se distingue mal du gris qui l'entoure (1,6:1). */
const HEADER_LINK_CLASS =
  'rounded-sm text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const isEditable = (statut: string) => statut === 'brouillon' || statut === 'envoye';
const isDeletable = (statut: string) => ['brouillon', 'envoye', 'refuse', 'annule'].includes(statut);

const quantiteOf = (l: DevisLigne) => toNumber(l.quantite) ?? 0;
const totalLigne = (l: DevisLigne) => toNumber(l.total_ligne) ?? quantiteOf(l) * (toNumber(l.prix_unitaire) ?? 0);

export default function DevisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canOpen = useRouteAccess();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [devis, setDevis] = useState<DevisDetailData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [printFormat, setPrintFormat] = usePrintFormat();

  const fetchDevis = useCallback(async (): Promise<DevisDetailData | null> => {
    const data = (await devisService.getById(Number(id))) as DevisDetailData | { data?: DevisDetailData } | null;
    if (data && 'data' in data && data.data) return data.data;
    return (data as DevisDetailData | null) ?? null;
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDevis(await fetchDevis());
    } catch (err) {
      setDevis(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, fetchDevis]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatut = async (statut: 'accepte' | 'refuse' | 'annule', success: (d: DevisDetailData | null) => void) => {
    if (!devis) return;
    setActionLoading(true);
    try {
      await devisService.updateStatut(devis.id, statut);
      const refreshed = await fetchDevis().catch(() => null);
      if (refreshed) setDevis(refreshed);
      else await load();
      success(refreshed);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de mettre à jour le devis. Réessayez.'));
    } finally {
      setActionLoading(false);
    }
  };

  const numero = devis?.numero_devis || (devis ? `n° ${devis.id}` : '');
  const clientNom = devis ? `${devis.client_nom ?? ''} ${devis.client_prenom ?? ''}`.trim() || '—' : '—';

  const handleConfirm = async () => {
    if (!devis) return;
    const ok = await confirm({
      title: `Confirmer le devis ${numero} ?`,
      description: `Un bon de livraison sera créé pour ${clientNom} et le devis ne pourra plus être modifié.`,
      confirmLabel: 'Confirmer le devis',
    });
    if (!ok) return;
    await changeStatut('accepte', (refreshed) => {
      const blId = refreshed?.bl_id;
      toast.success(
        refreshed?.bl_numero
          ? `Devis ${numero} confirmé : bon de livraison ${refreshed.bl_numero} créé`
          : `Devis ${numero} confirmé : bon de livraison créé`,
        blId
          ? { action: { label: 'Ouvrir le bon de livraison', onClick: () => navigate(`/bons-livraison/${blId}`) } }
          : undefined
      );
    });
  };

  const handleRefuse = async () => {
    if (!devis) return;
    const ok = await confirm({
      title: `Le client a refusé le devis ${numero} ?`,
      description: 'Le devis passera au statut Refusé et ne pourra plus être confirmé ni modifié.',
      confirmLabel: 'Marquer comme refusé',
    });
    if (!ok) return;
    await changeStatut('refuse', () => toast.success(`Devis ${numero} marqué comme refusé`));
  };

  const handleCancel = async () => {
    if (!devis) return;
    const ok = await confirm({
      title: `Annuler le devis ${numero} ?`,
      description: 'Le devis passera au statut Annulé et ne pourra plus être confirmé ni modifié. Aucun stock n’est concerné.',
      confirmLabel: 'Annuler le devis',
      cancelLabel: 'Garder le devis',
      destructive: true,
    });
    if (!ok) return;
    await changeStatut('annule', () => toast.success(`Devis ${numero} annulé`));
  };

  const handleDelete = async () => {
    if (!devis) return;
    const ok = await confirm({
      title: `Supprimer le devis ${numero} ?`,
      description: 'Le devis sera supprimé définitivement. Aucun stock ni paiement n’est concerné.',
      confirmLabel: 'Supprimer le devis',
      destructive: true,
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await devisService.delete(devis.id);
      toast.success(`Devis ${numero} supprimé`);
      navigate('/devis');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer le devis. Réessayez.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !devis) {
    return (
      <PageShell title="Devis" backTo="/devis" width="wide">
        <PageLoading message="Chargement du devis…" />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Devis" backTo="/devis" width="wide">
        <Card>
          <QueryErrorState error={error} title="Impossible de charger le devis" onRetry={() => void load()} />
        </Card>
      </PageShell>
    );
  }

  if (!devis) {
    return (
      <PageShell title="Devis introuvable" backTo="/devis" width="wide">
        <Card>
          <EmptyState
            icon={FilePlus}
            title="Devis introuvable"
            description="Il a peut-être été supprimé"
            action={
              <Link to="/devis" className={buttonVariants({ variant: 'outline' })}>
                Retour aux devis
              </Link>
            }
          />
        </Card>
      </PageShell>
    );
  }

  const lignes = Array.isArray(devis.lignes) ? devis.lignes : [];
  const total = lignes.length > 0 ? lignes.reduce((sum, l) => sum + totalLigne(l), 0) : toNumber(devis.total) ?? 0;
  const editable = isEditable(devis.statut);

  // Client, date, validité et emplacement tiennent sur la ligne d'en-tête :
  // plus de carte « Informations » qui la répétait.
  const headerLine = (
    <>
      {devis.tiers_id && canOpen(`/tiers/${devis.tiers_id}`) ? (
        <Link to={`/tiers/${devis.tiers_id}`} className={HEADER_LINK_CLASS}>
          {clientNom}
        </Link>
      ) : (
        clientNom
      )}
      {SEP}
      <span className="whitespace-nowrap">{formatDate(devis.date_devis)}</span>
      {devis.date_validite && (
        <>
          {SEP}
          <span className="whitespace-nowrap">valable jusqu’au {formatDate(devis.date_validite)}</span>
        </>
      )}
      {devis.location_nom && (
        <>
          {SEP}
          <span className="sr-only">Emplacement{'\u00A0'}: </span>
          {devis.location_nom}
        </>
      )}
    </>
  );

  // Une seule action principale : confirmer tant que c'est possible, puis
  // ouvrir le document suivant de la chaîne (U-25).
  let primaryAction: ReactNode = undefined;
  if (editable) {
    primaryAction = (
      <Button size="touch" onClick={() => void handleConfirm()} disabled={actionLoading} className="gap-2">
        <FileCheck className="h-4 w-4" aria-hidden="true" />
        Confirmer le devis
      </Button>
    );
  } else if (devis.facture_id && canOpen(`/factures/${devis.facture_id}`)) {
    // Devis facturé : plus rien à faire ici, le lien vers la facture n'est pas
    // une action à mettre en avant (bouton encadré, comme sur le bon de livraison).
    primaryAction = (
      <Link
        to={`/factures/${devis.facture_id}`}
        className={buttonVariants({ variant: 'outline', size: 'touch', className: 'gap-2' })}
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        Ouvrir la facture
      </Link>
    );
  } else if (devis.bl_id && canOpen(`/bons-livraison/${devis.bl_id}`)) {
    primaryAction = (
      <Link to={`/bons-livraison/${devis.bl_id}`} className={buttonVariants({ size: 'touch', className: 'gap-2' })}>
        <Truck className="h-4 w-4" aria-hidden="true" />
        Ouvrir le bon de livraison
      </Link>
    );
  }

  const downloadPdf = async () => {
    try {
      await devisService.downloadPdf(devis.id, devis.numero_devis || undefined);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de télécharger le PDF du devis. Réessayez.'));
    }
  };

  const moreActions: Array<PageHeaderMenuAction | false> = [
    editable && { label: 'Modifier le devis', to: `/devis/${devis.id}/edit` },
    { label: 'Télécharger le PDF', icon: Download, onSelect: () => void downloadPdf() },
    editable && { label: 'Marquer comme refusé par le client', onSelect: () => void handleRefuse(), disabled: actionLoading },
    editable && { label: 'Annuler le devis', destructive: true, onSelect: () => void handleCancel(), disabled: actionLoading },
    isAdmin &&
      isDeletable(devis.statut) && {
        label: 'Supprimer le devis',
        destructive: true,
        onSelect: () => void handleDelete(),
        disabled: actionLoading,
      },
  ];

  const table = (
    <Table aria-label={`Produits du devis ${numero}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Produit</TableHead>
          <TableHead numeric>Quantité</TableHead>
          <TableHead numeric>Prix unitaire</TableHead>
          <TableHead numeric>Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lignes.map((ligne, idx) => (
          <TableRow key={ligne.id ?? idx}>
            <TableCell className="font-medium">
              {ligne.produit_nom || ligne.description || `Produit n° ${ligne.produit_id ?? '—'}`}
              {ligne.produit_reference && (
                <DocumentCode className="block text-xs font-normal text-muted-foreground">
                  {ligne.produit_reference}
                </DocumentCode>
              )}
              {ligne.is_depot_only_history && (
                <Tag className="mt-1" title="Ce produit n’a plus de stock en magasin : il était disponible au dépôt lors du devis.">
                  Stock du dépôt
                </Tag>
              )}
            </TableCell>
            <TableCell numeric>{formatNumber(quantiteOf(ligne))}</TableCell>
            <TableCell numeric>
              <Money value={ligne.prix_unitaire} />
            </TableCell>
            <TableCell numeric className="font-medium">
              <Money value={totalLigne(ligne)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const cards = lignes.map((ligne, idx) => (
    <DataCard
      key={ligne.id ?? idx}
      title={ligne.produit_nom || ligne.description || `Produit n° ${ligne.produit_id ?? '—'}`}
      wrapTitle
      titleAs="h3"
    >
      {ligne.produit_reference && (
        <DataCardRow label="Référence" value={<DocumentCode>{ligne.produit_reference}</DocumentCode>} />
      )}
      <DataCardRow label="Quantité" value={formatNumber(quantiteOf(ligne))} numeric />
      <DataCardRow label="Prix unitaire" value={<Money value={ligne.prix_unitaire} />} numeric />
      <DataCardRow label="Total" value={<Money value={totalLigne(ligne)} className="font-medium" />} numeric />
    </DataCard>
  ));

  return (
    <PageShell
      title={`Devis ${numero}`}
      backTo="/devis"
      width="wide"
      meta={<StatusBadge type="devis" statut={devis.statut} size="md" />}
      description={headerLine}
      actions={
        <Button variant="outline" size="touch" onClick={() => setShowPrint(true)} className="gap-2">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimer
        </Button>
      }
      primaryAction={primaryAction}
      moreActions={moreActions}
    >
      <DocumentLifecycle
        steps={[
          { label: 'Devis', numero, current: true },
          {
            label: 'Bon de livraison',
            numero: devis.bl_numero ?? null,
            to: devis.bl_id ? `/bons-livraison/${devis.bl_id}` : null,
          },
          {
            label: 'Facture',
            numero: devis.facture_numero ?? null,
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
          <CardTitle>Produits</CardTitle>
          <CardDescription>
            {lignes.length} {lignes.length > 1 ? 'produits' : 'produit'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <EmptyState compact icon={FilePlus} title="Ce devis ne contient aucun produit" />
          ) : (
            <ResponsiveTable table={table} cards={cards} />
          )}
          <DocumentTotals aria-label="Total du devis" total={{ label: 'Total', value: total }} />
        </CardContent>
      </Card>

      {devis.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{devis.notes}</p>
          </CardContent>
        </Card>
      )}

      <PrintPreview open={showPrint} onOpenChange={setShowPrint} format={printFormat} onFormatChange={setPrintFormat}>
        <DocumentPrint
          format={printFormat}
          docType="devis"
          numero={devis.numero_devis || `S${String(devis.id).padStart(5, '0')}`}
          dateDoc={devis.date_devis}
          dateEcheance={devis.date_validite}
          vendeur={devis.cree_par_nom ?? undefined}
          clientNom={devis.client_nom ?? undefined}
          clientPrenom={devis.client_prenom ?? undefined}
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
