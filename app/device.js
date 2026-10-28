/* Public Tizen application APIs. No Mac server, network address or credentials. */
(function () {
  'use strict';
  var IDS = {
    stremio: 'IkWsFHtOY9.Stremio', netflix: 'org.tizen.netflix-app',
    disneyplus: 'MCmYXNxgcu.DisneyPlus', youtube: '9Ur5IzDKqV.TizenYouTube',
    appletv: 'com.samsung.tv.aria-video', primevideo: 'org.tizen.primevideo',
    abciview: 'mWK87Xghap.ABCiview', sbs: 'OyE7OuxlUi.SBSOnDemand',
    applemusic: 'org.tizen.apple.apple-music'
  };
  var STREAMING = ['as6cYRgkPy.Binge', '73iTZRTc34.Stan', '5b8c3eb16b.BeamCTVDev',
    'cj37Ni3qXM.HBONow', 'LBUAQX1exg.Hulu', 'gzcc4LRFBF.Peacock', 'rJyOSqC6Up.CBSAllAccess',
    'Rk72oKFsRS.OtterKidsProd', '70fRFUwYlD.OtterGAProd', 'PvWgqxV3Xa.YouTubeTV',
    'XtU8fQk2gN.ESPN', 'ZmmGjO6VKO.slingtv', 'VtuWAiZdHN.STARZPlay', 'ckfgqqzvt0.dplus',
    'kk8MbItQ0H.VUDU', 'Jz7aUrV2Q4.Twitch', 'OK2Rdkjmsi.IMDbTV', 'Ob3XhAVMu6.amcplus',
    'KaLitts8bq.tenplaySamsungTizen', 'eYuOiOLYQX.KayoSports', 'Ne2ZsPWdKl.9NOW',
    '3KA0pm7a7V.TubiTV', 'rJeHak5zRg.Spotify', 'icp4AvUPiA.7plus'];
  var CONSUMER_SYSTEM = ['org.tizen.browser', 'com.microsoft.copilot'];
  var EXTRA_BRANDS = {'rJeHak5zRg.Spotify': 'spotify', '5b8c3eb16b.BeamCTVDev': 'hbomax', 'cj37Ni3qXM.HBONow': 'hbomax', '3KA0pm7a7V.TubiTV': 'tubi'};
  var INTERNAL = ['adplatform.ADPlayer', 'WykOS4t4F0.cmsWebApp', '25emanual3.emanual',
    'd0m1lV1nt2.emanual', '2022ePop01.SmartTV',
    'ZODRT12q2l.WebAccountExtension', 'ByJlgt0XeD.CastSettingsApp', 'tv6pbVMQFF.PrivacyChoices'];
  var SELF = 'nClrkHome1.FrameHome';
  var HDMI_PORTS = [1, 2, 3, 4];
  function api() { return window.tizen && window.tizen.application; }
  function selfId() {
    try { return api().getCurrentApplication().appInfo.id || SELF; }
    catch (err) { return SELF; }
  }
  function tvwindow() { return window.tizen && window.tizen.tvwindow; }
  function sysinfo() { return window.tizen && window.tizen.systeminfo; }
  function unavailable(done) {
    done({ message: 'Open CleanFrame on the TV to use this control.', detail: 'The web preview cannot control the TV.' });
  }
  function failure(err) {
    return { message: 'The TV could not open this screen.', detail: err && (err.message || err.name) || 'Try again, or press the remote’s Home button to return to CleanFrame.' };
  }
  function bounded(done, timeout) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'The TV did not respond. Please try again.' }); }, timeout || 8000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }
  function defaultInputs() {
    return HDMI_PORTS.map(function (n) {
      return { id: 'hdmi' + n, number: n, name: 'HDMI ' + n, type: 'HDMI', connected: false, active: false, source: { type: 'HDMI', number: n } };
    });
  }
  function sources(done) {
    var list = defaultInputs(), sys = sysinfo(), tvw = tvwindow();
    if (!sys || typeof sys.getPropertyValue !== 'function') {
      done(null, list);
      return;
    }
    var finished = false, timer = setTimeout(function () { finish(list); }, 3000);
    function finish(result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done(null, result);
    }
    try {
      sys.getPropertyValue('VIDEOSOURCE', function (video) {
        var byNum = {};
        list.forEach(function (item) { byNum[item.number] = item; });
        function record(src, isConnected) {
          if (!src || src.type !== 'HDMI') return;
          var n = Number(src.number);
          if (!n || n < 1) return;
          if (!byNum[n]) {
            byNum[n] = { id: 'hdmi' + n, number: n, name: 'HDMI ' + n, type: 'HDMI', connected: false, active: false, source: src };
            list.push(byNum[n]);
          } else {
            byNum[n].source = src;
          }
          if (isConnected) byNum[n].connected = true;
        }
        if (video && Array.isArray(video.disconnected)) video.disconnected.forEach(function (s) { record(s, false); });
        if (video && Array.isArray(video.connected)) video.connected.forEach(function (s) { record(s, true); });
        list.sort(function (a, b) { return a.number - b.number; });
        if (tvw && typeof tvw.getSource === 'function') {
          try {
            tvw.getSource(function (active) {
              if (active && active.type === 'HDMI' && byNum[Number(active.number)]) {
                byNum[Number(active.number)].active = true;
              }
              finish(list);
            }, function () { finish(list); });
            return;
          } catch (e) {}
        }
        finish(list);
      }, function () { finish(list); });
    } catch (err) { finish(list); }
  }
  function setSource(port, done) {
    var num = typeof port === 'object' && port ? Number(port.number) : Number(String(port).replace(/^hdmi/i, ''));
    if (!num || num < 1) { done({ message: 'This HDMI input is not available.' }); return; }
    var tvw = tvwindow(), sys = sysinfo(), app = api();
    if (!tvw && !app) { unavailable(done); return; }
    var finish = bounded(done);
    function switchView(srcObj) {
      if (app) {
        try {
          app.launch('org.tizen.tv-viewer', function () { finish(null, srcObj); }, function () {
            try { app.getCurrentApplication().hide(); } catch (e) {}
            finish(null, srcObj);
          });
          return;
        } catch (e) {
          try { app.getCurrentApplication().hide(); } catch (he) {}
        }
      }
      finish(null, srcObj);
    }
    function apply(srcObj) {
      if (tvw && typeof tvw.setSource === 'function') {
        try {
          tvw.setSource(srcObj, function () {
            switchView(srcObj);
          }, function () {
            switchView(srcObj);
          });
          return;
        } catch (err) {}
      }
      switchView(srcObj);
    }
    if (sys && typeof sys.getPropertyValue === 'function') {
      try {
        sys.getPropertyValue('VIDEOSOURCE', function (video) {
          var pool = [].concat(video && video.connected || [], video && video.disconnected || []);
          var match = null, i;
          for (i = 0; i < pool.length; i++) {
            if (pool[i] && pool[i].type === 'HDMI' && Number(pool[i].number) === num) { match = pool[i]; break; }
          }
          apply(match || { type: 'HDMI', number: num });
        }, function () {
          apply({ type: 'HDMI', number: num });
        });
        return;
      } catch (e) {}
    }
    apply({ type: 'HDMI', number: num });
  }
  function launchApp(id, done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try { api().launch(id, function () { finish(null); }, function (err) { finish(failure(err)); }); }
    catch (err) { finish(failure(err)); }
  }
  function launch(brand, done) {
    if (!IDS[brand]) { done({message: 'This app has no launch target.'}); return; }
    launchApp(IDS[brand], done);
  }
  function art(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      var data = [new tizen.ApplicationControlData('mode', ['fullscreen']), new tizen.ApplicationControlData('requester', ['mobile'])];
      var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
      api().launchAppControl(control, 'org.tizen.art-app', function () { finish(null); }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function home(done) { launchApp('com.samsung.tv.csfs', done); }
  function settings(done) { launchApp('com.samsung.tv.coba.setting', done); }
  function apps(done) {
    if (!api()) { unavailable(done); return; }
    // Large installed catalogues can take longer than a launch response.
    var finish = bounded(done, 20000);
    try {
      api().getAppsInfo(function (list) {
        var known = {}, seen = {}, result = [], self = selfId();
        Object.keys(IDS).forEach(function (brand) { known[IDS[brand]] = brand; });
        list.forEach(function (a) {
          var primary = !!known[a.id], stream = STREAMING.indexOf(a.id) >= 0;
          var consumer = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(a.id) || CONSUMER_SYSTEM.indexOf(a.id) >= 0;
          if (a.id === self || INTERNAL.indexOf(a.id) >= 0 || seen[a.id] || !a.name || (!primary && !stream && (!a.show || !consumer))) return;
          if (!primary && /(?:service|worker|preview|promotion|plugin|launcher|test|sdk|^ep[ -]|factory|daemon)/i.test(a.name + ' ' + a.id)) return;
          if (/-dummy$/.test(a.id) || a.id === 'com.samsung.tv.cobalt-yt') return;
          seen[a.id] = true;
          result.push({ appId: a.id, name: a.name, brand: known[a.id] || EXTRA_BRANDS[a.id] || '', icon: a.iconPath || '', rank: primary ? Object.keys(IDS).indexOf(known[a.id]) : (stream ? 20 : 30) });
        });
        result.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
        finish(null, result);
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  window.FrameDevice = { launch: launch, launchApp: launchApp, art: art, home: home, settings: settings, apps: apps, sources: sources, inputs: sources, setSource: setSource, hdmi: setSource };
}());
