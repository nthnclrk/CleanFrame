/* CleanFrame Home. Art Mode background, local preferences and public Tizen app controls. */
(function () {
  'use strict';

  /* ---------- Bundled data ---------- */
  var ASSETS = 'assets/', ICONS = ASSETS + 'icons/';
  var CAP = 24; // Home scrolls, so the cap only guards against runaway lists.
  var DOCK_MODES = { both: { tw: 288, th: 200, pitch: 296 }, text: { tw: 288, th: 104, pitch: 296 }, icons: { tw: 176, th: 144, pitch: 184 } };
  var GRID_ROW = 240, GRID_COL = 344, COLS = 5;
  var DOCK_BOTTOM = 964; // The dock sits low on the screen, clear of the middle.
  var ED_ROW = 80, ED_SEP = 56, ED_VIEW = 752;
  var PH_LEFT = 80, PH_TOP = 136, PH_LIST_TOP = 40, PH_PITCH = 128, PH_FULL = 7, PH_HEIGHT = 1040, PH_PLATE_H = 106, PH_GROW = 1.06, PH_NAME = 84;
  var KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 27: 'back', 8: 'back', 10009: 'back', 461: 'back' };
  var FULL = 'Home holds ' + CAP + ' apps. Remove one first.', LAST = 'Home needs one app';

  var PRIMARY_APPS = [
    { id: 'stremio', name: 'Stremio', mark: true, appId: 'IkWsFHtOY9.Stremio' },
    { id: 'netflix', name: 'Netflix', mark: true, appId: 'org.tizen.netflix-app' },
    { id: 'disneyplus', name: 'Disney+', mark: true, appId: 'MCmYXNxgcu.DisneyPlus' },
    { id: 'youtube', name: 'YouTube', mark: true, appId: '9Ur5IzDKqV.TizenYouTube' },
    { id: 'appletv', name: 'Apple TV', mark: true, appId: 'com.samsung.tv.aria-video' },
    { id: 'primevideo', name: 'Prime Video', mark: true, appId: 'org.tizen.primevideo' },
    { id: 'abciview', name: 'ABC iview', mark: true, appId: 'mWK87Xghap.ABCiview' },
    { id: 'sbs', name: 'SBS On Demand', mark: true, appId: 'OyE7OuxlUi.SBSOnDemand' },
    { id: 'applemusic', name: 'Apple Music', mark: true, appId: 'org.tizen.apple.apple-music' }
  ];
  PRIMARY_APPS.push({ id: 'espn', name: 'ESPN', mark: true, appId: 'XtU8fQk2gN.ESPN' }, { id: 'livetv', name: 'Live TV', mark: true, appId: 'org.tizen.tv-viewer', source: true },
    { id: 'browser', name: 'Browser', mark: true, appId: 'org.tizen.browser' }, { id: 'hdmi1', name: 'HDMI 1', mark: true, brand: 'hdmi4', appId: 'org.tizen.tv-viewer', source: true, port: 1 },
    { id: 'hdmi2', name: 'HDMI 2', mark: true, brand: 'hdmi4', appId: 'org.tizen.tv-viewer', source: true, port: 2 },
    { id: 'hdmi3', name: 'HDMI 3', mark: true, brand: 'hdmi4', appId: 'org.tizen.tv-viewer', source: true, port: 3 },
    { id: 'hdmi4', name: 'HDMI 4', mark: true, appId: 'org.tizen.tv-viewer', source: true, port: 4 });
  var SOURCES = ['livetv', 'hdmi1', 'hdmi2', 'hdmi3', 'hdmi4'];
  var DEFAULT_HOME = ['livetv', 'youtube', 'netflix', 'espn', 'primevideo', 'browser', 'hdmi4'];
  var PRIMARY = PRIMARY_APPS.map(function (a) { return a.id; }), APPS = PRIMARY_APPS.slice(), ALPHA = [];
  var KEY = 'cleanframe.home.v1', storageOk = true, catalog = { loading: false, loaded: false, error: null, request: 0, revision: 0 };
  var QA = window.ShoreQA = {};
  /* One system typeface (FONT_STACK). Width measurements are cached. */
  var widthCache = {};
  var LOOK_VALUES = { source: ['art'], bg: ['photo'], layout: ['list', 'dock'], apps: ['icons', 'both', 'text'], controls: ['icons', 'both', 'text'], focus: ['type', 'glass'], inputs: ['connected', 'always'], clock: ['off', 'time', 'weather'] };
  var VALUE_NAMES = { list: 'List', dock: 'Dock', type: 'Text', glass: 'Glass', icons: 'Icons', both: 'Icons and text', text: 'Text', connected: 'When connected', always: 'Always', off: 'Off', time: 'Clock', weather: 'With weather' };
  var UTIL = { lights: ['Lights', 'lights'], cameras: ['Cameras', 'cameras'], apps: ['Apps', 'apps'], settings: ['Settings', 'settings'] };
  /* Optional owner controls, configured on the TV (never in public source):
     cleanframe.controls.v1 = { lights: true, go2rtc: 'http://192.168.x.y:1984', cameras: [{ name, src, full, ratio }] }.
     src is the go2rtc stream for the MJPEG grid; full, if set, is the full-quality stream for full screen.
     ratio, if set ("3:4"), places the tile until a snapshot has shown the camera's real shape.
     Without it, Home shows only Apps and Settings. */
  var CONTROLS = (function () {
    var c = null, out = { lights: false, go2rtc: '', cameras: [] };
    try { c = JSON.parse(localStorage.getItem('cleanframe.controls.v1')); } catch (e) { c = null; }
    if (!c || typeof c !== 'object') return out;
    out.lights = c.lights === true;
    if (typeof c.go2rtc === 'string' && /^http:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):\d{2,5}$/.test(c.go2rtc)) out.go2rtc = c.go2rtc;
    if (out.go2rtc && Array.isArray(c.cameras)) c.cameras.slice(0, 6).forEach(function (cam) {
      if (cam && typeof cam.name === 'string' && cam.name.trim() && typeof cam.src === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(cam.src)) {
        out.cameras.push({ name: cam.name.trim().slice(0, 40), src: cam.src, full: typeof cam.full === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(cam.full) ? cam.full : '', ratio: window.FrameCameras.ratioValue(cam.ratio) });
      }
    });
    return out;
  }());
  var MSG = {
    leave: { title: 'Leave Home?', line: 'Open Samsung Home?', note: '', actions: [['stay', 'Stay'], ['samsung', 'Samsung Home']] }
  };
  var SVG = {
    apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    settings: '<path d="m9 3-.6 2.4-2 1.2L4 6l-2 3.5L3.8 11v2L2 14.5 4 18l2.4-.6 2 1.2L9 21h6l.6-2.4 2-1.2 2.4.6 2-3.5-1.8-1.5v-2L22 9.5 20 6l-2.4.6-2-1.2L15 3Z"/><circle cx="12" cy="12" r="3.2"/>',
    'wx-clear': '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    'wx-night': '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"/>',
    'wx-partly': '<path d="M8.5 6.5a3.5 3.5 0 0 1 6.2 1.8"/><path d="M7 19h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 7 19Z"/>',
    'wx-cloud': '<path d="M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 18Z"/>',
    'wx-rain': '<path d="M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14Z"/><path d="M9 17l-1 2.5M13 17l-1 2.5M17 17l-1 2.5"/>',
    'wx-snow': '<path d="M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14Z"/><path d="M9 18h.01M12 20h.01M15 18h.01"/>',
    'wx-fog': '<path d="M4 9h16M6 13h12M4 17h16"/>',
    'wx-storm': '<path d="M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14Z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>',
    lights: '<path d="M9 18h6M10 21h4M8.2 14.5A6 6 0 1 1 15.8 14.5c-.8.7-1.3 1.6-1.3 2.5h-5c0-.9-.5-1.8-1.3-2.5Z"/>',
    cameras: '<rect x="3" y="6.5" width="13" height="11" rx="2.2"/><path d="m16 10.5 5-3v9l-5-3"/>',
    undo: '<path d="M9 6 5 10l4 4"/><path d="M5 10h9.5a4.5 4.5 0 0 1 0 9H11"/>',
    check: '<path d="m5.5 12.5 4 4 9-9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="m14.5 5-7 7 7 7"/>',
    right: '<path d="m9.5 5 7 7-7 7"/>',
    up: '<path d="m5 15.5 7-7 7 7"/>',
    down: '<path d="m5 8.5 7 7 7-7"/>',
    updown: '<path d="m7.5 9.5 4.5-4.5 4.5 4.5M7.5 14.5l4.5 4.5 4.5-4.5"/>'
  };

  /* ---------- State ---------- */
  var S = {
    c: null, stack: null,
    sel: null, selIdx: 0, lastUtil: 0, appsFocus: null, settingsFocus: 'editor', appearanceFocus: 'layout', detailFocus: {},
    undo: [], removedAt: {}, note: null, err: null,
    writes: 0, failed: 0, press: null,
    shown: null, pending: null, lookError: null, bundleKey: null, reflow: false
  };
  var scroll = { first: 0, off: 0, photo: 0 };
  var homeSources = { active: false, loaded: false, ports: {}, request: 0, stop: null };
  function pick(v, list, fallback) {
    v = String(v || '').toLowerCase();
    for (var i = 0; i < list.length; i++) if (list[i].toLowerCase() === v) return list[i];
    return fallback;
  }
  function lookOf(c) { return { source: c.source, bg: c.bg, layout: c.layout, apps: c.apps, controls: c.controls, focus: c.focus, inputs: c.inputs, clock: c.clock }; }

  /* ---------- Helpers ---------- */
  function app(id) { for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i]; return null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function without(list, id) { return list.filter(function (x) { return x !== id; }); }
  function same(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function onHome(id) { return S.c.home.indexOf(id) >= 0; }
  function hdmiPort(id) { var a = app(id); return a && a.source && a.port || 0; }
  /* HDMI entries show while their input is connected, or always when Inputs on Home is Always. */
  function visibleHome() { return S.c.home.filter(function (id) { var p = hdmiPort(id); return !p || S.c.inputs === 'always' || homeSources.ports[p]; }); }
  function syncHomeSources() {
    var eligible = !document.hidden && top().id === 'home' && S.c.inputs !== 'always' && S.c.home.some(hdmiPort), token, events = 0, initialEvents;
    if (!eligible) {
      if (homeSources.active) {
        homeSources.active = false; homeSources.request++;
        if (homeSources.stop) homeSources.stop();
        homeSources.stop = null;
      }
      return;
    }
    if (homeSources.active) return;
    homeSources.active = true; token = ++homeSources.request;
    function accept(err, inputs) {
      if (token !== homeSources.request || !homeSources.active || document.hidden || top().id !== 'home') return;
      var ports = {}; homeSources.loaded = true;
      if (!err) inputs.forEach(function (input) { if (input.connected) ports[input.number] = true; });
      if (JSON.stringify(ports) !== JSON.stringify(homeSources.ports)) { homeSources.ports = ports; ensureSel(); render(); }
    }
    homeSources.stop = FrameDevice.watchSources(function (inputs) { events++; accept(null, inputs); });
    initialEvents = events;
    FrameDevice.sources(function (err, inputs) { if (events === initialEvents) accept(err, inputs || []); });
  }
  function top() { return S.stack[S.stack.length - 1]; }
  function push(e) { S.stack.push(e); return e; }
  function pop() {
    if (S.stack.length > 1) S.stack.pop();
    // Back on Home: an Art read or a newer photo's install cancelled in Visual is finished now.
    if ((artInstallCancelled || artRefreshCancelled) && top().id === 'home') setTimeout(refreshArt, 0);
  }
  function px(n) { return n.toFixed(2) + 'px'; }
  function icon(name, cls, underlay) {
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">'
      + (underlay ? '<g class="ut-underlay" transform="translate(0 .5)">' + SVG[name] + '</g><g class="ut-ink">' + SVG[name] + '</g>' : SVG[name]) + '</svg>';
  }
  var BADGE = '<svg class="badge is-on" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path class="badge-tick" d="m7.6 12.4 3 3 5.8-6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var maskSupport = 'webkitMaskImage' in document.documentElement.style || 'maskImage' in document.documentElement.style, markProbes = {};
  function markSource(id) { return ICONS + id + (id === 'espn' ? '.png' : '.svg'); }
  function probeMark(id) {
    if (markProbes[id]) return;
    var im = new Image(); markProbes[id] = 'loading';
    im.onload = function () { markProbes[id] = 'ok'; };
    im.onerror = function () {
      markProbes[id] = 'bad';
      Array.prototype.forEach.call(document.querySelectorAll('[data-mark="' + id + '"]'), function (el) { el.className += ' is-bad'; });
    };
    im.src = markSource(id);
  }
  /* Optical placement is identical for the CSS mask and the image fallback. */
  function markHtml(id, w, h, size) {
    var m = window.FrameIconMetrics && window.FrameIconMetrics[id], st;
    if (m) {
      var weight = clamp(Math.pow(0.45 / m.fill, 0.3), 0.84, 1.25);
      var k = Math.min(w / m.w, h / m.h, size * weight / Math.sqrt(m.w * m.h)), s = m.n * k;
      st = 'width:' + px(s) + ';height:' + px(s) + ';left:' + px(w / 2 - (m.x + m.w / 2) * k) + ';top:' + px(h / 2 - (m.y + m.h / 2) * k);
    } else st = 'width:' + w + 'px;height:' + h + 'px;left:0;top:0;object-fit:contain';
    probeMark(id);
    return '<span class="mark' + (markProbes[id] === 'bad' ? ' is-bad' : '') + '" data-mark="' + id + '" style="width:' + w + 'px;height:' + h + 'px">'
      + (maskSupport ? '<span class="mk" style="' + st + ';-webkit-mask-image:url(' + markSource(id) + ');mask-image:url(' + markSource(id) + ')"></span>' : '<img alt="" src="' + markSource(id) + '" style="' + st + '">') + '</span>';
  }
  function appMark(a, w, h, size) {
    if (a.mark) return markHtml(a.brand || a.id, w, h, size);
    var words = a.name.split(/\s+/), letters = words[0].charAt(0) + (words.length > 1 ? words[1].charAt(0) : '');
    return '<span class="mark monogram' + (a.icon ? ' native-icon' : '') + '" style="width:' + w + 'px;height:' + h + 'px;font-size:' + Math.round(size * .65) + 'px"><span>' + esc(letters.toUpperCase()) + '</span>'
      + (a.icon ? '<img alt="" data-native-icon="true" src="' + esc(a.icon) + '">' : '') + '</span>';
  }
  function smallMark(a) { return appMark(a, 56, 44, 36); }
  var measureContext = document.createElement('canvas').getContext('2d');
  /* The TV's own One UI Sans (as in Tizen's menus): nothing to download, so text is ready at
     once. Other platforms fall back to a standard sans-serif. */
  var FONT_STACK = '"One UI Sans APP", SamsungOneUI, "Samsung Sans", Roboto, "Helvetica Neue", Arial, sans-serif';
  function textWidth(text, size, weight, spacing) {
    var key = [text, size, weight, spacing].join('|'), width;
    if (widthCache.hasOwnProperty(key)) return widthCache[key];
    measureContext.font = (weight || 500) + ' ' + size + 'px ' + FONT_STACK;
    width = measureContext.measureText(text).width + Math.max(0, text.length - 1) * (spacing || 0);
    widthCache[key] = width;
    return width;
  }
  function dockLabelSize(id) { return S.c.apps === 'text' ? (textWidth(app(id).name, 40, 600, -.8) > 264 ? 34 : 40) : textWidth(app(id).name, 36, 500, -.8) > 280 ? 32 : 36; }
  function reducedDockLabel(id) { return S.c.apps !== 'icons' && dockLabelSize(id) === (S.c.apps === 'text' ? 34 : 32); }
  function photoLabel(id) {
    // List names: 84px medium (500); long names drop to 72px. Tops centre the text in the row.
    var text = app(id).name, size = PH_NAME, limit = 992, width = textWidth(text, size, 500, -1.6);
    if (width > limit) { size = 72; width = textWidth(text, size, 500, -1.6); }
    return { size: size, top: size === 72 ? 12.4 : 11.7, width: Math.min(limit, width), ellipsis: width > limit };
  }
  function listPlateWidth(id) {
    if (S.c.apps === 'icons') return 144;
    var text = S.c.apps === 'text';
    // Glass hugs the name as it grows 6% from the icon/text origin at x=28, with even 28-30px ends.
    if (S.c.focus === 'glass') return Math.max(text ? 240 : 300, Math.ceil(28 + (photoLabel(id).width + (text ? 0 : 100)) * PH_GROW + 30));
    return clamp(Math.ceil(photoLabel(id).width + (text ? 84 : 184)), text ? 280 : 360, text ? 1076 : 1176);
  }

  /* Keyed children: elements persist by key so transforms animate instead of re-creating.
     Children are absolutely positioned, so DOM order never needs to change. */
  function keyed(parent, items, update) {
    var map = parent._k || (parent._k = {}), seen = {}, i, it, el, isNew, k;
    for (i = 0; i < items.length; i++) {
      it = items[i]; el = map[it.key]; isNew = !el;
      if (isNew) { el = document.createElement('div'); map[it.key] = el; }
      update(el, it, i);
      if (isNew) parent.appendChild(el);
      seen[it.key] = 1;
    }
    for (k in map) if (map.hasOwnProperty(k) && !seen[k]) { if (map[k].parentNode === parent) parent.removeChild(map[k]); delete map[k]; }
  }
  function setContent(el, sig, renderContent) {
    sig += '|' + catalog.revision;
    if (el._sig === sig) return;
    el.innerHTML = renderContent();
    el._sig = sig;
    Array.prototype.forEach.call(el.querySelectorAll('[data-native-icon]'), function (img) {
      function ready() { img.parentNode.classList.add('has-native-icon'); }
      function failed() { img.style.display = 'none'; img.parentNode.classList.remove('has-native-icon'); }
      img.onload = ready; img.onerror = failed;
      if (img.complete) { if (img.naturalWidth) ready(); else failed(); }
    });
  }
  function setHTML(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }
  function attrs(el, z, i, action) { el.setAttribute('data-z', z); el.setAttribute('data-i', String(i)); el.setAttribute('data-action', action); }

  /* ---------- Saved preferences ---------- */
  function safeId(id) { return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/.test(id) && ['constructor', 'prototype', '__proto__'].indexOf(id) < 0; }
  function safeIcon(path) { return typeof path === 'string' && path.length < 2048 && /^(?:\/[^\/]|file:\/\/\/|wgt-package:\/\/\/)/.test(path) ? path : ''; }
  function load() {
    var keys = [KEY, 'cleanframe.shore.v1'], raw, saved, i;
    for (i = 0; i < keys.length; i++) {
      try {
        raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        saved = JSON.parse(raw);
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
      } catch (e) { storageOk = false; }
    }
    return null;
  }
  var BRANDS = ['hbomax', 'spotify', 'tubi', 'youtubetv'];
  /* Saved ids that name a built-in app by its Tizen id map to the built-in entry. */
  function canonicalId(id) {
    for (var i = 0; i < PRIMARY_APPS.length; i++) if (!PRIMARY_APPS[i].source && PRIMARY_APPS[i].appId === id) return PRIMARY_APPS[i].id;
    return id;
  }
  function clean(saved) {
    var s = saved && typeof saved === 'object' ? saved : {}, modern = s.look && typeof s.look === 'object' ? s.look : s;
    var legacyList = s.theme === 'list', h = [], recent = [], records = Array.isArray(s.appRecords) ? s.appRecords : [];
    records.slice(0, 256).forEach(function (a) {
      var brand;
      // A record for a built-in app (e.g. ESPN by its Tizen id) would list it twice.
      if (!a || !safeId(a.id) || !safeId(a.appId) || typeof a.name !== 'string' || !a.name.trim() || app(a.id) || canonicalId(a.id) !== a.id) return;
      brand = BRANDS.indexOf(a.brand) >= 0 ? a.brand : (window.FrameBrands || {})[a.appId] || '';
      APPS.push({ id: a.id, appId: a.appId, name: a.name.slice(0, 160), brand: brand, mark: !!brand, icon: safeIcon(a.icon) });
    });
    (Array.isArray(s.home) ? s.home : Array.isArray(s.dock) ? s.dock : []).forEach(function (id) {
      id = canonicalId(id);
      if (!safeId(id) || h.indexOf(id) >= 0 || h.length >= CAP) return;
      if (!app(id) && id.indexOf('.') > 0) APPS.push({ id: id, appId: id, name: id.split('.').pop(), mark: false });
      if (app(id)) h.push(id);
    });
    if (!h.length) h = DEFAULT_HOME.slice();
    (Array.isArray(s.recent) ? s.recent : []).forEach(function (id) { id = canonicalId(id); if (safeId(id) && app(id) && h.indexOf(id) < 0 && recent.indexOf(id) < 0 && recent.length < 5) recent.push(id); });
    return {
      source: 'art',
      bg: 'photo', layout: pick(modern.layout, LOOK_VALUES.layout, legacyList ? 'list' : 'dock'),
      apps: pick(modern.apps, LOOK_VALUES.apps, legacyList ? 'text' : 'both'), controls: pick(modern.controls, LOOK_VALUES.controls, 'both'),
      focus: pick(modern.focus, LOOK_VALUES.focus, legacyList ? 'type' : 'glass'), inputs: pick(modern.inputs, LOOK_VALUES.inputs, 'connected'), clock: weatherClock(pick(modern.clock, LOOK_VALUES.clock, 'time')),
      home: h, recent: recent, lastApp: h.indexOf(s.lastApp) >= 0 ? s.lastApp : h[0]
    };
  }
  // With weather is offered only where a location is set; otherwise a saved choice shows the clock.
  function weatherClock(v) { return v === 'weather' && !readWeather() ? 'time' : v; }
  function serialise(c) {
    var out = {};
    Object.keys(c).forEach(function (key) { out[key] = c[key]; });
    out.version = 2; out.look = lookOf(c); out.dock = c.home.slice();
    out.theme = c.layout === 'list' ? 'list' : 'shore';
    out.appRecords = [];
    c.home.concat(c.recent).forEach(function (key) {
      var a = app(key);
      if (a && PRIMARY.indexOf(key) < 0 && !out.appRecords.some(function (r) { return r.id === key; })) out.appRecords.push({ id: a.id, appId: a.appId, name: a.name, brand: a.brand || '', icon: a.icon || '' });
    });
    return out;
  }
  function initialise() {
    var saved = load(), initial; S.c = clean(saved); initial = next(S.c.home.slice(), S.c.recent.slice());
    S.stack = [{ id: 'home', f: { zone: 'apps', u: 0 } }];
    S.sel = S.c.lastApp; S.selIdx = S.c.home.indexOf(S.sel);
    // Keep the old schema keys alongside the builder values for in-place updates.
    try { localStorage.setItem(KEY, JSON.stringify(serialise(initial))); S.c = initial; storageOk = true; } catch (e) { storageOk = false; }
  }
  function clearSession() { S.undo = []; S.removedAt = {}; S.note = null; S.err = null; }
  function begin() { S.note = null; }
  function next(home, recent) { var c = lookOf(S.c); c.home = home; c.recent = recent; c.lastApp = S.c.lastApp; return c; }
  function snap() { return { home: S.c.home.slice(), recent: S.c.recent.slice() }; }
  function pushRecent(list, id) { return [id].concat(without(list, id)).slice(0, 5); }
  function write(c, label) {
    try { localStorage.setItem(KEY, JSON.stringify(serialise(c))); }
    catch (e) { storageOk = false; S.failed++; S.err = label; return false; }
    storageOk = true; S.c = c; S.writes++; S.err = null;
    return true;
  }

  function ensureSel() {
    var h = visibleHome(), i;
    if (!h.length) { S.sel = null; return -1; }
    i = h.indexOf(S.sel);
    // An HDMI entry hidden only because the inputs have not been reported yet keeps its selection.
    if (i < 0 && !homeSources.loaded && hdmiPort(S.sel) && onHome(S.sel)) return clamp(S.selIdx, 0, h.length - 1);
    if (i < 0) { i = clamp(S.selIdx, 0, h.length - 1); S.sel = h[i]; }
    S.selIdx = i;
    return i;
  }
  function setSel(id) { S.sel = id; S.selIdx = visibleHome().indexOf(id); }

  /* Home membership and order operations used by the editor. */
  function homeRemove(id) {
    var a = app(id), i = S.c.home.indexOf(id), before = snap(), h;
    if (i < 0) return false;
    if (S.c.home.length <= 1) { S.note = LAST; return false; }
    h = S.c.home.slice(); h.splice(i, 1);
    if (!write(next(h, pushRecent(S.c.recent, id)), 'Remove ' + a.name + ' from Home')) return false;
    S.removedAt[id] = i;
    S.undo.push({ label: 'Remove ' + a.name, snap: before });
    return true;
  }
  function homeAdd(id) {
    var a = app(id), before = snap(), h = S.c.home.slice(), at;
    if (h.length >= CAP) { S.note = FULL; return false; }
    at = S.removedAt.hasOwnProperty(id) ? Math.min(S.removedAt[id], h.length) : h.length;
    h.splice(at, 0, id);
    if (!write(next(h, without(S.c.recent, id)), 'Add ' + a.name + ' to Home')) return false;
    S.undo.push({ label: 'Add ' + a.name, snap: before });
    return true;
  }
  function homeMove(order, id, before) {
    var a = app(id);
    if (!write(next(order, S.c.recent.slice()), 'Move ' + a.name)) return false;
    S.undo.push({ label: 'Move ' + a.name, snap: before });
    return true;
  }
  function undoLast() {
    var u = S.undo[S.undo.length - 1];
    if (!u) { S.note = 'Nothing to undo'; return false; }
    if (!write(next(u.snap.home.slice(), u.snap.recent.slice()), 'Undo ' + u.label)) return false;
    S.undo.pop();
    S.note = 'Undone: ' + u.label + '.';
    return true;
  }
  function undoLabel() { var u = S.undo[S.undo.length - 1]; return u ? u.label : ''; }
  function undoCaption() { var label = undoLabel(); return label ? 'Undo ' + label.charAt(0).toLowerCase() + label.slice(1) : 'Nothing to undo'; }
  function editStatus(hint, move) {
    if (S.err) return '<span class="warn error-chip">Couldn’t save. Nothing changed.</span>';
    if (S.note === FULL || S.note === LAST) return '<span class="warn">' + esc(S.note) + '</span>';
    if (hint === FULL || hint === LAST) return '<span class="warn">' + esc(hint) + '</span>';
    return esc(move || hint || S.note || '');
  }

  var busy = false, busyTimer = 0;
  function release() { busy = false; clearTimeout(busyTimer); S.press = null; }
  function message(title, line, note) {
    push({ id: 'message', msg: 'error', content: { title: title, line: line, note: note || '', actions: [['back', 'Back']] }, f: { b: 0 } });
  }
  function perform(title, run) {
    if (busy) return;
    busy = true; busyTimer = setTimeout(release, 10000);
    run(function (err) {
      release();
      if (err) message(title, err.message || 'The TV could not open this screen.', err.detail || '');
      render();
    });
  }
  function launch(id) {
    var a = app(id), c;
    if (!a || busy) return;
    if (S.c.home.indexOf(id) >= 0) { c = next(S.c.home.slice(), S.c.recent.slice()); c.lastApp = id; write(c, 'Last app'); }
    S.press = id;
    perform(a.name, function (done) {
      function sourceDone(err) { done(err && err.cancelled ? null : err); }
      if (a.port) FrameDevice.setSource(a.port, sourceDone);
      else if (a.source) FrameDevice.liveTV(sourceDone);
      else FrameDevice.launchApp(a.appId, done);
    });
  }
  function refreshCatalog() {
    var request, oldFocus;
    if (catalog.loading) return;
    request = ++catalog.request; catalog.loading = true; catalog.error = null;
    FrameDevice.apps(function (err, entries) {
      if (request !== catalog.request) return;
      catalog.loading = false;
      if (err) { catalog.error = err.message || 'Could not read installed apps.'; if (!catalog.loaded) ALPHA = []; render(); return; }
      oldFocus = top().id === 'apps' ? ALPHA[top().f.i] : null;
      ALPHA = [];
      entries.forEach(function (entry) {
        var id = PRIMARY.indexOf(entry.brand) >= 0 ? entry.brand : entry.appId, a;
        if (!safeId(id) || !safeId(entry.appId) || entry.appId === 'org.tizen.tv-viewer' || ALPHA.indexOf(id) >= 0) return;
        a = app(id);
        if (!a) { a = { id: id }; APPS.push(a); }
        a.appId = entry.appId; a.brand = entry.brand || ''; a.mark = !!entry.brand;
        a.icon = safeIcon(entry.icon);
        a.name = PRIMARY.indexOf(id) >= 0 ? PRIMARY_APPS[PRIMARY.indexOf(id)].name : String(entry.name).slice(0, 160);
        ALPHA.push(id);
      });
      ALPHA.sort(function (a, b) { return app(a).name.toLowerCase().localeCompare(app(b).name.toLowerCase()); });
      ALPHA = SOURCES.concat(ALPHA); // Live TV and inputs lead All apps.
      catalog.loaded = true; catalog.error = null; catalog.revision++;
      if (top().id === 'apps' && oldFocus && ALPHA.indexOf(oldFocus) >= 0) top().f.i = ALPHA.indexOf(oldFocus);
      norm(); render();
    });
  }

  /* ---------- Navigation targets ---------- */
  function utils() { return (CONTROLS.lights ? ['lights'] : []).concat(CONTROLS.cameras.length ? ['cameras'] : [], ['apps', 'settings']); }
  /* prev/next run along the apps; out goes to the controls, inn comes back (or to a per-app action). */
  function axes() {
    var v = S.c.layout === 'list';
    return { prev: v ? 'up' : 'left', next: v ? 'down' : 'right', out: v ? 'right' : 'up', inn: v ? 'left' : 'down' };
  }
  function utilAction(u) {
    if (u === 'lights') pressLights();
    else if (u === 'cameras') CAMERAS.open();
    else if (u === 'apps') openApps();
    else openSettings();
  }
  /* Lights: the TV-local bridge fires the owner's Vetro rule, which tells Home Assistant over MQTT. */
  var lightsFlash = null, lightsTimer = 0;
  var lightsBusy = false;
  function pressLights() {
    var xhr, done = false;
    if (lightsBusy) return; // One press at a time: a second press during a slow one is ignored.
    lightsBusy = true; xhr = new window.XMLHttpRequest();
    function finish(ok) {
      if (done) return; done = true; lightsBusy = false;
      if (ok === null) return; // Rate-limited by the bridge: nothing new was sent, so nothing to report.
      lightsFlash = ok ? 'TV lights' : 'Lights unavailable'; clearTimeout(lightsTimer);
      lightsTimer = setTimeout(function () { lightsFlash = null; render(); }, 2500); render();
    }
    try {
      xhr.open('POST', window.FrameArt.bridge() + '/lights', true); xhr.timeout = 6000;
      window.FrameArt.authorize(xhr);
      xhr.onload = function () { finish(xhr.status === 429 ? null : xhr.status === 204); };
      xhr.onerror = xhr.ontimeout = function () { finish(false); };
      xhr.send('');
    } catch (e) { finish(false); }
  }
  // The Cameras view (tiles, snapshots, streams, timers, the TV player) lives in cameras.js.
  var CAMERAS = window.FrameCameras.create({ cameras: CONTROLS.cameras, go2rtc: CONTROLS.go2rtc, top: top, push: push, pop: pop, render: render, view: function () { return sheetView; } });
  function openSettings() { push({ id: 'settings', f: { id: S.settingsFocus } }); }
  function openAppearance(group) {
    // Visual (layout) is the only group: focus starts on the remembered row or the current layout.
    var action = S.detailFocus[group] || 'choice.layout.' + S.c.layout;
    push({ id: 'appearance', group: group, f: { action: action } });
  }
  function openMessage(key) { push({ id: 'message', msg: key, f: { b: 0 } }); }
  function openApps() {
    var e = { id: 'apps', mode: 'browse', top: 0, f: { zone: 'grid', i: Math.max(0, ALPHA.indexOf(S.appsFocus)), h: 0 } };
    push(e); refreshCatalog(); return e;
  }
  function openEditor() {
    ensureSel(); var i = S.c.home.indexOf(S.sel);
    clearSession();
    refreshCatalog();
    push({ id: 'editor', lifted: null, top: 0, otherReturn: { id: otherList()[0] || null, index: 0, top: 0 }, f: { zone: S.c.home.length ? 'home' : 'other', i: Math.max(0, i), part: 'name', h: 1, j: 0 } });
  }
  function isSettingsDetail(t) { return t.id === 'appearance'; }

  var V = {};

  /* ---------- Home (browse) ---------- */
  V.home = {
    key: function (t, k) {
      var f = t.f, h = visibleHome(), U = utils(), x = axes(), i = ensureSel();
      if (S.c.layout === 'list') { listHomeKey(t, k, i, U); return; }
      if (f.zone === 'util') {
        f.u = clamp(f.u, 0, U.length - 1);
        if (k === x.prev && f.u > 0) f.u--;
        else if (k === x.next && f.u < U.length - 1) f.u++;
        else if (k === x.inn || k === 'back') f.zone = 'apps';
        else if (k === 'ok') { S.lastUtil = f.u; utilAction(U[f.u]); return; }
        S.lastUtil = f.u;
        return;
      }
      f.zone = 'apps';
      if (k === x.out) { f.zone = 'util'; f.u = clamp(S.lastUtil, 0, U.length - 1); }
      else if (k === 'back') openMessage('leave');
      else if (!h.length) { if (k === 'ok') openEditor(); }
      else if (k === x.prev && i > 0) setSel(h[i - 1]);
      else if (k === x.next && i < h.length - 1) setSel(h[i + 1]);
      else if (k === 'ok') launch(h[i]); // The app drawn focused, even while a hidden input keeps the selection.
    },
    point: function (t, z, i) {
      if (z === 'util') { t.f.zone = 'util'; t.f.u = i; S.lastUtil = i; }
      else if (z === 'app') { t.f.zone = 'apps'; setSel(visibleHome()[i]); }
      else if (z === 'empty') t.f.zone = 'apps';
      else return;
      this.key(t, 'ok');
    }
  };
  /* Right from a list row picks the Home control (Lights, Cameras, Apps, Settings) level with it on screen.
     Rows come from the layout model (never mid-scroll); the controls do not move. */
  function nearestUtil(row, U) {
    var sr = sceneEl.getBoundingClientRect(), scale = sr.width / 1920 || 1, y = PH_TOP + (row - scroll.photo) * PH_PITCH + PH_PITCH / 2;
    var best = clamp(S.lastUtil, 0, U.length - 1), gap = Infinity;
    Array.prototype.forEach.call(utilsEl.querySelectorAll('.u[data-z="util"]'), function (b) {
      var r = b.getBoundingClientRect(), n = Number(b.getAttribute('data-i')), d = Math.abs((r.top + r.height / 2 - sr.top) / scale - y);
      if (r.height && n < U.length && d < gap) { gap = d; best = n; }
    });
    return best;
  }
  function listHomeKey(t, k, i, U) {
    var f = t.f, h = visibleHome();
    if (f.zone === 'util') {
      f.u = clamp(f.u, 0, U.length - 1);
      if (k === 'up' && f.u > 0) f.u--;
      else if (k === 'down' && f.u < U.length - 1) f.u++;
      else if (k === 'left' || k === 'back') f.zone = 'apps'; // Back to the app you came from.
      else if (k === 'ok') { S.lastUtil = f.u; utilAction(U[f.u]); return; }
      S.lastUtil = f.u;
      return;
    }
    f.zone = 'apps';
    if (k === 'up' && i > 0) setSel(h[i - 1]);
    else if (k === 'right') { f.zone = 'util'; f.u = nearestUtil(i, U); }
    else if (k === 'down' && i < h.length - 1) setSel(h[i + 1]);
    else if (k === 'back') openMessage('leave');
    else if (k === 'ok') { if (h.length) launch(h[i]); else openEditor(); }
  }

  /* ---------- Installed apps ---------- */
  function appsItems() { return catalog.error ? [] : ALPHA; }
  // Only a catalogue error puts a control in the header; the editor opens from Settings (or an empty Home).
  function appsHead() { return catalog.error ? [['retry', 'Try again', '', '']] : []; }
  V.apps = {
    sheet: true,
    norm: function (t) {
      var n = appsItems().length;
      t.f.i = clamp(t.f.i, 0, Math.max(0, n - 1));
      if (!n) t.f.zone = 'head';
      else if (t.f.zone === 'head' && !appsHead().length) t.f.zone = 'grid'; // The empty header holds no focus.
    },
    key: function (t, k) {
      var f = t.f, items = appsItems(), n = items.length, col = f.i % COLS, row = Math.floor(f.i / COLS);
      if (k === 'back') { pop(); return; }
      if (f.zone === 'head') {
        if (k === 'down' && n) f.zone = 'grid';
        else if (k === 'ok' && catalog.error) refreshCatalog();
        return;
      }
      if (k === 'left' && col > 0) f.i--;
      else if (k === 'right' && col < COLS - 1 && f.i < n - 1) f.i++;
      else if (k === 'down' && row < Math.ceil(n / COLS) - 1) f.i = Math.min(f.i + COLS, n - 1);
      else if (k === 'up') { if (row > 0) f.i -= COLS; else if (appsHead().length) f.zone = 'head'; }
      else if (k === 'ok' && n) launch(items[f.i]);
      S.appsFocus = items[f.i] || null;
    },
    point: function (t, z, i) { if (z === 'grid') { t.f.zone = 'grid'; t.f.i = i; } else if (z === 'head') t.f.zone = 'head'; else return; this.key(t, 'ok'); }
  };

  /* ---------- Two-zone Home editor ---------- */
  function otherGroups() {
    var rec = S.c.recent.filter(function (id) { return !onHome(id) && app(id); });
    return { recent: rec, rest: ALPHA.filter(function (id) { return !onHome(id) && rec.indexOf(id) < 0; }) };
  }
  function otherList() { var o = otherGroups(); return o.recent.concat(o.rest); }
  // The editor's 'Then scroll' line sits after the apps Home shows before scrolling.
  function editorCut() { return S.c.layout === 'list' ? PH_FULL : 5; }
  function editorHomeY(i) { return i * ED_ROW + (i >= editorCut() ? 24 : 0); }
  function editorOtherY(j) {
    var o = otherGroups();
    return j * ED_ROW + (o.recent.length ? ED_SEP : 0) + (o.recent.length && j >= o.recent.length ? ED_SEP : 0);
  }
  function rememberOther(t) {
    var list = otherList();
    t.otherReturn = { id: list[t.f.j] || null, index: t.f.j, top: t.top };
  }
  function returnOther(t) {
    var list = otherList(), memory = t.otherReturn, i = memory ? list.indexOf(memory.id) : -1;
    t.f.zone = 'other';
    t.f.j = i >= 0 ? i : clamp(memory ? memory.index : 0, 0, Math.max(0, list.length - 1));
    if (memory) t.top = memory.top;
  }
  function nearestHome(t, count) {
    // Both columns scroll on their own: compare on-screen positions (On Home scrolls by homeTop).
    var target = editorOtherY(t.f.j) - t.top + t.homeTop + 36, best = 0, distance = Infinity, i, d;
    for (i = 0; i < count; i++) {
      d = Math.abs(editorHomeY(i) + 36 - target);
      if (d < distance) { best = i; distance = d; }
    }
    return best;
  }
  V.editor = {
    sheet: true,
    norm: function (t) {
      var f = t.f, nh = (t.lifted ? t.lifted.order : S.c.home).length, no = otherList().length;
      f.i = clamp(f.i, 0, Math.max(0, nh - 1));
      f.j = clamp(f.j, 0, Math.max(0, no - 1));
      if (f.zone === 'home' && !nh) f.zone = no ? 'other' : 'head';
      if (f.zone === 'other' && !no) f.zone = nh ? 'home' : 'head';
    },
    key: function (t, k) {
      var f = t.f, H = t.lifted ? t.lifted.order : S.c.home, O = otherList(), nh = H.length, no = O.length, d, tmp;
      if (t.lifted) {
        d = k === 'up' ? -1 : k === 'down' ? 1 : 0;
        if (d && f.i + d >= 0 && f.i + d < nh) { tmp = H[f.i + d]; H[f.i + d] = H[f.i]; H[f.i] = tmp; f.i += d; S.err = null; }
        else if (k === 'ok') editorPlace(t);
        else if (k === 'back') { f.i = t.lifted.from; t.lifted = null; S.err = null; }
        return;
      }
      if (k === 'back') { closeEditor(); return; }
      if (f.zone === 'head') {
        if (k === 'left' && f.h > 0) f.h--;
        else if (k === 'right' && f.h < 1) f.h++;
        else if (k === 'down') { if (no) returnOther(t); else if (nh) f.zone = 'home'; }
        else if (k === 'ok') { begin(); if (f.h === 0) undoLast(); else closeEditor(); }
      } else if (f.zone === 'home') {
        if (k === 'up') { if (f.i > 0) f.i--; else f.zone = 'head'; }
        else if (k === 'down') { if (f.i < nh - 1) f.i++; }
        else if (k === 'right') { if (f.part === 'name') f.part = 'remove'; else if (no) returnOther(t); }
        else if (k === 'left') { if (f.part === 'remove') f.part = 'name'; }
        else if (k === 'ok') {
          begin();
          if (f.part === 'name') t.lifted = { id: H[f.i], from: f.i, order: H.slice(), snap: snap() };
          else editorRemove(t, H[f.i]);
        }
      } else {
        if (k === 'up') { if (f.j > 0) { f.j--; rememberOther(t); } else f.zone = 'head'; }
        else if (k === 'down') { if (f.j < no - 1) { f.j++; rememberOther(t); } }
        else if (k === 'left') { if (nh) { rememberOther(t); f.i = nearestHome(t, nh); f.zone = 'home'; f.part = 'name'; } }
        else if (k === 'ok') { begin(); editorAdd(t, O[f.j]); }
      }
    },
    point: function (t, z, i) {
      if (t.lifted) { if (z === 'name' && i === t.f.i) this.key(t, 'ok'); return; }
      if (z === 'name' || z === 'remove') { t.f.zone = 'home'; t.f.i = i; t.f.part = z; }
      else if (z === 'other') { t.f.zone = 'other'; t.f.j = i; rememberOther(t); }
      else if (z === 'head') { t.f.zone = 'head'; t.f.h = i; }
      else return;
      this.key(t, 'ok');
    }
  };
  /* Focus follows the app between zones, so a repeated OK toggles the same app. */
  function editorRemove(t, id) {
    if (!homeRemove(id)) return;
    t.f.zone = 'other'; t.f.j = otherList().indexOf(id);
    S.note = app(id).name + ' is in Recently removed. OK puts it back.';
  }
  function editorAdd(t, id) {
    rememberOther(t);
    if (!homeAdd(id)) return;
    var remaining = otherList(), at = clamp(t.otherReturn.index, 0, Math.max(0, remaining.length - 1));
    t.otherReturn.id = remaining[at] || null; t.otherReturn.index = at;
    t.f.zone = 'home'; t.f.i = S.c.home.indexOf(id); t.f.part = 'remove';
    S.note = app(id).name + ' is on Home, position ' + (t.f.i + 1) + '.';
  }
  function editorPlace(t) {
    var L = t.lifted;
    begin();
    if (same(L.order, S.c.home)) { t.lifted = null; return; }
    if (!homeMove(L.order.slice(), L.id, L.snap)) return;
    t.lifted = null;
    S.note = app(L.id).name + ' moved to position ' + (t.f.i + 1) + '.';
  }
  function closeEditor() { clearSession(); pop(); }

  /* ---------- Settings, Layout and messages ---------- */
  function settingsRows() {
    var n = S.c.home.length;
    return [{ id: 'editor', label: 'Apps on Home', value: n + (n === 1 ? ' app' : ' apps') },
      { id: 'layout', label: 'Visual', value: VALUE_NAMES[S.c.layout] + ' · ' + VALUE_NAMES[S.c.focus] + ' focus' },
      { id: 'samsung', label: 'Samsung Home', value: 'Leave CleanFrame for Samsung’s Home screen', button: true }];
  }
  function settingsIds() { return settingsRows().map(function (r) { return r.id; }); }
  V.settings = {
    sheet: true,
    norm: function (t) { var ids = settingsIds(); if (ids.indexOf(t.f.id) < 0) t.f.id = ids[0]; },
    key: function (t, k) {
      var ids = settingsIds(), i = Math.max(0, ids.indexOf(t.f.id));
      if (k === 'up' && i > 0) i--;
      else if (k === 'down' && i < ids.length - 1) i++;
      else if (k === 'back') { pop(); return; }
      t.f.id = ids[i]; S.settingsFocus = ids[i];
      if (k === 'ok') settingsOk(ids[i]);
    },
    point: function (t, z, i, id) { if (z === 'row' && id) { t.f.id = id; this.key(t, 'ok'); } }
  };
  function settingsOk(id) {
    if (id === 'editor') openEditor();
    else if (id === 'samsung') perform('Samsung Home', FrameDevice.home);
    else openAppearance(id);
  }
  var DETAIL_NAMES = { layout: 'Visual' };
  function choice(axis, value) {
    return { action: 'choice.' + axis + '.' + value, axis: axis, value: value, label: value === 'both' ? 'Both' : VALUE_NAMES[value] };
  }
  function detailSections() {
    function options(axis, values) { return values.map(function (value) { return choice(axis, value); }); }
    return [
      { id: 'layout', title: 'Layout', items: options('layout', ['list', 'dock']) },
      { id: 'focus', title: 'Focus', items: options('focus', ['glass', 'type']) },
      { id: 'apps', title: 'App display', items: options('apps', ['text', 'icons', 'both']) },
      { id: 'controls', title: 'Home controls', items: options('controls', ['text', 'icons', 'both']) },
      { id: 'inputs', title: 'Inputs on Home', items: options('inputs', ['connected', 'always']) },
      { id: 'clock', title: 'Clock', items: options('clock', WEATHER ? ['off', 'time', 'weather'] : ['off', 'time']) }
    ];
  }
  function detailRows() {
    var rows = [[{ action: 'settings.back', label: 'Settings' }]];
    detailSections().forEach(function (section) { rows.push(section.items); });
    if (S.lookError) rows.push([{ action: 'settings.retry', label: 'Try again' }]);
    return rows;
  }
  function detailLocation(t) {
    var rows = detailRows(), row = 0, column = 0;
    rows.forEach(function (items, r) { items.forEach(function (item, c) { if (item.action === t.f.action) { row = r; column = c; } }); });
    return { rows: rows, row: row, column: column, item: rows[row][column] };
  }
  function detailFocus(t, item, column) {
    t.f.action = item.action;
    if (item.action !== 'settings.back') S.detailFocus[t.group] = item.action;
    if (column !== undefined) t.f.column = column;
    if (item.axis) S.appearanceFocus = item.axis;
  }
  function detailBack() { if (S.pending && S.pending.background) artInstallCancelled = true; cancelLook(); S.err = null; pop(); FrameDevice.cancelSource(); }
  function detailOk(t, item) {
    var patch = {}, error = S.lookError;
    if (item.action === 'settings.back') { detailBack(); return; }
    if (S.pending && S.pending.background) { cancelLook(); artInstallCancelled = true; } // Installed on the way back to Home (pop).
    if (S.pending) return;
    if (item.action === 'settings.retry') {
      if (error && error.patch[error.row] !== undefined) detailFocus(t, choice(error.row, error.patch[error.row]), 0);
      if (error) setLook(error.patch, { row: error.row });
    } else if (item.axis) { patch[item.axis] = item.value; setLook(patch, { row: item.axis }); }
  }
  V.appearance = {
    norm: function (t) {
      var rows = detailRows(), exists = false, applied = null;
      var axis = { layout: 'layout' }[t.group];
      rows.forEach(function (items) { items.forEach(function (item) {
        if (item.action === t.f.action) exists = true;
        if (item.axis === axis && item.value === S.c[axis]) applied = item;
      }); });
      if (!exists) detailFocus(t, applied || (rows[1] || rows[0])[0], 0);
      if (t.f.column === undefined) t.f.column = detailLocation(t).column;
    },
    key: function (t, k) {
      var at = detailLocation(t), row = at.row, column = at.column;
      if (k === 'back') { detailBack(); return; }
      if (k === 'ok') { detailOk(t, at.item); return; }
      if (k === 'up' || k === 'down') {
        row = clamp(row + (k === 'up' ? -1 : 1), 0, at.rows.length - 1);
        column = Math.min(t.f.column || 0, at.rows[row].length - 1);
        detailFocus(t, at.rows[row][column]);
      } else if (k === 'left' || k === 'right') {
        column = clamp(column + (k === 'left' ? -1 : 1), 0, at.rows[row].length - 1);
        detailFocus(t, at.rows[row][column], column);
      }
    },
    point: function (t, z, i, action) {
      if (z !== 'detail') return;
      detailRows().some(function (items) { return items.some(function (item, column) {
        if (item.action !== action) return false;
        detailFocus(t, item, column); detailOk(t, item); return true;
      }); });
    }
  };
  function messageContent(t) { return t.content || MSG[t.msg]; }
  /* ---------- Cameras: loaded only while this view is open ---------- */
  V.cameras = { sheet: true, key: CAMERAS.key, point: CAMERAS.point };
  V.message = {
    sheet: true,
    key: function (t, k) {
      var A = messageContent(t).actions, a;
      if (k === 'left') t.f.b = Math.max(0, t.f.b - 1);
      else if (k === 'right') t.f.b = Math.min(A.length - 1, t.f.b + 1);
      else if (k === 'back') pop();
      else if (k === 'ok') { a = A[t.f.b][0]; pop(); if (a === 'samsung') perform('Samsung Home', FrameDevice.home); }
    },
    point: function (t, z, i) { if (z === 'act') { t.f.b = i; this.key(t, 'ok'); } }
  };

  /* ---------- Dispatch ---------- */
  function norm() { var t = top(), v = V[t.id]; if (v.norm) v.norm(t); }
  function press(k) {
    norm();
    var t = top();
    if (k === 'back') FrameDevice.cancelSource();
    V[t.id].key(t, k);
    norm();
    render();
  }

  /* ---------- Rendering ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), homeEl = $('home'), caption = $('caption'), utilsEl = $('utils');
  var utilFocusLabel = $('utilFocusLabel'), utilFocusKey = '', appFocusName = $('appFocusName');
  var dock = $('dock'), shelf = $('shelf'), track = $('track'), plate = $('plate'), dockEmpty = $('dockEmpty');
  var cueL = $('cueL'), cueR = $('cueR');
  var focusStatus = $('focusStatus'), sceneEl = $('scene'), appearanceEl = $('appearance'), appearanceRows = $('appearanceRows');
  var appearanceBack = $('appearanceBack'), appearanceTitle = $('appearanceTitle'), appearanceStatus = $('appearanceStatus');
  var phList = $('phList'), phRows = $('phRows'), phEmpty = $('phEmpty');
  var phPlates = [$('phPlate'), $('phPlateAlt')], photoPlateIndex = 0, photoPlateKey = null;
  var utPlates = [$('utLens'), $('utLensAlt')], utPlateIndex = 0, utPlateKey = null;
  var sheetEl = $('sheet'), sheetView = $('sheetView');
  var IMG = { photo: $('photo'), mat: $('matImg'), bg: $('sheetBg') };
  var sheetKey = '', slotEls = {}, dockEdgeFrame = 0, dockEdgeUntil = 0, dockAnchorCenter = 960;

  function render() {
    var t = top(), sheet = !!V[t.id].sheet;
    stage.className = 'stage bg-photo source-art l-' + S.c.layout + ' f-' + S.c.focus + ' a-' + S.c.apps + ' u-' + S.c.controls + ' at-' + t.id + (sheet ? ' is-sheet' : '') + (S.reflow ? ' is-reflow' : '') + (S.rapid ? ' is-rapid' : '');
    if (!sheet) renderHome(t);
    renderSheet(t, sheet);
    renderAppearance(t);
    renderFocusStatus(t);
    syncHomeSources();
  }

  function homeState(t) {
    var h = visibleHome(), hs = { zone: null, i: Math.max(0, ensureSel()), u: -1, items: h.map(function (id) { return { key: id, id: id }; }) };
    if (isSettingsDetail(t)) hs.zone = 'preview';
    else if (t.id === 'home') { hs.zone = t.f.zone; hs.u = t.f.u; }
    return hs;
  }

  function renderHome(t) {
    var hs = homeState(t);
    renderCaption(t, hs);
    renderUtils(hs);
    if (S.c.layout === 'list') renderList(hs);
    else renderDock(hs);
    renderAppFocusName(hs);
  }

  function clockText() {
    var d = new Date(), h = d.getHours() % 12 || 12, m = d.getMinutes();
    return h + ':' + (m < 10 ? '0' : '') + m;
  }
  /* Weather beside the clock, from Open-Meteo (no account or key). Location comes from
     cleanframe.weather.v1 = { lat, lon, unit: 'f' | 'c' }; without it the option is not offered.
     Fetched at most every 20 minutes while the clock shows weather, only from the minute clock
     tick or a settings change, never from a key press; the last reading is kept. */
  var WEATHER = readWeather();
  function readWeather() {
    var w = null;
    try { w = JSON.parse(localStorage.getItem('cleanframe.weather.v1')); } catch (e) { w = null; }
    if (!w || typeof w.lat !== 'number' || typeof w.lon !== 'number' || Math.abs(w.lat) > 90 || Math.abs(w.lon) > 180) return null;
    return { lat: Math.round(w.lat * 100) / 100, lon: Math.round(w.lon * 100) / 100, unit: w.unit === 'c' ? 'c' : 'f' };
  }
  var weatherNow = null, weatherAt = 0, weatherBusy = false;
  try { weatherNow = JSON.parse(localStorage.getItem('cleanframe.weather.last')); } catch (e) { weatherNow = null; }
  function weatherKind(code) {
    return code === 0 || code === 1 ? 'clear' : code === 2 ? 'partly' : code === 3 ? 'cloud' : code === 45 || code === 48 ? 'fog' : code >= 95 ? 'storm' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : code >= 51 ? 'rain' : 'cloud';
  }
  function refreshWeather() {
    var xhr, url;
    if (!WEATHER || weatherBusy || S.c.clock !== 'weather' || document.hidden || Date.now() - weatherAt < 20 * 60000) return;
    weatherBusy = true;
    // A failed read is retried after 90 s (for example when the TV wakes before Wi-Fi is up).
    function failed() { weatherBusy = false; weatherAt = Date.now() - 20 * 60000 + 90000; }
    url = 'https://api.open-meteo.com/v1/forecast?latitude=' + WEATHER.lat + '&longitude=' + WEATHER.lon + '&current=temperature_2m,weather_code,is_day&temperature_unit=' + (WEATHER.unit === 'c' ? 'celsius' : 'fahrenheit');
    try {
      xhr = new window.XMLHttpRequest(); xhr.open('GET', url, true); xhr.timeout = 8000;
      xhr.onload = function () {
        var c;
        try { c = JSON.parse(xhr.responseText).current; } catch (e) { c = null; }
        if (xhr.status !== 200 || !c || typeof c.temperature_2m !== 'number' || typeof c.weather_code !== 'number') { failed(); return; }
        weatherBusy = false; weatherAt = Date.now();
        weatherNow = { temp: Math.round(c.temperature_2m), kind: weatherKind(c.weather_code), day: c.is_day !== 0, at: Date.now() };
        try { localStorage.setItem('cleanframe.weather.last', JSON.stringify(weatherNow)); } catch (e) { /* Memory only. */ }
        render();
      };
      xhr.onerror = xhr.ontimeout = failed;
      xhr.send();
    } catch (e) { failed(); }
  }
  function weatherHtml() {
    // A reading older than three hours (or with no time) is not shown: stale weather misleads.
    if (!WEATHER || !weatherNow || typeof weatherNow.temp !== 'number' || !SVG['wx-' + weatherNow.kind] || !(Date.now() - weatherNow.at < 3 * 3600000)) return '';
    var kind = weatherNow.kind === 'clear' && !weatherNow.day ? 'night' : weatherNow.kind;
    return '<span class="weather">' + icon('wx-' + kind) + '<span class="weather-temp">' + weatherNow.temp + '°</span></span>';
  }
  function renderCaption(t, hs) {
    var html = S.c.clock === 'off' ? '' : '<span class="clock">' + clockText() + (S.c.clock === 'weather' ? weatherHtml() : '') + '</span>';
    if (S.c.apps !== 'icons' && hs.items[hs.i] && (S.c.layout === 'list' ? photoLabel(hs.items[hs.i].id).size < PH_NAME || photoLabel(hs.items[hs.i].id).ellipsis : hs.zone === 'apps' && reducedDockLabel(hs.items[hs.i].id))) html += '<span class="cap-line full-name">' + esc(app(hs.items[hs.i].id).name) + '</span>';
    setHTML(caption, html);
  }

  function utilBtn(z, i, action, inner, extra, name) {
    return '<button type="button" tabindex="-1" class="u' + (extra || '') + '" data-z="' + z + '" data-i="' + i + '" data-action="' + action + '" aria-label="' + esc(name) + '"><span class="u-content">' + inner + '</span></button>';
  }
  function renderUtils(hs) {
    var html = '', style = S.c.controls, iconsOnly = style === 'icons', U = utils(), focused = null;
    utilsEl.className = 'utils quiet-utils is-' + style + (hs.zone === 'util' ? ' is-awake' : '');
    U.forEach(function (u, i) { var label = u === 'lights' && lightsFlash || UTIL[u][0]; html += utilBtn('util', i, 'util.' + u, icon(UTIL[u][1], '', true) + '<span class="u-label">' + label + '</span>', '', label); });
    setHTML(utilsEl, html);
    Array.prototype.forEach.call(utilsEl.querySelectorAll('.u'), function (b) {
      var z = b.getAttribute('data-z'), focus = hs.zone === z && hs.u === Number(b.getAttribute('data-i'));
      b.className = b.className.replace(/\s+is-focus/g, '') + (focus ? ' is-focus' : '');
      if (focus) focused = b;
    });
    renderUtilFocusLabel(iconsOnly ? focused : null);
    renderUtilityLens(focused, iconsOnly);
  }
  function renderUtilFocusLabel(button) {
    var text, key, r, sr, scale, width, x;
    if (!button) { utilFocusLabel.className = 'util-focus-label'; utilFocusKey = ''; return; }
    text = S.err ? 'Not saved. OK tries again.' : button.getAttribute('aria-label');
    key = button.getAttribute('data-action') + '|' + text;
    if (key !== utilFocusKey) {
      utilFocusLabel.className = 'util-focus-label'; utilFocusLabel.textContent = text;
      utilFocusLabel.offsetWidth;
      utilFocusKey = key;
    }
    r = button.getBoundingClientRect(); sr = sceneEl.getBoundingClientRect(); scale = sr.width / 1920 || 1;
    width = Math.ceil(textWidth(text, 28, 500, -.2) + 8); x = (r.left + r.width / 2 - sr.left) / scale - width / 2;
    if (S.c.layout === 'list') x = 1770 - width;
    utilFocusLabel.style.width = width + 'px'; utilFocusLabel.style.left = clamp(x, 80, 1848 - width) + 'px';
    utilFocusLabel.style.top = (S.c.layout === 'list' ? (r.top + r.height / 2 - sr.top) / scale - 19 : 108) + 'px';
    utilFocusLabel.className = 'util-focus-label is-on';
  }
  function renderUtilityLens(button, iconsOnly) {
    var r, label, sr, scale, x, y, width, key, el;
    if (!button || S.c.focus !== 'glass') {
      utPlates.forEach(function (plateEl) { plateEl.className = 'ph-plate ut-lens is-outgoing'; });
      utPlateKey = null;
      return;
    }
    r = button.getBoundingClientRect(); sr = sceneEl.getBoundingClientRect(); scale = sr.width / 1920 || 1;
    y = (r.top - sr.top) / scale + 2;
    if (S.c.layout === 'list') {
      label = iconsOnly ? utilFocusLabel : button.querySelector('.u-label');
      x = (label.getBoundingClientRect().left - sr.left) / scale - 24;
      width = 1840 - x;
    } else {
      // Dock icons keep a fixed lens; the separate caption cannot overlap its neighbours.
      x = (r.left - sr.left) / scale; width = r.width / scale;
    }
    key = button.getAttribute('data-action') + '|' + x + '|' + y + '|' + width;
    if (key !== utPlateKey) {
      utPlates[utPlateIndex].className = 'ph-plate ut-lens is-outgoing';
      utPlateIndex = 1 - utPlateIndex; el = utPlates[utPlateIndex];
      el.className = 'ph-plate ut-lens is-preparing';
      el.style.width = width + 'px'; el.style.left = x + 'px'; el.style.top = y + 'px'; // Position stays out of transform: the spring scale must not scale it.
      el.offsetWidth;
      utPlateKey = key;
    }
    utPlates[utPlateIndex].className = 'ph-plate ut-lens is-current on-focus';
  }
  function renderAppFocusName(hs) {
    var it = hs.items[hs.i], width, x, y, plateEl;
    if (S.c.apps !== 'icons' || hs.zone !== 'apps' || !it) { appFocusName.className = 'app-focus-name'; return; }
    appFocusName.textContent = app(it.id).name;
    width = Math.min(S.c.layout === 'list' ? 1056 : 1640, Math.ceil(textWidth(app(it.id).name, S.c.layout === 'list' ? 40 : 36, 500, -.6) + 8));
    appFocusName.style.width = width + 'px';
    if (S.c.layout === 'list') {
      x = PH_LEFT + 168; plateEl = phPlates[photoPlateIndex];
      y = parseFloat(plateEl.style.top) + parseFloat(plateEl.style.height) / 2 - 24;
    } else {
      x = clamp(dockAnchorCenter - width / 2, 140, 1780 - width); y = DOCK_BOTTOM + 24;
    }
    appFocusName.style.left = x + 'px'; appFocusName.style.top = y + 'px';
    appFocusName.className = 'app-focus-name is-on';
  }

  function dockGeom(n) {
    var m = DOCK_MODES[S.c.apps], vis = Math.max(1, Math.min(5, n)), shelfW = vis * m.pitch - 8, w = shelfW + 32;
    var broad = n > 5;
    if (n < 0) { w = 912; shelfW = 880; }
    else if (broad) { w = 1728; shelfW = 1696; }
    return { x: Math.round((1920 - w) / 2), y: DOCK_BOTTOM - m.th - 32, h: m.th + 32, w: w, shelf: shelfW, vis: vis, broad: broad, empty: n < 0, tw: m.tw, th: m.th, pitch: m.pitch };
  }
  /* Five centred: the window moves one tile when focus passes an edge. Broad: keep a
     148px glimpse of the neighbour, as the current dock does. */
  function dockOffset(n, i, g) {
    var off, left, first, glimpse = g.tw / 2;
    if (g.broad) {
      off = scroll.off * g.pitch; left = i * g.pitch;
      if (left - off < (i > 0 ? glimpse : 0)) off = left - (i > 0 ? glimpse : 0);
      if (left + g.tw - off > g.shelf - (i < n - 1 ? glimpse : 0)) off = left + g.tw - g.shelf + (i < n - 1 ? glimpse : 0);
      off = clamp(off, 0, Math.max(0, n * g.pitch - 8 - g.shelf));
      if (!S.reflow) { scroll.off = off / g.pitch; scroll.first = Math.round(scroll.off); }
      return off;
    }
    first = clamp(scroll.first, 0, Math.max(0, n - g.vis));
    if (i < first) first = i;
    if (i > first + g.vis - 1) first = i - g.vis + 1;
    if (!S.reflow) { scroll.first = first; scroll.off = first; }
    return first * g.pitch;
  }
  function dockTileHtml(id) {
    var a = app(id), body = S.c.apps === 'text' ? '' : appMark(a, S.c.apps === 'icons' ? 136 : 120, S.c.apps === 'icons' ? 88 : 72, S.c.apps === 'icons' ? 72 : 58);
    return body + (S.c.apps === 'icons' ? '' : '<span class="label" style="font-size:' + dockLabelSize(a.id) + 'px;top:' + (S.c.apps === 'text' ? 28 : 128) + 'px"><span class="label-ink">' + esc(a.name) + '</span></span>');
  }
  /* A wide label can reach the shelf before its icon. Check the rendered icon box,
     including during the track's 180ms transition, so both disappear together. */
  var lastDockEdges = '';
  function syncDockEdges() {
    var broad = S.c.layout === 'dock', clip = shelf.getBoundingClientRect(), changes = [];
    Array.prototype.forEach.call(track.querySelectorAll('.tile'), function (tile) {
      var content = tile.querySelector(S.c.apps === 'text' ? '.label-ink' : '.mark'), r = content ? content.getBoundingClientRect() : null;
      var outside = broad && r && (r.right <= clip.left || r.left >= clip.right);
      var cls = tile.className.replace(/\s+is-outside-icon/g, '') + (outside ? ' is-outside-icon' : '');
      if (tile.className !== cls) changes.push({ tile: tile, cls: cls });
    });
    changes.forEach(function (change) { change.tile.className = change.cls; });
  }
  function trackDockEdges() {
    dockEdgeFrame = 0;
    if (S.c.layout !== 'dock') return;
    syncDockEdges();
    if (Date.now() < dockEdgeUntil) dockEdgeFrame = window.requestAnimationFrame(trackDockEdges);
  }

  function renderDock(hs) {
    var items = hs.items, n = items.length, empty = !n, g = dockGeom(empty ? -1 : n);
    var anchor = clamp(hs.i, 0, Math.max(0, n - 1)), off = empty ? 0 : dockOffset(n, anchor, g);
    var tileFocus = hs.zone === 'apps', tileSel = hs.zone === 'util' || hs.zone === 'preview';
    // Edge tiles are re-measured only when the shelf actually moves or changes, not on every key.
    var edgeSig = off + '|' + n + '|' + g.pitch + '|' + g.shelf + '|' + S.c.apps + '|' + items.map(function (it) { return it.id; }).join(','), moved = edgeSig !== lastDockEdges;
    lastDockEdges = edgeSig;

    dock.className = 'dock' + (empty ? ' is-empty' : '');
    dock.style.left = g.x + 'px'; dock.style.top = g.y + 'px'; dock.style.width = g.w + 'px'; dock.style.height = g.h + 'px';
    dock.style.setProperty('--tile-w', g.tw + 'px'); dock.style.setProperty('--tile-h', g.th + 'px'); dock.style.setProperty('--dock-h', g.h + 'px');
    dockAnchorCenter = g.x + 16 + anchor * g.pitch - off + g.tw / 2;
    IMG.mat.style.left = (-g.x) + 'px'; IMG.mat.style.top = (-g.y) + 'px';
    IMG.mat.style.transformOrigin = '960px ' + (g.y + g.h / 2) + 'px';
    shelf.style.width = g.shelf + 'px';
    shelf.className = 'shelf' + (g.broad && off > 0 ? ' fade-l' : '') + (g.broad && off + g.shelf < n * g.pitch - 8 ? ' fade-r' : '');

    keyed(track, items, function (el, it, i) {
      var a = app(it.id), left = i * g.pitch, focus = tileFocus && i === anchor, sel = tileSel && i === anchor;
      var partial = g.broad && (left - off < -1 || left + g.tw - off > g.shelf + 1);
      setContent(el, it.id + '|' + dockLabelSize(it.id) + '|' + S.c.apps, function () { return '<span class="tile-content">' + dockTileHtml(it.id) + '</span>'; });
      el.className = 'tile' + (focus ? ' is-focus' : '') + (sel ? ' is-sel' : '') + (partial ? ' is-partial' : '') + (S.press === it.id ? ' is-press' : '') + (!moved && el.className.indexOf('is-outside-icon') >= 0 ? ' is-outside-icon' : '');
      el.style.transform = 'translate3d(' + left + 'px,0,0)';
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', a.name);
      attrs(el, 'app', i, 'home.app.' + it.id);
    });
    track.style.transform = 'translate3d(' + (-off) + 'px,0,0)';
    if (moved) syncDockEdges();
    if (moved && g.broad) {
      dockEdgeUntil = Date.now() + 220;
      if (!dockEdgeFrame) dockEdgeFrame = window.requestAnimationFrame(trackDockEdges);
    }
    plate.className = 'plate' + (empty || hs.zone === null ? '' : tileFocus ? ' on-focus' : tileSel ? ' on-sel' : '');
    plate.style.transform = 'translate3d(' + (anchor * g.pitch) + 'px,0,0)';

    cueL.style.left = (g.x - 72) + 'px'; cueR.style.left = (g.x + g.w + 24) + 'px';
    cueL.style.top = cueR.style.top = (g.y + g.h / 2 - 24) + 'px';
    cueL.className = 'cue' + (!g.broad && !empty && scroll.first > 0 ? ' is-on' : '');
    cueR.className = 'cue' + (!g.broad && !empty && scroll.first + g.vis < n ? ' is-on' : '');
    setHTML(dockEmpty, empty ? emptyHtml(hs) : '');
  }
  function emptyHtml(hs) {
    return '<p>No apps on Home</p><button type="button" tabindex="-1" class="btn' + (hs.zone === 'empty' ? ' is-focus' : '') + '" data-z="empty" data-i="0" data-action="home.add-apps">' + icon('plus') + '<span>Add apps</span></button>';
  }

  /* Each plate crossfades in place; never animate plate width or position.
     Only its transform scale springs (94% to 100% from its own edge); left/top place it. */
  function renderPhotoPlate(id, width, y, state) {
    var key = id + '|' + width + '|' + y, plateEl;
    if (key !== photoPlateKey) {
      phPlates[photoPlateIndex].className = phPlates[photoPlateIndex].className.replace(' is-current', '') + ' is-outgoing';
      photoPlateIndex = 1 - photoPlateIndex;
      plateEl = phPlates[photoPlateIndex];
      plateEl.className = 'ph-plate is-preparing';
      plateEl.style.width = width + 'px'; plateEl.style.height = PH_PLATE_H + 'px';
      plateEl.style.top = y + 'px';
      plateEl.offsetWidth; // Establish zero opacity before the incoming crossfade.
      photoPlateKey = key;
    }
    phPlates[photoPlateIndex].className = 'ph-plate is-current' + (state ? ' ' + state : '');
  }
  function renderList(hs) {
    var items = hs.items, n = items.length, anchor = clamp(hs.i, 0, Math.max(0, n - 1)), first, slot, plateState;
    var rowFocus = hs.zone === 'apps', remembered = hs.zone === 'util' || hs.zone === 'preview';
    first = clamp(scroll.photo, anchor - (PH_FULL - 2), anchor - 1);
    first = clamp(first, 0, Math.max(0, n - PH_FULL));
    scroll.photo = first; slot = anchor - first;
    phList.style.height = PH_HEIGHT + 'px';
    phRows.style.top = (PH_TOP - PH_LIST_TOP) + 'px';
    keyed(phRows, items, function (row, it, i) {
      var typography = photoLabel(it.id), focus = rowFocus && i === anchor, markImage;
      setContent(row, it.id + '|' + typography.size + '|' + S.c.apps, function () {
        var body = '';
        if (S.c.apps !== 'text') body += appMark(app(it.id), S.c.apps === 'icons' ? 88 : 84, S.c.apps === 'icons' ? 88 : 64, S.c.apps === 'icons' ? 72 : 54);
        if (S.c.apps !== 'icons') body += '<span class="ph-name" style="font-size:' + typography.size + 'px;top:' + typography.top + 'px">' + esc(app(it.id).name) + '</span>';
        return '<span class="ph-group">' + body + '</span>';
      });
      markImage = row.querySelector('.mark img');
      if (markImage) {
        markImage.onerror = function () { this.style.visibility = 'hidden'; };
        if (markImage.complete && !markImage.naturalWidth) markImage.style.visibility = 'hidden';
      }
      row.className = 'ph-row' + (focus ? ' is-focus' : '') + (remembered && i === anchor ? ' is-sel' : '') + (hs.zone === 'preview' && i === anchor ? ' is-preview' : '') + (S.press === it.id ? ' is-press' : '');
      row.style.width = '1200px'; row.style.height = PH_PITCH + 'px';
      row.style.transform = 'translate3d(0,' + (i * PH_PITCH) + 'px,0)';
      row.setAttribute('role', 'button'); row.setAttribute('aria-label', app(it.id).name);
      attrs(row, 'app', i, 'home.app.' + it.id);
    });
    phRows.style.transform = 'translate3d(0,' + (-first * PH_PITCH) + 'px,0)';
    // One focus at a time: no plate while Home controls have focus. The Settings preview keeps a
    // half plate so the Focus choice is visible.
    plateState = !n || hs.zone === null ? '' : S.c.focus === 'glass' && rowFocus ? 'on-focus' : S.c.focus === 'glass' && hs.zone === 'preview' ? 'on-sel' : '';
    renderPhotoPlate(items[anchor] ? items[anchor].id : '', items[anchor] ? listPlateWidth(items[anchor].id) : 360, PH_TOP + slot * PH_PITCH + (PH_PITCH - PH_PLATE_H) / 2, plateState);
    phEmpty.className = 'ph-empty' + (!n ? ' is-on' : '');
    setHTML(phEmpty, !n ? emptyHtml(hs) : '');
  }

  /* Sheets: a frame is built once per view/mode; fill() updates its slots. Persistent
     scrollers let transforms animate. */
  function renderSheet(t, sheet) {
    var key;
    sheetEl.hidden = !(sheet || isSettingsDetail(t));
    sheetView.hidden = !sheet;
    if (sheet) sheetView.setAttribute('aria-modal', 'true');
    else sheetView.removeAttribute('aria-modal');
    sceneEl.setAttribute('aria-hidden', sheet || isSettingsDetail(t) ? 'true' : 'false');
    if (!sheet) { sheetView.innerHTML = ''; sheetKey = ''; return; }
    key = t.id + '|' + (t.mode || '') + '|' + (t.msg || '');
    if (key !== sheetKey) {
      sheetView.innerHTML = FRAMES[t.id](t); sheetView.className = 'view';
      sheetKey = key; slotEls = {};
      Array.prototype.forEach.call(sheetView.querySelectorAll('[data-slot]'), function (el) { slotEls[el.getAttribute('data-slot')] = el; });
    }
    FILLS[t.id](t, slotEls);
  }
  function renderAppearance(t) {
    appearanceEl.hidden = !isSettingsDetail(t);
    if (appearanceEl.hidden) { appearanceEl.removeAttribute('aria-modal'); return; }
    appearanceEl.setAttribute('aria-modal', 'true');
    V.appearance.norm(t);
    appearanceEl.className = 'appearance detail-' + t.group;
    appearanceRows.className = 'appearance-rows';
    appearanceTitle.textContent = DETAIL_NAMES[t.group];
    var error = S.lookError, status = '';
    function command(item, inner, cls) {
      var applied = item.axis && S.c[item.axis] === item.value;
      var loading = !!(item.axis && S.pending && !S.pending.background && S.pending.target[item.axis] === item.value && S.pending.row === item.axis);
      return '<button type="button" tabindex="-1" class="setting-choice' + (cls ? ' ' + cls : '') + (t.f.action === item.action ? ' is-focus' : '') + (applied ? ' is-applied' : '') + (loading ? ' is-loading' : '') + '"'
        + (item.axis ? ' role="radio" aria-checked="' + !!applied + '"' : '') + ' aria-label="' + esc(item.axis && item.value === 'both' ? 'Icons and text' : item.label) + '" aria-busy="' + loading + '"'
        + ' data-z="detail" data-i="0" data-id="' + item.action + '" data-action="' + item.action + '">' + inner
        + (item.axis ? '<span class="setting-tick" aria-hidden="true">' + (applied ? icon('check') : '') + '</span>' : '') + '</button>';
    }
    setHTML(appearanceBack, command({ action: 'settings.back', label: 'Settings' }, icon('left') + '<span>Settings</span>', 'setting-back'));
    setHTML(appearanceRows, detailSections().map(function (section) {
      return '<section class="setting-section is-horizontal section-' + section.id + '">'
        + '<h3 class="setting-label" id="setting-' + section.id + '">' + section.title + '</h3>'
        + '<div class="setting-options" role="radiogroup" aria-label="' + esc(section.title) + '">'
        + section.items.map(function (item) {
          return command(item, '<span class="setting-copy"><span class="setting-name">' + esc(item.label) + '</span></span>', '');
        }).join('') + '</div></section>';
    }).join(''));
    if (S.pending && !S.pending.background) status = '<p>Loading your choice…</p><p>Back cancels this change.</p>';
    else if (error) {
      status = '<p class="setting-error">' + (error.type === 'save' ? 'Couldn’t save this change.' : 'Couldn’t load this appearance.') + ' Your current choice is kept.</p>'
        + command({ action: 'settings.retry', label: 'Try again' }, '<span>Try again</span>', 'setting-retry');
    }
    setHTML(appearanceStatus, status);
  }
  /* Keep the retry or membership state on the focused control. The stage-level line
     shares its position without changing the control's identity or key behaviour. */
  function renderFocusStatus(t) {
    if (isSettingsDetail(t)) { focusStatus.className = 'focus-status'; return; }
    var root, active, target = null, text = S.err ? 'Not saved. OK tries again.' : '', i, r, sr, scale, x, y, w, solid, photoFree;
    Array.prototype.forEach.call(stage.querySelectorAll('.has-local-status'), function (el) { el.className = el.className.replace(/\s+has-local-status/g, ''); });
    // No message: skip the focus query and layout reads entirely (the common case on every key).
    if (!text) { focusStatus.className = 'focus-status'; return; }
    root = sheetEl.hidden ? homeEl : sheetEl; active = root.querySelectorAll('.is-focus[data-action]');
    for (i = 0; i < active.length; i++) if (renderedAction(active[i])) { target = active[i]; break; }
    if (!target || !text) { focusStatus.className = 'focus-status'; return; }
    if (target.parentNode === utilsEl && utilsEl.className.indexOf('is-icons') >= 0) { renderUtilFocusLabel(target); focusStatus.className = 'focus-status'; return; }
    photoFree = S.c.layout === 'list' && target.className.indexOf('ph-row') >= 0;
    target.className += ' has-local-status';
    r = target.getBoundingClientRect(); sr = stage.getBoundingClientRect(); scale = sr.width / 1920 || 1;
    x = (r.left - sr.left) / scale; y = (r.top - sr.top) / scale; w = r.width / scale;
    if (photoFree) { x = PH_LEFT + parseFloat(phPlates[photoPlateIndex].style.width) + 24; y += (r.height / scale - 28) / 2; w = 400; }
    else y += target.getAttribute('data-action').indexOf('home.app.') === 0 ? 171 : 40;
    solid = /(?:^|\s)(?:u|btn|er-rm)(?:\s|$)/.test(target.className) && target.parentNode !== utilsEl && target.parentNode.className.indexOf('s-head') < 0;
    focusStatus.className = 'focus-status is-on' + (solid ? ' dark-ink' : '') + (photoFree ? ' photo-status' : '');
    focusStatus.textContent = text;
    focusStatus.style.left = clamp(x + 8, 112, 1808 - Math.min(w - 16, 800)) + 'px';
    focusStatus.style.top = clamp(y, 72, 988) + 'px';
    focusStatus.style.width = Math.min(w - 16, 800) + 'px';
  }
  function headButtons(list, fi, prefix) {
    return list.map(function (b, i) {
      return '<button type="button" tabindex="-1" class="btn' + (i === fi ? ' is-focus' : '') + (b[2] ? ' ' + b[2] : '') + '" data-z="head" data-i="' + i + '" data-action="' + prefix + '.' + b[0] + '" aria-label="' + esc(b[0] === 'undo' ? undoCaption() : b[1]) + '">' + (b[3] ? icon(b[3]) : '') + '<span>' + b[1] + '</span></button>';
    }).join('');
  }
  var FRAMES = {
    apps: function () {
      return '<h2 class="s-title" data-slot="title"></h2><p class="s-sub" data-slot="sub"></p><div class="s-head" data-slot="head"></div>'
        + '<div class="grid-view" data-slot="view"><div class="grid-in" data-slot="grid"></div></div>'
        + '<div class="row-cue grid-before" data-slot="before" aria-hidden="true">' + icon('up') + '</div><div class="row-cue grid-after" data-slot="after" aria-hidden="true">' + icon('down') + '</div>';
    },
    editor: function () {
      return '<h2 class="s-title">Apps on Home</h2><p class="s-sub" data-slot="sub"></p><div class="s-head" data-slot="head"></div>'
        + '<p class="s-label z-home" data-slot="lh"></p><p class="s-label z-other">Not on Home</p>'
        + '<div class="ed-home" data-slot="home"></div><div class="ed-order-break" data-slot="break">Then scroll</div><div class="ed-other-view" data-slot="ov"><div class="ed-other" data-slot="other"></div></div><div class="ed-origin" data-slot="origin"></div>'
        + '<div class="row-cue editor-before" data-slot="otherBefore" aria-hidden="true">' + icon('up') + '</div><div class="row-cue editor-after" data-slot="otherAfter" aria-hidden="true">' + icon('down') + '</div>';
    },
    settings: function () { return '<h2 class="s-title">Settings</h2><div class="settings-overview" data-slot="list"></div>'; },
    cameras: function () {
      return '<h2 class="s-title">Cameras</h2><div class="cams" data-slot="grid">' + CONTROLS.cameras.map(function (cam, i) {
        return '<button type="button" tabindex="-1" class="cam" data-z="cam" data-i="' + i + '" data-action="cameras.' + esc(cam.src) + '"><img alt="" class="cam-still"><img alt="" class="cam-live"><span class="cam-name">' + esc(cam.name) + '</span></button>';
      }).join('') + '</div>';
    },
    message: function (t) {
      var m = messageContent(t);
      return '<h2 class="msg-title">' + esc(m.title) + '</h2><p class="msg-line">' + esc(m.line) + '</p><p class="msg-note">' + esc(m.note) + '</p><div class="msg-acts" data-slot="acts"></div>';
    }
  };
  function gridTileHtml(id) {
    var a = app(id), state = onHome(id) ? BADGE + '<span>On Home</span>' : '';
    return '<span class="panel-content">' + appMark(a, 120, 72, 58) + '<span class="label">' + esc(a.name) + '</span></span><span class="state">' + state + '</span>';
  }
  var FILLS = {
    apps: function (t, el) {
      var f = t.f, items = appsItems(), n = items.length, rows = Math.ceil(n / COLS), vis = 3, row = Math.floor(f.i / COLS);
      setHTML(el.title, 'All apps');
      setHTML(el.sub, esc(catalog.loading ? 'Loading installed apps…' : catalog.error || (!n ? 'No installed apps found.' : '')));
      setHTML(el.head, headButtons(appsHead(), f.zone === 'head' ? 0 : -1, 'apps'));
      el.head.className = 's-head' + (f.zone === 'head' ? ' is-awake' : '');
      if (f.zone === 'grid') { if (row < t.top) t.top = row; if (row > t.top + vis - 1) t.top = row - vis + 1; }
      t.top = clamp(t.top, 0, Math.max(0, rows - vis));
      keyed(el.grid, items.map(function (id) { return { key: id, id: id }; }), function (tile, it, i) {
        var focus = f.zone === 'grid' && i === f.i;
        setContent(tile, [it.id, app(it.id).name, onHome(it.id)].join('|'), function () { return gridTileHtml(it.id); });
        tile.className = 'gt' + (focus ? ' is-focus' : '');
        tile.style.transform = 'translate3d(' + ((i % COLS) * GRID_COL) + 'px,' + (Math.floor(i / COLS) * GRID_ROW) + 'px,0)';
        tile.setAttribute('role', 'button'); tile.setAttribute('aria-label', app(it.id).name);
        attrs(tile, 'grid', i, 'apps.open.' + it.id);
      });
      el.grid.style.transform = 'translate3d(0,' + (-t.top * GRID_ROW) + 'px,0)';
      el.view.className = 'grid-view' + (t.top > 0 ? ' more-before' : '') + (rows - t.top > vis ? ' more-after' : '');
      el.before.className = 'row-cue grid-before' + (t.top > 0 ? ' is-on' : '');
      el.after.className = 'row-cue grid-after' + (rows - t.top > vis ? ' is-on' : '');
    },
    editor: function (t, el) {
      var f = t.f, H = t.lifted ? t.lifted.order : S.c.home, O = otherGroups(), list = O.recent.concat(O.rest), full = S.c.home.length >= CAP;
      var entries = [], ys = [], y = 0, yf, minTop, maxTop = 0, rowEnd, before = false, afterRows = false;
      var hint = catalog.error ? catalog.error : catalog.loading ? 'Loading installed apps…' : f.zone === 'head' && f.h === 0 ? undoCaption() : f.zone === 'home' && f.part === 'remove' ? (H.length <= 1 ? LAST : app(H[f.i]).name + ' stays installed.') : '';
      setHTML(el.sub, editStatus(hint, t.lifted ? 'Moving ' + app(t.lifted.id).name + '. OK places it, Back puts it back.' : ''));
      setHTML(el.head, headButtons([['undo', 'Undo', S.undo.length ? '' : 'is-idle', 'undo'], ['done', 'Done', '', 'check']], f.zone === 'head' ? f.h : -1, 'editor'));
      el.head.className = 's-head' + (f.zone === 'head' ? ' is-awake' : '');
      setHTML(el.lh, 'On Home <span class="s-count">' + S.c.home.length + ' of ' + CAP + '</span>');
      // The Home column scrolls like the other column once it is taller than the view.
      t.homeTop = t.homeTop || 0;
      if (f.zone === 'home') {
        if (editorHomeY(f.i) < t.homeTop) t.homeTop = editorHomeY(f.i);
        if (editorHomeY(f.i) + 72 > t.homeTop + ED_VIEW) t.homeTop = editorHomeY(f.i) + 72 - ED_VIEW;
      }
      t.homeTop = clamp(t.homeTop, 0, Math.max(0, editorHomeY(H.length - 1) + 72 - ED_VIEW));
      el['break'].className = 'ed-order-break' + (H.length > editorCut() && editorHomeY(editorCut()) - 24 >= t.homeTop && editorHomeY(editorCut()) <= t.homeTop + ED_VIEW ? ' is-on' : '');
      el['break'].style.top = (264 + editorCut() * ED_ROW - t.homeTop) + 'px';

      keyed(el.home, H.map(function (id) { return { key: id, id: id }; }), function (row, it, i) {
        var a = app(it.id), here = f.zone === 'home' && i === f.i, lifted = !!t.lifted && i === f.i;
        setContent(row, it.id, function () { return '<div class="er-name" role="button"><span class="panel-content"><span class="er-num"></span>' + smallMark(a) + '<span class="er-text">' + esc(a.name) + '</span><span class="er-move">' + icon('updown') + '</span></span></div><div class="er-rm" role="button"><span></span></div>'; });
        row.className = 'er' + (here ? ' is-active' : '') + (lifted ? ' is-lifted' : '');
        row.style.transform = 'translate3d(' + (lifted ? 16 : 0) + 'px,' + (editorHomeY(i) - t.homeTop) + 'px,0)';
        row.style.visibility = editorHomeY(i) >= t.homeTop && editorHomeY(i) + 72 <= t.homeTop + ED_VIEW ? 'visible' : 'hidden';
        row.querySelector('.er-num').textContent = String(i + 1);
        row.firstChild.className = 'er-name' + (here && (f.part === 'name' || lifted) ? ' is-focus' : '');
        row.lastChild.className = 'er-rm' + (here && f.part === 'remove' && !lifted ? ' is-focus' : '') + (H.length <= 1 ? ' is-limit' : '');
        row.lastChild.firstChild.textContent = H.length <= 1 ? LAST : 'Remove from Home';
        attrs(row.firstChild, 'name', i, 'editor.move.' + it.id);
        attrs(row.lastChild, 'remove', i, 'editor.remove.' + it.id);
      });
      // The lifted app's old place, shown only while that row is within the scrolled column.
      el.origin.className = 'ed-origin' + (t.lifted && t.lifted.from !== f.i && editorHomeY(t.lifted.from) >= t.homeTop && editorHomeY(t.lifted.from) + 72 <= t.homeTop + ED_VIEW ? ' is-on' : '');
      if (t.lifted) el.origin.style.transform = 'translate3d(0,' + (264 + editorHomeY(t.lifted.from) - t.homeTop + 16) + 'px,0)';

      if (O.recent.length) { entries.push({ key: 'sep-recent', sep: 'Recently removed', y: y }); y += ED_SEP; }
      O.recent.forEach(function (id) { entries.push({ key: id, id: id, y: y }); ys.push(y); y += ED_ROW; });
      if (O.recent.length && O.rest.length) { entries.push({ key: 'sep-rest', sep: 'Other installed apps', y: y }); y += ED_SEP; }
      O.rest.forEach(function (id) { entries.push({ key: id, id: id, y: y }); ys.push(y); y += ED_ROW; });
      if (f.zone === 'other' && ys.length) {
        yf = ys[f.j] - (O.recent.length && (f.j === 0 || f.j === O.recent.length) ? ED_SEP : 0);
        if (yf < t.top) t.top = yf;
        if (ys[f.j] + 72 > t.top + ED_VIEW) {
          minTop = ys[f.j] + 72 - ED_VIEW;
          entries.some(function (it) { if (it.y < minTop) return false; t.top = it.y; return true; });
        }
      }
      entries.some(function (it) { if (it.y < Math.max(0, y - ED_VIEW)) return false; maxTop = it.y; return true; });
      t.top = clamp(t.top, 0, maxTop);
      keyed(el.other, entries, function (row, it) {
        var j, focus, a;
        row.style.transform = 'translate3d(0,' + it.y + 'px,0)';
        rowEnd = it.y + (it.sep ? ED_SEP : 72);
        row.style.visibility = it.y >= t.top && rowEnd <= t.top + ED_VIEW ? 'visible' : 'hidden';
        before = before || it.y < t.top; afterRows = afterRows || rowEnd > t.top + ED_VIEW;
        if (it.sep) { setContent(row, 'sep|' + it.sep, function () { return esc(it.sep); }); row.className = 'eo-sep'; return; }
        j = list.indexOf(it.id); focus = f.zone === 'other' && j === f.j; a = app(it.id);
        setContent(row, it.id, function () { return '<span class="panel-content">' + smallMark(a) + '<span class="eo-text">' + esc(a.name) + '</span><span class="eo-verb"></span></span>'; });
        setHTML(row.querySelector('.eo-verb'), focus ? '<span class="verb' + (full ? ' is-off' : '') + '">' + (full ? 'Home is full' : 'Add to Home') + '</span>' : '');
        row.className = 'eo' + (focus ? ' is-focus' : '');
        row.setAttribute('role', 'button');
        attrs(row, 'other', j, 'editor.add.' + it.id);
      });
      el.other.style.transform = 'translate3d(0,' + (-t.top) + 'px,0)';
      el.ov.className = 'ed-other-view';
      el.otherBefore.className = 'row-cue editor-before' + (before ? ' is-on' : '');
      el.otherAfter.className = 'row-cue editor-after' + (afterRows ? ' is-on' : '');
    },
    settings: function (t, el) {
      var html = '';
      settingsRows().forEach(function (r) {
        html += '<button type="button" tabindex="-1" class="settings-group' + (r.id === t.f.id ? ' is-focus' : '') + '" data-z="row" data-i="0" data-id="' + r.id + '" data-action="settings.' + (r.id === 'editor' ? 'editor' : 'group.' + r.id) + '"><span class="settings-group-copy"><span class="settings-group-name">' + esc(r.label) + '</span><span class="settings-group-value">' + esc(r.value) + '</span></span>' + (r.button ? '' : icon('right')) + '</button>';
      });
      setHTML(el.list, html);
    },
    cameras: function (t, el) { CAMERAS.fill(t, el.grid); },
    message: function (t, el) {
      setHTML(el.acts, messageContent(t).actions.map(function (a, i) {
        return '<button type="button" tabindex="-1" class="btn' + (i === t.f.b ? ' is-focus' : '') + '" data-z="act" data-i="' + i + '" data-action="message.' + a[0] + '"><span>' + a[1] + '</span></button>';
      }).join(''));
    }
  };

  /* ---------- Atomic appearance bundles ---------- */
  var artRecord = null, artRefreshAt = 0;
  var ART_NEUTRAL = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><path fill="#182026" d="M0 0h1920v1080H0z"/></svg>');
  var lookToken = 0, committedBundle = null, reflowToken = 0;
  function makeImg(cls, src) { var im = document.createElement('img'); im.className = cls; im.alt = ''; im.src = src; return im; }
  function whenReady(im, done) {
    var fin = false, timer = setTimeout(function () { finish(!!(im.complete && im.naturalWidth)); }, document.hidden ? 20000 : 8000);
    function finish(ok) { if (fin) return; fin = true; clearTimeout(timer); done(ok); }
    function ready() {
      // Hidden TV prelaunch may suspend decode even after a valid image loads.
      if (document.hidden || !im.decode) { finish(true); return; }
      im.decode().then(function () { finish(true); }, function () { finish(!!(im.complete && im.naturalWidth)); });
    }
    if (im.complete) { if (im.naturalWidth) ready(); else finish(false); }
    else { im.onload = ready; im.onerror = function () { finish(false); }; }
  }
  function swapImg(k, im) { var old = IMG[k]; if (old === im) return; im.style.cssText = old.style.cssText; if (old.id) im.id = old.id; old.parentNode.replaceChild(im, old); IMG[k] = im; }
  function bundleKey() { return 'art|' + (artRecord ? artRecord.revision : 'none'); }
  /* The Art photo, the dock mat and the sheet backdrop swap together once every copy is ready. */
  function loadBundle(token, done, startup) {
    window.FrameArt.load(function (cached) {
      if (token !== lookToken) return;
      if (!artRecord && cached) artRecord = cached;
      if (artRecord || startup) { build(artRecord ? artRecord.url : ART_NEUTRAL); return; }
      window.FrameArt.refresh(function (fresh) {
        if (token !== lookToken) return;
        if (!fresh) { done(null); return; }
        artRecord = fresh; build(fresh.url);
      });
    });
    function build(artURL) {
      var imgs = { photo: makeImg('photo', artURL), bg: makeImg('sheet-bg', artURL), mat: makeImg('mat-img', artURL) }, keys = Object.keys(imgs), left = keys.length, allOk = true;
      var key = bundleKey(), revision = artRecord ? artRecord.revision : null;
      keys.forEach(function (k) { whenReady(imgs[k], function (ok) {
        allOk = allOk && ok;
        if (--left || token !== lookToken) return;
        done(allOk ? { key: key, imgs: imgs, artRevision: revision, artURL: artURL } : null);
      }); });
    }
  }
  function installBundle(bundle, look) {
    if (bundle) {
      Object.keys(bundle.imgs).forEach(function (k) { swapImg(k, bundle.imgs[k]); });
      S.bundleKey = bundle.key;
    }
    S.shown = { source: look.source, bg: look.bg, artRevision: bundle ? bundle.artRevision : S.shown && S.shown.artRevision };
    if (bundle && bundle.artURL) window.FrameArt.retain(bundle.artURL);
    if (bundle) setTimeout(frostSheet, 0);
  }
  /* Sheets (Settings, Apps, Leave, ...) and the dock mat sit on a frosted copy of the Art
     photo so they feel like the same place. Made once per photo (and kept across launches),
     never on navigation:
     - frost: a 480x270 copy with a real Gaussian blur (canvas filter), so its upscale is smooth;
       where canvas filters are missing, a halving-then-doubling ladder approximates the blur.
     - preview: a small unblurred JPEG kept in localStorage so the next launch shows the photo
       at once instead of the stage colour while the 4K image decodes. */
  var frostFor = '', frostURL = '', PREVIEW_KEY = 'cleanframe.art.preview.v1', FROST_KEY = 'cleanframe.art.frost.v1';
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function frostSheet() {
    var im = IMG.photo, src = im && im.src, base, out, ctx, w, h, step, next;
    if (!src || !im.naturalWidth) { IMG.bg.className = 'sheet-bg'; IMG.mat.className = 'mat-img'; return; }
    var rev = S.shown && S.shown.artRevision || src, saved = null;
    if (rev !== frostFor && src.indexOf('data:') !== 0) {
      frostFor = rev; frostURL = '';
      // Same Art photo as last launch: reuse the stored frost; no 4K draw or encode on startup.
      try { saved = JSON.parse(localStorage.getItem(FROST_KEY)); } catch (e) { saved = null; }
      if (saved && saved.rev === rev && /^data:image\/jpeg;base64,/.test(saved.frost || '')) frostURL = saved.frost;
      else try {
        base = canvas(480, 270); base.getContext('2d').drawImage(im, 0, 0, 480, 270);
        try { localStorage.setItem(PREVIEW_KEY, base.toDataURL('image/jpeg', 0.72)); } catch (e) { /* Preview is optional. */ }
        out = canvas(480, 270); ctx = out.getContext('2d');
        if ('filter' in ctx) {
          // Overscan so the blur does not pull dark edges in from outside the photo.
          ctx.filter = 'blur(14px)'; ctx.drawImage(base, -36, -20, 552, 310); ctx.filter = 'none';
        } else {
          step = base; w = 480; h = 270;
          while (w > 60) { next = canvas(w / 2, h / 2); next.getContext('2d').drawImage(step, 0, 0, w / 2, h / 2); step = next; w /= 2; h /= 2; }
          while (w < 480) { next = canvas(w * 2, h * 2); next.getContext('2d').drawImage(step, 0, 0, w * 2, h * 2); step = next; w *= 2; h *= 2; }
          ctx.drawImage(step, 0, 0);
        }
        frostURL = out.toDataURL('image/jpeg', 0.9);
        try { localStorage.setItem(FROST_KEY, JSON.stringify({ rev: rev, frost: frostURL })); } catch (e) { /* Rebuilt next launch. */ }
      } catch (e) { frostURL = ''; } // A tainted or failed draw keeps the plain matte.
    }
    if (!frostURL) { IMG.bg.className = 'sheet-bg'; IMG.mat.className = 'mat-img'; return; }
    if (IMG.bg.getAttribute('src') !== frostURL) IMG.bg.src = frostURL;
    IMG.bg.className = 'sheet-bg is-frost';
    // The dock's mat is the same frost, so it reads as glass rather than a solid panel.
    if (IMG.mat.getAttribute('src') !== frostURL) IMG.mat.src = frostURL;
    IMG.mat.className = 'mat-img is-frost';
  }
  function cleanPatch(patch) {
    var out = {}, k;
    if (!patch || typeof patch !== 'object') throw new Error('look needs an appearance patch');
    for (k in patch) if (patch.hasOwnProperty(k)) {
      if (!LOOK_VALUES[k] || LOOK_VALUES[k].indexOf(patch[k]) < 0) throw new Error('Invalid appearance value: ' + k);
      out[k] = patch[k];
    }
    return out;
  }
  // A bridge read cut off (Back in Visual, hiding) is started again on reaching or showing Home.
  function cancelArt() {
    if (artRefreshing) { artRefreshing = false; artRefreshCancelled = true; }
    window.FrameArt.cancel();
  }
  function cancelLook() { cancelArt(); lookToken++; S.pending = null; S.lookError = null; }
  function setLook(patch, options) {
    var opts = options || {}, changes = cleanPatch(patch), target = lookOf(S.c), k, token, needs, changed, loadedBundle = null, imageDone, failed = false;
    for (k in changes) if (changes.hasOwnProperty(k)) target[k] = changes[k];
    changed = Object.keys(target).some(function (key) { return target[key] !== S.c[key]; });
    cancelLook(); S.err = null; token = lookToken;
    function finish(bundle) {
      var c = next(S.c.home.slice(), S.c.recent.slice()), reflow = target.apps !== S.c.apps || target.controls !== S.c.controls, frame;
      Object.keys(target).forEach(function (key) { c[key] = target[key]; });
      S.pending = null;
      if (!opts.transient && changed && !write(c, 'Appearance')) { S.lookError = { type: 'save', patch: changes, row: opts.row || S.appearanceFocus }; render(); return; }
      if (opts.transient) S.c = c;
      if (reflow) { S.reflow = true; frame = ++reflowToken; }
      installBundle(bundle, target);
      if (bundle) committedBundle = bundle;
      S.lookError = null;
      render();
      refreshWeather();
      if (opts.startup) refreshArt();
      if (reflow) window.requestAnimationFrame(function () { window.requestAnimationFrame(function () {
        if (frame !== reflowToken) return;
        S.reflow = false; stage.className = stage.className.replace(/\s+is-reflow/g, '');
      }); });
    }
    function complete() {
      if (!imageDone || failed || token !== lookToken) return;
      if (document.hidden) { finish(loadedBundle); return; }
      window.requestAnimationFrame(function () { if (!failed && token === lookToken) finish(loadedBundle); });
    }
    needs = S.bundleKey !== bundleKey();
    imageDone = !needs;
    if (!needs) { finish(null); return; }
    // A background photo refresh is not the user's choice: it never labels or blocks a Visual row.
    S.pending = { patch: changes, target: target, row: opts.row || S.appearanceFocus, background: !!(opts.transient && !opts.row) };
    if (needs) loadBundle(token, function (bundle) {
      if (!bundle) {
        if (token !== lookToken || failed) return;
        failed = true; S.pending = null;
        S.lookError = { type: 'load', patch: changes, row: opts.row || S.appearanceFocus };
        render(); return;
      }
      loadedBundle = bundle; imageDone = true; complete();
    }, opts.startup);
    render();
  }
  function restoreLook() {
    cancelLook();
    if (committedBundle && committedBundle.key === bundleKey()) installBundle(committedBundle, S.c);
    else if (S.bundleKey === bundleKey()) installBundle(null, S.c);
    else setLook({}, { transient: true });
  }

  var artInstallCancelled = false, artRefreshing = false, artRefreshCancelled = false;
  function refreshArt() {
    if (document.hidden || top().id !== 'home' || S.pending) return;
    // A known newer photo whose background install was cancelled (Back in Visual) is installed now.
    if (artInstallCancelled) { artInstallCancelled = false; setLook({}, { transient: true }); return; }
    if (artRefreshCancelled) { artRefreshCancelled = false; artRefreshAt = 0; }
    if (Date.now() - artRefreshAt < 5000) return;
    artRefreshAt = Date.now(); artRefreshing = true;
    var token = lookToken;
    window.FrameArt.refresh(function (fresh) {
      artRefreshing = false;
      if (!fresh || token !== lookToken || document.hidden) return;
      if (artRecord && artRecord.revision === fresh.revision) return;
      artRecord = fresh;
      // Read while a sheet is open: installed on the way back to Home (pop).
      if (top().id !== 'home' || S.pending) { artInstallCancelled = true; return; }
      setLook({}, { transient: true });
    });
  }

  /* ---------- Lifecycle and remote input ---------- */
  var clockTimer = 0;
  function updateClock() {
    clearTimeout(clockTimer);
    if (document.hidden) return;
    refreshWeather();
    if (top().id === 'home' || isSettingsDetail(top())) renderCaption(top(), homeState(top()));
    clockTimer = setTimeout(updateClock, 60000 - (Date.now() % 60000) + 30);
  }
  function focusStage() { try { stage.focus({ preventScroll: true }); } catch (e) { stage.focus(); } }
  function after() { norm(); render(); }
  function goScene(name) {
    FrameDevice.cancelSource();
    if (top().id === 'cameras') CAMERAS.stop();
    S.stack = [S.stack[0]]; S.stack[0].f.zone = 'apps'; clearSession(); restoreLook();
    if (name === 'apps') openApps();
    else if (name === 'settings') openSettings();
    else if (name === 'appearance') { openSettings(); top().f.id = 'layout'; S.settingsFocus = 'layout'; openAppearance('layout'); }
    else if (name === 'editor') { openSettings(); openEditor(); }
    after();
  }
  function fit() {
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'scale(' + scale + ')';
    stage.style.left = ((window.innerWidth - 1920 * scale) / 2) + 'px';
    stage.style.top = ((window.innerHeight - 1080 * scale) / 2) + 'px';
  }
  function renderedAction(el) {
    return el.getClientRects().length > 0 && window.getComputedStyle(el).visibility !== 'hidden';
  }
  function focusedAction() {
    var root = isSettingsDetail(top()) ? appearanceEl : sheetEl.hidden ? homeEl : sheetEl, els = root.querySelectorAll('.is-focus[data-action]'), i;
    for (i = 0; i < els.length; i++) if (renderedAction(els[i])) return els[i].getAttribute('data-action');
    return null;
  }
  function activate(action) {
    var root = isSettingsDetail(top()) ? appearanceEl : sheetEl.hidden ? homeEl : sheetEl, els = root.querySelectorAll('[data-action]'), i;
    for (i = 0; i < els.length; i++) if (renderedAction(els[i]) && els[i].getAttribute('data-action') === action) { pointAt(els[i]); return true; }
    return false;
  }
  function pointAt(el) {
    var t = top(), v = V[t.id];
    norm();
    if (v.point) v.point(t, el.getAttribute('data-z'), +el.getAttribute('data-i'), el.getAttribute('data-id'));
    norm();
    render();
  }

  utilsEl.addEventListener('mouseover', function (ev) {
    var b = ev.target, t = top(), z, i;
    if (t.id !== 'home') return;
    while (b && b !== utilsEl && !(b.getAttribute && b.getAttribute('data-z'))) b = b.parentNode;
    if (!b || b === utilsEl || (ev.relatedTarget && b.contains(ev.relatedTarget))) return;
    z = b.getAttribute('data-z'); i = Number(b.getAttribute('data-i'));
    if (z !== 'util' || t.f.zone === z && t.f.u === i) return;
    t.f.zone = z; t.f.u = i; S.lastUtil = i;
    render();
  });
  stage.addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== stage && !(el.getAttribute && el.getAttribute('data-z'))) el = el.parentNode;
    focusStage();
    if (!el || el === stage) return;
    pointAt(el);
  });
  var heldKeys = {};
  document.addEventListener('keydown', function (ev) {
    var code = ev.keyCode, k = KEYS[code];
    if (code === 9) { ev.preventDefault(); return; }
    if (!k || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    ev.preventDefault();
    // A held OK or Back acts once. Each repeat renews the mark, so a lost keyup frees the key
    // 1 s after its last event instead of blocking it until the app loses focus.
    if (k === 'ok' || k === 'back') { var last = heldKeys[code]; heldKeys[code] = Date.now(); if (ev.repeat || (last && Date.now() - last < 1000)) return; }
    else { holdArrow(code, k); if (ev.repeat || heldKeys[code]) return; heldKeys[code] = true; rapidMove(); } // KEYS maps only arrows besides OK/Back.
    press(k);
  });
  /* A held arrow repeats sooner and steadier than the TV's own auto-repeat:
     first repeat after HOLD_DELAY, then every HOLD_RATE. The TV's repeat events
     only prove the key is still down; if they stop (a lost keyup), so does this.
     One arrow repeats at a time: pressing another takes over until the TV repeats the first again. */
  var HOLD_DELAY = 280, HOLD_RATE = 110, HOLD_SILENCE = 1200, hold = null;
  function holdArrow(code, k) {
    var now = Date.now();
    if (hold && hold.code === code) { hold.seen = now; return; }
    stopHold();
    hold = { code: code, key: k, seen: now, timer: null };
    hold.timer = setTimeout(function step() {
      if (!hold || Date.now() - hold.seen > HOLD_SILENCE) { stopHold(); return; }
      rapidMove(); press(hold.key);
      if (hold) hold.timer = setTimeout(step, HOLD_RATE);
    }, HOLD_DELAY);
  }
  function stopHold() { if (hold) { clearTimeout(hold.timer); delete heldKeys[hold.code]; } hold = null; }
  /* Held or fast arrow presses skip the focus spring so the pill keeps up, then
     the spring returns once movement pauses. Class only: no layout or re-render. */
  var lastMoveAt = 0, rapidTimer = null;
  function rapidMove() {
    var now = Date.now();
    S.rapid = now - lastMoveAt < 360; lastMoveAt = now; clearTimeout(rapidTimer);
    if (S.rapid) rapidTimer = setTimeout(function () { S.rapid = false; stage.className = stage.className.replace(' is-rapid', ''); }, 380);
  }

  document.addEventListener('keyup', function (ev) { delete heldKeys[ev.keyCode]; if (hold && hold.code === ev.keyCode) stopHold(); });
  window.addEventListener('blur', function () { heldKeys = {}; stopHold(); });
  window.addEventListener('focus', function () { FrameDevice.cancelSource(); release(); focusStage(); after(); updateClock(); refreshArt(); });
  document.addEventListener('visibilitychange', function () {
    heldKeys = {}; stopHold();
    if (document.hidden) {
      if (S.pending) cancelLook();
      else cancelArt();
      FrameDevice.cancelSource(); syncHomeSources(); clearTimeout(clockTimer);
      if (top().id === 'cameras') { CAMERAS.stop(); pop(); render(); } }
    else {
      release();
      if (!S.pending && (!committedBundle || S.bundleKey !== bundleKey())) setLook({}, { transient: true, startup: true });
      after(); updateClock(); focusStage(); refreshArt();
    }
  });
  window.addEventListener('resize', fit);

  /* Readable browser checks use the real state and actions, without fake outcomes. */
  var NAV = { left: 'left', right: 'right', up: 'up', down: 'down', ok: 'ok', enter: 'ok', back: 'back', escape: 'back' };
  QA.state = function () {
    var out = serialise(S.c), t = top(), item = t.id === 'appearance' ? detailLocation(t).item : null;
    out.art = window.FrameArt.status(); out.committed = S.c; out.shown = S.shown; out.pending = S.pending; out.view = t.id; out.selected = S.sel;
    out.focusAction = focusedAction(); out.writes = S.writes; out.failedWrites = S.failed; out.error = S.err;
    out.catalog = { loading: catalog.loading, loaded: catalog.loaded, error: catalog.error, ids: ALPHA.slice() };
    out.visibleHome = visibleHome(); out.inputPorts = homeSources.ports;
    out.settingsGroup = t.id === 'appearance' ? t.group : null;
    out.focusedChoice = item && item.axis ? { axis: item.axis, value: item.value, action: item.action } : null;
    out.candidate = out.focusedChoice ? { axis: item.axis, value: item.value, action: item.action, pending: !!S.pending } : null;
    out.undo = S.undo.map(function (u) { return u.label; }); out.storageOk = storageOk;
    return JSON.parse(JSON.stringify(out));
  };
  QA.where = function () {
    var action = focusedAction(), active = stage.querySelectorAll('.is-focus[data-action]'), count = 0, name = '';
    Array.prototype.forEach.call(active, function (el) { if (renderedAction(el)) { count++; if (el.getAttribute('data-action') === action) name = el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim(); } });
    return { view: top().id, settingsGroup: top().id === 'appearance' ? top().group : null, focus: name, focusAction: action, focusCount: count, zone: top().f.zone || null };
  };
  QA.ready = function () { return !S.pending && !!S.shown; };
  QA.nav = function () { var keys = arguments.length === 1 && Array.isArray(arguments[0]) ? arguments[0] : Array.prototype.slice.call(arguments); keys.forEach(function (key) { if (!NAV[key]) throw new Error('Unknown key'); press(NAV[key]); }); return QA.state(); };
  QA.look = function (patch) { setLook(patch, {}); return QA.state(); };
  QA.holding = function () { return !!hold; };
  QA.scene = function (name) { if (['home', 'apps', 'settings', 'appearance', 'editor'].indexOf(name) < 0) throw new Error('Unknown view'); goScene(name); return QA.state(); };
  QA.activate = function (action) { return activate(action) ? QA.state() : null; };
  QA.actions = function () { var view = isSettingsDetail(top()) ? appearanceEl : sheetEl.hidden ? homeEl : sheetEl; return Array.prototype.filter.call(view.querySelectorAll('[data-action]'), renderedAction).map(function (el) { return el.getAttribute('data-action'); }); };

  /* ---------- Start ---------- */
  cueL.innerHTML = icon('left'); cueR.innerHTML = icon('right');
  initialise();
  setLook({}, { transient: true, startup: true });
  norm(); render(); fit(); focusStage(); updateClock();
})();
