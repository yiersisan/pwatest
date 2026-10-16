// 每次发布修改此版本；缓存名包含部署路径，避免影响同域下的其他 PWA。
const CACHE_PREFIX = `pwatest-${self.registration.scope}-`;
const CACHE = `${CACHE_PREFIX}v5`;
const ASSETS = ['./', './index.html', './app.js', './player-core.js', './styles.css', './manifest.json', './favicon.png',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const HOME = new URL('./index.html', self.registration.scope).href;
const ROOT = new URL('./', self.registration.scope).href;
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !ASSET_URLS.has(url.href)) return;

  // 联网时获取新版本；断网时使用缓存。统一根地址和 index.html 的内容。
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (!response.ok) {
        const fallback = await cache.match(event.request);
        return fallback || response;
      }
      try {
        if (url.href === ROOT || url.href === HOME) {
          await Promise.all([cache.put(ROOT, response.clone()), cache.put(HOME, response.clone())]);
        } else {
          await cache.put(event.request, response.clone());
        }
      } catch (error) {
        // 存储空间不足时仍返回已获取的网络内容。
        console.warn('无法更新离线缓存', error);
      }
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      return Response.error();
    }
  })());
});
