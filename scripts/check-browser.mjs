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
  { id: 'nClrkHome1.FrameHome', name: 'CleanFrame', show: true },
  { id: 'AbCdEf1234.worker', name: 'Background worker', show: true },
  { id: 'com.samsung.tv.cobalt-yt', name: 'YouTube', show: true }
]);
const walls = [{ id: 'misty' }, { id: 'cove' }]; // Legacy preference IDs only; no photo assets remain.
const artFixture = readFileSync(root + 'scripts/fixtures/art-test.jpg');
const out = root + '.local/qa/';
mkdirSync(out, { recursive: true });
const sourceFiles = ['app/main.js', 'app/art-mode.js', 'app/device.js', 'app/index.html', 'app/style.css', 'app/config.xml', 'app/assets/icons/metrics.js'];
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
function installHarness({ seed, legacy, mock, catalog, catalogFailure, noFontAPI, storageFailure, currentAppId, initiallyHidden, pauseHiddenFrames, rejectDecode, inputUnavailable }) {
  if (!sessionStorage.getItem('__cleanframe_seeded')) {
    if (seed !== undefined) localStorage.setItem('cleanframe.home.v1', typeof seed === 'string' ? seed : JSON.stringify(seed));
    if (legacy !== undefined) localStorage.setItem('cleanframe.shore.v1', typeof legacy === 'string' ? legacy : JSON.stringify(legacy));
    sessionStorage.setItem('__cleanframe_seeded', '1');
  }
  window.ShoreQA = {};
  window.__failWrites = !!storageFailure;
  window.__storageAttempts = 0;
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === 'cleanframe.home.v1') window.__storageAttempts++;
    if (window.__failWrites && key === 'cleanframe.home.v1') throw new DOMException('QA storage failure', 'QuotaExceededError');
    return set.call(this, key, value);
  };
  const queuedFrames = new Map(), requestFrame = window.requestAnimationFrame.bind(window), cancelFrame = window.cancelAnimationFrame.bind(window);
  let nextFrame = 0;
  if (pauseHiddenFrames) {
    window.requestAnimationFrame = callback => {
      if (!document.hidden) return requestFrame(callback);
      const id = --nextFrame; queuedFrames.set(id, callback); return id;
    };
    window.cancelAnimationFrame = id => { if (queuedFrames.has(id)) queuedFrames.delete(id); else cancelFrame(id); };
  }
  window.__setHidden = value => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value ? 'hidden' : 'visible' });
    if (!value) { queuedFrames.forEach(callback => requestFrame(callback)); queuedFrames.clear(); }
    document.dispatchEvent(new Event('visibilitychange'));
  };
  if (initiallyHidden) window.__setHidden(true);
  if (rejectDecode) HTMLImageElement.prototype.decode = function () { return Promise.reject(new DOMException('Synthetic decode rejection')); };
  if (noFontAPI) Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
  if (!mock) return;
  window.__tv = { catalog, catalogFailure: !!catalogFailure, launchFailure: false, holdCatalog: false, pending: [], calls: [], catalogCalls: 0 };
  window.tizen = {
    ApplicationControlData: function (key, value) { this.key = key; this.value = value; },
    ApplicationControl: function (operation, uri, mime, category, data) { Object.assign(this, { operation, uri, mime, category, data }); },
    application: {
      getCurrentApplication() { return { appInfo: { id: currentAppId || 'nClrkHome1.FrameHome' } }; },
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
  if (!inputUnavailable) {
    __tv.inputRequests = []; __tv.sourceFailure = false; __tv.currentInput = 2;
    __tv.videoSources = { connected: [{ type: 'HDMI', number: 2 }, { type: 'TV', number: 0 }], disconnected: [{ type: 'HDMI', number: 1 }, { type: 'HDMI', number: 3 }] };
    tizen.systeminfo = { getPropertyValue(name, ok, fail) {
      const finish = () => __tv.inputDiscoveryFailure ? fail({ name: 'SecurityError' }) : ok(__tv.videoSources);
      if (__tv.holdInputs) __tv.inputRequests.push(finish); else setTimeout(finish, 0);
    } };
    tizen.tvwindow = {
      getSource() { return { type: 'HDMI', number: __tv.currentInput }; },
      setSource(source, ok, fail) {
        __tv.calls.push({ method: 'setSource', number: source.number, type: source.type });
        setTimeout(() => { if (__tv.sourceFailure) fail({ name: 'SecurityError' }); else { __tv.currentInput = source.number; ok(source); } }, 0);
      }
    };
  }
}
async function page(options = {}, setup) {
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
  await current.addInitScript(installHarness, { mock: true, catalog: CATALOG, seed: baseline(), ...options });
  if (setup) await setup(current);
  await current.route('http://127.0.0.1:8643/**', route => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().url().endsWith('/current.json')) return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ revision: 'a'.repeat(64), contentId: 'MY_TEST', imageUrl: '/art/' + 'a'.repeat(64) + '/image.jpg', width: 64, height: 36 }) });
    return route.fulfill({ headers, contentType: 'image/jpeg', body: artFixture });
  });
  await current.goto(preview.baseURL + '/home/', { waitUntil: options.settleNetwork === false ? 'domcontentloaded' : 'load' });
  if (options.waitReady !== false) await ready();
  if (options.settleNetwork !== false) await current.waitForLoadState('networkidle');
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
async function editor() { await scene('settings'); await act('settings.editor'); await current.waitForFunction(() => document.querySelector('[data-action^="editor.move."]')); await current.waitForFunction(() => !ShoreQA.state().catalog.loading); }
async function remove(id) { await act('editor.move.' + id); await nav('back', 'right', 'ok'); }
async function library() { await scene('home'); await act('util.apps'); await current.waitForFunction(() => !ShoreQA.state().catalog.loading); }
async function noLiveFilters() {
  return current.evaluate(() => [...document.querySelectorAll('#stage, #stage *')].filter(e => e.getClientRects().length).map(e => {
    const s = getComputedStyle(e);
    // The Art photo may carry a static colour curve (#artCurve: feComponentTransfer only); nothing else may reference an SVG filter.
    const curve = document.getElementById('artCurve'), colourOnly = e.id === 'photo' && curve && curve.querySelectorAll('*').length === [...curve.querySelectorAll('feComponentTransfer, feFuncR, feFuncG, feFuncB')].length;
    const filter = colourOnly ? s.filter.replace(/url\("?#artCurve"?\)/, '') : s.filter;
    return { tag: e.tagName, cls: e.className, filter, backdrop: s.backdropFilter || s.webkitBackdropFilter || 'none' };
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
    check('Invalid values recover usable bounded Home', s.dock.length >= 1 && s.dock.length <= 9 && s.wallpaper === 'missing' && s.look.source === 'art' && ['fixed', 'open', '5', '15', '60'].includes(s.mode), s);
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
  await run('Font recovery invalidates fallback measurements', async () => {
    const seed = baseline({ dock: ['sbs', 'netflix'], lastApp: 'sbs', look: { bg: 'photo', layout: 'list', apps: 'both', font: 'manrope', controls: 'both', focus: 'glass', material: 'soft' } });
    const geometry = () => current.evaluate(() => ({
      plate: document.querySelector('#phScene > .ph-plate.is-current').style.width,
      names: [...document.querySelectorAll('.ph-name')].map(e => ({ text: e.textContent, size: e.style.fontSize, top: e.style.top }))
    }));
    await page({ seed });
    const expected = await geometry();
    await closePage();
    let releaseFont, requests = 0;
    const fontGate = new Promise(resolve => { releaseFont = resolve; });
    await page({ seed, settleNetwork: false }, p => p.route('**/assets/manrope.woff2', async route => {
      requests++; await fontGate; await route.continue();
    }));
    check('Slow baseline font keeps Home usable', (await state()).fonts.baselineFallback && (await call('where')).focusCount === 1 && requests > 0);
    releaseFont();
    await current.waitForFunction(() => !ShoreQA.state().fonts.baselineFallback && ShoreQA.state().fonts.loaded.includes('manrope'));
    check('Recovered font restores normal label and focus geometry', same(await geometry(), expected), { expected, actual: await geometry() });
  });
  await run('Hidden boot installs a complete wallpaper without animation frames', async () => {
    await page({ initiallyHidden: true, pauseHiddenFrames: true, rejectDecode: true });
    const before = await stored();
    check('Hidden startup settles with every wallpaper image loaded', await current.evaluate(() => document.hidden && ['photo', 'matImg', 'phFieldImg', 'utFieldImg'].every(id => {
      const image = document.getElementById(id); return image.complete && image.naturalWidth > 0;
    })));
    await current.evaluate(() => window.__setHidden(false)); await ready();
    check('Showing the launcher keeps the same saved appearance', same(await stored(), before) && (await call('where')).focusCount === 1);
    await closePage();
    await page({ rejectDecode: true });
    check('A valid loaded image survives a visible decode rejection', (await state()).shown.wall === (await state()).wallpaper && !(await state()).pending);
  });
  await run('Chromium 85 layout without inset shorthand', async () => {
    await page({}, p => p.route('**/style.css', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace(/([;{])inset:0(?=[;}])/g, '$1') });
    }));
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      await current.setViewportSize(viewport);
      for (const layout of ['dock', 'list']) {
        await look({ layout, focus: 'glass' }); await scene('home');
        const labels = await current.locator(layout === 'dock' ? '.tile-content' : '.ph-name').evaluateAll(elements => elements.filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().width));
        check(layout + ' labels retain width at ' + viewport.width, labels.length > 0 && labels.every(width => width > 0), labels);
        await nav(layout === 'dock' ? 'up' : 'right');
        await current.waitForTimeout(240);
        check('Utility focus and rounded lens align at ' + viewport.width + ' in ' + layout, await current.evaluate(() => {
          const button = document.querySelector('.u.is-focus'), lens = document.querySelector('.ut-lens.is-current');
          return ShoreQA.where().focusCount === 1 && button && lens && Math.abs(button.getBoundingClientRect().top - lens.getBoundingClientRect().top) < 4;
        }));
        await current.screenshot({ path: out + 'compat-' + layout + '-' + viewport.width + '.png' });
        await group('background');
        check('Appearance keeps full stage bounds at ' + viewport.width + ' in ' + layout, await current.locator('.appearance').evaluate(e => {
          const r = e.getBoundingClientRect(), stage = document.getElementById('stage').getBoundingClientRect();
          return Math.abs(r.width - stage.width) < 1 && Math.abs(r.height - stage.height) < 1;
        }));
        await library();
        check('All apps content keeps its width at ' + viewport.width + ' in ' + layout, await current.locator('.gt .panel-content').evaluateAll(elements => elements.length > 0 && elements.every(e => e.getBoundingClientRect().width > 0)));
      }
    }
  });
  await run('Utility control geometry', async () => {
    await page();
    for (const width of [1920, 1280]) {
      await current.setViewportSize({ width, height: width * 9 / 16 });
      for (const layout of ['dock', 'list']) for (const controls of ['icons', 'both', 'text']) {
        await look({ bg: 'photo', layout, controls, focus: 'glass', font: 'manrope' }); await scene('home');
        if ((await call('where')).zone === 'util') await nav('back');
        await nav(layout === 'dock' ? 'up' : 'right');
        await nav(...Array(2).fill(layout === 'dock' ? 'left' : 'up'));
        await current.waitForTimeout(180);
        const spacing = await current.evaluate(({ layout, controls }) => {
          const scale = document.getElementById('stage').getBoundingClientRect().width / 1920;
          return [...document.querySelectorAll('#utils .u')].map(button => {
            const content = button.querySelector('.u-content');
            const children = [...content.children].filter(e => getComputedStyle(e).display !== 'none');
            const visibleWidth = children.reduce((sum, e) => sum + e.getBoundingClientRect().width / scale, 0);
            const gap = controls !== 'both' ? 0 : layout === 'dock' ? 10 : button.dataset.action === 'util.settings' ? 18.9 : 17.9;
            return { action: button.dataset.action, children: children.length, extraWidth: content.getBoundingClientRect().width / scale - visibleWidth, gap };
          });
        }, { layout, controls });
        check(layout + '/' + controls + ' uses spacing between visible children at ' + width,
          spacing.length === 2 && spacing.every(s => s.children === (controls === 'both' ? 2 : 1) && Math.abs(s.extraWidth - s.gap) < .5), spacing);
        const focused = [];
        for (let i = 0; i < 2; i++) {
          if (i) await nav(layout === 'dock' ? 'right' : 'down');
          focused.push(await current.evaluate(() => {
            const button = document.querySelector('#utils .u.is-focus'), lens = document.querySelector('.ut-lens.is-current');
            if (!button || !lens || ShoreQA.where().focusCount !== 1) return false;
            const bounds = lens.getBoundingClientRect();
            const content = [...button.querySelector('.u-content').children].filter(e => getComputedStyle(e).display !== 'none');
            const caption = document.querySelector('.util-focus-label.is-on');
            if (caption && ShoreQA.state().look.layout === 'list') content.push(caption);
            return content.every(e => { const r = e.getBoundingClientRect(); return r.left >= bounds.left - 1 && r.right <= bounds.right + 1 && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1; });
          }));
        }
        check(layout + '/' + controls + ' keeps each focused control inside its lens at ' + width, focused.every(Boolean), focused);
      }
    }
  });
  await run('Panel spacing geometry', async () => {
    await page();
    for (const width of [1920, 1280]) {
      await current.setViewportSize({ width, height: width * 9 / 16 });
      await look({ layout: 'dock', focus: 'glass' }); await editor();
      const divider = await current.locator('.ed-order-break.is-on').evaluate(e => {
        const scale = document.getElementById('stage').getBoundingClientRect().width / 1920;
        const text = document.createRange(); text.selectNodeContents(e);
        const after = getComputedStyle(e, '::after');
        return (e.getBoundingClientRect().right - text.getBoundingClientRect().right) / scale - parseFloat(after.width);
      });
      check('Editor divider separates its text and line at ' + width, Math.abs(divider - 16) < .5, divider);
      await scene('home'); await nav('back');
      const actions = await current.locator('.msg-acts>button').evaluateAll(elements => {
        const scale = document.getElementById('stage').getBoundingClientRect().width / 1920;
        return elements.length === 2 ? (elements[1].getBoundingClientRect().left - elements[0].getBoundingClientRect().right) / scale : null;
      });
      check('Leave actions retain their separation at ' + width, actions !== null && Math.abs(actions - 12) < .5, actions);
      await scene('settings');
      const groups = await current.locator('.settings-group').evaluateAll(elements => {
        const scale = document.getElementById('stage').getBoundingClientRect().width / 1920;
        return elements.map(e => (e.querySelector('.ico').getBoundingClientRect().left - e.querySelector('.settings-group-copy').getBoundingClientRect().right) / scale);
      });
      check('Settings group arrows stay separate from their copy at ' + width, groups.length === 6 && groups.every(gap => gap >= 31.5), groups);

    }
  });
  await run('HDMI input chooser and recovery', async () => {
    await page();
    for (const width of [1920, 1280]) for (const layout of ['dock', 'list']) {
      await current.setViewportSize({ width, height: width * 9 / 16 }); await look({ layout });
      await group('samsung'); await act('samsung.inputs');
      await current.waitForSelector('[data-action="input.1"]');
      const entries = await current.locator('.section-inputs .setting-choice').allTextContents();
      check('Inputs reflect actual ports and sleeping/active status ' + layout + '/' + width,
        entries.length === 3 && entries.some(x => /HDMI 1.*Disconnected/.test(x)) && entries.some(x => /HDMI 2.*Active/.test(x)) && !entries.some(x => /HDMI 4/.test(x)), entries);
      check('Inputs fit and retain one focus ' + layout + '/' + width, await current.locator('.section-inputs .setting-choice').evaluateAll(elements => {
        const stage = document.getElementById('stage').getBoundingClientRect();
        return ShoreQA.where().focusCount === 1 && elements.every(e => { const r=e.getBoundingClientRect(); return r.top>=stage.top && r.bottom<=stage.bottom && r.left>=stage.left && r.right<=stage.right; });
      }));
      await current.screenshot({ path: out + 'inputs-' + layout + '-' + width + '.png' });
      await nav('back');
      check('Inputs Back returns to Samsung entry ' + layout + '/' + width, (await state()).settingsGroup === 'samsung' && (await state()).focusAction === 'samsung.inputs');
    }
    await act('samsung.inputs'); await current.waitForSelector('[data-action="input.1"]');
    await act('input.1'); await current.waitForFunction(() => __tv.calls.some(c => c.id === 'org.tizen.tv-viewer'));
    check('Sleeping input selects its exact port before viewer handoff', await current.evaluate(() => __tv.calls[0].method === 'setSource' && __tv.calls[0].number === 1 && __tv.calls[1].id === 'org.tizen.tv-viewer'));
    await current.evaluate(() => window.dispatchEvent(new Event('focus')));
    await current.waitForFunction(() => [...document.querySelectorAll('.section-inputs .setting-choice')].some(e => /HDMI 1.*Active/.test(e.textContent)));
    check('Returning from viewer refreshes the Active port', await current.locator('[data-action="input.1"]').innerText().then(text => text.includes('Active')));
    await current.evaluate(() => { __tv.currentInput = 3; Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await current.waitForFunction(() => document.querySelector('[data-action="input.3"]').textContent.includes('Active'));
    check('Visibility return refreshes an externally changed input', !(await current.locator('[data-action="input.1"]').innerText()).includes('Active'));
    await current.evaluate(() => { __tv.sourceFailure = true; __tv.calls = []; });
    await act('input.2'); await current.waitForFunction(() => ShoreQA.state().view === 'message');
    check('Failed input selection displays an error and keeps viewer closed', (await current.locator('#stage').innerText()).includes('could not') && await current.evaluate(() => __tv.calls.length === 1));
    await nav('back', 'back');
    await current.evaluate(() => { __tv.holdInputs = true; });
    await act('samsung.inputs'); await nav('back');
    await current.evaluate(() => __tv.inputRequests.splice(0).forEach(f => f()));
    check('Late discovery cannot reopen a closed chooser', (await state()).settingsGroup === 'samsung' && (await call('where')).focusCount === 1);
    await closePage(); await page({ inputUnavailable: true }); await group('samsung'); await act('samsung.inputs');
    check('Unavailable source API offers retry without invented ports', !(await current.locator('[data-action^="input."]').count()) && (await current.locator('#stage').innerText()).includes('Open CleanFrame on the TV'));
    await nav('back'); check('Unavailable inputs remain escapable', (await state()).settingsGroup === 'samsung');
    await closePage(); await page(); await current.evaluate(() => { __tv.videoSources = { connected: [], disconnected: [] }; });
    await group('samsung'); await act('samsung.inputs');
    await current.waitForSelector('[data-action="inputs.retry"]');
    check('Empty inventory is truthful', (await current.locator('#stage').innerText()).includes('No HDMI inputs were reported'));
  });
  await run('Home Live TV and ESPN native actions', async () => {
    await page({ seed: baseline({ dock: ['livetv', 'espn'], lastApp: 'livetv' }) });
    await act('home.app.livetv'); await current.waitForFunction(() => __tv.calls.length === 2);
    check('Main Live TV selects the reported TV tuner before launching its viewer', await current.evaluate(() => __tv.calls[0].method === 'setSource' && __tv.calls[0].type === 'TV' && __tv.calls[1].id === 'org.tizen.tv-viewer'));
    await current.evaluate(() => window.dispatchEvent(new Event('focus')));
    await act('home.app.espn'); await current.waitForFunction(() => __tv.calls.length === 3);
    check('ESPN keeps its existing native target', await current.evaluate(() => __tv.calls[2].id === 'XtU8fQk2gN.ESPN'));
    await current.evaluate(() => window.dispatchEvent(new Event('focus')));
    await editor(); await remove('livetv'); await nav('back'); await library();
    check('Removed Live TV remains addable through the installed-apps view', (await state()).catalog.ids.includes('livetv') && !(await state()).dock.includes('livetv'));
    await scene('home'); await current.evaluate(() => { __tv.holdInputs = true; __tv.calls = []; });
    // A saved Live TV Home item needs no catalogue record, even after reloading.
    await current.evaluate(() => { ShoreQA.scene('settings'); ShoreQA.activate('settings.editor'); });
    await act('editor.add.livetv'); await scene('home');
    await act('home.app.livetv'); await nav('back');
    await current.evaluate(() => __tv.inputRequests.splice(0).forEach(fn => fn()));
    check('Back cancels pending Live TV without opening its viewer later', await current.evaluate(() => !__tv.calls.some(c => c.id === 'org.tizen.tv-viewer')));
  });
  await run('Real catalogue and native launch boundary', async () => {
    await page(); await library();
    const names = await current.locator('[data-action^="apps.open."] .label').allTextContents();
    check('Consumer catalogue excludes services, self and duplicate YouTube', names.length === 14 && names.includes('HDMI 4') && names.filter(n => n === 'YouTube').length === 1 && !names.includes('CleanFrame') && !names.includes('Background worker'), names);
    check('Installed names stay text, including HTML punctuation', names.includes(UNSAFE_NAME) && !(await current.evaluate(() => window.__catalogXss)));
    check('Exploration fixtures do not appear', !names.includes('Plex') && !names.includes('Jellyfin'));
    await act('apps.open.' + SPOTIFY); await current.waitForFunction(() => __tv.calls.length > 0);
    check('Extra-brand app launches native ID', (await current.evaluate(() => __tv.calls.at(-1))).id === SPOTIFY);
    await current.evaluate(() => window.dispatchEvent(new Event('focus')));
    await scene('home'); await act('home.app.netflix'); await current.waitForFunction(() => __tv.calls.length === 2);
    check('Primary app keeps verified target', (await current.evaluate(() => __tv.calls.at(-1))).id === IDS[1]);
    await current.evaluate(() => window.dispatchEvent(new Event('focus')));
    await current.evaluate(() => FrameDevice.art(() => {})); await current.waitForFunction(() => __tv.calls.length === 3);
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
  await run('Independent app identity self-filter', async () => {
    const appId = 'AbCdEf1234.MyHome';
    await page({ currentAppId: appId, catalog: CATALOG.filter(a => a.id !== 'nClrkHome1.FrameHome').concat({ id: appId, name: 'Family Home', show: true }) });
    await library();
    const independent = await state();
    const names = await current.locator('[data-action^="apps.open."] .label').allTextContents();
    check('Independent build excludes its actual application ID', independent.catalog.ids.includes(EXTRA) && !independent.catalog.ids.includes(appId) && !names.includes('Family Home'));
    await closePage();
    await page();
    await current.evaluate(() => { delete tizen.application.getCurrentApplication; });
    await library();
    const fallback = await state();
    check('Unavailable current-app API keeps reference identity fallback', fallback.catalog.ids.includes(EXTRA) && !fallback.catalog.ids.includes('nClrkHome1.FrameHome'));
  });
  await run('Catalogue failure and retry', async () => {
    await page({ catalogFailure: true }); await library();
    check('Catalogue failure leaves Home intact', same((await state()).dock, PRIMARY));
    await current.evaluate(() => { __tv.catalogFailure = false; }); await act('apps.retry');
    await current.waitForSelector('[data-action="apps.open.' + EXTRA + '"]');
    check('Retry displays real installed names', (await current.locator('[data-action^="apps.open."]').count()) === 14);
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
      focus: { focus: ['type', 'glass'] }
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
    check('Background has Art Mode and flat colours without gallery or rotation', !(await call('actions')).some(a => /wallpaper|rotation|source/.test(a)));
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
      ['focus', 'focus', ['type', 'glass']]
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
    await group('layout'); const before = await settingsSnapshot(), candidate = await unselectedChoice();
    const [, axis, value] = candidate.action.split('.');
    await current.keyboard.down('Enter'); await current.keyboard.down('Enter'); await ready();
    check('Held physical OK applies the focused choice once', (await state()).committed[axis] === value && (await state()).writes === before.writes + 1);
    await current.keyboard.up('Enter');
    await current.keyboard.down('Escape'); await current.keyboard.down('Escape');
    check('Held physical Back closes one settings layer', (await state()).view === 'settings' && (await state()).focusAction === 'settings.group.layout');
    await current.keyboard.up('Escape');
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
  await run('Settings choices fit both target viewports', async () => {
    await page();
    for (const width of [1920, 1280]) {
      await current.setViewportSize({ width, height: width * 9 / 16 });
      await current.waitForFunction(w => Math.abs(document.getElementById('stage').getBoundingClientRect().width - w) < 1, width);
      for (const name of ['background', 'layout', 'typography', 'focus', 'samsung']) {
        await group(name);
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
