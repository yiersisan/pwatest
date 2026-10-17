const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Core = require('../player-core.js');
const url = 'https://pan.baidu.com/share/streaming?uk=1&fid=2&shareid=3&sign=old';
const renewed = url.replace('sign=old', 'sign=new');

test('rejects non-HTTPS, script and credential URLs', () => {
  for (const value of ['javascript:alert(1)', 'http://example.com/a.mp4', 'https://u:p@example.com/video', 'broken']) assert.throws(() => Core.parseURL(value));
});
test('new signed URLs update the same video without losing progress', () => {
  let { records } = Core.upsert([], url, '视频', 1);
  records[0].position = 43; records[0].duration = 100;
  const result = Core.upsert(records, renewed, '', 2);
  assert.equal(result.records.length, 1);
  assert.equal(result.record.position, 43);
  assert.equal(result.record.url, renewed);
  assert.equal(result.record.title, '视频');
});
test('explicit replacement preserves progress, completed videos restart at zero', () => {
  const old = Core.upsert([], 'https://example.com/a.mp4', '示例', 1).record;
  old.position = 55; old.completed = true;
  const next = Core.upsert([old], 'https://example.com/new.mp4', '', 2, old.id).record;
  assert.equal(next.position, 55); assert.equal(Core.resumePosition(next, 100), 0);
  assert.equal(Core.resumePosition({ position: 130 }, 100), 99.5);
});
test('persisted data is validated and malformed storage is detected', () => {
  assert.throws(() => Core.decode('{'));
  assert.throws(() => Core.decode('{}'));
  const data = Core.decode(JSON.stringify([null, { url: 'javascript:bad' }, { url, position: -9, duration: 'bad' }]));
  assert.equal(data.length, 1); assert.equal(data[0].position, 0); assert.equal(data[0].duration, 0);
});

