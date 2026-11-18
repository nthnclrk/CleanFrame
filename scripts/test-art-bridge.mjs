// Offline host harness. Root execute is simulated; no TV or real preference read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, chmodSync, realpathSync, statSync, lstatSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { createHash } from 'node:crypto';
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
function get(port, path = '/current.json', origin = 'null', method = 'GET', extra = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path, method, agent: false, headers: { ...(origin === undefined ? {} : { Origin: origin }), ...extra } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }); request.on('error', reject); request.end();
  });
}
async function harness(run, options = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-art-'))), port = await freePort();
  let input = pref(), image = jpeg, hold, calls = [], afterCopy, executeError = false, settingsImpl = () => Promise.reject(new Error('no Art channel'));
  const { config = {}, ...ctx } = options;
  const bridge = shard({ dir, artSettings: timeout => settingsImpl(timeout), config: { get: () => ({ port, ...config }) }, ...ctx, execute: async (cmd, timeout) => {
    calls.push(cmd); assert.equal(timeout, 4000);
    if (executeError) return { stdout: 'PRIVATE OUTPUT', stderr: 'PRIVATE KEYS', exit_code: 1, timed_out: true };
    if (hold) await hold;
    if (cmd.startsWith('head -c 65537 ')) return { stdout: input.toString('base64'), stderr: '', exit_code: 0, timed_out: false };
    assert.match(cmd, /^set -e; test ! -L /); assert.ok(!cmd.includes('base64'));
    if (cmd.includes('copy-')) { assert.ok(!cmd.includes('chmod')); assert.match(cmd, /; chown -h \d+:\d+ '/); } // Root never follows a swapped-in symlink.
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
test('current.json waits briefly for a stale Art look, then reports the last good value', async () => {
  await harness(async ({ port, setSettings }) => {
    let reads = 0, release;
    // A slow Art channel: the reply waits at most lookWaitMs (here 150 ms) and carries no look.
    setSettings(timeout => { reads++; assert.equal(timeout, 8000); return new Promise(r => { release = () => r({ brightness: 5, colorTemperature: 3 }); }); });
    let t = Date.now(), res = await get(port);
    assert.equal(res.status, 200); assert.equal(JSON.parse(res.body).look, undefined);
    assert.ok(Date.now() - t >= 140 && Date.now() - t < 3000, 'waited ' + (Date.now() - t)); // Far below the 8 s read; loose for busy runners.
    // The read is coalesced: a second request joins it instead of starting another.
    const second = get(port); await sleep(20); release();
    assert.deepEqual(JSON.parse((await second).body).look, { brightness: 5, colorTemperature: 3 });
    assert.equal(reads, 1);
    res = await get(port);
    assert.deepEqual(JSON.parse(res.body).look, { brightness: 5, colorTemperature: 3 }); assert.equal(reads, 1);
    // Stale again and the channel fails: the last good look is kept.
    setSettings(() => Promise.reject(new Error('channel closed')));
    await sleep(700);
    res = await get(port);
    assert.equal(res.status, 200); assert.deepEqual(JSON.parse(res.body).look, { brightness: 5, colorTemperature: 3 });
    assert.deepEqual(Object.keys(JSON.parse(res.body)).sort(), ['contentId', 'height', 'imageUrl', 'look', 'revision', 'width']);
  }, { lookMaxAgeMs: 600, lookWaitMs: 150 }); // Windows wide enough for a busy CI runner.
});
test('a changed Art look shows on the first current.json when the read answers within 800 ms', async () => {
  await harness(async ({ port, setSettings }) => {
    let value = { brightness: 5, colorTemperature: 3 }, reads = 0;
    setSettings(() => { reads++; return sleep(100).then(() => value); });
    assert.deepEqual(JSON.parse((await get(port)).body).look, { brightness: 5, colorTemperature: 3 });
    value = { brightness: 2, colorTemperature: -1 };
    await sleep(700);
    assert.deepEqual(JSON.parse((await get(port)).body).look, { brightness: 2, colorTemperature: -1 });
    assert.equal(reads, 2);
  }, { lookMaxAgeMs: 600 });
  // The real 800 ms limit: a 4 s read never holds the reply past it (loose upper bound for busy runners).
  await harness(async ({ port, setSettings }) => {
    setSettings(() => sleep(4000).then(() => ({ brightness: 5, colorTemperature: 0 })));
    const t = Date.now(), res = await get(port), took = Date.now() - t;
    assert.equal(JSON.parse(res.body).look, undefined); assert.ok(took >= 750 && took < 3000, 'took ' + took);
  });
});
test('MQTT packets are framed, bounded and parsed for the doorbell topic', () => {
  const topic = Buffer.from('vetro/cleanframe/doorbell'), payload = Buffer.from('ring');
  const body = Buffer.concat([Buffer.from([0, topic.length]), topic, payload]);
  const publish = shard.mqttPacket(0x30, body), ack = Buffer.from([0x20, 2, 0, 0]);
  const parsed = shard.mqttPackets(Buffer.concat([ack, publish, publish.subarray(0, 3)]));
  assert.equal(parsed.packets.length, 2); assert.equal(parsed.rest.length, 3);
  assert.equal(parsed.packets[0].type, 2);
  assert.deepEqual(shard.mqttPublish(parsed.packets[1]), { topic: 'vetro/cleanframe/doorbell', payload: 'ring' });
  // QoS 1 publishes carry a packet id before the payload.
  const q1 = shard.mqttPackets(shard.mqttPacket(0x32, Buffer.concat([Buffer.from([0, topic.length]), topic, Buffer.from([0, 7]), Buffer.from('clear')]))).packets[0];
  assert.deepEqual(shard.mqttPublish(q1), { topic: 'vetro/cleanframe/doorbell', payload: 'clear' });
  const big = shard.mqttPacket(0x30, Buffer.alloc(200)); assert.equal(big[1], 0xC8); assert.equal(big[2], 1);
  assert.throws(() => shard.mqttPackets(Buffer.from([0x30, 0xff, 0xff, 0xff, 0x7f])));
});
test('an unchanged Art selection reuses the cached JPEG without another copy', async () => {
  await harness(async ({ port, calls }) => {
    const first = JSON.parse((await get(port)).body);
    const copies = () => calls.filter(c => c.startsWith('set -e;')).length;
    assert.equal(copies(), 1);
    await sleep(60);
    const again = JSON.parse((await get(port)).body);
    assert.equal(again.revision, first.revision); assert.equal(copies(), 1);
    assert.equal((await get(port, again.imageUrl)).status, 200);
  }, { reuseMs: 50 });
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
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.deepEqual(a.body, b.body); // Not the Date header, which can cross a second.
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
    await sleep(60); h.setInput(pref(content('MY_B'))); const b = JSON.parse((await get(h.port)).body);
    await sleep(60); h.setInput(pref(content('MY_C'))); const c = JSON.parse((await get(h.port)).body);
    assert.equal((await get(h.port, a.imageUrl)).status, 404); assert.equal((await get(h.port, b.imageUrl)).status, 200); assert.equal((await get(h.port, c.imageUrl)).status, 200);
    assert.equal(readdirSync(join(h.dir, 'art-cache')).length, 2);
  }, { reuseMs: 50 });
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
  assert.ok(['index.js', 'pip.b64.json'].join() === Object.keys(b.files).join() || Object.keys(b.files).join() === 'index.js'); assert.equal(b.files['index.js'], source); assert.ok(first.length < 512 * 1024);
  if (b.files['pip.b64.json']) assert.deepEqual(Object.keys(JSON.parse(b.files['pip.b64.json'])).sort(), ['cleanframe-pip.dll', 'cleanframe-pip.runtimeconfig.json', 'res/frame.png', 'res/mask.png']);
});

test('TV interface mode refuses other LAN clients and nonlocal bindings', () => {
  assert.equal(shard.listenAddress({}), '127.0.0.1');
  assert.equal(shard.localClient('192.168.50.10', '192.168.50.10'), true);
  assert.equal(shard.localClient('192.168.50.10', '::ffff:192.168.50.10'), true);
  assert.equal(shard.localClient('192.168.50.10', '192.168.50.11'), false);
  assert.equal(shard.localClient('192.168.50.10', '127.0.0.1'), false);
  for (const address of ['0.0.0.0', 'example.com', '198.51.100.123', '::']) assert.throws(() => shard.listenAddress({ address }), /Invalid bridge address/);
});

/* ---------- Lights, doorbell PiP and MQTT lifecycle ---------- */
const sha256 = b => createHash('sha256').update(b).digest('hex');
const STREAM = 'http://192.168.1.2:1984/api/stream.mjpeg?src=doorbell&x=1';
const PIP = { 'cleanframe-pip.dll': Buffer.from('fake dll'), 'cleanframe-pip.runtimeconfig.json': Buffer.from('{"runtimeOptions":{}}'), 'res/frame.png': Buffer.from('frame'), 'res/mask.png': Buffer.from('mask') };
function withPip(dir) { writeFileSync(join(dir, 'pip.b64.json'), JSON.stringify(Object.fromEntries(Object.entries(PIP).map(([k, v]) => [k, v.toString('base64')])))); }
const ok = { stdout: '', stderr: '', exit_code: 0, timed_out: false };
// A bridge with a free port, a private temp dir and the given ctx overrides; always stopped and removed.
async function withBridge(options, run) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-art-'))), port = await freePort(), calls = [];
  const { config = {}, pip = true, execute = async () => ok, start = true, ...ctx } = options;
  if (pip) withPip(dir);
  const bridge = shard({ dir, config: { get: () => ({ port, ...config }) }, execute: async (cmd, timeout) => { calls.push(cmd); return execute(cmd, timeout); }, vetroMqttPath: join(dir, 'vetro-mqtt.json'), pipRoot: join(dir, 'pip-root'), ...ctx });
  try { if (start) await bridge.start(); await run({ bridge, port, dir, calls }); }
  finally { await bridge.stop(); rmSync(dir, { recursive: true, force: true }); }
}
async function server(handler) { const s = http.createServer(handler); await new Promise(r => s.listen(0, '127.0.0.1', r)); return s; }
const closeServer = s => new Promise(r => { s.closeAllConnections?.(); s.close(() => r()); });

test('/lights fires the fixed Vetro rule: 204, 429 when pressed again, 502 on failure or timeout', async () => {
  let mode = 'ok', seen = [];
  const upstream = await server((req, res) => {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      seen.push({ method: req.method, url: req.url, body });
      if (mode === 'ok') { res.writeHead(200); res.end('{}'); } else if (mode === 'fail') { res.writeHead(500); res.end(); }
      else { setTimeout(() => { res.writeHead(200); res.end(); }, 500); }
    });
  });
  try {
    await withBridge({ vetroPort: upstream.address().port, lightsTimeoutMs: 200, lightsIntervalMs: 800 }, async ({ port }) => {
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 204);
      assert.deepEqual(seen, [{ method: 'POST', url: '/remap/run', body: '{"type":"http","value":"cleanframe-lights"}' }]);
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 429);
      assert.equal(seen.length, 1);
      await sleep(850); mode = 'fail';
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 502);
      // A failure starts no rate limit: an immediate retry reaches Vetro again instead of a 429.
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 502); assert.equal(seen.length, 3);
      mode = 'ok';
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 204); assert.equal(seen.length, 4);
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 429);
      await sleep(850); mode = 'hang';
      const t = Date.now(), hung = get(port, '/lights', 'null', 'POST');
      await sleep(50);
      // A press while one is still running is refused, not sent twice.
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 429);
      assert.equal((await hung).status, 502); assert.ok(Date.now() - t < 1500);
      // A timeout is a failure too: the next press tries again.
      mode = 'ok'; assert.equal((await get(port, '/lights', 'null', 'POST')).status, 204);
    });
    // The default limit is 1.5 s after a success.
    await withBridge({ vetroPort: upstream.address().port }, async ({ port }) => {
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 204);
      await sleep(1000); assert.equal((await get(port, '/lights', 'null', 'POST')).status, 429);
    });
    // Nothing listening upstream.
    await withBridge({ vetroPort: await freePort() }, async ({ port }) => { assert.equal((await get(port, '/lights', 'null', 'POST')).status, 502); });
  } finally { await closeServer(upstream); }
});

