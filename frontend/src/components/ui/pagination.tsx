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
  /**
   * Annonce le décompte aux lecteurs d'écran (`aria-live`). À désactiver quand
   * la page a déjà sa propre région d'état (`DocumentListPage`) : sinon chaque
   * chargement est lu deux fois.
   */
  announce?: boolean;
}

/** Espace fine / étroite d'Intl → espace insécable U+00A0 (code ASCII : pas de caractère invisible dans la source). */
const NBSP_CHAR = String.fromCharCode(0xa0);
const SPACE_VARIANTS = new RegExp(`[${String.fromCharCode(0x202f, 0x2009)}]`, 'g');
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
/** Groupes de chiffres en espace insécable U+00A0 (Intl produit une espace fine). */
const fmt = (n: number) => integer.format(n).replace(SPACE_VARIANTS, NBSP_CHAR);

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  announce = true,
}: PaginationProps) {
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);
  const lastPage = totalPages || 1;
  // Une seule page : ni « Page 1 sur 1 » ni quatre flèches désactivées. Le
  // choix du nombre de lignes reste tant qu'il peut réduire la page (> 10).
  const multiPage = lastPage > 1;
  const canResize = !!onLimitChange && total > 10;

  return (
    <nav
      className="flex flex-col gap-3 px-2 py-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Pagination"
    >
      <div
        className="text-center text-sm text-muted-foreground tabular-nums sm:text-left"
        aria-live={announce ? 'polite' : undefined}
      >
        {total > 0 ? (
          <>
            Affichage de <span className="font-medium text-foreground">{fmt(startItem)}</span> à{' '}
            <span className="font-medium text-foreground">{fmt(endItem)}</span> sur{' '}
            <span className="font-medium text-foreground">{fmt(total)}</span>{' '}
            {total > 1 ? 'résultats' : 'résultat'}
          </>
        ) : (
          'Aucun résultat'
        )}
      </div>

      {(multiPage || canResize) && (
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
          {/* Le libellé suit le Select : sans `onLimitChange` il restait seul,
              à annoncer un contrôle absent (Employés, Tiers). */}
          {canResize && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground" aria-hidden="true">
                Lignes par page
              </span>
              <Select
                value={String(limit)}
                onValueChange={(v) => onLimitChange?.(parseInt(v))}
              >
                <SelectTrigger className="h-10 w-[76px] text-sm sm:h-9" aria-label="Lignes par page">
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

          {multiPage && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 p-0 sm:h-9 sm:w-9"
                onClick={() => onPageChange(1)}
                disabled={page === 1}
                aria-label="Première page"
              >
                <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 p-0 sm:h-9 sm:w-9"
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                aria-label="Page précédente"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                Page {fmt(page)} sur {fmt(lastPage)}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 p-0 sm:h-9 sm:w-9"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                aria-label="Page suivante"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 p-0 sm:h-9 sm:w-9"
                onClick={() => onPageChange(totalPages)}
                disabled={page >= totalPages}
                aria-label="Dernière page"
              >
                <ChevronsRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
