import { formatDayMonth, formatTime } from './format';

/** Au-delà, l'API bloque les mouvements de caisse (`STALE_CASH_SESSION`, sauf gérant). */
export const TILL_SESSION_MAX_AGE_HOURS = 24;

/** Caisse restée ouverte depuis un jour précédent (P-M2). */
export interface PreviousDayTill {
  openedAt: Date;
  /** Ouverte la veille (jour civil local). */
  yesterday: boolean;
  /** Titre de l'avertissement : « Caisse ouverte hier (23 oct. à 13:08) et non clôturée ». */
  title: string;
  /** Action principale : « Clôturer la caisse d’hier » / « Clôturer la caisse du 22 oct. ». */
  closeLabel: string;
  /** Quand la session atteint 24 h : les encaissements sont alors bloqués. */
  blockedAt: Date;
  /** « À partir de 13:08 » (aujourd'hui) ou « Dès le 25 oct. à 13:08 ». */
  blockedAtLabel: string;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Une caisse ouverte un jour précédent et pas encore clôturée. Tant qu'elle a
 * moins de 24 h, la caissière peut encore la clôturer elle-même ; passé ce
 * délai, tout encaissement est refusé jusqu'au passage d'un gérant. On le dit
 * dès le matin, au lieu de la présenter comme une caisse ouverte normale.
 *
 * `null` : session du jour, date invalide ou absente.
 */
export function previousDayTill(dateOuverture: string | Date | null | undefined, now: Date = new Date()): PreviousDayTill | null {
  if (!dateOuverture) return null;
  const openedAt = new Date(dateOuverture);
  if (Number.isNaN(openedAt.getTime())) return null;
  const today = startOfDay(now);
  if (startOfDay(openedAt).getTime() >= today.getTime()) return null;

  const yesterdayStart = new Date(today);
  yesterdayStart.setDate(today.getDate() - 1);
  const yesterday = startOfDay(openedAt).getTime() === yesterdayStart.getTime();

  const day = formatDayMonth(openedAt);
  const time = formatTime(openedAt);
  const blockedAt = new Date(openedAt.getTime() + TILL_SESSION_MAX_AGE_HOURS * 60 * 60 * 1000);
  const blockedToday = startOfDay(blockedAt).getTime() === today.getTime();

  return {
    openedAt,
    yesterday,
    title: yesterday
      ? `Caisse ouverte hier (${day} à ${time}) et non clôturée`
      : `Caisse ouverte le ${day} à ${time} et non clôturée`,
    closeLabel: yesterday ? 'Clôturer la caisse d’hier' : `Clôturer la caisse du ${day}`,
    blockedAt,
    blockedAtLabel: blockedToday
      ? `À partir de ${formatTime(blockedAt)}`
      : `Dès le ${formatDayMonth(blockedAt)} à ${formatTime(blockedAt)}`,
  };
}