// Minimal event/DOM fixture for app integration. Media transport and Safari policies
// still require an iPad test; these tests verify the actual UI controller code.
class Element extends EventTarget {
  constructor(tag = '') { super(); this.tagName = tag; this.children = []; this.hidden = false; this.value = ''; this.textContent = ''; this.attrs = {}; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; if (key === 'src') this.src = ''; }
  scrollIntoView() {}
  focus() {}
  click() { this.fire('click'); }
  fire(type) { this.dispatchEvent(new Event(type, { cancelable: true })); }
}
class Video extends Element {
  constructor() { super('video'); this.src = ''; this.currentSrc = ''; this.readyState = 0; this.currentTime = 0; this.duration = NaN; this.ended = false; this.seeking = false; this.plays = 0; }
  load() { this.readyState = 0; this.currentTime = 0; this.currentSrc = ''; this.ended = false; }
  play() { this.plays++; return this.blocked ? Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) : Promise.resolve(); }
  pause() { this.fire('pause'); }
  canPlayType() { return 'probably'; }
  metadata(duration = 100) { this.currentSrc = this.src; this.readyState = 1; this.duration = duration; this.fire('loadedmetadata'); }
}
function app(initial = null, storageBlocked = false, coursePlayer = null, watchPlayer = null) {
  const els = Object.fromEntries([...fs.readFileSync(path.join(__dirname, '../report.html'), 'utf8').matchAll(/id="([^"]+)"/g)].map(x => [x[1], new Element()]));
  els.video = new Video();
  const doc = new EventTarget(); doc.getElementById = id => els[id]; doc.createElement = tag => new Element(tag);
  const win = new EventTarget(); win.PlayerCore = Core; win.DefaultVideo = { url: 'https://example.com/pwatest/assets/video/default.m3u8', title: '百度完整视频（8分57秒）' }; win.CoursePlayer = coursePlayer; win.WatchPlayer = watchPlayer;
  const store = new Map(initial ? [[Core.STORAGE_KEY, initial]] : []);
  const revoked = [];
  let nextBlob = 0;
  class LocalURL extends URL {
    static createObjectURL() { return 'blob:https://example.com/local-' + (++nextBlob); }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), {
    window: win, document: doc, navigator: { onLine: true }, URL: LocalURL, Date, Event, CustomEvent,
    localStorage: { getItem: key => { if (storageBlocked) throw Error('blocked'); return store.get(key); }, setItem: (key, value) => { if (storageBlocked) throw Error('blocked'); store.set(key, value); } },
    setTimeout: () => 1, clearTimeout() {}
  });
  return { els, win, store, revoked, saved: () => JSON.parse(store.get(Core.STORAGE_KEY) || '[]') };
}
test('default import, pause saving, reopening, resume, restart, and deletion', () => {
  const first = app();
  assert.equal(first.els['video-url'].value, 'https://example.com/pwatest/assets/video/default.m3u8');
  first.els['import-form'].fire('submit');
  assert.equal(first.els.video.plays, 1);
  assert.equal(first.saved().length, 1);
  first.els.video.metadata(); first.els.video.currentTime = 43; first.els.video.pause();
  assert.equal(first.saved()[0].position, 43);
  const reopened = app(first.store.get(Core.STORAGE_KEY));
  const actions = reopened.els['history-list'].children[0].children[3];
  actions.children[0].fire('click');
  // A pause before metadata must not destroy the saved resume position.
  reopened.els.video.pause(); assert.equal(reopened.saved()[0].position, 43);
  reopened.els.video.metadata(); assert.equal(reopened.els.video.currentTime, 43);
  reopened.els.video.fire('seeked');
  reopened.els.video.currentTime = 52; reopened.win.dispatchEvent(new Event('pagehide'));
  assert.equal(reopened.saved()[0].position, 52);
  reopened.els.restart.fire('click'); reopened.els.video.metadata();
  assert.equal(reopened.els.video.currentTime, 0);
  reopened.els['history-list'].children[0].children[3].children[2].fire('click');
  assert.equal(reopened.saved().length, 0); assert.equal(reopened.els.video.hidden, true);
});
test('replacement UI keeps position and prevents duplicate history entries', () => {
  const instance = app();
  instance.els['video-url'].value = url; instance.els['import-form'].fire('submit');
  instance.els.video.metadata(); instance.els.video.currentTime = 32; instance.els.video.pause();
  instance.els['history-list'].children[0].children[3].children[1].fire('click');
  instance.els['video-url'].value = renewed; instance.els['import-form'].fire('submit');
  assert.equal(instance.saved().length, 1); assert.equal(instance.saved()[0].position, 32);
  instance.els.video.metadata(); assert.equal(instance.els.video.currentTime, 32);
});
test('bad input, blocked autoplay and unavailable local storage have visible feedback', async () => {
  const instance = app(null, true);
  assert.equal(instance.els['storage-status'].hidden, false);
  instance.els['video-url'].value = 'javascript:bad'; instance.els['import-form'].fire('submit');
  assert.match(instance.els['form-status'].textContent, /HTTPS/);
  assert.equal(instance.els.video.plays, 0);
  instance.els['video-url'].value = url; instance.els.video.blocked = true; instance.els['import-form'].fire('submit');
  await Promise.resolve();
  assert.match(instance.els['player-status'].textContent, /播放按钮/);
});
test('video titles render as text instead of HTML', () => {
  const instance = app(); const title = '<img src=x onerror=alert(1)>';
  instance.els['video-title'].value = title; instance.els['import-form'].fire('submit');
  assert.equal(instance.els['current-title'].textContent, title);
  assert.equal(instance.els['history-list'].children[0].children[0].textContent, title);
});

test('switching videos preserves the first progress and completion restarts at zero', () => {
  const instance = app();
  instance.els['video-url'].value = url; instance.els['import-form'].fire('submit');
  instance.els.video.metadata(); instance.els.video.currentTime = 28;
  instance.els['video-url'].value = 'https://example.com/second.mp4'; instance.els['import-form'].fire('submit');
  assert.equal(instance.saved().find(x => x.url === url).position, 28);
  instance.els.video.metadata(); instance.els.video.currentTime = 100; instance.els.video.ended = true; instance.els.video.fire('ended');
  assert.equal(instance.saved()[0].completed, true);
  instance.els['history-list'].children[0].children[3].children[0].fire('click');
  instance.els.video.metadata(); assert.equal(instance.els.video.currentTime, 0);
});