test('/lights refuses a client other than the bound TV address', async (t) => {
  const lan = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
  if (!lan) { t.skip('no LAN IPv4 address'); return; }
  let hits = 0; const upstream = await server((req, res) => { hits++; res.writeHead(200); res.end(); });
  try {
    await withBridge({ config: { address: lan.address }, vetroPort: upstream.address().port }, async ({ port }) => {
      const status = await new Promise((resolve, reject) => {
        const r = http.request({ host: lan.address, port, path: '/lights', method: 'POST', localAddress: '127.0.0.1', agent: false, headers: { Origin: 'null' } }, res => { res.resume(); resolve(res.statusCode); });
        r.on('error', reject); r.end();
      });
      assert.equal(status, 403); assert.equal(hits, 0);
    });
  } finally { await closeServer(upstream); }
});

test('unpackPip writes private files, records their hashes and refuses a symlinked pip/', async () => {
  await withBridge({}, async ({ bridge, dir }) => {
    const out = join(dir, 'pip');
    assert.equal(bridge._test.pipDir(), out);
    assert.equal(statSync(out).mode & 0o777, 0o700); assert.equal(statSync(join(out, 'res')).mode & 0o777, 0o700);
    for (const [name, data] of Object.entries(PIP)) { assert.deepEqual(readFileSync(join(out, name)), data); assert.equal(lstatSync(join(out, name)).mode & 0o777, 0o600); }
    assert.deepEqual(bridge._test.pipHashes(), Object.fromEntries(Object.entries(PIP).map(([k, v]) => [k, sha256(v)])));
    // An old world-readable install, and a symlink planted for a file, are both replaced.
    chmodSync(join(out, 'res/frame.png'), 0o644); rmSync(join(out, 'res/mask.png')); symlinkSync('/etc/hosts', join(out, 'res/mask.png'));
    assert.equal(bridge._test.unpackPip(), true);
    assert.equal(lstatSync(join(out, 'res/frame.png')).mode & 0o777, 0o600);
    assert.ok(lstatSync(join(out, 'res/mask.png')).isFile()); assert.deepEqual(readFileSync(join(out, 'res/mask.png')), PIP['res/mask.png']);
  });
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-elsewhere-')));
  try {
    await withBridge({ start: false, config: { pip: { stream: STREAM } } }, async ({ bridge, dir, calls }) => {
      symlinkSync(elsewhere, join(dir, 'pip'));
      await bridge.start();
      assert.equal(bridge.status().doorbell.error, 'PiP unpack failed'); assert.equal(bridge._test.pipHashes(), null);
      assert.deepEqual(readdirSync(elsewhere), []);
      assert.equal(bridge._test.ring(), null); assert.equal(calls.length, 0);
    });
  } finally { rmSync(elsewhere, { recursive: true, force: true }); }
});

