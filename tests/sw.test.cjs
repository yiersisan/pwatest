const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const scope = 'https://example.github.io/pwatest/';

function setup() {
  const stores = new Map();
  const handlers = {};
  let online = true;
  let body = 'original';
  let status = 200;
  let failWrites = false;
  const key = request => typeof request === 'string' ? request : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(requests) {
          for (const request of requests) entries.set(key(request), new Response(body));
        },
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) {
          if (failWrites) throw new Error('quota exceeded');
          entries.set(key(request), response.clone());
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), {
    self: { registration: { scope }, addEventListener: (name, fn) => handlers[name] = fn,
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, Request, Response, URL, console: { warn() {} },
    fetch: async () => { if (!online) throw new Error('offline'); return new Response(body, { status }); }
  });
  return {
    caches, stores,
    setNetwork(value, text = body, code = 200) { online = value; body = text; status = code; },
    failWrites() { failWrites = true; },
    lifecycle(name) { let result; handlers[name]({ waitUntil(p) { result = p; } }); return result; },
    fetch(url, method = 'GET') { let result; handlers.fetch({ request: new Request(url, { method }), respondWith(p) { result = p; } }); return result; }
  };
}

test('first installation supports offline root and manifest start URL', async () => {
  const app = setup(); await app.lifecycle('install'); app.setNetwork(false);
  assert.equal(await (await app.fetch(scope)).text(), 'original');
  assert.equal(await (await app.fetch(scope + 'index.html')).text(), 'original');
});

test('online updates replace both cached page URLs for the next offline visit', async () => {
  const app = setup(); await app.lifecycle('install'); app.setNetwork(true, 'updated');
  assert.equal(await (await app.fetch(scope)).text(), 'updated');
  app.setNetwork(false);
  assert.equal(await (await app.fetch(scope + 'index.html')).text(), 'updated');
  assert.equal(await (await app.fetch(scope)).text(), 'updated');
});

test('server failures do not overwrite usable offline content', async () => {
  const app = setup(); await app.lifecycle('install'); app.setNetwork(true, 'error', 503);
  assert.equal(await (await app.fetch(scope)).text(), 'original');
});

test('cache cleanup preserves other applications', async () => {
  const app = setup();
  await app.caches.open(`pwatest-${scope}-v1`);
  await app.caches.open('another-app-v1');
  await app.lifecycle('install'); await app.lifecycle('activate');
  assert(!app.stores.has(`pwatest-${scope}-v1`));
  assert(app.stores.has('another-app-v1'));
});

test('quota errors still return fresh network content', async () => {
  const app = setup(); await app.lifecycle('install'); app.failWrites(); app.setNetwork(true, 'fresh');
  assert.equal(await (await app.fetch(scope)).text(), 'fresh');
});

test('does not intercept other sites, videos, or writes', () => {
  const app = setup();
  assert.equal(app.fetch('https://other.example/video.mp4'), undefined);
  assert.equal(app.fetch(scope + 'video.mp4'), undefined);
  assert.equal(app.fetch(scope, 'POST'), undefined);
});

test('manifest, page scripts and icon sizes are valid', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.display, 'standalone');
  for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['favicon.png', 32]]) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});
