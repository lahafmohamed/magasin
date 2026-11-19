/**
 * Normalize search input: strip accents, collapse whitespace, lowercase.
 * Lets users type "cafe" and find "café", or "produit" and find "Produit".
 */
export function normalizeSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy match: returns score 0..100 (0 = no match). Higher = better.
 * Strategy (tried in order, first hit wins):
 *  1. Exact substring         → 100
 *  2. Starts-with token       → 80
 *  3. All query tokens found  → 60
 *  4. Subsequence (chars in order, gaps allowed) → 20..50 based on tightness
 *  5. Otherwise               → 0
 */
export function fuzzyScore(query: string, target: string): number {
  const q = normalizeSearch(query);
  const t = normalizeSearch(target);
  if (!q) return 0;
  if (!t) return 0;

  if (t.includes(q)) {
    if (t.startsWith(q)) return 100;
    return 90;
  }

  const tokens = q.split(' ').filter(Boolean);
  if (tokens.some((tok) => t.split(' ').some((tw) => tw.startsWith(tok)))) {
    return 70;
  }
  if (tokens.length > 1 && tokens.every((tok) => t.includes(tok))) {
    return 60;
  }

  // Subsequence match on the un-tokenized query (handles typos/missing letters)
  const qChars = q.replace(/\s+/g, '');
  let ti = 0;
  let matched = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  for (const ch of qChars) {
    const found = t.indexOf(ch, ti);
    if (found === -1) break;
    if (firstIdx === -1) firstIdx = found;
    lastIdx = found;
    matched++;
    ti = found + 1;
  }
  if (matched === qChars.length && qChars.length >= 2) {
    // Tightness: shorter span = better match
    const span = lastIdx - firstIdx + 1;
    const tightness = qChars.length / Math.max(span, 1);
    return Math.round(20 + tightness * 30);
  }

  return 0;
}

/*
 * Nombres, montants et dates — source unique de présentation.
 *
 * Espaces : U+00A0 (insécable « normale ») entre les groupes de chiffres et
 * avant l'unité. Intl produit une espace fine U+202F : dans des chiffres gras
 * proportionnels elle disparaissait (« 43126 500 FCFA ») et l'unité, séparée par
 * une espace sécable, passait seule à la ligne (« 3 825 810 / FCFA »).
 * Signe moins : U+2212 (« − »), aligné sur la chasse des chiffres.
 */
export const NBSP = '\u00A0';
export const MINUS = '\u2212';

/** Remplace les espaces produites par Intl (fines, insécables) par U+00A0 et le trait d'union de signe par « − ». */
function typographic(formatted: string): string {
  return formatted.replace(/[\u202F\u2009\u00A0]/g, NBSP).replace(/^-/, MINUS);
}

/** Convertit une valeur numérique de l'API (souvent une chaîne NUMERIC) ; `null` si absente ou invalide. */
export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Libellé de devise affiché : jamais « XOF » dans l'interface (brief §4). */
function currencyLabel(devise?: string | null): string {
  if (!devise || /^xof$/i.test(devise.trim())) return 'FCFA';
  return devise;
}

/**
 * Nombre groupé à la française : 1234567 → « 1 234 567 » (U+00A0), décimales
 * à la virgule. Pour les quantités et les compteurs.
 */
export function formatNumber(value: number | string | null | undefined, maximumFractionDigits = 0): string {
  const n = toNumber(value) ?? 0;
  return typographic(new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(n));
}

/**
 * Montant en FCFA : 43126500 → « 43 126 500 FCFA », arrondi à l'unité, U+00A0
 * entre les groupes et avant l'unité, « − » pour un négatif. Valeur absente ou
 * invalide → « 0 FCFA » (comportement historique ; pour distinguer « inconnu »
 * de zéro, utiliser `<Money>` qui affiche « — »).
 */
export function formatCurrency(
  montant: number | string | undefined | null,
  devise?: string | null
): string {
  const symbol = currencyLabel(devise);
  const value = toNumber(montant) ?? 0;
  const rounded = Math.round(value);
  const digits = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.abs(rounded));
  return `${rounded < 0 ? MINUS : ''}${typographic(digits)}${NBSP}${symbol}`;
}

