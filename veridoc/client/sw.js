/**
 * AegisDoc Service Worker
 * Ensures 100% Offline Capability in Airplane Mode with Network-First Live Updates.
 */

const CACHE_NAME = 'aegisdoc-v3.5.3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './forensics.js',
  './bridge.js',
  './voice.js',
  './manifest.json',
  './samples/manifest.json',
  './samples/sample_1_authentic.png',
  './samples/sample_2_amount_forged.png',
  './samples/sample_3_date_font_forged.png',
  './samples/sample_4_cloned_signature.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching v3.0.1 assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never intercept WebSocket or backend endpoints
  if (event.request.url.includes('/ws') || event.request.url.includes('/api/')) {
    return;
  }

  // Network-first strategy for live updates, fallback to cache offline
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
