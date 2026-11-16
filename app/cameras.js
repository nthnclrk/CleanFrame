/* Cameras view for CleanFrame: go2rtc MJPEG tiles placed by camera-layout.js, a quick JPEG
   snapshot before each stream, Offline detection, and full screen through the TV's own player
   (AVPlay). window.FrameCameras.create(host) returns the view; main.js owns the view stack,
   the tile markup and drawing, and calls fill() from its redraw.

   Platform facts this follows:
   - On the TV an <img> showing MJPEG may never fire load, so nothing waits for it: the still
     sits under the live image, and a timer (not a frame) decides when to reconnect.
   - go2rtc is plain HTTP/1.1 and the browser opens at most six connections to it. Six live
     tiles would hold them all, so a tile always takes its snapshot with its own stream closed.
   - go2rtc ignores unknown query parameters; every request carries a unique t= so the browser
     never reuses an old frame or a stalled connection. */
(function () {
  'use strict';
  var CAM_KEY = 'cleanframe.cameras.v1';
  var SNAP_DEADLINE = 8000;  // A hung snapshot is abandoned, so it cannot block retries.
  var SNAP_GAP = 9000;       // Snapshot requests for one tile start at least this far apart.
  var TICK = 10000;          // Every 10 s: retry missing stills and recheck Offline tiles.
  var REFRESH_TICKS = 6;     // Every 60 s: reconnect every stream behind a fresh snapshot.
  var RETRY = 10000;         // A stream that errors reconnects after 10 s.

  // A camera's shape, as "3:4" or a number; 0 when unknown.
  function ratioValue(v) {
    var m = typeof v === 'string' && /^(\d{1,4}):(\d{1,4})$/.exec(v), r = m ? Number(m[1]) / Number(m[2]) : Number(v);
    return isFinite(r) && r >= 0.2 && r <= 6 ? r : 0;
  }
  // Learned shapes, per go2rtc stream.
  function memory() { var m = null; try { m = JSON.parse(localStorage.getItem(CAM_KEY)); } catch (e) { m = null; } return m && typeof m === 'object' ? m : {}; }
  function remember(src, patch) {
    var m = memory(), k; m[src] = m[src] || {};
    for (k in patch) if (patch.hasOwnProperty(k)) m[src][k] = patch[k];
    try { localStorage.setItem(CAM_KEY, JSON.stringify(m)); } catch (e) { /* Memory only: the next open uses the configured shape. */ }
  }

  /* host: { cameras, go2rtc, top(), push(entry), pop(), render(), view() } */
  function create(host) {
    var cams = host.cameras, layout = window.FrameCameraLayout;
    // Per tile, for the current visit: the snapshot in flight, when it started, whether the
    // stream is held closed for it, the stream's retry timer, and what the tile shows.
    var tiles = [], tick = 0, ticks = 0;
    var full = { token: 0, settle: 0 }, webapisTried = false;

    function streamURL(cam) { return host.go2rtc + '/api/stream.mjpeg?src=' + encodeURIComponent(cam.src) + '&t=' + Date.now(); }
    function stillURL(cam) { return host.go2rtc + '/api/frame.jpeg?src=' + encodeURIComponent(cam.src) + '&t=' + Date.now(); }
    function nodes(i) {
      var b = host.view().querySelectorAll('.cam')[i];
      return b ? { b: b, live: b.querySelector('.cam-live'), still: b.querySelector('.cam-still') } : null;
    }
    function showing() { return host.top().id === 'cameras'; }
    function playerShowing() { return document.documentElement.className.indexOf('is-avplay') >= 0; }
    // Streams run only where seen: every tile in the grid, only the chosen one in full screen,
    // and none while the TV player shows it.
    function wanted(t, i) { return !playerShowing() && (!t.full || i === t.f.i); }
    function ratios(t) { return cams.map(function (cam, i) { return t.ratios[i] || 16 / 9; }); }

    function classes(t, i, live) {
      var s = tiles[i];
      return 'cam' + (i === t.f.i ? ' is-focus' : '') + (t.full && i !== t.f.i ? ' is-hidden' : '') +
        (s.live && live.getAttribute('src') ? ' is-live' : '') + (s.offline ? ' is-offline' : '');
    }
    function paint(i) { var n = nodes(i); if (n && showing()) n.b.className = classes(host.top(), i, n.live); }
    // A tile whose latest snapshot failed says Offline: its stream is hidden and its last
    // picture dimmed, so an old frame never passes for live. A later snapshot (or, where the
    // browser reports one, a live frame) clears it.
    function setOffline(i, on) { tiles[i].offline = on; if (on) tiles[i].live = false; paint(i); }
    // A camera's real shape, learned from a snapshot or frame: remembered and laid out at once.
    function learn(t, i, r) {
      if (t.ratios[i] && Math.abs(t.ratios[i] - r) <= 0.01) return;
      t.ratios[i] = r; remember(cams[i].src, { r: Math.round(r * 1000) / 1000 });
      if (host.top() === t) host.render();
    }

    // One snapshot per tile at a time, abandoned after SNAP_DEADLINE.
    function snapshot(i, ok, fail) {
      var s = tiles[i], img = new Image(), timer = setTimeout(function () { end(); img.src = ''; fail(); }, SNAP_DEADLINE);
      function end() { clearTimeout(timer); img.onload = img.onerror = null; if (s.snap === img) { s.snap = null; s.cancel = null; } }
      s.snap = img; s.snapAt = Date.now(); s.cancel = function () { end(); img.src = ''; };
      img.onload = function () { end(); if (img.naturalWidth && img.naturalHeight) ok(img); else fail(); };
      img.onerror = function () { end(); fail(); };
      img.src = stillURL(cams[i]);
    }
    // Close the tile's stream, take a snapshot, then let the redraw reconnect the stream
    // whatever the snapshot's outcome (the redraw attaches its retry and shape handlers).
    function refresh(i) {
      var s = tiles[i], n = nodes(i);
      if (!n) return;
      clearTimeout(s.retry); n.live.removeAttribute('src'); n.live.className = 'cam-live'; s.live = false; s.paused = true;
      function reconnect() { s.paused = false; if (showing() && document.body.contains(n.b)) host.render(); }
      snapshot(i, function (img) {
        n.still.src = img.src; setOffline(i, false); learn(host.top(), i, img.naturalWidth / img.naturalHeight); reconnect();
      }, function () { setOffline(i, true); reconnect(); });
    }
    function connect(t, i, live) {
      var s = tiles[i];
      live.className = 'cam-live';
      live.onerror = function () {
        live.className = 'cam-live is-failed'; clearTimeout(s.retry);
        // Its snapshot also tells whether the camera itself is reachable.
        s.retry = setTimeout(function () { if (live.getAttribute('src') && document.body.contains(live)) refresh(i); }, RETRY);
      };
      // Where the browser reports frames (not the TV, for MJPEG): hide the still, learn the shape.
      live.onload = function () {
        if (!live.naturalWidth || !live.naturalHeight) return;
        s.live = true; s.offline = false; paint(i);
        learn(t, i, live.naturalWidth / live.naturalHeight);
      };
      live.src = streamURL(cams[i]);
    }
    function release(i, live) { clearTimeout(tiles[i].retry); live.onload = live.onerror = null; live.removeAttribute('src'); tiles[i].live = false; }

    function onTick() {
      if (!showing() || document.hidden) { clearInterval(tick); tick = 0; return; }
      var all = !(++ticks % REFRESH_TICKS), missing = false;
      tiles.forEach(function (s, i) {
        var n = nodes(i);
        if (!n) return;
        if (!n.still.getAttribute('src')) missing = true;
        // Every minute every tile; every 10 s the Offline ones, so a camera that is back clears soon.
        if (!n.live.getAttribute('src') || s.snap || (!all && !s.offline)) return;
        refresh(i);
      });
      if (!all && missing) host.render(); // Retries snapshots that never arrived (fill keeps them SNAP_GAP apart).
    }

    function open() {
      var mem = memory(), r = {};
      cams.forEach(function (cam, i) { var v = ratioValue(mem[cam.src] && mem[cam.src].r) || cam.ratio; if (v) r[i] = v; });
      tiles = cams.map(function () { return { snap: null, cancel: null, snapAt: 0, paused: false, retry: 0, live: false, offline: false }; });
      host.push({ id: 'cameras', f: { i: 0 }, full: false, ratios: r });
      clearInterval(tick); ticks = 0; tick = setInterval(onTick, TICK);
    }
    // imagesOnly: the TV player is taking over; the view stays open.
    function stop(imagesOnly) {
      if (!imagesOnly) { clearInterval(tick); tick = 0; stopFull(true); }
      tiles.forEach(function (s, i) {
        var n = nodes(i);
        if (n) release(i, n.live); else clearTimeout(s.retry);
        if (s.cancel) s.cancel();
        s.paused = false; // Its reconnect will not run now; the next redraw starts the stream if wanted.
      });
    }
    function fill(t, grid) {
      var boxes = layout.layout(ratios(t));
      Array.prototype.forEach.call(grid.querySelectorAll('.cam'), function (b, i) {
        var s = tiles[i], box = t.full ? layout.fullBox(t.ratios[i] || 16 / 9) : boxes[i], live = b.querySelector('.cam-live'), still = b.querySelector('.cam-still'), on = wanted(t, i);
        if (!on && live.getAttribute('src')) release(i, live);
        // The snapshot comes before the stream; a failed one waits SNAP_GAP, not every redraw.
        if (on && !still.getAttribute('src') && !s.snap && !(Date.now() - s.snapAt < SNAP_GAP)) refresh(i);
        if (on && !live.getAttribute('src') && !s.paused) connect(t, i, live);
        b.className = classes(t, i, live);
        b.style.left = box.x + 'px'; b.style.top = box.y + 'px'; b.style.width = box.w + 'px'; b.style.height = box.h + 'px';
      });
      host.view().className = 'view' + (t.full ? ' cams-full' : '');
    }

    /* Full screen plays the camera's full-quality stream through the TV's own player (AVPlay, a
       hardware video layer behind the page) as go2rtc HLS: repackaged, not re-encoded. It needs
       the avplay, network.public and tv.audio privileges and a Partner-signed package. The MJPEG
       frame shows until the video runs, and stays if the TV cannot play the stream. */
    function avplay() { return window.webapis && window.webapis.avplay; }
    function loadWebapis(done) {
      if (avplay() || !window.tizen || webapisTried) { done(); return; }
      webapisTried = true; // One attempt per launch; a failed load is not retried on every press.
      var s = document.createElement('script'); s.src = '$WEBAPIS/webapis/webapis.js';
      s.onload = s.onerror = function () { done(); }; document.head.appendChild(s);
    }
    // While the player shows a camera the MJPEG tiles are released, so no decoder runs unseen;
    // they reconnect when it stops, unless Cameras is closing (leaving).
    function setPlayer(on, leaving) {
      var root = document.documentElement, was = playerShowing();
      root.className = root.className.replace(/ ?is-avplay/g, '') + (on ? ' is-avplay' : '');
      if (on && !was) stop(true);
      else if (!on && was && !leaving && showing()) host.render();
    }
    function stopFull(leaving) {
      full.token++; clearTimeout(full.settle);
      if (avplay()) { try { avplay().stop(); } catch (e) { /* Not playing. */ } try { avplay().close(); } catch (e) { /* Not open. */ } }
      setPlayer(false, leaving);
    }
    function startFull(t) {
      var cam = cams[t.f.i], token;
      stopFull(); token = full.token;
      if (!cam || !cam.full) return;
      loadWebapis(function () {
        var p = avplay();
        if (!p || token !== full.token || host.top() !== t || !t.full) return;
        // The player renders into the page's avplayer object.
        if (!document.getElementById('avplayer')) { var o = document.createElement('object'); o.id = 'avplayer'; o.type = 'application/avplayer'; o.className = 'avplayer'; document.body.appendChild(o); }
        try {
          p.open(host.go2rtc + '/api/stream.m3u8?src=' + encodeURIComponent(cam.full));
          p.setListener({ onerror: function () { if (token === full.token) stopFull(); }, onstreamcompleted: function () { if (token === full.token) stopFull(); } });
          p.setDisplayRect(0, 0, 1920, 1080);
          p.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
          p.prepareAsync(function () {
            if (token !== full.token) return;
            p.play(); setPlayer(true);
          }, function () { if (token === full.token) stopFull(); });
        } catch (e) { stopFull(); }
      });
    }

    // The nearest tile in the pressed direction, by tile centres.
    function move(t, k) {
      var boxes = layout.layout(ratios(t)), cur = boxes[t.f.i], best = t.f.i, gap = Infinity;
      boxes.forEach(function (b) {
        var dx = b.x + b.w / 2 - (cur.x + cur.w / 2), dy = b.y + b.h / 2 - (cur.y + cur.h / 2), d;
        if (b.i === cur.i) return;
        if (k === 'left' && dx >= -1 || k === 'right' && dx <= 1 || k === 'up' && dy >= -1 || k === 'down' && dy <= 1) return;
        d = (k === 'left' || k === 'right' ? Math.abs(dx) + 2 * Math.abs(dy) : Math.abs(dy) + 2 * Math.abs(dx));
        if (d < gap) { gap = d; best = b.i; }
      });
      return best;
    }
    function key(t, k) {
      var n = cams.length;
      if (k === 'back') { if (t.full) { t.full = false; stopFull(); } else { stop(); host.pop(); } return; }
      if (k === 'ok') { t.full = !t.full; if (t.full) startFull(t); else stopFull(); return; }
      if (t.full) {
        if (n < 2) return; // One camera: nothing to step to, and the player keeps playing.
        // Stepping shows the next camera's MJPEG at once; the TV player starts only once the
        // choice settles, so holding an arrow never opens and closes the player per step.
        t.f.i = k === 'left' || k === 'up' ? (t.f.i + n - 1) % n : (t.f.i + 1) % n;
        stopFull(); clearTimeout(full.settle);
        full.settle = setTimeout(function () { if (host.top() === t && t.full) startFull(t); }, 350);
        return;
      }
      t.f.i = move(t, k);
    }
    function point(t, z, i) { if (z === 'cam') { t.f.i = i; key(t, 'ok'); } }

    return { open: open, stop: stop, fill: fill, key: key, point: point };
  }
  window.FrameCameras = { create: create, ratioValue: ratioValue };
}());
