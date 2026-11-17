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
  // Drive convention: a CleanFrame folder of pictures at the root of the USB storage.
  var PHOTO_DIR = 'CleanFrame', PHOTO_ALT_DIR = 'Photos', PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp'], PHOTO_LIMIT = 240;
  function api() { return window.tizen && window.tizen.application; }
  function selfId() {
    try { return api().getCurrentApplication().appInfo.id || SELF; }
    catch (err) { return SELF; }
  }
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
  var sourceCancel = null;
  function cancelSource() { if (sourceCancel) sourceCancel(); }
  function sources(done) {
    var sys = window.tizen && window.tizen.systeminfo, tvw = window.tizen && window.tizen.tvwindow;
    if (!sys || typeof sys.getPropertyValue !== 'function' || !tvw || typeof tvw.setSource !== 'function') { unavailable(done); return; }
    var finish = bounded(done);
    try {
      sys.getPropertyValue('VIDEOSOURCE', function (video) {
        var list = [], byPort = {}, active = null;
        try { if (typeof tvw.getSource === 'function') active = tvw.getSource(); } catch (err) { /* Status may be unavailable while discovery still works. */ }
        function record(src, connected) {
          if (!src || src.type !== 'HDMI' || typeof src.number !== 'number' || !isFinite(src.number) || src.number < 0 || Math.floor(src.number) !== src.number) return;
          var key = String(src.number), item = byPort[key];
          if (!item) {
            item = { number: src.number, name: 'HDMI ' + src.number, connected: false, active: !!(active && active.type === 'HDMI' && active.number === src.number), source: src };
            byPort[key] = item; list.push(item);
          }
          if (connected) { item.connected = true; item.source = src; }
        }
        if (video && Array.isArray(video.disconnected)) video.disconnected.forEach(function (src) { record(src, false); });
        if (video && Array.isArray(video.connected)) video.connected.forEach(function (src) { record(src, true); });
        list.sort(function (a, b) { return a.number - b.number; });
        finish(null, list);
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function setSource(port, done) {
    cancelSource();
    var tvw = window.tizen && window.tizen.tvwindow, app = api(), finished = false;
    if (typeof port !== 'number' || !isFinite(port) || port < 0 || Math.floor(port) !== port) { done({ message: 'This HDMI input is not available.' }); return; }
    if (!tvw || typeof tvw.setSource !== 'function' || !app || typeof app.launch !== 'function') { unavailable(done); return; }
    var timer = setTimeout(function () { finish({ message: 'The TV did not respond. Please try again.' }); }, 8000);
    function finish(err, value) {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (sourceCancel === cancel) sourceCancel = null;
      done(err, value);
    }
    function cancel() { finish({ message: 'Input change cancelled.', cancelled: true }); }
    sourceCancel = cancel;
    sources(function (err, list) {
      if (finished) return;
      if (err) { finish(err); return; }
      var input = null;
      list.some(function (item) { if (item.number === port) { input = item; return true; } return false; });
      if (!input) { finish({ message: 'This HDMI input is no longer available.' }); return; }
      try {
        tvw.setSource(input.source, function (selected) {
          if (finished) return;
          if (selected && (selected.type !== 'HDMI' || selected.number !== port)) { finish({ message: 'The TV selected a different input. Please try again.' }); return; }
          try {
            app.launch('org.tizen.tv-viewer', function () { finish(null, input); }, function () {
              finish({ message: 'The input was selected, but the TV viewer could not open.', detail: 'Use the remote’s Source control to view the input.' });
            });
          } catch (error) { finish({ message: 'The input was selected, but the TV viewer could not open.' }); }
        }, function (error) { if (!finished) finish(failure(error)); });
      } catch (error) { finish(failure(error)); }
    });
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
  function photoExt(name) {
    var dot = name.lastIndexOf('.'), ext = dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
    return PHOTO_EXT.indexOf(ext) >= 0 ? ext : '';
  }
  function photoNames(files) {
    var names = [];
    (files || []).forEach(function (item) {
      var name = typeof item === 'string' ? item : item && typeof item.name === 'string' ? item.name : '';
      if (name && photoExt(name) && names.indexOf(name) < 0) names.push(name);
    });
    names.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase(), undefined, { numeric: true, sensitivity: 'base' }); });
    return names;
  }
  function fsApi() { return window.tizen && window.tizen.filesystem; }
  function mountedDrives(list) {
    var labels = [];
    (list || []).forEach(function (unit) {
      if (!unit || typeof unit.label !== 'string' || !unit.label) return;
      if (unit.type && unit.type !== 'EXTERNAL') return;
      if (unit.state && unit.state !== 'MOUNTED') return;
      if (labels.indexOf(unit.label) < 0) labels.push(unit.label);
    });
    labels.sort();
    return labels;
  }
  function photoUri(fs, path) {
    var uri = path;
    try { uri = fs.toURI(path) || path; } catch (err) { /* A raw path is a usable image source. */ }
    return String(uri);
  }
  function usbFailure(err) {
    return { message: 'The USB drive could not be read.', detail: err && (err.message || err.name) || 'Try again, or use a drive formatted with JPEG, PNG, WebP or BMP pictures.' };
  }
  function readFolder(fs, path, done) {
    var finished = false;
    function finish(err, names) { if (finished) return; finished = true; done(err, names); }
    try {
      fs.listDirectory(path, function (files) { finish(null, files); },
        function (err) { finish(err || { message: 'The folder could not be read.' }); },
        { includeExtensions: PHOTO_EXT });
    } catch (err) { finish(err); }
  }
  /* Read the picture folder from the first mounted external drive, chosen in a stable label order. */
  function usbPhotos(done) {
    var fs = fsApi();
    if (!fs || typeof fs.listStorages !== 'function' || typeof fs.listDirectory !== 'function') { unavailable(done); return; }
    var finish = bounded(done, 12000);
    function readFolders(drive, folders, at) {
      var folder = folders[at];
      if (folder === undefined) { finish(null, { drive: drive, folder: '', photos: [] }); return; }
      readFolder(fs, drive + '/' + folder, function (err, files) {
        var names = photoNames(files);
        if (!names.length) { readFolders(drive, folders, at + 1); return; }
        finish(null, { drive: drive, folder: folder,
          photos: names.slice(0, PHOTO_LIMIT).map(function (name) { return { name: name, uri: photoUri(fs, drive + '/' + folder + '/' + name) }; }) });
      });
    }
    try {
      fs.listStorages(function (units) {
        var drives = mountedDrives(units);
        if (!drives.length) { finish(null, { drive: '', folder: '', photos: [] }); return; }
        readFolders(drives[0], [PHOTO_DIR, PHOTO_ALT_DIR, ''], 0);
      }, function (err) { finish(usbFailure(err)); });
    } catch (err) { finish(usbFailure(err)); }
  }
  /* Watch for USB insertion/removal so a slideshow can pick a drive up without a restart. */
  function watchStorage(done) {
    var fs = fsApi();
    if (!fs || typeof fs.addStorageStateChangeListener !== 'function' || typeof fs.removeStorageStateChangeListener !== 'function') return function () {};
    var watchId = null, alive = true;
    try { watchId = fs.addStorageStateChangeListener(function (unit) { if (alive && done) done(unit && unit.label ? unit.label : ''); }); }
    catch (err) { return function () {}; }
    return function () {
      if (!alive) return;
      alive = false;
      try { if (watchId !== null && watchId !== undefined) fs.removeStorageStateChangeListener(watchId); } catch (err) { /* The watch is dropped with the app. */ }
    };
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
  window.FrameDevice = { launch: launch, launchApp: launchApp, art: art, home: home, settings: settings, apps: apps, sources: sources, setSource: setSource, cancelSource: cancelSource, usbPhotos: usbPhotos, watchStorage: watchStorage, PHOTO_LIMIT: PHOTO_LIMIT };
}());
