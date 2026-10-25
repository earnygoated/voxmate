// VoxMate service worker. It only caches the app's own files so the page can open offline.
// It never touches requests to other origins (the Worker/AI backend), so API data is never cached.
// Bump CACHE when you want every device to drop its old copy.
const CACHE = "voxmate-shell-v3";
const FILES = ["./", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first for the page and its files, so GitHub Pages updates always win.
  // The cached copy is only a fallback when the network is unavailable.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          const key = request.mode === "navigate" ? "./" : request;
          caches.open(CACHE).then(cache => cache.put(key, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request.mode === "navigate" ? "./" : request);
        return cached || Response.error();
      })
  );
});
