import { useCallback, useEffect, useState } from 'react';
import { stockLocationService, ventesService } from '@/services/api';
import { toNumber } from '@/utils/format';

/** Magasin de vente (`GET /produits/ventes/locations` : les dépôts sont exclus). */
export interface SalesLocation {
  id: number;
  code: string;
  nom: string;
  est_principal: boolean;
}

interface StockLevel {
  produit_id: number;
  quantite_disponible: number | string;
}

export type LoadState = 'loading' | 'ready' | 'error';

/**
 * Magasins où l'on peut vendre. `pickDefault` reçoit la liste chargée pour
 * choisir l'emplacement par défaut (principal, sinon le premier) quand le
 * formulaire n'en a pas déjà un valide.
 */
export function useSalesLocations(pickDefault: (list: SalesLocation[]) => void) {
  const [locations, setLocations] = useState<SalesLocation[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const response = await ventesService.getLocations();
      const list: SalesLocation[] = Array.isArray(response) ? response : response?.data ?? [];
      setLocations(list);
      setState('ready');
      pickDefault(list);
    } catch (err) {
      setError(err);
      setState('error');
    }
    // `pickDefault` ne lit que des setters stables du formulaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { locations, state, error, reload };
}

/**
 * Stock disponible par produit dans un magasin. Tant qu'il n'est pas chargé
 * (ou en cas d'échec), `stockOf` retombe sur le stock global du produit.
 */
export function useLocationStock(locationId: number | null | undefined) {
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [state, setState] = useState<LoadState>('loading');

  const reload = useCallback(async () => {
    if (!locationId) return;
    setState('loading');
    try {
      const response = await stockLocationService.getStockLevels(locationId);
      const levels: StockLevel[] = Array.isArray(response) ? response : response?.data ?? [];
      const next: Record<number, number> = {};
      for (const level of levels) next[level.produit_id] = toNumber(level.quantite_disponible) ?? 0;
      setStockMap(next);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [locationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stockOf = useCallback(
    (produitId: number, fallback: number | string | null | undefined) =>
      state === 'ready' ? stockMap[produitId] ?? 0 : toNumber(fallback) ?? 0,
    [stockMap, state]
  );

  return { stockMap, state, reload, stockOf };
}

/** Choix par défaut : l'emplacement courant s'il existe encore, sinon le principal, sinon le premier. */
export function defaultLocationId(list: SalesLocation[], current: number | null | undefined): number | null {
  if (current && list.some((l) => l.id === current)) return current;
  const def = list.find((l) => l.est_principal) ?? list[0];
  return def ? def.id : null;
}
