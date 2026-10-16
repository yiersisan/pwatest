const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(hash){
 const listeners={},els={};
 for(const id of ['video','watch-lock','watch-shield']) els[id]={hidden:true,attrs:{},plays:0,focus(){this.focused=true},setAttribute(k,v){this.attrs[k]=v},play(){this.plays++;return this.reject?Promise.reject(Error('blocked')):Promise.resolve()},addEventListener(name,fn){listeners[id+':'+name]=fn;}};
 const classes=new Set();const w={PlayerCore:{STORAGE_KEY:'real'},ContentConfig:require('../content-config.js')};
 const doc={title:'',documentElement:{classList:{add:c=>classes.add(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}},getElementById:id=>els[id],addEventListener:(n,f)=>listeners[n]=f};
 vm.runInNewContext(fs.readFileSync('watch-player.js','utf8'),{window:w,location:{hash},URLSearchParams,document:doc});
 return{w,els,listeners,classes,doc};
}
test('normal customization mode is unchanged',()=>{const x=setup('');assert.equal(x.w.WatchPlayer,undefined);assert.equal(x.classes.size,0);assert.equal(x.els['watch-lock'].hidden,true)});
test('watch starts placeholder immediately with isolated history and inline autoplay',()=>{
 const x=setup('#watch=1&placeholder=1&course=english');assert(x.classes.has('watch-mode'));
 assert.equal(x.doc.title,'趣味英语 · 全屏播放');assert.equal(x.els.video.autoplay,true);assert.equal(x.els.video.playsInline,true);
 assert.equal(x.w.WatchPlayer.storageKey,'pwatest-preview-history-v1');
 let imported;x.w.WatchPlayer.start({defaultURL:'https://example.com/video',importSource:(...args)=>imported=args});assert.equal(imported[0],'https://example.com/video');
});
test('lock hides native controls, shields the picture and can be unlocked',()=>{
 const x=setup('#watch=1');const lock=x.els['watch-lock'],shield=x.els['watch-shield'];
 assert.equal(x.els.video.controls,true);assert.equal(shield.hidden,true);
 x.listeners['watch-lock:click']();assert.equal(x.els.video.controls,false);assert.equal(shield.hidden,false);assert.equal(lock.attrs['aria-pressed'],'true');assert.equal(lock.focused,true);
 for(const name of ['click','dblclick','pointerdown','contextmenu']){let prevented=false,stopped=false;x.listeners['watch-shield:'+name]({preventDefault(){prevented=true},stopPropagation(){stopped=true}});assert(prevented&&stopped)}
 x.listeners['watch-lock:click']();assert.equal(x.els.video.controls,true);assert.equal(shield.hidden,true);assert.equal(lock.attrs['aria-pressed'],'false');
});
test('locked keyboard cannot pause or seek, but permits focus navigation and unlocking',()=>{
 const x=setup('#watch=1');
 const key=(key,target=x.els.video)=>{let prevented=false;x.listeners.keydown({key,target,preventDefault(){prevented=true},stopImmediatePropagation(){}});return prevented};
 assert.equal(key(' '),false);x.listeners['watch-lock:click']();
 for(const value of [' ','k','ArrowLeft','ArrowRight','Home','End','MediaPlayPause'])assert.equal(key(value),true);
 assert.equal(key('Tab'),false);assert.equal(key(' ',x.els['watch-lock']),false);
});
test('autoplay fallback retries muted and handles a second rejection',async()=>{
 const x=setup('#watch=1');assert.equal(await x.w.WatchPlayer.autoplayBlocked(),true);assert.equal(x.els.video.muted,true);assert.equal(x.els.video.plays,1);
 x.els.video.reject=true;assert.equal(await x.w.WatchPlayer.autoplayBlocked(),false);assert.equal(x.els.video.controls,true);
});
test('placeholder suppresses course binding and reward bridge altogether',()=>{
 const context={window:{WatchPlayer:{placeholder:true}}};vm.runInNewContext(fs.readFileSync('course-player.js','utf8'),context);assert.equal(context.window.CoursePlayer,undefined);
});
test('display interactions are blocked without blocking input or touch scrolling',()=>{
 const listeners={};vm.runInNewContext(fs.readFileSync('interaction.js','utf8'),{document:{addEventListener:(n,f)=>listeners[n]=f}});
 for(const name of ['contextmenu','selectstart','copy','cut','dragstart']){
  let prevented=false;listeners[name]({target:{closest:()=>null},preventDefault(){prevented=true}});assert(prevented,name);
  prevented=false;listeners[name]({target:{closest:()=>({})},preventDefault(){prevented=true}});assert(!prevented,'editable '+name);
 }
 assert.equal(listeners.touchmove,undefined);assert.equal(listeners.touchstart,undefined);
});