test('stream URLs need exactly four octets on a private network', async () => {
  const cases = { 'http://10.1.2:80/a': false, 'http://10.1.2.3.4:80/a': false, 'http://192.168.1:80/a': false, 'http://192.168.1.2.3:80/a': false, 'http://172.16.1:80/a': false,
    'http://10.1.2.3:80/a': true, 'http://192.168.1.2:1984/api/stream.mjpeg?src=x': true, 'http://172.31.0.1:80/a': true, 'http://172.32.0.1:80/a': false, 'http://8.8.8.8:80/a': false };
  for (const [stream, configured] of Object.entries(cases)) {
    const bridge = shard({ dir: tmpdir(), config: { get: () => ({ pip: { stream } }) }, execute: () => { throw Error('Unexpected execute'); } });
    assert.equal(bridge.status().doorbell.configured, configured, stream);
  }
  const cs = readFileSync(new URL('../native/doorbell-pip/Program.cs', import.meta.url), 'utf8');
  const pattern = new RegExp(/Regex\.IsMatch\(_url, @"([^"]+)"\)/.exec(cs)[1]);
  for (const [stream, configured] of Object.entries(cases)) assert.equal(pattern.test(stream), configured, 'Program.cs ' + stream);
});

// Runs ring()'s root command in a real sh with stub systemctl/systemd-run, so the verification itself is exercised.
function shellExecute(tools) {
  const bin = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-bin-'))), log = join(bin, 'started');
  for (const name of ['systemctl', 'systemd-run', ...(tools.includes('pkill') ? ['pkill'] : [])]) { writeFileSync(join(bin, name), '#!/bin/sh\necho "' + name + ' $*" >> ' + JSON.stringify(log) + '\n', { mode: 0o755 }); }
  for (const name of tools.filter(n => n !== 'pkill')) { const found = spawnSync('sh', ['-c', 'command -v ' + name]).stdout.toString().trim(); if (found) symlinkSync(found, join(bin, name)); }
  return { bin, log, killed: () => { try { return readFileSync(log, 'utf8').split('\n').filter(l => l.startsWith('pkill')); } catch { return []; } }, started: () => { try { return readFileSync(log, 'utf8').split('\n').filter(l => l.startsWith('systemd-run')); } catch { return []; } },
    execute: async cmd => { const r = spawnSync('/bin/sh', ['-c', cmd], { env: { PATH: bin } }); return { stdout: r.stdout.toString(), stderr: '', exit_code: r.status, timed_out: false }; } };
}

