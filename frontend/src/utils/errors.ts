/**
 * Normalisation des erreurs réseau/serveur en message affichable.
 *
 * Le backend renvoie l'enveloppe `{ success, data, error }` ; `error` est en
 * français et destiné à l'utilisateur. Mais plusieurs familles de messages ne
 * doivent jamais atteindre l'écran :
 *   - les erreurs Postgres brutes (« violates foreign key constraint … »),
 *     qui fuitent des noms de tables/contraintes ;
 *   - les messages internes d'axios (« Network Error », « Request failed with
 *     status code 500 »), en anglais et sans valeur pour l'utilisateur ;
 *   - les messages génériques du serveur (« Erreur serveur ») : le libellé de
 *     la page (« Impossible d'exécuter le transfert. ») en dit plus ;
 *   - les messages anglais de validation (« statut is required ») ;
 *   - les erreurs JavaScript (« Cannot read properties of undefined »).
 *
 * `getErrorMessage` filtre ces familles et retombe sur le libellé de la page,
 * au format « Impossible de <verbe> <objet>. » :
 *
 *   catch (err) { toast.error(getErrorMessage(err, 'Impossible de supprimer la facture. Réessayez.')); }
 */

const DEFAULT_MESSAGE = 'Une erreur est survenue. Réessayez dans un instant.';

/** Messages Postgres / techniques à ne pas exposer tels quels. */
const TECHNICAL = /violates|constraint|syntax error|relation ".*" does not exist|duplicate key|null value in column|invalid input syntax|deadlock|ECONNREFUSED|ETIMEDOUT|column [\w."]+ does not exist|\bSQL\b|undefined is not|is not a function/i;

/** Messages internes axios/fetch (anglais) à ne pas exposer. */
const TRANSPORT = /^(network error|request failed with status code \d+|timeout of \d+ms exceeded|canceled|failed to fetch)$/i;

/**
 * Messages serveur sans contenu : la page sait mieux ce qui a échoué.
 * « Données invalides » est traité à part (le détail par champ est plus utile).
 */
const GENERIC_SERVER =
  /^(erreur|erreur serveur|erreur interne|erreur interne du serveur|erreur de validation|erreur inconnue|une erreur est survenue|internal server error|server error|bad request|not found|unauthorized|forbidden)\s*[.!]?$/i;

/** Messages de validation renvoyés en bloc par le middleware Zod. */
const VALIDATION_ENVELOPE = /^(données invalides|paramètres de requête invalides)\s*\.?$/i;

/** Indices d'un message anglais (validation, contrôleurs historiques). */
const ENGLISH =
  /\b(is|are) required\b|\bnot found\b|\binvalid (input|value|type|statut|status|id)\b|\bexpected\b.*\breceived\b|\bmust be\b|\bcannot be\b|\bshould be\b|\bunauthori[sz]ed\b|\bforbidden\b|\bfailed\b|\bmissing\b|\berror\b/i;

/** Erreur applicative liée à une contrainte d'intégrité — message métier générique. */
const INTEGRITY_MESSAGE =
  'Action refusée : cet élément est utilisé par d’autres documents, ou une valeur saisie n’est pas valide.';

export const SESSION_EXPIRED_MESSAGE = 'Session expirée. Reconnectez-vous.';
export const FORBIDDEN_MESSAGE =
  'Vous n’avez pas les droits pour cette action. Demandez l’accès à votre administrateur.';
export const NOT_FOUND_MESSAGE = 'Élément introuvable : il a peut-être été supprimé.';
export const RATE_LIMIT_MESSAGE = 'Trop de requêtes. Réessayez dans un instant.';
export const OFFLINE_MESSAGE = 'Serveur injoignable. Vérifiez votre connexion.';
export const BAD_CREDENTIALS_MESSAGE =
  'Identifiant ou mot de passe incorrect. Vérifiez la saisie (majuscules comprises) puis réessayez.';
export const WRONG_CURRENT_PASSWORD_MESSAGE =
  'Mot de passe actuel incorrect. Saisissez celui que vous utilisez pour vous connecter.';
export const ACCOUNT_DISABLED_MESSAGE =
  'Ce compte est désactivé. Demandez à votre administrateur de le réactiver.';
export const LOGIN_RATE_LIMIT_MESSAGE =
  'Trop de tentatives de connexion. Patientez quelques minutes puis réessayez.';

type MaybeAxiosError = {
  response?: {
    status?: number;
    data?: { error?: unknown; message?: unknown; details?: unknown; code?: unknown };
  };
  config?: { url?: unknown };
  message?: unknown;
  code?: unknown;
};

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Code métier renvoyé par le serveur avec l'erreur (`{ error, code }`), pour
 * réagir autrement qu'avec un toast :
 *   - `CAISSE_FERMEE` (409) — encaissement en espèces sans caisse ouverte :
 *     proposer « Ouvrir la caisse » ;
 *   - `STALE_CASH_SESSION` (409) — session de caisse trop ancienne ;
 *   - `OVER_RECEIPT` (422) — réception au-delà du reste à recevoir.
 */
export function getErrorCode(error: unknown): string | undefined {
  const code = (error as MaybeAxiosError | null)?.response?.data?.code;
  return typeof code === 'string' && code ? code : undefined;
}

/** Requête vers un point d'authentification (`/auth/login`, `/auth/change-password`). */
function authEndpoint(error: MaybeAxiosError): 'login' | 'change-password' | null {
  const url = asText(error.config?.url);
  if (!url) return null;
  const path = url.split('?')[0].replace(/\/+$/, '');
  if (path.endsWith('/auth/login')) return 'login';
  if (path.endsWith('/auth/change-password')) return 'change-password';
  return null;
}

/**
 * Un 401 de `/auth/login` signifie « mauvais identifiants », celui de
 * `/auth/change-password` « mot de passe actuel incorrect » : ni l'un ni
 * l'autre n'est une session expirée. (Un 401 du middleware sur
 * `/auth/change-password`, lui, est bien une session expirée.)
 */
export function isCredentialError(error: unknown): boolean {
  const err = error as MaybeAxiosError | null;
  if (!err || typeof err !== 'object' || err.response?.status !== 401) return false;
  const endpoint = authEndpoint(err);
  if (endpoint === 'login') return true;
  if (endpoint === 'change-password') {
    const server = asText(err.response?.data?.error) ?? '';
    return /mot de passe/i.test(server);
  }
  return false;
}

/** Message serveur exploitable tel quel : français, ni technique, ni générique. */
function usableServerText(text: string | null): string | null {
  if (!text) return null;
  if (GENERIC_SERVER.test(text) || VALIDATION_ENVELOPE.test(text)) return null;
  if (ENGLISH.test(text)) return null;
  return text;
}

/** Premier message de validation par champ (`details[]` du middleware Zod), s'il est en français. */
function firstValidationDetail(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    const message = asText((detail as { message?: unknown } | null)?.message);
    if (message && !TECHNICAL.test(message) && usableServerText(message)) return message;
  }
  return null;
}

