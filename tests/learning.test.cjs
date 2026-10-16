const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../learning-core.js');
const Player = require('../player-core.js');
const data = require('../learning-data.json');
test('daily count uses required lessons, not recommended cards or all weekly lessons', () => {
  Core.validate(data);
  const completed = Core.completedFrom(null, data);
  assert.deepEqual(Core.progress(data.requiredIds, completed), { done:1, total:3 });
  completed.add('bear'); completed.add('zebra');
  assert.deepEqual(Core.progress(data.requiredIds, completed), { done:1, total:3 });
  completed.add('yummy');
  assert.deepEqual(Core.progress(data.requiredIds, completed), { done:2, total:3 });
});
test('demo storage is isolated and restored progress accepts only real demo IDs', () => {
  assert.notEqual(Core.STORAGE_KEY, Player.STORAGE_KEY);
  assert.deepEqual([...Core.completedFrom('["yummy","unknown","yummy"]', data)], ['yummy']);
  assert.throws(() => Core.completedFrom('{', data));
  assert.throws(() => Core.completedFrom('{}', data));
});
test('empty data is allowed; duplicate IDs, invalid assets and missing required tasks are errors', () => {
  assert.deepEqual(Core.progress([], new Set()), { done:0, total:0 });
  Core.validate({mode:'demo',lessons:[],requiredIds:[],initialCompleted:[]});
  assert.throws(() => Core.validate({...data, requiredIds:['missing']}));
  assert.throws(() => Core.validate({...data, lessons:[data.lessons[0],data.lessons[0]]}));
  assert.throws(() => Core.validate({...data, lessons:[{...data.lessons[0],image:'https://external.example/track'}]}));
});
test('weekend demo uses local day and never opens on a weekday', () => {
  assert.equal(Core.weekend(new Date(2026,9,17,12)), true);
  assert.equal(Core.weekend(new Date(2026,9,18,12)), true);
  assert.equal(Core.weekend(new Date(2026,9,19,12)), false);
});
test('homepage routes to the real player and retains its storage and media controls', () => {
  const root = path.join(__dirname,'..');
  const home = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const report = fs.readFileSync(path.join(root,'report.html'),'utf8');
  assert.match(home, /href="\.\/report.html"/);
  assert.match(report, /id="video" controls playsinline/);
  assert.match(report, /id="import-form"/);
  assert.match(report, /href="\.\/index.html"/);
  assert(!home.includes('styles.css')); assert(!report.includes('home.css'));
  for (const file of ['home.js','learning-core.js','pwa.js','app.js','sw.js']) new vm.Script(fs.readFileSync(path.join(root,file),'utf8'));
});
test('all precache resources and local HTML references exist under the deployment directory', () => {
  const root = path.join(__dirname,'..');
  let install;
  vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'), {
    self:{registration:{scope:'https://example.com/pwatest/'},addEventListener:(name,fn)=>{if(name==='install')install=fn;}}, URL,
    caches:{open:async()=>({addAll:async requests=>{for(const req of requests) assert(fs.existsSync(path.join(root,new URL(req.url).pathname.replace('/pwatest/','')||'index.html')),req.url);}})},Request
  });
  let done; install({waitUntil:p=>done=p});
  for (const file of ['index.html','report.html']) {
    const html=fs.readFileSync(path.join(root,file),'utf8');
    for (const [,target] of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
      if (/^(https?:|#)/.test(target)) continue;
      assert(fs.existsSync(path.resolve(root,target)), `${file}: ${target}`);
    }
  }
  return done;
});
test('atlas actual dimensions match the supplied grid', () => {
  const manifest=require('../assets/asset-manifest.json');
  const png=fs.readFileSync(path.join(__dirname,'../assets/images/illustration-atlas.png'));
  assert.equal(png.readUInt32BE(16), manifest.atlas.width);
  assert.equal(png.readUInt32BE(20), manifest.atlas.height);
  assert.equal(manifest.atlas.width/4,manifest.atlas.height/2);
  assert.deepEqual(Core.ART,manifest.atlas.order);
});