test('ring verifies the unpacked hashes as root, quotes the stream URL and reports failure', async () => {
  for (const hasher of ['sha256sum', 'openssl']) {
    const sh = shellExecute(['rm', 'cut', 'mkdir', 'cat', 'chmod', 'mv', 'pkill', hasher]);
    try {
      await withBridge({ config: { pip: { stream: STREAM, seconds: 12 } }, execute: sh.execute, ringIntervalMs: 50 }, async ({ bridge, dir, calls }) => {
        const out = join(dir, 'pip');
        assert.equal(await bridge._test.ring(), true, hasher);
        const cmd = calls[0];
        // Root copies into its own folder and verifies and runs only those copies.
        for (const [name, data] of Object.entries(PIP)) assert.ok(cmd.includes(`test "$(cfsum '${join(dir, 'pip-root', name)}')" = ${sha256(data)}`), name);
        assert.ok(cmd.includes("/usr/bin/dotnet '" + join(dir, 'pip-root', 'cleanframe-pip.dll') + "'") && cmd.includes("--log '" + join(dir, 'pip-root', 'pip.log') + "'"));
        assert.ok(cmd.indexOf('cfsum \'') < cmd.indexOf('systemd-run'));
        assert.ok(cmd.includes(" --url '" + STREAM + "' --seconds 12 "));
        assert.ok(!cmd.includes('echo ok'));
        assert.equal(sh.started().length, 1); assert.ok(sh.started()[0].includes('--unit=cleanframe-pip'));
        assert.equal(bridge.status().doorbell.error, null);
        // The previous log is kept as pip.log.1; the copy is re-made and pkill stops a fallback overlay.
        const root = join(dir, 'pip-root');
        writeFileSync(join(root, 'pip.log'), 'last ring');
        await sleep(60); assert.equal(await bridge._test.ring(), true);
        assert.equal(readFileSync(join(root, 'pip.log.1'), 'utf8'), 'last ring'); assert.equal(existsSync(join(root, 'pip.log')), false);
        assert.equal(sh.killed().length, 2); assert.ok(sh.killed()[0].includes('dotnet ' + join(root, 'cleanframe-pip.dll').replace(/\./g, '\\.')));
        assert.equal(statSync(root).mode & 0o777, 0o700);
        // A changed dll after unpack: nothing starts and the error is reported.
        writeFileSync(join(out, 'cleanframe-pip.dll'), 'tampered');
        await sleep(60);
        assert.equal(await bridge._test.ring(), false);
        assert.equal(sh.started().length, 2); assert.equal(bridge.status().doorbell.error, 'PiP start failed');
      });
    } finally { rmSync(sh.bin, { recursive: true, force: true }); }
  }
  // Neither hashing tool: fail closed. No pkill either: that alone is fine.
  const sh = shellExecute(['rm', 'cut', 'mkdir', 'cat', 'chmod', 'mv']);
  try {
    await withBridge({ config: { pip: { stream: STREAM } }, execute: sh.execute }, async ({ bridge }) => {
      assert.equal(await bridge._test.ring(), false); assert.equal(sh.started().length, 0);
    });
  } finally { rmSync(sh.bin, { recursive: true, force: true }); }
  // No pkill and a working hasher: the overlay still starts.
  const sh2 = shellExecute(['rm', 'cut', 'mkdir', 'cat', 'chmod', 'mv', 'sha256sum', 'openssl']);
  try {
    await withBridge({ config: { pip: { stream: STREAM } }, execute: sh2.execute }, async ({ bridge }) => {
      assert.equal(await bridge._test.ring(), true); assert.equal(sh2.started().length, 1); assert.equal(sh2.killed().length, 0);
    });
  } finally { rmSync(sh2.bin, { recursive: true, force: true }); }
});

