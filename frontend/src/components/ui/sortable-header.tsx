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
  /** Raccourci pour une colonne de montants / quantités (= `align="right"`). */
  numeric?: boolean;
  buttonClassName?: string;
}

/**
 * En-tête de colonne triable : affiche une icône de direction, expose `aria-sort`
 * sur la seule colonne triée, et déclenche onSort au clic/clavier. Le libellé ne
 * passe jamais à la ligne (« Créée / par » sur deux lignes).
 */
export function SortableHeader<K extends string>({
  columnKey,
  sort,
  onSort,
  children,
  className,
  align,
  numeric = false,
  buttonClassName,
}: SortableHeaderProps<K>) {
  const side = align ?? (numeric ? 'right' : 'left');
  const active = sort?.key === columnKey;
  // `aria-sort` uniquement sur la colonne active (APG) : `none` partout ailleurs
  // faisait annoncer « non trié » à chaque en-tête.
  const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined;
  const Icon = active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const icon = (
    <Icon
      aria-hidden="true"
      className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-foreground' : 'text-muted-foreground')}
    />
  );

  return (
    <TableHead aria-sort={ariaSort} numeric={side === 'right'} className={cn('p-0', className)}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={cn(
          'flex h-10 w-full items-center gap-1.5 whitespace-nowrap rounded-sm px-3 font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          side === 'right' ? 'justify-end' : 'justify-start',
          active && 'text-foreground',
          buttonClassName
        )}
      >
        {side === 'right' && icon}
        <span>{children}</span>
        {side === 'left' && icon}
      </button>
    </TableHead>
  );
}
