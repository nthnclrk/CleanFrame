/* Optional TV-local Art bridge. No credentials, polling, pixel reads or remote-key I/O. */
(function () {
  'use strict';
  var MAX = 12 * 1024 * 1024, PORT_KEY = 'cleanframe.art.port', META_KEY = 'cleanframe.art.cache.v1', LOOK_KEY = 'cleanframe.art.look.v1';
  // Owner-calibrated against Art Mode on a 2024 Frame (brightness 5) by matching
  // filmed side-by-sides. Colour temperature −5..+5 blends between the two ends.
  var COOL = { brightness: 0.41, contrast: 0.86, saturate: 0.50, tint: [246, 238, 222], gamma: [1, 1.02, 1.15] };
  var WARM = { brightness: 0.41, contrast: 0.86, saturate: 0.48, tint: [250, 212, 160], gamma: [1, 1.03, 1.19] };
  var look = null;
  var current = null, loaded = false, readers = [], loading = false, refreshing = false, epoch = 0, requests = [];
  var copyNo = 0, currentTemp = null;
  var urls = [], retainedURL = null, error = null, fsDir = null, db = null;
  function host() {
    var h, parts;
    try { h = localStorage.getItem('cleanframe.art.host') || '127.0.0.1'; } catch (e) { h = '127.0.0.1'; }
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return '127.0.0.1';
    parts = h.split('.').map(Number);
    if (parts.some(function (n) { return n > 255; })) return '127.0.0.1';
    return h === '127.0.0.1' || parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 ? h : '127.0.0.1';
  }
  function port() {
    var p;
    try { p = localStorage.getItem(PORT_KEY) || '8643'; } catch (e) { p = '8643'; }
    return /^[0-9]{4,5}$/.test(p) && Number(p) >= 1024 && Number(p) <= 65535 ? p : '8643';
  }
  function metadata(m) {
    return m && typeof m.revision === 'string' && typeof m.contentId === 'string' && /^[a-f0-9]{64}$/.test(m.revision) && /^MY_[A-Za-z0-9_]{1,64}$/.test(m.contentId) &&
      m.imageUrl === '/art/' + m.revision + '/image.jpg' && typeof m.width === 'number' && typeof m.height === 'number' &&
      m.width % 1 === 0 && m.height % 1 === 0 && m.width > 0 && m.height > 0 && m.width <= 16384 && m.height <= 16384 && m.width * m.height <= 64000000;
  }
  function validLook(l) {
    return !!l && typeof l.colorTemperature === 'number' && l.colorTemperature % 1 === 0 && l.colorTemperature >= -5 && l.colorTemperature <= 5 &&
      (l.brightness === undefined || typeof l.brightness === 'number' && l.brightness % 1 === 0 && l.brightness >= 0 && l.brightness <= 10);
  }
  function mix(a, b, t) { return a + (b - a) * t; }
  function round(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }
  // Art brightness 0..10, calibrated at 2, 5 and 10 (colour temperature +3) and
  // applied relative to the brightness-5 look. Dimming scales the multiply tint so
  // dark levels keep their colour balance; brightening raises the image itself.
  var LEVELS = [
    { at: 2, dim: 0.62, lift: 1, contrast: 0.97, saturate: 0.016, mul: [1, 0.98, 0.92] },
    { at: 5, dim: 1, lift: 1, contrast: 0.86, saturate: 0, mul: [1, 1, 1] },
    { at: 10, dim: 1, lift: 1.55, contrast: 0.78, saturate: -0.064, mul: [0.95, 1, 1] }
  ];
  function level(b) {
    var lo = b <= 5 ? LEVELS[0] : LEVELS[1], hi = b <= 5 ? LEVELS[1] : LEVELS[2], t = (b - lo.at) / (hi.at - lo.at);
    return { dim: Math.max(0.3, mix(lo.dim, hi.dim, t)), lift: mix(lo.lift, hi.lift, t), contrast: Math.min(1.1, mix(lo.contrast, hi.contrast, t)),
      saturate: mix(lo.saturate, hi.saturate, t), mul: [0, 1, 2].map(function (i) { return mix(lo.mul[i], hi.mul[i], t); }) };
  }
  function lookStyle(l) {
    var t = ((validLook(l) ? l.colorTemperature : 0) + 5) / 10, lv = level(validLook(l) && l.brightness !== undefined ? l.brightness : 5);
    var tint = [0, 1, 2].map(function (i) { return Math.max(0, Math.min(255, Math.round(mix(COOL.tint[i], WARM.tint[i], t) * lv.dim * lv.mul[i]))); });
    return { filter: 'brightness(' + round(mix(COOL.brightness, WARM.brightness, t) * lv.lift, 3) + ') contrast(' + round(lv.contrast, 3) + ') saturate(' + round(mix(COOL.saturate, WARM.saturate, t) + lv.saturate, 3) + ') url(#artCurve)',
      tint: 'rgb(' + tint.join(',') + ')', veil: 'rgb(' + tint.map(function (v) { return Math.round(v * 0.72); }).join(',') + ')', gamma: [0, 1, 2].map(function (i) { return round(mix(COOL.gamma[i], WARM.gamma[i], t), 3); }) };
  }
  // A static filter on the background image only: no per-frame work on remote movement.
  function applyLook(l) {
    if (typeof document.getElementById !== 'function' || !document.head) return;
    var st = lookStyle(l), el = document.getElementById('artLook'), funcs = ['artCurveR', 'artCurveG', 'artCurveB'];
    if (!el) { el = document.createElement('style'); el.id = 'artLook'; document.head.appendChild(el); }
    // The frosted sheet uses the same look, a touch darker for legible text.
    el.textContent = '.source-art #photo,.source-art #sheetBg,.source-art #matImg{filter:' + st.filter + '}.source-art #bg::after{content:"";position:absolute;left:0;top:0;right:0;bottom:0;background:' + st.tint + ';mix-blend-mode:multiply;pointer-events:none}' +
      '.source-art .sheet-veil{background:' + st.veil + ';mix-blend-mode:multiply}';
    funcs.forEach(function (id, i) { var f = document.getElementById(id); if (f) f.setAttribute('exponent', String(st.gamma[i])); });
  }
  function setLook(l) {
    if (!validLook(l)) return;
    var next = { colorTemperature: l.colorTemperature }, changed;
    if (l.brightness !== undefined) next.brightness = l.brightness;
    changed = JSON.stringify(next) !== JSON.stringify(look); look = next;
    if (!changed) return;
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(next)); } catch (e) { /* Memory-only. */ }
    applyLook(look);
  }
  // Show last session's small preview of the Art photo at once; the full image replaces it when decoded.
  (function () {
    var p = null, photo = typeof document.getElementById === 'function' && document.getElementById('photo');
    try { p = localStorage.getItem('cleanframe.art.preview.v1'); } catch (e) { p = null; }
    if (photo && p && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]{100,200000}$/.test(p) && !photo.getAttribute('src')) photo.src = p;
  }());
  try { look = JSON.parse(localStorage.getItem(LOOK_KEY)); } catch (e) { look = null; }
  if (!validLook(look)) look = null;
  applyLook(look);
  function record(m, url) { return { revision: m.revision, contentId: m.contentId, imageUrl: m.imageUrl, width: m.width, height: m.height, url: url }; }
  function objectURL(blob) {
    // Keep only the installed bundle, last-good cache and one candidate.
    urls = urls.filter(function (item) { if (item === retainedURL || current && item === current.url) return true; window.URL.revokeObjectURL(item); return false; });
    var url = window.URL.createObjectURL(blob); urls.push(url); return url;
  }
  function validImage(m, url, done) {
    var im = new Image(), finished = false, timer = setTimeout(function () { finish(false); }, 8000);
    function finish(ok) { if (finished) return; finished = true; clearTimeout(timer); im.onload = im.onerror = null; done(ok); }
    im.onload = function () { finish(im.naturalWidth === m.width && im.naturalHeight === m.height); };
    im.onerror = function () { finish(false); }; im.src = url;
  }
  function openFS(done) {
    if (!(window.tizen && tizen.filesystem)) { done(null); return; }
    var ended = false, timer = setTimeout(function () { finish(null); }, 2000);
    function finish(dir) { if (ended) return; ended = true; clearTimeout(timer); fsDir = dir; done(dir); }
    try {
      tizen.filesystem.resolve('wgt-private', function (root) {
        try { finish(root.resolve('cleanframe-art')); }
        catch (e) { try { finish(root.createDirectory('cleanframe-art')); } catch (ignore) { finish(null); } }
      }, function () { finish(null); }, 'rw');
    } catch (e) { finish(null); }
  }
  function openDB(done) {
    if (!window.indexedDB) { done(null); return; }
    var req, ended = false, timer = setTimeout(function () { finish(null); }, 2000);
    function finish(value) { if (ended) { if (value) value.close(); return; } ended = true; clearTimeout(timer); db = value; done(value); }
    try {
      req = window.indexedDB.open('cleanframe-art', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('cache'); };
      req.onsuccess = function () { finish(req.result); };
      req.onerror = function () { finish(null); };
    } catch (e) { finish(null); }
  }
  function load(done) {
    if (loaded) { done(current); return; }
    readers.push(done); if (loading) return; loading = true;
    var ended = false, timer = setTimeout(function () { finish(null); }, 12000);
    function finish(value) {
      if (ended) return; ended = true; clearTimeout(timer);
      current = value; loaded = true; loading = false;
      var queue = readers; readers = []; queue.forEach(function (fn) { fn(current); });
    }
    openFS(function (dir) {
      if (dir) {
        var m, f;
        try {
          m = JSON.parse(localStorage.getItem(META_KEY));
          if (!metadata(m)) { finish(null); return; }
          f = dir.resolve(m.revision + '.jpg');
          if (!f.isFile || f.fileSize < 12 || f.fileSize > MAX) { finish(null); return; }
          validImage(m, f.toURI(), function (ok) { finish(ok ? record(m, f.toURI()) : null); });
        } catch (e) { finish(null); }
      } else openDB(function (store) {
        if (!store) { finish(null); return; }
        try {
          var req = store.transaction('cache').objectStore('cache').get('last');
          req.onsuccess = function () {
            var r = req.result, url;
            if (!r || !metadata(r.meta) || !r.blob || r.blob.size > MAX) { finish(null); return; }
            try { url = objectURL(r.blob); validImage(r.meta, url, function (ok) { finish(ok ? record(r.meta, url) : null); }); }
            catch (e) { finish(null); }
          };
          req.onerror = function () { finish(null); };
        } catch (e) { finish(null); }
      });
    });
  }
  function request(url, binary, done) {
    var xhr = new window.XMLHttpRequest(), ended = false;
    function finish(value) {
      if (ended) return; ended = true;
      var i = requests.indexOf(xhr); if (i >= 0) requests.splice(i, 1);
      done(value);
    }
    try {
      xhr.open('GET', url, true); xhr.timeout = binary ? 8000 : 3500;
      if (binary) xhr.responseType = 'arraybuffer';
      xhr.onload = function () {
        if (xhr.status !== 200) { finish(null); return; }
        if (binary) finish(xhr.response && xhr.response.byteLength <= MAX ? xhr.response : null);
        else { try { finish(xhr.responseText.length <= 2048 ? JSON.parse(xhr.responseText) : null); } catch (e) { finish(null); } }
      };
      xhr.onprogress = function (event) { if (event.loaded > (binary ? MAX : 2048)) { xhr.abort(); finish(null); } };
      xhr.onerror = xhr.ontimeout = xhr.onabort = function () { finish(null); };
      requests.push(xhr); xhr.send();
    } catch (e) { finish(null); }
  }
  function tidy(done) {
    try {
      fsDir.listFiles(function (files) {
        var pointer;
        try { pointer = JSON.parse(localStorage.getItem(META_KEY)); } catch (e) { pointer = null; }
        files.forEach(function (file) {
          var obsolete = /^[a-f0-9]{64}\.jpg$/.test(file.name) && (!metadata(pointer) || file.name !== pointer.revision + '.jpg') && (!current || file.name !== current.revision + '.jpg') && (!retainedURL || retainedURL.indexOf('/' + file.name) < 0);
          if (obsolete || /^incoming-[0-9]+-[0-9]+\.tmp$/.test(file.name) && file.name !== currentTemp) {
            try { fsDir.deleteFile(file.fullPath); } catch (e) { /* Retry on the next refresh. */ }
          }
        });
        done();
      }, done);
    } catch (e) { done(); }
  }
  function persist(m, bytes, blob, url, g, complete) {
    var ended = false, timer = setTimeout(function () { done(record(m, url)); }, 2500);
    function done(value) { if (ended) return; ended = true; clearTimeout(timer); complete(value); }
    if (fsDir) {
      var tmp, stream, data = new window.Uint8Array(bytes), i, part, tempName = 'incoming-' + g + '-' + (++copyNo) + '.tmp';
      currentTemp = tempName;
      tidy(function () {
        if (ended || g !== epoch) { done(null); return; }
        try {
          // A complete JPEG is promoted before the last-good pointer. Overwrite
          // an orphan of the same revision too: it may be a corrupt old cache.
          tmp = fsDir.createFile(tempName);
          tmp.openStream('w', function (s) {
            stream = s;
            try {
              if (ended || g !== epoch) { stream.close(); done(null); return; }
              for (i = 0; i < data.length; i += 65536) { part = Array.prototype.slice.call(data.subarray(i, i + 65536)); stream.writeBytes(part); }
              stream.close(); stream = null;
              fsDir.moveTo(tmp.fullPath, fsDir.fullPath + '/' + m.revision + '.jpg', true, promote, function () { done(record(m, url)); });
            } catch (e) { if (stream) { try { stream.close(); } catch (ignoreClose) { /* Best effort. */ } } done(record(m, url)); }
          }, function () { done(record(m, url)); });
        } catch (e) { done(record(m, url)); }
      });
      function promote() {
        if (ended || g !== epoch) { done(null); return; }
        try {
          localStorage.setItem(META_KEY, JSON.stringify(m));
          tidy(function () {});
          done(record(m, fsDir.resolve(m.revision + '.jpg').toURI()));
        } catch (e) { done(record(m, url)); }
      }
    } else if (db) {
      try {
        var tx = db.transaction('cache', 'readwrite');
        tx.objectStore('cache').put({ meta: m, blob: blob }, 'last');
        tx.oncomplete = tx.onerror = tx.onabort = function () { done(record(m, url)); };
      } catch (e) { done(record(m, url)); }
    } else done(record(m, url)); // Memory-only when private storage is unavailable.
  }
  function refresh(done) {
    if (refreshing || document.hidden) { done(null); return; }
    refreshing = true; var g = epoch, base = 'http://' + host() + ':' + port();
    function finish(value) {
      if (g !== epoch) return;
      refreshing = false; error = value ? null : 'Art Mode is unavailable. Your last wallpaper is kept.';
      if (value) current = value;
      done(value);
    }
    load(function () {
      if (g !== epoch) return;
      request(base + '/current.json', false, function (m) {
        if (g !== epoch) return;
        if (!metadata(m)) { finish(null); return; }
        if (m.look) setLook(m.look);
        if (current && current.revision === m.revision) { finish(current); return; }
        request(base + m.imageUrl, true, function (bytes) {
          if (g !== epoch) return;
          if (!bytes || bytes.byteLength < 12) { finish(null); return; }
          var data = new window.Uint8Array(bytes), blob, url;
          if (data[0] !== 255 || data[1] !== 216 || data[data.length - 2] !== 255 || data[data.length - 1] !== 217) { finish(null); return; }
          try { blob = new window.Blob([bytes], { type: 'image/jpeg' }); url = objectURL(blob); }
          catch (e) { finish(null); return; }
          validImage(m, url, function (ok) {
            if (g !== epoch) return;
            if (!ok) { finish(null); return; }
            persist(m, bytes, blob, url, g, finish);
          });
        });
      });
    });
  }
  function cancel() { epoch++; refreshing = false; requests.slice().forEach(function (xhr) { xhr.abort(); }); }
  window.FrameArt = { load: load, refresh: refresh, cancel: cancel, current: function () { return current; },
    status: function () { return { available: !!current, refreshing: refreshing, error: error }; },
    look: function () { return { settings: look, style: lookStyle(look) }; }, lookFor: lookStyle,
    bridge: function () { return 'http://' + host() + ':' + port(); },
    // Bound blob lifetimes once a new atomic bundle replaces every previous image.
    retain: function (url) { retainedURL = url; urls = urls.filter(function (item) { if (item === url || current && item === current.url) return true; window.URL.revokeObjectURL(item); return false; }); }
  };
})();
