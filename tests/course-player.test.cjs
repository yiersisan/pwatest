const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Core=require('../reward-core.js');
const config=require('../content-config.js');
class El extends EventTarget {constructor(){super();this.hidden=true;this.textContent='';}}
function setup(hash='#course=english'){
 const state=Core.empty(),els=Object.fromEntries(['course-playback-status','back-to-content','retry-course-reward'].map(id=>[id,new El()]));
 let blocked=false;
 const store={read:async()=>state,bind:async(c,id)=>Core.bind(state,config,c,id),relink:async(a,b)=>Core.relink(state,a,b),complete:async e=>{if(blocked)throw Error('quota');return Core.complete(state,config,e)}};
 const context={window:{},ContentConfig:config,RewardCore:Core,RewardStore:store,location:{hash},document:{getElementById:id=>els[id]},URLSearchParams,sessionStorage:{getItem:()=>null,removeItem(){}},Date};
 vm.runInNewContext(fs.readFileSync('course-player.js','utf8'),context);
 return{api:context.window.CoursePlayer,state,els,block:value=>blocked=value};
}
test('bridge binds imports without rewards, then awaits binding before a completion',async()=>{
 const x=setup();x.api.imported({id:'one'},null);assert.equal(Object.keys(x.state.receipts).length,0);
 await x.api.completed({id:'one'});assert.equal(x.state.courses.english.total,1);
 await x.api.completed({id:'one'});assert.equal(x.state.courses.english.total,1);
});
test('direct player still awards previously associated videos but does not assign new ones',async()=>{
 const x=setup('');Core.bind(x.state,config,'math','mapped');
 await x.api.completed({id:'mapped'});assert.equal(x.state.courses.math.total,1);
 x.api.imported({id:'unmapped'},null);await x.api.completed({id:'unmapped'});assert.equal(Object.keys(x.state.receipts).length,1);
});
test('launch selects the next associated video through existing selector without forcing autoplay',async()=>{
 const x=setup();Core.bind(x.state,config,'english','next');let selection;
 await x.api.launch([{id:'other'},{id:'next'}],(...args)=>selection=args);
 assert.equal(selection[0].id,'next');assert.equal(selection[1],false);assert.deepEqual(x.state.courses,{});
});
test('save failures are visible and retry is idempotent',async()=>{
 const x=setup();x.api.imported({id:'one'},null);x.block(true);await x.api.completed({id:'one'});
 assert.equal(x.els['retry-course-reward'].hidden,false);assert.match(x.els['course-playback-status'].textContent,/暂未保存/);assert.deepEqual(x.state.courses,{});
 x.block(false);x.els['retry-course-reward'].dispatchEvent(new Event('click'));
 await new Promise(r=>setImmediate(r));assert.equal(x.state.courses.english.total,1);assert.equal(x.els['retry-course-reward'].hidden,true);
});
test('different signed URL replacement retains the original completed identity',async()=>{
 const x=setup();x.api.imported({id:'old'},null);await x.api.completed({id:'old'});
 x.api.imported({id:'new'},'old');await x.api.completed({id:'new'});assert.equal(x.state.courses.english.total,1);
});
