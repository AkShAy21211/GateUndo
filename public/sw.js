const CACHE_NAME = "railundo-shell-v4";
const APP_SHELL = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/_next/webpack-hmr")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheResponse("/", response);
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        return (
          cachedResponse ??
          fetch(request).then((response) => {
            cacheResponse(request, response);
            return response;
          })
        );
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        cacheResponse(request, response);
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

function cacheResponse(request, response) {
  if (!response || !response.ok || response.type !== "basic") {
    return;
  }

  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
}
