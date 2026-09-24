const CACHE_VERSION = 'phs-evidence-camera-v12-config-json';
const CACHE_PREFIX = 'phs-evidence-camera-';
const CONFIG_PATHS = new Set([
  '/PHSEvidence/app-settings.json',
  '/PHSEvidence/teaching-data.json'
]);
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest?v=8',
  './config-loader.js?v=2',
  './pwa.js?v=8',
  './phs-shield.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

function isConfigRequest(url) {
  return url.origin === self.location.origin && CONFIG_PATHS.has(url.pathname);
}

function configCacheKey(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return new Request(url.toString(), { method: 'GET' });
}

async function networkFirstConfig(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cacheKey = configCacheKey(request);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isConfigRequest(url)) {
    event.respondWith(networkFirstConfig(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
