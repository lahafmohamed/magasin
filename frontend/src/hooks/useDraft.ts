import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Persist a form draft to localStorage so unsaved work survives a refresh or crash.
 * Writes are debounced. Call `clear()` after a successful submit.
 *
 *   const { draft, save, clear, hasDraft } = useDraft<MyForm>('facture:new');
 */
export function useDraft<T>(storageKey: string, debounceMs = 600) {
  const key = `draft:${storageKey}`;
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