test('the PiP stop pattern matches only the overlay process, never the root shell running the command', () => {
  const dll = '/run/cleanframe-pip/cleanframe-pip.dll', re = new RegExp(shard.pkillPattern(dll));
  assert.ok(re.test('/usr/bin/dotnet ' + dll + ' --url x --seconds 30'));
  assert.ok(re.test('dotnet ' + dll));
  assert.ok(!re.test("/bin/sh -c set -e; systemd-run --unit=cleanframe-pip /usr/bin/env HOME=/home/owner /usr/bin/dotnet '" + dll + "' --url x"));
  assert.ok(!re.test('/usr/bin/dotnet /run/cleanframe-pipXcleanframe-pip.dll'));
  assert.ok(!re.test('/usr/bin/dotnet ' + dll + '.bak'));
});

test('ring does nothing without a dll or a configured stream', async () => {
  await withBridge({ config: { pip: { stream: STREAM } } }, async ({ bridge, dir, calls }) => {
    rmSync(join(dir, 'pip', 'cleanframe-pip.dll'));
    assert.equal(bridge._test.ring(), null); assert.equal(calls.length, 0); assert.equal(bridge.status().doorbell.error, 'PiP not installed');
  });
  await withBridge({ pip: false, config: { pip: { stream: STREAM } } }, async ({ bridge, calls }) => { assert.equal(bridge._test.ring(), null); assert.equal(calls.length, 0); });
  await withBridge({ config: { pip: { stream: 'http://10.1.2:80/a' } } }, async ({ bridge, calls }) => { assert.equal(bridge._test.ring(), null); assert.equal(calls.length, 0); });
});

