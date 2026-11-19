import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DocumentLifecycleStep {
  label: string;
  numero?: string | null;
  to?: string | null;
  current?: boolean;
}

interface DocumentLifecycleProps {
  steps: DocumentLifecycleStep[];
  className?: string;
  /** Nom de la liste pour les lecteurs d'écran. */
  'aria-label'?: string;
}

/**
 * Chaîne d'un document (Devis → Bon de livraison → Facture → Avoir).
 *
 * Liste ordonnée : l'étape affichée porte `aria-current="step"`, les étapes
 * existantes sont des liens. Les étapes passent à la ligne au lieu de défiler
 * (le bandeau défilant n'était pas atteignable au clavier — axe
 * `scrollable-region-focusable`), et leurs libellés ne sont plus estompés
 * (`opacity-70` tombait à 2,71:1).
 *
 * Sous 640 px : une grille de deux colonnes (une seule sous 360 px), sans
 * chevrons — en passant à la ligne, un « › » ouvrait la deuxième rangée.
 */
export function DocumentLifecycle({
  steps,
  className,
  'aria-label': ariaLabel = 'Cycle du document',
}: DocumentLifecycleProps) {
  // Seules les pièces qui existent : trois cases en pointillé « — » autour
  // d'une facture créée seule ne renseignaient rien. Une pièce sans amont ni
  // aval n'a pas de chaîne à montrer.
  const shown = steps.filter((step) => !!step.numero || step.current);
  if (shown.length < 2) return null;
  return (
    <ol
      aria-label={ariaLabel}
      className={cn(
        'grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-stretch sm:gap-1',
        className
      )}
    >
      {shown.map((step, idx) => {
        const hasDoc = !!step.numero;
        const isLink = hasDoc && !!step.to && !step.current;

        const body = (
          <>
            <span className="text-xs text-muted-foreground">
              {step.label}
            </span>
            <span
              className={cn(
                'whitespace-nowrap text-sm leading-tight',
                hasDoc && 'font-mono',
                step.current && 'font-medium text-foreground',
                isLink && 'text-foreground underline-offset-4 group-hover:underline',
                !hasDoc && 'text-muted-foreground'
              )}
            >
              {hasDoc ? step.numero : '—'}
            </span>
          </>
        );

        const pillClass = cn(
          'flex w-full min-w-0 flex-col items-start justify-center rounded-lg border px-3 py-1.5 sm:w-auto sm:min-w-[6.5rem]',
          step.current && 'border-foreground/30 bg-accent',
          !hasDoc && 'border-dashed',
          isLink &&
            'group transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        );

        return (
          <li key={idx} className="flex min-w-0 items-center gap-1">
            {idx > 0 && (
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
            )}
            {isLink ? (
              <Link to={step.to as string} className={pillClass}>
                {body}
              </Link>
            ) : (
              <div className={pillClass} aria-current={step.current ? 'step' : undefined}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
