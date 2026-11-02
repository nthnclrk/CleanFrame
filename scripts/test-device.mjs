// Test the production adapter with a synthetic API and clock. No TV access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../app/device.js', import.meta.url), 'utf8');
function harness({ supported = true, throwSource = false } = {}) {
  let now = 0, next = 0;
  const timers = new Map(), requests = [], launches = [], sourceRequests = [], changes = [];
  let current = { type: 'HDMI', number: 2 };
  const application = {
    getCurrentApplication: () => ({ appInfo: { id: 'Owner12345.Home' } }),
    getAppsInfo: (ok, fail) => requests.push({ ok, fail }),
    launch: (id, ok, fail) => launches.push({ id, ok, fail })
  };
  const window = { tizen: { application } };
  if (supported) {
    window.tizen.systeminfo = { getPropertyValue: (name, ok, fail) => { assert.equal(name, 'VIDEOSOURCE'); sourceRequests.push({ ok, fail }); } };
    window.tizen.tvwindow = { getSource: (...args) => { assert.equal(args.length, 0); return current; },
      setSource: (source, ok, fail) => { if (throwSource) throw Error('Synthetic SDK failure'); changes.push({ source, ok, fail }); } };
  }
  vm.runInNewContext(source, {
    window, tizen: window.tizen,
    setTimeout: (callback, delay) => { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  function advance(ms) {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  }
  return { device: window.FrameDevice, requests, launches, sourceRequests, changes, advance, setCurrent: value => { current = value; } };
}

test('a 500-app catalogue can arrive after the old eight-second deadline', () => {
  const h = harness(), results = [];
  h.device.apps((error, apps) => results.push({ error, apps }));
  assert.equal(h.requests.length, 1);
  h.advance(15000);
  assert.equal(results.length, 0);
  h.requests[0].ok(Array.from({ length: 500 }, (_, i) => ({ id: 'App' + String(i).padStart(7, '0') + '.Consumer', name: 'App ' + i, show: true })));
  assert.equal(results.length, 1);
  assert.equal(results[0].error, null);
  assert.equal(results[0].apps.length, 500);
});

test('catalogue timeout and late callbacks finish only once', () => {
  const h = harness(), results = [];
  h.device.apps((error, apps) => results.push({ error, apps }));
  h.advance(19999);
  assert.equal(results.length, 0);
  h.advance(1);
  assert.equal(results.length, 1);
  assert.match(results[0].error.message, /did not respond/);
  h.requests[0].ok([]);
  h.requests[0].fail({ message: 'Late failure' });
  assert.equal(results.length, 1);
});

test('regional streaming apps stay distinct and system helpers stay hidden', () => {
  const h = harness();
  let apps;
  h.device.apps((error, value) => { assert.equal(error, null); apps = value; });
  h.requests[0].ok([
    { id: 'Owner12345.Home', name: 'My Home', show: true },
    { id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', show: false },
    { id: 'PvWgqxV3Xa.YouTubeTV', name: 'YouTube TV', show: false },
    { id: 'cj37Ni3qXM.HBONow', name: 'HBO Max', show: false },
    { id: '2022ePop01.SmartTV', name: 'Smart TV', show: true },
    { id: 'd0m1lV1nt2.emanual', name: 'User Guide', show: true },
    { id: 'Hidden1234.Consumer', name: 'Hidden app', show: false }
  ]);
  assert.equal(apps.length, 3);
  assert.equal(apps.find(a => a.name === 'YouTube').brand, 'youtube');
  assert.equal(apps.find(a => a.name === 'YouTube TV').brand, '');
  assert.equal(apps.find(a => a.name === 'HBO Max').brand, 'hbomax');
});

test('launch keeps its eight-second deadline independently of discovery', () => {
  const h = harness(), results = [];
  h.device.launchApp('Synthetic.App', error => results.push(error));
  h.advance(8000);
  assert.equal(results.length, 1);
  assert.match(results[0].message, /did not respond/);
  h.launches[0].ok();
  assert.equal(results.length, 1);
});

const video = { connected: [{ type: 'HDMI', number: 2 }], disconnected: [{ type: 'HDMI', number: 1 }, { type: 'HDMI', number: 3 }] };
test('inputs use actual connected and sleeping source records and synchronous active status', () => {
  const h = harness(); let result;
  h.device.sources((error, inputs) => { assert.equal(error, null); result = inputs; });
  h.sourceRequests[0].ok({ connected: video.connected, disconnected: [...video.disconnected, { type: 'HDMI', number: 2 }, { type: 'TV', number: 0 }] });
  assert.deepEqual(Array.from(result, x => x.number), [1, 2, 3]);
  assert.equal(result.find(x => x.number === 2).active, true);
  assert.equal(result.find(x => x.number === 2).connected, true);
  assert.equal(result.find(x => x.number === 1).connected, false);
});
test('input absence, denial, empty discovery and timeout never invent ports', () => {
  const absent = harness({ supported: false }); let error;
  absent.device.sources(e => { error = e; }); assert.ok(error);
  for (const mode of ['denied', 'empty', 'timeout']) {
    const h = harness(), results = [];
    h.device.sources((error, inputs) => results.push({ error, inputs }));
    if (mode === 'denied') h.sourceRequests[0].fail({ name: 'SecurityError' });
    else if (mode === 'empty') h.sourceRequests[0].ok({ connected: [], disconnected: [] });
    else h.advance(8000);
    assert.equal(results.length, 1);
    if (mode === 'empty') assert.equal(results[0].inputs.length, 0);
    else { assert.ok(results[0].error); assert.equal(results[0].inputs, undefined); }
    h.sourceRequests[0].ok(video); assert.equal(results.length, 1);
  }
});
test('input switching uses a discovered disconnected record and completes only after viewer launch', () => {
  const h = harness(), results = [];
  h.device.setSource(1, (error, input) => results.push({ error, input }));
  h.sourceRequests[0].ok(video);
  assert.equal(h.changes[0].source, video.disconnected[0]);
  h.changes[0].ok(video.disconnected[0]); assert.equal(results.length, 0);
  assert.equal(h.launches[0].id, 'org.tizen.tv-viewer');
  h.launches[0].ok(); assert.equal(results[0].error, null);
  assert.equal(results[0].input.number, 1);
});
test('source and viewer failures are errors and never hide the launcher', () => {
  for (const mode of ['source', 'throw', 'viewer', 'different']) {
    const h = harness({ throwSource: mode === 'throw' }), results = [];
    h.device.setSource(2, error => results.push(error));
    if (mode === 'throw') {
      h.sourceRequests[0].ok(video);
    } else {
      h.sourceRequests[0].ok(video);
      if (mode === 'source') h.changes[0].fail({ name: 'SecurityError' });
      else if (mode === 'different') h.changes[0].ok({ type: 'HDMI', number: 3 });
      else { h.changes[0].ok(video.connected[0]); h.launches[0].fail({ name: 'NotFoundError' }); }
    }
    assert.equal(results.length, 1); assert.ok(results[0]);
    assert.equal(h.launches.length, mode === 'viewer' ? 1 : 0);
  }
});
test('cancelled and timed-out input requests cannot initiate later device operations', () => {
  for (const mode of ['timeout', 'cancel']) {
    const h = harness(), results = [];
    h.device.setSource(2, error => results.push(error));
    if (mode === 'timeout') h.advance(8000); else h.device.cancelSource();
    assert.equal(results.length, 1); assert.ok(results[0]);
    h.sourceRequests[0].ok(video); assert.equal(h.changes.length, 0); assert.equal(h.launches.length, 0);
    const pending = harness(); pending.device.setSource(2, () => {}); pending.sourceRequests[0].ok(video);
    if (mode === 'timeout') pending.advance(8000); else pending.device.cancelSource();
    pending.changes[0].ok(video.connected[0]); assert.equal(pending.launches.length, 0);
  }
});
test('unknown and invalid ports cannot be substituted and a newer request cancels the old one', () => {
  for (const port of [-1, 1.5, '2', Infinity, 4]) {
    const h = harness(), results = []; h.device.setSource(port, error => results.push(error));
    if (port === 4) h.sourceRequests[0].ok(video);
    assert.equal(results.length, 1); assert.ok(results[0]); assert.equal(h.changes.length, 0);
  }
  const h = harness(), results = [];
  h.device.setSource(1, error => results.push(error)); h.device.setSource(2, () => {});
  assert.equal(results[0].cancelled, true);
  h.sourceRequests[0].ok(video); assert.equal(h.changes.length, 0);
  h.sourceRequests[1].ok(video); assert.equal(h.changes[0].source.number, 2);
});