// A tiny MQTT broker: CONNACK, SUBACK, then whatever each session's script sends.
async function broker(sessions) {
  const state = { connections: 0, closed: 0, subscribed: [], sockets: [] };
  const s = net.createServer(socket => {
    const session = sessions[state.connections++] || (() => {});
    state.sockets.push(socket); socket.on('close', () => { state.closed++; }); socket.on('error', () => {});
    let buf = Buffer.alloc(0);
    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]); const parsed = shard.mqttPackets(buf); buf = parsed.rest;
      for (const p of parsed.packets) {
        if (p.type === 1) socket.write(Buffer.from([0x20, 2, 0, 0]));
        else if (p.type === 8) { state.subscribed.push(p.body.subarray(4, 4 + p.body.readUInt16BE(2)).toString()); socket.write(Buffer.from([0x90, 3, 0, 1, 0])); session(socket); }
      }
    });
  });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  state.port = s.address().port; state.close = () => { state.sockets.forEach(x => x.destroy()); return new Promise(r => s.close(() => r())); };
  return state;
}
const publish = (payload, retain = false) => { const topic = Buffer.from('vetro/cleanframe/doorbell'); return shard.mqttPacket(retain ? 0x31 : 0x30, Buffer.concat([Buffer.from([0, topic.length]), topic, Buffer.from(payload)])); };
async function until(fn, ms = 2000) { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw Error('timed out waiting'); await sleep(10); } }
function mqttFile(dir, port) { const file = join(dir, 'vetro-mqtt.json'); writeFileSync(file, JSON.stringify({ enabled: true, host: '127.0.0.1', port })); return file; }

test('MQTT doorbell: one start per ring, retained and malformed messages ignored, clear stops, stop() tears down', async () => {
  let secondSession;
  const gate = new Promise(r => { secondSession = r; });
  const b = await broker([
    socket => { socket.write(Buffer.concat([publish('ring'), publish('clear', true), Buffer.from([0x30, 1, 0]), Buffer.from([0x30, 3, 0, 9, 65])])); },
    socket => { gate.then(() => socket.write(publish('clear'))); }
  ]);
  const errors = []; const onError = e => errors.push(e); process.on('uncaughtException', onError);
  try {
    await withBridge({ start: false, config: { pip: { stream: STREAM } }, mqttRetryMs: 50 }, async ({ bridge, dir, calls }) => {
      const stopFile = join(dir, 'pip', 'stop');
      mqttFile(dir, b.port);
      await bridge.start();
      await until(() => b.connections === 2);
      assert.deepEqual(b.subscribed.slice(0, 1), ['vetro/cleanframe/doorbell']);
      assert.equal(calls.filter(c => c.includes('systemd-run')).length, 1);
      assert.ok(calls[0].includes(" --url '" + STREAM + "' "));
      assert.doesNotMatch(calls[0], /rm -f '[^']*\/pip\/stop'/);   // Root never deletes in the shard's folder.
      assert.equal(existsSync(stopFile), false);           // The retained 'clear' was ignored.
      assert.equal(b.closed, 1);                           // The malformed packet dropped the first session only.
      secondSession();
      await until(() => existsSync(stopFile));
      await until(() => bridge.status().doorbell.listening);
      await bridge.stop();
      await until(() => b.closed === 2);
      assert.equal(bridge.status().doorbell.listening, false);
      await sleep(150); assert.equal(b.connections, 2);   // No reconnect after stop.
      assert.deepEqual(bridge._test.mqttTimers(), { retry: false, ping: false, socket: false }); // Nothing of the bridge's own is left running.
    });
    assert.deepEqual(errors, []);
  } finally { process.off('uncaughtException', onError); await b.close(); }
});

