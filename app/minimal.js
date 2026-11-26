/* CleanFrame Minimal Home: cinematic wallpaper, oversized clock and date, icon column and weather corner.
   ES5 for the TV. main.js owns state, focus and app data and calls render(); this file owns only its own elements. */
(function () {
  'use strict';

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* 24-hour time without seconds, as in the design reference (List and Dock keep their 12-hour clock). */
  function timeText(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /* Fixed English names: TV Intl/locale output differs between firmware versions. */
  function dateText(d) {
    return (DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]).toUpperCase();
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* Thin line icons for the weather corner, drawn on a 24-unit grid. */
  var CLOUD = 'M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 11.2 3.7 3.7 0 0 0 7 18.5Z';
  var HIGH_CLOUD = 'M7 15h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 7.7 3.7 3.7 0 0 0 7 15Z';
  var SMALL_CLOUD = 'M9.2 20h8.6a3.7 3.7 0 0 0 .5-7.36 5.2 5.2 0 0 0-9.9 1.1 3.2 3.2 0 0 0 .8 6.26Z';
  var WEATHER_ICONS = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7"/>',
    moon: '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z"/>',
    cloud: '<path d="' + CLOUD + '"/>',
    partly: '<path d="M8.5 2.6v1.6M2.6 8.5h1.6M4.3 4.3l1.1 1.1M12.7 4.3l-1.1 1.1"/><path d="M5.6 11.6a3.6 3.6 0 0 1 6.5-3.6"/><path d="' + SMALL_CLOUD + '"/>',
    'partly-night': '<path d="M11.4 9.2A4.6 4.6 0 0 1 6 3.8a4.6 4.6 0 0 0-1 7.4"/><path d="' + SMALL_CLOUD + '"/>',
    fog: '<path d="M4 8.5h16M6 12.5h12M4 16.5h16"/>',
    rain: '<path d="' + HIGH_CLOUD + '"/><path d="M9 18l-1 2.6M13 18l-1 2.6M17 18l-1 2.6"/>',
    snow: '<path d="' + HIGH_CLOUD + '"/><path d="M9 18.6v.01M12.5 20.4v.01M16 18.6v.01"/>',
    storm: '<path d="' + HIGH_CLOUD + '"/><path d="M12.6 15.6 10.6 19h3l-2 3.4"/>'
  };
  var GAP = 28, MAX_PITCH = 88, COLUMN_SPACE = 880;

  function create(els) {
    var shown = { time: '', date: '', depth: '', video: '' }, failedVideo = '', playing = false;
    var depth = els.depth, video = els.video;

    function setText(el, key, text) {
      if (shown[key] === text) return;
      shown[key] = text; el.textContent = text;
    }
    /* The colon is drawn as two round dots, as in the design reference, whatever the Home font's colon looks like.
       The real ':' stays in the text (transparent) so the clock still reads as a time. Only digits reach markup. */
    function setTime(text) {
      if (shown.time === text) return;
      shown.time = text;
      els.time.innerHTML = text.replace(':', '<span class="lock-colon">:<i></i><i></i></span>');
    }

    /* Depth: the wallpaper photo itself, shown above the clock through a pre-rendered greyscale mask of its
       foreground, so the subject stands in front of the time. Optional per wallpaper; never computed on the TV. */
    var maskSupport = 'webkitMaskImage' in depth.style || 'maskImage' in depth.style, depthKey = '', depthLoads = 0;
    function depthLoaded(key) {
      if (key !== depthKey || --depthLoads > 0) return;
      depth.className = 'lock-depth is-ready';
    }
    function renderDepth(photo, mask) {
      var key = photo && mask && maskSupport ? photo + '|' + mask : '', probe;
      if (key === depthKey) return;
      depthKey = key; shown.depth = key ? mask : '';
      depth.className = 'lock-depth';
      if (!key) {
        depth.removeAttribute('src'); depth.style.webkitMaskImage = ''; depth.style.maskImage = '';
        return;
      }
      depthLoads = 2;
      depth.style.webkitMaskImage = 'url("' + mask + '")'; depth.style.maskImage = 'url("' + mask + '")';
      depth.onload = function () { if (depth.naturalWidth) depthLoaded(key); };
      depth.onerror = function () { depthLoads = -1; };
      depth.setAttribute('src', photo);
      probe = new Image();
      probe.onload = function () { depthLoaded(key); };
      probe.onerror = function () { if (key === depthKey) depthLoads = -1; };
      probe.src = mask;
    }

    /* Looping video: muted, inline, faded in over the still only once frames are playing.
       The still photo stays underneath as the poster, the fallback and the source of every material. */
    function stopVideo(unload) {
      playing = false;
      video.className = 'wall-video';
      if (!video.paused) video.pause();
      if (unload && shown.video) {
        shown.video = '';
        video.removeAttribute('src');
        try { video.load(); } catch (e) { /* Releasing the decoder is best effort. */ }
      }
    }
    video.muted = true; video.loop = true;
    video.setAttribute('muted', ''); video.setAttribute('loop', ''); video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    video.addEventListener('playing', function () { if (shown.video && playing) video.className = 'wall-video is-playing'; });
    video.addEventListener('error', function () {
      if (!shown.video) return;
      failedVideo = shown.video;
      stopVideo(true);
    });
    function renderVideo(src, play) {
      if (!src || src === failedVideo) { stopVideo(true); return; }
      if (src !== shown.video) {
        stopVideo(true);
        // Nothing is fetched or decoded until the video can actually be seen.
        if (!play) return;
        shown.video = src;
        video.setAttribute('src', src);
      }
      if (!play) { stopVideo(false); return; }
      if (playing) return;
      playing = true;
      var attempt = video.play();
      // Older engines return nothing; newer ones reject when autoplay or decoding is refused.
      if (attempt && attempt.then) attempt.then(null, function () { if (shown.video === src) { playing = false; video.className = 'wall-video'; } });
    }

    /* Icon column: one vertical run of app marks, then a gap, then Home controls. No plates, no names on screen;
       each button keeps its accessible name and data-action. Markup is rebuilt only when the items change. */
    var columnKey = '', columnItems = [];
    function renderColumn(items, focus) {
      var key = items.map(function (it) { return it.key; }).join('|'), html = '', controls = 0, pitch, top, gap;
      if (key !== columnKey) {
        columnKey = key;
        items.forEach(function (it) { if (it.control) controls++; });
        gap = controls && controls < items.length ? GAP : 0;
        pitch = Math.min(MAX_PITCH, Math.floor((COLUMN_SPACE - gap) / Math.max(1, items.length)));
        top = Math.round(540 - (items.length * pitch + gap) / 2);
        items.forEach(function (it, n) {
          var y = top + n * pitch + (it.control ? gap : 0);
          html += '<button type="button" tabindex="-1" class="mc-item' + (it.control ? ' is-control' : '') + '" style="top:' + y + 'px;height:' + pitch + 'px"'
            + ' data-z="' + it.z + '" data-i="' + it.i + '" data-action="' + esc(it.action) + '" aria-label="' + esc(it.label) + '">' + it.html + '</button>';
        });
        els.column.innerHTML = html;
        columnItems = Array.prototype.slice.call(els.column.children);
      }
      columnItems.forEach(function (el, n) {
        var on = n === focus, has = el.className.indexOf(' is-focus') >= 0;
        if (on !== has) el.className = on ? el.className + ' is-focus' : el.className.replace(' is-focus', '');
      });
    }

    /* Weather corner: icon, hairline, temperature over the place, then condition with high and low. Hidden without data. */
    var weatherKey = null;
    function renderWeather(w) {
      var key = w ? [w.icon, w.temp, w.place, w.condition, w.high, w.low].join('|') : '';
      if (key === weatherKey) return;
      weatherKey = key;
      if (!w) { els.weather.className = 'lock-weather'; return; }
      els.weather.innerHTML = '<div class="lw-main"><svg class="lw-icon" viewBox="0 0 24 24" aria-hidden="true">' + (WEATHER_ICONS[w.icon] || WEATHER_ICONS.cloud) + '</svg>'
        + '<span class="lw-rule"></span><span class="lw-now"><span class="lw-temp">' + esc(w.temp) + '</span>' + (w.place ? '<span class="lw-place">' + esc(w.place) + '</span>' : '') + '</span></div>'
        + '<div class="lw-detail">' + (w.condition ? '<span>' + esc(w.condition) + '</span>' : '') + '<span>H: ' + esc(w.high) + '</span><span>L: ' + esc(w.low) + '</span></div>';
      els.weather.setAttribute('aria-label', (w.place ? w.place + ', ' : '') + w.temp + (w.condition ? ', ' + w.condition : '') + ', high ' + w.high + ', low ' + w.low);
      els.weather.className = 'lock-weather is-on';
    }

    return {
      renderColumn: renderColumn,
      renderWeather: renderWeather,
      /* state: { active, now, photo, depth (mask), video, play } */
      render: function (state) {
        var now = state.now || new Date();
        setTime(timeText(now));
        setText(els.date, 'date', dateText(now));
        renderDepth(state.active ? state.photo : '', state.active ? state.depth : '');
        renderVideo(state.active && state.video ? state.video : '', !!state.play);
      },
      state: function () {
        return { time: shown.time, date: shown.date, depth: shown.depth, depthReady: depth.className.indexOf('is-ready') >= 0,
          video: shown.video, videoPlaying: video.className.indexOf('is-playing') >= 0 && !video.paused, videoFailed: failedVideo,
          weather: weatherKey || '' };
      }
    };
  }

  window.CleanFrameMinimal = { create: create, timeText: timeText, dateText: dateText };
})();
