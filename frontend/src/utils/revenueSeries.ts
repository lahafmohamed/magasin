/**
 * Série quotidienne du chiffre d'affaires, complétée jour par jour.
 *
 * `/factures/revenue-trends` ne renvoie que les jours ayant au moins une facture
 * (pas de `generate_series` côté SQL). Découper ces lignes par position — ce que
 * faisait le tableau de bord — mélangeait les fenêtres : « 30 derniers jours »
 * couvrait en réalité 30 jours *facturés*, soit cinq semaines pour un magasin
 * fermé le dimanche, et la période de comparaison glissait d'autant. Les
 * moyennes par jour et par jour de semaine ignoraient aussi les jours sans vente.
 */
export interface DayPoint {
  /** AAAA-MM-JJ, jour local. */
  key: string;
  date: Date;
  total: number;
  count: number;
}

export interface RevenueTrendRow {
  date: string | Date;
  total: string | number;
  count?: string | number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Jour local d'une valeur DATE renvoyée par l'API. Une chaîne « AAAA-MM-JJ » est
 * lue telle quelle (`new Date('2026-10-05')` la placerait à minuit UTC) ; un
 * horodatage — node-pg sérialise une colonne DATE à minuit, heure du serveur —
 * est lu dans le fuseau du navigateur, juste tant que serveur et postes partagent
 * le même fuseau (Abidjan, UTC+0). Valeur absente ou illisible → `null`.
 */
export function toLocalDay(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * La valeur tombe-t-elle le jour calendaire local de `today` ? Sert aux blocs
 * « du jour » du tableau de bord (factures, clôtures de caisse) : l'API n'a pas
 * de filtre par date, les lignes récentes sont triées puis comparées ici.
 */
export function isSameLocalDay(value: string | Date | null | undefined, today = new Date()): boolean {
  const day = toLocalDay(value);
  return day !== null && dayKey(day) === dayKey(today);
}

/** « AAAA-MM-JJ » du jour local situé `days` jours avant `today` (paramètre `from` des API). */
export function localDateParam(daysAgo = 0, today = new Date()): string {
  return dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo));
}

/**
 * Les `days` jours calendaires qui se terminent aujourd'hui (inclus), du plus
 * ancien au plus récent ; un jour sans facture vaut 0.
 */
export function buildDailySeries(rows: RevenueTrendRow[], days: number, today = new Date()): DayPoint[] {
  const byDay = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const day = toLocalDay(row.date);
    if (!day) continue;
    const key = dayKey(day);
    const prev = byDay.get(key);
    byDay.set(key, {
      total: (prev?.total ?? 0) + (Number(row.total) || 0),
      count: (prev?.count ?? 0) + (Number(row.count) || 0),
    });
  }

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i));
    const key = dayKey(date);
    const v = byDay.get(key);
    return { key, date, total: v?.total ?? 0, count: v?.count ?? 0 };
  });
}

export function sumTotals(points: DayPoint[]): number {
  return points.reduce((s, p) => s + p.total, 0);
}

export function sumCounts(points: DayPoint[]): number {
  return points.reduce((s, p) => s + p.count, 0);
}
