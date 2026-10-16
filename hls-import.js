(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const Core = window.HlsImportCore;
  const input = $('playlist-files'), choice = $('playlist-choice');
  let candidates = [], reading = false, importing = false, generation = 0;
  const notice = text => { $('playlist-status').textContent = text; };
  const scope = new URL('./', location.href).href;
  const cacheName = 'pwatest-imports-' + scope + '-v1';
  const prefix = new URL('__local_hls__/', scope).href;
  function selected() { return choice.value === '' ? null : candidates[Number(choice.value)]; }
  function describe() {
    const item = selected();
    if (!item) return;
    notice('这份清单列出 ' + window.PlayerCore.time(item.info.duration) + '、' + item.info.segments + ' 个分片。' +
      (item.info.duration <= 100.5 ? '如果原视频有八九分钟，这份清单不完整，导入也只能播放这些内容。' : '清单时长不代表分片已经验证可播放。') +
      ' 多份清单不会拼接；视频仍需联网。');
  }
  input.addEventListener('change', async () => {
    const ticket = ++generation;
    candidates = []; choice.replaceChildren(); $('playlist-options').hidden = true;
    $('video-url').required = !input.files.length;
    if (!input.files.length) { notice(''); reading = false; return; }
    reading = true; notice('正在读取清单…');
    try {
      const files = Array.from(input.files);
      if (files.length > 20 || files.reduce((n, f) => n + f.size, 0) > 4 * Core.MAX_BYTES) throw new Error('每次最多选择 20 份清单，总计不超过 4 MB。');
      const results = await Promise.all(files.map(async file => {
        try {
          if (file.size > Core.MAX_BYTES) throw new Error('超过 1 MB');
          const text = await file.text(), info = Core.inspect(text);
          return { name: file.name, text, info };
        } catch (error) { return { name: file.name, error: error.message }; }
      }));
      if (ticket !== generation) return;
      candidates = results;
      const blank = document.createElement('option'); blank.value = ''; blank.textContent = '请选择要导入的一份媒体清单'; choice.append(blank);
      results.forEach((item, index) => {
        const option = document.createElement('option'); option.value = String(index);
        option.disabled = !!item.error || item.info.kind !== 'media' || !item.info.complete;
        option.textContent = item.name + ' — ' + (item.error || (item.info.kind === 'master' ? '清晰度目录，请另选媒体清单' :
          window.PlayerCore.time(item.info.duration) + ' · ' + item.info.segments + ' 个分片' + (item.info.complete ? '' : ' · 未结束，不能导入')));
        choice.append(option);
      });
      choice.value = ''; $('playlist-options').hidden = false;
      notice('请选择一份与目标视频时长相符的媒体清单。这里只读取本机文件，不会上传。');
    } catch (error) { if (ticket === generation) notice(error.message); }
    finally { if (ticket === generation) reading = false; }
  });
  choice.addEventListener('change', describe);
  function clear() {
    ++generation; reading = false; candidates = []; input.value = ''; choice.replaceChildren();
    $('playlist-options').hidden = true; $('video-url').required = true; notice('');
  }
  $('clear-playlists').addEventListener('click', clear);
  $('use-default').addEventListener('click', clear);
  $('cancel-edit').addEventListener('click', clear);
  window.addEventListener('pwatest:edit-source', clear);
  // Capture the submit before app.js's normal link importer. Leave ordinary links unchanged.
  $('import-form').addEventListener('submit', async event => {
    const useDefault = !input.files.length && $('video-url').value.trim() === window.DefaultVideo?.url;
    if (!input.files.length && !useDefault) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (reading || importing) { notice('请等待清单处理完成。'); return; }
    let item = choice.value === '' ? null : selected();
    if (!useDefault && (!item || item.error || item.info.kind !== 'media' || !item.info.complete)) { notice('请先选择一份有效、已结束的媒体清单。'); return; }
    importing = true; $('import-button').disabled = true;
    const ticket = generation;
    try {
      if (useDefault) {
        notice('正在准备默认完整清单…');
        const response = await fetch(window.DefaultVideo.url, { cache: 'no-store' });
        if (!response.ok) throw new Error('默认清单暂时无法读取，请稍后重试或选择本机清单。');
        if (Number(response.headers.get('Content-Length')) > Core.MAX_BYTES) throw new Error('默认清单超过 1 MB。');
        const text = await response.text();
        const info = Core.inspect(text);
        if (info.kind !== 'media' || !info.complete || Math.abs(info.duration - window.DefaultVideo.duration) > 0.1 || info.segments !== window.DefaultVideo.segments) {
          throw new Error('默认清单与预期时长不符，请更新页面或重新选择清单。');
        }
        item = { name: window.DefaultVideo.title, text, info };
      }
      if (ticket !== generation) return;
      // The bundled manifest already contains absolute HTTPS media URLs.
      // Do not use the HTTP localhost preview URL as a media base.
      const parsed = Core.normalize(item.text, useDefault ? '' : $('playlist-base').value.trim());
      if (!navigator.serviceWorker?.controller) throw new Error('本机清单播放尚未就绪，请等待离线准备完成后刷新，再重新选择清单。');
      // Verify the active worker understands the route before writing any user data.
      const probe = await fetch(prefix + 'capabilities', { cache: 'no-store' });
      if (probe.headers.get('X-Pwatest-HLS') !== '1') throw new Error('请先点击页面的新版本更新按钮，更新后重新选择清单。');
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
      const detail = {
        url, title: $('video-title').value.trim() || item.name.replace(/\.m3u8?$/i, ''),
        playlistDuration: parsed.duration
      };
      window.dispatchEvent(new CustomEvent('pwatest:import-source', { detail }));
      if (!detail.accepted) throw new Error('清单已保存，但播放记录未导入，请查看表单提示。');
      notice('已保存所选清单（' + window.PlayerCore.time(parsed.duration) + '）。' +
        (parsed.duration <= 100.5 ? '这份清单只有这些内容，不能补全八九分钟的视频。' : '请点击播放并拖到后半段验证画面和声音。') + ' 视频分片仍需联网。');
    } catch (error) { notice(error.message || '清单保存失败，请检查本机存储空间。'); }
    finally { importing = false; $('import-button').disabled = false; }
  }, true);
  window.addEventListener('pwatest:delete-source', event => {
    const url = event.detail?.url;
    if (typeof url === 'string' && url.startsWith(prefix)) caches.open(cacheName).then(cache => cache.delete(url)).catch(() => {});
  });
})();
