import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileCheck, FileText, Printer, Truck } from 'lucide-react';
import { bonLivraisonService } from '@/services/api';
import { formatCurrency, formatDate, formatNumber, toNumber } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StatusBadge from '@/components/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { PageShell } from '@/components/ui/page-shell';
import { QueryErrorState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DocumentTotals } from '@/components/ui/document-totals';
import { DocumentCode } from '@/components/ui/document-code';
import { Money } from '@/components/ui/money';
import { DocumentPrint } from '@/components/ui/print-layout';
import { PrintPreview, usePrintFormat } from '@/components/ui/print-preview';
import { DocumentLifecycle } from '@/components/ui/document-lifecycle';
import { PageLoading } from '@/components/ui/loading';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRouteAccess } from '@/hooks/useRouteAccess';

interface BonLigne {
  id?: number;
  produit_id?: number | null;
  produit_nom?: string | null;
  produit_reference?: string | null;
  description?: string | null;
  /** Quantité commandée : colonne `quantite` de `document_lignes`. */
  quantite?: number | string | null;
  /** Ancien alias, absent des lignes actuelles. */
  quantite_commandee?: number | string | null;
  quantite_livree?: number | string | null;
  prix_unitaire: number | string;
  total_ligne?: number | string | null;
}

interface BonDetailData {
  id: number;
  numero_bl?: string | null;
  statut: string;
  tiers_id?: number | null;
  client_nom?: string | null;
  client_prenom?: string | null;
  date_bl?: string | null;
  date_livraison_prevue?: string | null;
  date_livraison?: string | null;
  location_nom?: string | null;
  devis_id?: number | null;
  devis_numero?: string | null;
  facture_id?: number | null;
  facture_numero?: string | null;
  avoir_id?: number | null;
  numero_avoir?: string | null;
  notes?: string | null;
  total?: number | string | null;
  cree_par_nom?: string | null;
  lignes?: BonLigne[];
}

interface ConversionResult {
  facture_id?: number;
  numero_facture?: string;
  data?: { facture_id?: number; numero_facture?: string };
}

/** Séparateur de la ligne d'en-tête : l'insécable garde « · » avec ce qui le précède, la ligne ne coupe qu'après. */
const SEP = '\u00A0· ';
/** Lien dans la ligne d'en-tête : souligné en permanence, le bleu seul se distingue mal du gris qui l'entoure (1,6:1). */
const HEADER_LINK_CLASS =
  'rounded-sm text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** U-46 : la quantité commandée vient de `quantite` (« 0 » s'affichait sur chaque ligne). */
const qteCommandee = (l: BonLigne) => toNumber(l.quantite_commandee) ?? toNumber(l.quantite) ?? 0;
const qteLivree = (l: BonLigne) => toNumber(l.quantite_livree) ?? 0;
/** Ce qui sort du stock à la livraison : la quantité livrée, à défaut la quantité commandée (BonLivraisonService). */
const qteSortie = (l: BonLigne) => qteLivree(l) || qteCommandee(l);
const totalLigne = (l: BonLigne) => toNumber(l.total_ligne) ?? qteSortie(l) * (toNumber(l.prix_unitaire) ?? 0);

