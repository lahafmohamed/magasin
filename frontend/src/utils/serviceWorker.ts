/**
 * Retire le service worker de l'application (lot 29-A).
 *
 * L'ancien `sw.js` répondait à une coupure réseau par un statut 200
 * `{ success: false }`, que chaque écran prenait pour un succès. Il n'y a plus
 * de service worker : à chaque démarrage, on désinscrit ceux qui restent et on
 * vide le cache qu'ils avaient rempli. `public/sw.js` fait la même chose de son
 * côté, pour un navigateur qui le met à jour avant que cette page ne charge.
 *
 * La page déjà ouverte reste contrôlée par l'ancien service worker jusqu'à sa
 * fermeture : l'intercepteur d'`api.ts` rejette son faux succès en attendant.
 */
export async function retirerServiceWorker(
  serviceWorker: Pick<ServiceWorkerContainer, 'getRegistrations'> | undefined = typeof navigator !== 'undefined'
    ? navigator.serviceWorker
    : undefined,
  cacheStorage: Pick<CacheStorage, 'keys' | 'delete'> | undefined = typeof caches !== 'undefined' ? caches : undefined
): Promise<void> {
  try {
    const registrations = serviceWorker ? await serviceWorker.getRegistrations() : [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    /* navigation privée, contexte non sécurisé : rien à retirer */
  }
  try {
    const keys = cacheStorage ? await cacheStorage.keys() : [];
    await Promise.all(keys.map((key) => cacheStorage!.delete(key)));
  } catch {
    /* Cache Storage indisponible */
  }
}
