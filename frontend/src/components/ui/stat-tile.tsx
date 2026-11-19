import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatNumber, formatPercent, NBSP, toNumber } from '@/utils/format';

/**
 * Couleur de la valeur d'un indicateur. Appliquée seulement à une valeur
 * numérique NON NULLE : un « 0 » n'est jamais rouge ni orange. Pas de ton
 * « succès » ni « marque » sur un KPI (le bleu de marque se lit comme un lien).
 */
export type StatTileTone = 'default' | 'danger' | 'warning';

export interface StatTileProps {
  /** Libellé en casse de phrase (« Chiffre d’affaires »). */
  label: string;
  /**
   * Valeur. Un nombre (ou une chaîne NUMERIC) est mis en forme selon `format` ;
   * un nœud React est rendu tel quel (`<Money …/>`, texte…).
   */
  value?: React.ReactNode;
  /** Mise en forme d'une valeur numérique : `number` (défaut), `money`, `percent`. */
  format?: 'number' | 'money' | 'percent';
  /** Ligne secondaire (« 113 factures ») — masquée pendant le chargement et en erreur. */
  hint?: React.ReactNode;
  /** `lg` pour l'indicateur principal d'un tableau de bord. */
  size?: 'md' | 'lg';
  tone?: StatTileTone;
  /** Chargement : barre squelette à la place de la valeur, pas de « 0 » provisoire. */
  loading?: boolean;
  /**
   * La donnée n'a pas pu être chargée : affiche « Indisponible », jamais 0 —
   * un échec de chargement ne doit pas ressembler à une valeur nulle.
   */
  unavailable?: boolean;
  /** Texte remplaçant « Indisponible ». */
  unavailableLabel?: string;
  /** Contenu sous la valeur (sparkline, lien « Voir les factures »). */
  footer?: React.ReactNode;
  /**
   * Classe de couleur brute de la valeur — compatibilité `StatsBar` (`tone:
   * 'text-warning-700'`). Préférer `tone`.
   */
  valueClassName?: string;
  /**
   * Sans carte : cellule d'un bandeau de synthèse (`StatsBar`), chiffre et
   * indication sur une même ligne de base.
   */
  bare?: boolean;
  className?: string;
}

const TONE_CLASS: Record<Exclude<StatTileTone, 'default'>, string> = {
  danger: 'text-danger-700',
  warning: 'text-warning-700',
};

/** « 1 234 FCFA » → 1234, « 12,5 % » → 12.5, « — » → null. */
function parseFormatted(text: string): number | null {
  const cleaned = text
    .replace(/FCFA|%/g, '')
    .replace(/[\s\u00A0\u202F]/g, '')
    .replace(/\u2212/g, '-')
    .replace(',', '.');
  return cleaned === '' ? null : toNumber(cleaned);
}

/** Une chaîne déjà formatée « 1 234 FCFA » : l'unité passe en petit (largeur des tuiles sur téléphone). */
function splitCurrency(text: string): [string, string] | null {
  const suffix = `${NBSP}FCFA`;
  return text.endsWith(suffix) ? [text.slice(0, -suffix.length), 'FCFA'] : null;
}

/**
 * Montant d'une tuile : chiffres insécables (U+00A0 entre les groupes), unité
 * en petit. Seule l'espace avant l'unité est sécable : dans une tuile étroite
 * (cinq de front à 1 366 px, 320 px), « FCFA » passe sous les chiffres au lieu
 * de déborder de la carte — et un chiffre n'est jamais coupé ni masqué.
 */
function TileAmount({ digits, unit }: { digits: string; unit: string }) {
  return (
    <>
      <span className="whitespace-nowrap">{digits}</span>{' '}
      <span className="whitespace-nowrap text-[0.7em] font-medium text-muted-foreground">{unit}</span>
    </>
  );
}

/** « 1 234 FCFA » → chiffres et unité, ou `null` pour un texte sans unité. */
function amountParts(text: string): [string, string] | null {
  const cut = text.lastIndexOf(NBSP);
  return cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : null;
}

/**
 * Indicateur chiffré (KPI). Remplace les quatre dessins de tuiles qui
 * coexistaient (StatsBar, Dashboard, ClientAnalytics, TiersDetail).
 *
 *   <StatGrid>
 *     <StatTile label="Chiffre d’affaires" value={stats?.ca} format="money" hint="113 factures"
 *       loading={loading} unavailable={!!error} />
 *     <StatTile label="En retard" value={stats?.retard} tone="danger" loading={loading} unavailable={!!error} />
 *   </StatGrid>
 */
