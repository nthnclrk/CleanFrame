// Exercise the real ES5 cache against synthetic Tizen filesystem/XHR boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app/art-mode.js', import.meta.url), 'utf8');
const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64), META = 'cleanframe.art.cache.v1';
const meta = revision => ({ revision, contentId: 'MY_TEST', imageUrl: '/art/' + revision + '/image.jpg', width: 1920, height: 1080 });
const jpeg = new Uint8Array([255,216,0,0,0,0,0,0,0,0,255,217]);
function harness({ files = new Map(), storage = new Map(), failMove = false, corrupt = new Set(), hangMove = false, image = jpeg } = {}) {
  const requests = [];
  let next = A, offline = false, held = [], hold = false, deleted = [], order = [], revoked = [], urlNo = 0, clock = 0;
  const timers = new Map();
  const dir = { fullPath: 'wgt-private/cleanframe-art',
    resolve(name) { if (!files.has(name)) throw Error('Not found'); return file(name); },
    createFile(name) { files.set(name, new Uint8Array()); return file(name); },
    deleteFile(path) { const name = path.split('/').pop(); files.delete(name); deleted.push(name); },
    moveTo(from, to, overwrite, ok, fail) {
      if (hangMove) return;
      if (failMove || !files.has(from.split('/').pop())) { fail(); return; }
      const src = from.split('/').pop(), dst = to.split('/').pop(); files.set(dst, files.get(src)); files.delete(src); order.push('move:' + dst); ok();
    },
    listFiles(ok) { ok([...files.keys()].map(name => ({ name, fullPath: dir.fullPath + '/' + name }))); }
  };
  function file(name) {
    return { isFile: true, name, fileSize: files.get(name).length, fullPath: dir.fullPath + '/' + name, toURI: () => 'file:///' + dir.fullPath + '/' + name,
      openStream(mode, ok) {
        const chunks = []; ok({ writeBytes(bytes) { for (const b of bytes) chunks.push(b); }, close() { if (files.has(name)) files.set(name, new Uint8Array(chunks)); order.push('close:' + name); } }); // A deleted file stays deleted.
      }
    };
  }
  class Image {
    naturalWidth = 1920; naturalHeight = 1080;
    set src(url) { queueMicrotask(() => { if (corrupt.has(url)) this.onerror?.(); else this.onload?.(); }); }
  }
  class XHR {
    open(method, url) { this.url = url; requests.push(url); }
    send() {
      const respond = () => {
        if (offline) { this.onerror(); return; }
        this.status = 200;
        if (this.url.endsWith('/current.json')) this.responseText = JSON.stringify(meta(next)); else this.response = image.buffer;
        this.onload();
      };
      if (hold) held.push(respond); else queueMicrotask(respond);
    }
    abort() { this.onabort?.(); }
  }
  const context = { console, Image, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => { order.push('pointer:' + k); storage.set(k, v); } },
    document: { hidden: false }, setTimeout: fn => { const id = ++clock; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    tizen: { filesystem: { resolve: (name, ok) => ok({ resolve: () => dir }) } },
    window: { Uint8Array, Blob, XMLHttpRequest: XHR, tizen: {}, URL: { createObjectURL: () => 'blob:' + (++urlNo), revokeObjectURL: url => revoked.push(url) } }
  };
  vm.runInNewContext(source, context);
  const api = context.window.FrameArt;
  return { api, files, storage, order, deleted, revoked, requests, next: value => { next = value; }, offline: value => { offline = value; }, hold: () => { hold = true; }, release: () => { hold = false; held.forEach(fn => fn()); held = []; },
    timers, expire: () => { for (const fn of [...timers.values()]) fn(); }, load: () => new Promise(r => api.load(r)), refresh: () => new Promise(r => api.refresh(r)) };
}
test('Tizen private cache promotes a completed JPEG before its pointer and survives offline restart', async () => {
  const h = harness(); assert.equal(await h.load(), null);
  const result = await h.refresh(); assert.equal(result.revision, A); assert.match(result.url, /^blob:/); // Shown from memory; the save finishes behind it.
  assert.deepEqual([...h.files.get(A + '.jpg')], [...jpeg]);
  assert.ok(h.order.findIndex(v => v.startsWith('close:incoming-')) < h.order.indexOf('move:' + A + '.jpg'));
  assert.ok(h.order.indexOf('move:' + A + '.jpg') < h.order.indexOf('pointer:' + META));
  const restart = harness({ files: h.files, storage: h.storage }); restart.offline(true);
  assert.equal((await restart.load()).revision, A);
  assert.equal(await restart.refresh(), null); assert.equal(restart.api.current().revision, A);
});
test('Tizen failed promotion keeps the persistent last-good pointer and uses decoded memory for this session', async () => {
  const files = new Map([[A + '.jpg', jpeg]]), storage = new Map([[META, JSON.stringify(meta(A))]]);
  const h = harness({ files, storage, failMove: true }); await h.load(); h.next(B);
  const result = await h.refresh(); assert.equal(result.revision, B); assert.match(result.url, /^blob:/);
  assert.equal(JSON.parse(storage.get(META)).revision, A); assert.ok(files.has(A + '.jpg'));
});
test('cache cleanup bounds revisions and repairs a corrupt same-revision orphan', async () => {
  const h = harness({ files: new Map([[A + '.jpg', jpeg], [B + '.jpg', new Uint8Array([0])], ['unrelated.txt', jpeg]]), storage: new Map([[META, JSON.stringify(meta(A))]]) });
  await h.load(); h.next(B); await h.refresh();
  assert.deepEqual([...h.files.get(B + '.jpg')], [...jpeg]);
  h.next(C); await h.refresh();
  assert.ok(!h.files.has(A + '.jpg') && h.files.has(B + '.jpg') && h.files.has(C + '.jpg') && h.files.has('unrelated.txt'));
  assert.equal(h.files.size, 3);
});
test('cancellation ignores a late response, and a stuck save never delays showing the photo', async () => {
  const h = harness(); await h.load(); h.hold(); let applied = false; h.api.refresh(() => { applied = true; });
  h.api.cancel(); h.release(); await new Promise(r => setImmediate(r));
  assert.equal(applied, false); assert.equal(h.storage.has(META), false); assert.equal(h.api.current(), null);
  const stuck = harness({ hangMove: true }); await stuck.load(); const pending = stuck.refresh(); await new Promise(r => setImmediate(r));
  const first = await Promise.race([pending, new Promise(r => setImmediate(() => r('waiting')))]); // No timer expired.
  assert.match(first.url, /^blob:/); assert.equal(stuck.api.status().refreshing, false); assert.equal(stuck.storage.has(META), false);
});
test('a save that has started finishes after hiding, and an overlapping save keeps its files', async () => {
  const big = new Uint8Array(600000); big.set([255, 216]); big.set([255, 217], big.length - 2); // Three 256 KiB steps.
  const h = harness({ image: big }), settle = () => new Promise(r => setImmediate(r));
  const run = async () => { for (let n = 0; n < 20 && h.timers.size; n++) { for (const [id, fn] of [...h.timers]) { h.timers.delete(id); fn(); } await settle(); } };
  await h.load();
  h.api.refresh(() => {}); await settle();
  assert.ok([...h.files.keys()].some(n => n.startsWith('incoming-')), 'the first save is mid-write');
  h.api.cancel(); h.api.refresh(() => {}); await settle(); // Hidden, shown again: the same photo is fetched and saved again.
  h.api.cancel(); await run();                             // Hidden again before either save finishes.
  assert.deepEqual(h.deleted.filter(n => n.startsWith('incoming-')), []);
  assert.ok(h.files.has(A + '.jpg'));
  assert.equal(h.files.get(A + '.jpg').length, big.length);
  assert.equal(JSON.parse(h.storage.get(META)).revision, A);
  assert.ok(![...h.files.keys()].some(n => n.startsWith('incoming-')));
});
test('repeatedly replaced candidates keep the installed blob alive and bound object URLs', async () => {
  const h = harness({ failMove: true }); await h.load(); const a = await h.refresh(); h.api.retain(a.url);
  for (const revision of [B,C,B,C]) { h.next(revision); await h.refresh(); }
  assert.ok(!h.revoked.includes(a.url)); assert.ok(h.revoked.length >= 2);
});

test('widget can use its configured private TV address and rejects external hosts', async () => {
  const own = harness({ storage: new Map([['cleanframe.art.host', '192.168.50.10']]) });
  await new Promise(resolve => own.api.refresh(resolve));
  assert.ok(own.requests.length === 2 && own.requests.every(url => url.startsWith('http://192.168.50.10:8643/')));
  for (const host of ['example.com', '8.8.8.8', '192.168.1.999', '192.168.1.10:8099', 'http://192.168.1.10']) {
    const h = harness({ storage: new Map([['cleanframe.art.host', host]]) });
    await new Promise(resolve => h.api.refresh(resolve));
    assert.ok(h.requests.every(url => url.startsWith('http://127.0.0.1:8643/')));
  }
});
