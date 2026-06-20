import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Sticky bar shown when one or more rows are selected. Displays the selection
 * count, a clear button, and caller-supplied action buttons (children).
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
    <div className="sticky top-2 z-20 flex items-center gap-3 rounded-lg border bg-card px-4 py-2 shadow-sm">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear} aria-label="Effacer la sélection">
        <X className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium">{count} sélectionné{count > 1 ? 's' : ''}</span>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
