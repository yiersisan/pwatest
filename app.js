/* 默认链接由用户提供；它可能过期，失效后可在播放记录中替换。 */
(() => {
  'use strict';
  const DEFAULT_URL = 'https://pan.baidu.com/share/streaming?channel=chunlei&uk=967102443&fid=20690952231959&sign=faf8eabe0d30b514cacd9c564a23c647c94fcab4&timestamp=1792169567&shareid=12102931033&type=M3U8_AUTO_480&vip=0&jsToken=B5A6A531E1DE9D3173619DEF8A201D4B95979ACB8AEE6188A09D15978D938C486FFABA87B97E8A0E22672372424E29A9&isplayer=1&check_blue=1&adToken=&src_id=1';
  const Core = window.PlayerCore;
  const $ = id => document.getElementById(id);
  const video = $('video');
  let records = [], current = null, editId = null, pendingResume = null, mediaReady = false;
  let playGeneration = 0, lastSavedAt = 0, loadTimer;
  function storageWarning() {
    $('storage-status').hidden = false;
    $('storage-status').textContent = '无法读取或保存本机记录。当前仍可播放，但关闭后可能无法恢复进度。请检查浏览器的存储设置。';
  }
  try { records = Core.decode(localStorage.getItem(Core.STORAGE_KEY)); } catch { storageWarning(); }
  function persist() {
    try { localStorage.setItem(Core.STORAGE_KEY, JSON.stringify(records)); } catch { storageWarning(); }
  }
  function status(message) { $('player-status').textContent = message; }
  function message(text) { $('form-status').textContent = text; $('form-status').hidden = !text; }
  function progressText(item) {
    if (item.completed) return '已看完 · ' + Core.time(item.duration || item.position);
    return item.position > 0 ? '看到 ' + Core.time(item.position) + (item.duration ? ' / ' + Core.time(item.duration) : '') : '尚未播放';
  }
  function renderHistory() {
    $('history-list').replaceChildren();
    $('history-count').textContent = records.length + ' 个视频';
    $('empty-history').hidden = records.length > 0;
    for (const item of records) {
      const li = document.createElement('li');
      li.className = 'history-item' + (current?.id === item.id ? ' active' : '');
      const title = document.createElement('h3'); title.textContent = item.title;
      const meta = document.createElement('p'); meta.className = 'history-meta';
      meta.textContent = new URL(item.url).hostname + ' · ' + progressText(item);
      const bar = document.createElement('progress'); bar.max = item.duration || 1; bar.value = item.duration ? item.position : 0;
      bar.setAttribute('aria-label', item.title + '：' + progressText(item));
      const actions = document.createElement('div'); actions.className = 'history-actions';
      function action(label, handler, className) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        if (className) button.className = className;
        button.addEventListener('click', handler); actions.append(button);
      }
      action(item.completed ? '重新播放' : item.position > 0 ? '继续播放' : '播放', () => select(item, true));
      action('替换链接', () => {
        editId = item.id; $('video-title').value = item.title; $('video-url').value = item.url;
        $('import-button').textContent = '更新并播放'; $('cancel-edit').hidden = false;
        message('替换同一视频的链接后，会保留当前播放进度。');
        $('import-form').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('video-url').focus();
      });
      action('删除记录', () => {
        if (current?.id === item.id) {
          saveProgress(); current = null; mediaReady = false; pendingResume = null; ++playGeneration;
          clearTimeout(loadTimer); video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
          $('empty-player').hidden = false; $('current-title').textContent = '准备好，开始播放'; $('current-source').textContent = '';
          $('restart').disabled = true; status('记录已删除，可导入其他视频。');
        }
        if (editId === item.id) resetForm();
        records = records.filter(record => record.id !== item.id); persist(); renderHistory();
      }, 'delete');
      li.append(title, meta, bar, actions); $('history-list').append(li);
    }
  }
  function saveProgress() {
    if (!current || !mediaReady || pendingResume !== null || video.readyState < 1 || video.currentSrc !== current.url) return;
    if (Number.isFinite(video.currentTime)) current.position = Math.max(0, video.currentTime);
    if (Number.isFinite(video.duration) && video.duration > 0) current.duration = video.duration;
    current.completed = video.ended;
    current.updatedAt = Date.now();
    persist(); lastSavedAt = Date.now();
  }
  function play() {
    const generation = playGeneration;
    const promise = video.play();
    if (promise) promise.catch(error => {
      if (generation !== playGeneration || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') status('请点播放器里的播放按钮开始观看。');
      else showMediaError();
    });
  }
  function select(item, autoplay, fromStart = false) {
    saveProgress(); video.pause();
    current = item; ++playGeneration; mediaReady = false;
    if (fromStart) { item.position = 0; item.completed = false; }
    pendingResume = item.completed ? 0 : item.position;
    item.updatedAt = Date.now(); records = [item, ...records.filter(record => record.id !== item.id)]; persist();
    $('current-title').textContent = item.title; $('current-source').textContent = new URL(item.url).hostname;
    $('empty-player').hidden = true; video.hidden = false; $('restart').disabled = false;
    status(pendingResume > 0 ? '正在加载，将从 ' + Core.time(pendingResume) + ' 继续…' : '正在加载视频…');
    // 交给 Safari 原生 HLS 播放器，不设置 crossorigin，也不通过 fetch 读取清单。
    video.src = item.url; video.load();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (!mediaReady) status('加载时间较长。链接可能已失效或需要网盘登录，请重试或替换链接。');
    }, 15000);
    if (autoplay) play(); // 直接在点击事件中调用，保留 iPad 用户手势。
    renderHistory();
  }
  function restoreProgress() {
    if (!current || !mediaReady || pendingResume === null) return;
    const target = Core.resumePosition({ position: pendingResume, completed: false }, video.duration);
    if (target === 0) { pendingResume = null; return; }
    if (Math.abs(video.currentTime - target) < 0.75) {
      pendingResume = null; status('已恢复到 ' + Core.time(video.currentTime) + '。'); return;
    }
    if (!video.seeking) {
      try { video.currentTime = target; } catch { /* 等待 canplay 或 seekable 信息就绪后重试。 */ }
    }
  }
  video.addEventListener('loadedmetadata', () => {
    if (!current || video.currentSrc !== current.url) return;
    mediaReady = true; clearTimeout(loadTimer);
    if (Number.isFinite(video.duration)) current.duration = video.duration;
    const resuming = pendingResume > 0;
    restoreProgress(); persist(); renderHistory();
    if (!resuming) status('视频已就绪，点击播放即可观看。');
  });
  video.addEventListener('canplay', restoreProgress);
  video.addEventListener('durationchange', restoreProgress);
  video.addEventListener('seeked', () => { restoreProgress(); saveProgress(); renderHistory(); });
  video.addEventListener('playing', () => {
    clearTimeout(loadTimer); restoreProgress();
    if (pendingResume === null) status('正在播放 · 进度自动保存');
  });
  video.addEventListener('waiting', () => { if (current) status('正在缓冲，请稍候…'); });
  video.addEventListener('timeupdate', () => {
    restoreProgress();
    if (Date.now() - lastSavedAt >= 5000) saveProgress();
  });
  video.addEventListener('pause', () => { saveProgress(); renderHistory(); });
  video.addEventListener('ended', () => { pendingResume = null; saveProgress(); renderHistory(); status('播放完毕，可点击「从头播放」再看一次。'); });
  function showMediaError() {
    if (!current) return;
    clearTimeout(loadTimer);
    if (!navigator.onLine) status('当前处于离线状态。此视频尚未下载，请联网后重新播放。');
    else if (/M3U8|\.m3u8/i.test(current.url) && !video.canPlayType('application/vnd.apple.mpegurl')) status('当前浏览器不支持原生 HLS，请在 iPad Safari 中打开。');
    else status('视频未能加载：链接可能过期、需要网盘登录或不允许外站播放。请在记录中替换链接后重试。');
  }
  video.addEventListener('error', showMediaError);
  $('restart').addEventListener('click', () => { if (current) select(current, true, true); });
  function resetForm() {
    editId = null; $('cancel-edit').hidden = true; $('import-button').textContent = '导入视频'; message('');
  }
  $('cancel-edit').addEventListener('click', resetForm);
  $('use-default').addEventListener('click', () => {
    resetForm(); $('video-url').value = DEFAULT_URL; $('video-title').value = '百度网盘视频';
    message('默认链接已填入，点击「导入视频」开始播放。');
  });
  $('import-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      saveProgress();
      const result = Core.upsert(records, $('video-url').value, $('video-title').value, Date.now(), editId);
      // 已保存旧播放器进度，解除旧引用，避免覆盖刚替换的记录。
      current = null; records = result.records; resetForm(); select(result.record, true);
      message('已导入。若未自动播放，请点击播放器中的播放按钮。');
    } catch (error) { message(error.message); $('video-url').focus(); }
  });
  function networkStatus() { $('network-status').textContent = navigator.onLine ? '在线播放' : '当前离线'; }
  window.addEventListener('online', networkStatus);
  window.addEventListener('offline', () => { networkStatus(); if (current) status('网络已断开，后续播放需要联网。'); });
  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
  $('video-url').value = DEFAULT_URL;
  $('video-title').value = '百度网盘视频';
  networkStatus(); renderHistory();
  if (records[0]) status('上次看到「' + records[0].title + '」' + Core.time(records[0].position) + '，点击记录中的播放按钮继续。');
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then(() => { $('offline-status').textContent = '页面已可离线打开；视频仍需联网。播放记录仅保存在本机。'; })
      .catch(() => { $('offline-status').textContent = '页面离线准备未完成，请联网后刷新重试。'; });
  }
})();
