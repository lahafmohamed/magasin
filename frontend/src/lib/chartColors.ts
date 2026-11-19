import type { TooltipValueType } from 'recharts';
import { formatCompactNumber, formatCurrency, formatPercent } from '@/utils/format';

/**
 * Theme-aware chart colors. Values are `hsl(var(--chart-N))` strings so recharts
 * writes them as SVG fill/stroke attributes and the browser resolves the CSS var
 * live — meaning the same chart adapts to light/dark without JS re-render.
 *
 * Tokens are defined in index.css (:root and .dark). Never hardcode hex in a chart.
 * Chaque teinte tient ≥ 3:1 contre `--card` dans les deux thèmes (marques
 * graphiques, WCAG 1.4.11). Entre deux parts voisines d'un anneau, garder un
 * filet `stroke="hsl(var(--card))"` : deux teintes voisines n'ont pas 3:1 entre elles.
 */

/** Categorical series palette (pie slices, multi-series bars). 7 distinct hues. */
export const CHART_COLORS: string[] = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
];

/**
 * Accent d'un graphique : LA valeur qui compte (meilleur jour, première
 * catégorie, marge, solde cumulé). Une seule par graphique — le reste en
 * `CHART_REST`. Un graphique entièrement à l'accent ne met plus rien en avant.
 */
export const CHART_PRIMARY = 'hsl(var(--chart-1))';

/** Série au repos (graphite, ≥ 3:1 contre la carte) : barres non mises en avant. */
export const CHART_REST = 'hsl(var(--chart-rest))';

/**
 * Série de comparaison (année précédente, coût d'achat). Même graphite que le
 * repos — `muted-foreground` brillait presque autant que l'accent en sombre.
 */
export const CHART_SECONDARY = CHART_REST;

/**
 * Index de la plus grande valeur d'une série (la barre « encrée »), `-1` si la
 * série est vide ou nulle partout. Égalité : la première l'emporte.
 *
 *   const best = maxIndex(data, (d) => d.total);
 *   {data.map((d, i) => <Cell key={d.label} fill={i === best ? CHART_PRIMARY : CHART_REST} />)}
 */
export function maxIndex<T>(data: readonly T[], value: (row: T) => number): number {
  let best = -1;
  let max = 0;
  data.forEach((row, i) => {
    const v = value(row);
    if (Number.isFinite(v) && v > max) {
      max = v;
      best = i;
    }
  });
  return best;
}

/** Financial signal colors — gains vs losses. Pair with a label/icon, never color alone. */
export const CHART_POSITIVE = 'hsl(var(--chart-positive))';
export const CHART_NEGATIVE = 'hsl(var(--chart-negative))';

/** Grid lines — low contrast so they don't compete with data (skill: gridline-subtle). */
export const CHART_GRID = 'hsl(var(--chart-grid))';

/** Axis ticks / labels. */
export const CHART_AXIS = 'hsl(var(--chart-axis))';

/** Pick a categorical color by index (wraps around the palette). */
export function chartColor(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

/**
 * Graduation d'un axe de montants : « 4,5 M », « 850 k » (jamais « 36000k » ni
 * « 40000000 »). `<YAxis tickFormatter={chartMoneyTick} />`.
 */
export const chartMoneyTick = (value: number): string => formatCompactNumber(value);

/**
 * Valeur que recharts v3 passe au `formatter` d'une infobulle : un nombre ou
 * une chaîne, un tableau pour une série en plage (`[min, max]`), parfois rien.
 */
export type ChartTooltipValue = TooltipValueType | null | undefined;

/** Met en forme chaque borne ; « — » quand la valeur manque (jamais « 0 FCFA »). */
function formatTooltipValue(value: ChartTooltipValue, format: (v: number | string) => string): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map((v) => format(v)).join(' – ');
  return format(value as number | string);
}

/**
 * Valeur d'une infobulle de montant : « 1 234 500 FCFA ». Se branche tel quel
 * sur recharts — `<Tooltip formatter={chartMoneyTooltip} />` — et s'emploie
 * aussi pour un montant isolé (`chartMoneyTooltip(moyenne)`).
 */
export const chartMoneyTooltip = (value: ChartTooltipValue): string => formatTooltipValue(value, formatCurrency);

/** Valeur d'une infobulle de pourcentage : « 23,4 % » (au lieu de « 23.36% »). */
export const chartPercentTooltip = (value: ChartTooltipValue): string =>
  formatTooltipValue(value, (v) => formatPercent(Number(v), 1));

/** Style des graduations : 12 px, couleur d'axe theme-aware (≥ 4,5:1 sur carte). */
export const CHART_TICK_STYLE = { fontSize: 12, fill: 'hsl(var(--chart-axis))' } as const;

/**
 * Recharts <Tooltip> contentStyle — themed card surface, readable in dark mode.
 * Spread onto the Tooltip: `<Tooltip contentStyle={CHART_TOOLTIP_STYLE} ... />`.
 */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px',
  boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.12)',
};
