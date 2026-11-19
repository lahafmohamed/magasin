import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Identifiant de l'utilisateur en cache — les brouillons sont rangés par personne. */
function cachedUserId(): string {
  try {
    const raw = localStorage.getItem('auth_user');
    const id = raw ? (JSON.parse(raw) as { id?: unknown }).id : undefined;
    return typeof id === 'number' || typeof id === 'string' ? String(id) : 'anonyme';
  } catch {
    return 'anonyme';
  }
}

/**
 * Persist a form draft to localStorage so unsaved work survives a refresh or crash.
 * Writes are debounced. Call `clear()` after a successful submit.
 *
 * Drafts are keyed per user (`draft:<userId>:<storageKey>`) and wiped at
 * logout (AuthContext): on a shared counter PC the next person is no longer
 * offered a colleague's half-typed invoice.
 *
 *   const { draft, save, clear, hasDraft } = useDraft<MyForm>('facture:new');
 */
export function useDraft<T>(storageKey: string, debounceMs = 600) {
  const key = useMemo(() => `draft:${cachedUserId()}:${storageKey}`, [storageKey]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [draft] = useState<T | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  });

  const save = useCallback(
    (value: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          /* quota / serialization — ignore */
        }
      }, debounceMs);
    },
    [key, debounceMs]
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { draft, save, clear, hasDraft: draft != null };
}
