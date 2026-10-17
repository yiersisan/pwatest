// 一个 scope、一套版本化资源；完整安装后等待用户选择更新。
const CACHE_PREFIX = `pwatest-${self.registration.scope}-`;
const CACHE = `${CACHE_PREFIX}v24-parent-customization`;
// User-imported manifests survive application updates. This is not a media proxy.
const IMPORT_CACHE = `pwatest-imports-${self.registration.scope}-v1`;
const IMPORT_PREFIX = new URL('__local_hls__/', self.registration.scope).href;
const ASSETS = ["./parent-playback.js","./parent-courses.html","./parent-upload.html","./parent-home.html","./parent.css","./parent-gate.css","./parent-gate.js","./parent-core.js","./parent-backend.js","./parent-service.js","./parent-app.js","./parent-view.js","./parent-public.js","./parent-public.css","./assets/parent/icons/sprite.svg","./assets/parent/images/header-landscape.svg","./assets/parent/images/learning-atlas.png",'./assets/content-center/hero-map.json', './assets/content-center/hero-atlas.png',
  './assets/content-center/star-lit.svg', './assets/content-center/star-locked.svg', './assets/content-center/check-unlocked.svg', './interaction.css', './interaction.js', './watch-player.css', './watch-player.js', './content-center.html', './content-center.css', './content-center.js', './content-config.js',
  './content-demo.js', './reward-core.js', './reward-store.js', './course-player.js', './profile.js', './assets/icons/energy-star.svg',
  './', './index.html', './report.html', './home.css', './home.js', './learning-core.js',
  './learning-data.json', './pwa.js', './app.js', './player-core.js', './styles.css', './manifest.json',
  './default-video.js', './video-items.js', './hls-core.js', './hls-import.js', './favicon.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './assets/asset-manifest.json', './assets/icons/sprite.svg', './assets/images/illustration-atlas.png'];
const HOME = new URL('./index.html', self.registration.scope).href;
const ROOT = new URL('./', self.registration.scope).href;
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    // 不自动 skipWaiting。已打开的页面继续使用当前版本。
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.href.startsWith(IMPORT_PREFIX)) {
    event.respondWith((async () => {
      if (url.href === IMPORT_PREFIX + 'capabilities') return new Response('local-manifest-v1', { headers: { 'X-Pwatest-HLS': '1', 'Cache-Control': 'no-store' } });
      if (!/^[a-f0-9]{64}\/playlist\.m3u8$/.test(url.href.slice(IMPORT_PREFIX.length))) return new Response('Not found', { status: 404 });
      try {
        const cache = await caches.open(IMPORT_CACHE);
        const stored = await cache.match(url.href);
        if (!stored) return new Response('Local playlist missing; import it again.', { status: 404 });
        const body = await stored.arrayBuffer();
        const headers = {
          'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store',
          'Accept-Ranges': 'bytes', 'Content-Length': String(body.byteLength)
        };
        const range = event.request.headers.get('Range');
        if (range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(range);
          const start = match ? Number(match[1]) : -1;
          const end = match && match[2] ? Math.min(Number(match[2]), body.byteLength - 1) : body.byteLength - 1;
          if (start < 0 || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
            return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + body.byteLength } });
          }
          headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + body.byteLength;
          headers['Content-Length'] = String(end - start + 1);
          return new Response(body.slice(start, end + 1), { status: 206, headers });
        }
        return new Response(body, { headers });
      } catch { return new Response('Local playlist storage unavailable.', { status: 503 }); }
    })());
    return;
  }
  // Parent pages keep course/demo context in the query. The shell is static;
  // only allowlisted resources may share their query-free cache entry.
  const assetURL = new URL(url.href); assetURL.search = ''; assetURL.hash = '';
  if (!ASSET_URLS.has(assetURL.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 当前版本缓存优先，避免等待更新期间混用新 HTML 与旧 JS。
    const cached = await cache.match(assetURL.href);
    if (cached) return cached;
    try {
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (response.ok) {
        try {
          if (assetURL.href === ROOT || assetURL.href === HOME) {
            await Promise.all([cache.put(ROOT, response.clone()), cache.put(HOME, response.clone())]);
          } else await cache.put(assetURL.href, response.clone());
        } catch { /* 缓存空间不足仍返回网络响应。 */ }
      }
      return response;
    } catch { return Response.error(); }
  })());
});
