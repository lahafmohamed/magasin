import * as React from 'react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMediaQuery } from '@/components/useMediaQuery';

export interface DocumentLineColumn {
  id: string;
  /** En-tête de colonne (grand écran) et libellé du champ (téléphone). */
  header: string;
  /** Colonne de montants / quantités : alignée à droite. */
  numeric?: boolean;
  /** En-tête masqué visuellement (colonne d'action). */
  srOnlyHeader?: boolean;
  headClassName?: string;
  cellClassName?: string;
  /**
   * Place de la cellule dans la carte mobile : `title` (en haut, avec
   * l'action), `action` (en haut à droite), `field` (grille de champs,
   * libellé au-dessus), `full` (champ sur toute la largeur).
   */
  mobile: 'title' | 'action' | 'field' | 'full';
  /** `false` : colonne absente du tableau (titre de carte propre au mobile). */
  desktop?: boolean;
  /** Alignement dans la carte mobile (défaut : à droite pour une colonne `numeric`). */
  mobileAlign?: 'start' | 'end';
}

export interface DocumentLineRow {
  key: string;
  cells: Record<string, React.ReactNode>;
}

type LinesLayout = 'table' | 'cards';

/** Largeur sous laquelle un tableau de lignes n'est jamais lisible (sans `minTableWidth`). */
const DEFAULT_MIN_TABLE_WIDTH = 600;

interface PendingFocus {
  id: string;
  tag: string;
  label: string | null;
  start: number | null;
  end: number | null;
}

/**
 * Lignes d'un document en saisie (facture, devis, bon de livraison, avoir).
 *
 * - Un vrai tableau (`ui/table`, en-têtes uniques) quand **son conteneur** a la
 *   place : au moins `minTableWidth`, et jamais plus étroit que le tableau
 *   lui-même (mesuré). Sinon une carte par ligne — produit et « Retirer » en
 *   haut, champs en grille de deux avec leur libellé.
 * - Le choix suit la largeur du conteneur et non celle de l'écran : dans la
 *   colonne gauche du formulaire (≈ 690 px à 1 366 px), le tableau coupait le
 *   total de ligne et masquait « Retirer ».
 *
 * Un seul des deux rendus est monté à la fois : aucun champ en double, aucun
 * identifiant répété. Au changement de rendu, le champ qui avait le focus le
 * retrouve (même `id`, même sélection). Chaque champ porte son propre nom
 * accessible (« Quantité — HP ProBook 450 G10 ») ; le libellé visible des
 * cartes est donc décoratif.
 *
 * Le conteneur expose le rendu courant (`data-layout="table|cards"`, groupe
 * `group/lines`) : une cellule stylée pour le tableau écrit
 * `group-data-[layout=table]/lines:w-32` plutôt que `md:w-32`, qui
 * s'appliquerait aussi aux cartes d'un écran large.
 */