export default function BonLivraisonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const canOpen = useRouteAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [bon, setBon] = useState<BonDetailData | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [printFormat, setPrintFormat] = usePrintFormat();

  const fetchBon = useCallback(async (): Promise<BonDetailData | null> => {
    const data = (await bonLivraisonService.getById(Number(id))) as BonDetailData | { data?: BonDetailData } | null;
    if (data && 'data' in data && data.data) return data.data;
    return (data as BonDetailData | null) ?? null;
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setBon(await fetchBon());
    } catch (err) {
      setBon(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, fetchBon]);

  useEffect(() => {
    void load();
  }, [load]);

  const numero = bon?.numero_bl || (bon ? `n° ${bon.id}` : '');
  const clientNom = bon ? `${bon.client_nom ?? ''} ${bon.client_prenom ?? ''}`.trim() || '—' : '—';
  const lignes = Array.isArray(bon?.lignes) ? bon.lignes : [];

  const handleMarkDelivered = async () => {
    if (!bon) return;
    const unites = lignes.reduce((sum, l) => sum + (l.produit_id ? qteSortie(l) : 0), 0);
    const emplacement = bon.location_nom ? `du stock de ${bon.location_nom}` : 'du stock du magasin';
    const ok = await confirm({
      title: `Marquer le bon de livraison ${numero} comme livré ?`,
      description: `${formatNumber(unites)} ${unites > 1 ? 'unités sortiront' : 'unité sortira'} ${emplacement}. Faites-le une fois la marchandise remise au client.`,
      confirmLabel: 'Marquer comme livré',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await bonLivraisonService.updateStatut(bon.id, 'livre');
      toast.success(`Bon de livraison ${numero} livré : stock mis à jour`);
      const refreshed = await fetchBon().catch(() => null);
      if (refreshed) setBon(refreshed);
      else await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de marquer le bon de livraison comme livré. Réessayez.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!bon) return;
    const ok = await confirm({
      title: `Facturer le bon de livraison ${numero} ?`,
      description: `Une facture de ${formatCurrency(bon.total)} sera créée pour ${clientNom}. Ce montant deviendra dû.`,
      confirmLabel: 'Créer la facture',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      const result = (await bonLivraisonService.convertToFacture(bon.id)) as ConversionResult | null;
      const factureId = result?.facture_id ?? result?.data?.facture_id;
      const numeroFacture = result?.numero_facture ?? result?.data?.numero_facture;
      toast.success(numeroFacture ? `Facture ${numeroFacture} créée` : 'Facture créée');
      if (factureId) {
        navigate(`/factures/${factureId}`);
        return;
      }
      const refreshed = await fetchBon().catch(() => null);
      if (refreshed) setBon(refreshed);
      else await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de créer la facture. Réessayez.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !bon) {
    return (
      <PageShell title="Bon de livraison" backTo="/bons-livraison" width="wide">
        <PageLoading message="Chargement du bon de livraison…" />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Bon de livraison" backTo="/bons-livraison" width="wide">
        <Card>
          <QueryErrorState error={error} title="Impossible de charger le bon de livraison" onRetry={() => void load()} />
        </Card>
      </PageShell>
    );
  }

  if (!bon) {
    return (
      <PageShell title="Bon de livraison introuvable" backTo="/bons-livraison" width="wide">
        <Card>
          <EmptyState
            icon={FileCheck}
            title="Bon de livraison introuvable"
            description="Il a peut-être été supprimé"
            action={
              <Link to="/bons-livraison" className={buttonVariants({ variant: 'outline' })}>
                Retour aux bons de livraison
              </Link>
            }
          />
        </Card>
      </PageShell>
    );
  }

  const canMarkDelivered = bon.statut === 'valide' || bon.statut === 'brouillon';
  const canConvert = bon.statut === 'livre';

  // Client, date, livraison prévue et emplacement tiennent sur la ligne
  // d'en-tête : plus de carte « Informations » qui la répétait.
  const headerLine = (
    <>
      {bon.tiers_id && canOpen(`/tiers/${bon.tiers_id}`) ? (
        <Link to={`/tiers/${bon.tiers_id}`} className={HEADER_LINK_CLASS}>
          {clientNom}
        </Link>
      ) : (
        clientNom
      )}
      {SEP}
      <span className="whitespace-nowrap">{formatDate(bon.date_bl)}</span>
      {bon.date_livraison_prevue && (
        <>
          {SEP}
          <span className="whitespace-nowrap">livraison prévue le {formatDate(bon.date_livraison_prevue)}</span>
        </>
      )}
      {bon.location_nom && (
        <>
          {SEP}
          <span className="sr-only">Emplacement{'\u00A0'}: </span>
          {bon.location_nom}
        </>
      )}
    </>
  );

  let primaryAction: ReactNode = undefined;
  if (canMarkDelivered) {
    primaryAction = (
      <Button size="touch" onClick={() => void handleMarkDelivered()} disabled={actionLoading} className="gap-2">
        <Truck className="h-4 w-4" aria-hidden="true" />
        Marquer comme livré
      </Button>
    );
  } else if (canConvert) {
    primaryAction = (
      <Button size="touch" onClick={() => void handleConvert()} disabled={actionLoading} className="gap-2">
        <FileCheck className="h-4 w-4" aria-hidden="true" />
        Créer la facture
      </Button>
    );
  } else if (bon.facture_id && canOpen(`/factures/${bon.facture_id}`)) {
    // Bon facturé : plus rien à faire ici, le lien vers la facture n'est pas
    // une action à mettre en avant (bouton encadré, pas l'aplat bleu).
    primaryAction = (
      <Link
        to={`/factures/${bon.facture_id}`}
        className={buttonVariants({ variant: 'outline', size: 'touch', className: 'gap-2' })}
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        Ouvrir la facture
      </Link>
    );
  }

  const table = (
    <Table aria-label={`Produits du bon de livraison ${numero}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Produit</TableHead>
          <TableHead numeric>Qté commandée</TableHead>
          <TableHead numeric>Qté livrée</TableHead>
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
            </TableCell>
            <TableCell numeric>{formatNumber(qteCommandee(ligne))}</TableCell>
            <TableCell numeric>{formatNumber(qteLivree(ligne))}</TableCell>
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
      <DataCardRow label="Qté commandée" value={formatNumber(qteCommandee(ligne))} numeric />
      <DataCardRow label="Qté livrée" value={formatNumber(qteLivree(ligne))} numeric />
      <DataCardRow label="Prix unitaire" value={<Money value={ligne.prix_unitaire} />} numeric />
      <DataCardRow label="Total" value={<Money value={totalLigne(ligne)} className="font-medium" />} numeric />
    </DataCard>
  ));

  const downloadPdf = async () => {
    try {
      await bonLivraisonService.downloadPdf(bon.id, bon.numero_bl || undefined);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de télécharger le PDF du bon de livraison. Réessayez.'));
    }
  };

  return (
    <PageShell
      title={`Bon de livraison ${numero}`}
      backTo="/bons-livraison"
      width="wide"
      meta={<StatusBadge type="bl" statut={bon.statut} size="md" />}
      description={headerLine}
      actions={
        <Button variant="outline" size="touch" onClick={() => setShowPrint(true)} className="gap-2">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimer
        </Button>
      }
      primaryAction={primaryAction}
      moreActions={[{ label: 'Télécharger le PDF', icon: Download, onSelect: () => void downloadPdf() }]}
    >
      <DocumentLifecycle
        steps={[
          {
            label: 'Devis',
            numero: bon.devis_numero ?? null,
            to: bon.devis_id ? `/devis/${bon.devis_id}` : null,
          },
          { label: 'Bon de livraison', numero, current: true },
          {
            label: 'Facture',
            numero: bon.facture_numero ?? null,
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
          <CardTitle>Produits</CardTitle>
          <CardDescription>
            {lignes.length} {lignes.length > 1 ? 'produits' : 'produit'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <EmptyState compact icon={FileCheck} title="Ce bon de livraison ne contient aucun produit" />
          ) : (
            <ResponsiveTable table={table} cards={cards} />
          )}
          <DocumentTotals
            aria-label="Total du bon de livraison"
            total={{ label: 'Total', value: bon.total }}
          />
        </CardContent>
      </Card>

      {bon.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{bon.notes}</p>
          </CardContent>
        </Card>
      )}

      <PrintPreview open={showPrint} onOpenChange={setShowPrint} format={printFormat} onFormatChange={setPrintFormat}>
        <DocumentPrint
          format={printFormat}
          docType="bl"
          numero={bon.numero_bl || `BL${String(bon.id).padStart(5, '0')}`}
          dateDoc={bon.date_bl}
          dateEcheance={bon.date_livraison_prevue || bon.date_livraison}
          vendeur={bon.cree_par_nom ?? undefined}
          clientNom={bon.client_nom ?? undefined}
          clientPrenom={bon.client_prenom ?? undefined}
          lignes={lignes.map((l) => ({
            produit_nom: l.produit_nom ?? undefined,
            produit_reference: l.produit_reference ?? undefined,
            description: l.description ?? undefined,
            quantite: qteCommandee(l),
            quantite_livree: l.quantite_livree ?? undefined,
            prix_unitaire: l.prix_unitaire,
          }))}
        />
      </PrintPreview>
    </PageShell>
  );
}
