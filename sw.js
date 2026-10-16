/**
 * Service Worker — Congregação Nova Aurora PWA
 * Estratégia Network-First resiliente (arquitetura Cristolândia / Cuidar)
 */

const CACHE_NAME = 'nova-aurora-v23';

self.addEventListener('install', (event) => {
  // Ativa imediatamente a nova versão sem esperar fechamento de abas
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Limpa caches antigos e assume controle imediatamente de todos os clientes
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Estratégia NETWORK-FIRST para todos os recursos da aplicação (HTML, JS, CSS, Imagens):
// 1. Sempre tenta buscar a versão mais recente diretamente do servidor (Firebase Hosting/GitHub)
// 2. Salva a cópia atualizada no cache local
// 3. Se estiver offline ou a rede falhar, entrega a versão em cache imediatamente
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http') || event.request.method !== 'GET') return;

  // Ignora chamadas diretas ao Firestore e APIs Google
  if (
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('firebaseio.com') ||
    event.request.url.includes('googleapis.com')
  ) {
    return;
  }

  // version.json sempre deve vir da rede sem cache
  if (event.request.url.includes('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate' || event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

