// Offline host harness. Root execute is simulated; no TV or real preference read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { Linter } from 'eslint';
const require = createRequire(import.meta.url);
const shard = require('../vetro/cleanframe-art/index.js');
const PHOTO = '/opt/usr/home/owner/apps_rw/org.tizen.art-app/shared/trusted/data/my_photo/';
const KEY = 'ArtLatestFullScreenData';
const jpeg = readFileSync(new URL('fixtures/art-test.jpg', import.meta.url));
const dimensions = shard.jpegSize(jpeg);
const content = (id = 'MY_TEST', patch = {}) => ({ ContentID: id, ImagePath: PHOTO + id + '.jpg', ImageWidth: dimensions.width, ImageHeight: dimensions.height, PhotoFilter: 'None', UserMatteType: '', ...patch });
function pref(c = content(), extra = {}) {
  const header = Buffer.alloc(4 + KEY.length + 4);
  header.writeUInt32LE(KEY.length); header.write(KEY, 4); header.writeUInt32LE(1, 4 + KEY.length);
  return Buffer.concat([header, Buffer.from(JSON.stringify({ Content: c, SecretKeys: 'NEVER_RETURN_THIS', ...extra })), Buffer.from([0])]);
}
async function freePort() {
  const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port;
}
function get(port, path = '/current.json', origin = 'null', method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path, method, agent: false, headers: origin === undefined ? {} : { Origin: origin } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }); request.on('error', reject); request.end();
  });
}
async function harness(run) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-art-'))), port = await freePort();
  let input = pref(), image = jpeg, hold, calls = [], afterCopy, executeError = false, settingsImpl = () => Promise.reject(new Error('no Art channel'));
  const bridge = shard({ dir, artSettings: timeout => settingsImpl(timeout), config: { get: () => ({ port }) }, execute: async (cmd, timeout) => {
    calls.push(cmd); assert.equal(timeout, 4000);
    if (executeError) return { stdout: 'PRIVATE OUTPUT', stderr: 'PRIVATE KEYS', exit_code: 1, timed_out: true };
    if (hold) await hold;
    if (cmd.startsWith('head -c 65537 ')) return { stdout: input.toString('base64'), stderr: '', exit_code: 0, timed_out: false };
    assert.match(cmd, /^set -e; test ! -L /); assert.ok(!cmd.includes('base64'));
    const quoted = [...cmd.matchAll(/'([^']*)'/g)].map(m => m[1]);
    const target = quoted.find(p => /copy-\d+-\d+\.tmp$/.test(p));
    assert.ok(target.startsWith(dir + '/art-cache/'));
    writeFileSync(target, image, { mode: 0o600, flag: 'wx' }); chmodSync(target, 0o600);
    if (afterCopy) afterCopy();
    return { stdout: '', stderr: '', exit_code: 0, timed_out: false };
  } });
  try { await bridge.start(); await run({ bridge, port, dir, calls, setInput: v => { input = v; }, setImage: v => { image = v; }, setHold: v => { hold = v; }, onCopy: fn => { afterCopy = fn; }, failExecute: () => { executeError = true; }, setSettings: fn => { settingsImpl = fn; } }); }
  finally { await bridge.stop(); rmSync(dir, { recursive: true, force: true }); }
}
test('typed preference parsing returns only allowlisted metadata', () => {
  assert.deepEqual(shard.parsePreference(pref()), { contentId: 'MY_TEST', width: dimensions.width, height: dimensions.height });
  assert.deepEqual(shard.parsePreference(pref().subarray(0, -1)), shard.parsePreference(pref()));
  const wrongSeparator = Buffer.concat([pref().subarray(0, 27), Buffer.from([0]), pref().subarray(27)]);
  assert.throws(() => shard.parsePreference(wrongSeparator));
  for (const bytes of [Buffer.alloc(0), Buffer.from('{"Content":{}}'), pref().subarray(0, 30), Buffer.concat([Buffer.from('junk{'), pref()]), Buffer.alloc(65537)]) assert.throws(() => shard.parsePreference(bytes));
  for (const [offset, value] of [[0, 24], [4, 1], [4 + KEY.length, 2], [4 + KEY.length + 1, 2]]) {
    const corrupt = pref(); corrupt[offset] = value; assert.throws(() => shard.parsePreference(corrupt));
  }
  for (const patch of [{ ImageWidth: '1920' }, { ImageHeight: -1 }, { ImageWidth: 1.2 }, { ImageHeight: 100000 }, { PhotoFilter: 'Warm' }, { UserMatteType: 'shadowbox' }, { ImagePath: '/etc/passwd' }]) assert.throws(() => shard.parsePreference(pref(content('MY_TEST', patch))));
  assert.throws(() => shard.parsePreference(pref(null)));
  assert.throws(() => shard.parsePreference(pref(content(), { Content: [] })));
});
test('Art picture settings keep only bounded brightness and colour temperature', () => {
  const list = [{ item: 'brightness', value: '5', min: '0', max: '10' }, { item: 'color_temperature', value: '-3', min: '-5', max: '5' }, { item: 'motion_timer', value: '15' }];
  assert.deepEqual(shard.parseSettings(JSON.stringify(list)), { brightness: 5, colorTemperature: -3 });
  assert.deepEqual(shard.parseSettings([{ item: 'color_temperature', value: 4 }, { item: 'brightness', value: '99' }]), { colorTemperature: 4 });
  for (const bad of ['not json', '{}', JSON.stringify([{ item: 'brightness', value: '2' }]), JSON.stringify([{ item: 'color_temperature', value: '6' }]), JSON.stringify([{ item: 'color_temperature', value: '1.5' }]), JSON.stringify([{ item: 'color_temperature', value: null }])]) assert.throws(() => shard.parseSettings(bad));
  const frame = Buffer.concat([Buffer.from([129, 5]), Buffer.from('hello'), Buffer.from([129])]);
  const parsed = shard.wsFrames(frame);
  assert.equal(parsed.frames.length, 1); assert.equal(parsed.frames[0].data.toString(), 'hello'); assert.equal(parsed.rest.length, 1);
  assert.throws(() => shard.wsFrames(Buffer.from([129, 127, 0, 0, 0, 0, 0, 2, 0, 0])));
  const clients = [{ id: 'art-app-1', isHost: true, attributes: { name: null } }, { id: 'me', isHost: true, attributes: { name: 'Q2xlYW5GcmFtZQ==' } }, { id: 'phone', isHost: false, attributes: { name: null } }];
  assert.equal(shard.artHost({ id: 'me', clients }), 'art-app-1');
  assert.equal(shard.artHost({ id: 'me', clients: clients.slice(1) }), null);
  assert.equal(shard.artHost({ id: 'me', clients: [{ id: 'bad id;', isHost: true }] }), null);
});
test('current.json never waits for Art settings, then reports the last good value', async () => {
  await harness(async ({ port, setSettings }) => {
    let reads = 0, release;
    setSettings(timeout => { reads++; assert.equal(timeout, 8000); return new Promise(r => { release = () => r({ brightness: 5, colorTemperature: 3 }); }); });
    let res = await get(port);
    assert.equal(res.status, 200); assert.equal(JSON.parse(res.body).look, undefined);
    release(); await new Promise(r => setTimeout(r, 20));
    res = await get(port);
    assert.deepEqual(JSON.parse(res.body).look, { brightness: 5, colorTemperature: 3 });
    assert.equal(reads, 1);
    setSettings(() => Promise.reject(new Error('channel closed')));
    await new Promise(r => setTimeout(r, 3100));
    await get(port); await new Promise(r => setTimeout(r, 20));
    res = await get(port);
    assert.equal(res.status, 200); assert.deepEqual(JSON.parse(res.body).look, { brightness: 5, colorTemperature: 3 });
    assert.deepEqual(Object.keys(JSON.parse(res.body)).sort(), ['contentId', 'height', 'imageUrl', 'look', 'revision', 'width']);
  });
});
test('uploaded ID/path allowlist rejects injection, aliases and traversal', () => {
  for (const id of ['../MY_A', 'MY_..', 'MY_A\n', 'MY_a;id', 'MY_a$(id)', "MY_a'b", 'STORE_A', 'MY_' + 'a'.repeat(65)]) assert.throws(() => shard.imagePath(id, PHOTO + id + '.jpg'));
  for (const suffix of ['.JPG', '.jpeg', '.jpg/../a', '.jpg?x', '.jpg\0']) assert.throws(() => shard.imagePath('MY_A', PHOTO + 'MY_A' + suffix));
  assert.equal(shard.imagePath('MY_A', PHOTO + 'MY_A.jpg'), PHOTO + 'MY_A.jpg');
});
test('bounded JPEG marker parsing rejects corruption', () => {
  assert.ok(dimensions.width > 0);
  for (const bytes of [Buffer.alloc(5), Buffer.concat([jpeg.subarray(0, 10), Buffer.from([255, 217])]), Buffer.alloc(12 * 1024 * 1024 + 1), Buffer.from('not a jpeg image')]) assert.throws(() => shard.jpegSize(bytes));
});
test('loopback HTTP contract, opaque CORS, immutable revisions, coalescing and restart', async () => {
  await harness(async h => {
    let release; h.setHold(new Promise(r => { release = r; }));
    const pending = [get(h.port), get(h.port)];
    await new Promise(r => setImmediate(r)); release();
    const [a, b] = await Promise.all(pending); h.setHold(null);
    assert.equal(a.status, 200); assert.deepEqual(a, b);
    const meta = JSON.parse(a.body); assert.deepEqual(Object.keys(meta).sort(), ['contentId','height','imageUrl','revision','width']);
    assert.equal(h.calls.length, 3); assert.equal(a.headers['access-control-allow-origin'], 'null'); assert.equal(a.headers['cache-control'], 'no-store');
    const image = await get(h.port, meta.imageUrl); assert.deepEqual(image.body, jpeg); assert.match(image.headers['cache-control'], /immutable/);
    assert.equal((await get(h.port, '/art/' + '0'.repeat(64) + '/image.jpg')).status, 404);
    assert.equal((await get(h.port, '/art/../config.json')).status, 404);
    for (const origin of ['https://example.com', 'http://127.0.0.1', 'ftp://example.com', 'null.evil']) assert.equal((await get(h.port, '/current.json', origin)).status, 403);
    assert.equal((await get(h.port, '/current.json', 'widget://cleanframe')).status, 200);
    assert.equal((await get(h.port, '/current.json', 'null', 'POST')).status, 405);
    await h.bridge.stop(); assert.equal(h.bridge.status().running, false); await h.bridge.start();
    assert.equal((await get(h.port, meta.imageUrl)).status, 404);
    assert.equal((await get(h.port)).status, 200);
    assert.ok(!JSON.stringify(h.bridge.status()).includes('NEVER_RETURN_THIS'));
  });
});
test('changed selection during root copy fails closed and removes temporary data', async () => {
  await harness(async h => {
    h.onCopy(() => h.setInput(pref(content('MY_OTHER'))));
    const response = await get(h.port); assert.equal(response.status, 503);
    assert.equal(response.body.toString(), '{"error":"Art unavailable"}');
    assert.deepEqual(readdirSync(join(h.dir, 'art-cache')), []);
  });
});
test('stop destroys sockets and invalidates an in-flight refresh; restart waits for cleanup', async () => {
  await harness(async h => {
    let release; h.setHold(new Promise(r => { release = r; }));
    const pending = get(h.port).catch(e => e.code);
    while (!h.calls.length) await new Promise(r => setImmediate(r));
    await h.bridge.stop(); const restarting = h.bridge.start(); release(); h.setHold(null);
    await pending; await restarting;
    assert.equal((await get(h.port)).status, 200);
    assert.equal(readdirSync(join(h.dir, 'art-cache')).filter(f => f.endsWith('.tmp')).length, 0);
  });
});
test('bad image or execute failure never publishes metadata', async () => {
  await harness(async h => { h.setImage(Buffer.from('bad')); assert.equal((await get(h.port)).status, 503); });
  await harness(async h => { h.failExecute(); const response = await get(h.port); assert.equal(response.status, 503); assert.ok(!response.body.includes('PRIVATE')); });
});
test('stop before listen settles its start promise and leaves the port reusable', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-art-'))), port = await freePort();
  const bridge = shard({ dir, config: { get: () => ({ port }) }, execute: () => Promise.reject(Error('Not expected')) });
  try {
    const starting = bridge.start().catch(e => e.message); await bridge.stop();
    assert.equal(await starting, 'Bridge stopped'); await bridge.start(); assert.equal(bridge.status().running, true);
  } finally { await bridge.stop(); rmSync(dir, { recursive: true, force: true }); }
});
test('oversized JPEG, dimension mismatch and bounded revision eviction fail safely', async () => {
  await harness(async h => {
    h.setImage(Buffer.alloc(12 * 1024 * 1024 + 1)); assert.equal((await get(h.port)).status, 503);
    h.setImage(jpeg); h.setInput(pref(content('MY_TEST', { ImageWidth: dimensions.width + 1 }))); assert.equal((await get(h.port)).status, 503);
    h.setInput(pref()); const a = JSON.parse((await get(h.port)).body);
    await new Promise(r => setTimeout(r, 1510)); h.setInput(pref(content('MY_B'))); const b = JSON.parse((await get(h.port)).body);
    await new Promise(r => setTimeout(r, 1510)); h.setInput(pref(content('MY_C'))); const c = JSON.parse((await get(h.port)).body);
    assert.equal((await get(h.port, a.imageUrl)).status, 404); assert.equal((await get(h.port, b.imageUrl)).status, 200); assert.equal((await get(h.port, c.imageUrl)).status, 200);
    assert.equal(readdirSync(join(h.dir, 'art-cache')).length, 2);
  });
});
test('invalid configured ports never open a listener', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-art-')));
  try {
    for (const port of ['abc', Infinity, 0, 80, 65536, 8643.5]) {
      const bridge = shard({ dir, config: { get: () => ({ port }) }, execute: () => { throw Error('Unexpected execute'); } });
      await assert.rejects(bridge.start(), /Invalid bridge port/); assert.equal(bridge.status().running, false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('ES5 shard and deterministic bounded text bundle', () => {
  const source = readFileSync(new URL('../vetro/cleanframe-art/index.js', import.meta.url), 'utf8');
  const messages = new Linter().verify(source, [{ languageOptions: { ecmaVersion: 5, sourceType: 'script' } }]);
  assert.deepEqual(messages, []);
  const run = () => { const r = spawnSync(process.execPath, ['scripts/pack-art-bridge.mjs']); assert.equal(r.status, 0); return readFileSync(new URL('../dist/cleanframe-art.vplugin', import.meta.url)); };
  const first = run(); assert.deepEqual(run(), first);
  const b = JSON.parse(first); assert.equal(b.format, 'vetro-plugin'); assert.equal(b.manifest.apiVersion, 1); assert.deepEqual(b.manifest.permissions, ['exec']);
  assert.deepEqual(Object.keys(b.files), ['index.js']); assert.equal(b.files['index.js'], source); assert.ok(first.length < 512 * 1024);
});

test('TV interface mode refuses other LAN clients and nonlocal bindings', () => {
  assert.equal(shard.listenAddress({}), '127.0.0.1');
  assert.equal(shard.localClient('192.168.50.10', '192.168.50.10'), true);
  assert.equal(shard.localClient('192.168.50.10', '::ffff:192.168.50.10'), true);
  assert.equal(shard.localClient('192.168.50.10', '192.168.50.11'), false);
  assert.equal(shard.localClient('192.168.50.10', '127.0.0.1'), false);
  for (const address of ['0.0.0.0', 'example.com', '198.51.100.123', '::']) assert.throws(() => shard.listenAddress({ address }), /Invalid bridge address/);
});
