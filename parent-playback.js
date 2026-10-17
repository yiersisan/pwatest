(async () => {
  'use strict';
  const id = new URLSearchParams(location.hash.slice(1)).get('parentVideo');
  if (!id) return;
  const status = document.getElementById('player-status');
  try {
    const snapshot = await ParentService.published();
    const item = snapshot?.videos.find(v => v.id === id && v.status === 'ready');
    if (!item?.playbackUrl) throw Error('视频已不可用，请返回首页重新选择');
    // Reuse the existing import, playback, resume and course reward event bridge.
    window.dispatchEvent(new CustomEvent('pwatest:import-source', { detail: { url: item.playbackUrl, title: item.title, selectItem: true } }));
  } catch (error) { status.textContent = error.message || '视频暂时无法读取，请返回首页重试'; }
})();
