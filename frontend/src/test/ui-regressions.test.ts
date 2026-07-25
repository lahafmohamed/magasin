import { describe, expect, it } from 'vitest';

const sourceModules = import.meta.glob('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sources = Object.entries(sourceModules)
  .filter(([file]) => !file.endsWith('.test.tsx'));

describe('Customer-facing UI regressions', () => {
  it('does not reintroduce forbidden tax or untranslated audited labels', () => {
    const forbidden = [
      { pattern: /\bTVA\b/, label: 'TVA' },
      { pattern: /\bTTC\b/, label: 'TTC' },
      { pattern: /hors taxes/i, label: 'hors taxes' },
      { pattern: /Factures Fourn\./, label: 'Factures Fourn.' },
      { pattern: /Location de vente/, label: 'Location de vente' },
      { pattern: />\s*Close\s*</, label: 'Close' },
    ];
    const violations: string[] = [];

    for (const [file, source] of sources) {
      for (const rule of forbidden) {
        if (rule.pattern.test(source)) {
          violations.push(`${file}: ${rule.label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('enables the Recharts accessibility layer on every business chart', () => {
    const violations: string[] = [];
    const chartTag = /<(AreaChart|BarChart|LineChart|PieChart)\b[^>]*>/g;

    for (const [file, source] of sources) {
      for (const match of source.matchAll(chartTag)) {
        if (!match[0].includes('accessibilityLayer')) {
          violations.push(`${file}: ${match[1]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('gives every responsive business chart safe initial dimensions', () => {
    const violations: string[] = [];
    const responsiveContainerTag = /<ResponsiveContainer\b[^>]*>/g;

    for (const [file, source] of sources) {
      for (const match of source.matchAll(responsiveContainerTag)) {
        if (
          !match[0].includes('minWidth={0}')
          || !match[0].includes('initialDimension={{ width: 1, height: 1 }}')
        ) {
          violations.push(`${file}: ResponsiveContainer`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
