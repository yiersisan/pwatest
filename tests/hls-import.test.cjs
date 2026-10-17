const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const HlsImportCore = require('../hls-core.js');
const PlayerCore = require('../player-core.js');
const source = fs.readFileSync('assets/video/default.m3u8', 'utf8');
const defaultURL = 'https://example.com/pwatest/assets/video/default.m3u8';
class Element extends EventTarget {
  constructor() { super(); this.value = ''; this.files = []; this.children = []; this.disabled = false; }
  replaceChildren() { this.children = []; }
  append(...items) { this.children.push(...items); }
  setAttribute(key,value) { (this.attrs ||= {})[key] = value; }
}
function setup({ manifest = source, controller = true, url = defaultURL, fetchManifest } = {}) {
  const els = new Map();
  const get = id => { if (!els.has(id)) els.set(id, new Element()); return els.get(id); };
  get('video-url').value = url;
  const win = new EventTarget();
  Object.assign(win, { HlsImportCore, PlayerCore, DefaultVideo: {url,title:'完整测试视频',duration:537,segments:54} });
  vm.runInNewContext(fs.readFileSync('video-items.js', 'utf8'), {window:win});
  const records = [], stored = new Map(), requests = [];
  win.addEventListener('pwatest:import-source', event => { records.push(event.detail); event.detail.accepted = true; });
  vm.runInNewContext(fs.readFileSync('hls-import.js', 'utf8'), {
    window: win, document: { getElementById: get, createElement: () => new Element() },
    location: { href: 'https://example.com/pwatest/report.html' }, navigator: { serviceWorker: { controller } },
    URL, TextEncoder, CustomEvent, Response, crypto: webcrypto,
    caches: {open: async () => ({put: async (url, response) => stored.set(url, response), delete: async url => stored.delete(url)})},
    fetch: async url => {
      requests.push(url);
      if (url === win.DefaultVideo.url) return new Response(manifest);
      const item = win.VideoItems.find(item => url.endsWith(item.path.slice(1)));
      if (item) return fetchManifest ? fetchManifest(item) : new Response(fs.readFileSync(item.path, 'utf8'));
      if (url.endsWith('/capabilities')) return new Response('', {headers:{'X-Pwatest-HLS':'1'}});
      return stored.get(url)?.clone() || new Response('', {status:404});
    }
  });
  return { get, records, stored, requests, win, async submit() {
    const event = new Event('submit', {cancelable:true}); get('import-form').dispatchEvent(event);
    for (let i=0; get('import-button').disabled && i<100; i++) await new Promise(resolve=>setImmediate(resolve));
    assert.equal(get('import-button').disabled,false,'import completes'); return event;
  }};
}
test('published default is the supplied full media playlist, not a short preview', () => {
  const info = HlsImportCore.inspect(source);
  assert.equal(info.duration,537); assert.equal(info.segments,54); assert.equal(info.complete,true);
  assert.equal(HlsImportCore.normalize(source).body, source);
});
test('one click imports the default through the same verified local cache route', async () => {
  const app=setup(); const event=await app.submit();
  assert(event.defaultPrevented); assert.equal(app.records.length,1);
  assert.match(app.records[0].url,/\/pwatest\/__local_hls__\/[a-f0-9]{64}\/playlist.m3u8$/);
  assert.equal(app.records[0].playlistDuration,537);
  assert.equal(await app.stored.get(app.records[0].url).text(),source);
  assert.match(app.get('playlist-status').textContent,/08:57/);
});
test('an invalid or shortened default never creates a misleading full-video record', async () => {
  for (const manifest of ['{"errno":71}', '#EXTM3U\n#EXTINF:100,\nhttps://example.com/short.ts\n#EXT-X-ENDLIST\n']) {
    const app=setup({manifest}); await app.submit();
    assert.equal(app.records.length,0); assert.equal(app.stored.size,0); assert(app.get('playlist-status').textContent);
  }
});
test('first visit without an active worker explains refresh instead of saving a broken URL', async () => {
  const app=setup({controller:null}); await app.submit();
  assert.equal(app.records.length,0); assert.equal(app.stored.size,0);
  assert.match(app.get('playlist-status').textContent,/刷新/);
});
test('ordinary external video links continue through the original link importer', async () => {
  const app=setup(); app.get('video-url').value='https://example.com/video.mp4';
  const event=await app.submit(); assert.equal(event.defaultPrevented,false); assert.equal(app.requests.length,0);
});

test('localhost preview URL is not treated as an insecure media segment base', async () => {
  const app=setup({url:'http://127.0.0.1:8768/assets/video/default.m3u8'});
  await app.submit(); assert.equal(app.records.length,1); assert.equal(app.records[0].playlistDuration,537);
});

async function settle(app) {
  for (let i=0; app.get('import-button').disabled && i<100; i++) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.get('import-button').disabled,false);
}
test('two items import distinct complete sources and repeated selection keeps the same URL', async () => {
  const app=setup(), buttons=app.get('video-items').children;
  assert.equal(buttons.length,2);
  for (const button of buttons) { button.dispatchEvent(new Event('click')); await settle(app); }
  assert.deepEqual(app.records.map(r=>r.title),['s1-w1-1','s1-w1-2']);
  assert.deepEqual(app.records.map(r=>r.playlistDuration),[537,561]);
  assert.notEqual(app.records[0].url,app.records[1].url);
  assert(app.records.every(r=>r.selectItem));
  buttons[0].dispatchEvent(new Event('click')); await settle(app);
  assert.equal(app.records[2].url,app.records[0].url);
  assert.equal(app.stored.size,2);
  const catalog=JSON.parse(fs.readFileSync('assets/video/english/s1/catalog.json'));
  assert.equal(catalog.coverage.savedFullManifests,2);
  for (const item of app.win.VideoItems) {
    const entry=catalog.videos.find(v=>v.id===item.id);
    assert.equal(entry.playlist.durationSeconds,item.duration);
    assert.equal(entry.playlist.segmentCount,item.segments);
  }
});
test('late first selection cannot replace a newer clicked item or its status', async () => {
  let finishFirst;
  const app=setup({fetchManifest:item=> item.title==='s1-w1-1'
    ? new Promise(resolve=>{finishFirst=resolve;})
    : Promise.resolve(new Response(fs.readFileSync(item.path,'utf8')))});
  const buttons=app.get('video-items').children;
  buttons[0].dispatchEvent(new Event('click'));
  buttons[1].dispatchEvent(new Event('click')); await settle(app);
  const status=app.get('playlist-status').textContent;
  finishFirst(new Response('',{status:500})); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.records.length,1); assert.equal(app.records[0].title,'s1-w1-2');
  assert.equal(app.get('playlist-status').textContent,status);
});
test('failed course request does not create a record and remains retryable', async () => {
  const app=setup({fetchManifest:async()=>new Response('',{status:404})});
  app.get('video-items').children[1].dispatchEvent(new Event('click')); await settle(app);
  assert.equal(app.records.length,0); assert.match(app.get('playlist-status').textContent,/无法读取/);
  assert.equal(app.get('video-items').children[1].attrs['aria-busy'],'false');
});
