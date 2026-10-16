(() => {
  'use strict';
  const editable = target => target?.closest?.('input, textarea, [contenteditable="true"]');
  for (const name of ['contextmenu', 'selectstart', 'copy', 'cut']) {
    document.addEventListener(name, event => { if (!editable(event.target)) event.preventDefault(); });
  }
  document.addEventListener('dragstart', event => { if (!editable(event.target)) event.preventDefault(); });
  // 不拦截 touchstart/touchmove，保留原生横滑、纵向滚动、视频控件和双指缩放。
})();
