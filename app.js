/* 默认完整清单配置在 default-video.js；失效后可在记录中替换。 */
(() => {
  'use strict';
  const DEFAULT_URL = window.DefaultVideo.url;
  const Core = window.PlayerCore;
  const STORAGE_KEY = window.WatchPlayer?.storageKey || Core.STORAGE_KEY;
  const $ = id => document.getElementById(id);
  const video = $('video');
  let records = [], current = null, editId = null, pendingResume = null, mediaReady = false;
  let playGeneration = 0, lastSavedAt = 0, loadTimer;
  let localObjectURL = null;
  function sourceName(item) { return item.localFile ? '本地视频 · 临时测试' : item.url.includes('/__local_hls__/') ? '本机导入清单' : new URL(item.url).hostname; }
  function storageWarning() {
    $('storage-status').hidden = false;
    $('storage-status').textContent = '无法读取或保存本机记录。当前仍可播放，但关闭后可能无法恢复进度。请检查浏览器的存储设置。';
  }
  try { records = Core.decode(localStorage.getItem(STORAGE_KEY)); } catch { storageWarning(); }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { storageWarning(); }
  }
  function updateDiagnostics() {
    const codes = { 1: '播放被取消', 2: '媒体网络错误', 3: '媒体解码失败', 4: '媒体源无法加载或格式不支持' };
    const code = video.error?.code || 0;
    const detail = String(video.error?.message || '').replace(/https?:\/\/[^\s"<>]+/g, '[媒体地址]').slice(0, 300);
    $('playback-diagnostics').textContent = [
      '页面脚本版本：v3.6',
      '原生 HLS 支持：' + (video.canPlayType('application/vnd.apple.mpegurl') || '未声明支持'),
      '错误代码：' + (code ? code + '（' + (codes[code] || '未知错误') + '）' : '无'),
      '错误详情：' + (detail || '浏览器未提供'),
      '就绪状态：' + video.readyState + '；网络状态：' + video.networkState,
      '视频来源：' + (current ? sourceName(current) : '尚未选择'),
      '清单声明时长：' + (current?.playlistDuration ? Core.time(current.playlistDuration) + '（分片可播放性需验证）' : '未导入清单'),
      '页面提示：' + $('player-status').textContent
    ].join('\n');
  }
  function status(message) { $('player-status').textContent = message; updateDiagnostics(); }
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
      meta.textContent = sourceName(item) + ' · ' + progressText(item);
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
        window.dispatchEvent(new Event('pwatest:edit-source'));
        editId = item.id; $('video-title').value = item.title; $('video-url').value = item.url;
        $('import-button').textContent = '更新并播放'; $('cancel-edit').hidden = false;
        message('可替换同一视频的链接，保留当前播放进度。点选课程项将切换视频，不会替换此记录。');
        $('import-form').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('video-url').focus();
      });
      action('删除记录', () => {
        if (current?.id === item.id) {
          saveProgress(); current = null; mediaReady = false; pendingResume = null; ++playGeneration;
          clearTimeout(loadTimer); video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
          $('empty-player').hidden = false; $('current-title').textContent = '准备好，开始播放'; $('current-source').textContent = '';
          $('restart').disabled = true; status('记录已删除，可导入其他视频。');
          $('direct-video').hidden = true; $('direct-video').removeAttribute('href'); updateDiagnostics();
        }
        if (editId === item.id) resetForm();
        records = records.filter(record => record.id !== item.id); persist(); renderHistory();
        window.dispatchEvent(new CustomEvent('pwatest:delete-source', { detail: { url: item.url } }));
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
    if (promise) promise.catch(async error => {
      if (generation !== playGeneration || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        const started = window.WatchPlayer?.autoplayBlocked ? await window.WatchPlayer.autoplayBlocked() : false;
        if (generation !== playGeneration) return;
        if (!started) status('请点播放器里的播放按钮开始观看。');
      }
      else showMediaError();
    });
  }
  function select(item, autoplay, fromStart = false) {
    saveProgress(); video.pause();
    if (localObjectURL && localObjectURL !== item.url) {
      URL.revokeObjectURL(localObjectURL); localObjectURL = null;
    }
    if (item.localFile) localObjectURL = item.url;
    current = item; ++playGeneration; mediaReady = false;
    window.dispatchEvent(new CustomEvent('pwatest:source-selected', { detail: { url: item.url } }));
    if (fromStart) { item.position = 0; item.completed = false; }
    pendingResume = item.completed ? 0 : item.position;
    item.updatedAt = Date.now();
    if (!item.localFile) { records = [item, ...records.filter(record => record.id !== item.id)]; persist(); }
    $('current-title').textContent = item.title; $('current-source').textContent = sourceName(item);
    $('empty-player').hidden = true; video.hidden = false; $('restart').disabled = false;
    $('direct-video').href = item.url; $('direct-video').hidden = !!item.localFile;
    status(pendingResume > 0 ? '正在加载，将从 ' + Core.time(pendingResume) + ' 继续…' : '正在加载视频…');
    // 交给 Safari 原生 HLS 播放器，不设置 crossorigin，也不通过 fetch 读取清单。
    video.src = item.url; video.load();
    updateDiagnostics();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (!mediaReady) status(current?.localFile ? '本地视频读取较慢。如果文件在 iCloud 中，请先下载到本机后重新选择；也请确认视频编码受支持。' : '加载时间较长。链接可能已失效或需要网盘登录，请重试或替换链接。');
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
    if (pendingResume === null) status(current?.localFile ? '正在播放本地视频 · 仅本次测试，刷新后需重新选择' : '正在播放 · 进度自动保存');
  });
  video.addEventListener('waiting', () => { if (current && !video.error) status('正在缓冲，请稍候…'); });
  video.addEventListener('timeupdate', () => {
    restoreProgress();
    if (Date.now() - lastSavedAt >= 5000) saveProgress();
  });
  video.addEventListener('pause', () => { saveProgress(); renderHistory(); });
  video.addEventListener('ended', () => {
    const completedRecord = current && mediaReady && video.ended && video.currentSrc === current.url ? { id: current.id } : null;
    pendingResume = null; saveProgress(); renderHistory(); status('播放完毕，可点击「从头播放」再看一次。');
    if (completedRecord && !current.localFile) window.CoursePlayer?.completed(completedRecord);
  });
  function showMediaError() {
    if (!current) return;
    clearTimeout(loadTimer);
    if (current.localFile) status('本地视频未能播放：文件可能损坏、尚未下载到本机，或视频编码不受此浏览器支持。请尝试 H.264 / AAC 编码的 MP4 文件。');
    else if (!navigator.onLine) status('当前处于离线状态。此视频尚未下载，请联网后重新播放。');
    else if (current.url.includes('/__local_hls__/')) status('清单或视频分片未能加载：本机清单可能已被清除，或分片链接已过期、需要登录。请重新导入有效清单；保存清单不等于保存了视频。');
    else if (/M3U8|\.m3u8/i.test(current.url) && !video.canPlayType('application/vnd.apple.mpegurl')) status('当前浏览器不支持原生 HLS，请在 iPad Safari 中打开。');
    else if (window.WatchPlayer?.placeholder) status('占位视频未能加载：链接可能过期、需要网盘登录或不允许外站播放。请确认链接仍可用后重试。');
    else status('视频未能加载：链接可能过期、需要网盘登录或不允许外站播放。请在记录中替换链接后重试。');
  }
  video.addEventListener('error', showMediaError);
  video.addEventListener('loadstart', updateDiagnostics);
  video.addEventListener('stalled', updateDiagnostics);
  $('restart').addEventListener('click', () => { if (current) select(current, true, true); });
  function resetForm() {
    editId = null; $('cancel-edit').hidden = true; $('import-button').textContent = '导入视频'; message('');
  }
  $('cancel-edit').addEventListener('click', resetForm);
  $('upload-local-video').addEventListener('click', () => $('local-video-file').click());
  $('local-video-file').addEventListener('change', () => {
    const file = $('local-video-file').files?.[0];
    $('local-video-file').value = ''; // Allow choosing the same file again after a failure.
    if (!file) return; // Cancelling must leave the current playback untouched.
    if (!file.size || !(file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/i.test(file.name))) {
      $('local-video-status').textContent = '请选择非空的视频文件，例如 MP4；M3U8 清单请使用现有课程入口。';
      return;
    }
    let url;
    try { url = URL.createObjectURL(file); }
    catch { $('local-video-status').textContent = '无法读取这个文件，请先将视频下载到本机，再重新选择。'; return; }
    resetForm();
    select({ id: url, url, title: file.name, localFile: true, position: 0, duration: 0, completed: false }, true);
    $('local-video-status').textContent = '已选择「' + file.name + '」。仅在当前页面播放，不上传、不保存副本；若未自动播放，请点击播放器。';
    video.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('use-default').addEventListener('click', () => {
    resetForm(); $('video-url').value = DEFAULT_URL; $('video-title').value = window.DefaultVideo.title;
    message('已选默认完整清单（08:57），点击「导入视频」开始播放。');
  });
  function importSource(value, title, playlistDuration) {
    try {
      saveProgress();
      const result = Core.upsert(records, value, title, Date.now(), editId);
      if (playlistDuration) {
        result.record.playlistDuration = playlistDuration;
        if (playlistDuration > result.record.duration + 1) result.record.completed = false;
      }
      // 已保存旧播放器进度，解除旧引用，避免覆盖刚替换的记录。
      window.CoursePlayer?.imported(result.record, editId);
      current = null; records = result.records; resetForm(); select(result.record, true);
      message(playlistDuration ? '已导入清单。请点击播放并验证后半段画面和声音。' : '已导入。若未自动播放，请点击播放器中的播放按钮。');
      return true;
    } catch (error) { message(error.message); $('video-url').focus(); return false; }
  }
  $('import-form').addEventListener('submit', event => {
    event.preventDefault();
    importSource($('video-url').value, $('video-title').value);
  });
  window.addEventListener('pwatest:import-source', event => {
    // A course selection is never a replacement of the record being edited.
    if (event.detail.selectItem) resetForm();
    event.detail.accepted = importSource(event.detail.url, event.detail.title, event.detail.playlistDuration);
  });
  function networkStatus() { $('network-status').textContent = navigator.onLine ? '在线播放' : '当前离线'; }
  window.addEventListener('online', networkStatus);
  window.addEventListener('offline', () => { networkStatus(); if (current) status(current.localFile ? '当前离线 · 已选的本地视频可继续播放。' : '网络已断开，后续播放需要联网。'); });
  window.addEventListener('pagehide', saveProgress);
  window.addEventListener('pagehide', event => {
    // Keep the URL alive when Safari stores the page in its back/forward cache.
    if (!event.persisted && localObjectURL) { URL.revokeObjectURL(localObjectURL); localObjectURL = null; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
  $('video-url').value = DEFAULT_URL;
  $('video-title').value = window.DefaultVideo.title;
  networkStatus(); renderHistory();
  updateDiagnostics();
  if (records[0]) status('上次看到「' + records[0].title + '」' + Core.time(records[0].position) + '，点击记录中的播放按钮继续。');
  window.addEventListener('pwatest:before-update', saveProgress);
  if (window.WatchPlayer?.active) {
    window.WatchPlayer.start({ defaultURL: DEFAULT_URL, importSource, retry: () => { if (current) select(current, true); } });
    if (!window.WatchPlayer.placeholder) window.CoursePlayer?.launch(records, select);
  } else window.CoursePlayer?.launch(records, select);
})();
