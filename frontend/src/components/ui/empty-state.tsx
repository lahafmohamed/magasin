import type { ReactNode } from 'react';
import { LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  /** Ce qui est vide, dit simplement (« Aucune facture pour le moment »). */
  title: string;
  /** À quoi sert la liste et que faire ensuite. */
  description?: ReactNode;
  /** L'action suivante (« Créer une facture », « Effacer les filtres »). */
  action?: ReactNode;
  /** Version resserrée pour un bloc secondaire (carte de fiche, panneau). */
  compact?: boolean;
  className?: string;
}

/**
 * État vide standard : icône atténuée + titre + description + action.
 * Un état vide oriente : il dit à quoi sert l'écran et propose la suite,
 * pas seulement « Aucun résultat ».
 * À placer dans une cellule de tableau (avec colSpan) ou une zone de contenu.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground',
        compact ? 'py-6' : 'py-12',
        className
      )}
    >
      <Icon className={cn('opacity-40', compact ? 'h-8 w-8' : 'h-10 w-10')} aria-hidden="true" />
      <div className="max-w-prose space-y-1">
        <p className="text-sm font-medium text-foreground text-balance">{title}</p>
        {description && <p className="text-sm text-pretty">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
