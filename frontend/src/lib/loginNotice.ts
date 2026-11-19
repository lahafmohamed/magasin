/**
 * Message laissé à la page de connexion avant une déconnexion volontaire (mot
 * de passe changé depuis le profil ou à la première connexion) : la
 * déconnexion recharge la page, un toast n'aurait pas le temps d'être lu.
 * Une seule clé et un seul texte pour Login, ChangePassword et Profil.
 * Le stockage peut être indisponible (navigation privée) : le toast reste
 * alors le seul retour.
 */
const LOGIN_NOTICE_KEY = 'login-notice';

export type LoginNotice = 'mot-de-passe-modifie';

export const LOGIN_NOTICE_MESSAGES: Record<LoginNotice, string> = {
  'mot-de-passe-modifie': 'Mot de passe modifié. Reconnectez-vous avec le nouveau mot de passe.',
};

/** Dépose le message à afficher au prochain passage sur la page de connexion. */
export function leaveLoginNotice(notice: LoginNotice): void {
  try {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, notice);
  } catch {
    /* stockage indisponible */
  }
}

/** Texte du message déposé, ou `null`. */
export function readLoginNotice(): string | null {
  try {
    const key = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    return key ? LOGIN_NOTICE_MESSAGES[key as LoginNotice] ?? null : null;
  } catch {
    return null;
  }
}

/** Retire le message : il ne s'affiche qu'une fois. */
export function clearLoginNotice(): void {
  try {
    sessionStorage.removeItem(LOGIN_NOTICE_KEY);
  } catch {
    /* stockage indisponible */
  }
}
