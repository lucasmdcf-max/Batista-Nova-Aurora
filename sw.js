/**
 * Service Worker — Congregação Nova Aurora PWA
 */

const CACHE_NAME = 'nova-aurora-v18';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css?v=18',
  './css/lenis.css',
  './js/lenis.min.js',
  './js/app.js?v=18',
  './js/prayers.js?v=18',
  './js/visitors.js?v=18',
  './js/firebase-config.js',
  './manifest.json',
  './FUNDO APP/01.png?v=3',
  './FUNDO APP/02.png?v=3',
  './FUNDO APP/03.png?v=3',
  './FUNDO APP/04.png?v=3',
  './FUNDO APP/referência.png?v=3',
  './FUNDO APP/nome-trimmed.png?v=3',
  './FUNDO APP/Logo branca - Nova Aurora_transparente.png?v=7',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32x32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cache inicial dos arquivos concluído (v18)');
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  // Nunca cacheia version.json para permitir detecção em tempo real de novas versões
  if (event.request.url.includes('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Para navegação HTML (index.html), usa Network-First para sempre pegar versão mais recente
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Demais arquivos (imagens, scripts, css): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {});

      return cachedResponse || fetchPromise;
    })
  );
});
