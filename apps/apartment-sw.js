// Network-first strategy: always try network, cache as fallback.
const CACHE_NAME = 'apartment-v76';
const THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const ASSETS = [
  './apartment.html',
  './apartment-manifest.json',
  '/assets/icons/icon.svg',
  THREE_MODULE_URL
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
        // Cache successful same-origin and CORS responses. Three.js is served
        // from jsDelivr as a CORS response and is required for offline startup.
        if (!response || !response.ok) return response;
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
