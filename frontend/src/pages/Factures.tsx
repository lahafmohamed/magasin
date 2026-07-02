import { Link, useNavigate } from 'react-router-dom';
import { factureService } from '../services/api';
import { Facture, StatsDashboard } from '../types';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/StatusBadge';
import { formatXOF } from '@/utils/format';
import { DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { type StatTile } from '@/components/ui/stats-bar';
import { Plus, FileText, Info, Download, ExternalLink, Receipt, CalendarDays, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '../utils/csv';
import {
  DocumentListPage,
  useDocumentList,
  type DocumentColumn,
} from '@/components/DocumentListPage';

const STATUS_CHIPS = [
  { value: 'all', label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'partielle', label: 'Partielle' },
  { value: 'payee', label: 'Payée' },
  { value: 'annulee', label: 'Annulée' },
];

const CSV_HEADERS = ['N° Facture', 'Client', 'Date', 'Total', 'Payé', 'Statut'];
const csvRow = (f: Facture) => [
  f.numero_facture,
  `${f.client_nom || ''} ${f.client_prenom || ''}`.trim(),
  new Date(f.date_facture).toLocaleDateString('fr-FR'),
  f.total,
  f.montant_paye || 0,
  f.statut,
];

const COLUMNS: DocumentColumn<Facture>[] = [
  {
    header: 'N° Facture',
    sortKey: 'numero_facture',
    cellClassName: 'font-mono font-semibold',
    render: (facture) => facture.numero_facture,
  },
  {
    header: 'Client',
    sortKey: 'client_nom',
    render: (facture) => <>{facture.client_nom} {facture.client_prenom}</>,
  },
  {
    header: 'Date',
    sortKey: 'date_facture',
    render: (facture) =>
      new Date(facture.date_facture).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
  },
  {
    header: 'Total',
    sortKey: 'total',
    align: 'right',
    cellClassName: 'text-right',
    render: (facture) => formatXOF(facture.total),
  },
  {
    header: (
      <span className="flex items-center gap-1">
        Payé
        <span title="Allocation FIFO: les paiements remboursent les factures les plus anciennes en premier">
          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
        </span>
      </span>
    ),
    sortKey: 'montant_paye',
    render: (facture) => {
      const total = parseFloat(facture.total as any) || 0;
      const montantPaye = parseFloat(facture.montant_paye as any) || 0;
      const remainingDue = parseFloat(facture.remaining_due as any) || total;
      return (
        <div className="flex flex-col gap-1">
          <span className={`text-sm font-semibold ${montantPaye >= total ? 'text-success' : 'text-warning'}`}>
            {formatXOF(montantPaye)}
          </span>
          {facture.statut === 'partielle' && (
            <span className="text-xs text-muted-foreground">
              Reste: {formatXOF(remainingDue)}
            </span>
          )}
        </div>
      );
    },
  },
  {
    header: 'Statut',
    render: (facture) => <StatusBadge type="facture" statut={facture.statut} />,
  },
  {
    header: '',
    headClassName: 'w-10',
    render: (facture) => (
      <button
        title="Ouvrir dans un nouvel onglet"
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={(e) => { e.stopPropagation(); window.open(`/factures/${facture.id}`, '_blank'); }}
      >
        <ExternalLink className="h-4 w-4" />
      </button>
    ),
  },
];

export default function Factures() {
  const navigate = useNavigate();

  const list = useDocumentList<Facture, StatsDashboard>({
    defaultSortKey: 'date_facture',
    fetchList: (search, statut, page, limit, sortKey, sortDir) =>
      factureService.getAll(search, statut, page, limit, sortKey, sortDir),
    fetchStats: () => factureService.getStats(),
    loadErrorMessage: 'Erreur lors du chargement des factures',
  });

  const exportSelection = () => {
    const rows = list.selectedRows.map(csvRow);
    downloadCsv(`factures_selection_${new Date().toISOString().split('T')[0]}.csv`, CSV_HEADERS, rows);
    toast.success(`${rows.length} facture${rows.length > 1 ? 's' : ''} exportée${rows.length > 1 ? 's' : ''}`);
  };

  const statTiles = (stats: StatsDashboard | null): StatTile[] => [
    { label: 'Total factures', value: stats ? String(stats.total_factures.count) : '—', icon: Receipt },
    { label: 'Chiffre d\'affaires', value: stats ? formatXOF(stats.total_factures.montant) : '—', icon: Wallet },
    { label: 'Ce mois', value: stats ? String(stats.factures_mois.count) : '—', hint: stats ? formatXOF(stats.factures_mois.montant) : undefined, icon: CalendarDays },
  ];

  const renderCard = (facture: Facture) => {
    const total = parseFloat(facture.total as any) || 0;
    const montantPaye = parseFloat(facture.montant_paye as any) || 0;
    const remainingDue = parseFloat(facture.remaining_due as any) || total;
    return (
      <DataCard
        key={facture.id}
        onClick={() => navigate(`/factures/${facture.id}`)}
        title={<span className="font-mono">{facture.numero_facture}</span>}
        badge={<StatusBadge type="facture" statut={facture.statut} />}
      >
        <DataCardRow label="Client" value={`${facture.client_nom || ''} ${facture.client_prenom || ''}`.trim() || '—'} />
        <DataCardRow label="Date" value={new Date(facture.date_facture).toLocaleDateString('fr-FR')} />
        <DataCardRow label="Total" value={<span className="num">{formatXOF(facture.total)}</span>} />
        <DataCardRow
          label="Payé"
          value={
            <span className={`num ${montantPaye >= total ? 'text-success' : 'text-warning'}`}>
              {formatXOF(montantPaye)}
              {facture.statut === 'partielle' && (
                <span className="ml-1 text-xs text-muted-foreground">(reste {formatXOF(remainingDue)})</span>
              )}
            </span>
          }
        />
      </DataCard>
    );
  };

  return (
    <DocumentListPage
      list={list}
      layoutClassName="p-3 sm:p-6 w-full space-y-4"
      title="Factures"
      titleIcon={FileText}
      subtitle="Historique complet des factures"
      createButton={
        <Link to="/factures/nouvelle">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Nouvelle Facture
          </Button>
        </Link>
      }
      statTiles={statTiles}
      searchPlaceholder="Rechercher par numéro de facture ou client…  ( / )"
      statusChips={STATUS_CHIPS}
      shortcuts={{ newRoute: '/factures/nouvelle', newDescription: 'Nouvelle facture' }}
      csv={{
        filenamePrefix: 'factures',
        headers: CSV_HEADERS,
        row: csvRow,
        fetchAll: async (search, statut) => {
          const response = await factureService.exportAll(search, statut);
          const all = response?.data || response;
          return Array.isArray(all) ? all : [];
        },
      }}
      bulkActions={
        <Button variant="outline" size="sm" onClick={exportSelection} className="gap-1">
          <Download className="h-4 w-4" /> Exporter la sélection
        </Button>
      }
      columns={COLUMNS}
      rowClassName={(facture) =>
        `group ${facture.statut !== 'payee' && facture.statut !== 'annulee' ? 'border-l-2 border-l-warning' : ''}`
      }
      detailPath={(facture) => `/factures/${facture.id}`}
      rowAriaLabel={(facture) => `Sélectionner ${facture.numero_facture}`}
      emptyState={{
        icon: FileText,
        title: 'Aucune facture trouvée',
        filteredTitle: 'Aucune facture pour ces filtres',
        createAction: (
          <Link to="/factures/nouvelle">
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Créer une facture</Button>
          </Link>
        ),
      }}
      renderCard={renderCard}
      listTitle="Liste des Factures"
    />
  );
}
