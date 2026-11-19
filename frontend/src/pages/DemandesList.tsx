import { Link } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { demandeService, type Page } from '@/services/api';
import { usePermission, Permissions } from '@/hooks/usePermission';
import { buttonVariants } from '@/components/ui/button';
import { DocumentCode } from '@/components/ui/document-code';
import { DataCard, DataCardRow } from '@/components/ui/responsive-table';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { DocumentListPage, useDocumentList, type DocumentColumn } from '@/components/DocumentListPage';
import { cn } from '@/lib/utils';
import { formatDate, formatDateNumeric, normalizeSearch } from '@/utils/format';

interface Demande {
  id: number;
  numero: string;
  statut: string;
  magasin_nom: string;
  depot_nom: string;
  magasin_code: string;
  depot_code: string;
  created_by_nom: string | null;
  created_by_username?: string | null;
  date_creation: string;
  date_envoi: string | null;
  numero_transfer: string | null;
}

type RoleGroup = 'supervisor' | 'depot' | 'magasin' | 'lecture';

function roleGroup(role: string): RoleGroup {
  if (role === 'admin' || role === 'manager') return 'supervisor';
  if (role === 'depot_staff') return 'depot';
  if (role === 'magasin_staff') return 'magasin';
  return 'lecture';
}

/** Ce que chaque rôle lit en tête de liste et dans l'état vide (copy.md, section e). */
const ROLE_COPY: Record<RoleGroup, { subtitle: string; emptyTitle: string; emptyDescription: string }> = {
  supervisor: {
    subtitle: 'Toutes les demandes de stock entre magasins et dépôt',
    emptyTitle: 'Aucune demande de réapprovisionnement',
    emptyDescription: 'Les demandes de stock entre magasins et dépôt apparaîtront ici',
  },
  depot: {
    subtitle: 'Décidez et exécutez les demandes envoyées par les magasins',
    emptyTitle: 'Aucune demande à traiter',
    emptyDescription: 'Les demandes envoyées par les magasins apparaîtront ici',
  },
  magasin: {
    subtitle: 'Demandez au dépôt les produits qui manquent en magasin, puis confirmez leur réception',
    emptyTitle: 'Aucune demande pour le moment',
    emptyDescription: 'Demandez au dépôt les produits qui manquent en magasin',
  },
  lecture: {
    subtitle: 'Les demandes de stock de votre magasin auprès du dépôt',
    emptyTitle: 'Aucune demande pour le moment',
    emptyDescription: 'Les demandes de stock de votre magasin apparaîtront ici',
  },
};

/**
 * Le serveur n'accepte pas encore de paramètre `search` sur `/demandes`
 * (« Needs from BE ») : en recherche, on lit la fenêtre des demandes les plus
 * récentes et on filtre ici, puis on pagine. À retirer dès que l'API filtre.
 */
const SEARCH_WINDOW = 500;

function matchesSearch(d: Demande, search: string): boolean {
  const q = normalizeSearch(search);
  if (!q) return true;
  return [d.numero, d.magasin_nom, d.depot_nom, d.created_by_nom ?? '', d.numero_transfer ?? ''].some((v) =>
    normalizeSearch(v).includes(q)
  );
}

async function fetchDemandes(search: string, statut: string | undefined, page: number, limit: number) {
  if (!search) {
    return (await demandeService.getAll({ statut, page, limit })) as Page<Demande>;
  }
  const window = (await demandeService.getAll({ statut, page: 1, limit: SEARCH_WINDOW })) as Page<Demande>;
  const rows = (window?.data ?? []).filter((d) => matchesSearch(d, search));
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
  } satisfies Page<Demande>;
}

/** Nombre de demandes d'un statut (toutes sans statut), lu dans la pagination du serveur. */
async function countDemandes(statut?: string): Promise<number> {
  const res = (await demandeService.getAll({ statut, page: 1, limit: 1 })) as Page<Demande>;
  return res?.pagination?.total ?? 0;
}

