// Rebuild the catalogue offline from the sanitized, actually retrieved source index.
// No cookies, signed thumbnail links or fabricated media playlists are stored here.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Hls = require('../hls-core.js');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'assets/video/english/s1');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'source-index.json'), 'utf8'));
const previousPath = path.join(dir, 'catalog.json');
const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, 'utf8')).videos : [];
const seen = new Set();
const videos = index.files.map(file => {
  const weeks = [...file.path.matchAll(/第(\d+)周/g)];
  const number = /^(\d+)\.mp4$/i.exec(file.name);
  if (!weeks.length || !number) throw Error('Unmapped source file: ' + file.path);
  // Some week 28–30 lessons are nested inside week 26. The closest week wins.
  const week = Number(weeks.at(-1)[1]), order = Number(number[1]);
  const name = `s1-w${week}-${order}`, id = `english-${name}`;
  if (seen.has(id)) throw Error('Duplicate lesson mapping: ' + id);
  seen.add(id);
  const expectedPath = `w${week}/${name}.m3u8`;
  const local = path.join(dir, expectedPath);
  let playlist = null;
  if (fs.existsSync(local)) {
    const body = fs.readFileSync(local, 'utf8');
    const info = Hls.inspect(body);
    if (info.kind !== 'media' || !info.complete) throw Error('Invalid media playlist: ' + id);
    Hls.normalize(body);
    const urls = info.lines.filter(line => line.startsWith('https://')).map(line => new URL(line));
    if (!urls.length || !urls.every(url => url.pathname.includes(file.contentFingerprint))) {
      throw Error('Playlist source fingerprint mismatch: ' + id);
    }
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const old = previous.find(video => video.id === id)?.playlist;
    playlist = { path: expectedPath, durationSeconds: info.duration, segmentCount: info.segments,
      sha256, revision: old ? old.revision + Number(old.sha256 !== sha256) : 1,
      provenance: urls.some(url => url.searchParams.get('scene_type') === 'streaming_personal') ? 'user-provided-personal-manifest' : 'existing-user-provided-manifest', validation: { structure: 'passed', sourceIdentity: 'fingerprint-matched', ipadPlayback: 'pending', currentSegments: 'not-rechecked' } };
  }
  const sourceURL = new URL(index.source.shareURL);
  sourceURL.searchParams.set('fid', file.fileId);
  sourceURL.searchParams.set('fpath', file.path);
  return { id, name, courseId: 'english', subject: 'english', stage: 's1', week, order,
    source: { provider: 'baidu', fileId: file.fileId, name: file.name, path: file.path, sizeBytes: file.sizeBytes, pageURL: sourceURL.href },
    expectedPlaylist: expectedPath,
    playlistStatus: playlist ? 'saved-needs-playback-validation' : 'missing-full-manifest', playlist,
    ...(weeks.length > 1 ? { note: '按最内层周目录归类；保留网盘原始嵌套路径。' } : {}) };
}).sort((a,b) => a.week-b.week || a.order-b.order);
const catalogue = { schemaVersion: 1, id: 'english-s1', subject: 'english', stage: 's1',
  collectedAt: index.collectedAt, source: index.source,
  coverage: { directoryListing: 'complete-for-accessible-share', weeks: new Set(videos.map(v=>v.week)).size, videos: videos.length,
    savedFullManifests: videos.filter(v=>v.playlist).length, missingFullManifests: videos.filter(v=>!v.playlist).length,
    note: '清单存在不代表当前分片仍可播放。源站隐藏或过滤的文件不在本目录内。' },
  videos };
fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(catalogue, null, 2) + '\n');
console.log(JSON.stringify(catalogue.coverage));
