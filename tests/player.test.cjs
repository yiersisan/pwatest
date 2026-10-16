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
function app(initial = null, storageBlocked = false) {
  const els = Object.fromEntries([...fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').matchAll(/id="([^"]+)"/g)].map(x => [x[1], new Element()]));
  els.video = new Video();
  const doc = new EventTarget(); doc.getElementById = id => els[id]; doc.createElement = tag => new Element(tag);
  const win = new EventTarget(); win.PlayerCore = Core;
  const store = new Map(initial ? [[Core.STORAGE_KEY, initial]] : []);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), {
    window: win, document: doc, navigator: { onLine: true }, URL, Date,
    localStorage: { getItem: key => { if (storageBlocked) throw Error('blocked'); return store.get(key); }, setItem: (key, value) => { if (storageBlocked) throw Error('blocked'); store.set(key, value); } },
    setTimeout: () => 1, clearTimeout() {}
  });
  return { els, win, store, saved: () => JSON.parse(store.get(Core.STORAGE_KEY) || '[]') };
}
test('default import, pause saving, reopening, resume, restart, and deletion', () => {
  const first = app();
  assert.match(first.els['video-url'].value, /fid=20690952231959/);
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
