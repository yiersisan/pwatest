const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Core=require('../reward-core.js');
const config=require('../content-config.js');
const Player=require('../player-core.js');
function award(state,courseId,videoId,valid=true){Core.bind(state,config,courseId,videoId);return Core.complete(state,config,{videoId,valid,at:100});}
test('all courses start grey at zero; binding/opening does not award',()=>{
 const state=Core.empty();for(const c of config.courses){const v=Core.view(state,config,c.id);assert.equal(v.roundCount,0);assert.equal(v.latest,null);}
 Core.bind(state,config,'english','one');assert.deepEqual(state.courses,{});
 assert.equal(Core.complete(state,config,{videoId:'one',valid:false}).awarded,false);
 assert.equal(Core.complete(state,config,{videoId:'unbound',valid:true}).awarded,false);
});
test('each course is independent; one video cannot be assigned across courses',()=>{
 const state=Core.empty();award(state,'english','a');award(state,'math','b');award(state,'english','c');
 assert.equal(state.courses.english.roundCount,2);assert.equal(state.courses.math.roundCount,1);
 assert.throws(()=>Core.bind(state,config,'thinking','a'));
 assert.equal(Core.view(state,config,'pinyin').total,0);
});
test('fifth completion commits hero, reset, lifetime receipts and pending feedback together',()=>{
 const state=Core.empty();for(let i=0;i<5;i++)award(state,'english','v'+i);
 assert.equal(state.courses.english.total,5);assert.equal(state.courses.english.roundCount,0);
 assert.deepEqual(state.courses.english.unlocked,['ultraman']);assert.equal(state.feedback.length,1);
 const restored=Core.validate(JSON.parse(JSON.stringify(state)));
 assert.equal(award(restored,'english','v4').awarded,false);
 assert.equal(restored.courses.english.total,5);assert.equal(Object.keys(restored.receipts).length,5);
 // Interrupting the animation or replaying its feedback cannot change saved reward counts.
 restored.feedback=[];assert.equal(award(restored,'english','v4').awarded,false);
 award(restored,'english','v5');assert.equal(restored.courses.english.roundCount,1);assert.equal(restored.courses.english.latest,'ultraman');
});
test('subsequent rounds retain heroes and follow configured order, including missing resources',()=>{
 const state=Core.empty();for(let i=0;i<11;i++)award(state,'english','v'+i);
 assert.deepEqual(state.courses.english.unlocked,['ultraman','hero-02']);
 const v=Core.view(state,config,'english');assert.equal(v.latest,'hero-02');assert.equal(v.nextHero,'hero-03');assert.equal(v.roundCount,1);assert.equal(v.hero.image,null);
});
test('repeated callbacks, reopening and refreshed Baidu signatures award once',()=>{
 let state=Core.empty();
 const a=Player.identity('https://pan.baidu.com/share/streaming?uk=1&fid=2&shareid=3&sign=old');
 const b=Player.identity('https://pan.baidu.com/share/streaming?uk=1&fid=2&shareid=3&sign=new');
 award(state,'english',a);state=Core.validate(JSON.parse(JSON.stringify(state)));
 for(let i=0;i<10;i++)assert.equal(award(state,'english',b).awarded,false);
 assert.equal(state.courses.english.total,1);
});
test('explicit replacement shares identity before AND after the first award',()=>{
 for(const before of [true,false]){
  const state=Core.empty();Core.bind(state,config,'english','old');
  if(before)award(state,'english','old');Core.relink(state,'old','new');
  award(state,'english','new');assert.equal(award(state,'english','old').awarded,false);
  Core.relink(state,'new','newer');assert.equal(award(state,'english','newer').awarded,false);
  assert.equal(state.courses.english.total,1);
 }
});
test('next content reuses existing records and skips awarded identities',()=>{
 const state=Core.empty();award(state,'english','a');Core.bind(state,config,'english','b');
 const v=Core.view(state,config,'english',[{id:'a',title:'done'},{id:'b',title:'next'},{id:'c'}]);
 assert.equal(v.nextContent.title,'next');assert.equal(v.available.length,2);
});
test('demo visual states never touch real history or reward stores',()=>{
 const context={window:{},RewardCore:Core};vm.runInNewContext(fs.readFileSync('content-demo.js','utf8'),context);
 const demo=context.window.ContentDemo.snapshot();assert.deepEqual(Object.values(demo.courses).map(c=>c.roundCount),[3,0,0,1,0]);
 assert.equal(demo.courses.pinyin.latest,'ultraman');assert.deepEqual(Core.empty().courses,{});
});
test('bad saved state fails closed instead of silently clearing rewards',()=>{
 assert.throws(()=>Core.validate({}));const bad=Core.empty();bad.courses.english={total:5,roundCount:4,unlocked:[]};assert.throws(()=>Core.validate(bad));
});
test('all new scripts parse and content center is in the offline asset list',()=>{
 for(const file of ['content-config.js','content-center.js','content-demo.js','reward-core.js','reward-store.js','course-player.js','profile.js'])new vm.Script(fs.readFileSync(file,'utf8'));
 assert.match(fs.readFileSync('sw.js','utf8'),/content-center.html/);
 assert(!fs.readFileSync('content-center.css','utf8').includes('transform:scale'));
});