test('media diagnostics expose the error without exposing signed URLs', () => {
  const instance = app();
  instance.els['video-url'].value = url; instance.els['import-form'].fire('submit');
  instance.els.video.error = { code: 4, message: 'Failed to load https://example.com/video?sign=secret-token' };
  instance.els.video.fire('error');
  const report = instance.els['playback-diagnostics'].textContent;
  assert.match(report, /错误代码：4/); assert.match(report, /\[媒体地址\]/);
  assert(!report.includes('secret-token'));
  assert.equal(instance.els['direct-video'].href, url);
});

test('course rewards only receive valid ended callbacks, never imports, starts or stale media', () => {
 const completions=[],imports=[];
 const instance=app(null,false,{launch(){},imported(record){imports.push(record.id);},completed(record){completions.push(record.id);}});
 instance.els['video-url'].value=url;instance.els['import-form'].fire('submit');
 assert.equal(imports.length,1);assert.equal(completions.length,0);
 instance.els.video.fire('ended');assert.equal(completions.length,0);
 instance.els.video.metadata();instance.els.video.fire('ended');assert.equal(completions.length,0);
 instance.els.video.ended=true;instance.els.video.currentSrc='https://example.com/stale.mp4';instance.els.video.fire('ended');assert.equal(completions.length,0);
 instance.els.video.currentSrc=instance.els.video.src;instance.els.video.fire('ended');
 assert.equal(completions[0],Core.identity(url));assert.equal(completions.length,1);
});

test('a late waiting event cannot overwrite a terminal media error', () => {
  const instance = app(); instance.els['import-form'].fire('submit');
  instance.els.video.error = { code: 4 }; instance.els.video.fire('error');
  const error = instance.els['player-status'].textContent;
  instance.els.video.fire('waiting');
  assert.equal(instance.els['player-status'].textContent, error);
});

test('imported longer manifest preserves progress and clears completion of a short preview', () => {
  const old = Core.upsert([], url, '视频', 1).record;
  old.position = 100; old.duration = 100; old.completed = true;
  const instance = app(JSON.stringify([old]));
  instance.els['history-list'].children[0].children[3].children[1].fire('click');
  const detail = { url: 'https://example.com/__local_hls__/' + 'a'.repeat(64) + '/playlist.m3u8', title: '完整清单', playlistDuration: 510 };
  instance.win.dispatchEvent(new CustomEvent('pwatest:import-source', { detail }));
  assert.equal(detail.accepted, true);
  assert.equal(instance.saved().length, 1);
  assert.equal(instance.saved()[0].completed, false);
  assert.equal(instance.saved()[0].position, 100);
  instance.els.video.metadata(510);
  assert.equal(instance.els.video.currentTime, 100);
  assert.equal(Core.decode(JSON.stringify(instance.saved()))[0].playlistDuration, 510);
});

test('fullscreen placeholder reuses player and resume but does not overwrite real video history', () => {
 const real = Core.upsert([],url,'真实视频',1).records; real[0].position=51;
 const key='pwatest-preview-history-v1';
 const watch={active:true,placeholder:true,storageKey:key,start({defaultURL,importSource}){importSource(defaultURL,'学习占位视频');}};
 const instance=app(JSON.stringify(real),false,null,watch);
 assert.equal(instance.saved()[0].position,51);assert.equal(instance.saved()[0].title,'真实视频');
 assert.equal(instance.els.video.plays,1);
 instance.els.video.metadata();instance.els.video.currentTime=24;instance.els.video.pause();
 assert.equal(JSON.parse(instance.store.get(key))[0].position,24);
 assert.equal(instance.saved()[0].position,51);
});

test('watch player invokes muted fallback after an audible autoplay policy rejection', async () => {
 let retries=0;
 const watch={active:true,placeholder:true,storageKey:'preview',start(){},autoplayBlocked:async()=>{retries++;return true;}};
 const instance=app(null,false,null,watch);
 instance.els.video.blocked=true;
 instance.els['import-form'].fire('submit');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(retries,1);
 assert.doesNotMatch(instance.els['player-status'].textContent,/请点播放器/);
});

