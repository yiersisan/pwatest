(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 14 8-14 8Z"/></svg>';
  const checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  let state, config, records = [], demo = false, generation = 0, feedbackRunning = false;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function SubjectTag(subject) {
    return `<span class="subject-tag" style="--subject:${esc(subject.color)}">${esc(subject.label)}</span>`;
  }
  function artwork(hero, className = '') {
    if (!hero?.image) return `<span class="hero-art asset-missing ${className}">${esc(hero?.name || '英雄')}<br>素材待补齐</span>`;
    return `<span class="hero-art ${className}"><img style="left:${-(hero.column || 0)*100}%;top:${-(hero.row || 0)*100}%" src="${esc(hero.image)}" width="1774" height="887" alt="${esc(hero.name)}" decoding="async"></span>`;
  }
  function HeroBadge(view, phase) {
    const unlocked = Boolean(view.latest) && phase !== 'collect';
    return `<div class="hero-badge ${unlocked ? 'is-unlocked' : 'is-locked'}" aria-label="${esc(view.hero?.name || '英雄')}，${unlocked ? '已点亮' : '未点亮'}">${artwork(view.hero)}${unlocked ? `<span class="unlocked-label">${checkIcon}已点亮</span>` : ''}</div>`;
  }
  function EnergyProgress(count) {
    return `<ol class="energy-progress" aria-label="已收集 ${count} 枚，共 5 枚">${Array.from({length:5},(_,i) => `<li class="${i < count ? 'is-collected' : 'is-empty'}"><img src="./assets/icons/energy-star.svg" width="34" height="34" alt="第${i+1}枚${i<count?'已收集':'未收集'}"></li>`).join('')}</ol>`;
  }
  function CourseRewardCard(view, phase) {
    const count = phase === 'collect' || phase === 'synthesis' ? 5 : view.roundCount;
    const newRound = view.latest && count === 0;
    return `<article class="course-card ${phase === 'synthesis' ? 'is-synthesizing' : ''}" data-course-card="${esc(view.id)}" aria-labelledby="course-${esc(view.id)}">
      <h2 class="course-title" id="course-${esc(view.id)}">${SubjectTag(config.subjects[view.subject])}<span class="course-title-text" title="${esc(view.name)}">${esc(view.name)}</span></h2>
      ${HeroBadge(view,phase)}
      <p class="reward-progress">${newRound ? '<small>新一轮</small>' : ''}<strong>${count}</strong> / 5</p>
      ${EnergyProgress(count)}
      <div class="course-actions"><p>${esc(view.encouragement)}</p><button type="button" class="learn-button" data-course="${esc(view.id)}" ${phase ? 'disabled' : ''}>${playIcon}${esc(view.button)}</button></div>
    </article>`;
  }
  function ContentCenterPage(phase, courseId, feedback) {
    $('course-grid').innerHTML = config.courses.map(c => {
      const view = RewardCore.view(state, config, c.id, records);
      if (c.id === courseId && feedback?.heroId) { view.hero = config.heroes.find(h => h.id === feedback.heroId); view.latest = feedback.heroId; }
      return CourseRewardCard(view, c.id === courseId ? phase : '');
    }).join('');
    $('content-status').hidden = config.courses.length > 0;
    $('content-status').textContent = '还没有课程，稍后再来看看吧。';
    document.querySelectorAll('.hero-art img').forEach(img => {
      const fail = () => { const holder = img.parentElement; holder.classList.add('asset-missing'); holder.replaceChildren(document.createTextNode('英雄图片暂不可用')); };
      img.addEventListener('error', fail, {once:true});
      if (img.complete && !img.naturalWidth) fail();
    });
  }
  function RewardFeedback(text) { $('reward-feedback').textContent = text; $('reward-feedback').hidden = !text; }
  async function playFeedback() {
    if (feedbackRunning || !state?.feedback.length || document.hidden) return;
    feedbackRunning = true;
    const ticket = generation;
    try {
      for (const item of [...state.feedback]) {
        if (!config.courses.some(c => c.id === item.courseId)) continue;
        ContentCenterPage('collect', item.courseId, item);
        RewardFeedback('五枚能量徽章集齐啦！');
        await wait(matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 850);
        if (ticket !== generation) return;
        ContentCenterPage('synthesis', item.courseId, item);
        RewardFeedback('合成成功！英雄已点亮，开始新一轮收集');
        await wait(matchMedia('(prefers-reduced-motion: reduce)').matches ? 400 : 1100);
        if (ticket !== generation) return;
        if (!demo) await RewardStore.acknowledge(item.id);
        state.feedback = state.feedback.filter(f => f.id !== item.id);
      }
      ContentCenterPage(); RewardFeedback('');
    } catch { showError('奖励已保存，合成反馈暂时无法确认。重新加载不会重复发奖。'); }
    finally { feedbackRunning = false; if (ticket !== generation) playFeedback(); }
  }
  function showError(message) { $('content-error').hidden = false; $('error-detail').textContent = message; }
  function renderProfile() {
    const profile = window.LearningProfile;
    if (!profile) { $('center-profile').textContent = '资料暂不可用'; return; }
    $('center-profile').innerHTML = `<span class="center-avatar">${artwork({name:profile.name,...profile.avatar})}</span><span class="profile-text">${esc(profile.name)}${profile.source === 'demo' ? '<small>示例资料</small>' : ''}</span>`;
  }
  async function load() {
    const ticket = ++generation;
    // 切出演示或重试期间，不让上一轮异步反馈渲染旧的（尤其是演示）状态。
    state = null;
    $('course-grid').replaceChildren();
    $('content-status').hidden = false; $('content-status').textContent = '正在读取本机学习记录…';
    $('content-error').hidden = true; $('course-grid').setAttribute('aria-busy', 'true');
    RewardFeedback('');
    try {
      if (!window.ContentConfig || !window.RewardCore || !window.RewardStore) throw Error('页面资源未完整加载，请联网重新加载。');
      demo = /^#demo(?:-|$)/.test(location.hash);
      config = structuredClone(ContentConfig);
      renderProfile(); $('reward-rule').textContent = config.copy.rule;
      $('demo-banner').hidden = !demo;
      if (demo) {
        state = ContentDemo.snapshot(); records = [];
        const scenario = location.hash.slice(6);
        if (scenario === 'empty') config.courses = [];
        if (scenario === 'long') config.courses[0].name = '趣味英语与勇敢小伙伴一起探索奇妙世界的超长课程标题示例';
        if (scenario === 'images') config.heroes[0].image = './assets/images/missing-hero-demo.png';
        if (scenario === 'error') throw Error('演示：课程加载失败。真实学习记录未被修改。');
        if (scenario === 'five') {
          for (let i=0;i<2;i++) { const videoId='demo-five-'+i; RewardCore.bind(state,config,'english',videoId); RewardCore.complete(state,config,{valid:true,videoId,at:Date.now()}); }
        }
      } else {
        const loaded = await RewardStore.read();
        if (ticket !== generation) return;
        state = loaded;
        try { records = PlayerCore.decode(localStorage.getItem(PlayerCore.STORAGE_KEY)); }
        catch { records = []; showError('播放记录暂时无法读取；已有奖励仍保留。请检查浏览器存储设置后重试。'); }
      }
      if (ticket !== generation) return;
      ContentCenterPage(); playFeedback();
      try { const y = Number(sessionStorage.getItem('pwatest-content-position')); if (y > 0) requestAnimationFrame(() => window.scrollTo(0,y)); } catch {}
    } catch (error) {
      if (ticket !== generation) return;
      $('course-grid').replaceChildren(); $('content-status').hidden = true;
      showError(error.message || '本机学习记录无法读取，未清空原记录。请检查存储设置后重新加载。');
    } finally { if (ticket === generation) $('course-grid').setAttribute('aria-busy', 'false'); }
  }
  function chooseCourse(id) {
    const course = config.courses.find(c => c.id === id);
    if (!course) return;
    try { sessionStorage.setItem('pwatest-content-position', String(window.scrollY)); } catch {}
    location.assign(course.entry + (demo ? '&from=content-demo' : '&from=content'));
  }
  $('course-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-course]');
    if (button) chooseCourse(button.dataset.course);
  });
  $('center-back').addEventListener('click', event => {
    try {
      const previous = new URL(document.referrer);
      const home = new URL('./index.html',location.href), root = new URL('./',location.href);
      if (previous.origin === home.origin && [home.pathname,root.pathname].includes(previous.pathname) && history.length > 1) { event.preventDefault(); history.back(); }
    } catch { /* 直接进入页面时使用显式首页链接。 */ }
  });
  $('retry-content').addEventListener('click', load);
  window.addEventListener('hashchange', load);
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !demo && !feedbackRunning) load(); });
  load();
})();
