(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const Core = window.HlsImportCore;
  const notice = text => { $('playlist-status').textContent = text; };
  const scope = new URL('./', location.href).href;
  const cacheName = 'pwatest-imports-' + scope + '-v1';
  const prefix = new URL('__local_hls__/', scope).href;
  const prepared = new Map(), buttons = new Map();
  let generation = 0, activeURL = '', loadingId = null;
  function render() {
    for (const [id, { button, meta, item }] of buttons) {
      const selected = prepared.get(id)?.url === activeURL;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-busy', String(loadingId === id));
      meta.textContent = window.PlayerCore.time(item.duration) + ' · ' + (loadingId === id ? '正在准备…' : selected ? '已选择' : '点选播放');
    }
  }
  function cancelPending() {
    ++generation; loadingId = null; $('import-button').disabled = false; render();
  }
  function play(detail, selectItem) {
    const request = { ...detail, selectItem };
    window.dispatchEvent(new CustomEvent('pwatest:import-source', { detail: request }));
    if (!request.accepted) throw new Error('清单已保存，但播放记录未导入，请查看表单提示。');
    notice('已选择 ' + detail.title + '（' + window.PlayerCore.time(detail.playlistDuration) + '）。正在尝试播放；若未自动开始，请点播放器的播放按钮。视频分片仍需联网。');
  }
  async function load(item, selectItem) {
    const ticket = ++generation;
    loadingId = item.id; $('import-button').disabled = true; render();
    notice('正在准备 ' + item.title + '…');
    try {
      // Repeated selections use the same cached URL and preserve the click gesture.
      const ready = selectItem && prepared.get(item.id);
      if (ready) { play(ready, true); return; }
      const response = await fetch(item.url || new URL(item.path, scope).href, { cache: 'no-store' });
      if (ticket !== generation) return;
      if (!response.ok) throw new Error('清单暂时无法读取，请联网后重试；已导入的视频可从播放记录打开。');
      if (Number(response.headers.get('Content-Length')) > Core.MAX_BYTES) throw new Error('清单超过 1 MB。');
      const text = await response.text();
      const info = Core.inspect(text);
      if (info.kind !== 'media' || !info.complete || Math.abs(info.duration - item.duration) > 0.1 || info.segments !== item.segments) {
        throw new Error('清单与预期时长不符，请更新页面后重试。');
      }
      const parsed = Core.normalize(text);
      if (ticket !== generation) return;
      if (!navigator.serviceWorker?.controller) throw new Error('本机清单播放尚未就绪，请等待离线准备完成后刷新，再点选视频。');
      const probe = await fetch(prefix + 'capabilities', { cache: 'no-store' });
      if (probe.headers.get('X-Pwatest-HLS') !== '1') throw new Error('请先点击页面的新版本更新按钮，更新后重新点选视频。');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parsed.body));
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const url = prefix + hash + '/playlist.m3u8';
      const cache = await caches.open(cacheName);
      if (ticket !== generation) return;
      await cache.put(url, new Response(parsed.body, { headers: {
        'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store',
        'X-Playlist-Duration': String(parsed.duration)
      }}));
      if (ticket !== generation) return;
      const verification = await fetch(url, { cache: 'no-store' });
      if (!verification.ok || await verification.text() !== parsed.body) throw new Error('浏览器没有正确返回已保存清单，请更新页面后重试。');
      if (ticket !== generation) return;
      const detail = { url, title: item.title, playlistDuration: parsed.duration };
      if (selectItem) prepared.set(item.id, detail);
      play(detail, selectItem);
    } catch (error) {
      if (ticket === generation) notice(error.message || '清单保存失败，请检查本机存储空间。');
    } finally {
      if (ticket === generation) { loadingId = null; $('import-button').disabled = false; render(); }
    }
  }
  for (const item of window.VideoItems || []) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'video-item';
    const title = document.createElement('strong'); title.textContent = item.title;
    const meta = document.createElement('span');
    button.append(title, meta); button.addEventListener('click', () => load(item, true));
    buttons.set(item.id, { button, meta, item }); $('video-items').append(button);
  }
  render();
  $('use-default').addEventListener('click', () => { cancelPending(); notice(''); });
  $('cancel-edit').addEventListener('click', cancelPending);
  window.addEventListener('pwatest:edit-source', cancelPending);
  window.addEventListener('pwatest:source-selected', event => {
    activeURL = event.detail.url; cancelPending();
  });
  // Ordinary URLs still use app.js; the bundled default uses the verified cache route.
  $('import-form').addEventListener('submit', event => {
    if ($('video-url').value.trim() !== window.DefaultVideo?.url) { cancelPending(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    load({ ...window.DefaultVideo, id: 'default', title: $('video-title').value.trim() || window.DefaultVideo.title }, false);
  }, true);
  window.addEventListener('pwatest:delete-source', event => {
    const url = event.detail?.url;
    if (typeof url !== 'string' || !url.startsWith(prefix)) return;
    cancelPending();
    for (const [id, detail] of prepared) if (detail.url === url) prepared.delete(id);
    if (activeURL === url) activeURL = '';
    render();
    // Queue deletion before another click can write this same manifest again.
    caches.open(cacheName).then(cache => cache.delete(url)).catch(() => {});
  });
})();
