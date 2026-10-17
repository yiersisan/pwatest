(() => {
 'use strict';
 window.ParentHome={async mount(){
   let state;try{state=await ParentService.published()}catch{return}
   if(!state?.home)return;
   let host=document.getElementById('custom-home');
   if(!host){host=document.createElement('div');host.id='custom-home';host.className='custom-home';document.querySelector('.learning-home main').append(host)}
   document.querySelectorAll('.learning-home main>.home-section').forEach(s=>s.hidden=true);
   host.innerHTML=ParentView.published(state);
   document.querySelector('.demo-note').textContent=ParentService.demo?'家长配置演示 · 不影响正式首页和观看记录':'左右滑动，发现更多学习内容';
   host.querySelectorAll('[data-published-video]').forEach(b=>b.onclick=()=>{
      const v=state.videos.find(v=>v.id===b.dataset.publishedVideo);
      if(!v?.playbackUrl){const note=document.createElement('p');note.className='home-message';note.textContent='这是视觉示例视频，尚未配置播放源。';host.querySelector('.home-message')?.remove();host.append(note);return}
      location.href='./report.html#watch=1&parentVideo='+encodeURIComponent(v.id)+'&course='+encodeURIComponent(v.courseId);
   });
 }};
})();
