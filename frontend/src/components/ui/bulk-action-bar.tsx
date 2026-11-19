import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Sticky bar shown when one or more rows are selected. Displays the selection
 * count, a clear button, and caller-supplied action buttons (children).
 *
 * Collée sous la Topbar (56 px + 16 px) et non à 8 px du haut : elle passait
 * derrière l'en-tête collant. Le décompte est une région `status` : chaque
 * sélection est annoncée.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-[4.5rem] z-20 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-2 shadow-sm">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClear} aria-label="Effacer la sélection">
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span role="status" className="text-sm font-medium">
        {count} sélectionné{count > 1 ? 's' : ''}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
