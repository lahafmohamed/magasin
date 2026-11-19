/** Mac / iPad / iPhone : la touche de commande s'affiche « ⌘ », ailleurs « Ctrl ». */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * Libellé du raccourci de la recherche globale : « Ctrl K » sur les postes du
 * comptoir (Windows), « ⌘ K » sur Mac. Le « ⌘ » affiché à tous dérouterait
 * l'utilisateur de Windows, qui n'a pas cette touche.
 */
export const SEARCH_SHORTCUT_LABEL = isApplePlatform() ? '⌘ K' : 'Ctrl K';

/** Valeur `aria-keyshortcuts` correspondante. */
export const SEARCH_SHORTCUT_ARIA = isApplePlatform() ? 'Meta+K' : 'Control+K';
