import { describe, it, expect } from 'vitest';
import {
  buildDailySeries,
  isSameLocalDay,
  localDateParam,
  sumCounts,
  sumTotals,
  toLocalDay,
} from './revenueSeries';

const today = new Date(2026, 9, 5, 10, 30); // 5 oct. 2026, heure locale

describe('buildDailySeries', () => {
  it('fills every calendar day of the window, ending today', () => {
    const series = buildDailySeries(
      [
        { date: '2026-10-03', total: 50, count: 1 },
        { date: '2026-10-05', total: '100', count: '2' },
      ],
      4,
      today
    );
    expect(series.map((p) => p.key)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    expect(series.map((p) => p.total)).toEqual([0, 50, 0, 100]);
    expect(sumTotals(series)).toBe(150);
    expect(sumCounts(series)).toBe(3);
  });

  it('reads a pg DATE serialized as a midnight timestamp as that local day', () => {
    // node-pg sérialise une colonne DATE à minuit, heure du serveur (ici : le même fuseau).
    const stamp = new Date(2026, 9, 4).toISOString();
    const series = buildDailySeries([{ date: stamp, total: '75', count: '1' }], 2, today);
    expect(series.map((p) => [p.key, p.total])).toEqual([
      ['2026-10-04', 75],
      ['2026-10-05', 0],
    ]);
  });

  it('ignores rows outside the window and unparsable dates', () => {
    const series = buildDailySeries(
      [
        { date: '2026-09-01', total: 999 },
        { date: 'n/a', total: 999 },
      ],
      3,
      today
    );
    expect(sumTotals(series)).toBe(0);
  });

  it('splits current and previous windows by calendar days, not by rows', () => {
    // Magasin fermé le dimanche : avant, « 7 derniers jours » prenait les 7
    // dernières lignes, donc 8 jours calendaires.
    const rows = Array.from({ length: 14 }, (_, i) => new Date(2026, 9, 5 - i))
      .filter((d) => d.getDay() !== 0)
      .map((d) => ({ date: d.toISOString(), total: 10, count: 1 }));
    const series = buildDailySeries(rows, 14, today);
    const current = series.slice(-7);
    expect(current[0].key).toBe('2026-09-29');
    expect(sumTotals(current)).toBe(60); // 6 jours ouvrés sur 7
  });
});

describe('local day helpers', () => {
  it('reads a bare date as that local day and rejects missing values', () => {
    expect(toLocalDay('2026-10-05')?.getDate()).toBe(5);
    expect(toLocalDay(null)).toBeNull();
    expect(toLocalDay('')).toBeNull();
    expect(toLocalDay('pas une date')).toBeNull();
  });

  it('tells whether a timestamp falls on the local calendar day', () => {
    expect(isSameLocalDay(new Date(2026, 9, 5, 8, 15).toISOString(), today)).toBe(true);
    expect(isSameLocalDay(new Date(2026, 9, 4, 23, 59).toISOString(), today)).toBe(false);
    expect(isSameLocalDay('2026-10-05', today)).toBe(true);
    expect(isSameLocalDay(undefined, today)).toBe(false);
  });

  it('builds the YYYY-MM-DD parameter of a past local day', () => {
    expect(localDateParam(0, today)).toBe('2026-10-05');
    expect(localDateParam(7, today)).toBe('2026-09-28');
  });
});
