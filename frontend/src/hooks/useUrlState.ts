import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Sync a piece of list state (search, filter, page, …) to the URL query string.
 * Keeps filters/page intact across back-navigation and page refresh, and makes
 * the current view shareable. Falls back to `fallback` when the param is absent.
 */
export function useUrlState(key: string, fallback: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;

  const setValue = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === fallback || next === '') {
            p.delete(key);
          } else {
            p.set(key, next);
          }
          return p;
        },
        { replace: true }
      );
    },
    [key, fallback, setParams]
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
