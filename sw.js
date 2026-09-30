// Study Planner service worker: makes the app open offline from the Home Screen.
const CACHE = "study-planner-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Sync traffic always goes to the network.
  if (url.hostname === "api.github.com" || url.hostname.endsWith("githubusercontent.com")) return;
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") {
      // Newest version when online, cached copy when offline.
      e.respondWith(fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copy));
        return r;
      }).catch(() => caches.match("./index.html")));
      return;
    }
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
