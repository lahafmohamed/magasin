/**
 * Normalisation des erreurs réseau/serveur en message affichable.
 *
 * Le backend renvoie l'enveloppe `{ success, data, error }` ; `error` est en
 * français et destiné à l'utilisateur. Mais deux familles de messages ne doivent
 * jamais atteindre l'écran :
 *   - les erreurs Postgres brutes (« violates foreign key constraint … »),
 *     qui fuitent des noms de tables/contraintes ;
 *   - les messages internes d'axios (« Network Error », « Request failed with
 *     status code 500 »), en anglais et sans valeur pour l'utilisateur.
 *
 * `getErrorMessage` filtre ces deux familles et retombe sur un libellé métier.
 *
 *   catch (err) { toast.error(getErrorMessage(err, 'Erreur lors de la suppression')); }
 */

const DEFAULT_MESSAGE = 'Une erreur est survenue.';

/** Messages Postgres / techniques à ne pas exposer tels quels. */
const TECHNICAL = /violates|constraint|syntax error|relation ".*" does not exist|duplicate key|null value in column|invalid input syntax|deadlock|ECONNREFUSED|ETIMEDOUT/i;

/** Messages internes axios/fetch (anglais) à ne pas exposer. */
const TRANSPORT = /^(network error|request failed with status code \d+|timeout of \d+ms exceeded|canceled|failed to fetch)$/i;

/** Erreur applicative liée à une contrainte d'intégrité — message métier générique. */
const INTEGRITY_MESSAGE =
  "Opération refusée : cet enregistrement est lié à d'autres documents ou les données sont invalides.";

type MaybeAxiosError = {
  response?: { status?: number; data?: { error?: unknown; message?: unknown } };
  message?: unknown;
  code?: unknown;
};

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Message affichable pour une erreur quelconque.
 *
 * @param error    l'erreur capturée (axios, Error, string, inconnu)
 * @param fallback libellé métier utilisé si l'erreur n'expose rien d'affichable
 */
export function getErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE): string {
  if (!error) return fallback;
  if (typeof error === 'string') return TECHNICAL.test(error) ? INTEGRITY_MESSAGE : error;

  const err = error as MaybeAxiosError;
  const status = err.response?.status;

  // Statuts où le message serveur n'apporte rien de plus qu'un libellé standard.
  if (status === 401) return 'Session expirée. Reconnectez-vous.';
  if (status === 403) return "Vous n'avez pas les droits pour cette action.";
  if (status === 404) return 'Ressource introuvable.';
  if (status === 429) return 'Trop de requêtes. Réessayez dans un instant.';

  const serverMessage = asText(err.response?.data?.error) ?? asText(err.response?.data?.message);
  if (serverMessage) {
    return TECHNICAL.test(serverMessage) ? INTEGRITY_MESSAGE : serverMessage;
  }

  // Pas de réponse du tout = la requête n'a pas abouti.
  if (!err.response) {
    const code = asText(err.code);
    if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') {
      return 'Serveur injoignable. Vérifiez votre connexion.';
    }
  }

  const rawMessage = asText(err.message);
  if (rawMessage && !TRANSPORT.test(rawMessage) && !TECHNICAL.test(rawMessage)) {
    return rawMessage;
  }
  if (rawMessage && TRANSPORT.test(rawMessage)) {
    return status
      ? fallback
      : 'Serveur injoignable. Vérifiez votre connexion.';
  }

  return fallback;
}