export function DocumentLines({
  label,
  columns,
  rows,
  minTableWidth,
}: {
  /** Nom du tableau / de la liste (« Lignes de la facture »). */
  label: string;
  columns: DocumentLineColumn[];
  rows: DocumentLineRow[];
  /**
   * Largeur minimale (px) du conteneur pour afficher le tableau. Défaut 600.
   * Le tableau passe de toute façon en cartes s'il déborde de son conteneur.
   */
  minTableWidth?: number;
}) {
  const wideViewport = useMediaQuery('(min-width: 768px)');
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [layout, setLayout] = React.useState<LinesLayout>(() => (wideViewport ? 'table' : 'cards'));
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  /** Largeur que le tableau a réclamée la dernière fois qu'il a débordé. */
  const neededRef = React.useRef(0);
  const pendingFocus = React.useRef<PendingFocus | null>(null);
  const measured = React.useRef(false);

  const floor = minTableWidth ?? DEFAULT_MIN_TABLE_WIDTH;

  const switchTo = React.useCallback((next: LinesLayout) => {
    if (next === layoutRef.current) return;
    const wrap = wrapRef.current;
    const active = document.activeElement;
    if (wrap && active instanceof HTMLElement && wrap.contains(active)) {
      const field = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
      let start: number | null = null;
      let end: number | null = null;
      try {
        start = field?.selectionStart ?? null;
        end = field?.selectionEnd ?? null;
      } catch {
        /* type sans sélection (nombre) */
      }
      pendingFocus.current = {
        id: active.id,
        tag: active.tagName,
        label: active.getAttribute('aria-label'),
        start,
        end,
      };
    }
    layoutRef.current = next;
    setLayout(next);
  }, []);

  const measure = React.useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const width = wrap.clientWidth;
    // Pas de mise en page (onglet masqué, environnement de test) : on garde le
    // rendu choisi d'après l'écran.
    if (width === 0) {
      if (!measured.current) switchTo(wideViewport ? 'table' : 'cards');
      return;
    }
    measured.current = true;
    if (layoutRef.current === 'table') {
      const region = wrap.firstElementChild as HTMLElement | null;
      if (region && region.scrollWidth > region.clientWidth + 1) {
        neededRef.current = Math.max(neededRef.current, region.scrollWidth + (region.offsetWidth - region.clientWidth));
      }
    }
    switchTo(width >= Math.max(floor, neededRef.current) ? 'table' : 'cards');
  }, [floor, switchTo, wideViewport]);

  // Une ligne ajoutée ou retirée change la largeur utile du tableau : on la remesure.
  const rowCount = rows.length;
  React.useLayoutEffect(() => {
    neededRef.current = 0;
  }, [rowCount]);

  // Mesure avant affichage, puis à chaque changement de taille du conteneur ou du tableau.
  React.useLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    const table = layout === 'table' ? wrap.querySelector('table') : null;
    if (table) ro.observe(table);
    return () => ro.disconnect();
  }, [layout, measure, rowCount]);

  // Le champ qui avait le focus le retrouve dans l'autre rendu.
  React.useLayoutEffect(() => {
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    const wrap = wrapRef.current;
    if (!pending || !wrap) return;
    const target =
      (pending.id ? document.getElementById(pending.id) : null) ??
      (pending.label
        ? Array.from(wrap.querySelectorAll<HTMLElement>(pending.tag)).find(
            (el) => el.getAttribute('aria-label') === pending.label
          ) ?? null
        : null);
    if (!target || !wrap.contains(target)) return;
    target.focus({ preventScroll: true });
    if (pending.start !== null && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      try {
        target.setSelectionRange(pending.start, pending.end ?? pending.start);
      } catch {
        /* type sans sélection */
      }
    }
  }, [layout]);

  if (layout === 'table') {
    const tableColumns = columns.filter((c) => c.desktop !== false);
    return (
      <div ref={wrapRef} data-layout="table" className="group/lines min-w-0">
        <Table aria-label={label} containerClassName="rounded-md border">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {tableColumns.map((col) => (
                <TableHead key={col.id} numeric={col.numeric} className={col.headClassName}>
                  {col.srOnlyHeader ? <span className="sr-only">{col.header}</span> : col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} className="align-top hover:bg-transparent">
                {tableColumns.map((col) => (
                  <TableCell key={col.id} numeric={col.numeric} className={col.cellClassName}>
                    {row.cells[col.id]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const title = columns.filter((c) => c.mobile === 'title');
  const actions = columns.filter((c) => c.mobile === 'action');
  const fields = columns.filter((c) => c.mobile === 'field' || c.mobile === 'full');

  return (
    <div ref={wrapRef} data-layout="cards" className="group/lines min-w-0">
      <ul aria-label={label} className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="rounded-md border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                {title.map((col) => (
                  <React.Fragment key={col.id}>{row.cells[col.id]}</React.Fragment>
                ))}
              </div>
              {actions.map((col) => (
                <div key={col.id} className="-mr-1 -mt-1 shrink-0">
                  {row.cells[col.id]}
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
              {fields.map((col) => (
                <div
                  key={col.id}
                  className={cn(
                    'min-w-0',
                    col.mobile === 'full' && 'col-span-2',
                    (col.mobileAlign ?? (col.numeric ? 'end' : 'start')) === 'end' && 'text-right'
                  )}
                >
                  <p aria-hidden="true" className="mb-1 text-xs text-muted-foreground">
                    {col.header}
                  </p>
                  {row.cells[col.id]}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