export function StatTile({
  label,
  value,
  format = 'number',
  hint,
  size = 'md',
  tone = 'default',
  loading = false,
  unavailable = false,
  unavailableLabel = 'Indisponible',
  footer,
  valueClassName,
  bare = false,
  className,
}: StatTileProps) {
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && format !== 'number' && toNumber(value) !== null)
      ? toNumber(value as number | string)
      : null;
  // Valeur déjà formatée (« 0 FCFA », « 12 », « — ») : on en relit le nombre
  // pour ne colorer ni un zéro ni un tiret.
  const readBack = numeric ?? (typeof value === 'string' ? parseFormatted(value) : null);
  const colorable =
    readBack !== null ? Math.round(readBack * 100) !== 0 : typeof value !== 'string' && value != null;
  const toneClass = tone !== 'default' && colorable ? TONE_CLASS[tone] : undefined;
  const legacyClass = colorable ? valueClassName : undefined;

  let content: React.ReactNode;
  if (loading) {
    content = (
      <span
        aria-hidden="true"
        className={cn('block animate-pulse rounded bg-muted-foreground/10', size === 'lg' ? 'h-8 w-32' : 'h-7 w-24')}
      />
    );
  } else if (unavailable) {
    content = <span className="text-sm font-medium text-muted-foreground">{unavailableLabel}</span>;
  } else if (numeric !== null) {
    const parts = format === 'money' ? amountParts(formatCurrency(numeric)) : null;
    content = parts ? (
      <TileAmount digits={parts[0]} unit={parts[1]} />
    ) : (
      <span className="whitespace-nowrap">
        {format === 'percent' ? formatPercent(numeric, 1) : formatNumber(numeric, 2)}
      </span>
    );
  } else if (typeof value === 'string') {
    const parts = splitCurrency(value);
    content = parts ? (
      <TileAmount digits={parts[0]} unit={parts[1]} />
    ) : (
      <span className="whitespace-nowrap">{value}</span>
    );
  } else if (value === null || value === undefined) {
    content = (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Valeur indisponible</span>
      </>
    );
  } else {
    content = value;
  }

  if (bare) {
    return (
      <div className={cn('min-w-0 px-4 py-3 sm:px-5', className)} aria-busy={loading || undefined}>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <p
            className={cn(
              'font-medium leading-tight tabular-nums',
              size === 'lg' ? 'text-xl' : 'text-lg',
              toneClass,
              legacyClass
            )}
          >
            {loading && <span className="sr-only">Chargement…</span>}
            {content}
          </p>
          {hint && !loading && !unavailable && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('min-w-0', className)} aria-busy={loading || undefined}>
      <CardContent inset="standalone" className="flex h-full flex-col">
        {/* Un indicateur est un libellé, un chiffre et sa comparaison : pas
            d'icône pour remplir la tuile. */}
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {/* Pas de `whitespace-nowrap` ici : seuls les chiffres sont insécables,
            l'unité peut passer à la ligne (TileAmount). */}
        <p
          className={cn(
            'mt-1 font-medium leading-tight tabular-nums',
            size === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl',
            toneClass,
            legacyClass
          )}
        >
          {loading && <span className="sr-only">Chargement…</span>}
          {content}
        </p>
        {hint && !loading && !unavailable && (
          // Pas de chiffres tabulaires sur une phrase : avec Inter, `tnum` élargit
          // aussi le trait d'union (« Jean - Pierre »). Un nombre de l'indication
          // qui doit s'aligner passe par `<Money>` ou un `<span className="tabular-nums">`.
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
        {footer && <div className="mt-auto pt-3">{footer}</div>}
      </CardContent>
    </Card>
  );
}

// Une colonne sous 360 px : deux tuiles de front à 320 px laissaient moins de
// 110 px au montant (« 68 507 792 FCFA » débordait de la carte, WCAG 1.4.10).
export const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 min-[360px]:grid-cols-2',
  3: 'grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6',
};

/**
 * Grille d'indicateurs dimensionnée sur leur nombre : 3 tuiles ne laissent plus
 * un quart vide, et sur téléphone une dernière tuile orpheline prend toute la
 * largeur au lieu de flotter seule à gauche. Une colonne sous 360 px.
 *
 * Une page qui passe ses propres `grid-cols-*` dans `className` reprend la
 * main sur toutes les colonnes (la grille automatique n'est plus ajoutée).
 */
export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  const count = React.Children.toArray(children).length;
  const custom = !!className && /(^|\s|:)grid-cols-/.test(className);
  const cols = custom ? undefined : GRID_COLS[Math.min(Math.max(count, 1), 6)];
  const oddLast = !custom && count >= 3 && count % 2 === 1;
  return (
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        cols,
        oddLast && 'min-[360px]:[&>:last-child]:col-span-2 sm:[&>:last-child]:col-span-1',
        className
      )}
    >
      {children}
    </div>
  );
}
