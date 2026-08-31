import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FilePlus, Eye, FileCheck, FileText, Truck } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { formatXOF } from '@/utils/format';
import { bonLivraisonService } from '@/services/api';
import { toast } from 'sonner';
import { type StatTile } from '@/components/ui/stats-bar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getErrorMessage } from '@/utils/errors';
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
  client_prenom?: string;
  date_bl: string;
  statut: 'valide' | 'livre' | 'facture' | 'annule' | string;
  total: number;
  notes: string | null;
}

interface BonLivraisonStats {
  total: { count: number; montant: number };
  a_facturer: { count: number };
  mois: { count: number; montant: number };
}

const STATUS_CHIPS = [
  { value: 'all', label: 'Tous' },
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'valide', label: 'Validé' },
  { value: 'livre', label: 'Livré' },
  { value: 'facture', label: 'Facturé' },
  { value: 'annule', label: 'Annulé' },
];

export default function BonsLivraison() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const list = useDocumentList<BonLivraison, BonLivraisonStats>({
    defaultSortKey: 'date_bl',
    fetchList: (search, statut, page, limit, sortKey, sortDir) =>
      bonLivraisonService.getAll(search, statut, page, limit, sortKey, sortDir),
    fetchStats: () => bonLivraisonService.getStats(),
    loadErrorMessage: 'Erreur lors du chargement des bons de livraison',
  });

  const handleConvert = async (id: number) => {
    if (!(await confirm({ title: 'Convertir en facture ?', description: 'Ce bon de livraison sera converti en facture.', confirmLabel: 'Convertir' }))) return;
    try {
      await bonLivraisonService.convertToFacture(id);
      toast.success('Bon de livraison converti en facture');
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors de la conversion'));
    }
  };

  const bulkConvertible = list.selectedRows.filter((b) => b.statut === 'livre');
  const handleBulkConvert = async () => {
    if (bulkConvertible.length === 0) { toast.info('Aucun BL « livré » sélectionné'); return; }
    if (!(await confirm({ title: `Convertir ${bulkConvertible.length} bon(s) en facture ?`, confirmLabel: 'Convertir' }))) return;
    const results = await Promise.allSettled(bulkConvertible.map((b) => bonLivraisonService.convertToFacture(b.id)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok) toast.success(`${ok} converti(s) en facture`);
    if (ok < bulkConvertible.length) toast.error(`${bulkConvertible.length - ok} échec(s)`);
    list.reload();
  };

  const statTiles = (stats: BonLivraisonStats | null): StatTile[] => [
    { label: 'Total BL', value: stats ? String(stats.total.count) : '—', icon: Truck },
    { label: 'Montant total', value: stats ? formatXOF(stats.total.montant) : '—' },
    { label: 'À facturer', value: stats ? String(stats.a_facturer.count) : '—', tone: stats && stats.a_facturer.count > 0 ? 'text-warning' : undefined },
    { label: 'Ce mois', value: stats ? String(stats.mois.count) : '—', hint: stats ? formatXOF(stats.mois.montant) : undefined },
  ];

  const columns: DocumentColumn<BonLivraison>[] = [
    {
      header: 'Numéro',
      sortKey: 'numero_bl',
      cellClassName: 'font-mono font-semibold',
      render: (bon) => bon.numero_bl,
    },
    {
      header: 'Client',
      sortKey: 'client_nom',
      render: (bon) => <>{bon.client_nom} {bon.client_prenom}</>,
    },
    {
      header: 'Date',
      sortKey: 'date_bl',
      render: (bon) => new Date(bon.date_bl).toLocaleDateString('fr-FR'),
    },
    {
      header: 'Statut',
      render: (bon) => <StatusBadge type="bl" statut={bon.statut} />,
    },
    {
      header: 'Total',
      sortKey: 'total',
      align: 'right',
      cellClassName: 'text-right font-medium',
      render: (bon) => formatXOF(bon.total),
    },
    {
      header: 'Actions',
      headClassName: 'text-right',
      cellClassName: 'text-right',
      stopPropagation: true,
      render: (bon) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/bons-livraison/${bon.id}`)} aria-label="Voir le bon de livraison"><Eye className="h-4 w-4" /></Button>
          {bon.statut === 'livre' && (
            <Button variant="ghost" size="sm" onClick={() => handleConvert(bon.id)} title="Convertir en facture" aria-label="Convertir en facture"><FileCheck className="h-4 w-4" /></Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DocumentListPage
      list={list}
      layoutClassName="container mx-auto py-6 space-y-4"
      title="Bons de livraison"
      titleIcon={Truck}
      createButton={
        <Button onClick={() => navigate('/bons-livraison/nouveau')} className="gap-2">
          <FilePlus className="h-4 w-4" /> Nouveau Bon (depuis devis)
        </Button>
      }
      statTiles={statTiles}
      searchPlaceholder="Rechercher par numéro ou client…  ( / )"
      statusChips={STATUS_CHIPS}
      shortcuts={{ newRoute: '/bons-livraison/nouveau', newDescription: 'Nouveau bon' }}
      csv={{
        filenamePrefix: 'bons_livraison',
        headers: ['N° BL', 'Client', 'Date', 'Total', 'Statut'],
        row: (b) => [
          b.numero_bl,
          `${b.client_nom || ''} ${b.client_prenom || ''}`.trim(),
          new Date(b.date_bl).toLocaleDateString('fr-FR'),
          b.total,
          b.statut,
        ],
        fetchAll: async (search, statut) => (await bonLivraisonService.exportAll(search, statut)) || [],
      }}
      bulkActions={
        <Button variant="default" size="sm" onClick={handleBulkConvert} className="gap-1">
          <FileCheck className="h-4 w-4" /> Convertir en facture
        </Button>
      }
      columns={columns}
      detailPath={(bon) => `/bons-livraison/${bon.id}`}
      rowAriaLabel={(bon) => `Sélectionner ${bon.numero_bl}`}
      emptyState={{
        icon: FileText,
        title: 'Aucun bon de livraison trouvé',
        filteredTitle: 'Aucun bon pour ces filtres',
        createAction: (
          <Button size="sm" className="gap-2" onClick={() => navigate('/bons-livraison/nouveau')}>
            <FilePlus className="h-4 w-4" />Créer un bon
          </Button>
        ),
      }}
      totalFooterLabel="bons au total"
    />
  );
}