const CSV_HEADERS = ['N° de demande', 'Magasin', 'Dépôt', 'Statut', 'Date', 'Créée par', 'Transfert'];
const csvRow = (d: Demande) => [
  d.numero,
  d.magasin_nom,
  d.depot_nom,
  getStatusLabel('demande', d.statut),
  formatDateNumeric(d.date_creation),
  d.created_by_nom ?? '',
  d.numero_transfer ?? '',
];

export default function DemandesList() {
  const { hasPermission, userRole } = usePermission();
  const group = roleGroup(userRole);
  const copy = ROLE_COPY[group];
  // Pour le personnel dépôt, le dépôt est toujours le sien : la colonne ne dit rien.
  const showDepot = group !== 'depot';

  // Créer n'a de sens que si l'on peut aussi envoyer : le caissier pouvait créer
  // un brouillon que l'API refusait ensuite d'envoyer (U-13).
  const canCreate = hasPermission(Permissions.DEMANDE_CREATE) && hasPermission(Permissions.DEMANDE_SEND);
  const canEdit = hasPermission(Permissions.DEMANDE_UPDATE);
  const canDecide = hasPermission(Permissions.DEMANDE_DECIDE);
  const canExecute = hasPermission(Permissions.DEMANDE_EXECUTE);
  const canClose = hasPermission(Permissions.DEMANDE_CLOSE);

  const statusChips = [
    { value: 'all', label: 'Toutes' },
    // `en_cours` n'est jamais conservé (l'exécution livre dans la même transaction) ;
    // le dépôt ne voit pas les brouillons des magasins.
    ...getStatusOptions('demande', {
      exclude: group === 'depot' ? ['brouillon', 'en_cours'] : ['en_cours'],
    }),
  ];

  const list = useDocumentList<Demande, Record<string, number>>({
    defaultSortKey: 'date',
    fetchList: (search, statut, page, limit) => fetchDemandes(search, statut, page, limit),
    // Un décompte serveur par puce (jamais un comptage de la page affichée) :
    // « Envoyée 2 », « Livrée 1 »… La rangée de tuiles « À décider »,
    // « À exécuter » ne faisait que répéter ces puces.
    fetchStats: async () => {
      const counts = await Promise.all(
        statusChips.map((c) => countDemandes(c.value === 'all' ? undefined : c.value))
      );
      return Object.fromEntries(statusChips.map((c, i) => [c.value, counts[i]]));
    },
    loadErrorMessage: 'Impossible de charger les demandes.',
  });

  /** La prochaine étape qui revient À CET UTILISATEUR, en verbe ; rien pour un état passif (VB-DEM-02). */
  const nextStep = (d: Demande): { label: string; to: string } | null => {
    switch (d.statut) {
      case 'brouillon':
        return canEdit ? { label: 'Modifier ou envoyer', to: `/demandes/${d.id}/edit` } : null;
      case 'envoyee':
        return canDecide ? { label: 'Décider', to: `/demandes/${d.id}?action=decider` } : null;
      case 'approuvee':
      case 'partiellement_approuvee':
        return canExecute ? { label: 'Exécuter', to: `/demandes/${d.id}` } : null;
      case 'livree':
        return canClose ? { label: 'Clôturer', to: `/demandes/${d.id}?action=cloturer` } : null;
      default:
        return null;
    }
  };

  const stepLink = (d: Demande) => {
    const step = nextStep(d);
    if (!step) return null;
    // Largeur minimale commune, celle du plus long libellé (« Modifier ou
    // envoyer ») : les quatre étapes commencent au même bord d'une ligne à l'autre.
    return (
      <Link
        to={step.to}
        className={cn(buttonVariants({ variant: 'outline', size: 'touch' }), 'whitespace-nowrap sm:min-w-44')}
        aria-label={`${step.label} — demande ${d.numero}`}
        onClick={(e) => e.stopPropagation()}
      >
        {step.label}
      </Link>
    );
  };

  const columns: DocumentColumn<Demande>[] = [
    {
      header: 'N° de demande',
      primary: true,
      render: (d) => d.numero,
    },
    {
      header: 'Magasin',
      render: (d) => <span title={d.magasin_code}>{d.magasin_nom}</span>,
    },
    ...(showDepot
      ? [
          {
            header: 'Dépôt',
            render: (d: Demande) => <span title={d.depot_code}>{d.depot_nom}</span>,
          },
        ]
      : []),
    {
      header: 'Statut',
      card: 'badge',
      render: (d) => <StatusBadge type="demande" statut={d.statut} />,
    },
    {
      header: 'Date',
      render: (d) => <span className="whitespace-nowrap">{formatDate(d.date_creation)}</span>,
    },
    {
      header: 'Créée par',
      render: (d) => d.created_by_nom || d.created_by_username || '—',
    },
    {
      header: <span className="sr-only">Étape suivante</span>,
      card: 'actions',
      stopPropagation: true,
      // Toutes les lignes à la hauteur de celles qui portent une étape.
      cellClassName: 'h-14 text-right',
      render: (d) => stepLink(d),
    },
  ];

  const renderCard = (d: Demande) => (
    <DataCard
      key={d.id}
      href={`/demandes/${d.id}`}
      title={<DocumentCode>{d.numero}</DocumentCode>}
      linkLabel={`Ouvrir la demande ${d.numero}`}
      badge={<StatusBadge type="demande" statut={d.statut} />}
      actions={stepLink(d)}
    >
      <DataCardRow label="Magasin" value={d.magasin_nom} />
      {showDepot && <DataCardRow label="Dépôt" value={d.depot_nom} />}
      <DataCardRow label="Date" value={formatDate(d.date_creation)} />
      {d.numero_transfer && (
        <DataCardRow label="Transfert" value={<DocumentCode>{d.numero_transfer}</DocumentCode>} />
      )}
    </DataCard>
  );

  const createButton = canCreate ? (
    <Link to="/demandes/nouvelle" className={cn(buttonVariants({ size: 'touch' }), 'gap-2')}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      Nouvelle demande
    </Link>
  ) : null;

  return (
    <DocumentListPage<Demande, Record<string, number>>
      list={list}
      title="Demandes de réapprovisionnement"
      subtitle={copy.subtitle}
      createButton={createButton}
      chipCounts={(stats) => stats}
      searchPlaceholder="Numéro, magasin ou dépôt… ( / )"
      searchLabel="Rechercher une demande"
      statusChips={statusChips}
      shortcuts={{ newRoute: '/demandes/nouvelle', newDescription: 'Nouvelle demande' }}
      csv={{
        filenamePrefix: 'demandes',
        headers: CSV_HEADERS,
        row: csvRow,
        fetchAll: async (search, statut) => {
          const res = (await demandeService.getAll({ statut, page: 1, limit: 1000 })) as Page<Demande>;
          return (res?.data ?? []).filter((d) => matchesSearch(d, search));
        },
      }}
      columns={columns}
      detailPath={(d) => `/demandes/${d.id}`}
      selectable={false}
      itemNoun={{ one: 'demande', many: 'demandes' }}
      emptyState={{
        icon: ClipboardList,
        title: copy.emptyTitle,
        description: copy.emptyDescription,
        filteredTitle: list.committedSearch
          ? `Aucune demande ne correspond à « ${list.committedSearch} »`
          : 'Aucune demande avec ce statut',
        filteredDescription: list.committedSearch
          ? 'Vérifiez le numéro, le magasin ou le dépôt'
          : 'Choisissez un autre statut ou affichez toutes les demandes',
        createAction: createButton,
      }}
      renderCard={renderCard}
    />
  );
}
