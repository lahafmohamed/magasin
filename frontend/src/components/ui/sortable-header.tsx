import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}

/** Bascule l'état de tri pour une colonne (helper réutilisable). */
export function toggleSort<K extends string>(
  current: SortState<K> | null,
  key: K
): SortState<K> {
  if (current?.key === key) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: 'asc' };
}

interface SortableHeaderProps<K extends string> {
  columnKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  children: React.ReactNode;
  className?: string;
  /** Aligne l'icône à droite (colonnes numériques). */
  align?: 'left' | 'right';
}

/**
 * En-tête de colonne triable : affiche une icône de direction,
 * expose aria-sort, et déclenche onSort au clic/clavier.
 */
export function SortableHeader<K extends string>({
  columnKey,
  sort,
  onSort,
  children,
  className,
  align = 'left',
}: SortableHeaderProps<K>) {
  const active = sort?.key === columnKey;
  const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead aria-sort={ariaSort} className={cn('p-0', className)}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={cn(
          'flex w-full items-center gap-1.5 px-2 sm:px-4 py-2 font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
          align === 'right' ? 'justify-end' : 'justify-start'
        )}
      >
        {align === 'right' && (
          <Icon className={cn('h-3.5 w-3.5', active ? 'opacity-100' : 'opacity-40')} />
        )}
        <span>{children}</span>
        {align === 'left' && (
          <Icon className={cn('h-3.5 w-3.5', active ? 'opacity-100' : 'opacity-40')} />
        )}
      </button>
    </TableHead>
  );
}
