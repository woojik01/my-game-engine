const CACHE_NAME = 'my-game-engine-v0.1.0';
const APP_ROOT = new URL('./', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(APP_ROOT, { cache: 'reload' });
    if (response.ok) {
      const html = await response.clone().text();
      await cache.put(APP_ROOT, response);
      const referenced = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => new URL(match[1], APP_ROOT).href)
        .filter((url) => new URL(url).origin === self.location.origin);
      const extras = ['manifest.webmanifest', 'icon.svg'].map((path) => new URL(path, APP_ROOT).href);
      await Promise.all([...referenced, ...extras].map(async (url) => {
        try {
          const asset = await fetch(url);
          if (asset.ok) await cache.put(url, asset);
        } catch {
          // A single optional asset must not prevent the editor from installing.
        }
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('my-game-engine-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match(APP_ROOT)) || Response.error();
      return Response.error();
    }
  })());
});
