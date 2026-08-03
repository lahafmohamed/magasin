import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Écran de chargement plein écran avec un spinner centré.
 * Utilisé notamment comme fallback de Suspense.
 */
export function LoadingScreen({ message = 'Chargement…' }: { message?: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      role="status"
      aria-busy="true"
    >
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{message}</span>
    </div>
  );
}

/**
 * Spinner inline réutilisable — décoratif par défaut (le libellé vient du
 * contexte : texte du bouton, `LoadingState`, `aria-busy` du conteneur).
 *
 * Tailles alignées sur l'échelle d'icônes : sm = 16px, md = 24px, lg = 32px.
 */
export function Spinner({
  className,
  size = 'sm',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' } as const;
  return <Loader2 className={cn(sizes[size], 'animate-spin', className)} aria-hidden="true" />;
}

/**
 * État de chargement centré (zone de contenu, pas plein écran).
 * Utilisable dans une cellule de tableau via `inCell`.
 */
export function LoadingState({
  message = 'Chargement…',
  inCell = false,
  className,
}: {
  message?: string;
  inCell?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-muted-foreground',
        inCell ? 'py-12' : 'py-16',
        className
      )}
      role="status"
      aria-busy="true"
    >
      <Spinner size="lg" className="opacity-60" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

/**
 * Chargement d'une page entière (retour anticipé d'une page avant que ses
 * données soient prêtes). Remplace les `<Loader2 className="animate-spin">`
 * recopiés dans chaque page — voir DESIGN-AUDIT.md §3.
 */
export function PageLoading({ message = 'Chargement…' }: { message?: string }) {
  return (
    <div
      className="flex min-h-[50vh] items-center justify-center"
      role="status"
      aria-busy="true"
    >
      <Spinner size="md" className="text-muted-foreground" />
      <span className="sr-only">{message}</span>
    </div>
  );
}
