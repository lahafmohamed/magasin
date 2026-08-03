import * as React from 'react';
import { AlertCircle, RefreshCw, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getErrorMessage } from '@/utils/errors';

interface QueryStateProps {
  /** Chargement en cours — affiche le skeleton. */
  loading: boolean;
  /** Erreur de chargement (message ou objet). Affiche l'état d'erreur + « Réessayer ». */
  error?: unknown;
  /** Vrai quand les données sont chargées mais vides. Affiche l'EmptyState. */
  isEmpty?: boolean;
  /** Callback du bouton « Réessayer ». */
  onRetry?: () => void;
  /** Skeleton à afficher pendant le chargement (TableSkeleton, CardSkeleton, …). */
  skeleton: React.ReactNode;
  /** Contenu de l'état vide. */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: React.ReactNode;
  className?: string;
  /** Contenu réel (données chargées). */
  children: React.ReactNode;
}

/**
 * Portillon d'état pour un fetch : gère chargement → erreur (avec réessai) →
 * vide → données, avec des états visuels cohérents à la place d'un spinner brut
 * et des échecs silencieux (skill §3 progressive-loading, §8 error-recovery).
 *
 *   <QueryState loading={loading} error={err} isEmpty={rows.length === 0}
 *     onRetry={load} skeleton={<TableSkeleton rows={8} columns={6} />}
 *     emptyTitle="Aucune facture">
 *     <Table>…</Table>
 *   </QueryState>
 */
export function QueryState({
  loading,
  error,
  isEmpty,
  onRetry,
  skeleton,
  emptyTitle = 'Aucune donnée',
  emptyDescription,
  emptyIcon,
  emptyAction,
  className,
  children,
}: QueryStateProps) {
  if (loading) {
    return <div className={className}>{skeleton}</div>;
  }

  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 py-12 text-center',
          className
        )}
        role="alert"
      >
        <AlertCircle className="h-10 w-10 text-destructive opacity-80" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Échec du chargement</p>
          <p className="text-sm text-muted-foreground">{getErrorMessage(error)}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-1 gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        className={className}
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return <>{children}</>;
}
