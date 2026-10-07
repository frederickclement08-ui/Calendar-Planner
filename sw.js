// Calendar Planner service worker: lets the app open offline.
// Change the version name whenever you upload new files, so installed copies update.
const CACHE = "calendar-planner-v3";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest?v=3", "./icon-180.png?v=3", "./icon-192.png?v=3", "./icon-512.png?v=3"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
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
  // Account sync always goes to the network.
  if (url.hostname.endsWith(".supabase.co")) return;
  if (url.origin !== self.location.origin) return;
  // The page and your settings: newest version when online, saved copy when offline.
  if (req.mode === "navigate" || url.pathname.endsWith("/config.js")) {
    const key = req.mode === "navigate" ? "./index.html" : "./config.js";
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return r;
    }).catch(() => caches.match(key)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
