import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Écran de chargement plein écran avec un spinner centré.
 * Utilisé notamment comme fallback de Suspense.
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Spinner inline réutilisable. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden="true" />;
}

/**
 * État de chargement centré (zone de contenu, pas plein écran).
 * Utilisable dans une cellule de tableau via `inCell`.
 */
export function LoadingState({
  message = 'Chargement…',
  inCell = false,
}: {
  message?: string;
  inCell?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-muted-foreground',
        inCell ? 'py-12' : 'py-16'
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin opacity-60" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
