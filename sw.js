// Static application shell only. Video bytes never enter Cache Storage.
importScripts("./app-core.js");
const PREFIX = `pwatest-${self.registration.scope}-`;
const CACHE = PREFIX + "v43-continuous-today-tasks";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./app-core.js",
  "./app-store.js",
  "./app-media.js",
  "./app-player.js",
  "./app-views.js",
  "./app-history.js",
  "./history.css",
  "./app.css",
  "./app-button.css",
  "./home.css",
  "./parent.css",
  "./content-center.css",
  "./interaction.js",
  "./interaction.css",
  "./hls-core.js",
  "./pwa.js",
  "./manifest.json",
  "./favicon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  ...AppCore.COVER_ATLASES,
  "./assets/parent/icons/sprite.svg",
  "./assets/parent/images/header-landscape.svg",
  "./assets/content-center/header-landscape.svg",
  "./assets/content-center/hero-atlas.png",
  "./assets/content-center/star-lit.png",
  "./assets/content-center/star-locked.png",
  "./assets/content-center/medals-atlas.png",
];
const ALLOWED = new Set(
  ASSETS.map((p) => new URL(p, self.registration.scope).href),
);
const PLAYLIST = new URL("__playlist__/", self.registration.scope).href;
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(
        ASSETS.map(
          (p) =>
            new Request(new URL(p, self.registration.scope), {
              cache: "reload",
            }),
        ),
      );
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE")
    event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(PREFIX) && n !== CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  ),
);
function readPlaylist(id) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("pwatest-local-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result,
        tx = db.transaction("state"),
        request = tx.objectStore("state").get("snapshot");
      request.onsuccess = () => {
        const v = request.result?.videos?.find(
          (v) => v.id === id && v.source.kind === "playlist",
        );
        resolve(v?.source.body);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = tx.onabort = () => db.close();
    };
  });
}
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.href.startsWith(PLAYLIST)) {
    event.respondWith(
      (async () => {
        const name = url.href.slice(PLAYLIST.length);
        if (!/^[a-zA-Z0-9_-]{1,100}\.m3u8$/.test(name))
          return new Response("Not found", { status: 404 });
        try {
          const body = await readPlaylist(name.replace(/\.m3u8$/, ""));
          if (!body) return new Response("Playlist missing", { status: 404 });
          const bytes = new TextEncoder().encode(body),
            range = event.request.headers.get("Range"),
            headers = {
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-store",
              "Accept-Ranges": "bytes",
            };
          if (range) {
            const m = /^bytes=(\d+)-(\d*)$/.exec(range),
              start = m ? Number(m[1]) : -1,
              end =
                m && m[2]
                  ? Math.min(Number(m[2]), bytes.length - 1)
                  : bytes.length - 1;
            if (
              start < 0 ||
              start > end ||
              !Number.isSafeInteger(start) ||
              !Number.isSafeInteger(end)
            )
              return new Response(null, {
                status: 416,
                headers: { "Content-Range": "bytes */" + bytes.length },
              });
            headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
            headers["Content-Length"] = String(end - start + 1);
            return new Response(bytes.slice(start, end + 1), {
              status: 206,
              headers,
            });
          }
          headers["Content-Length"] = String(bytes.length);
          return new Response(bytes, { headers });
        } catch {
          return new Response("Local data unavailable", { status: 503 });
        }
      })(),
    );
    return;
  }
  url.search = "";
  url.hash = "";
  if (!ALLOWED.has(url.href)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE),
        stored = await cache.match(url.href);
      if (stored) return stored;
      try {
        const response = await fetch(event.request, { cache: "no-cache" });
        if (response.ok)
          try {
            await cache.put(url.href, response.clone());
          } catch {}
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
