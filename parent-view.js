(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<svg class="icon" aria-hidden="true"><use href="./assets/parent/icons/sprite.svg#${name}"/></svg>`;
  function thumb(v){
    if(v?.thumbnailUrl)return `<div class="thumb"><img src="${esc(v.thumbnailUrl)}" alt="" draggable="false"></div>`;
    if(Number.isInteger(v?.tile))return `<div class="thumb"><span class="tile" style="--x:${v.tile%4/3*100}%;--y:${Math.floor(v.tile/4)*100}%"></span></div>`;
    return `<div class="thumb no-cover">${icon('play')}<span>视频封面</span></div>`;
  }
  function card(v,courses,tool='') {return `<article class="home-card">${tool}${thumb(v)}<h3>${esc(v?.title||'视频已失效')}</h3><span class="pill">${esc(courses.find(c=>c.id===v?.courseId)?.title||'不可用')}</span></article>`;}
  function published(state){const section=(title,subtitle,ids)=>`<section class="config-section"><div class="section-heading"><h2>${esc(title)}</h2><p class="muted">${esc(subtitle)}</p></div><div class="config-rail">${ids.map(id=>{const v=state.videos.find(v=>v.id===id&&v.status==='ready');return v?`<button class="published-video" aria-label="${esc(v.title)}" data-published-video="${esc(id)}">${card(v,state.courses)}</button>`:''}).join('')||'<p class="empty">今天还没有学习任务</p>'}</div></section>`;return section('今日任务','',state.home.todayVideoIds)+state.home.sections.filter(s=>s.videoIds.some(id=>state.videos.some(v=>v.id===id&&v.status==='ready'))).map(s=>section(s.title,s.subtitle,s.videoIds)).join('');}
  window.ParentView={esc,icon,thumb,card,published};
})();
