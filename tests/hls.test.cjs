const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../hls-core.js');
const media = n => '#EXTM3U\n#EXT-X-TARGETDURATION:10\n' + Array.from({length:n}, (_,i) => '#EXTINF:10,\nhttps://media.example/' + i + '.ts').join('\n') + '\n#EXT-X-ENDLIST\n';

test('counts real segment durations; a 100 second preview never becomes a full video', () => {
  assert.equal(Core.inspect(media(10)).duration, 100);
  assert.equal(Core.inspect(media(51)).duration, 510);
  assert.equal(Core.normalize(media(10)).duration, 100);
});
test('master playlists are identified, never concatenated or treated as video segments', () => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\n480.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200000\n720.m3u8';
  assert.equal(Core.inspect(master).kind, 'master');
  assert.throws(() => Core.normalize(master), /清晰度目录/);
});
test('rejects error responses, malformed media and incomplete live snapshots', () => {
  for (const text of ['{"errno":71}', '<html>login</html>', '#EXTM3U\n', '#EXTM3U\n#EXTINF:NaN,\na.ts', '#EXTM3U\n#EXTINF:10,\n#EXT-X-ENDLIST', '#EXTM3U\na.ts']) assert.throws(() => Core.inspect(text));
  assert.throws(() => Core.normalize(media(5).replace('#EXT-X-ENDLIST', '')), /未结束/);
});
test('preserves byte ranges and resolves segments, keys and initialization maps', () => {
  const text = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="50@0"\n#EXTINF:8.5,\n#EXT-X-BYTERANGE:100@50\nseg.mp4?token=example\n#EXT-X-DISCONTINUITY\n#EXTINF:9.25,\nseg2.mp4\n#EXT-X-ENDLIST';
  assert.throws(() => Core.normalize(text), /相对地址/);
  const result = Core.normalize(text, 'https://media.example/folder/list.m3u8');
  assert.equal(result.duration, 17.75);
  assert.match(result.body, /URI="https:\/\/media.example\/folder\/key.bin"/);
  assert.match(result.body, /URI="https:\/\/media.example\/folder\/init.mp4",BYTERANGE="50@0"/);
  assert.match(result.body, /#EXT-X-BYTERANGE:100@50/);
  assert.match(result.body, /#EXT-X-DISCONTINUITY/);
  assert.match(result.body, /https:\/\/media.example\/folder\/seg.mp4\?token=example/);
});
test('blocks unsafe URLs, credentials and unresolved variable substitutions', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/video', 'http://media.example/a', 'https://user:password@media.example/a']) {
    assert.throws(() => Core.normalize('#EXTM3U\n#EXTINF:10,\n' + url + '\n#EXT-X-ENDLIST'), /HTTPS/);
  }
  assert.throws(() => Core.normalize(media(1).replace('0.ts','{$name}.ts')), /变量/);
});
