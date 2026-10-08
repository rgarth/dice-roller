const CACHE = "dice-offline-4";

const SHELL = [
  "index.html",
  "styles.css?v=eng1",
  "app.js?v=eng2",
  "games.js?v=eng2",
  "boot.js?v=eng2",
  "vendor/dice.js?v=eng2",
  "vendor/cannon.min.js",
  "vendor/three/three.module.js",
  "vendor/three/three.core.js",
  "fonts/cinzel-latin.woff2",
  "fonts/ibm-plex-sans-latin.woff2",
  "manifest.json",
  "favicon.ico",
  "favicon.svg",
  "favicon-32x32.png",
  "favicon-192.png",
  "favicon-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(fromNetworkThenCache(request));
});

async function fromNetworkThenCache(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      if (request.mode === "navigate") {
        await cache.put("index.html", response.clone());
      }
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (request.mode === "navigate") {
      const page = await cache.match("index.html");
      if (page) {
        return page;
      }
    }
    throw error;
  }
}
