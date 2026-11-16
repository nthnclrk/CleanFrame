// Real production UI/cache in local Chromium, synthetic loopback responses only.
// HTTP browser Origins are intentionally denied by the real bridge.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { openPreview, root } from './browser.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jpeg = readFileSync(root + 'scripts/fixtures/art-test.jpg');
const size = require('../vetro/cleanframe-art/index.js').jpegSize(jpeg);
const first = createHash('sha256').update('fixture A').digest('hex'), second = createHash('sha256').update('fixture B').digest('hex');
const seed = { look: { bg: 'dark', wall: 'misty', source: 'art', layout: 'dock', focus: 'glass', material: 'soft', font: 'manrope', apps: 'both', controls: 'both' }, mode: '15' };
const out = root + '.local/qa/'; mkdirSync(out, { recursive: true });
let preview, p;
const checks = [], pageErrors = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(name); }
const state = () => p.evaluate(() => ShoreQA.state());
const ready = () => p.waitForFunction(() => ShoreQA.ready());
const act = action => p.evaluate(action => ShoreQA.activate(action), action);
async function group() { await p.evaluate(() => { ShoreQA.scene('settings'); ShoreQA.activate('settings.group.background'); }); }
async function scene(name) { await p.evaluate(n => ShoreQA.scene(n), name); await ready(); }
async function fresh(options = {}) {
  if (p) await p.close();
  p = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', error => pageErrors.push(error.message));
  await p.addInitScript(({ seed, hidden }) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('cleanframe.home.v1', JSON.stringify(seed)); sessionStorage.setItem('seeded', '1'); }
    window.__hidden = !!hidden;
    Object.defineProperty(document, 'hidden', { get: () => window.__hidden });
    window.__visibility = value => { window.__hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    const save = Storage.prototype.setItem;
    window.__failWrites = false;
    Storage.prototype.setItem = function (key, value) { if (__failWrites && key === 'cleanframe.home.v1') throw Error('Synthetic storage failure'); return save.call(this, key, value); };
  }, { seed: options.seed || seed, hidden: options.hidden });
  let heldReady;
  const whenHeld = new Promise(resolve => { heldReady = resolve; });
  const fixture = { whenHeld, calls: [], revision: first, failed: false, corrupt: false, held: [], hold: false };
  await p.route('http://127.0.0.1:8643/**', async route => {
    const url = new URL(route.request().url()); fixture.calls.push(url.pathname);
    if (fixture.hold && url.pathname === '/current.json') { fixture.held.push(route); heldReady(); return; }
    if (fixture.failed) { await route.abort('failed'); return; }
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (url.pathname === '/current.json') await route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ revision: fixture.revision, contentId: 'MY_TEST', imageUrl: '/art/' + fixture.revision + '/image.jpg', ...size, look: { brightness: 5, colorTemperature: 5 } }) });
    else await route.fulfill({ headers, contentType: 'image/jpeg', body: fixture.corrupt ? Buffer.from('corrupted JPEG') : jpeg });
  });
  await p.goto(preview.baseURL + '/home/'); await ready(); return fixture;
}
const artImages = () => p.evaluate(() => ['photo','sheetBg','matImg','phFieldImg','phFieldImgAlt','utFieldImg','utFieldImgAlt'].map(id => document.getElementById(id).src));
try {
  preview = await openPreview({ publicFonts: true });
  const f = await fresh(); await group();
  await p.evaluate(() => ShoreQA.nav('down', 'down', 'down', 'right', 'left', 'up', 'down'));
  check('Flat startup and remote navigation perform no bridge networking', f.calls.length === 0 && (await state()).committed.bg === 'dark');
  await act('choice.bg.photo'); await ready();
  check('Choosing Art Mode loads one safe metadata/JPEG pair', f.calls.length === 2 && (await state()).committed.source === 'art' && (await state()).shown.artRevision === first);
  check('Art swaps the photo and every material as one bundle', new Set(await artImages()).size === 1 && (await artImages())[0].startsWith('blob:'));
  check('Gallery and rotation are absent', !(await state()).rotation.active && !(await p.evaluate(() => ShoreQA.actions())).some(a => /wallpaper|rotation|source/.test(a)));
  check('Art uses neutral surfaces without adaptive photo ink', await p.evaluate(() => document.getElementById('stage').classList.contains('source-art') && !document.getElementById('stage').classList.contains('has-adaptive-ink') && getComputedStyle(document.getElementById('matImg')).visibility === 'hidden'));
  await p.screenshot({ path: out + 'art-background-public.png' });
  const geometry = await p.evaluate(() => { const root = document.getElementById('stage').getBoundingClientRect(), rows = document.getElementById('appearanceRows').getBoundingClientRect(), desc = document.getElementById('appearanceDesc').getBoundingClientRect(); return rows.bottom <= desc.top && rows.right <= root.right; });
  check('Background choices fit above the remote hint', geometry);
  check('Art background drops gallery scrims for the calibrated Art look', await p.evaluate(() => Array.prototype.every.call(document.querySelectorAll('#bg>div'), el => getComputedStyle(el).display === 'none')));
  check('Art look follows the calibrated brightness levels', await p.evaluate(() => { const at = b => FrameArt.lookFor({ colorTemperature: 3, brightness: b }); return at(2).tint === 'rgb(155,132,98)' && /contrast\(0\.97\) saturate\(0\.5\)/.test(at(2).filter) && at(5).tint === 'rgb(249,217,172)' && /brightness\(0\.636\) contrast\(0\.78\) saturate\(0\.42\)/.test(at(10).filter) && at(10).tint === 'rgb(237,217,172)' && JSON.stringify(FrameArt.lookFor({ colorTemperature: 3 })) === JSON.stringify(at(5)); }));
  check('Art look follows the bridge colour temperature', await p.evaluate(() => { const after = getComputedStyle(document.getElementById('bg'), '::after'), photo = getComputedStyle(document.getElementById('photo')).filter; return after.backgroundColor === 'rgb(250, 212, 160)' && after.mixBlendMode === 'multiply' && /saturate\(0\.48\)/.test(photo) && /url\(/.test(photo) && document.getElementById('artCurveB').getAttribute('exponent') === '1.19'; }));
  await p.setViewportSize({ width: 1280, height: 720 });
  check('Art Settings retains single focus at 720p', (await p.evaluate(() => ShoreQA.where())).focusCount === 1);
  await p.screenshot({ path: out + 'art-background-720-public.png' });
  await p.setViewportSize({ width: 1920, height: 1080 });
  await scene('home'); await p.screenshot({ path: out + 'art-dock-public.png' });
  await p.evaluate(() => ShoreQA.look({ layout: 'list' })); await ready(); await p.screenshot({ path: out + 'art-list-public.png' });
  check('List and Dock keep single remote focus with Art Mode', (await p.evaluate(() => ShoreQA.where())).focusCount === 1);
  const calls = f.calls.length;
  await p.evaluate(() => ShoreQA.nav('down','down','up','right','left'));
  check('Remote movement does not refresh art', f.calls.length === calls);
  f.failed = true;
  await p.reload(); await ready();
  check('IndexedDB last-good JPEG renders immediately after reload while offline', (await state()).shown.artRevision === first && (await state()).committed.source === 'art');
  await p.waitForFunction(() => !FrameArt.status().refreshing);
  check('Failed async refresh keeps the cached appearance', (await state()).shown.artRevision === first);
  await group(); await act('choice.bg.light'); await ready();
  check('Flat backgrounds retain legacy wallpaper and rotation fields without loading them', (await state()).committed.wall === 'misty' && (await state()).committed.mode === '15' && (await state()).shown.bg === 'light');
  const cancel = await fresh(); cancel.hold = true; await group(); await act('choice.bg.photo');
  await p.waitForFunction(() => !!ShoreQA.state().pending);
  await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error('Art request was not held')), 5000); cancel.whenHeld.then(() => { clearTimeout(timeout); resolve(); }); });
  await p.evaluate(() => ShoreQA.nav('back'));
  for (const route of cancel.held) await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ revision: first, contentId: 'MY_TEST', imageUrl: '/art/' + first + '/image.jpg', ...size }) }).catch(() => {});
  await p.waitForTimeout(100);
  check('Back cancels an Art request and late completion cannot save or install it', (await state()).committed.bg === 'dark' && (await state()).shown.bg === 'dark' && (await state()).writes === 0);
  const hide = await fresh(); hide.hold = true; await group(); await act('choice.bg.photo');
  await p.waitForFunction(() => !!ShoreQA.state().pending);
  await p.evaluate(() => __visibility(true));
  check('Hiding cancels a pending Art choice without leaving Settings stuck', !(await state()).pending && (await state()).committed.bg === 'dark');
  await p.evaluate(() => __visibility(false)); hide.hold = false;
  await act('choice.bg.light'); await ready();
  check('Another appearance choice works after a hidden Art cancellation', (await state()).committed.bg === 'light');
  const bad = await fresh(); bad.corrupt = true; await group(); await act('choice.bg.photo');
  await p.waitForFunction(() => !ShoreQA.state().pending);
  check('Corrupt JPEG keeps previous source, checkmark and complete material bundle', (await state()).committed.bg === 'dark' && (await state()).shown.bg === 'dark' && (await state()).writes === 0);
  check('Unavailable Art explains the local bridge only in the failure state', /local Art bridge/.test(await p.locator('#appearanceStatus').innerText()));
  bad.corrupt = false; await p.evaluate(() => { __failWrites = true; }); await act('settings.retry');
  await p.waitForFunction(() => !ShoreQA.state().pending);
  check('Preference write failure preserves the entire previous appearance', (await state()).committed.bg === 'dark' && (await state()).shown.bg === 'dark' && (await state()).failedWrites === 1);
  await p.evaluate(() => { __failWrites = false; }); await act('settings.retry'); await ready();
  check('Retry applies a valid cached Art bundle once', (await state()).committed.bg === 'photo' && (await state()).writes === 1);
  const hidden = await fresh({ seed: { ...seed, look: { ...seed.look, bg: 'photo' }, mode: 'open' }, hidden: true });
  check('Hidden cold start performs no bridge request and keeps the saved source', hidden.calls.length === 0 && (await state()).committed.source === 'art' && (await state()).committed.wall === 'misty' && (await state()).shown.artRevision === null);
  await p.evaluate(() => __visibility(false));
  await p.waitForFunction(revision => ShoreQA.state().shown.artRevision === revision, first);
  check('Visible Home refreshes the cold placeholder without a preference write', hidden.calls.length === 2 && (await state()).writes === 0);
  hidden.revision = second;
  await p.waitForTimeout(5100); // Exercise lifecycle throttling, never a production polling loop.
  await p.evaluate(() => { __visibility(true); __visibility(false); });
  await p.waitForFunction(revision => ShoreQA.state().shown.artRevision === revision, second);
  check('Returning Home installs a newer revision atomically', new Set(await artImages()).size === 1 && (await state()).writes === 0);
  await fresh({ seed: {} });
  await p.waitForFunction(() => !!ShoreQA.state().shown.artRevision);
  const defaults = (await state()).dock;
  check('Fresh defaults include ESPN, Browser, HDMI 4 and antenna Live TV without Australian services', defaults.length === 7 && defaults[0] === 'livetv' && ['espn', 'browser', 'hdmi4'].every(id => defaults.includes(id)) && !defaults.includes('abciview') && !defaults.includes('sbs'));
  await p.screenshot({ path: out + 'home-defaults-public.png' });
  await p.evaluate(() => ShoreQA.look({ layout: 'list' })); await ready();
  check('Home entries use ESPN PNG and original TV mark', await p.evaluate(() => {
    const espn = document.querySelector('[data-action="home.app.espn"] .mk'), tv = document.querySelector('[data-action="home.app.livetv"] .mk');
    return espn && tv && espn.style.webkitMaskImage.indexOf('espn.png') >= 0 && tv.style.webkitMaskImage.indexOf('livetv.svg') >= 0;
  }));
  await p.screenshot({ path: out + 'home-defaults-list-public.png' });
  check('Home controls are Apps and Settings only', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#utils .u')].map(b => b.getAttribute('aria-label')))) === '["Apps","Settings"]');
  check('Art Glass focus is a translucent frosted pane', await p.evaluate(() => { const plate = document.querySelector('.ph-plate.is-current'), bg = getComputedStyle(plate).backgroundImage; return ShoreQA.state().committed.focus === 'glass' && /rgba\(255, 255, 255, 0\.3\)/.test(bg); }));
  await p.evaluate(() => ShoreQA.nav('down','down','down','down','down','down','down'));
  await p.waitForTimeout(200);
  await p.screenshot({ path: out + 'home-espn-public.png' });
  const packed = await p.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  check('No bundled wallpaper/material URLs are requested', !packed.some(url => /\/assets\/(wallpapers|materials)\//.test(url)));
  await fresh({ seed: { ...seed, look: { ...seed.look, bg: 'photo', layout: 'list' }, home: ['livetv', 'youtube', 'netflix', 'espn', 'primevideo', 'browser', 'stremio', 'disneyplus', 'appletv'] } });
  await p.waitForFunction(() => !!ShoreQA.state().shown.artRevision); await p.waitForTimeout(250);
  const rows = await p.evaluate(() => { const list = document.getElementById('phList').getBoundingClientRect(); return [...document.querySelectorAll('#phRows .ph-row .ph-name')].map(e => { const r = e.getBoundingClientRect(); return { top: r.top - list.top, bottom: r.bottom - list.top }; }); });
  // The list mask is opaque from 96px to 976px of its 1040px box.
  check('List shows seven app names before the lower fade', rows.length === 9 && rows.slice(0, 7).every(r => r.top >= 96 && r.bottom <= 978) && rows[7].top > 976);
  await p.screenshot({ path: out + 'home-list-seven-public.png' });
  check('Art browser run has no uncaught page errors', pageErrors.length === 0);
  console.log(checks.length + ' Art browser checks passed; public-font screenshots in .local/qa/');
} finally { if (p) await p.close(); if (preview) await preview.close(); }
