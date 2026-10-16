(() => {
  'use strict';
  const Core = window.LearningCore;
  const $ = id => document.getElementById(id);
  const root = document.querySelector('.learning-home');
  const rails = [$('today-rail'), $('week-rail')];
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"></use></svg>`;
  const art = name => `<span class="artwork" data-art="${name}" aria-hidden="true"></span>`;
  let data, completed = new Set(), loadGeneration = 0;
  function mountArt() {
    root.querySelectorAll('[data-art]').forEach(holder => {
      if (holder.childElementCount) return;
      const index = Core.ART.indexOf(holder.dataset.art);
      if (index < 0) { holder.classList.add('asset-fallback'); return; }
      const tile = document.createElement('span'); tile.className = 'art-tile';
      tile.style.setProperty('--col', index % 4); tile.style.setProperty('--row', Math.floor(index / 4));
      const image = new Image(); image.alt = ''; image.width = 1774; image.height = 887; image.decoding = 'async';
      image.addEventListener('error', () => holder.classList.add('asset-fallback'), { once: true });
      image.src = './assets/images/illustration-atlas.png';
      tile.append(image); holder.append(tile);
    });
  }
  function updateRail(rail) { rail.parentElement.classList.toggle('has-more', rail.scrollWidth - rail.clientWidth - rail.scrollLeft > 4); }
  function updateProgress() {
    const count = Core.progress(data.requiredIds, completed);
    $('today-progress').innerHTML = count.total ? `已完成 <strong>${count.done}</strong> / ${count.total}` : '今天还没有学习任务';
    root.querySelectorAll('[data-lesson]').forEach(button => {
      const lesson = data.lessons.find(item => item.id === button.dataset.lesson);
      if (!lesson) return;
      const done = completed.has(lesson.id);
      button.setAttribute('aria-label', `${lesson.title}，${done ? '已完成' : '待学习'}，演示课程`);
      const status = button.querySelector('.status');
      if (status) { status.classList.toggle('done', done); status.innerHTML = icon(done ? 'check' : 'play') + (done ? '已完成' : '待学习'); }
    });
  }
  function render() {
    $('today-rail').innerHTML = data.lessons.length ? `
      <button type="button" class="task-card feedback" data-action="feedback" aria-label="英语点评，10 条示例，未接入真实点评">
        <span class="feedback-title"><span class="teacher artwork" data-art="avatar-teacher" aria-hidden="true"></span>英语 · 点评</span>
        <span class="cover"><span class="feedback-word">点评时间</span><span class="play-overlay">${icon('play')}</span></span>
        <span class="card-footer">查看更多点评（10）${icon('chevron-right')}</span>
      </button>
      <button type="button" class="task-card" data-action="weekend" aria-label="FUN WEEKEND，周六至周日开放，演示活动"><span class="cover">${art('cover-weekend')}<span class="cover-label weekend-label">FUN<br>WEEKEND</span></span><span class="card-footer">${icon('clock')}周六至周日开放</span></button>
      ${data.lessons.some(l => l.id === 'bear') ? `<button type="button" class="task-card" data-lesson="bear"><span class="cover">${art('cover-bear')}<span class="cover-label bear-label">英语小课堂</span></span><span class="card-footer"><span class="start-pill">${icon('play')}开始学习</span></span></button>` : ''}
      ${data.lessons.some(l => l.id === 'cake') ? `<button type="button" class="task-card" data-lesson="cake"><span class="cover">${art('cover-cake')}<span class="cover-label">一起读故事</span></span><span class="card-footer">${icon('book')}故事时间</span></button>` : ''}` : '<p class="empty-tasks">今天还没有学习任务</p>';
    $('week-rail').innerHTML = data.lessons.length ? data.lessons.map(l => `<button type="button" class="task-card" data-lesson="${esc(l.id)}"><span class="cover">${art(l.image)}</span><span class="details"><span class="lesson-title">${esc(l.title)}</span><span class="lesson-meta">第${l.lesson}课 · ${esc(l.level)} · ${l.minutes}分钟</span><span class="status-line"><span class="status"></span></span></span></button>`).join('') : '<p class="empty-tasks">本周还没有课程，稍后再来看看吧。</p>';
    updateProgress(); mountArt(); rails.forEach(updateRail);
  }
  async function loadHome() {
    const generation = ++loadGeneration;
    $('learning-error').hidden = true;
    rails.forEach(rail => rail.setAttribute('aria-busy', 'true'));
    try {
      const response = await fetch('./learning-data.json');
      if (!response.ok) throw Error('Cannot load lessons');
      const next = Core.validate(await response.json());
      if (generation !== loadGeneration) return;
      data = next;
      try { completed = Core.completedFrom(localStorage.getItem(Core.STORAGE_KEY), data); }
      catch { completed = Core.completedFrom(null, data); $('demo-storage').hidden = false; }
      render(); restoreHomePosition();
    } catch {
      if (generation !== loadGeneration) return;
      $('learning-error').hidden = false;
      $('today-progress').textContent = '任务暂时无法加载';
      rails.forEach(rail => { rail.replaceChildren(); updateRail(rail); });
    } finally { if (generation === loadGeneration) rails.forEach(rail => rail.setAttribute('aria-busy', 'false')); }
  }
  const dialog = $('home-dialog');
  let previousFocus, savedScroll = 0, bodyStyle = '';
  function show(title, body, actions = [], label = '演示') {
    $('dialog-title').textContent = title; $('dialog-body').textContent = body; $('dialog-label').textContent = label;
    $('dialog-actions').replaceChildren();
    for (const action of actions) {
      const button = document.createElement(action.href ? 'a' : 'button');
      button.textContent = action.label;
      if (action.href) button.href = action.href;
      else { button.type = 'button'; button.addEventListener('click', action.run); }
      if (action.primary) button.className = 'primary';
      $('dialog-actions').append(button);
    }
    if (!dialog.open) {
      previousFocus = document.activeElement; savedScroll = window.scrollY; bodyStyle = document.body.style.cssText;
      document.body.style.position = 'fixed'; document.body.style.top = `-${savedScroll}px`; document.body.style.width = '100%';
      dialog.showModal();
    }
    $('close-dialog').focus();
  }
  function close() { dialog.close(); }
  dialog.addEventListener('close', () => {
    document.body.style.cssText = bodyStyle; window.scrollTo(0, savedScroll);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  });
  $('close-dialog').addEventListener('click', close);
  function openVideo(title) {
    saveHomePosition();
    location.assign('./report.html#watch=1&placeholder=1&from=home&title=' + encodeURIComponent(title));
  }
  function openLesson(id) {
    const lesson = data?.lessons.find(item => item.id === id);
    if (lesson) openVideo(lesson.title);
  }
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-action],[data-lesson]');
    if (!target) return;
    if (target.dataset.lesson) { openLesson(target.dataset.lesson); return; }
    switch (target.dataset.action) {
      case 'profile': show(window.LearningProfile?.name || '学习资料', '这是示例昵称和头像，尚未接入账号及个人资料服务。'); break;
      case 'feedback': openVideo('英语 · 点评'); break;
      case 'weekend': openVideo('FUN WEEKEND'); break;
      case 'install': show('添加到主屏幕', '在 iPad Safari 中打开本站，点击分享按钮，再选择「添加到主屏幕」。建议横屏使用。首次联网并显示离线首页已准备好后，可离线打开首页；视频仍需联网。', [], '使用说明'); break;
    }
  });
  rails.forEach(rail => {
    rail.addEventListener('scroll', () => updateRail(rail), { passive: true });
    rail.addEventListener('keydown', event => {
      if (event.target !== rail || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const left = event.key === 'Home' ? 0 : event.key === 'End' ? rail.scrollWidth : rail.scrollLeft + (event.key === 'ArrowRight' ? 1 : -1) * rail.clientWidth * .75;
      rail.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    let origin = null, dragged = false;
    rail.addEventListener('pointerdown', event => { origin = [event.clientX, event.clientY]; dragged = false; }, { passive: true });
    rail.addEventListener('pointermove', event => { if (origin && Math.hypot(event.clientX-origin[0], event.clientY-origin[1]) > 10) dragged = true; }, { passive: true });
    rail.addEventListener('pointercancel', () => { dragged = true; origin = null; }, { passive: true });
    rail.addEventListener('pointerup', () => { origin = null; }, { passive: true });
    rail.addEventListener('click', event => { if (dragged && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }, true);
  });
  window.addEventListener('resize', () => rails.forEach(updateRail));
  if ('ResizeObserver' in window) { const observer = new ResizeObserver(() => rails.forEach(updateRail)); rails.forEach(rail => observer.observe(rail)); }
  $('retry-home').addEventListener('click', loadHome);
  const profile = window.LearningProfile;
  if (profile) {
    root.querySelector('.profile-name').textContent = profile.name;
    root.querySelector('.avatar').dataset.art = profile.art;
    root.querySelector('.profile').setAttribute('aria-label', '查看' + profile.name + '资料' + (profile.source === 'demo' ? '（演示）' : ''));
  }
  function saveHomePosition() {
    try { sessionStorage.setItem('pwatest-home-position', JSON.stringify({ y: window.scrollY, rails: rails.map(r => r.scrollLeft) })); } catch { /* 系统 history 仍可恢复 */ }
  }
  function restoreHomePosition() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('pwatest-home-position'));
      if (!saved || !Array.isArray(saved.rails)) return;
      requestAnimationFrame(() => {
        rails.forEach((r,i) => { r.scrollLeft = Number(saved.rails[i]) || 0; updateRail(r); });
        window.scrollTo(0, Number(saved.y) || 0);
      });
    } catch { /* 首次进入或存储不可用 */ }
  }
  $('open-content-center').addEventListener('click', saveHomePosition);
  window.addEventListener('pagehide', saveHomePosition);
  window.addEventListener('pageshow', event => { if (event.persisted) restoreHomePosition(); });
  mountArt(); loadHome();
})();
