// 首页和定制页共享同一个 SW；只有用户选择更新时才激活等待中的版本。
(() => {
  'use strict';
  const status = document.getElementById('pwa-status') || document.getElementById('offline-status');
  const banner = document.getElementById('pwa-update');
  const apply = document.getElementById('pwa-apply');
  let registration, reloadRequested = false;
  const message = text => { if (status) status.textContent = text; };
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    message('离线功能需要 HTTPS 或 localhost。链接视频仍需联网。'); return;
  }
  function showUpdate() { if (banner) banner.hidden = false; }
  if (apply) apply.addEventListener('click', () => {
    if (!registration?.waiting) return;
    const event = new Event('pwatest:before-update', { cancelable: true });
    if (!window.dispatchEvent(event)) return;
    reloadRequested = true; apply.disabled = true;
    registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    registration = reg;
    if (reg.waiting) showUpdate();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        if (worker.state === 'redundant') message('离线资源更新失败，请联网后重新加载。');
      });
    });
    return navigator.serviceWorker.ready;
  }).then(() => {
    message('离线首页已准备好 · 链接视频仍需联网');
  }).catch(() => message('离线准备未完成，请联网后重新加载。'));
})();
