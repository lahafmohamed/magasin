/**
 * Theme-aware chart colors. Values are `hsl(var(--chart-N))` strings so recharts
 * writes them as SVG fill/stroke attributes and the browser resolves the CSS var
 * live — meaning the same chart adapts to light/dark without JS re-render.
 *
 * Tokens are defined in index.css (:root and .dark). Never hardcode hex in a chart.
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

/** Primary single-series accent (trend line, main bar). */
export const CHART_PRIMARY = 'hsl(var(--chart-1))';

/** Secondary/comparison series (e.g. previous year). Muted. */
export const CHART_SECONDARY = 'hsl(var(--muted-foreground))';

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

/** Common tick props for recharts XAxis/YAxis so ticks pick up the theme axis color. */
export const CHART_AXIS_TICK = { fill: 'hsl(var(--chart-axis))', fontSize: 12 } as const;
