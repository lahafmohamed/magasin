import { Link } from 'react-router-dom';
import { FileMinus, Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { Tag } from '@/components/ui/tag';
import { DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { type StatTile } from '@/components/ui/stats-bar';
import { AVOIR_TYPE_OPTIONS, avoirTypeHue, formatAvoirType } from '@/utils/avoirTypes';
import { creditNoteService } from '@/services/api';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, formatDateNumeric, formatNumber, toNumber } from '@/utils/format';
import {
  DocumentListPage,
  useDocumentList,
  type DocumentColumn,
} from '@/components/DocumentListPage';

interface Avoir {
  id: number;
  numero_avoir: string;
  tiers_id: number;
  client_id?: number;
  client_nom: string;
  client_prenom?: string | null;
  date_avoir: string;
  statut: string;
  total: number | string;
  avoir_type: string | null;
  notes: string | null;
  facture_origine_id?: number;
  facture_origine_numero?: string | null;
}

interface AvoirStats {
  brouillonCount: number;
  brouillonTotal: number;
  valideCount: number;
  valideTotal: number;
  utiliseMoisCount: number;
  utiliseMoisTotal: number;
  moisCount: number;
  moisTotal: number;
}

const STATUS_CHIPS = [{ value: 'all', label: 'Tous' }, ...getStatusOptions('avoir', { exclude: ['en_attente'] })];
const CSV_HEADERS = ['N° d’avoir', 'Client', 'Date', 'Type', 'Statut', 'Facture d’origine', 'Montant'];

const clientOf = (a: Avoir) => `${a.client_nom || ''} ${a.client_prenom || ''}`.trim();
const avoirsLabel = (n: number) => `${formatNumber(n)} ${n > 1 ? 'avoirs' : 'avoir'}`;

const csvRow = (a: Avoir) => [
  a.numero_avoir,
  clientOf(a),
  formatDateNumeric(a.date_avoir),
  a.avoir_type ? formatAvoirType(a.avoir_type) : '',
  getStatusLabel('avoir', a.statut),
  a.facture_origine_numero || '',
  toNumber(a.total) ?? 0,
];

function TypeTag({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  return <Tag hue={avoirTypeHue(type)}>{formatAvoirType(type)}</Tag>;
}

export default function Avoirs() {
  const canOpen = useRouteAccess();

  const list = useDocumentList<Avoir, AvoirStats>({
    defaultSortKey: 'date_avoir',
    extraFilters: { type: 'tous' },
    fetchList: (search, statut, page, limit, sortKey, sortDir, extra) =>
      creditNoteService.getAll(
        search,
        statut,
        page,
        limit,
        sortKey,
        sortDir,
        extra.type === 'tous' ? undefined : extra.type
      ),
    fetchStats: () => creditNoteService.getStats(),
    loadErrorMessage: 'Impossible de charger les avoirs.',
  });

  const clientCell = (a: Avoir) => {
    const id = a.client_id ?? a.tiers_id;
    const nom = clientOf(a) || '—';
    return id && canOpen(`/tiers/${id}`) ? (
      <Link to={`/tiers/${id}`} className="underline-offset-4 hover:underline">
        {nom}
      </Link>
    ) : (
      nom
    );
  };

  // Identifiant dans une liste : couleur du texte, souligné au survol (le bleu
  // reste aux actions), en mono comme tout numéro de pièce.
  const factureCell = (a: Avoir) =>
    a.facture_origine_numero && a.facture_origine_id ? (
      <Link to={`/factures/${a.facture_origine_id}`} className="underline-offset-4 hover:underline">
        <DocumentCode>{a.facture_origine_numero}</DocumentCode>
      </Link>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  const columns: ReadonlyArray<DocumentColumn<Avoir>> = [
    {
      // Mono, poids normal : rendu par DocumentListPage (colonne principale).
      header: 'N° d’avoir',
      sortKey: 'numero_avoir',
      primary: true,
      render: (a) => a.numero_avoir,
    },
    {
      header: 'Client',
      sortKey: 'client_nom',
      stopPropagation: true,
      render: clientCell,
    },
    {
      header: 'Date',
      sortKey: 'date_avoir',
      cellClassName: 'whitespace-nowrap',
      render: (a) => formatDate(a.date_avoir),
    },
    {
      header: 'Type',
      sortKey: 'avoir_type',
      render: (a) => <TypeTag type={a.avoir_type} />,
    },
    {
      header: 'Facture d’origine',
      stopPropagation: true,
      render: factureCell,
    },
    {
      header: 'Statut',
      sortKey: 'statut',
      card: 'badge',
      render: (a) => <StatusBadge type="avoir" statut={a.statut} />,
    },
    {
      header: 'Montant',
      sortKey: 'total',
      align: 'right',
      numeric: true,
      render: (a) => <Money value={a.total} />,
    },
  ];

  const renderCard = (a: Avoir) => (
    <DataCard
      key={a.id}
      href={`/avoirs/${a.id}`}
      title={<DocumentCode className="font-normal">{a.numero_avoir}</DocumentCode>}
      badge={<StatusBadge type="avoir" statut={a.statut} />}
    >
      <DataCardRow label="Client" value={clientOf(a) || '—'} />
      <DataCardRow label="Date" value={formatDate(a.date_avoir)} />
      <DataCardRow label="Type" value={<TypeTag type={a.avoir_type} />} />
      <DataCardRow label="Facture d’origine" value={factureCell(a)} />
      <DataCardRow label="Montant" value={<Money value={a.total} />} numeric />
    </DataCard>
  );

  // Pas de couleur sur les montants des tuiles : le libellé dit ce qu'ils sont.
  const statTiles = (stats: AvoirStats | null): StatTile[] => [
    {
      label: 'Validés, non utilisés',
      value: stats ? formatCurrency(stats.valideTotal) : '—',
      hint: stats ? avoirsLabel(stats.valideCount) : undefined,
    },
    {
      label: 'Utilisés ce mois-ci',
      value: stats ? formatCurrency(stats.utiliseMoisTotal) : '—',
      hint: stats ? avoirsLabel(stats.utiliseMoisCount) : undefined,
    },
    {
      label: 'Brouillons',
      value: stats ? formatNumber(stats.brouillonCount) : '—',
      hint: stats && stats.brouillonTotal ? formatCurrency(stats.brouillonTotal) : undefined,
    },
    {
      label: 'Émis ce mois-ci',
      value: stats ? formatCurrency(stats.moisTotal) : '—',
      hint: stats ? avoirsLabel(stats.moisCount) : undefined,
    },
  ];

  const createLinkClass = cn(buttonVariants({ size: 'touch' }), 'gap-2');

  return (
    <DocumentListPage<Avoir, AvoirStats>
      list={list}
      title="Avoirs"
      subtitle="Crédits accordés à vos clients : retours, erreurs de facturation et remises"
      createButton={
        <Link to="/avoirs/nouveau" className={createLinkClass}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouvel avoir
        </Link>
      }
      statTiles={statTiles}
      searchPlaceholder="Numéro ou client"
      searchLabel="Rechercher un avoir par numéro ou client"
      statusChips={STATUS_CHIPS}
      extraFilters={
        <Select value={list.extra.type} onValueChange={(v) => list.setExtra('type', v)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrer par type d’avoir">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les types</SelectItem>
            {AVOIR_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      shortcuts={{ newRoute: '/avoirs/nouveau', newDescription: 'Nouvel avoir' }}
      csv={{
        filenamePrefix: 'avoirs',
        headers: CSV_HEADERS,
        row: csvRow,
        fetchAll: async (search, statut) => {
          const type = list.extra.type === 'tous' ? undefined : list.extra.type;
          const res = await creditNoteService.getAll(search, statut, 1, 200, undefined, undefined, type);
          return res?.data ?? [];
        },
      }}
      columns={columns}
      detailPath={(a) => `/avoirs/${a.id}`}
      selectable={false}
      itemNoun={{ one: 'avoir', many: 'avoirs' }}
      emptyState={{
        icon: FileMinus,
        title: 'Aucun avoir pour le moment',
        description: 'Un avoir crédite un client après un retour, une erreur de facturation ou une remise',
        filteredTitle: 'Aucun avoir ne correspond à ces filtres',
        filteredDescription: 'Vérifiez le numéro ou le nom du client, ou changez de statut ou de type',
        createAction: (
          <Link to="/avoirs/nouveau" className={createLinkClass}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Créer un avoir
          </Link>
        ),
      }}
      renderCard={renderCard}
    />
  );
}
