import { Link } from 'react-router-dom';
import { factureService } from '../services/api';
import type { Facture, StatsDashboard } from '../types';
import { buttonVariants } from '@/components/ui/button';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { type StatTile } from '@/components/ui/stats-bar';
import { FileText, Plus } from 'lucide-react';
import { formatCurrency, formatDate, formatDateNumeric, formatNumber, toNumber } from '@/utils/format';
import { cn } from '@/lib/utils';
import {
  DocumentListPage,
  useDocumentList,
  type DocumentColumn,
} from '@/components/DocumentListPage';

const STATUS_CHIPS = [{ value: 'all', label: 'Toutes' }, ...getStatusOptions('facture')];

const CSV_HEADERS = ['N° de facture', 'Client', 'Date', 'Total', 'Payé', 'Reste dû', 'Statut'];

const clientOf = (f: Facture) => `${f.client_nom || ''} ${f.client_prenom || ''}`.trim();

/** Reste dû d'une facture ; une facture annulée ne doit plus rien. */
const resteDu = (f: Facture) => {
  if (f.statut === 'annulee') return 0;
  const total = toNumber(f.total) ?? 0;
  return Math.max(0, toNumber(f.remaining_due) ?? total - (toNumber(f.montant_paye) ?? 0));
};

const csvRow = (f: Facture) => [
  f.numero_facture,
  clientOf(f),
  formatDateNumeric(f.date_facture),
  toNumber(f.total) ?? 0,
  toNumber(f.montant_paye) ?? 0,
  resteDu(f),
  getStatusLabel('facture', f.statut),
];

const COLUMNS: DocumentColumn<Facture>[] = [
  {
    // Mono, poids normal : rendu par DocumentListPage (colonne principale).
    header: 'N° de facture',
    sortKey: 'numero_facture',
    primary: true,
    render: (facture) => facture.numero_facture,
  },
  {
    header: 'Client',
    sortKey: 'client_nom',
    render: (facture) => clientOf(facture) || '—',
  },
  {
    header: 'Date',
    sortKey: 'date_facture',
    cellClassName: 'whitespace-nowrap',
    render: (facture) => formatDate(facture.date_facture),
  },
  {
    header: 'Total',
    sortKey: 'total',
    align: 'right',
    numeric: true,
    render: (facture) => <Money value={facture.total} />,
  },
  // Zéro estompé dans les deux colonnes : sur chaque ligne, le montant qui
  // compte (payé ou à encaisser) est le seul à pleine encre.
  {
    header: 'Payé',
    sortKey: 'montant_paye',
    align: 'right',
    numeric: true,
    render: (facture) => <Money value={toNumber(facture.montant_paye) ?? 0} tone="auto" />,
  },
  {
    // Sans tri : le serveur ne trie pas sur `remaining_due` (FactureService.getAll).
    header: 'Reste dû',
    align: 'right',
    numeric: true,
    render: (facture) => <Money value={resteDu(facture)} tone="auto" />,
  },
  {
    header: 'Statut',
    sortKey: 'statut',
    card: 'badge',
    render: (facture) => <StatusBadge type="facture" statut={facture.statut} />,
  },
];

export default function Factures() {
  const list = useDocumentList<Facture, StatsDashboard>({
    defaultSortKey: 'date_facture',
    fetchList: (search, statut, page, limit, sortKey, sortDir) =>
      factureService.getAll(search, statut, page, limit, sortKey, sortDir),
    fetchStats: () => factureService.getStats(),
    loadErrorMessage: 'Impossible de charger les factures.',
  });

  // Le montant en dernier : sur téléphone, la dernière tuile d'un nombre impair
  // prend toute la largeur, et « 44 241 000 » ne se sépare plus de « FCFA ».
  const statTiles = (stats: StatsDashboard | null): StatTile[] => [
    {
      label: 'Factures',
      value: stats ? formatNumber(stats.total_factures.count) : '—',
    },
    {
      label: 'Factures ce mois-ci',
      value: stats ? formatNumber(stats.factures_mois.count) : '—',
      hint: stats ? `${formatCurrency(stats.factures_mois.montant)} facturés` : undefined,
    },
    {
      label: 'Chiffre d’affaires',
      value: stats ? formatCurrency(stats.total_factures.montant) : '—',
    },
  ];

  const renderCard = (facture: Facture) => (
    <DataCard
      key={facture.id}
      href={`/factures/${facture.id}`}
      title={<DocumentCode className="font-normal">{facture.numero_facture}</DocumentCode>}
      badge={<StatusBadge type="facture" statut={facture.statut} />}
    >
      <DataCardRow label="Client" value={clientOf(facture) || '—'} />
      <DataCardRow label="Date" value={formatDate(facture.date_facture)} />
      <DataCardRow label="Total" value={<Money value={facture.total} />} numeric />
      {facture.statut !== 'annulee' && (
        <DataCardRow label="Reste dû" value={<Money value={resteDu(facture)} tone="auto" />} numeric />
      )}
    </DataCard>
  );

  const createLinkClass = cn(buttonVariants({ size: 'touch' }), 'gap-2');

  return (
    <DocumentListPage
      list={list}
      title="Factures"
      subtitle="Ce que vos clients vous ont acheté, et ce qu’il reste à encaisser. Chaque paiement règle la facture sur laquelle il est enregistré."
      createButton={
        <Link to="/factures/nouvelle" className={createLinkClass}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle facture
        </Link>
      }
      statTiles={statTiles}
      searchPlaceholder="Numéro ou client"
      searchLabel="Rechercher une facture par numéro ou client"
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
      columns={COLUMNS}
      detailPath={(facture) => `/factures/${facture.id}`}
      selectable={false}
      itemNoun={{ one: 'facture', many: 'factures' }}
      emptyState={{
        icon: FileText,
        title: 'Aucune facture pour le moment',
        description: 'Les factures créées ici ou depuis un bon de livraison apparaîtront dans cette liste',
        filteredTitle: 'Aucune facture ne correspond à ces filtres',
        filteredDescription: 'Vérifiez le numéro ou le nom du client, ou changez de statut',
        createAction: (
          <Link to="/factures/nouvelle" className={createLinkClass}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Créer une facture
          </Link>
        ),
      }}
      renderCard={renderCard}
    />
  );
}
