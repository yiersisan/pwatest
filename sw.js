// 一个 scope、一套版本化资源；完整安装后等待用户选择更新。
const CACHE_PREFIX = `pwatest-${self.registration.scope}-`;
const CACHE = `${CACHE_PREFIX}v8`;
const ASSETS = ['./', './index.html', './report.html', './home.css', './home.js', './learning-core.js',
  './learning-data.json', './pwa.js', './app.js', './player-core.js', './styles.css', './manifest.json',
  './favicon.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
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
  if (!ASSET_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 当前版本缓存优先，避免等待更新期间混用新 HTML 与旧 JS。
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (response.ok) {
        try {
          if (url.href === ROOT || url.href === HOME) {
            await Promise.all([cache.put(ROOT, response.clone()), cache.put(HOME, response.clone())]);
          } else await cache.put(event.request, response.clone());
        } catch { /* 缓存空间不足仍返回网络响应。 */ }
      }
      return response;
    } catch { return Response.error(); }
  })());
});
