(() => {
  'use strict';
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const key = 'pwatest-parent-visual-demo-v1';
  const missing = () => { const e = Error('家长服务尚未接入，暂不能验证、上传或保存正式配置'); e.code = 'UNAVAILABLE'; throw e; };
  const seed = () => ({version:0,courses:[['english','英','趣味英语','#12b67b'],['thinking','思','思维训练','#ffac25'],['pinyin','拼','快乐拼音','#399ef3'],['math','数','数学启蒙','#9360f3'],['reading','阅','趣味阅读','#ff5999']].map(([id,tag,title,color])=>({id,tag,title,color})),videos:[['v1','水果的颜色',4,200],['v2','认识苹果和香蕉',4,255],['v3','跟着动物学发音',5,310],['v4','美味蛋糕小课堂',6,275]].map(([id,title,tile,durationSeconds])=>({id,title,tile,durationSeconds,courseId:'english',status:'ready'})),home:{version:0,todayVideoIds:['v2','v3','v4'],sections:[{id:'week',title:'本周任务',subtitle:'英语体验版 S1 · 第1周',videoIds:['v1','v3','v4']}]}});
  function read() { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : seed(); }
  async function backend(method, ...args) {
    const api = window.ParentBackend;
    if (!api || typeof api[method] !== 'function') return missing();
    return api[method](...args);
  }
  async function change(expected, edit) {
    const run = () => {
      const state = read();
      if (state.version !== expected) { const e = Error('内容已在其他页面更新。请重新加载后再修改'); e.code='CONFLICT'; throw e; }
      edit(state); state.version++; localStorage.setItem(key,JSON.stringify(state)); return state;
    };
    return navigator.locks ? navigator.locks.request(key,run) : run();
  }
  window.ParentService = {
    demo,
    async session() { return demo ? {verified:true,demo:true} : backend('session'); },
    // A demo page is explicitly public. It does not create a parent session.
    verify: pin => backend('verify',pin),
    recover: () => backend('recover'),
    logout: () => demo ? Promise.resolve() : backend('logout'),
    catalog: () => demo ? Promise.resolve(read()) : backend('catalog'),
    async mutate(action, payload, expectedVersion) {
      if (!demo) return backend('mutate',action,payload,expectedVersion);
      return change(expectedVersion,state=>{
        if (action==='course') {
          const fields=ParentCore.course(payload,state.courses,payload.id);
          if(payload.id) Object.assign(state.courses.find(c=>c.id===payload.id),fields);
          else state.courses.push({id:crypto.randomUUID(),...fields,color:'#12b67b'});
        } else if (action==='title') {
          state.videos.find(v=>v.id===payload.id).title=ParentCore.title(payload.title);
        } else if (action==='move') {
          if(!state.courses.some(c=>c.id===payload.courseId))throw Error('课程不存在');
          const item=state.videos.find(v=>v.id===payload.id);
          item.courseId=payload.courseId;state.videos=state.videos.filter(v=>v.id!==item.id).concat(item);
        } else if (action==='order') {
          const items=state.videos.filter(v=>v.courseId===payload.courseId);
          if(payload.ids.length!==items.length||new Set(payload.ids).size!==items.length||payload.ids.some(id=>!items.some(v=>v.id===id)))throw Error('排序列表不完整，请刷新');
          const ordered=payload.ids.map(id=>items.find(x=>x.id===id));
          let i=0;state.videos=state.videos.map(v=>v.courseId===payload.courseId?ordered[i++]:v);
        } else throw Error('不支持的操作');
      });
    },
    async saveHome(draft) {
      if(!demo)return backend('saveHome',draft,draft.version);
      const run=()=>{const state=read();if(state.home.version!==draft.version){const e=Error('首页配置已更新。草稿已保留，请重新加载最新版本后合并');e.code='CONFLICT';throw e;}state.home=ParentCore.home(draft,state.videos);state.home.version++;state.version++;localStorage.setItem(key,JSON.stringify(state));return state.home;};
      return navigator.locks?navigator.locks.request(key,run):run();
    },
    upload: (item,onStatus) => demo ? Promise.reject(Error('视觉演示不上传文件；需要接入正式上传服务')) : backend('upload',{file:item.file,title:item.title,courseId:item.courseId,idempotencyKey:item.id,serverVideoId:item.serverVideoId},onStatus),
    // A public, account-scoped read endpoint; returns null if no custom home exists.
    published: () => demo ? Promise.resolve(read()) : window.ParentBackend?.published ? backend('published') : Promise.resolve(null)
  };
})();