/**
 * Montant signé pour une variation, une marge ou un écart : « +1 234 FCFA »,
 * « −1 234 FCFA », « 0 FCFA » (zéro sans signe).
 */
export function formatSignedCurrency(
  montant: number | string | undefined | null,
  devise?: string | null
): string {
  const rounded = Math.round(toNumber(montant) ?? 0);
  const base = formatCurrency(Math.abs(rounded), devise);
  if (rounded > 0) return `+${base}`;
  if (rounded < 0) return `${MINUS}${base}`;
  return base;
}

/** @deprecated Use formatCurrency instead */
export function formatFCFA(montant: number | string | undefined | null): string {
  return formatCurrency(montant);
}

export const formatXOF = formatFCFA;

/**
 * `Date` à partir d'une valeur d'API. Une date seule (« 2026-10-22 ») est lue
 * en heure locale : `new Date('2026-10-22')` la lit en UTC et l'affiche la
 * veille dans un fuseau à l'ouest de Greenwich.
 */
function toDate(date: string | Date): Date {
  if (date instanceof Date) return date;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
}

function validDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  const d = toDate(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Date de l'interface, format unique : « 22 oct. 2026 ». Absente ou invalide → « — ».
 */
export function formatDate(date: string | Date | null | undefined): string {
  const d = validDate(date);
  if (!d) return '—';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Même format que `formatDate` (« 22 oct. 2026 ») : les listes affichaient trois
 * formats différents (« 22 octobre 2026 », « 23/10/2026 »…). Conservé pour les
 * appels existants ; le format numérique est réservé à l'impression et aux
 * exports (`formatDateNumeric`).
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  return formatDate(date);
}

/** Date numérique « 22/10/2026 » — impression et exports CSV uniquement. */
export function formatDateNumeric(date: string | Date | null | undefined): string {
  const d = validDate(date);
  if (!d) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Date et heure, sans les secondes : « 22 oct. 2026 à 14:46 ». */
export function formatDateTime(date: string | Date | null | undefined): string {
  const d = validDate(date);
  if (!d) return '—';
  return `${formatDate(d)} à ${formatTime(d)}`;
}

/** Jour + mois abrégé, pour les axes et libellés courts : « 5 oct. ». */
export function formatDayMonth(date: string | Date): string {
  return toDate(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Heure courte : « 14:46 ». */
export function formatTime(date: string | Date): string {
  return toDate(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Mois abrégé à partir de son numéro (1–12) : 8 → « août », 9 → « sept. ». */
export function formatMonthShort(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleDateString('fr-FR', { month: 'short' });
}

/**
 * Période mensuelle en toutes lettres : « 2026-09 » (paie) ou une date →
 * « septembre 2026 ». Valeur illisible → rendue telle quelle.
 */
export function formatMonthYear(period: string | Date | null | undefined): string {
  if (!period) return '—';
  if (typeof period === 'string') {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  const d = validDate(period);
  return d ? d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : String(period);
}

/**
 * Nombre compact pour les axes de graphiques : 1 250 000 → « 1,3 M », 850 000 → « 850 k ».
 * L'ancien `${v / 1000}k` affichait « 36000k » sur un axe en millions de FCFA.
 */
export function formatCompactNumber(value: number): string {
  return typographic(new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value));
}

/** Pourcentage à la française : 107 → « 107 % », 23.36 (1 décimale) → « 23,4 % ». */
export function formatPercent(value: number, maximumFractionDigits = 0): string {
  return typographic(new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits }).format(value / 100));
}

/** Variation en pourcentage, signée, à la française : 6.8 → « +6,8 % ». */
export function formatPercentChange(value: number): string {
  return typographic(
    new Intl.NumberFormat('fr-FR', {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(value / 100)
  );
}

/** Taille de fichier : 1536000 → « 1,5 Mo ». */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${formatNumber(n, u === 0 ? 0 : 1)}${NBSP}${units[u]}`;
}
