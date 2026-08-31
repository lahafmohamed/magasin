import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FilePlus, Eye, FileCheck, Trash2, Pencil, FileText } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { formatXOF } from '@/utils/format';
import { devisService } from '@/services/api';
import { toast } from 'sonner';
import { type StatTile } from '@/components/ui/stats-bar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getErrorMessage } from '@/utils/errors';
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
  client_prenom?: string;
  date_devis: string;
  date_validite: string | null;
  statut: 'brouillon' | 'envoye' | 'accepte' | 'annule' | 'converti' | string;
  total: number;
  notes: string | null;
}

interface DevisStats {
  total: { count: number; montant: number };
  en_cours: { count: number };
  mois: { count: number; montant: number };
}

const STATUS_CHIPS = [
  { value: 'all', label: 'Tous' },
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'envoye', label: 'Envoyé' },
  { value: 'accepte', label: 'Accepté' },
  { value: 'converti', label: 'Converti' },
  { value: 'annule', label: 'Annulé' },
];

const canConfirm = (statut: string) => ['brouillon', 'envoye'].includes(statut);

export default function Devis() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const list = useDocumentList<Devis, DevisStats>({
    defaultSortKey: 'date_devis',
    fetchList: (search, statut, page, limit, sortKey, sortDir) =>
      devisService.getAll(search, statut, page, limit, sortKey, sortDir),
    fetchStats: () => devisService.getStats(),
    loadErrorMessage: 'Erreur lors du chargement des devis',
  });

  const handleConfirm = async (id: number) => {
    if (!(await confirm({ title: 'Confirmer ce devis ?', description: 'Cela générera automatiquement un bon de livraison.', confirmLabel: 'Confirmer le devis' }))) return;
    try {
      await devisService.updateStatut(id, 'accepte');
      toast.success('Devis confirmé et bon de livraison généré');
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors de la confirmation du devis'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: 'Supprimer ce devis ?', description: 'Cette action est irréversible.', confirmLabel: 'Supprimer', destructive: true }))) return;
    try {
      await devisService.delete(id);
      toast.success('Devis supprimé');
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors de la suppression'));
    }
  };

  const handleBulkDelete = async () => {
    if (!(await confirm({ title: `Supprimer ${list.selected.size} devis ?`, description: 'Cette action est irréversible.', confirmLabel: 'Supprimer', destructive: true }))) return;
    const ids = [...list.selected];
    const results = await Promise.allSettled(ids.map((id) => devisService.delete(id)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok) toast.success(`${ok} devis supprimé${ok > 1 ? 's' : ''}`);
    if (ok < ids.length) toast.error(`${ids.length - ok} échec(s)`);
    list.reload();
  };

  const statTiles = (stats: DevisStats | null): StatTile[] => [
    { label: 'Total devis', value: stats ? String(stats.total.count) : '—', icon: FileText },
    { label: 'Montant total', value: stats ? formatXOF(stats.total.montant) : '—' },
    { label: 'En cours', value: stats ? String(stats.en_cours.count) : '—' },
    { label: 'Ce mois', value: stats ? String(stats.mois.count) : '—', hint: stats ? formatXOF(stats.mois.montant) : undefined },
  ];

  const columns: DocumentColumn<Devis>[] = [
    {
      header: 'Numéro',
      sortKey: 'numero_devis',
      cellClassName: 'font-mono font-semibold',
      render: (d) => d.numero_devis,
    },
    {
      header: 'Client',
      sortKey: 'client_nom',
      render: (d) => <>{d.client_nom} {d.client_prenom}</>,
    },
    {
      header: 'Date',
      sortKey: 'date_devis',
      render: (d) => new Date(d.date_devis).toLocaleDateString('fr-FR'),
    },
    {
      header: 'Validité',
      sortKey: 'date_validite',
      render: (d) => (d.date_validite ? new Date(d.date_validite).toLocaleDateString('fr-FR') : '-'),
    },
    {
      header: 'Statut',
      render: (d) => <StatusBadge type="devis" statut={d.statut} />,
    },
    {
      header: 'Total',
      sortKey: 'total',
      align: 'right',
      cellClassName: 'text-right font-medium',
      render: (d) => formatXOF(d.total),
    },
    {
      header: 'Actions',
      headClassName: 'text-right',
      cellClassName: 'text-right',
      stopPropagation: true,
      render: (d) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/devis/${d.id}`)} aria-label="Voir le devis"><Eye className="h-4 w-4" /></Button>
          {canConfirm(d.statut) && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/devis/${d.id}/edit`)} title="Modifier" aria-label="Modifier le devis"><Pencil className="h-4 w-4" /></Button>
          )}
          {canConfirm(d.statut) && (
            <Button variant="ghost" size="sm" onClick={() => handleConfirm(d.id)} title="Confirmer" aria-label="Confirmer le devis"><FileCheck className="h-4 w-4" /></Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id)} title="Supprimer" aria-label="Supprimer le devis"><Trash2 className="h-4 w-4 text-danger-600" /></Button>
        </div>
      ),
    },
  ];

  return (
    <DocumentListPage
      list={list}
      layoutClassName="container mx-auto py-6 space-y-4"
      title="Devis"
      titleIcon={FileText}
      createButton={
        <Button onClick={() => navigate('/devis/nouveau')} className="gap-2">
          <FilePlus className="h-4 w-4" /> Nouveau Devis
        </Button>
      }
      statTiles={statTiles}
      searchPlaceholder="Rechercher par numéro ou client…  ( / )"
      statusChips={STATUS_CHIPS}
      shortcuts={{ newRoute: '/devis/nouveau', newDescription: 'Nouveau devis' }}
      csv={{
        filenamePrefix: 'devis',
        headers: ['N° Devis', 'Client', 'Date', 'Validité', 'Total', 'Statut'],
        row: (d) => [
          d.numero_devis,
          `${d.client_nom || ''} ${d.client_prenom || ''}`.trim(),
          new Date(d.date_devis).toLocaleDateString('fr-FR'),
          d.date_validite ? new Date(d.date_validite).toLocaleDateString('fr-FR') : '',
          d.total,
          d.statut,
        ],
        fetchAll: async (search, statut) => (await devisService.exportAll(search, statut)) || [],
      }}
      bulkActions={
        <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-1">
          <Trash2 className="h-4 w-4" /> Supprimer
        </Button>
      }
      columns={columns}
      detailPath={(d) => `/devis/${d.id}`}
      rowAriaLabel={(d) => `Sélectionner ${d.numero_devis}`}
      emptyState={{
        icon: FileText,
        title: 'Aucun devis trouvé',
        filteredTitle: 'Aucun devis pour ces filtres',
        createAction: (
          <Button size="sm" className="gap-2" onClick={() => navigate('/devis/nouveau')}>
            <FilePlus className="h-4 w-4" />Créer un devis
          </Button>
        ),
      }}
      totalFooterLabel="devis au total"
    />
  );
}
