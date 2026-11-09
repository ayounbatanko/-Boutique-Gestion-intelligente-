/* Service worker : permet à l'application (et au scan de codes-barres) de fonctionner sans connexion. */
const CACHE = "boutique-gestion-v3";
const LOCAL = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png"];
const CDN = [
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fichiers du site : un fichier absent n'empêche pas l'installation
    await Promise.all(LOCAL.map(async (u) => {
      try { const r = await fetch(u, { cache: "reload" }); if (r.ok) await cache.put(u, r); } catch (e) {}
    }));
    // Bibliothèques externes (scanner) : copiées sur l'appareil pour fonctionner hors ligne
    await Promise.all(CDN.map(async (u) => {
      try { const r = await fetch(u, { mode: "no-cors" }); await cache.put(u, r); } catch (e) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isCdn = CDN.includes(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!isCdn && !sameOrigin) return; // autres services (ntfy, etc.) : réseau normal
  if (url.pathname.endsWith(".apk")) return; // le téléchargement de l'APK ne doit pas être mis en cache

  // Pages : réseau d'abord (mises à jour), cache si hors ligne
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const r = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))
        ]);
        const cache = await caches.open(CACHE);
        cache.put("index.html", r.clone());
        return r;
      } catch (e) {
        return (await caches.match("index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Autres fichiers : cache d'abord, puis réseau
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && (r.ok || r.type === "opaque")) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
      return r;
    } catch (e) {
      return Response.error();
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (list.length) return list[0].focus();
    return self.clients.openWindow("./");
  })());
});
