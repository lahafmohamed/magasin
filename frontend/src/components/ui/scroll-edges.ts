import * as React from 'react';

export interface ScrollEdges {
  /** Le contenu déborde horizontalement. */
  overflowing: boolean;
  /** Du contenu est caché à gauche (déjà défilé). */
  start: boolean;
  /** Du contenu reste caché à droite. */
  end: boolean;
}

const NO_OVERFLOW: ScrollEdges = { overflowing: false, start: false, end: false };

/**
 * État de débordement horizontal de `ref`, tenu à jour au défilement et au
 * redimensionnement (conteneur et premier enfant).
 */
export function useScrollEdges(ref: React.RefObject<HTMLElement>): ScrollEdges {
  const [edges, setEdges] = React.useState<ScrollEdges>(NO_OVERFLOW);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const overflowing = el.scrollWidth > el.clientWidth + 1;
      const start = overflowing && el.scrollLeft > 1;
      const end = overflowing && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) =>
        prev.overflowing === overflowing && prev.start === start && prev.end === end
          ? prev
          : { overflowing, start, end }
      );
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    if (typeof ResizeObserver === 'undefined') return () => el.removeEventListener('scroll', check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [ref]);
  return edges;
}

/**
 * Classe de fondu (`index.css`) du bord où du contenu reste caché : une
 * colonne ou un onglet coupé se voit coupé (« −44 » ne se lit plus comme un
 * montant entier quand « −440 FCFA » dépasse du cadre).
 */
export function scrollFadeClass({ start, end }: ScrollEdges): string | undefined {
  if (start && end) return 'scroll-fade-x';
  if (end) return 'scroll-fade-end';
  if (start) return 'scroll-fade-start';
  return undefined;
}
