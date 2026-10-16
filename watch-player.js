(() => {
  'use strict';
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('watch') !== '1') return;
  const placeholder = params.get('placeholder') === '1';
  const course = window.ContentConfig?.courses.find(item => item.id === params.get('course'));
  document.documentElement.classList.add('watch-mode');
  document.title = (course?.name || params.get('title')?.slice(0, 100) || '学习视频') + ' · 全屏播放';
  const video = document.getElementById('video');
  const lock = document.getElementById('watch-lock');
  const shield = document.getElementById('watch-shield');
  let locked = false;
  video.autoplay = true;
  video.playsInline = true;
  // Keep the lock inside the page: native iOS fullscreen cannot host this overlay.
  video.setAttribute('controlslist', 'nofullscreen noremoteplayback');
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  lock.hidden = false;
  function setLocked(value) {
    locked = value;
    video.controls = !locked;
    shield.hidden = !locked;
    lock.setAttribute('aria-pressed', String(locked));
    lock.setAttribute('aria-label', locked ? '解锁播放操作' : '锁定播放操作');
    document.documentElement.classList.toggle('watch-locked', locked);
    // Remove focus from the native player so keyboard controls cannot bypass the shield.
    if (locked) lock.focus({ preventScroll: true });
  }
  lock.addEventListener('click', () => setLocked(!locked));
  for (const type of ['click', 'dblclick', 'pointerdown', 'contextmenu']) {
    shield.addEventListener(type, event => { event.preventDefault(); event.stopPropagation(); });
  }
  document.addEventListener('keydown', event => {
    if (!locked || event.target === lock) return;
    if ([' ', 'Spacebar', 'Enter', 'k', 'K', 'j', 'J', 'l', 'L', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'MediaPlayPause', 'MediaPause', 'MediaTrackNext', 'MediaTrackPrevious'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  setLocked(false);
  window.WatchPlayer = {
    active: true, placeholder,
    storageKey: placeholder ? 'pwatest-preview-history-v1' : window.PlayerCore.STORAGE_KEY,
    // Safari may reject audible autoplay after navigating to another document.
    async autoplayBlocked() {
      video.muted = true;
      try { await video.play(); return true; }
      catch { return false; } // Unlocked native controls remain available for a user gesture.
    },
    start({ defaultURL, importSource }) {
      if (placeholder) importSource(defaultURL, '学习占位视频');
    }
  };
})();
