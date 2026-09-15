const CACHE_NAME = 'esenho-v1.0.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.html',
  './manifest.webmanifest',
  './icon.svg',
  './src/esenho.js',
  './src/host-browser.js',
  './src/image_io.js',
  './src/papagaio/index.js',
  './src/papagaio/lib/papagaio.js',
  './src/papagaio/lib/compiler.js',
  './src/papagaio/lib/interpolate.js',
  './src/papagaio/lib/matcher.js',
  './src/papagaio/lib/modifiers.js',
  './src/papagaio/lib/options.js',
  './src/papagaio/lib/replacement.js',
  './roms/canvas.wasm',
  './plugins/manifest.json',
  './plugins/blur.wasm',
  './plugins/brightness.wasm',
  './plugins/contrast.wasm',
  './plugins/dither.wasm',
  './plugins/edge.wasm',
  './plugins/grayscale.wasm',
  './plugins/invert.wasm',
  './plugins/noise.wasm',
  './plugins/pixelate.wasm',
  './plugins/sepia.wasm',
  './plugins/threshold.wasm'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignore non-http / non-same-origin requests unless relative
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML pages): Network-first with Cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return networkRes;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./app.html') || caches.match('./index.html')))
    );
    return;
  }

  // Static assets & WASM: Cache-first with background network update
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch((err) => {
          // Network failed, nothing to update
          return null;
        });

      return cachedRes || fetchPromise;
    })
  );
});
