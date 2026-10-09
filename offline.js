export const SHELL = [
  "index.html",
  "styles.css?v=tap4",
  "app.js?v=eng4",
  "offline.js?v=off1",
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

export function shouldOfferUpdate(local, remote) {
  if (!local || !remote) return false;
  return remote !== local;
}

export function workerHandles(requestUrl, scopeOrigin, method) {
  if (method !== "GET") return false;
  const url = new URL(requestUrl);
  if (url.origin !== scopeOrigin) return false;
  return !url.pathname.endsWith("/version.json");
}

export function storedCacheKey(mode) {
  if (mode === "navigate") return "index.html";
  return null;
}
