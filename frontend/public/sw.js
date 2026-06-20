const CACHE_NAME = 'hitek-cache-v2';
const STATIC_ASSETS = [
  '/manifest.json',
  '/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne jamais intercepter les requêtes Vite HMR ou les modules
  if (url.pathname.startsWith('/@vite/') || url.pathname.startsWith('/node_modules/') || url.hostname === 'localhost' && url.port !== '') {
    return;
  }

  // API requests → Network First (offline support)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (images, fonts, manifest) → Cache First
  if (request.destination === 'image' || request.destination === 'font' || request.destination === 'manifest') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Ne pas intercepter les scripts JS (laissés à Vite) ni les documents
  // pour éviter les problèmes de cache avec React
  return;
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ success: false, error: 'Hors ligne' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}
