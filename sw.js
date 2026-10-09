import { SHELL, storedCacheKey, workerHandles } from "./offline.js?v=off1";

const CACHE = "dice-offline-9";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "refresh") return;
  event.waitUntil(
    refreshPage()
      .catch(() => {})
      .then(() => {
        if (event.source) event.source.postMessage({ type: "refreshed" });
      })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!workerHandles(request.url, self.location.origin, request.method)) return;
  event.respondWith(fromCacheThenNetwork(event, request));
});

async function fromCacheThenNetwork(event, request) {
  const cache = await caches.open(CACHE);
  const key = storedCacheKey(request.mode) || request;
  const cached = await cache.match(key);
  const refresh = refreshEntry(cache, request, key);
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

async function refreshEntry(cache, request, key) {
  const response = await fetch(request);
  if (response.ok) await cache.put(key, response.clone());
  return response;
}

async function refreshPage() {
  const cache = await caches.open(CACHE);
  const response = await fetch("index.html", { cache: "reload" });
  if (response.ok) await cache.put("index.html", response);
}
