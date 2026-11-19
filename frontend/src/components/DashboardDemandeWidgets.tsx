import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { demandeService, type Page } from '../services/api';
import { usePermission, Permissions } from '../hooks/usePermission';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/skeleton';
import { QueryErrorState } from '@/components/ui/query-state';
import { DocumentCode } from '@/components/ui/document-code';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import { formatDate, formatNumber } from '../utils/format';

/** Volume lu pour le résumé ; au-delà, le résumé le dit (voir `truncated`). */
const FETCH_LIMIT = 100;

interface DemandeRow {
  id: number;
  numero: string;
  statut: string;
  magasin_nom?: string;
  depot_nom?: string;
  date_creation: string;
}

type StatusKey =
  | 'brouillon'
  | 'envoyee'
  | 'approuvee'
  | 'partiellement_approuvee'
  | 'refusee'
  | 'livree'
  | 'cloturee';

interface DemandeStats {
  total: number;
  /** Plus de demandes en base que de lignes lues : les compteurs par statut sont partiels. */
  truncated: boolean;
  byStatus: Record<StatusKey, number>;
}

/**
 * Répartition affichée : libellés au pluriel alignés sur les pastilles de statut
 * (`StatusBadge`, type « demande »). « En cours de livraison » n'apparaît pas :
 * l'exécution livre dans la même transaction, ce statut n'est jamais conservé.
 */
const SUMMARY: { key: StatusKey; label: string }[] = [
  { key: 'brouillon', label: 'Brouillons' },
  { key: 'envoyee', label: 'Envoyées' },
  { key: 'approuvee', label: 'Approuvées' },
  { key: 'partiellement_approuvee', label: 'Partiellement approuvées' },
  { key: 'refusee', label: 'Refusées' },
  { key: 'livree', label: 'Livrées' },
  { key: 'cloturee', label: 'Clôturées' },
];

