import { describe, expect, it, vi } from 'vitest';
import swSource from '../../public/sw.js?raw';
import { retirerServiceWorker } from './serviceWorker';

describe('retirerServiceWorker (lot 29-A)', () => {
  it('désinscrit chaque service worker et vide chaque cache', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const serviceWorker = {
      getRegistrations: vi.fn().mockResolvedValue([{ unregister }, { unregister }]),
    } as unknown as ServiceWorkerContainer;
    const cacheStorage = {
      keys: vi.fn().mockResolvedValue(['nolyx-cache-v4', 'hitek-cache-v3']),
      delete: vi.fn().mockResolvedValue(true),
    } as unknown as CacheStorage;

    await retirerServiceWorker(serviceWorker, cacheStorage);

    expect(unregister).toHaveBeenCalledTimes(2);
    expect(cacheStorage.delete).toHaveBeenCalledWith('nolyx-cache-v4');
    expect(cacheStorage.delete).toHaveBeenCalledWith('hitek-cache-v3');
  });

  it('ne plante pas sans service worker ni cache (navigateur ancien, contexte non sécurisé)', async () => {
    await expect(retirerServiceWorker(undefined, undefined)).resolves.toBeUndefined();
    const refuse = { getRegistrations: vi.fn().mockRejectedValue(new Error('SecurityError')) } as unknown as ServiceWorkerContainer;
    await expect(retirerServiceWorker(refuse, undefined)).resolves.toBeUndefined();
  });
});

describe('public/sw.js (lot 29-A)', () => {
  type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

  /** Exécute `public/sw.js` dans un faux contexte de service worker. */
  function loadServiceWorker() {
    const listeners = new Map<string, Listener>();
    const caches = {
      keys: vi.fn().mockResolvedValue(['nolyx-cache-v4']),
      delete: vi.fn().mockResolvedValue(true),
    };
    const self = {
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
      skipWaiting: vi.fn(),
      registration: { unregister: vi.fn().mockResolvedValue(true) },
      clients: { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue([]) },
    };
    new Function('self', 'caches', swSource)(self, caches);
    return { listeners, self, caches };
  }

  it('n’intercepte aucune requête', () => {
    const { listeners } = loadServiceWorker();
    expect(listeners.has('fetch')).toBe(false);
  });

  it('remplace l’ancien sans attendre, vide les caches et se désinscrit, sans recharger la page', async () => {
    const { listeners, self, caches } = loadServiceWorker();
    listeners.get('install')!({ waitUntil: () => undefined });
    expect(self.skipWaiting).toHaveBeenCalled();

    let pending: Promise<unknown> = Promise.resolve();
    listeners.get('activate')!({ waitUntil: (p) => { pending = p; } });
    await pending;

    expect(caches.delete).toHaveBeenCalledWith('nolyx-cache-v4');
    expect(self.registration.unregister).toHaveBeenCalled();
    expect(self.clients.matchAll).not.toHaveBeenCalled();
  });
});
