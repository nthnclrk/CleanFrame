// Production UI checks. Mock only the public Tizen boundary; never contact a TV.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openPreview, root } from './browser.mjs';

const KEY = 'cleanframe.home.v1';
const PRIMARY = ['stremio', 'netflix', 'disneyplus', 'youtube', 'appletv', 'primevideo', 'abciview', 'sbs', 'applemusic'];
const IDS = ['IkWsFHtOY9.Stremio', 'org.tizen.netflix-app', 'MCmYXNxgcu.DisneyPlus', '9Ur5IzDKqV.TizenYouTube', 'com.samsung.tv.aria-video', 'org.tizen.primevideo', 'mWK87Xghap.ABCiview', 'OyE7OuxlUi.SBSOnDemand', 'org.tizen.apple.apple-music'];
const NAMES = ['Stremio', 'Netflix', 'Disney+', 'YouTube', 'Apple TV', 'Prime Video', 'ABC iview', 'SBS On Demand', 'Apple Music'];
const EXTRA = 'AbCdEf1234.FamilyApp', SPOTIFY = 'rJeHak5zRg.Spotify';
const UNSAFE_NAME = 'Family <img src=x onerror="window.__catalogXss=1"> & TV';
const CATALOG = IDS.map((id, i) => ({ id, name: NAMES[i], show: true, iconPath: '' })).concat([
  { id: EXTRA, name: UNSAFE_NAME, show: true, iconPath: '' },
  { id: SPOTIFY, name: 'Spotify', show: true, iconPath: '' },
  { id: '5b8c3eb16b.BeamCTVDev', name: 'HBO Max', show: true, iconPath: '' },
  { id: 'TestHome01.CleanFrame', name: 'CleanFrame', show: true },
  { id: 'AbCdEf1234.worker', name: 'Background worker', show: true },
  { id: 'com.samsung.tv.cobalt-yt', name: 'YouTube', show: true }
]);
const walls = JSON.parse(readFileSync(root + 'app/assets/wallpapers/SOURCES.json', 'utf8'));
const out = root + '.local/qa/';
mkdirSync(out, { recursive: true });
const sourceFiles = ['app/main.js', 'app/device.js', 'app/assets/apps/catalog.js', 'app/index.html', 'app/style.css', 'app/config.xml', 'app/assets/wallpapers/SOURCES.json', 'app/assets/wallpapers/catalog.js', 'app/assets/adaptive-ink.js', 'app/assets/icons/metrics.js'];
const hashes = () => Object.fromEntries(sourceFiles.map(f => [f, createHash('sha256').update(readFileSync(root + f)).digest('hex')]));
const report = { scope: 'Production UI in Chromium; mock public Tizen API only; no TV contacted.', sourceBefore: hashes(), checks: [], failures: [], pageErrors: [], expectedNetworkFailures: [] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const baseline = (patch = {}) => ({ dock: PRIMARY.slice(), wallpaper: walls[0].id, mode: 'fixed', lastApp: 'netflix', theme: 'shore', ...patch });
let preview, current, section = '';

function check(name, pass, detail) {
  const result = { section, name, passed: !!pass, ...(pass ? {} : { detail }) };
  report.checks.push(result);
  if (!pass) { report.failures.push(result); throw Error(name + (detail ? ': ' + JSON.stringify(detail).slice(0, 500) : '')); }
}
async function run(name, fn) {
  if (process.env.CHECK_SECTION && !name.toLowerCase().includes(process.env.CHECK_SECTION.toLowerCase())) return;
  section = name;
  try { await fn(); console.log(name + ': passed'); }
  catch (error) { if (!report.failures.some(f => f.section === name)) report.failures.push({ section: name, error: error.stack }); console.error(name + ': ' + error.message); }
  finally { await closePage(); }
}
async function closePage() { if (current) { current.__closing = true; await current.close(); current = null; } }

// Production still calls its unmodified device.js adapter.
function installHarness({ seed, legacy, mock, catalog, minuteMs, catalogFailure, noFontAPI, storageFailure }) {
  if (!sessionStorage.getItem('__cleanframe_seeded')) {
    if (seed !== undefined) localStorage.setItem('cleanframe.home.v1', typeof seed === 'string' ? seed : JSON.stringify(seed));
    if (legacy !== undefined) localStorage.setItem('cleanframe.shore.v1', typeof legacy === 'string' ? legacy : JSON.stringify(legacy));
    sessionStorage.setItem('__cleanframe_seeded', '1');
  }
  window.ShoreQA = { minuteMs };
  window.__failWrites = !!storageFailure;
  window.__storageAttempts = 0;
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === 'cleanframe.home.v1') window.__storageAttempts++;
    if (window.__failWrites && key === 'cleanframe.home.v1') throw new DOMException('QA storage failure', 'QuotaExceededError');
    return set.call(this, key, value);
  };
  window.__setHidden = value => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  if (noFontAPI) Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
  if (!mock) return;
  window.__tv = { catalog, catalogFailure: !!catalogFailure, launchFailure: false, holdCatalog: false, pending: [], calls: [], catalogCalls: 0 };
  window.tizen = {
    ApplicationControlData: function (key, value) { this.key = key; this.value = value; },
    ApplicationControl: function (operation, uri, mime, category, data) { Object.assign(this, { operation, uri, mime, category, data }); },
    application: {
      getCurrentApplication() { return { appInfo: { id: 'TestHome01.CleanFrame' } }; },
      getAppsInfo(ok, fail) {
        const tv = window.__tv;
        tv.catalogCalls++;
        const finish = () => tv.catalogFailure ? fail({ name: 'UnknownError', message: 'Catalogue unavailable for QA' }) : ok(tv.catalog.map(a => ({ ...a })));
        if (tv.holdCatalog) tv.pending.push({ ok, fail }); else setTimeout(finish, 0);
      },
      launch(id, ok, fail) {
        const tv = window.__tv; tv.calls.push({ method: 'launch', id });
        setTimeout(() => tv.launchFailure ? fail({ name: 'NotFoundError', message: 'App unavailable for QA' }) : ok(), 0);
      },
      launchAppControl(control, id, ok, fail) {
        const tv = window.__tv; tv.calls.push({ method: 'launchAppControl', id, control });
        setTimeout(() => tv.launchFailure ? fail({ name: 'UnknownError', message: 'Screen unavailable for QA' }) : ok(), 0);
      }
    }
  };
}
async function page(options = {}) {
  const { beforeLoad, waitForNetworkIdle = true, ...harnessOptions } = options;
  current = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const owner = current;
  current.setDefaultTimeout(10000);
  const expected = [];
  current.__expectedFailures = expected;
  current.on('pageerror', error => report.pageErrors.push({ section, error: error.message }));
  current.on('response', response => { if (response.status() >= 400 && !expected.some(s => response.url().includes(s))) report.pageErrors.push({ section, status: response.status(), url: response.url() }); });
  current.on('requestfailed', request => {
    if (owner.__closing) return;
    const failure = { section, url: request.url(), error: request.failure()?.errorText };
    if (expected.some(s => request.url().includes(s))) report.expectedNetworkFailures.push(failure);
    else if (failure.error !== 'net::ERR_ABORTED') report.pageErrors.push(failure);
  });
  await current.addInitScript(installHarness, { mock: true, catalog: CATALOG, minuteMs: 60000, seed: baseline(), ...harnessOptions });
  if (beforeLoad) await beforeLoad(current);
  await current.goto(preview.baseURL + '/home/', { waitUntil: 'domcontentloaded' });
  await ready();
  if (waitForNetworkIdle) await current.waitForLoadState('networkidle');
  return current;
}
const state = () => current.evaluate(() => ShoreQA.state());
const stored = () => current.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const call = (method, ...args) => current.evaluate(([m, a]) => ShoreQA[m](...a), [method, args]);
const ready = () => current.waitForFunction(() => window.ShoreQA && typeof ShoreQA.ready === 'function' && ShoreQA.ready(), null, { timeout: 15000 });
const nav = (...keys) => call('nav', keys);
async function act(action) { const result = await call('activate', action); if (result === null || result === false) throw Error('Action unavailable: ' + action); return result; }
async function scene(name) { await call('scene', name); await current.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function look(patch) { await call('look', patch); await ready(); }
async function group(name) {
  await scene('settings'); await act('settings.group.' + name);
  await current.waitForFunction(expected => ShoreQA.state().settingsGroup === expected, name);
}
const settingsSnapshot = () => current.evaluate(() => {
  const s = ShoreQA.state();
  const rendered = [...document.getElementById('stage').classList].filter(c => /^(bg|l|a|u|f|m|font)-/.test(c)).sort();
  return { stored: localStorage.getItem('cleanframe.home.v1'), committed: s.committed, shown: s.shown, rendered, writes: s.writes, storageAttempts: window.__storageAttempts };
});
const choice = (axis, value) => act('choice.' + axis + '.' + value);
const radios = () => current.evaluate(() => [...document.querySelectorAll('#stage [role="radio"]')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => ({ action: e.getAttribute('data-action'), checked: e.getAttribute('aria-checked'), disabled: e.getAttribute('aria-disabled') === 'true', focused: e.classList.contains('is-focus'), text: e.textContent.trim() })));
async function focusedChoice() {
  const action = (await state()).focusAction;
  return (await radios()).find(r => r.action === action);
}
async function unselectedChoice() {
  for (const direction of ['right', 'right', 'down', 'left', 'left', 'down', 'right', 'right', 'down']) {
    await nav(direction);
    const radio = await focusedChoice();
    if (radio && radio.checked === 'false' && !radio.disabled) return radio;
  }
  throw Error('Remote could not reach an unselected choice');
}
async function walkEnabledChoices() {
  const visited = [];
  for (const direction of ['down', 'down', 'right', 'right', 'up', 'left', 'left', 'down', 'down', 'up', 'up']) {
    await nav(direction);
    const focus = await current.evaluate(() => {
      const action = ShoreQA.state().focusAction;
      const el = [...document.querySelectorAll('#stage [data-action]')].find(e => e.getAttribute('data-action') === action && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      return { action, exists: !!el, disabled: el?.getAttribute('aria-disabled') === 'true', count: ShoreQA.where().focusCount };
    });
    visited.push(focus.action);
    if (!focus.exists || focus.disabled || focus.count !== 1) throw Error('Remote ' + direction + ' focused an unavailable choice: ' + JSON.stringify(focus));
  }
  return visited;
}
async function wallpaper() {
  await group('background'); await act('background.wallpaper');
  await current.waitForFunction(() => ShoreQA.state().view === 'wallpaper' && ShoreQA.state().settingsGroup === 'wallpaper');
}
const wallpaperSettled = id => current.waitForFunction(expected => !ShoreQA.state().pending && ShoreQA.state().shown.wall === expected, id);
const wallpaperRowVisible = id => current.waitForFunction(expected => {
  const list = document.querySelector('.wallpaper-list'), row = document.querySelector('[data-action="wallpaper.choose.' + expected + '"]');
  if (!list || !row || getComputedStyle(row).visibility === 'hidden') return false;
  const bounds = list.getBoundingClientRect(), r = row.getBoundingClientRect();
  return r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1;
}, id);
const wallpaperSaved = () => current.evaluate(() => {
  const s = ShoreQA.state(), bg = document.getElementById('sheetBg'), veil = document.querySelector('.sheet-veil');
  const bgStyle = getComputedStyle(bg), veilStyle = getComputedStyle(veil);
  return { stored: localStorage.getItem('cleanframe.home.v1'), committed: s.committed, writes: s.writes, attempts: window.__storageAttempts,
    backdrop: { src: bg.currentSrc || bg.src, opacity: bgStyle.opacity, filter: bgStyle.filter, veil: veilStyle.background, veilOpacity: veilStyle.opacity } };
});
const wallpaperApplied = () => current.locator('.wallpaper-choice[aria-checked="true"]').evaluateAll(elements => elements.map(e => e.getAttribute('data-action')));
const wallpaperBundle = () => current.evaluate(() => Object.fromEntries(['photo', 'matImg', 'phFieldImg', 'phFieldImgAlt', 'utFieldImg', 'utFieldImgAlt'].map(id => [id, document.getElementById(id).currentSrc || document.getElementById(id).src])));
const previewFrame = () => current.evaluate(() => {
  const e = document.getElementById('scene'), r = e.getBoundingClientRect(), css = getComputedStyle(e);
  return { x: r.x, y: r.y, width: r.width, height: r.height, radius: css.borderRadius, transform: css.transform };
});
const wallpaperListGeometry = () => current.evaluate(() => {
  const list = document.querySelector('.wallpaper-list'), bounds = list.getBoundingClientRect(), rows = [...list.querySelectorAll('.wallpaper-choice')];
  const fullyVisible = [], partlyVisible = [], clippedParts = [];
  rows.forEach(row => {
    const r = row.getBoundingClientRect(), action = row.getAttribute('data-action');
    const visible = getComputedStyle(row).visibility !== 'hidden';
    if (visible && r.bottom > bounds.top + 1 && r.top < bounds.bottom - 1) partlyVisible.push(action);
    if (visible && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1) fullyVisible.push(action);
    const parts = [...row.querySelectorAll('.setting-name, .setting-tick svg')].map(e => e.getBoundingClientRect());
    if (parts.some(p => p.x < r.x - 1 || p.right > r.right + 1 || p.y < r.y - 1 || p.bottom > r.bottom + 1)) clippedParts.push(action);
    const name = row.querySelector('.setting-name'), tick = row.querySelector('.setting-tick svg');
    if (name && tick && name.getBoundingClientRect().right > tick.getBoundingClientRect().left + 1) clippedParts.push(action);
  });
  return { fullyVisible, partlyVisible, clippedParts, focus: ShoreQA.state().focusAction, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, top: ShoreQA.state().wallpaperPicker.top };
});
async function editor() { await scene('settings'); await act('settings.editor'); await current.waitForFunction(() => document.querySelector('[data-action^="editor.move."]')); await current.waitForFunction(() => !ShoreQA.state().catalog.loading); }
async function remove(id) { await act('editor.move.' + id); await nav('back', 'right', 'ok'); }
async function library() { await scene('home'); await act('util.apps'); await current.waitForFunction(() => !ShoreQA.state().catalog.loading); }
async function noLiveFilters() {
  return current.evaluate(() => [...document.querySelectorAll('#stage, #stage *')].filter(e => e.getClientRects().length).map(e => {
    const s = getComputedStyle(e); return { tag: e.tagName, cls: e.className, filter: s.filter, backdrop: s.backdropFilter || s.webkitBackdropFilter || 'none' };
  }).filter(s => /blur|url\(/.test(s.filter) || s.backdrop !== 'none'));
}

try {
  preview = await openPreview();
  await run('Legacy preference migration', async () => {
    for (const theme of ['list', 'shore', 'grid']) {
      await page({ seed: baseline({ theme, dock: ['youtube', 'netflix'], wallpaper: walls[1].id, lastApp: 'youtube', mode: '15' }) });
      const s = await state();
      check(theme + ' preserves order, wallpaper and rotation', same(s.dock, ['youtube', 'netflix']) && s.wallpaper === walls[1].id && s.mode === '15' && s.lastApp === 'youtube', s);
      check(theme + ' maps to intended two-layout appearance', s.look.layout === (theme === 'list' ? 'list' : 'dock') && s.look.bg === (theme === 'list' ? 'dark' : 'photo'), s.look);
      await closePage();
    }
    await page({ seed: undefined, legacy: baseline({ theme: 'list', dock: ['netflix'], lastApp: 'netflix' }) });
    check('Old shore key is read', (await state()).dock.length === 1 && (await state()).look.layout === 'list');
    await look({ controls: 'text' });
    check('Next completed edit writes stable home key', (await stored()).dock[0] === 'netflix');
    await current.reload(); await ready();
    check('Migrated preferences survive reload', (await state()).look.controls === 'text' && (await state()).dock[0] === 'netflix');
  });
  await run('Invalid preferences and saved native pins', async () => {
    await page({ seed: '{broken', legacy: baseline({ dock: ['netflix'], lastApp: 'netflix' }) });
    check('Malformed primary recovers valid legacy key', same((await state()).dock, ['netflix']));
    await closePage();
    await page({ seed: { dock: [], wallpaper: 'missing', mode: 'constructor', theme: 'constructor' } });
    const s = await state();
    check('Invalid values recover usable bounded Home', s.dock.length >= 1 && s.dock.length <= 9 && walls.some(w => w.id === s.wallpaper) && ['fixed', 'open', '5', '15', '60'].includes(s.mode), s);
    await closePage();
    await page({ seed: baseline({ dock: [EXTRA, 'netflix'], lastApp: EXTRA }), catalogFailure: true });
    await library();
    check('Discovery failure preserves saved native pin', (await state()).dock.includes(EXTRA));
  });
  await run('Startup fallbacks remain usable', async () => {
    await page({ noFontAPI: true });
    check('Missing font-loading API has usable baseline Home', (await state()).look.font === 'manrope' && (await call('where')).focusCount === 1);
    await closePage();
    await page({ seed: baseline({ mode: 'open' }), storageFailure: true });
    check('Failed open-mode write retains prior photo', (await state()).wallpaper === walls[0].id && (await stored()).wallpaper === walls[0].id);
  });
  await run('Delayed baseline font recovery refreshes layout', async () => {
    const id = 'Qa12345678.LongLabel';
    const seed = baseline({ dock: [id], lastApp: id, look: { bg: 'photo', layout: 'list', apps: 'both', font: 'manrope' },
      appRecords: [{ id, appId: id, name: 'Samsung TV Plus', brand: '', icon: '' }] });
    const plateWidth = () => current.locator('#phScene .ph-plate.is-current').evaluate(e => parseFloat(e.style.width));
    await page({ seed });
    const expected = await plateWidth();
    await closePage();
    let releaseFont;
    const fontGate = new Promise(resolve => { releaseFont = resolve; });
    try {
      await page({ seed, waitForNetworkIdle: false, beforeLoad: async p => {
        await p.route('**/manrope.woff2', async route => { await fontGate; await route.continue(); });
      } });
      check('Slow font starts with a usable fallback', (await state()).fonts.baselineFallback);
      releaseFont();
      await current.waitForFunction(() => !ShoreQA.state().fonts.baselineFallback && ShoreQA.ready());
      const actual = await plateWidth();
      check('Recovered font uses the same plate width as a normal startup', Math.abs(actual - expected) < 1, { actual, expected });
    } finally { releaseFont(); }
  });
  await run('Real catalogue and native launch boundary', async () => {
    await page(); await library();
    const names = await current.locator('[data-action^="apps.open."] .label').allTextContents();
    check('Consumer catalogue excludes services, self and duplicate YouTube', names.length === 12 && names.filter(n => n === 'YouTube').length === 1 && !names.includes('CleanFrame') && !names.includes('Background worker'), names);
    check('Installed names stay text, including HTML punctuation', names.includes(UNSAFE_NAME) && !(await current.evaluate(() => window.__catalogXss)));
    check('Exploration fixtures do not appear', !names.includes('Plex') && !names.includes('Jellyfin'));
    await act('apps.open.' + SPOTIFY); await current.waitForFunction(() => __tv.calls.length > 0);
    check('Extra-brand app launches native ID', (await current.evaluate(() => __tv.calls.at(-1))).id === SPOTIFY);
    await current.evaluate(() => window.dispatchEvent(new Event('focus')));
    await scene('home'); await act('home.app.netflix'); await current.waitForFunction(() => __tv.calls.length === 2);
    check('Primary app keeps verified target', (await current.evaluate(() => __tv.calls.at(-1))).id === IDS[1]);
    await current.evaluate(() => window.dispatchEvent(new Event('focus')));
    await act('util.art'); await current.waitForFunction(() => __tv.calls.length === 3);
    const art = await current.evaluate(() => __tv.calls.at(-1));
    check('Art Mode uses app-control with fullscreen request', art.method === 'launchAppControl' && art.id === 'org.tizen.art-app' && art.control.data.some(d => d.key === 'mode' && d.value[0] === 'fullscreen'), art);
    await current.evaluate(() => window.dispatchEvent(new Event('focus'))); await group('samsung'); await act('samsung.home');
    await current.waitForFunction(() => __tv.calls.length === 4);
    check('Samsung escape keeps CSFS target', (await current.evaluate(() => __tv.calls.at(-1))).id === 'com.samsung.tv.csfs');
    await current.evaluate(() => window.dispatchEvent(new Event('focus'))); await group('samsung'); await act('samsung.settings');
    await current.waitForFunction(() => __tv.calls.length === 5);
    check('TV settings keeps installed target', (await current.evaluate(() => __tv.calls.at(-1))).id === 'com.samsung.tv.coba.setting');
    await current.evaluate(() => { window.dispatchEvent(new Event('focus')); __tv.launchFailure = true; });
    await scene('home'); await act('home.app.netflix'); await current.waitForFunction(() => ShoreQA.where().view === 'message');
    check('Launch failure is shown', /could not|unavailable|try again/i.test(await current.locator('#stage').innerText()));
  });
  await run('Bundled Hulu Jellyfin and Tubi marks on saved pins', async () => {
    const extras = [
      { appId: 'LBUAQX1exg.Hulu', name: 'Hulu', brand: 'hulu' },
      { appId: 'rTn6ClEurC.Jellyfin', name: 'Jellyfin', brand: 'jellyfin' },
      { appId: '3KA0pm7a7V.TubiTV', name: 'Tubi', brand: 'tubi' }
    ];
    const ids = extras.map(a => a.appId);
    await page({ seed: baseline({ dock: ids, lastApp: ids[0], appRecords: extras.map(a => ({ id: a.appId, appId: a.appId, name: a.name, brand: '', icon: '' })) }),
      catalog: CATALOG.concat(extras.map(a => ({ id: a.appId, name: a.name, show: true, iconPath: '' }))) });
    async function hasMarks(prefix) {
      return current.evaluate(({ prefix, extras }) => extras.every(a => {
        const tile = document.querySelector('[data-action="' + prefix + a.appId + '"]');
        return tile && tile.querySelector('[data-mark="' + a.brand + '"] .mk') && !tile.querySelector('.monogram');
      }), { prefix, extras });
    }
    check('Saved pins with missing brand metadata use bundled marks before discovery', await hasMarks('home.app.'));
    for (const bg of ['photo', 'dark', 'light']) for (const layout of ['dock', 'list']) {
      await look({ bg, layout, apps: 'both' });
      check(bg + '/' + layout + ' uses all three matching marks', await hasMarks('home.app.'));
    }
    await library();
    check('App discovery maps all three native IDs to bundled marks', await hasMarks('apps.open.'));
    await scene('home'); await look({ bg: 'photo', layout: 'dock', apps: 'both' });
    await current.reload(); await ready();
    check('Matching marks survive a launcher restart', await hasMarks('home.app.'));
    await current.screenshot({ path: out + 'hulu-jellyfin-tubi-dock.png' });
  });
  await run('Bundled installed utility app marks on saved pins', async () => {
    const extras = [
      { appId: 'org.tizen.browser', name: 'Internet', brand: 'browser' },
      { appId: 'com.samsung.tv.SmartThingsApp', name: 'SmartThings', brand: 'smartthings' },
      { appId: 'com.samsung.tv.AICompanionUILauncher', name: 'Vision AI Companion', brand: 'visionai' },
      { appId: '25emanual1.emanual', name: 'User Guide', brand: 'userguide' },
      { appId: 'HEPsqFNie0.tvplusstandalone', name: 'Samsung TV Plus', brand: 'tvplus' }
    ];
    const ids = extras.map(a => a.appId);
    await page({ seed: baseline({ dock: ids, lastApp: ids[0], appRecords: extras.map(a => ({ id: a.appId, appId: a.appId, name: a.name, brand: '', icon: '' })) }),
      catalog: CATALOG.concat(extras.map(a => ({ id: a.appId, name: a.name, show: true, iconPath: '' }))) });
    async function hasMarks(prefix) {
      return current.evaluate(({ prefix, extras }) => extras.every(a => {
        const tile = document.querySelector('[data-action="' + prefix + a.appId + '"]');
        return tile && tile.querySelector('[data-mark="' + a.brand + '"] .mk') && !tile.querySelector('.monogram');
      }), { prefix, extras });
    }
    check('Saved pins with missing brand metadata use bundled marks before discovery', await hasMarks('home.app.'));
    for (const bg of ['photo', 'dark', 'light']) for (const layout of ['dock', 'list']) {
      await look({ bg, layout, apps: 'both' });
      check(bg + '/' + layout + ' uses all five matching marks', await hasMarks('home.app.'));
    }
    await library();
    check('App discovery maps all five native IDs to bundled marks', await hasMarks('apps.open.'));
    await scene('home'); await look({ bg: 'photo', layout: 'dock', apps: 'both' });
    await current.reload(); await ready();
    check('Matching marks survive a launcher restart', await hasMarks('home.app.'));
    await current.screenshot({ path: out + 'installed-utility-dock.png' });
  });
  await run('Catalogue failure and retry', async () => {
    await page({ catalogFailure: true }); await library();
    check('Catalogue failure leaves Home intact', same((await state()).dock, PRIMARY));
    await current.evaluate(() => { __tv.catalogFailure = false; }); await act('apps.retry');
    await current.waitForSelector('[data-action="apps.open.' + EXTRA + '"]');
    check('Retry displays real installed names', (await current.locator('[data-action^="apps.open."]').count()) === 12);
  });
  await run('Native icon and failed-image fallback', async () => {
    await page({ catalog: CATALOG.map(a => a.id === EXTRA ? { ...a, iconPath: '/home/assets/icons/netflix.svg' } : a) });
    await library();
    await current.waitForFunction(id => { const row = document.querySelector('[data-action="apps.open.' + id + '"]'); const img = row && row.querySelector('img'); return img && img.complete && img.naturalWidth > 0; }, EXTRA);
    check('Unbranded installed app uses its native icon', await current.evaluate(id => { const img = document.querySelector('[data-action="apps.open.' + id + '"] img'); return img && getComputedStyle(img).display !== 'none' && img.parentNode.classList.contains('has-native-icon'); }, EXTRA));
    current.__expectedFailures.push('/missing-native-icon.png');
    await current.evaluate(id => { __tv.catalog.find(a => a.id === id).iconPath = '/home/assets/icons/missing-native-icon.png'; }, EXTRA);
    await library();
    await current.waitForFunction(id => { const img = document.querySelector('[data-action="apps.open.' + id + '"] img'); return img && img.src.includes('/missing-native-icon.png') && img.complete; }, EXTRA);
    const fallback = await current.evaluate(id => {
      const row = document.querySelector('[data-action="apps.open.' + id + '"]'), mark = row.querySelector('.native-icon'), img = mark && mark.querySelector('img');
      return { html: row.innerHTML, src: img && img.src, imageDisplay: img && getComputedStyle(img).display, initialsVisibility: mark && getComputedStyle(mark.firstChild).visibility, complete: img && img.complete, width: img && img.naturalWidth, text: row.textContent };
    }, EXTRA);
    check('Failed native icon leaves readable initials and app name', fallback.imageDisplay === 'none' && fallback.initialsVisibility === 'visible' && fallback.text.includes('Family'), fallback);
  });
  await run('Catalogue response after closing and reopening', async () => {
    await page();
    await current.evaluate(() => { __tv.holdCatalog = true; });
    await act('util.apps'); await nav('back'); await act('util.apps');
    const count = await current.evaluate(() => __tv.pending.length);
    check('Concurrent catalogue entry is coalesced', count === 1, count);
    await current.evaluate(() => { __tv.holdCatalog = false; __tv.pending.shift().ok(__tv.catalog); });
    await current.waitForFunction(() => !ShoreQA.state().catalog.loading);
    check('Delayed catalogue safely fills reopened view', (await call('where')).view === 'apps' && (await state()).catalog.ids.includes(EXTRA) && (await call('where')).focusCount === 1);
  });
  await run('Immediate edits, undo, move cancellation and limits', async () => {
    await page(); await editor();
    const start = (await state()).dock;
    await remove('netflix');
    check('Remove persists membership and keeps installation', !(await stored()).dock.includes('netflix') && (await current.evaluate(() => __tv.catalog.some(a => a.id === 'org.tizen.netflix-app'))));
    check('Focus follows removal into addable apps', (await state()).focusAction === 'editor.add.netflix', (await state()).focusAction);
    await nav('ok'); check('Second OK restores same position', same((await stored()).dock, start));
    await remove('netflix'); await act('editor.undo'); check('Undo persists previous membership', same((await stored()).dock, start));
    await act('editor.move.netflix'); await nav('down'); check('Unfinished move does not write', same((await stored()).dock, start));
    await nav('back'); check('Back cancels unfinished move', same((await state()).dock, start));
    await act('editor.move.netflix'); await nav('down', 'ok');
    const moved = start.slice(); [moved[1], moved[2]] = [moved[2], moved[1]];
    check('Placed move persists immediately', same((await stored()).dock, moved));
    await act('editor.add.' + EXTRA); check('Nine-app cap prevents addition', (await state()).dock.length === 9 && !(await state()).dock.includes(EXTRA));
    await remove('stremio'); await act('editor.add.' + EXTRA);
    check('Native app can be pinned with stable ID', (await stored()).dock.includes(EXTRA) && (await state()).dock.length === 9);
    check('Native pin retains readable metadata for failed discovery', (await stored()).appRecords.some(a => a.id === EXTRA && a.name === UNSAFE_NAME));
    await current.reload(); await ready(); check('Native pin survives reload', (await state()).dock.includes(EXTRA));
    await editor(); const ids = (await state()).dock;
    for (const id of ids.slice(1)) await remove(id);
    await remove(ids[0]); check('Last Home app cannot be removed', same((await state()).dock, [ids[0]]) && same((await stored()).dock, [ids[0]]));
    check('Editor has no Save action', !(await current.locator('#stage').innerText()).match(/\bSave\b/));
  });
  await run('Actual storage failures are atomic', async () => {
    await page(); await editor(); const before = await stored();
    await current.evaluate(() => { window.__failWrites = true; }); await remove('netflix');
    check('Failed removal changes neither committed state nor storage', same((await state()).dock, before.dock) && same(await stored(), before));
    check('Failed write gives visible feedback', /not saved|couldn.t save|tries again/i.test(await current.locator('#stage').innerText()));
    await current.evaluate(() => { window.__failWrites = false; }); await nav('ok');
    check('Retry commits through same action', !(await stored()).dock.includes('netflix'));
    await scene('home'); const old = await state(), oldStored = await stored();
    await current.evaluate(() => { window.__failWrites = true; }); await call('look', { bg: old.look.bg === 'light' ? 'dark' : 'light' });
    await current.waitForFunction(() => !ShoreQA.state().pending);
    check('Failed appearance write keeps display and preferences', (await state()).look.bg === old.look.bg && same(await stored(), oldStored));
  });
  await run('Appearance axes, fonts, scaling and matching materials', async () => {
    await page();
    for (const bg of ['dark', 'light', 'photo']) for (const layout of ['list', 'dock']) for (const focus of ['type', 'glass']) {
      await look({ bg, layout, focus }); const s = await state();
      check('Independent axes ' + [bg, layout, focus].join('/'), s.look.bg === bg && s.look.layout === layout && s.look.focus === focus && s.shown.bg === bg, s.look);
    }
    for (const axis of ['apps', 'controls']) for (const value of ['icons', 'both', 'text']) { await look({ [axis]: value }); check(axis + ' ' + value + ' persists', (await state()).look[axis] === value); }
    await look({ bg: 'photo', layout: 'dock', focus: 'glass', apps: 'both', controls: 'icons' });
    for (const material of ['soft', 'frost', 'tint']) { await look({ material }); check(material + ' matches displayed bundle', (await state()).shown.material === material && (await state()).look.material === material); }
    const fonts = (await state()).fonts.available; check('Font catalogue includes default', fonts.includes('manrope'));
    for (const font of fonts) {
      await look({ font }); check('Font ' + font + ' settles', (await state()).look.font === font && (await state()).shown.font === font);
      if (font === 'newsreader') {
        for (const layout of ['list', 'dock']) for (const controls of ['icons', 'both', 'text']) {
          await look({ layout, controls });
          const wrong = await current.evaluate(() => [...document.querySelectorAll('.home .clock, .home .u, .home .u-label, .home .ph-name, .home .tile .label, .home .app-focus-name, .home .util-focus-label, .home .wall-keep')].filter(e => !/Newsreader/.test(getComputedStyle(e).fontFamily)).map(e => ({ cls: e.className, font: getComputedStyle(e).fontFamily })));
          check('Newsreader covers Home text ' + layout + '/' + controls, wrong.length === 0, wrong);
        }
      }
    }
    await look({ font: 'manrope' });
    for (const wall of walls) { await look({ wall: wall.id }); check('Wallpaper ' + wall.id + ' has matching bundle', (await state()).shown.wall === wall.id && (await state()).wallpaper === wall.id); }
    for (const layout of ['list', 'dock']) for (const width of [1920, 1280]) {
      await current.setViewportSize({ width, height: width * 9 / 16 }); await look({ layout });
      await current.waitForFunction(w => Math.abs(document.getElementById('stage').getBoundingClientRect().width - w) < 1, width);
      const g = await current.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, focus: ShoreQA.where().focusCount }; });
      check(layout + ' fits ' + width + ' with one focus', Math.abs(g.x) < 1 && Math.abs(g.y) < 1 && Math.abs(g.width - width) < 1 && Math.abs(g.height - width * 9 / 16) < 1 && g.focus === 1, g);
      await current.screenshot({ path: out + 'production-' + layout + '-' + width + '.jpg', quality: 90 });
    }
    check('No live blur/backdrop filters', (await noLiveFilters()).length === 0, await noLiveFilters());
    check('No prototype lab controls in production', await current.evaluate(() => !document.querySelector('[data-lab], #lab, #side') && !document.querySelector('script[src*="prototype"]')));
    const before = (await state()).look; await current.reload(); await ready(); check('Appearance survives reload', same((await state()).look, before));
  });
  await run('Settings overview and visible choices', async () => {
    await page(); await scene('settings');
    const expected = ['settings.group.background', 'settings.group.layout', 'settings.group.typography', 'settings.group.focus', 'settings.editor', 'settings.group.samsung'];
    check('Overview has all six settings groups', same((await call('actions')).filter(a => expected.includes(a)).sort(), expected.slice().sort()));
    const specs = {
      background: { bg: ['dark', 'light', 'photo'] },
      layout: { layout: ['list', 'dock'], apps: ['icons', 'both', 'text'], controls: ['icons', 'both', 'text'] },
      typography: { font: (await state()).fonts.available },
      focus: { focus: ['type', 'glass'], material: ['soft', 'frost', 'tint'] }
    };
    for (const [name, axes] of Object.entries(specs)) {
      await group(name);
      const options = await radios(), committed = (await state()).committed;
      for (const [axis, values] of Object.entries(axes)) {
        const rows = options.filter(r => r.action?.startsWith('choice.' + axis + '.'));
        check(name + ' shows every ' + axis + ' choice together', same(rows.map(r => r.action).sort(), values.map(v => 'choice.' + axis + '.' + v).sort()), rows);
        check(axis + ' checked state identifies only the applied choice', same(rows.filter(r => r.checked === 'true').map(r => r.action), ['choice.' + axis + '.' + committed[axis]]), rows);
      }
      check(name + ' detail has no persistent category rail', !(await call('actions')).some(a => a.startsWith('settings.group.')));
      await nav('back');
      check(name + ' Back restores overview category focus', (await state()).view === 'settings' && (await state()).focusAction === 'settings.group.' + name, await call('where'));
    }
    await group('background');
    const backgroundActions = await call('actions');
    check('Photo tools are reachable from Background', backgroundActions.includes('background.wallpaper') && backgroundActions.includes('background.rotation'), backgroundActions);
    await act('background.rotation');
    const rotationRows = await radios();
    check('All five rotation modes are visible together', same(rotationRows.map(r => r.action).sort(), ['fixed', 'open', '5', '15', '60'].map(v => 'rotation.' + v).sort()), rotationRows);
    await nav('back');
    check('Rotation Back restores its Background row', (await state()).settingsGroup === 'background' && (await state()).focusAction === 'background.rotation', await call('where'));
    await group('samsung');
    const samsungActions = await call('actions');
    check('Samsung group shows both native actions', samsungActions.includes('samsung.home') && samsungActions.includes('samsung.settings'));
  });
  await run('Settings focus never changes the applied Home', async () => {
    await page();
    for (const name of ['background', 'layout', 'typography', 'focus', 'samsung']) {
      await group(name); const before = await settingsSnapshot();
      const visited = new Set();
      for (const direction of ['right', 'right', 'down', 'left', 'left', 'down', 'right', 'right', 'down', 'left', 'up', 'up', 'up', 'right']) {
        await nav(direction); visited.add((await state()).focusAction);
        const after = await settingsSnapshot();
        if (!same(after, before)) throw Error(name + ' navigation changed committed state, Home preview or storage: ' + JSON.stringify({ before, after }));
        if ((await call('where')).focusCount !== 1) throw Error(name + ' navigation did not keep one focus');
      }
      check(name + ' arrows browse choices without preview or storage writes', visited.size > 1, [...visited]);
      const firstRadio = (await radios())[0];
      if (firstRadio) {
        await current.locator('[data-action="' + firstRadio.action + '"]').hover();
        check(name + ' pointer hover does not apply a choice', same(await settingsSnapshot(), before));
      }
      await nav('back');
      check(name + ' Back cancels the unconfirmed choice', same(await settingsSnapshot(), before) && (await state()).focusAction === 'settings.group.' + name);
    }
    check('Browsing Samsung does not launch a native app', (await current.evaluate(() => __tv.calls.length)) === 0);
    await group('background'); await act('background.rotation'); const before = await settingsSnapshot();
    await nav('down', 'down', 'up', 'right', 'left');
    check('Rotation arrows do not save a mode', same(await settingsSnapshot(), before));
    await nav('back'); check('Unconfirmed Rotation choice is cancelled', same(await settingsSnapshot(), before) && (await state()).settingsGroup === 'background');
  });
  await run('Settings on-screen Back preserves choice focus', async () => {
    await page(); await group('layout'); const before = await settingsSnapshot();
    const candidate = await unselectedChoice();
    await act('settings.back');
    check('On-screen Back returns to the matching overview category', (await state()).view === 'settings' && (await state()).focusAction === 'settings.group.layout');
    check('On-screen Back keeps unconfirmed choice unapplied', same(await settingsSnapshot(), before));
    await act('settings.group.layout');
    check('Reopening restores the last real choice after on-screen Back', (await state()).focusAction === candidate.action, { expected: candidate.action, actual: (await state()).focusAction });
    await nav('back'); await act('settings.group.layout');
    check('Physical Back also preserves the last real choice', (await state()).focusAction === candidate.action);
  });
  await run('Settings OK applies explicit choices atomically', async () => {
    await page();
    const specs = [
      ['background', 'bg', ['dark', 'light', 'photo']],
      ['layout', 'layout', ['list', 'dock']],
      ['layout', 'apps', ['icons', 'text', 'both']],
      ['layout', 'controls', ['text', 'both', 'icons']],
      ['typography', 'font', (await state()).fonts.available],
      ['focus', 'focus', ['type', 'glass']],
      ['focus', 'material', ['frost', 'tint', 'soft']]
    ];
    for (const [name, axis, values] of specs) {
      await group(name);
      const selected = await settingsSnapshot(); await choice(axis, selected.committed[axis]); await ready();
      check(axis + ' OK on applied choice does not write again', same(await settingsSnapshot(), selected));
      for (const value of values) {
        const before = await settingsSnapshot(); await choice(axis, value); await ready();
        const after = await settingsSnapshot(), rows = await radios();
        const expectedWrites = before.writes + (before.committed[axis] === value ? 0 : 1);
        const untouched = { ...after.committed, [axis]: before.committed[axis] };
        const prefix = { bg: 'bg', layout: 'l', apps: 'a', controls: 'u', focus: 'f', material: 'm', font: 'font' }[axis];
        const shown = !Object.hasOwn(after.shown, axis) || after.shown[axis] === value;
        check(axis + ' OK applies ' + value + ' once', after.committed[axis] === value && shown && after.rendered.includes(prefix + '-' + value) && same(untouched, before.committed) && expectedWrites === after.writes && after.storageAttempts - before.storageAttempts === expectedWrites - before.writes && rows.some(r => r.action === 'choice.' + axis + '.' + value && r.checked === 'true'), { before, after, rows });
      }
      const applied = await settingsSnapshot(); await nav('back');
      check(axis + ' applied choice survives Back', same(await settingsSnapshot(), applied) && (await state()).focusAction === 'settings.group.' + name);
    }
    await group('background'); await act('background.rotation');
    const selected = await settingsSnapshot(); await act('rotation.' + selected.committed.mode);
    check('Rotation OK on applied mode does not write again', same(await settingsSnapshot(), selected));
    for (const value of ['open', '5', '15', '60', 'fixed']) {
      const before = await settingsSnapshot(); await act('rotation.' + value);
      check('Rotation OK applies ' + value + ' once', (await state()).mode === value && (await stored()).mode === value && (await state()).writes === before.writes + 1 && (await radios()).some(r => r.action === 'rotation.' + value && r.checked === 'true'));
    }
    await group('layout'); const before = await settingsSnapshot(), candidate = await unselectedChoice();
    const [, axis, value] = candidate.action.split('.');
    await current.keyboard.down('Enter'); await current.keyboard.down('Enter'); await ready();
    check('Held physical OK applies the focused choice once', (await state()).committed[axis] === value && (await state()).writes === before.writes + 1);
    await current.keyboard.up('Enter');
    await current.keyboard.down('Escape'); await current.keyboard.down('Escape');
    check('Held physical Back closes one settings layer', (await state()).view === 'settings' && (await state()).focusAction === 'settings.group.layout');
    await current.keyboard.up('Escape');
  });
  await run('Settings inactive Material retains its choice', async () => {
    await page(); await look({ material: 'tint' });
    for (const patch of [{ bg: 'dark' }, { bg: 'light' }, { bg: 'photo', layout: 'list', focus: 'type' }]) {
      await look(patch); await group('focus'); const before = await settingsSnapshot();
      const materials = (await radios()).filter(r => r.action.startsWith('choice.material.'));
      check('Material stays visible but inactive for ' + JSON.stringify(patch), materials.length === 3 && materials.every(r => r.disabled) && materials.some(r => r.action === 'choice.material.tint' && r.checked === 'true'), materials);
      const focusBefore = (await state()).focusAction;
      await current.locator('[data-action="choice.material.frost"]').click({ force: true });
      check('Inactive Material ignores pointer focus and application', same(await settingsSnapshot(), before) && (await state()).focusAction === focusBefore);
      await walkEnabledChoices();
      check('Remote navigation skips inactive Material', same(await settingsSnapshot(), before));
      const reason = await current.locator('.setting-reason:visible').allTextContents();
      check('Inactive Material has a visible explanation', reason.some(text => /material/i.test(text) && text.length > 20), reason);
    }
    await look({ bg: 'photo', layout: 'dock', focus: 'glass' }); await group('focus');
    const materials = (await radios()).filter(r => r.action.startsWith('choice.material.'));
    check('Applicable Material restores the remembered selection', materials.every(r => !r.disabled) && materials.some(r => r.action === 'choice.material.tint' && r.checked === 'true'));
  });
  await run('Settings inactive photo tools retain wallpaper preferences', async () => {
    await page();
    for (const bg of ['dark', 'light']) {
      await look({ bg }); await group('background'); const before = await settingsSnapshot();
      for (const action of ['background.wallpaper', 'background.rotation']) {
        check(bg + ' marks ' + action + ' inactive', await current.locator('[data-action="' + action + '"]').getAttribute('aria-disabled') === 'true');
        const focusBefore = (await state()).focusAction;
        await current.locator('[data-action="' + action + '"]').click({ force: true });
        check('Inactive ' + action + ' ignores pointer focus and keeps preferences', same(await settingsSnapshot(), before) && (await state()).settingsGroup === 'background' && (await state()).focusAction === focusBefore);
      }
      await walkEnabledChoices();
      check(bg + ' remote navigation skips inactive photo tools', same(await settingsSnapshot(), before));
      const reason = await current.locator('.setting-reason:visible').allTextContents();
      check(bg + ' explains how to enable photo tools', reason.some(text => /photo/i.test(text) && /wallpaper|rotation/i.test(text)), reason);
    }
  });
  await run('Settings normalises remembered inactive focus', async () => {
    await page(); await group('focus'); await choice('material', 'tint'); await ready();
    await nav('back'); await act('settings.group.background'); await choice('bg', 'dark'); await ready();
    await nav('back'); await act('settings.group.focus');
    const focus = await focusedChoice();
    check('Inactive remembered Material returns to an enabled focus choice', focus && !focus.disabled && focus.action.startsWith('choice.focus.'), focus);
    check('Changing Background preserves remembered Material', (await state()).look.material === 'tint');
    await look({ bg: 'photo' }); await group('background'); await act('background.rotation'); await act('rotation.fixed');
    await look({ bg: 'dark' }); const before = await settingsSnapshot();
    check('All-inactive Rotation restores its enabled Back action', (await state()).focusAction === 'settings.back');
    const visited = await walkEnabledChoices();
    check('All-inactive Rotation traps focus on its enabled Back action', visited.every(a => a === 'settings.back') && same(await settingsSnapshot(), before), visited);
    await current.locator('[data-action="rotation.5"]').click({ force: true });
    check('Inactive Rotation ignores pointer clicks', (await state()).focusAction === 'settings.back' && same(await settingsSnapshot(), before));
    await nav('back');
    const returned = await focusedChoice();
    check('Rotation Back skips its now-inactive Background row', (await state()).settingsGroup === 'background' && returned && !returned.disabled && returned.action.startsWith('choice.bg.'), returned);
  });
  await run('Settings Back cancels pending assets and late callbacks', async () => {
    await page(); await group('focus'); const before = await settingsSnapshot();
    const held = [], pattern = '**/*-field-frost.jpg';
    let releaseImages;
    const blocked = new Promise(resolve => { releaseImages = resolve; });
    await current.route(pattern, async route => { held.push(route.request().url()); await blocked; await route.continue(); });
    try {
      await choice('material', 'frost'); await current.waitForFunction(() => !!ShoreQA.state().pending);
      check('Pending choice keeps the committed Home and storage', same(await settingsSnapshot(), before));
      await nav('back'); await ready();
      check('Back cancels pending choice and restores category focus', same(await settingsSnapshot(), before) && (await state()).view === 'settings' && (await state()).focusAction === 'settings.group.focus');
      releaseImages();
      await current.waitForLoadState('networkidle');
      check('Late image completion cannot commit a cancelled choice', held.length > 0 && same(await settingsSnapshot(), before) && !(await state()).pending);
    } finally { releaseImages(); await current.unroute(pattern); }
  });
  await run('Settings Back cancels a delayed font choice', async () => {
    await page(); await group('typography'); const before = await settingsSnapshot();
    const held = [], pattern = '**/fonts/newsreader/*';
    let releaseFont;
    const blocked = new Promise(resolve => { releaseFont = resolve; });
    await current.route(pattern, async route => { held.push(route.request().url()); await blocked; await route.continue(); });
    try {
      await choice('font', 'newsreader'); await current.waitForFunction(() => !!ShoreQA.state().pending);
      check('Loading a font keeps applied typography and its checked choice', same(await settingsSnapshot(), before) && (await radios()).some(r => r.action === 'choice.font.manrope' && r.checked === 'true'));
      await nav('back'); await ready();
      check('Back cancels the font choice and restores Typography focus', same(await settingsSnapshot(), before) && (await state()).focusAction === 'settings.group.typography');
      releaseFont(); await current.waitForLoadState('networkidle');
      check('Late font completion cannot apply the cancelled choice', held.length > 0 && same(await settingsSnapshot(), before) && !(await state()).pending);
      await group('typography'); await choice('font', 'newsreader'); await ready();
      check('Cancelled font remains available for a fresh explicit apply', (await state()).look.font === 'newsreader' && (await state()).shown.font === 'newsreader' && (await state()).writes === before.writes + 1);
    } finally { releaseFont(); await current.unroute(pattern); }
  });
  await run('Settings choice failure and explicit retry', async () => {
    await page(); await group('focus'); const original = await settingsSnapshot();
    current.__expectedFailures.push('-field-frost.jpg');
    await current.route('**/*-field-frost.jpg', route => route.abort('failed'));
    await choice('material', 'frost'); await current.waitForFunction(() => !ShoreQA.state().pending);
    check('Failed image keeps the applied radio and Home', same(await settingsSnapshot(), original) && (await radios()).some(r => r.action === 'choice.material.soft' && r.checked === 'true'));
    check('Failed explicit choice exposes Retry', (await call('actions')).includes('settings.retry'));
    await current.unroute('**/*-field-frost.jpg'); await act('settings.retry'); await ready();
    check('Retry applies the same failed choice', (await state()).look.material === 'frost' && (await state()).shown.material === 'frost' && (await state()).writes === original.writes + 1);
    await group('background'); const before = await settingsSnapshot();
    await current.evaluate(() => { __failWrites = true; }); await choice('bg', 'light');
    await current.waitForFunction(() => !ShoreQA.state().pending);
    const failed = await settingsSnapshot();
    check('Failed choice write keeps the committed radio and preview', same(failed.committed, before.committed) && same(failed.shown, before.shown) && failed.stored === before.stored && failed.writes === before.writes && (await radios()).some(r => r.action === 'choice.bg.photo' && r.checked === 'true'));
    await current.evaluate(() => { __failWrites = false; }); await act('settings.retry'); await ready();
    check('Storage Retry applies once through the explicit choice', (await state()).look.bg === 'light' && (await state()).shown.bg === 'light' && (await state()).writes === before.writes + 1);
  });
  await run('Settings choices fit both target viewports', async () => {
    await page();
    for (const width of [1920, 1280]) {
      await current.setViewportSize({ width, height: width * 9 / 16 });
      await current.waitForFunction(w => Math.abs(document.getElementById('stage').getBoundingClientRect().width - w) < 1, width);
      for (const name of ['background', 'layout', 'typography', 'focus', 'samsung', 'rotation']) {
        await group(name === 'rotation' ? 'background' : name);
        if (name === 'rotation') await act('background.rotation');
        const geometry = await current.evaluate(() => {
          const stage = document.getElementById('stage').getBoundingClientRect();
          const actions = ShoreQA.actions();
          return [...document.querySelectorAll('#stage [data-action]')].filter(e => actions.includes(e.getAttribute('data-action')) && e.getClientRects().length).map(e => {
            const r = e.getBoundingClientRect();
            const parts = [...e.querySelectorAll('.setting-name, .setting-tick svg')].map(part => part.getBoundingClientRect());
            const partsFit = parts.every(p => p.x >= r.x - 1 && p.y >= r.y - 1 && p.right <= r.right + 1 && p.bottom <= r.bottom + 1);
            const name = e.querySelector('.setting-name'), tick = e.querySelector('.setting-tick svg');
            const noOverlap = !name || !tick || name.getBoundingClientRect().right <= tick.getBoundingClientRect().left + 1;
            return { action: e.getAttribute('data-action'), inside: r.x >= stage.x - 1 && r.y >= stage.y - 1 && r.right <= stage.right + 1 && r.bottom <= stage.bottom + 1, fits: e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1 && partsFit && noOverlap, width: r.width, height: r.height };
          });
        });
        check(name + ' choices fit ' + width + ' without clipping', geometry.length > 0 && geometry.every(g => g.inside && g.fits) && (await call('where')).focusCount === 1, geometry);
        await current.screenshot({ path: out + 'settings-' + name + '-' + width + '.jpg', quality: 90 });
      }
    }
    check('Settings retains pre-rendered materials without live blur', (await noLiveFilters()).length === 0, await noLiveFilters());
  });
  await run('Wallpaper failure, preview cancellation and lazy loading', async () => {
    await page();
    const resources = await current.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
    check('No wallpaper thumbnails loaded at startup', !resources.some(u => /-thumb\./.test(u)), resources.filter(u => /thumb/.test(u)));
    await wallpaper();
    const original = (await stored()).wallpaper;
    await nav('down'); await wallpaperSettled(walls[1].id);
    check('Preview leaves saved photo unchanged', (await stored()).wallpaper === original);
    await nav('back'); await ready(); check('Back restores committed photo', (await state()).shown.wall === original);
    check('Wallpaper Back returns to its Background row', (await state()).settingsGroup === 'background' && (await state()).focusAction === 'background.wallpaper');
    await scene('home'); const target = walls.find(w => w.id !== original && w.id !== walls[1].id).id;
    current.__expectedFailures.push('/' + target + '-');
    await current.route('**/*' + target + '-*.jpg', route => route.abort('failed'));
    const before = await stored(); await call('look', { wall: target });
    await current.waitForFunction(() => !ShoreQA.state().pending, null, { timeout: 15000 });
    check('Failed load keeps saved and displayed photo', same(await stored(), before) && (await state()).shown.wall === original);
    await current.unroute('**/*' + target + '-*.jpg'); await look({ wall: target });
    check('Material can recover after failure', (await state()).shown.wall === target);
  });
  await run('Wallpaper child keeps the Settings frame at both sizes', async () => {
    await page();
    for (const width of [1920, 1280]) for (const layout of ['list', 'dock']) {
      await scene('home'); await look({ layout });
      await current.setViewportSize({ width, height: width * 9 / 16 });
      await current.waitForFunction(w => Math.abs(document.getElementById('stage').getBoundingClientRect().width - w) < 1, width);
      await group('background'); const frame = await previewFrame(), before = await wallpaperSaved();
      await act('background.wallpaper');
      await current.waitForFunction(() => ShoreQA.state().view === 'wallpaper');
      const names = await current.locator('.wallpaper-choice .setting-name').allTextContents();
      check(layout + ' Wallpaper shows all fifteen named choices at ' + width, same(names, walls.map(w => w.name)), names);
      check('Wallpaper entry keeps the existing Home frame ' + layout + '/' + width, same(await previewFrame(), frame));
      const first = await wallpaperListGeometry();
      check('Wallpaper list shows about six rows with contained labels ' + layout + '/' + width, first.fullyVisible.length >= 5 && first.fullyVisible.length <= 6 && first.partlyVisible.length <= 7 && first.clippedParts.length === 0 && first.fullyVisible.includes(first.focus) && (await call('where')).focusCount === 1, first);
      await nav('down', 'down'); await wallpaperSettled(walls[2].id);
      check('Browsing preserves saved photo and Settings backdrop ' + layout + '/' + width, same(await wallpaperSaved(), before));
      check('Browsing stays in the same right Home frame ' + layout + '/' + width, same(await previewFrame(), frame));
      check('Applied tick stays separate from preview focus ' + layout + '/' + width, same(await wallpaperApplied(), ['wallpaper.choose.' + before.committed.wall]) && (await state()).focusAction === 'wallpaper.choose.' + walls[2].id && (await state()).shown.wall === walls[2].id && (await call('where')).focusCount === 1);
      await current.screenshot({ path: out + 'wallpaper-' + layout + '-' + width + '.jpg', quality: 90 });
      await nav('back'); await ready();
      check('Wallpaper Back restores its Background row ' + layout + '/' + width, (await state()).settingsGroup === 'background' && (await state()).focusAction === 'background.wallpaper' && (await state()).shown.wall === before.committed.wall && same(await previewFrame(), frame));
    }
  });
  await run('Wallpaper applies in place and Back keeps the latest applied photo', async () => {
    await page(); await wallpaper(); const before = await wallpaperSaved();
    check('Applied wallpaper omits the redundant Apply hint', !/apply.*photo/i.test(await current.locator('#appearanceDesc').innerText()));
    await nav('down'); await wallpaperSettled(walls[1].id);
    check('A browsed photo is not saved by focus', same(await wallpaperSaved(), before));
    check('Unsaved preview explains the OK action', /apply.*photo/i.test(await current.locator('#appearanceDesc').innerText()));
    await nav('ok'); await ready();
    const applied = await wallpaperSaved();
    check('OK applies once while staying inside Wallpaper', (await state()).view === 'wallpaper' && applied.committed.wall === walls[1].id && applied.writes === before.writes + 1 && applied.attempts === before.attempts + 1 && same(await wallpaperApplied(), ['wallpaper.choose.' + walls[1].id]));
    check('Successful apply clears its redundant Apply hint', !/apply.*photo/i.test(await current.locator('#appearanceDesc').innerText()));
    check('Applied photo updates the committed Settings backdrop', applied.backdrop.src.includes('/' + walls[1].id + '-panel.jpg'));
    await nav('ok'); await current.keyboard.down('Enter'); await current.keyboard.down('Enter'); await current.keyboard.up('Enter');
    check('Repeated OK on the applied photo is a no-op', same(await wallpaperSaved(), applied));
    await nav('down'); await wallpaperSettled(walls[2].id); await nav('back'); await ready();
    check('Back after apply restores the latest applied photo', (await state()).shown.wall === walls[1].id && same(await wallpaperSaved(), applied) && (await state()).focusAction === 'background.wallpaper');
    await act('background.wallpaper');
    check('Reopening starts at the applied photo', (await state()).focusAction === 'wallpaper.choose.' + walls[1].id && (await state()).wallpaperPicker.candidate === walls[1].id);
    await current.locator('[data-action="wallpaper.choose.' + walls[3].id + '"]').hover();
    check('Pointer hover does not apply or preview another photo', same(await wallpaperSaved(), applied) && (await state()).shown.wall === walls[1].id);
    await current.locator('[data-action="wallpaper.choose.' + walls[3].id + '"]').click(); await ready();
    check('A pointer row click applies that photo once', (await state()).committed.wall === walls[3].id && (await state()).writes === applied.writes + 1 && (await state()).view === 'wallpaper');
    await act('wallpaper.back'); await ready();
    check('On-screen Wallpaper Back restores Background focus', (await state()).settingsGroup === 'background' && (await state()).focusAction === 'background.wallpaper' && (await state()).shown.wall === walls[3].id);
  });
  await run('Wallpaper navigation is bounded and scrolls the catalogue', async () => {
    await page(); await wallpaper(); const before = await wallpaperSaved();
    await nav('up');
    check('Up from the first wallpaper reaches Back without wrapping', (await state()).focusAction === 'wallpaper.back' && (await state()).shown.wall === walls[0].id);
    check('Back still shows its return hint', /background|return/i.test(await current.locator('#appearanceDesc').innerText()));
    await nav('down');
    check('Down from Back restores the current candidate', (await state()).focusAction === 'wallpaper.choose.' + walls[0].id);
    await nav(...Array(walls.length - 1).fill('down')); await wallpaperSettled(walls.at(-1).id); await wallpaperRowVisible(walls.at(-1).id);
    const end = await wallpaperListGeometry();
    check('Last wallpaper scrolls fully into view', end.fullyVisible.includes('wallpaper.choose.' + walls.at(-1).id) && end.top > 0 && end.clippedParts.length === 0, end);
    await nav('down', 'down');
    check('Down at the catalogue end does not wrap', (await state()).focusAction === 'wallpaper.choose.' + walls.at(-1).id && same(await wallpaperSaved(), before));
    await nav('left'); check('Left from a scrolled row reaches Back', (await state()).focusAction === 'wallpaper.back');
    await nav('right'); check('Right from Back restores the scrolled candidate', (await state()).focusAction === 'wallpaper.choose.' + walls.at(-1).id);
    const top = (await state()).wallpaperPicker.top;
    await nav(...Array(walls.length - 1 - top).fill('up')); await wallpaperSettled(walls[top].id);
    await nav('up'); await wallpaperSettled(walls[top - 1].id);
    check('Up from a scrolled top row continues the catalogue', (await state()).focusAction === 'wallpaper.choose.' + walls[top - 1].id && (await state()).view === 'wallpaper');
    await nav(...Array(top - 1).fill('up')); await wallpaperSettled(walls[0].id); await wallpaperRowVisible(walls[0].id);
    const start = await wallpaperListGeometry();
    check('Returning to the first wallpaper resets scrolling', start.top === 0 && start.fullyVisible.includes('wallpaper.choose.' + walls[0].id), start);
    await nav('up', 'up');
    check('Repeated Up stops at Back with no preference writes', (await state()).focusAction === 'wallpaper.back' && same(await wallpaperSaved(), before));
  });
  await run('Wallpaper rapid browsing debounces work and OK is never lost', async () => {
    await page(); await wallpaper(); const before = await wallpaperSaved();
    const immediate = await current.evaluate(() => {
      const at = performance.now(); ShoreQA.nav('down', 'down', 'down');
      return { at, action: ShoreQA.state().focusAction, shown: ShoreQA.state().shown.wall };
    });
    check('Rapid browsing updates row focus before loading the preview', immediate.action === 'wallpaper.choose.' + walls[3].id && immediate.shown === walls[0].id, immediate);
    await wallpaperSettled(walls[3].id);
    const resources = await current.evaluate(() => performance.getEntriesByType('resource').map(r => ({ name: r.name, start: r.startTime })));
    const latest = resources.find(r => r.name.endsWith('/wallpapers/' + walls[3].id + '.jpg'));
    check('Preview work waits for focus to settle', latest && latest.start - immediate.at >= 100, { delay: latest && latest.start - immediate.at });
    check('Fast skipped rows do not load their full wallpaper bundles', !resources.some(r => [walls[1].id, walls[2].id].some(id => r.name.endsWith('/wallpapers/' + id + '.jpg') || r.name.includes('/materials/' + id + '-'))));
    check('Debounced preview never saves from focus', same(await wallpaperSaved(), before));
    await nav('down', 'ok');
    await current.waitForFunction(id => ShoreQA.state().committed.wall === id && !ShoreQA.state().pending, walls[4].id);
    check('OK during focus debounce applies the current candidate once', (await state()).writes === before.writes + 1 && (await state()).shown.wall === walls[4].id && (await state()).view === 'wallpaper');
  });
  await run('Wallpaper newer previews cancel older queued applies', async () => {
    await page(); await wallpaper(); const before = await wallpaperSaved();
    const first = walls[1].id, latest = walls[2].id, pattern = '**/wallpapers/' + first + '.jpg', held = [];
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    await current.route(pattern, async route => { held.push(route.request().url()); await blocked; await route.continue(); });
    try {
      await nav('down'); await current.waitForFunction(id => ShoreQA.state().pending && ShoreQA.state().pending.target.wall === id, first);
      await nav('ok'); check('OK while loading records one explicit apply request', !!(await state()).wallpaperPicker.applyPending && same(await wallpaperSaved(), before));
      await nav('down'); await wallpaperSettled(latest);
      check('Browsing away cancels the queued apply', !(await state()).wallpaperPicker.applyPending && same(await wallpaperSaved(), before));
      check('Latest preview installs a matching photo and material bundle', Object.values(await wallpaperBundle()).every(src => src.includes('/' + latest)), await wallpaperBundle());
      release(); await current.waitForLoadState('networkidle');
      check('Older completion cannot overwrite or apply the latest preview', held.length > 0 && (await state()).shown.wall === latest && Object.values(await wallpaperBundle()).every(src => src.includes('/' + latest)) && same(await wallpaperSaved(), before));
      await nav('back'); await ready();
      check('Back restores the complete committed bundle after rapid browsing', Object.values(await wallpaperBundle()).every(src => src.includes('/' + before.committed.wall)));
    } finally { release(); await current.unroute(pattern); }
  });
  await run('Wallpaper Back cancels loading and queued applies', async () => {
    await page(); await wallpaper();
    await current.locator('[data-action="wallpaper.choose.' + walls[1].id + '"]').click(); await ready();
    const applied = await wallpaperSaved();
    for (const [index, back] of [[2, 'remote'], [3, 'pointer']]) {
      if ((await state()).view !== 'wallpaper') await act('background.wallpaper');
      const target = walls[index].id, pattern = '**/wallpapers/' + target + '.jpg', held = [];
      let release;
      const blocked = new Promise(resolve => { release = resolve; });
      await current.route(pattern, async route => { held.push(route.request().url()); await blocked; await route.continue(); });
      try {
        await act('wallpaper.choose.' + target);
        await current.waitForFunction(() => !!ShoreQA.state().pending && !!ShoreQA.state().wallpaperPicker.applyPending);
        if (back === 'remote') await nav('back'); else await current.locator('[data-action="wallpaper.back"]').click();
        await ready();
        check(back + ' Back cancels pending apply and returns to Wallpaper row', (await state()).focusAction === 'background.wallpaper' && (await state()).shown.wall === applied.committed.wall && same(await wallpaperSaved(), applied));
        release(); await current.waitForLoadState('networkidle');
        check(back + ' Back ignores late completion and keeps latest applied photo', held.length > 0 && (await state()).shown.wall === applied.committed.wall && same(await wallpaperSaved(), applied));
      } finally { release(); await current.unroute(pattern); }
    }
  });
  await run('Wallpaper preview failure restores committed photo and retries preview only', async () => {
    await page(); await wallpaper(); const before = await wallpaperSaved();
    await nav('down'); await wallpaperSettled(walls[1].id);
    const target = walls[2].id, pattern = '**/wallpapers/' + target + '.jpg';
    current.__expectedFailures.push('/wallpapers/' + target + '.jpg');
    await current.route(pattern, route => route.abort('failed'));
    await nav('down'); await current.waitForFunction(() => ShoreQA.actions().includes('wallpaper.retry'));
    check('Failed browse restores the committed frame rather than another unsaved preview', (await state()).shown.wall === before.committed.wall && same(await wallpaperSaved(), before) && same(await wallpaperApplied(), ['wallpaper.choose.' + before.committed.wall]));
    check('Failed candidate remains identified for retry', (await state()).wallpaperPicker.candidate === target && /couldn.t|failed|try again/i.test(await current.locator('#appearance').innerText()));
    await current.unroute(pattern); await act('wallpaper.retry'); await wallpaperSettled(target);
    check('Retrying a failed browse does not authorise a save', same(await wallpaperSaved(), before) && !(await state()).wallpaperPicker.applyPending);
    check('Successful preview Retry returns focus to its candidate', (await state()).focusAction === 'wallpaper.choose.' + target);
    await nav('ok'); await ready();
    check('Explicit OK can apply the recovered preview', (await state()).committed.wall === target && (await state()).writes === before.writes + 1);
  });
  await run('Wallpaper explicit apply and storage failures preserve applied state', async () => {
    await page(); await wallpaper(); const before = await wallpaperSaved();
    const target = walls[2].id, pattern = '**/wallpapers/' + target + '.jpg';
    current.__expectedFailures.push('/wallpapers/' + target + '.jpg');
    await current.route(pattern, route => route.abort('failed'));
    await act('wallpaper.choose.' + target); await current.waitForFunction(() => ShoreQA.actions().includes('wallpaper.retry'));
    check('Failed explicit apply changes no committed photo, tick or storage', same(await wallpaperSaved(), before) && same(await wallpaperApplied(), ['wallpaper.choose.' + before.committed.wall]));
    await current.unroute(pattern); await act('wallpaper.retry'); await ready();
    check('Retry preserves explicit apply intent and stays in the picker', (await state()).committed.wall === target && (await state()).writes === before.writes + 1 && (await state()).view === 'wallpaper');
    const applied = await wallpaperSaved(), requests = [];
    current.on('request', request => { if (request.url().endsWith('/wallpapers/' + walls[3].id + '.jpg') || request.url().includes('/materials/' + walls[3].id + '-')) requests.push(request.url()); });
    await nav('down'); await wallpaperSettled(walls[3].id);
    const loadedRequests = requests.length;
    await current.evaluate(() => { __failWrites = true; }); await nav('ok');
    await current.waitForFunction(() => ShoreQA.actions().includes('wallpaper.retry'));
    const failed = await wallpaperSaved();
    check('Failed wallpaper save preserves applied photo, tick and backdrop', failed.stored === applied.stored && same(failed.committed, applied.committed) && same(failed.backdrop, applied.backdrop) && failed.writes === applied.writes && same(await wallpaperApplied(), ['wallpaper.choose.' + target]));
    check('Storage failure restores the committed frame and names the failed candidate', (await state()).shown.wall === target && Object.values(await wallpaperBundle()).every(src => src.includes('/' + target)) && (await state()).wallpaperPicker.candidate === walls[3].id && (await current.locator('#appearance').innerText()).includes(walls[3].name));
    await current.evaluate(() => { __failWrites = false; }); await act('wallpaper.retry'); await ready();
    check('Storage Retry applies the candidate exactly once', (await state()).committed.wall === walls[3].id && (await state()).writes === applied.writes + 1 && (await state()).view === 'wallpaper');
    check('Storage Retry reuses the already-loaded wallpaper bundle', loadedRequests > 0 && requests.length === loadedRequests, requests);
  });
  await run('Wallpaper thumbnails fail without breaking the list or full photo', async () => {
    await page(); const target = walls[5], pattern = '**/wallpapers/' + target.id + '-thumb.jpg';
    current.__expectedFailures.push('/wallpapers/' + target.id + '-thumb.jpg');
    await current.route(pattern, route => route.abort('failed'));
    await wallpaper();
    await current.waitForFunction(id => {
      const slot = document.querySelector('[data-action="wallpaper.choose.' + id + '"] .wallpaper-thumb');
      return slot && slot.classList.contains('is-missing');
    }, target.id);
    await nav(...Array(5).fill('down')); await wallpaperSettled(target.id);
    const fallback = await current.evaluate(id => {
      const row = document.querySelector('[data-action="wallpaper.choose.' + id + '"]'), slot = row.querySelector('.wallpaper-thumb'), img = slot.querySelector('img');
      const r = row.getBoundingClientRect(), b = slot.getBoundingClientRect();
      return { name: row.textContent, slotVisible: getComputedStyle(slot).display !== 'none' && b.width > 0 && b.height > 0,
        ratio: b.width / b.height, inside: b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom,
        imageHidden: !img || getComputedStyle(img).display === 'none' || getComputedStyle(img).visibility === 'hidden' };
    }, target.id);
    check('Broken thumbnail keeps its named 16:9 slot without a broken image glyph', fallback.name.includes(target.name) && fallback.slotVisible && fallback.inside && Math.abs(fallback.ratio - 16 / 9) < 0.05 && fallback.imageHidden, fallback);
    await nav('ok'); await ready();
    check('A missing thumbnail does not prevent applying its full photo', (await state()).committed.wall === target.id && Object.values(await wallpaperBundle()).every(src => src.includes('/' + target.id)));
  });
  await run('Physical-key repeats and Back hierarchy', async () => {
    await page(); await editor(); await remove('netflix');
    await current.keyboard.down('Enter'); await current.keyboard.down('Enter');
    check('Held OK restores once without removing again', (await state()).dock.includes('netflix') && (await state()).dock.length === 9);
    await current.keyboard.up('Enter');
    await current.keyboard.down('Escape'); await current.keyboard.down('Escape');
    check('Held Back closes one layer only', (await call('where')).view === 'settings' && (await state()).focusAction === 'settings.editor');
    await current.keyboard.up('Escape'); await current.keyboard.press('Escape');
    check('Released Back reaches Home', (await call('where')).view === 'home');
  });
  await run('Rotation pauses and warm return', async () => {
    await page({ minuteMs: 120 });
    await group('background'); await act('background.rotation'); await act('rotation.5'); await scene('home');
    const first = (await state()).wallpaper;
    await current.waitForFunction(id => ShoreQA.state().wallpaper !== id, first, { timeout: 4000 });
    check('Timed rotation advances on photo Home', (await state()).mode === '5');
    await scene('settings'); const paused = (await state()).wallpaper; await current.waitForTimeout(850);
    check('Rotation pauses in settings', (await state()).wallpaper === paused);
    await scene('home'); await current.evaluate(() => __setHidden(true)); const hidden = (await state()).wallpaper; await current.waitForTimeout(850);
    check('Rotation pauses when hidden', (await state()).wallpaper === hidden);
    await current.evaluate(() => __setHidden(false));
    await current.waitForFunction(id => ShoreQA.state().wallpaper !== id, hidden, { timeout: 4000 });
    await look({ bg: 'dark' }); const flat = (await state()).wallpaper; await current.waitForTimeout(850);
    check('Flat background retains photo without rotation', (await state()).wallpaper === flat);
    await look({ bg: 'photo', layout: 'list' }); const photoList = (await state()).wallpaper;
    await current.waitForFunction(id => ShoreQA.state().wallpaper !== id, photoList, { timeout: 4000 });
    check('Photo List rotates too', (await state()).look.layout === 'list');
    await current.evaluate(() => { __setHidden(true); document.getElementById('stage').blur(); __setHidden(false); window.dispatchEvent(new Event('focus')); });
    const focus = (await state()).focusAction; await current.keyboard.press('ArrowDown');
    check('Warm return restores remote focus', (await state()).focusAction !== focus && (await call('where')).focusCount === 1);
    const clock = await current.locator('#caption .clock').textContent();
    check('Live 12-hour clock has no AM/PM', /^\s*\d{1,2}:\d{2}\s*$/.test(clock), clock);
  });
  await run('Open rotation and browser fallback', async () => {
    await page({ seed: baseline({ mode: 'open' }) }); check('Open mode advances at cold start', (await state()).wallpaper === walls[1].id);
    const first = (await state()).wallpaper;
    await current.evaluate(() => { __setHidden(true); __setHidden(false); window.dispatchEvent(new Event('focus')); });
    check('Warm return does not repeat open rotation', (await state()).wallpaper === first);
    await current.reload(); await ready(); check('Next cold start advances again', (await state()).wallpaper === walls[2].id);
    await closePage();
    await page({ mock: false }); await act('home.app.netflix'); await current.waitForFunction(() => ShoreQA.where().view === 'message');
    check('Browser launch honestly requires TV', /TV/.test(await current.locator('#stage').innerText()));
    await nav('back'); await library();
    check('Browser All Apps has no installed fixtures', /TV/.test(await current.locator('#stage').innerText()) && !(await current.locator('[data-action^="apps.open."]').count()));
  });
  section = 'Run integrity';
  report.sourceAfter = hashes();
  check('No unexpected browser/resource failures', report.pageErrors.length === 0, report.pageErrors);
  check('Sources stayed stable during run', same(report.sourceBefore, report.sourceAfter));
} catch (error) { report.failures.push({ section, error: error.stack }); }
finally {
  await closePage();
  if (preview) await preview.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(out + 'checks.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(report.checks.filter(c => c.passed).length + ' checks passed; ' + report.failures.length + ' failure(s). Report: .local/qa/checks.json');
if (report.failures.length) process.exitCode = 1;
