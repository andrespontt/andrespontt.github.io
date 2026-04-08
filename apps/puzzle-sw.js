// Network-first strategy: always try network, cache as fallback.
// Bump CACHE_NAME version whenever app content changes to evict stale caches.
const CACHE_NAME = 'puzzle-v4';
const ASSETS = [
  './puzzle.html',
  './puzzle-manifest.json',
  '/assets/icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => name !== CACHE_NAME && caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
