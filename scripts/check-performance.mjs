// Bounded browser performance audit of production views. This is not a TV benchmark.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openPreview, root } from './browser.mjs';

const output = root + '.local/qa/performance/';
mkdirSync(output, { recursive: true });
const sourceFiles = ['app/main.js', 'app/device.js', 'app/assets/apps/catalog.js', 'app/index.html', 'app/style.css', 'app/assets/wallpapers/catalog.js', 'app/assets/adaptive-ink.js'];
function hashes() {
  return Object.fromEntries(sourceFiles.map(file => {
    try { return [file, createHash('sha256').update(readFileSync(root + file)).digest('hex')]; }
    catch { return [file, null]; }
  }));
}
const report = {
  scope: 'Production /home/ in local Playwright Chromium, 1920×1080, CPU throttled 4×. Mocked public app inventory only. No TV contact or TV timing claim.',
  sourceBefore: hashes(), checks: [], warnings: [], failures: [], scenarios: [], errors: [],
  budgets: { keyP95Ms: 50, keyMaximumMs: 120, frameMaximumMs: 250, appearanceMaximumMs: 4000 },
  notes: [
    'A 4× Chromium slowdown is a reproducible regression screen, not an emulation of the Samsung processor, GPU, decoder, memory limit or browser engine.',
    'Key work measures the complete production navigation handler, including render calls. Frame gaps include paint/compositing scheduling.',
    'DOM and post-GC JavaScript heap checks detect retained growth, not GPU texture allocation or total TV process memory.',
    'The localhost preview sends no-store; repeated asset transfers are reported separately from decoded-image or DOM retention.'
  ]
};
let preview, page, cdp, layers = [];
function check(name, passed, detail) {
  report.checks.push({ name, passed, ...(detail === undefined ? {} : { detail }) });
  if (!passed) report.failures.push({ name, detail });
}
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
const ready = () => page.waitForFunction(() => window.ShoreQA && ShoreQA.ready(), null, { timeout: 15000 });
const call = (method, ...args) => page.evaluate(([name, a]) => ShoreQA[name](...a), [method, args]);
async function look(patch) { await call('look', patch); await ready(); await page.waitForTimeout(230); }
async function scene(name) { await call('scene', name); await page.waitForFunction(() => !ShoreQA.state().catalog.loading); await page.waitForTimeout(230); }
const percentile = (list, p) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * p))] || 0;
async function sample(name, keys, rounds = 4) {
  const before = await metrics();
  const raw = await page.evaluate(async ({ keys, rounds }) => {
    const frames = [], work = [], longTasks = [];
    let stop = false, previous, frame;
    const observer = typeof PerformanceObserver === 'function' ? new PerformanceObserver(list => list.getEntries().forEach(e => longTasks.push({ start: e.startTime, duration: e.duration }))) : null;
    try { observer?.observe({ type: 'longtask' }); } catch {}
    const tick = time => { if (previous !== undefined) frames.push(time - previous); previous = time; if (!stop) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    // Two frames settle instrumentation before inputs begin.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (let round = 0; round < rounds; round++) for (const key of keys) {
      const start = performance.now(); ShoreQA.nav(key); work.push(performance.now() - start);
      await new Promise(resolve => setTimeout(resolve, 55));
    }
    await new Promise(resolve => setTimeout(resolve, 240));
    stop = true; cancelAnimationFrame(frame); observer?.disconnect();
    return { work, frames, longTasks, where: ShoreQA.where() };
  }, { keys, rounds });
  const after = await metrics();
  const value = {
    name, keys: raw.work.length, keyP50Ms: percentile(raw.work, .5), keyP95Ms: percentile(raw.work, .95), keyMaximumMs: Math.max(...raw.work),
    frameP95Ms: percentile(raw.frames, .95), frameMaximumMs: Math.max(...raw.frames), longTasks: raw.longTasks,
    taskDurationMs: (after.TaskDuration - before.TaskDuration) * 1000,
    scriptDurationMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
    layoutDurationMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    recalcDurationMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
    focus: raw.where, raw
  };
  report.scenarios.push(value);
  check(name + ': bounded key work', value.keyP95Ms < report.budgets.keyP95Ms && value.keyMaximumMs < report.budgets.keyMaximumMs, { p95: value.keyP95Ms, max: value.keyMaximumMs });
  check(name + ': no long frame stall', value.frameMaximumMs < report.budgets.frameMaximumMs, { p95: value.frameP95Ms, max: value.frameMaximumMs });
  check(name + ': one visible focus', raw.where.focusCount === 1, raw.where);
  if (value.keyP95Ms > 16.7 || value.frameP95Ms > 33.5) report.warnings.push({ name, reason: 'Work exceeded one 60Hz frame or recurring frame gaps exceeded two frames.', keyP95Ms: value.keyP95Ms, frameP95Ms: value.frameP95Ms });
  console.log(name + ': key p95 ' + value.keyP95Ms.toFixed(1) + 'ms, max ' + value.keyMaximumMs.toFixed(1) + 'ms; frame max ' + value.frameMaximumMs.toFixed(1) + 'ms');
}
async function memory() {
  await cdp.send('HeapProfiler.collectGarbage');
  const m = await metrics(), dom = await cdp.send('Memory.getDOMCounters');
  const images = await page.evaluate(() => ({ elements: document.images.length, sources: [...new Set([...document.images].map(i => i.currentSrc || i.src))], resources: performance.getEntriesByType('resource').filter(r => /\/(wallpapers|materials)\//.test(r.name)).length }));
  return { heapBytes: m.JSHeapUsedSize, dom, images };
}

try {
  preview = await openPreview();
  page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(response.status() + ' ' + response.url()); });
  page.on('requestfailed', request => { if (!page.__closing && request.failure()?.errorText !== 'net::ERR_ABORTED') report.errors.push(request.failure()?.errorText + ' ' + request.url()); });
  await page.addInitScript(() => {
    const primary = [
      ['IkWsFHtOY9.Stremio', 'Stremio'], ['org.tizen.netflix-app', 'Netflix'], ['MCmYXNxgcu.DisneyPlus', 'Disney+'],
      ['9Ur5IzDKqV.TizenYouTube', 'YouTube'], ['com.samsung.tv.aria-video', 'Apple TV'], ['org.tizen.primevideo', 'Prime Video'],
      ['mWK87Xghap.ABCiview', 'ABC iview'], ['OyE7OuxlUi.SBSOnDemand', 'SBS On Demand'], ['org.tizen.apple.apple-music', 'Apple Music']
    ];
    const catalogue = primary.map(([id, name]) => ({ id, name, show: true, iconPath: '' }));
    for (let i = 0; i < 14; i++) catalogue.push({ id: 'Qa12345678.Stream' + i, name: 'Streaming app ' + String(i + 1).padStart(2, '0'), show: true, iconPath: '' });
    window.tizen = { application: {
      getAppsInfo(ok) { setTimeout(() => ok(catalogue), 0); },
      launch(id, ok) { setTimeout(ok, 0); }
    } };
    localStorage.setItem('cleanframe.home.v1', JSON.stringify({ dock: ['stremio', 'netflix', 'disneyplus', 'youtube', 'appletv', 'primevideo', 'abciview', 'sbs', 'applemusic'], wallpaper: 'misty', mode: 'fixed', theme: 'shore', lastApp: 'netflix' }));
  });
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('LayerTree.enable');
  cdp.on('LayerTree.layerTreeDidChange', e => { layers = e.layers || []; });
  const start = Date.now();
  await page.goto(preview.baseURL + '/home/'); await ready(); await page.waitForLoadState('networkidle');
  report.startupMs = Date.now() - start;
  const startupResources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  check('No wallpaper gallery thumbnail fetch at startup', !startupResources.some(u => /-thumb\./.test(u)));
  await look({ bg: 'photo', layout: 'list', apps: 'both', controls: 'icons', focus: 'glass', material: 'soft', font: 'manrope' });
  await sample('Photo List navigation', ['down', 'down', 'down', 'up', 'up', 'up']);
  await look({ layout: 'dock' });
  await sample('Photo Dock navigation', ['right', 'right', 'right', 'left', 'left', 'left']);
  await call('nav', 'up');
  await sample('Dock utilities', ['right', 'right', 'left', 'left']);
  await scene('settings');
  await sample('Settings navigation', ['down', 'down', 'up', 'up']);
  await scene('apps');
  check('Performance inventory includes 23 real-adapter rows', (await call('state')).catalog.ids.length === 23);
  await sample('All Apps grid navigation', ['down', 'down', 'right', 'up', 'up', 'left']);
  await scene('editor');
  await sample('Apps on Home navigation', ['down', 'down', 'down', 'up', 'up', 'up']);
  await call('activate', 'editor.move.netflix');
  await sample('Picked-up app movement', ['down', 'up'], 6);
  await call('nav', 'back');
  await scene('appearance');
  await sample('Appearance row navigation', ['down', 'down', 'down', 'up', 'up', 'up']);
  await scene('home');
  await look({ font: 'newsreader', layout: 'list', apps: 'text', controls: 'text' });
  await sample('Newsreader List navigation', ['down', 'down', 'down', 'up', 'up', 'up']);
  await call('nav', 'right');
  await sample('Newsreader Home controls', ['up', 'up', 'down', 'down']);

  const walls = await page.evaluate(() => CleanFrameWallpapers.map(w => w.id));
  const loadTimes = [];
  await scene('home');
  for (const wall of walls) {
    const t = Date.now(); await call('look', { wall, bg: 'photo' }); await ready();
    loadTimes.push({ wall, ms: Date.now() - t });
  }
  report.appearanceLoads = loadTimes;
  check('All photo bundles load within bounded browser budget', loadTimes.every(r => r.ms < report.budgets.appearanceMaximumMs), loadTimes);
  await page.waitForLoadState('networkidle');
  const beforeSame = await memory();
  const sameWall = (await call('state')).wallpaper;
  for (let i = 0; i < 4; i++) { await call('look', { wall: sameWall }); await ready(); }
  await page.waitForTimeout(100);
  const afterSame = await memory();
  check('Selecting current photo reuses bundle', beforeSame.images.resources === afterSame.images.resources && beforeSame.images.elements === afterSame.images.elements, { before: beforeSame.images, after: afterSame.images });
  // Prime the small cycle before comparing retained objects.
  const cycle = walls.slice(0, 3);
  for (const wall of cycle) { await call('look', { wall }); await ready(); }
  await page.waitForTimeout(300);
  report.memoryBefore = await memory();
  for (let repeat = 0; repeat < 4; repeat++) for (const wall of cycle) { await call('look', { wall }); await ready(); }
  await page.waitForTimeout(300);
  report.memoryAfter = await memory();
  const a = report.memoryAfter, b = report.memoryBefore;
  check('Photo cycles retain bounded DOM/image count', a.dom.nodes - b.dom.nodes < 40 && a.images.elements <= b.images.elements + 2, { before: b.dom, after: a.dom, imagesBefore: b.images.elements, imagesAfter: a.images.elements });
  check('Post-GC JS heap has no multi-megabyte growth over photo cycles', a.heapBytes - b.heapBytes < 2 * 1024 * 1024, { before: b.heapBytes, after: a.heapBytes, growth: a.heapBytes - b.heapBytes });

  await scene('appearance');
  // Background's current-photo swatch belongs to Settings, not selector preloading.
  await page.waitForLoadState('networkidle');
  const beforeGallery = await page.evaluate(() => performance.getEntriesByType('resource').length);
  await call('activate', 'background.wallpaper');
  await page.waitForFunction(() => ShoreQA.where().view === 'wallpaper');
  const beforePreview = (await call('state')).shown.wall;
  await call('nav', 'down');
  await page.waitForFunction(previous => !ShoreQA.state().pending && ShoreQA.state().shown.wall !== previous, beforePreview);
  await page.waitForLoadState('networkidle');
  report.gallery = await page.evaluate(start => ({
    thumbnailsFetched: [...new Set(performance.getEntriesByType('resource').filter(r => /-thumb\./.test(r.name)).map(r => r.name))].length,
    images: document.images.length, nodes: document.querySelectorAll('*').length,
    newPhotoResources: performance.getEntriesByType('resource').slice(start).filter(r => /\/(wallpapers|materials)\//.test(r.name)).map(r => r.name),
    shown: ShoreQA.state().shown.wall
  }), beforeGallery);
  // Small catalogue thumbnails are allowed; full photo/material bundles load on demand.
  check('Photo selector has bounded thumbnails and only the requested full preview bundle', report.gallery.images <= report.memoryAfter.images.elements + walls.length + 2 && report.gallery.newPhotoResources.filter(url => !/-thumb\.jpg$/.test(url)).every(url => url.includes('/' + report.gallery.shown + '.') || url.includes('/' + report.gallery.shown + '-')), report.gallery);
  await call('nav', 'back'); await ready(); await scene('home');

  report.layers = layers.filter(l => l.drawsContent).map(l => ({ width: l.width, height: l.height, paintCount: l.paintCount }));
  report.liveFilters = await page.evaluate(() => [...document.querySelectorAll('#stage, #stage *')].filter(e => e.getClientRects().length).map(e => {
    const s = getComputedStyle(e); return { tag: e.tagName, cls: e.className, filter: s.filter, backdrop: s.backdropFilter || s.webkitBackdropFilter || 'none' };
  }).filter(s => /blur|url\(/.test(s.filter) || s.backdrop !== 'none'));
  check('No runtime optical blur/backdrop layer', report.liveFilters.length === 0, report.liveFilters);
  check('No browser/resource errors', report.errors.length === 0, report.errors);
  report.sourceAfter = hashes();
  check('Source remained stable for measurements', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
} catch (error) {
  report.failures.push({ error: error.stack });
} finally {
  if (page) { page.__closing = true; await page.close(); }
  if (preview) await preview.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(output + 'production-performance.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(report.checks.filter(c => c.passed).length + ' performance checks passed; ' + report.failures.length + ' failures; ' + report.warnings.length + ' frame-budget observations. Report: .local/qa/performance/production-performance.json');
if (report.failures.length) process.exitCode = 1;
