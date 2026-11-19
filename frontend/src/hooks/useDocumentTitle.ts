import { useEffect, useId } from 'react';
import { useCompanyBrand } from '@/lib/brand';

/**
 * Titre de l'onglet : « <page> · <entreprise> » (WCAG 2.4.2).
 *
 * Plusieurs composants peuvent réclamer le titre en même temps : le `Layout`
 * pose un titre par défaut tiré de la route (priorité 0), la page le précise
 * via `PageShell` (priorité 1, « Facture FAC-2026-00110 »). Une petite pile
 * départage par priorité puis par ordre d'arrivée — l'ordre des effets React
 * (enfants avant parents) ne décide donc de rien, et le démontage d'une page
 * rend la main au titre suivant.
 */

interface TitleEntry {
  title: string;
  brand: string;
  priority: number;
  seq: number;
}

const entries = new Map<string, TitleEntry>();
let sequence = 0;

/** « Factures · Hitek Plateau » ; la marque seule quand la page n'a pas de nom. */
export function formatDocumentTitle(title: string | null | undefined, brand: string): string {
  const t = (title ?? '').trim();
  return t ? `${t} · ${brand}` : brand;
}

function applyTopTitle(): void {
  if (typeof document === 'undefined') return;
  let top: TitleEntry | undefined;
  for (const entry of entries.values()) {
    if (!top || entry.priority > top.priority || (entry.priority === top.priority && entry.seq > top.seq)) {
      top = entry;
    }
  }
  if (top) document.title = formatDocumentTitle(top.title, top.brand);
}

export interface DocumentTitleOptions {
  /** 0 = titre de secours (Layout), 1 = titre de page (défaut). */
  priority?: number;
}

/**
 * Pose le titre de l'onglet tant que le composant est monté.
 *
 *   useDocumentTitle('Connexion');                 // → « Connexion · Hitek »
 *   useDocumentTitle(`Facture ${facture.numero}`); // → « Facture FAC-… · Hitek Plateau »
 */
export function useDocumentTitle(title: string | null | undefined, options: DocumentTitleOptions = {}): void {
  const key = useId();
  const { name } = useCompanyBrand();
  const priority = options.priority ?? 1;

  useEffect(() => {
    entries.set(key, { title: (title ?? '').trim(), brand: name, priority, seq: ++sequence });
    applyTopTitle();
    return () => {
      entries.delete(key);
      applyTopTitle();
    };
  }, [key, title, name, priority]);
}
