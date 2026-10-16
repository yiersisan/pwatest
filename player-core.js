(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'pwatest-video-history-v1';
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  function parseURL(value) {
    let url;
    try { url = new URL(String(value).trim()); } catch { throw new Error('请输入完整的 HTTPS 视频链接。'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('请使用不含账号密码的 HTTPS 视频链接。');
    return url;
  }
  function identity(value) {
    const url = parseURL(value);
    if (url.hostname === 'pan.baidu.com' && url.pathname === '/share/streaming' && url.searchParams.get('fid') && url.searchParams.get('uk')) {
      return JSON.stringify(['baidu', url.searchParams.get('uk'), url.searchParams.get('fid'), url.searchParams.get('shareid') || '']);
    }
    return url.href;
  }
  function decode(raw) {
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('播放记录格式不正确');
    const seen = new Set();
    return data.flatMap(item => {
      try {
        const url = parseURL(item.url).href;
        const id = identity(url);
        if (seen.has(id)) return [];
        seen.add(id);
        return [{ id, url, title: typeof item.title === 'string' && item.title.trim() ? item.title.slice(0, 100) : '未命名视频',
          position: finite(item.position), duration: finite(item.duration), completed: item.completed === true, updatedAt: finite(item.updatedAt) }];
      } catch { return []; }
    }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
  }
  function upsert(records, value, title, now = Date.now(), replaceId = null) {
    const url = parseURL(value).href;
    const id = identity(url);
    const old = records.find(item => item.id === (replaceId || id));
    const record = { id, url, title: String(title || '').trim().slice(0, 100) || old?.title || (new URL(url).hostname === 'pan.baidu.com' ? '百度网盘视频' : '我的视频'),
      position: old?.position || 0, duration: old?.duration || 0, completed: old?.completed || false, updatedAt: now };
    return { record, records: [record, ...records.filter(item => item.id !== id && item.id !== replaceId)].slice(0, 50) };
  }
  function resumePosition(record, duration) {
    if (record.completed) return 0;
    const position = finite(record.position);
    return Number.isFinite(duration) && duration > 0 ? Math.min(position, Math.max(0, duration - 0.5)) : position;
  }
  function time(value) {
    const n = Math.floor(finite(value));
    const hours = Math.floor(n / 3600);
    return (hours ? hours + ':' : '') + String(Math.floor(n / 60) % 60).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }
  return { STORAGE_KEY, parseURL, identity, decode, upsert, resumePosition, time };
});
