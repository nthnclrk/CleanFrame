/* CleanFrame weather for the Minimal layout. ES5 for the TV.
   Approximate location comes from the internet address (GeoJS); conditions come from Open-Meteo (CC BY 4.0).
   Requests run only while Minimal is visible with weather on; results are cached locally and shown for a few hours. */
(function () {
  'use strict';

  var GEO = 'https://get.geojs.io/v1/ip/geo.json';
  var FORECAST = 'https://api.open-meteo.com/v1/forecast';
  var MINUTE = 60000, REFRESH = 30 * MINUTE, RETRY = 5 * MINUTE, KEEP = 3 * 60 * MINUTE, PLACE_KEEP = 24 * 60 * MINUTE, TIMEOUT = 10000;

  /* WMO weather codes from Open-Meteo, reduced to a few calm words and line icons. */
  function condition(code, day) {
    if (code === 0) return day ? ['SUNNY', 'sun'] : ['CLEAR', 'moon'];
    if (code === 1) return day ? ['MOSTLY SUNNY', 'partly'] : ['MOSTLY CLEAR', 'partly-night'];
    if (code === 2) return ['PARTLY CLOUDY', day ? 'partly' : 'partly-night'];
    if (code === 3) return ['CLOUDY', 'cloud'];
    if (code === 45 || code === 48) return ['FOG', 'fog'];
    if (code >= 51 && code <= 57) return ['DRIZZLE', 'rain'];
    if (code >= 61 && code <= 67) return ['RAIN', 'rain'];
    if (code >= 71 && code <= 77) return ['SNOW', 'snow'];
    if (code >= 80 && code <= 82) return ['SHOWERS', 'rain'];
    if (code === 85 || code === 86) return ['SNOW SHOWERS', 'snow'];
    if (code >= 95) return ['STORMS', 'storm'];
    return ['', 'cloud'];
  }
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function degrees(celsius, units) { return Math.round(units === 'f' ? celsius * 9 / 5 + 32 : celsius) + '°'; }

  function create(options) {
    var key = options.key, onChange = options.onChange || function () {};
    var cache = read(), timer = 0, busy = false, wanted = false, failed = false, request = 0;

    function read() {
      try { var v = JSON.parse(window.localStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : {}; }
      catch (e) { return {}; }
    }
    function save() { try { window.localStorage.setItem(key, JSON.stringify(cache)); } catch (e) { /* Weather still shows for this session. */ } }
    function get(url, done) {
      var xhr = new window.XMLHttpRequest(), finished = false, guard;
      function finish(data) { if (finished) return; finished = true; clearTimeout(guard); done(data); }
      guard = setTimeout(function () { try { xhr.abort(); } catch (e) { /* Already closed. */ } finish(null); }, TIMEOUT);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var data = null;
        if (xhr.status >= 200 && xhr.status < 300) { try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; } }
        finish(data);
      };
      try { xhr.open('GET', url, true); xhr.send(); } catch (e) { finish(null); }
    }
    function place(done) {
      var p = cache.place;
      if (p && Date.now() - p.at < PLACE_KEEP) { done(p); return; }
      get(GEO, function (data) {
        var lat = data && parseFloat(data.latitude), lon = data && parseFloat(data.longitude);
        if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { done(p || null); return; }
        cache.place = { at: Date.now(), lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100,
          city: typeof data.city === 'string' ? data.city.slice(0, 40) : '' };
        save(); done(cache.place);
      });
    }
    function schedule(ms) {
      clearTimeout(timer); timer = 0;
      if (wanted) timer = setTimeout(function () { timer = 0; refresh(); }, Math.max(1000, ms));
    }
    function refresh() {
      if (busy || !wanted) return;
      var id = ++request; busy = true;
      place(function (p) {
        if (id !== request) return;
        if (!p) { busy = false; fail(); return; }
        get(FORECAST + '?latitude=' + p.lat + '&longitude=' + p.lon + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1', function (data) {
          if (id !== request) return;
          busy = false;
          var c = data && data.current, d = data && data.daily;
          var w = c && d && { temp: c.temperature_2m, code: c.weather_code, day: c.is_day === 1,
            high: d.temperature_2m_max && d.temperature_2m_max[0], low: d.temperature_2m_min && d.temperature_2m_min[0] };
          if (!w || !finite(w.temp) || !finite(w.code) || !finite(w.high) || !finite(w.low)) { fail(); return; }
          w.at = Date.now(); cache.weather = w; failed = false; save();
          schedule(REFRESH); onChange();
        });
      });
    }
    function fail() { failed = true; schedule(RETRY); onChange(); }

    return {
      /* Fetch only while wanted: Minimal visible with weather on. Stopping cancels timers and late replies. */
      update: function (enabled, visible) {
        var next = !!(enabled && visible), age;
        if (next === wanted) return;
        wanted = next;
        if (!wanted) { clearTimeout(timer); timer = 0; if (busy) { busy = false; request++; } return; }
        age = cache.weather ? Date.now() - cache.weather.at : Infinity;
        if (age >= REFRESH || age < 0) refresh(); else schedule(REFRESH - age);
      },
      view: function (units) {
        var w = cache.weather, age = w ? Date.now() - w.at : Infinity, c;
        if (!w || age > KEEP || age < -MINUTE) return null;
        c = condition(w.code, w.day);
        return { temp: degrees(w.temp, units), high: degrees(w.high, units), low: degrees(w.low, units), condition: c[0], icon: c[1],
          place: cache.place && cache.place.city ? cache.place.city.toUpperCase() : '' };
      },
      state: function () { return { wanted: wanted, busy: busy, failed: failed, at: cache.weather ? cache.weather.at : 0, place: cache.place ? cache.place.city : '' }; }
    };
  }

  window.CleanFrameWeather = { create: create, condition: condition };
})();
