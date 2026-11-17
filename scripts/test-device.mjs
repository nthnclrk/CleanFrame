// Test the production adapter with a synthetic API and clock. No TV access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../app/device.js', import.meta.url), 'utf8');
function harness({ supported = true, throwSource = false, storages, folders, storageFailure, holdStorage = false, throwList, noFilesystem = false } = {}) {
  let now = 0, next = 0;
  const timers = new Map(), requests = [], launches = [], sourceRequests = [], changes = [], dirs = [], storageRequests = [], listeners = [];
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
  if (!noFilesystem) {
    window.tizen.filesystem = {
      listStorages: (ok, fail) => { storageRequests.push({ ok, fail }); if (!storageFailure && !holdStorage) ok((storages || []).map(unit => ({ ...unit }))); },
      listDirectory: (path, ok, fail) => {
        dirs.push({ path });
        if (throwList) throw Error('Synthetic directory failure');
        const entries = folders && folders[path];
        if (!entries) fail({ name: 'NotFoundError', message: 'No ' + path });
        else ok(entries.slice());
      },
      toURI: path => 'file:///opt/media/USBDriveA1/' + path,
      addStorageStateChangeListener: cb => { listeners.push(cb); return listeners.length; }
    };
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
  return { device: window.FrameDevice, requests, launches, sourceRequests, changes, dirs, storageRequests, listeners, advance, setCurrent: value => { current = value; } };
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

const MOUNTED = [{ label: 'internal0', type: 'INTERNAL', state: 'MOUNTED' },
  { label: 'removable_sdb2', type: 'EXTERNAL', state: 'MOUNTED' },
  { label: 'removable_sda1', type: 'EXTERNAL', state: 'MOUNTED' }];
// Results come from the adapter's context, so compare plain JSON rather than identities.
const json = value => JSON.stringify(JSON.parse(JSON.stringify(value)));

test('USB pictures come from the CleanFrame folder in a stable, filtered order', () => {
  const h = harness({ storages: MOUNTED, folders: {
    'removable_sda1/CleanFrame': ['IMG_02.jpg', 'IMG_10.JPG', 'notes.txt', 'IMG_01.jpeg', 'shot.webp', 'frame.BMP', '.jpg']
  } }), results = [];
  h.device.usbPhotos((error, value) => results.push({ error, value }));
  assert.equal(results.length, 1);
  assert.equal(results[0].error, null);
  const scan = JSON.parse(json(results[0].value));
  assert.equal(scan.drive, 'removable_sda1');
  assert.equal(scan.folder, 'CleanFrame');
  assert.deepEqual(scan.photos.map(p => p.name), ['frame.BMP', 'IMG_01.jpeg', 'IMG_02.jpg', 'IMG_10.JPG', 'shot.webp']);
  assert.equal(scan.photos[1].uri, 'file:///opt/media/USBDriveA1/removable_sda1/CleanFrame/IMG_01.jpeg');
  assert.equal(h.dirs[0].path, 'removable_sda1/CleanFrame');
});

test('a missing CleanFrame folder falls back to Photos, the drive root and then the next drive', () => {
  const photos = harness({ storages: MOUNTED, folders: { 'removable_sda1/Photos': ['b.jpg', 'a.jpg'] } }), results = [];
  photos.device.usbPhotos((error, value) => results.push({ error, value }));
  assert.deepEqual(JSON.parse(json(results[0].value.photos)).map(p => p.name), ['a.jpg', 'b.jpg']);
  assert.equal(results[0].value.folder, 'Photos');
  assert.deepEqual(photos.dirs.map(d => d.path), ['removable_sda1/CleanFrame', 'removable_sda1/Photos']);
  const root = harness({ storages: MOUNTED, folders: { 'removable_sda1/': ['beach.jpg'] } });
  root.device.usbPhotos((error, value) => results.push({ error, value }));
  assert.equal(results[1].value.folder, '');
  assert.deepEqual(JSON.parse(json(results[1].value.photos)).map(p => p.name), ['beach.jpg']);
  assert.deepEqual(root.dirs.map(d => d.path), ['removable_sda1/CleanFrame', 'removable_sda1/Photos', 'removable_sda1/']);
  assert.equal(results[1].value.photos[0].uri, 'file:///opt/media/USBDriveA1/removable_sda1/beach.jpg');
  const second = harness({ storages: MOUNTED, folders: { 'removable_sda1/CleanFrame': ['notes.txt'], 'removable_sdb2/CleanFrame': ['z.png'] } });
  second.device.usbPhotos((error, value) => results.push({ error, value }));
  assert.equal(results[2].value.drive, 'removable_sdb2');
  assert.deepEqual(JSON.parse(json(results[2].value.photos)).map(p => p.name), ['z.png']);
  const empty = harness({ storages: MOUNTED, folders: { 'removable_sda1/CleanFrame': ['notes.txt'] } });
  empty.device.usbPhotos((error, value) => results.push({ error, value }));
  assert.equal(json(results[3].value), json({ drive: 'removable_sda1', folder: '', photos: [] }), 'a drive without pictures is named');
});

test('only mounted external storage counts and no drive is an empty slideshow, not an error', () => {
  for (const storages of [[{ label: 'internal0', type: 'INTERNAL', state: 'MOUNTED' }],
    [{ label: 'removable_sda1', type: 'EXTERNAL', state: 'REMOVED' }], []]) {
    const h = harness({ storages }), results = [];
    h.device.usbPhotos((error, value) => results.push({ error, value }));
    assert.equal(results.length, 1);
    assert.equal(results[0].error, null);
    assert.equal(json(results[0].value), json({ drive: '', folder: '', photos: [] }));
    assert.equal(h.storageRequests.length, 1);
    assert.equal(h.dirs.length, 0);
  }
});

test('a denied API and a silent TV each give one honest error', () => {
  const denied = harness({ storages: MOUNTED, storageFailure: true }), results = [];
  denied.device.usbPhotos((error, value) => results.push({ error, value }));
  assert.equal(results.length, 0);
  denied.storageRequests[0].fail({ name: 'SecurityError', message: 'Storage is busy' });
  assert.equal(results.length, 1);
  assert.match(results[0].error.message, /USB drive could not be read/i);
  assert.match(results[0].error.detail, /Storage is busy/);
  const preview = harness({ supported: false, noFilesystem: true }), previewResults = [];
  preview.device.usbPhotos((error, value) => previewResults.push({ error, value }));
  assert.equal(previewResults.length, 1);
  assert.match(previewResults[0].error.message, /Open CleanFrame on the TV/);
  assert.match(previewResults[0].error.detail, /preview/);
  const silent = harness({ storages: MOUNTED, holdStorage: true }), late = [];
  silent.device.usbPhotos((error, value) => late.push({ error, value }));
  silent.advance(11999);
  assert.equal(late.length, 0);
  silent.advance(1);
  assert.equal(late.length, 1);
  assert.match(late[0].error.message, /did not respond/);
  silent.storageRequests[0].ok(MOUNTED);
  assert.equal(late.length, 1);
});

test('an unreadable folder falls through every candidate and resolves once', () => {
  const h = harness({ storages: MOUNTED, folders: { 'removable_sda1/CleanFrame': ['a.jpg'] }, throwList: true }), results = [];
  h.device.usbPhotos((error, value) => results.push({ error, value }));
  assert.equal(results.length, 1);
  assert.equal(results[0].error, null);
  assert.equal(results[0].value.photos.length, 0);
  assert.equal(h.dirs.length, 6);
});

test('a storage listener reports drive changes and is optional', () => {
  const h = harness({ storages: MOUNTED });
  let seen = 0;
  h.device.watchStorage(() => { seen++; });
  assert.equal(h.listeners.length, 1);
  h.listeners[0]({ label: 'removable_sdc3', state: 'MOUNTED' });
  h.listeners[0](null);
  assert.equal(seen, 2);
  const preview = harness({ noFilesystem: true });
  assert.doesNotThrow(() => preview.device.watchStorage(() => {}));
});