test('missing MQTT settings retry while running; a failed listen never leaves MQTT running', async () => {
  const b = await broker([]);
  try {
    const dir0 = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-mqtt-'))), file = join(dir0, 'vetro-mqtt.json');
    await withBridge({ config: { pip: { stream: STREAM } }, vetroMqttPath: file, mqttConfigRetryMs: 50 }, async ({ bridge }) => {
      assert.equal(bridge.status().doorbell.error, 'No Vetro MQTT settings');
      writeFileSync(file, JSON.stringify({ enabled: false, host: '127.0.0.1', port: b.port }));
      await until(() => bridge.status().doorbell.error === 'Vetro MQTT is off');
      mqttFile(dir0, b.port);
      await until(() => b.connections === 1 && bridge.status().doorbell.listening);
    });
    await until(() => b.closed === 1);
    // The port is taken: start rejects and neither connects nor schedules MQTT.
    const blocker = net.createServer(); await new Promise(r => blocker.listen(0, '127.0.0.1', r));
    try {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-art-')));
      const bridge = shard({ dir, vetroMqttPath: mqttFile(dir0, b.port), mqttConfigRetryMs: 20, mqttRetryMs: 20, config: { get: () => ({ port: blocker.address().port, pip: { stream: STREAM } }) }, execute: async () => ok });
      await assert.rejects(bridge.start(), /Bridge listen failed/);
      await sleep(100); assert.equal(b.connections, 1); assert.equal(bridge.status().running, false);
      await bridge.stop(); rmSync(dir, { recursive: true, force: true });
    } finally { await new Promise(r => blocker.close(r)); rmSync(dir0, { recursive: true, force: true }); }
  } finally { await b.close(); }
});

