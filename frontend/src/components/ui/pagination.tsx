import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

export function Pagination({ page, totalPages, total, limit, onPageChange, onLimitChange }: PaginationProps) {
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <nav
      className="flex flex-col gap-3 px-2 py-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Pagination"
    >
      <div className="text-center text-sm text-muted-foreground sm:text-left" aria-live="polite">
        {total > 0 ? (
          <>
            Affichage de <span className="font-medium">{startItem}</span> à{' '}
            <span className="font-medium">{endItem}</span> sur{' '}
            <span className="font-medium">{total}</span> résultats
          </>
        ) : (
          'Aucun résultat'
        )}
      </div>
      
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
        {/* Le libellé suit le Select : sans `onLimitChange` il restait seul,
            à annoncer un contrôle absent (Employés, Tiers). */}
        {onLimitChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Lignes par page</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => onLimitChange(parseInt(v))}
            >
              <SelectTrigger className="h-9 w-[72px] text-xs" aria-label="Lignes par page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            aria-label="Première page"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-sm font-medium">
            Page {page} sur {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            aria-label="Dernière page"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
