import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FilePlus,
  Eye,
  Download,
  Wallet,
  CheckCircle2,
  FileEdit,
  Hourglass,
  Receipt,
} from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/utils/format';
import { AVOIR_TYPE_LABELS } from '@/utils/avoirTypes';
import { creditNoteService } from '@/services/api';
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
  statut: 'brouillon' | 'valide' | 'utilise' | 'annule' | string;
  total: number;
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

const TYPE_LABEL = AVOIR_TYPE_LABELS;

const TYPE_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'secondary'> = {
  erreur: 'warning',
  retour: 'info',
  echange: 'secondary',
  remise_commerciale: 'success',
};

const STATUS_CHIPS = [
  { value: 'all', label: 'Tous' },
  { value: 'brouillon', label: 'Brouillons' },
  { value: 'valide', label: 'Validés' },
  { value: 'utilise', label: 'Utilisés' },
  { value: 'annule', label: 'Annulés' },
] as const;

const formatClient = (a: Avoir) =>
  a.client_prenom ? `${a.client_nom} ${a.client_prenom}` : a.client_nom;

const csvRow = (a: Avoir) => [
  a.numero_avoir,
  formatClient(a),
  new Date(a.date_avoir).toLocaleDateString('fr-FR'),
  TYPE_LABEL[a.avoir_type || ''] || a.avoir_type || '',
  a.statut,
  a.facture_origine_numero || '',
  String(a.total || 0),
];

export default function Avoirs() {
  const navigate = useNavigate();

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
    loadErrorMessage: 'Erreur lors du chargement des avoirs',
  });

  const columns: ReadonlyArray<DocumentColumn<Avoir>> = [
    {
      header: 'Numéro',
      sortKey: 'numero_avoir',
      cellClassName: 'font-medium num',
      render: (a) => a.numero_avoir,
    },
    {
      header: 'Client',
      sortKey: 'client_nom',
      stopPropagation: true,
      render: (a) =>
        a.client_id ? (
          <Link to={`/tiers/${a.client_id}`} className="hover:underline">
            {formatClient(a)}
          </Link>
        ) : (
          formatClient(a)
        ),
    },
    {
      header: 'Date',
      sortKey: 'date_avoir',
      cellClassName: 'num',
      render: (a) => new Date(a.date_avoir).toLocaleDateString('fr-FR'),
    },
    {
      header: 'Type',
      sortKey: 'avoir_type',
      render: (a) =>
        a.avoir_type ? (
          <Badge variant={TYPE_VARIANT[a.avoir_type] ?? 'secondary'}>
            {TYPE_LABEL[a.avoir_type] || a.avoir_type}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Facture origine',
      stopPropagation: true,
      render: (a) =>
        a.facture_origine_numero && a.facture_origine_id ? (
          <Link
            to={`/factures/${a.facture_origine_id}`}
            className="num text-primary hover:underline"
          >
            {a.facture_origine_numero}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Statut',
      sortKey: 'statut',
      render: (a) => <StatusBadge type="avoir" statut={a.statut} />,
    },
    {
      header: 'Montant',
      sortKey: 'total',
      align: 'right',
      headClassName: 'text-right',
      cellClassName: 'text-right font-medium num',
      render: (a) => formatCurrency(a.total),
    },
    {
      header: '',
      headClassName: 'text-right w-12',
      cellClassName: 'text-right',
      stopPropagation: true,
      render: (a) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => navigate(`/avoirs/${a.id}`)}
          aria-label={`Voir l'avoir ${a.numero_avoir}`}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
        </Button>
      ),
    },
  ];

  return (
    <DocumentListPage<Avoir, AvoirStats>
      list={list}
      layoutClassName="container mx-auto p-6 space-y-6"
      title="Avoirs"
      titleIcon={Receipt}
      subtitle="Notes de crédit clients — retours, erreurs et remises commerciales"
      createButton={
        <Button onClick={() => navigate('/avoirs/nouveau')} className="gap-1.5">
          <FilePlus className="h-4 w-4" aria-hidden="true" /> Nouvel avoir
        </Button>
      }
      statTiles={(stats) => [
        {
          label: 'Validés non utilisés',
          value: formatCurrency(stats?.valideTotal ?? 0),
          hint: `${stats?.valideCount ?? 0} avoirs`,
          icon: Wallet,
          tone: 'text-warning-700',
        },
        {
          label: 'Utilisés ce mois',
          value: formatCurrency(stats?.utiliseMoisTotal ?? 0),
          hint: `${stats?.utiliseMoisCount ?? 0} avoirs`,
          icon: CheckCircle2,
          tone: 'text-success-700',
        },
        {
          label: 'Brouillons',
          value: stats?.brouillonCount ?? 0,
          hint: stats?.brouillonTotal ? formatCurrency(stats.brouillonTotal) : '—',
          icon: FileEdit,
        },
        {
          label: 'Total ce mois',
          value: formatCurrency(stats?.moisTotal ?? 0),
          hint: `${stats?.moisCount ?? 0} avoirs`,
          icon: Hourglass,
          tone: 'text-primary',
        },
      ]}
      searchPlaceholder="Rechercher par numéro ou client  ( / )"
      statusChips={STATUS_CHIPS}
      extraFilters={
        <Select value={list.extra.type} onValueChange={(v) => list.setExtra('type', v)}>
          <SelectTrigger className="h-9 w-auto" aria-label="Filtrer par type">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les types</SelectItem>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      shortcuts={{ newRoute: '/avoirs/nouveau', newDescription: 'Nouvel avoir' }}
      csv={{
        filenamePrefix: 'avoirs',
        headers: ['Numéro', 'Client', 'Date', 'Type', 'Statut', 'Facture origine', 'Montant'],
        row: csvRow,
        fetchAll: async (search, statut) => {
          const res = await creditNoteService.getAll(search, statut, 1, 200);
          return res?.data ?? [];
        },
      }}
      bulkActions={
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => {
            const rows = list.selectedRows.map(csvRow);
            import('@/utils/csv').then(({ downloadCsv }) =>
              downloadCsv(
                `avoirs_selection_${new Date().toISOString().slice(0, 10)}.csv`,
                ['Numéro', 'Client', 'Date', 'Type', 'Statut', 'Facture origine', 'Montant'],
                rows
              )
            );
          }}
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Exporter la sélection
        </Button>
      }
      columns={columns}
      detailPath={(a) => `/avoirs/${a.id}`}
      rowAriaLabel={(a) => `Sélectionner ${a.numero_avoir}`}
      emptyState={{
        icon: FilePlus,
        title: 'Aucun avoir enregistré',
        filteredTitle: 'Aucun avoir ne correspond aux filtres',
        createAction: (
          <Button size="sm" onClick={() => navigate('/avoirs/nouveau')}>
            Créer le premier avoir
          </Button>
        ),
      }}
      totalFooterLabel="avoir(s) au total"
    />
  );
}
