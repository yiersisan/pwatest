(() => {
  'use strict';
  const editable = target => target?.closest?.('input, textarea, [contenteditable="true"]');
  for (const name of ['contextmenu', 'selectstart', 'copy', 'cut']) {
    document.addEventListener(name, event => { if (!editable(event.target)) event.preventDefault(); });
  }
  document.addEventListener('dragstart', event => { if (!editable(event.target)) event.preventDefault(); });
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, event => event.preventDefault(), { passive: false });
  }
  document.addEventListener('wheel', event => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '0'].includes(event.key)) event.preventDefault();
  });
  document.addEventListener('dblclick', event => { if (!editable(event.target)) event.preventDefault(); });
  // 不拦截 touchmove / touchstart，单指滚动、表单输入与原生视频操作保持可用。
})();
