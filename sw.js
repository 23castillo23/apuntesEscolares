const CACHE_NAME = 'fotoapuntes-shell-v4';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/escolar.js',
  './manifest.webmanifest',
  './icons/icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === 'navigate';
  const isAppShellAsset = isSameOrigin && (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('/manifest.webmanifest')
  );

  // Navegaciones + assets de la app: red primero para evitar quedarse
  // con versiones viejas tras publicar una actualizacion.
  if (isNavigation || isAppShellAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && isSameOrigin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Resto de recursos: cache primero con actualizacion en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkPromise = fetch(request).then((response) => {
        if (response && response.ok && isSameOrigin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => null);
      return cached || networkPromise;
    })
  );
});