test('a configured key is required on every request except preflight', async () => {
  const KEY = 'k3y-for-tests-0123456789abcdef', H = { 'X-CleanFrame-Key': KEY };
  let hits = 0; const upstream = await server((req, res) => { hits++; req.resume(); res.writeHead(200); res.end(); });
  try {
    await harness(async ({ bridge, port }) => {
      assert.equal(bridge.status().keyed, true);
      assert.ok(!JSON.stringify(bridge.status()).includes(KEY));
      const meta = JSON.parse((await get(port, '/current.json', 'null', 'GET', H)).body);
      for (const path of ['/current.json', meta.imageUrl]) {
        for (const wrong of [{}, { 'X-CleanFrame-Key': KEY.slice(0, -1) + 'X' }, { 'X-CleanFrame-Key': KEY + 'x' }, { 'X-CleanFrame-Key': '' }, { 'X-CleanFrame-Key': 'x'.repeat(2000) }]) {
          const r = await get(port, path, 'null', 'GET', wrong); assert.equal(r.status, 403, path); assert.equal(r.body.length, 0);
        }
        // No Origin (a packaged client) needs the key too.
        assert.equal((await get(port, path, undefined)).status, 403);
        assert.equal((await get(port, path, 'null', 'GET', H)).status, 200, path);
        const pre = await get(port, path, 'null', 'OPTIONS', { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-cleanframe-key' });
        assert.equal(pre.status, 204); assert.equal(pre.headers['access-control-allow-methods'], 'GET');
        assert.equal(pre.headers['access-control-allow-headers'], 'X-CleanFrame-Key'); assert.equal(pre.headers['access-control-max-age'], '600');
        assert.equal(pre.headers['access-control-allow-origin'], 'null');
      }
      assert.equal((await get(port, '/lights', 'null', 'POST')).status, 403);
      assert.equal((await get(port, '/lights', 'null', 'POST', { 'X-CleanFrame-Key': 'wrong' })).status, 403);
      assert.equal(hits, 0);
      assert.equal((await get(port, '/lights', 'null', 'POST', H)).status, 204); assert.equal(hits, 1);
      const pre = await get(port, '/lights', 'null', 'OPTIONS');
      assert.equal(pre.status, 204); assert.equal(pre.headers['access-control-allow-methods'], 'POST'); assert.equal(pre.headers['access-control-allow-headers'], 'X-CleanFrame-Key');
      // Preflight keeps the origin check, and is refused for paths the bridge does not serve.
      assert.equal((await get(port, '/current.json', 'https://example.com', 'OPTIONS')).status, 403);
      assert.equal((await get(port, '/config.json', 'null', 'OPTIONS', H)).status, 405);
    }, { config: { key: KEY }, vetroPort: upstream.address().port });
  } finally { await closeServer(upstream); }
  // No key: today's behaviour, reported as unkeyed.
  await harness(async ({ bridge, port }) => {
    assert.equal(bridge.status().keyed, false);
    assert.equal((await get(port)).status, 200);
    assert.equal((await get(port, '/current.json', 'null', 'GET', { 'X-CleanFrame-Key': 'anything' })).status, 200);
    assert.equal((await get(port, '/lights', 'null', 'OPTIONS')).headers['access-control-allow-headers'], 'X-CleanFrame-Key');
  });
  // A key that is too short or not a string never opens a listener.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-art-')));
  try {
    for (const key of ['short', 'a'.repeat(23), 42, 'has a space in it 0123456789', 'x'.repeat(257)]) {
      const port = await freePort(), bridge = shard({ dir, config: { get: () => ({ port, key }) }, execute: () => { throw Error('Unexpected execute'); } });
      await assert.rejects(bridge.start(), /Invalid bridge key/); assert.equal(bridge.status().running, false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('home.app runs the helper in Home mode from its own root folder, restarted by systemd, and stops with the bridge', async () => {
  const APP = 'fRnosDXxcr.CleanFrame', sh = shellExecute(['rm', 'cut', 'mkdir', 'cat', 'chmod', 'mv', 'pkill', 'sha256sum']);
  try {
    const dir0 = realpathSync(mkdtempSync(join(tmpdir(), 'cleanframe-home-'))), root = join(dir0, 'home-root');
    try {
      await withBridge({ config: { home: { app: APP } }, execute: sh.execute, homeRoot: root }, async ({ bridge, calls }) => {
        for (let i = 0; i < 50 && !bridge.status().home.running; i++) await sleep(20);
        assert.deepEqual(bridge.status().home, { configured: true, running: true, error: null });
        const cmd = calls.find(c => c.includes('--unit=cleanframe-home'));
        assert.ok(cmd.includes("/usr/bin/dotnet '" + join(root, 'cleanframe-pip.dll') + "' --home '" + APP + "' --log '" + join(root, 'home.log') + "'"), cmd);
        assert.ok(cmd.includes('-p Restart=always -p RestartSec=2'));
        for (const [name, data] of Object.entries(PIP)) assert.ok(cmd.includes(`test "$(cfsum '${join(root, name)}')" = ${sha256(data)}`), name);
        assert.ok(cmd.indexOf('cfsum \'') < cmd.indexOf('systemd-run'));
        assert.ok(sh.started().some(l => l.includes('--unit=cleanframe-home')));
        // A ring never stops the Home helper: their pkill patterns name different folders.
        assert.ok(!cmd.includes(join(dir0, 'pip-root')));
        await bridge.stop();
        const stops = calls.filter(c => c.startsWith('systemctl stop cleanframe-home'));
        assert.equal(stops.length >= 1, true); assert.ok(stops[stops.length - 1].includes('pkill -f') && stops[stops.length - 1].includes(join(root, 'cleanframe-pip.dll').replace(/\./g, '\\.')));
        assert.equal(bridge.status().home.running, false);
      });
    } finally { rmSync(dir0, { recursive: true, force: true }); }
  } finally { rmSync(sh.bin, { recursive: true, force: true }); }
});

test('without a valid home.app the bridge never runs or stops a Home helper', async () => {
  for (const home of [undefined, {}, { app: 'CleanFrame' }, { app: "fRnosDXxcr.Clean'Frame" }, { app: 42 }]) {
    await withBridge({ config: home ? { home } : {} }, async ({ bridge, calls }) => {
      await sleep(50);
      assert.equal(bridge.status().home.configured, false); assert.equal(bridge.status().home.running, false);
      await bridge.stop();
      assert.ok(!calls.some(c => c.includes('cleanframe-home')), JSON.stringify(home));
    });
  }
});

test('Program.cs accepts the same Home app ids as the bridge', () => {
  const cs = readFileSync(new URL('../native/doorbell-pip/Program.cs', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../vetro/cleanframe-art/index.js', import.meta.url), 'utf8');
  assert.equal(/Regex\.IsMatch\(_homeApp, @"([^"]+)"\)/.exec(cs)[1], /\/(\^\[A-Za-z0-9\]\{10\}[^/]+)\/\.test\(app\)/.exec(js)[1]);
});