test('course items exit replacement mode, save separate progress and resume after reopening', () => {
  const instance=app();
  const first={url:'https://example.com/__local_hls__/'+'a'.repeat(64)+'/playlist.m3u8',title:'s1-w1-1',playlistDuration:537,selectItem:true};
  const second={url:'https://example.com/__local_hls__/'+'b'.repeat(64)+'/playlist.m3u8',title:'s1-w1-2',playlistDuration:561,selectItem:true};
  const choose=(target,detail)=>target.win.dispatchEvent(new CustomEvent('pwatest:import-source',{detail:{...detail}}));
  choose(instance,first); instance.els.video.metadata(537); instance.els.video.currentTime=123;
  instance.els['history-list'].children[0].children[3].children[1].fire('click');
  choose(instance,second);
  assert.equal(instance.saved().length,2);
  assert.equal(instance.saved().find(r=>r.title===first.title).position,123);
  instance.els.video.metadata(561); instance.els.video.currentTime=45; instance.els.video.pause();
  const reopened=app(JSON.stringify(instance.saved()));
  choose(reopened,first); reopened.els.video.metadata(537);
  assert.equal(reopened.els.video.currentTime,123);
  assert.equal(reopened.saved().find(r=>r.title===second.title).position,45);
  assert.equal(reopened.saved().length,2);
});

function chooseLocal(instance, file = { name: 'english-s1-w1-1.mp4', type: 'video/mp4', size: 1024 }) {
  instance.els['local-video-file'].files = file ? [file] : [];
  instance.els['local-video-file'].fire('change');
}
test('local playback preserves link progress, never persists blob URLs or awards rewards', () => {
  const completions = [], imports = [];
  const instance = app(null, false, { launch(){}, imported(r){imports.push(r.id);}, completed(r){completions.push(r.id);} });
  instance.els['import-form'].fire('submit');
  instance.els.video.metadata(); instance.els.video.currentTime = 37;
  chooseLocal(instance);
  assert.match(instance.els.video.src, /^blob:/);
  assert.equal(instance.els.video.plays, 2);
  assert.equal(instance.saved().length, 1);
  assert.equal(instance.saved()[0].position, 37);
  assert.equal(instance.els['direct-video'].hidden, true);
  instance.els.video.metadata(); instance.els.video.ended = true; instance.els.video.fire('ended');
  assert.equal(completions.length, 0); assert.equal(imports.length, 1);
  assert.equal(instance.saved()[0].position, 37);
  assert(!JSON.stringify(instance.saved()).includes('blob:'));
});
test('local selection cancel and invalid files leave current playback intact', () => {
  const instance = app(); chooseLocal(instance);
  const src = instance.els.video.src;
  chooseLocal(instance, null);
  chooseLocal(instance, { name: 'list.m3u8', type: '', size: 123 });
  chooseLocal(instance, { name: 'empty.mp4', type: 'video/mp4', size: 0 });
  assert.equal(instance.els.video.src, src); assert.equal(instance.els.video.plays, 1);
  assert.equal(instance.revoked.length, 0);
  assert.match(instance.els['local-video-status'].textContent, /非空/);
});
test('replacing a local file releases old URL; restart and bfcache retain it', () => {
  const instance = app(); chooseLocal(instance);
  const first = instance.els.video.src;
  instance.els.restart.fire('click'); assert.equal(instance.revoked.length, 0);
  chooseLocal(instance); assert.deepEqual(instance.revoked, [first]);
  const second = instance.els.video.src;
  const cached = new Event('pagehide'); cached.persisted = true;
  instance.win.dispatchEvent(cached); assert.deepEqual(instance.revoked, [first]);
  instance.els['import-form'].fire('submit');
  assert.deepEqual(instance.revoked, [first, second]);
  chooseLocal(instance); const last = instance.els.video.src;
  instance.win.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(instance.revoked, [first, second, last]);
});
test('local files report format failures and offline playback without expired-link guidance', () => {
  const instance = app(); chooseLocal(instance);
  instance.win.dispatchEvent(new Event('offline'));
  assert.match(instance.els['player-status'].textContent, /本地视频可继续/);
  instance.els.video.error = { code: 4 }; instance.els.video.fire('error');
  assert.match(instance.els['player-status'].textContent, /编码不受/);
  assert.doesNotMatch(instance.els['player-status'].textContent, /链接可能过期/);
});
