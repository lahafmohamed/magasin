import { Link, useNavigate } from 'react-router-dom';
import { Download, FileCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { type StatTile } from '@/components/ui/stats-bar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { bonLivraisonService } from '@/services/api';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/utils/csv';
import { getErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate, formatDateNumeric, formatNumber, toNumber } from '@/utils/format';
import {
  DocumentListPage,
  useDocumentList,
  type DocumentColumn,
} from '@/components/DocumentListPage';

interface BonLivraison {
  id: number;
  numero_bl: string;
  tiers_id: number;
  client_id?: number;
  client_nom: string;
  client_prenom?: string | null;
  date_bl: string;
  statut: string;
  total: number | string;
  notes: string | null;
}

interface BonLivraisonStats {
  total: { count: number; montant: number };
  a_facturer: { count: number };
  mois: { count: number; montant: number };
}

interface ConversionResult {
  facture_id?: number;
  numero_facture?: string;
  data?: { facture_id?: number; numero_facture?: string };
}

const STATUS_CHIPS = [{ value: 'all', label: 'Tous' }, ...getStatusOptions('bl')];
const CSV_HEADERS = ['N° de BL', 'Client', 'Date', 'Total', 'Statut'];

const clientOf = (b: BonLivraison) => `${b.client_nom || ''} ${b.client_prenom || ''}`.trim();

const csvRow = (b: BonLivraison) => [
  b.numero_bl,
  clientOf(b),
  formatDateNumeric(b.date_bl),
  toNumber(b.total) ?? 0,
  getStatusLabel('bl', b.statut),
];

export default function BonsLivraison() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const list = useDocumentList<BonLivraison, BonLivraisonStats>({
    defaultSortKey: 'date_bl',
    fetchList: (search, statut, page, limit, sortKey, sortDir) =>
      bonLivraisonService.getAll(search, statut, page, limit, sortKey, sortDir),
    fetchStats: () => bonLivraisonService.getStats(),
    loadErrorMessage: 'Impossible de charger les bons de livraison.',
  });

  /** Facturer un bon livré, puis ouvrir la facture créée (comme depuis la fiche du bon). */
  const handleConvert = async (bon: BonLivraison) => {
    const ok = await confirm({
      title: `Facturer le bon de livraison ${bon.numero_bl} ?`,
      description: `Une facture de ${formatCurrency(bon.total)} sera créée pour ${clientOf(bon) || 'le client'}. Ce montant deviendra dû.`,
      confirmLabel: 'Créer la facture',
    });
    if (!ok) return;
    try {
      const result = (await bonLivraisonService.convertToFacture(bon.id)) as ConversionResult | null;
      const factureId = result?.facture_id ?? result?.data?.facture_id;
      const numero = result?.numero_facture ?? result?.data?.numero_facture;
      toast.success(numero ? `Facture ${numero} créée` : 'Facture créée');
      if (factureId) {
        navigate(`/factures/${factureId}`);
        return;
      }
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Impossible de créer la facture. Réessayez.'));
    }
  };

  const bulkConvertible = list.selectedRows.filter((b) => b.statut === 'livre');
  const handleBulkConvert = async () => {
    const n = bulkConvertible.length;
    if (n === 0) {
      toast.info('Sélectionnez des bons au statut Livré : seuls ceux-là peuvent être facturés.');
      return;
    }
    const ok = await confirm({
      title: n > 1 ? `Facturer ${n} bons de livraison ?` : `Facturer le bon de livraison ${bulkConvertible[0].numero_bl} ?`,
      description:
        n > 1
          ? `Une facture sera créée pour chacun des ${n} bons livrés. Leurs montants deviendront dus.`
          : `Une facture de ${formatCurrency(bulkConvertible[0].total)} sera créée. Ce montant deviendra dû.`,
      confirmLabel: n > 1 ? `Créer les ${n} factures` : 'Créer la facture',
    });
    if (!ok) return;
    const results = await Promise.allSettled(bulkConvertible.map((b) => bonLivraisonService.convertToFacture(b.id)));
    const done = results.filter((r) => r.status === 'fulfilled').length;
    const failed = n - done;
    if (done) toast.success(done > 1 ? `${done} bons de livraison facturés` : '1 bon de livraison facturé');
    if (failed) {
      toast.error(
        failed > 1
          ? `${failed} bons de livraison n’ont pas pu être facturés.`
          : '1 bon de livraison n’a pas pu être facturé.'
      );
    }
    list.reload();
  };

  const exportSelection = () => {
    const rows = list.selectedRows.map(csvRow);
    downloadCsv(`bons_livraison_selection_${new Date().toISOString().split('T')[0]}.csv`, CSV_HEADERS, rows);
    toast.success(`${rows.length} ${rows.length > 1 ? 'bons de livraison exportés' : 'bon de livraison exporté'}`);
  };

  // Un décompte qui attend l'utilisateur reste neutre (comme « À confirmer » sur les devis).
  const statTiles = (stats: BonLivraisonStats | null): StatTile[] => [
    { label: 'Bons de livraison', value: stats ? formatNumber(stats.total.count) : '—' },
    { label: 'Montant total', value: stats ? formatCurrency(stats.total.montant) : '—' },
    { label: 'À facturer', value: stats ? formatNumber(stats.a_facturer.count) : '—' },
    {
      label: 'Bons ce mois-ci',
      value: stats ? formatNumber(stats.mois.count) : '—',
      hint: stats ? formatCurrency(stats.mois.montant) : undefined,
    },
  ];

  /** Tableau : bouton de 36 px rattrapé par la marge négative (la ligne garde sa hauteur) ; carte : 44 px. */
  const rowActions = (bon: BonLivraison, place: 'table' | 'card') =>
    bon.statut === 'livre' ? (
      <div className={cn('flex justify-end gap-1', place === 'table' && '-my-2')}>
        <Button
          variant="outline"
          size={place === 'card' ? 'touch' : 'default'}
          onClick={() => void handleConvert(bon)}
          aria-label={`Créer la facture du bon de livraison ${bon.numero_bl}`}
        >
          Créer la facture
        </Button>
      </div>
    ) : null;

  const columns: DocumentColumn<BonLivraison>[] = [
    {
      // Mono, poids normal : rendu par DocumentListPage (colonne principale).
      header: 'N° de BL',
      sortKey: 'numero_bl',
      primary: true,
      render: (bon) => bon.numero_bl,
    },
    {
      header: 'Client',
      sortKey: 'client_nom',
      render: (bon) => clientOf(bon) || '—',
    },
    {
      header: 'Date',
      sortKey: 'date_bl',
      cellClassName: 'whitespace-nowrap',
      render: (bon) => formatDate(bon.date_bl),
    },
    {
      header: 'Statut',
      card: 'badge',
      render: (bon) => <StatusBadge type="bl" statut={bon.statut} />,
    },
    {
      header: 'Total',
      sortKey: 'total',
      align: 'right',
      numeric: true,
      render: (bon) => <Money value={bon.total} />,
    },
    {
      header: <span className="sr-only">Actions</span>,
      headClassName: 'w-[1%]',
      card: 'actions',
      stopPropagation: true,
      render: (bon) => rowActions(bon, 'table'),
    },
  ];

  const renderCard = (bon: BonLivraison) => (
    <DataCard
      key={bon.id}
      href={`/bons-livraison/${bon.id}`}
      title={<DocumentCode className="font-normal">{bon.numero_bl}</DocumentCode>}
      badge={<StatusBadge type="bl" statut={bon.statut} />}
      actions={rowActions(bon, 'card')}
    >
      <DataCardRow label="Client" value={clientOf(bon) || '—'} />
      <DataCardRow label="Date" value={formatDate(bon.date_bl)} />
      <DataCardRow label="Total" value={<Money value={bon.total} />} numeric />
    </DataCard>
  );

  const createLinkClass = cn(buttonVariants({ size: 'touch' }), 'gap-2');

  return (
    <DocumentListPage
      list={list}
      title="Bons de livraison"
      subtitle="Marchandise à remettre aux clients : un bon livré sort du stock et se facture ensuite"
      createButton={
        <Link to="/bons-livraison/nouveau" className={createLinkClass}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau bon de livraison
        </Link>
      }
      statTiles={statTiles}
      searchPlaceholder="Numéro ou client"
      searchLabel="Rechercher un bon de livraison par numéro ou client"
      statusChips={STATUS_CHIPS}
      shortcuts={{ newRoute: '/bons-livraison/nouveau', newDescription: 'Nouveau bon de livraison' }}
      csv={{
        filenamePrefix: 'bons_livraison',
        headers: CSV_HEADERS,
        row: csvRow,
        fetchAll: async (search, statut) => (await bonLivraisonService.exportAll(search, statut)) || [],
      }}
      bulkActions={
        <>
          <Button variant="outline" size="sm" onClick={exportSelection} className="gap-1.5">
            <Download className="h-4 w-4" aria-hidden="true" /> Exporter la sélection
          </Button>
          <Button size="sm" onClick={() => void handleBulkConvert()} className="gap-1.5">
            <FileCheck className="h-4 w-4" aria-hidden="true" /> Créer les factures
          </Button>
        </>
      }
      columns={columns}
      detailPath={(bon) => `/bons-livraison/${bon.id}`}
      rowAriaLabel={(bon) => `Sélectionner le bon de livraison ${bon.numero_bl}`}
      itemNoun={{ one: 'bon de livraison', many: 'bons de livraison' }}
      emptyState={{
        icon: FileCheck,
        title: 'Aucun bon de livraison pour le moment',
        description: 'Un bon de livraison se crée à partir d’un devis confirmé',
        filteredTitle: 'Aucun bon de livraison ne correspond à ces filtres',
        filteredDescription: 'Vérifiez le numéro ou le nom du client, ou changez de statut',
        createAction: (
          <Link to="/bons-livraison/nouveau" className={createLinkClass}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau bon de livraison
          </Link>
        ),
      }}
      renderCard={renderCard}
    />
  );
}