/** Une ligne « À faire » : un compte, ce qu'il reste à faire, la liste filtrée. */
interface TodoRow {
  key: string;
  n: number;
  label: string;
  to: string;
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

const TITLE = 'Demandes de réapprovisionnement';

export interface DashboardDemandeWidgetsProps {
  /**
   * Lien « Tout voir » de l'en-tête « Demandes récentes », fourni par la page
   * pour qu'il ait le dessin des autres cartes du tableau de bord.
   */
  seeAll?: ReactNode;
}

export function DashboardDemandeWidgets({ seeAll }: DashboardDemandeWidgetsProps = {}) {
  const { hasPermission } = usePermission();
  const todoId = useId();
  const byStatusId = useId();
  const [stats, setStats] = useState<DemandeStats | null>(null);
  const [recentDemandes, setRecentDemandes] = useState<DemandeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = (await demandeService.getAll({ limit: FETCH_LIMIT })) as Page<DemandeRow> | DemandeRow[];
      const demandes: DemandeRow[] = Array.isArray(response) ? response : response?.data ?? [];
      const total = Array.isArray(response) ? demandes.length : response?.pagination?.total ?? demandes.length;
      const byStatus = Object.fromEntries(
        SUMMARY.map(({ key }) => [key, demandes.filter((d) => d.statut === key).length])
      ) as Record<StatusKey, number>;

      setStats({ total, truncated: total > demandes.length, byStatus });
      // Copie avant le tri : ne pas muter l'état
      setRecentDemandes(
        [...demandes]
          .sort((a, b) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime())
          .slice(0, 5)
      );
    } catch (err) {
      // Widget secondaire : l'échec reste dans sa carte, avec un réessai, au lieu
      // de faire disparaître la section sans un mot.
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Créer n'a de sens que si l'on peut aussi envoyer : le caissier ne le peut pas.
  const canCreate = hasPermission(Permissions.DEMANDE_CREATE) && hasPermission(Permissions.DEMANDE_SEND);
  const canDecide = hasPermission(Permissions.DEMANDE_DECIDE);
  const canExecute = hasPermission(Permissions.DEMANDE_EXECUTE);
  const canClose = hasPermission(Permissions.DEMANDE_CLOSE);
  const canAct = canCreate || canDecide || canExecute || canClose;
  const ready = !loading && !error && stats !== null;

  let body: ReactNode;
  if (loading) {
    body = (
      <>
        <CardSkeleton lines={3} />
        <span className="sr-only" role="status">
          Chargement des demandes…
        </span>
      </>
    );
  } else if (!ready) {
    body = (
      <QueryErrorState
        error={error}
        title="Impossible de charger les demandes"
        onRetry={() => void loadStats()}
        className="py-6"
      />
    );
  } else {
    const s = stats.byStatus;
    const pendingExecution = s.approuvee + s.partiellement_approuvee;
    // Un seul statut en attente : lien filtré exact ; les deux : liste complète.
    const executeLink =
      s.partiellement_approuvee === 0
        ? '/demandes?statut=approuvee'
        : s.approuvee === 0
          ? '/demandes?statut=partiellement_approuvee'
          : '/demandes';
    // Ce que le rôle peut faire avancer, dans l'ordre de ses files ; une file
    // vide n'a pas de ligne (le décompte par statut, plus bas, dit ses zéros).
    const todo = (
      [
        canDecide && { key: 'decide', n: s.envoyee, label: 'à décider', to: '/demandes?statut=envoyee' },
        canExecute && { key: 'execute', n: pendingExecution, label: 'à exécuter', to: executeLink },
        canClose && { key: 'close', n: s.livree, label: 'à clôturer', to: '/demandes?statut=livree' },
        canCreate && {
          key: 'send',
          n: s.brouillon,
          label: s.brouillon > 1 ? 'brouillons à envoyer' : 'brouillon à envoyer',
          to: '/demandes?statut=brouillon',
        },
      ] as (TodoRow | false)[]
    ).filter((row): row is TodoRow => row !== false && row.n > 0);

    body = (
      <div className="space-y-4">
        {/* Les files du rôle, en liens discrets : elles ne répètent plus, en
            cartes et boutons, le bandeau « À traiter » du haut de page. */}
        {canAct && (
          // Pas d'écart sous le libellé : la hauteur des lignes (cible tactile)
          // le donne déjà, au même 8 px que « Par statut » sur ordinateur.
          <div>
            <p id={todoId} className="text-xs font-medium text-muted-foreground">
              À faire
            </p>
            {todo.length > 0 ? (
              <ul aria-labelledby={todoId} className="-mx-2 flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-2">
                {todo.map((row) => (
                  <li key={row.key}>
                    {/* Pas de transition sur le survol d'une ligne de liste (interaction fréquente). */}
                    <Link
                      to={row.to}
                      className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
                    >
                      <span className="font-medium tabular-nums">{formatNumber(row.n)}</span> {row.label}{' '}
                      {/* Hors contexte (liste des liens), « 1 à décider » ne dit pas quoi. */}
                      <span className="sr-only">: demandes</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Aucune demande à faire avancer pour le moment</p>
            )}
          </div>
        )}

        {/* Décompte : une ligne de « statut nombre », chaque entrée ouvre la liste filtrée. */}
        <div className="space-y-1">
          <p id={byStatusId} className="text-xs font-medium text-muted-foreground">
            Par statut
          </p>
          <ul aria-labelledby={byStatusId} className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {SUMMARY.map(({ key, label }) => (
              <li key={key}>
                <Link
                  to={`/demandes?statut=${key}`}
                  className="inline-flex min-h-6 items-baseline gap-1.5 rounded-sm py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* Espace explicite : le nom du lien est « Brouillons 1 », pas « Brouillons1 ». */}
                  {label}{' '}
                  <span className="tabular-nums text-foreground">{formatNumber(s[key])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card aria-busy={loading || undefined}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle>{TITLE}</CardTitle>
              {ready && (
                <CardDescription className="text-pretty">
                  {stats.truncated
                    ? `Répartition des ${formatNumber(FETCH_LIMIT)} demandes les plus récentes sur ${plural(stats.total, 'demande', 'demandes')}`
                    : `${plural(stats.total, 'demande', 'demandes')} au total`}
                </CardDescription>
              )}
            </div>
            {/* Le bouton plein de la page est « Nouvelle facture » : ici, contour.
                Créer ne dépend pas du décompte : l'action reste là pendant le
                chargement et après un échec. */}
            {canCreate && (
              <Link
                to="/demandes/nouvelle"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
              >
                Nouvelle demande
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>

      {/* Dernières demandes */}
      {ready && recentDemandes.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle>Demandes récentes</CardTitle>
              {seeAll}
            </div>
          </CardHeader>
          <CardContent>
            <ul className="-mx-2 divide-y">
              {recentDemandes.map((demande) => (
                <li key={demande.id}>
                  {/* Pas de transition sur le survol d'une ligne de liste (interaction fréquente). */}
                  <Link
                    to={`/demandes/${demande.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 sm:flex sm:items-center sm:gap-3">
                      <DocumentCode className="text-sm">{demande.numero}</DocumentCode>
                      {/* Sens de la marchandise, comme sur Transferts : du dépôt vers le magasin. */}
                      <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                        <span className="truncate">{demande.depot_nom || '—'}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="sr-only"> vers </span>
                        <span className="truncate">{demande.magasin_nom || '—'}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <StatusBadge type="demande" statut={demande.statut} />
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(demande.date_creation)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DashboardDemandeWidgets;
