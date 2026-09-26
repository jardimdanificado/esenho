const CACHE_NAME = 'esenho-v0.9.16';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './studio.html',
  './painter.html',
  './manifest.webmanifest',
  './icon.svg',
  './src/version.js',
  './src/script/wesenho_sdk.js',
  './src/script/command_bus.js',
  './src/script/memory_bridge.js',
  './src/script/hook_registry.js',
  './src/script/domains/raster_domain.js',
  './src/script/domains/vector_domain.js',
  './src/script/domains/anim_domain.js',
  './src/script/domains/audio_domain.js',
  './src/script/domains/ui_domain.js',
  './src/anim/animator_engine.js',
  './src/project_store.js',
  './src/gpu/shaders.js',
  './src/gpu/gpu_renderer.js',
  './src/esenho.js',
  './src/host-browser.js',
  './src/image_io.js',
  './plugins/canvas.wasm',
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

  // Network-first strategy for all resources with Cache fallback
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return caches.match('./studio.html') || caches.match('./painter.html') || caches.match('./index.html');
          }
          return null;
        });
      })
  );
});

