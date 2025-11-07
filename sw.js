const CACHE_VERSION = 'ap-site-v1';
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const PAGE_CACHE = `pages-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/pages/bio.html',
  '/pages/experiments.html',
  '/pages/music.html',
  '/assets/pages.css',
  '/assets/nav.js',
  '/assets/manifest.webmanifest',
  '/assets/icons/icon.svg',
  '/assets/icons/maskable.svg',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => ![ASSET_CACHE, PAGE_CACHE].includes(k)).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

function isAppPath(url) {
  try {
    const u = new URL(url);
    return u.pathname.startsWith('/apps/');
  } catch { return false; }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  
  // App HTML pages: Network-first, fallback to cache
  if (isAppPath(url) && request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('/offline.html');
        })
    );
    return;
  }
  
  // Skip other app requests (let network handle)
  if (isAppPath(url)) {
    return;
  }

  // HTML pages: Network-first, fallback to cache then offline
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('/offline.html');
        })
    );
    return;
  }

  // Static assets: Stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

