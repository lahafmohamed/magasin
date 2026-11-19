import { useCallback, useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Modification de la query-string : une valeur `null`, `undefined` ou `''`
 * retire le paramètre ; un nombre ou un booléen est écrit en texte.
 */
export type SearchParamsPatch = Record<string, string | number | boolean | null | undefined>;

export interface PatchOptions {
  /** Remplace l'entrée d'historique (défaut) ; `false` en ajoute une (retour arrière = état précédent). */
  replace?: boolean;
}

/**
 * Paramètres écrits pendant la tâche en cours, partagés par tous les
 * écrivains d'URL. React Router passe à un `setSearchParams` fonctionnel les
 * paramètres du DERNIER RENDU : deux écritures dans le même gestionnaire
 * (statut + page, recherche + page) partaient du même état et la seconde
 * effaçait la première — les filtres des listes ne faisaient rien. Le tampon
 * est vidé à la fin de la tâche (microtâche) : au rendu suivant, les
 * paramètres du routeur sont de nouveau la référence.
 */
let pending: { base: string; next: URLSearchParams } | null = null;

function applyPatch(target: URLSearchParams, patch: SearchParamsPatch | ((p: URLSearchParams) => void)) {
  if (typeof patch === 'function') {
    patch(target);
    return;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') target.delete(key);
    else target.set(key, String(value));
  }
}

/**
 * Écrit dans la query-string en un seul appel, sans jamais écraser une
 * écriture faite juste avant (même gestionnaire, minuterie de recherche
 * capturée lors d'un rendu antérieur…). La fonction renvoyée est stable.
 *
 *   const patchParams = useSearchParamsPatch();
 *   patchParams({ statut: 'payee', page: null });          // une action = une écriture
 *   patchParams((p) => p.delete('nouveau'));               // édition libre
 *   patchParams({ commande_id: 12 }, { replace: false });  // nouvelle entrée d'historique
 */
export function useSearchParamsPatch() {
  const [, setParams] = useSearchParams();
  // Toujours le `setSearchParams` du dernier rendu validé : une minuterie
  // (recherche débouncée) qui a capturé une ancienne fonction repart quand
  // même des paramètres courants.
  const setParamsRef = useRef(setParams);
  useLayoutEffect(() => {
    setParamsRef.current = setParams;
  }, [setParams]);

  return useCallback(
    (patch: SearchParamsPatch | ((p: URLSearchParams) => void), options: PatchOptions = {}) => {
      setParamsRef.current(
        (prev) => {
          const base = prev.toString();
          const next = new URLSearchParams(pending && pending.base === base ? pending.next : prev);
          applyPatch(next, patch);
          if (!pending) {
            queueMicrotask(() => {
              pending = null;
            });
          }
          pending = { base, next };
          return next;
        },
        { replace: options.replace ?? true }
      );
    },
    []
  );
}

/**
 * Sync a piece of list state (search, filter, page, …) to the URL query string.
 * Keeps filters/page intact across back-navigation and page refresh, and makes
 * the current view shareable. Falls back to `fallback` when the param is absent.
 * Plusieurs setters appelés dans le même gestionnaire se cumulent.
 */
export function useUrlState(key: string, fallback: string) {
  const [params] = useSearchParams();
  const patchParams = useSearchParamsPatch();
  const value = params.get(key) ?? fallback;

  const setValue = useCallback(
    (next: string) => patchParams({ [key]: next === fallback ? null : next }),
    [key, fallback, patchParams]
  );

  return [value, setValue] as const;
}

/** Number-typed variant of {@link useUrlState}. */
export function useUrlNumber(key: string, fallback: number) {
  const [raw, setRaw] = useUrlState(key, String(fallback));
  const parsed = Number(raw);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  const setValue = useCallback((next: number) => setRaw(String(next)), [setRaw]);
  return [value, setValue] as const;
}

/**
 * Date « AAAA-MM-JJ » lue dans l'adresse ; `''` si absente ou mal formée — une
 * adresse saisie à la main n'envoie jamais n'importe quoi à l'API.
 */
export function readDateParam(params: URLSearchParams, key: string): string {
  const raw = params.get(key) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}
