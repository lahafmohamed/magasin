import { Link, useNavigate } from 'react-router-dom';
import { Download, FilePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { type StatTile } from '@/components/ui/stats-bar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { devisService } from '@/services/api';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/utils/csv';
import { getErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate, formatDateNumeric, formatNumber, toNumber } from '@/utils/format';
import {
  DocumentListPage,
  useDocumentList,
  type DocumentColumn,
} from '@/components/DocumentListPage';

interface Devis {
  id: number;
  numero_devis: string;
  tiers_id: number;
  client_id?: number;
  client_nom: string;
  client_prenom?: string | null;
  date_devis: string;
  date_validite: string | null;
  statut: string;
  total: number | string;
  notes: string | null;
}

interface DevisStats {
  total: { count: number; montant: number };
  en_cours: { count: number };
  mois: { count: number; montant: number };
}

interface DevisDetailLinks {
  bl_id?: number | null;
  bl_numero?: string | null;
}

const STATUS_CHIPS = [{ value: 'all', label: 'Tous' }, ...getStatusOptions('devis')];
const CSV_HEADERS = ['N° de devis', 'Client', 'Date', 'Valable jusqu’au', 'Total', 'Statut'];

/** Un devis se modifie et se confirme tant qu'il n'a produit aucun document. */
const isEditable = (statut: string) => statut === 'brouillon' || statut === 'envoye';
/** Suppression (administrateur) : seulement sans bon de livraison ni facture en aval. */
const isDeletable = (statut: string) => ['brouillon', 'envoye', 'refuse', 'annule'].includes(statut);

const clientOf = (d: Devis) => `${d.client_nom || ''} ${d.client_prenom || ''}`.trim();

const csvRow = (d: Devis) => [
  d.numero_devis,
  clientOf(d),
  formatDateNumeric(d.date_devis),
  d.date_validite ? formatDateNumeric(d.date_validite) : '',
  toNumber(d.total) ?? 0,
  getStatusLabel('devis', d.statut),
];

export default function Devis() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAuth();
  // `DELETE /devis/:id` est réservé à l'administrateur : le bouton n'apparaît pas ailleurs.
  const isAdmin = user?.role === 'admin';

  const list = useDocumentList<Devis, DevisStats>({
    defaultSortKey: 'date_devis',
    fetchList: (search, statut, page, limit, sortKey, sortDir) =>
      devisService.getAll(search, statut, page, limit, sortKey, sortDir),
    fetchStats: () => devisService.getStats(),
    loadErrorMessage: 'Impossible de charger les devis.',
  });

  const handleConfirm = async (devis: Devis) => {
    const ok = await confirm({
      title: `Confirmer le devis ${devis.numero_devis} ?`,
      description: `Un bon de livraison sera créé pour ${clientOf(devis) || 'le client'} et le devis ne pourra plus être modifié.`,
      confirmLabel: 'Confirmer le devis',
    });
    if (!ok) return;
    try {
      await devisService.updateStatut(devis.id, 'accepte');
      list.reload();
      // Le bon de livraison créé : proposé tout de suite (U-25).
      let links: DevisDetailLinks | null = null;
      try {
        links = (await devisService.getById(devis.id)) as DevisDetailLinks;
      } catch {
        links = null;
      }
      const blId = links?.bl_id;
      toast.success(
        links?.bl_numero
          ? `Devis ${devis.numero_devis} confirmé : bon de livraison ${links.bl_numero} créé`
          : `Devis ${devis.numero_devis} confirmé : bon de livraison créé`,
        blId
          ? { action: { label: 'Ouvrir le bon de livraison', onClick: () => navigate(`/bons-livraison/${blId}`) } }
          : undefined
      );
    } catch (error) {
      toast.error(getErrorMessage(error, 'Impossible de confirmer le devis. Réessayez.'));
    }
  };

  const handleDelete = async (devis: Devis) => {
    const ok = await confirm({
      title: `Supprimer le devis ${devis.numero_devis} ?`,
      description: 'Le devis sera supprimé définitivement. Aucun stock ni paiement n’est concerné.',
      confirmLabel: 'Supprimer le devis',
      destructive: true,
    });
    if (!ok) return;
    try {
      await devisService.delete(devis.id);
      toast.success(`Devis ${devis.numero_devis} supprimé`);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Impossible de supprimer le devis. Réessayez.'));
    }
  };

  const exportSelection = () => {
    const rows = list.selectedRows.map(csvRow);
    downloadCsv(`devis_selection_${new Date().toISOString().split('T')[0]}.csv`, CSV_HEADERS, rows);
    toast.success(`${rows.length} devis exporté${rows.length > 1 ? 's' : ''}`);
  };

  const handleBulkDelete = async () => {
    const deletable = list.selectedRows.filter((d) => isDeletable(d.statut));
    const skipped = list.selectedRows.length - deletable.length;
    if (deletable.length === 0) {
      toast.info('Sélectionnez des devis sans bon de livraison ni facture : seuls ceux-là peuvent être supprimés.');
      return;
    }
    const ok = await confirm({
      title: `Supprimer ${deletable.length} devis ?`,
      description: `Les devis seront supprimés définitivement. Aucun stock ni paiement n’est concerné.${
        skipped > 0
          ? ` ${skipped} devis déjà ${skipped > 1 ? 'confirmés ou facturés sont conservés' : 'confirmé ou facturé est conservé'}.`
          : ''
      }`,
      confirmLabel: deletable.length > 1 ? `Supprimer les ${deletable.length} devis` : 'Supprimer le devis',
      destructive: true,
    });
    if (!ok) return;
    const results = await Promise.allSettled(deletable.map((d) => devisService.delete(d.id)));
    const done = results.filter((r) => r.status === 'fulfilled').length;
    const failed = deletable.length - done;
    if (done) toast.success(`${done} devis supprimé${done > 1 ? 's' : ''}`);
    if (failed) toast.error(`${failed} devis n’${failed > 1 ? 'ont' : 'a'} pas pu être supprimé${failed > 1 ? 's' : ''}.`);
    list.reload();
  };

  const statTiles = (stats: DevisStats | null): StatTile[] => [
    { label: 'Devis', value: stats ? formatNumber(stats.total.count) : '—' },
    { label: 'Montant total', value: stats ? formatCurrency(stats.total.montant) : '—' },
    { label: 'À confirmer', value: stats ? formatNumber(stats.en_cours.count) : '—' },
    {
      label: 'Devis ce mois-ci',
      value: stats ? formatNumber(stats.mois.count) : '—',
      hint: stats ? `${formatCurrency(stats.mois.montant)} proposés` : undefined,
    },
  ];

  /**
   * Actions de ligne, dans un ordre fixe : confirmer (l'étape suivante, en
   * toutes lettres, comme « Créer la facture » sur les bons de livraison),
   * puis modifier et supprimer en icônes — qui gardent leur colonne d'une
   * ligne à l'autre. Tableau : 36 px rattrapés par la marge négative (la ligne
   * garde sa hauteur) ; carte : 44 px (doigt).
   */
  const rowActions = (d: Devis, place: 'table' | 'card') => {
    const editable = isEditable(d.statut);
    const deletable = isAdmin && isDeletable(d.statut);
    if (!editable && !deletable) return null;
    const iconSize = place === 'card' ? 'icon-touch' : 'icon';
    return (
      <div className={cn('flex items-center justify-end gap-1', place === 'table' && '-my-2')}>
        {editable && (
          <Button
            variant="outline"
            size={place === 'card' ? 'touch' : 'default'}
            className="me-1"
            onClick={() => void handleConfirm(d)}
            aria-label={`Confirmer le devis ${d.numero_devis}`}
          >
            Confirmer
          </Button>
        )}
        {editable && (
          <Button
            variant="ghost"
            size={iconSize}
            onClick={() => navigate(`/devis/${d.id}/edit`)}
            title="Modifier le devis"
            aria-label={`Modifier le devis ${d.numero_devis}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        {deletable && (
          <Button
            variant="ghost"
            size={iconSize}
            className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
            onClick={() => void handleDelete(d)}
            title="Supprimer le devis"
            aria-label={`Supprimer le devis ${d.numero_devis}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  };

  const columns: DocumentColumn<Devis>[] = [
    {
      // Mono, poids normal : rendu par DocumentListPage (colonne principale).
      header: 'N° de devis',
      sortKey: 'numero_devis',
      primary: true,
      render: (d) => d.numero_devis,
    },
    {
      header: 'Client',
      sortKey: 'client_nom',
      render: (d) => clientOf(d) || '—',
    },
    {
      header: 'Date',
      sortKey: 'date_devis',
      cellClassName: 'whitespace-nowrap',
      render: (d) => formatDate(d.date_devis),
    },
    {
      header: 'Valable jusqu’au',
      sortKey: 'date_validite',
      cellClassName: 'whitespace-nowrap',
      render: (d) => formatDate(d.date_validite),
    },
    {
      header: 'Statut',
      card: 'badge',
      render: (d) => <StatusBadge type="devis" statut={d.statut} />,
    },
    {
      header: 'Total',
      sortKey: 'total',
      align: 'right',
      numeric: true,
      render: (d) => <Money value={d.total} />,
    },
    {
      header: <span className="sr-only">Actions</span>,
      headClassName: 'w-[1%]',
      card: 'actions',
      stopPropagation: true,
      render: (d) => rowActions(d, 'table'),
    },
  ];

  const renderCard = (d: Devis) => (
    <DataCard
      key={d.id}
      href={`/devis/${d.id}`}
      title={<DocumentCode className="font-normal">{d.numero_devis}</DocumentCode>}
      badge={<StatusBadge type="devis" statut={d.statut} />}
      actions={rowActions(d, 'card')}
    >
      <DataCardRow label="Client" value={clientOf(d) || '—'} />
      <DataCardRow label="Date" value={formatDate(d.date_devis)} />
      {d.date_validite && <DataCardRow label="Valable jusqu’au" value={formatDate(d.date_validite)} />}
      <DataCardRow label="Total" value={<Money value={d.total} />} numeric />
    </DataCard>
  );

  const createLinkClass = cn(buttonVariants({ size: 'touch' }), 'gap-2');

  return (
    <DocumentListPage
      list={list}
      title="Devis"
      subtitle="Propositions de prix à vos clients ; une fois confirmé, un devis devient un bon de livraison"
      createButton={
        <Link to="/devis/nouveau" className={createLinkClass}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau devis
        </Link>
      }
      statTiles={statTiles}
      searchPlaceholder="Numéro ou client"
      searchLabel="Rechercher un devis par numéro ou client"
      statusChips={STATUS_CHIPS}
      shortcuts={{ newRoute: '/devis/nouveau', newDescription: 'Nouveau devis' }}
      csv={{
        filenamePrefix: 'devis',
        headers: CSV_HEADERS,
        row: csvRow,
        fetchAll: async (search, statut) => (await devisService.exportAll(search, statut)) || [],
      }}
      bulkActions={
        <>
          <Button variant="outline" size="sm" onClick={exportSelection} className="gap-1.5">
            <Download className="h-4 w-4" aria-hidden="true" /> Exporter la sélection
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleBulkDelete()}
              className="gap-1.5 text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer la sélection
            </Button>
          )}
        </>
      }
      columns={columns}
      detailPath={(d) => `/devis/${d.id}`}
      // Seule action groupée réelle : la suppression, réservée à l'administrateur.
      selectable={isAdmin}
      rowAriaLabel={(d) => `Sélectionner le devis ${d.numero_devis}`}
      itemNoun={{ one: 'devis', many: 'devis' }}
      emptyState={{
        icon: FilePlus,
        title: 'Aucun devis pour le moment',
        description: 'Préparez un devis pour un client ; une fois confirmé, il devient un bon de livraison',
        filteredTitle: 'Aucun devis ne correspond à ces filtres',
        filteredDescription: 'Vérifiez le numéro ou le nom du client, ou changez de statut',
        createAction: (
          <Link to="/devis/nouveau" className={createLinkClass}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Créer un devis
          </Link>
        ),
      }}
      renderCard={renderCard}
    />
  );
}