/** Erreur d'exécution JavaScript (bug), jamais un message destiné à l'utilisateur. */
function isRuntimeError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof RangeError ||
    error instanceof SyntaxError ||
    error instanceof EvalError ||
    error instanceof URIError
  );
}

/**
 * Message affichable pour une erreur quelconque.
 *
 * @param error    l'erreur capturée (axios, Error, string, inconnu)
 * @param fallback libellé de la page, utilisé quand l'erreur n'expose rien
 *                 d'affichable ou seulement un message générique
 *                 (« Impossible de charger les factures. »)
 */
export function getErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE): string {
  if (!error) return fallback;
  if (typeof error === 'string') {
    if (TECHNICAL.test(error)) return INTEGRITY_MESSAGE;
    return usableServerText(error.trim()) ?? fallback;
  }
  if (isRuntimeError(error)) return fallback;

  const err = error as MaybeAxiosError;
  const status = err.response?.status;
  const endpoint = authEndpoint(err);
  const serverRaw = asText(err.response?.data?.error) ?? asText(err.response?.data?.message);

  // Authentification : la même erreur HTTP ne veut pas dire la même chose.
  if (endpoint === 'login') {
    if (status === 401) return BAD_CREDENTIALS_MESSAGE;
    if (status === 403) return ACCOUNT_DISABLED_MESSAGE;
    if (status === 429) return LOGIN_RATE_LIMIT_MESSAGE;
  }
  if (endpoint === 'change-password') {
    if (isCredentialError(err)) return WRONG_CURRENT_PASSWORD_MESSAGE;
    if (status === 429) return LOGIN_RATE_LIMIT_MESSAGE;
  }

  // Statuts où le message serveur n'apporte rien de plus qu'un libellé standard.
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return FORBIDDEN_MESSAGE;
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status === 429) return RATE_LIMIT_MESSAGE;

  if (serverRaw) {
    if (TECHNICAL.test(serverRaw)) return INTEGRITY_MESSAGE;
    // « Données invalides » : le détail du premier champ en dit plus.
    if (VALIDATION_ENVELOPE.test(serverRaw)) {
      return firstValidationDetail(err.response?.data?.details) ?? fallback;
    }
    return usableServerText(serverRaw) ?? fallback;
  }

  // Pas de réponse du tout = la requête n'a pas abouti.
  if (!err.response) {
    const code = asText(err.code);
    if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') return OFFLINE_MESSAGE;
  }

  const rawMessage = asText(err.message);
  if (rawMessage && TRANSPORT.test(rawMessage)) {
    return status ? fallback : OFFLINE_MESSAGE;
  }
  // Message d'une `Error` levée par notre propre code (en français).
  if (rawMessage && !TECHNICAL.test(rawMessage) && usableServerText(rawMessage)) {
    return rawMessage;
  }

  return fallback;
}
