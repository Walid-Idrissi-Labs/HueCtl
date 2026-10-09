// Bump VERSION whenever the shell file list changes.
const VERSION = "huectl-v2.0.0";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "js/main.js",
  "js/color.js",
  "js/device.js",
  "js/effects.js",
  "js/gestures.js",
  "js/motion.js",
  "js/panel.js",
  "js/store.js",
  "js/timer.js",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
  "assets/favicon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: answer from cache instantly (works offline), then
// refresh the cached copy so the next launch picks up new deploys.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  const isPage = request.mode === "navigate";
  const cacheKey = isPage ? "index.html" : request;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(cacheKey, { ignoreSearch: isPage });
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(cacheKey, response.clone());
          return response;
        })
        .catch(() => cached ?? Response.error());

      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return refresh;
    })
  );
});
