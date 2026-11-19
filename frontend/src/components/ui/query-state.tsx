import * as React from 'react';
import { AlertCircle, RefreshCw, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getErrorMessage } from '@/utils/errors';

/**
 * Titre par défaut de l'état d'erreur. Les pages précisent l'objet avec
 * `errorTitle` (« Impossible de charger les relances »).
 */
export const QUERY_ERROR_TITLE = 'Impossible de charger les données';

interface QueryStateBaseProps {
  /** Chargement en cours — affiche le skeleton. */
  loading: boolean;
  /** Erreur de chargement (message ou objet). Affiche l'état d'erreur + « Réessayer ». */
  error?: unknown;
  /** Callback du bouton « Réessayer ». */
  onRetry?: () => void;
  /** Skeleton à afficher pendant le chargement (TableSkeleton, CardSkeleton, …). */
  skeleton: React.ReactNode;
  /** Titre de l'état d'erreur : « Impossible de charger <l'objet> ». */
  errorTitle?: string;
  /** Contenu de l'état vide : à quoi sert la liste, que faire ensuite. */
  emptyDescription?: React.ReactNode;
  emptyIcon?: LucideIcon;
  /** Action suivante proposée dans l'état vide (« Créer une facture »). */
  emptyAction?: React.ReactNode;
  /** États vide et d'erreur resserrés, pour un bloc secondaire (carte de fiche, panneau). */
  compact?: boolean;
  className?: string;
  /** Contenu réel (données chargées). */
  children: React.ReactNode;
}

/**
 * `isEmpty` exige un `emptyTitle` : un « Aucune donnée » générique ne dit ni ce
 * qui manque ni quoi faire.
 */
type QueryStateProps = QueryStateBaseProps &
  (
    | { /** Vrai quand les données sont chargées mais vides. */ isEmpty: boolean; emptyTitle: string }
    | { isEmpty?: undefined; emptyTitle?: string }
  );

/** Bloc d'erreur de chargement — partagé avec `DocumentListPage`. */
export function QueryErrorState({
  error,
  title = QUERY_ERROR_TITLE,
  onRetry,
  compact = false,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  /** Version resserrée, comme `EmptyState compact`. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 text-center',
        compact ? 'py-6' : 'py-12',
        className
      )}
    >
      <AlertCircle className={cn('text-danger-600', compact ? 'h-8 w-8' : 'h-10 w-10')} aria-hidden="true" />
      {/* `role="alert"` porté par le seul message : sur le conteneur, le
          lecteur d'écran relisait aussi l'icône et le bouton « Réessayer ». */}
      <div className="max-w-prose space-y-1" role="alert">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{getErrorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1 h-9 gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Réessayer
        </Button>
      )}
    </div>
  );
}

/**
 * Portillon d'état pour un fetch : gère chargement → erreur (avec réessai) →
 * vide → données, avec des états visuels cohérents à la place d'un spinner brut
 * et des échecs silencieux (un échec ne doit jamais ressembler à « zéro »).
 *
 *   <QueryState loading={loading} error={err} isEmpty={rows.length === 0}
 *     onRetry={load} skeleton={<TableSkeleton rows={8} columns={6} />}
 *     errorTitle="Impossible de charger les factures"
 *     emptyTitle="Aucune facture pour le moment"
 *     emptyDescription="Les factures créées ici ou depuis un bon de livraison apparaîtront dans cette liste"
 *     emptyAction={<Button>Créer une facture</Button>}>
 *     <Table>…</Table>
 *   </QueryState>
 */
export function QueryState({
  loading,
  error,
  isEmpty,
  onRetry,
  skeleton,
  errorTitle,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
  compact = false,
  className,
  children,
}: QueryStateProps) {
  if (loading) {
    // `aria-busy` sur le conteneur du squelette, pas sur une région live.
    return (
      <div className={className} aria-busy="true">
        {skeleton}
      </div>
    );
  }

  if (error) {
    return (
      <QueryErrorState error={error} title={errorTitle} onRetry={onRetry} compact={compact} className={className} />
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        className={className}
        icon={emptyIcon}
        title={emptyTitle ?? 'Aucun élément à afficher'}
        description={emptyDescription}
        action={emptyAction}
        compact={compact}
      />
    );
  }

  return <>{children}</>;
}
