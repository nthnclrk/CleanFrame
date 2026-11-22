/* MIT. Vetro shard: ES5 syntax, run by Vetro's Node 12 on the TV. No device action occurs until start(). */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), os = require('os'), net = require('net'), tls = require('tls');
var PREF = '/opt/usr/home/owner/apps_rw/org.tizen.art-app/data/.pref/0f61537ef36906f51e0fa75852758b33df2df340';
var PHOTO = '/opt/usr/home/owner/apps_rw/org.tizen.art-app/shared/trusted/data/my_photo/';
var LIGHTS_TRIGGER = 'cleanframe-lights', KEY = 'ArtLatestFullScreenData', MAX_PREF = 65536, MAX_IMAGE = 12 * 1024 * 1024;
function invalid() { throw new Error('Art unavailable'); }
function imagePath(id, source) {
  if (typeof id !== 'string' || !/^MY_[A-Za-z0-9_]{1,64}$/.test(id) || source !== PHOTO + id + '.jpg') invalid();
  return source;
}
function parsePreference(buf) {
  var offset = 4 + KEY.length, data, c, end;
  if (!Buffer.isBuffer(buf) || buf.length < offset + 6 || buf.length > MAX_PREF || buf.readUInt32LE(0) !== KEY.length ||
      buf.toString('utf8', 4, offset) !== KEY || buf.readUInt32LE(offset) !== 1) invalid();
  // Parse only the typed payload at its documented boundary, never search for a brace.
  end = buf.length - (buf[buf.length - 1] === 0 ? 1 : 0);
  try { data = JSON.parse(buf.toString('utf8', offset + 4, end)); } catch (e) { invalid(); }
  c = data && data.Content;
  if (!c || typeof c !== 'object' || Array.isArray(c)) invalid();
  imagePath(c.ContentID, c.ImagePath);
  if (typeof c.ImageWidth !== 'number' || typeof c.ImageHeight !== 'number' || c.ImageWidth % 1 || c.ImageHeight % 1 ||
      c.ImageWidth < 1 || c.ImageHeight < 1 || c.ImageWidth > 16384 || c.ImageHeight > 16384 || c.ImageWidth * c.ImageHeight > 64000000) invalid();
  // This bridge deliberately handles unfiltered, unmatted uploaded JPEGs only.
  if (c.PhotoFilter !== 'None' || (c.UserMatteType !== '' && c.UserMatteType !== 'none')) invalid();
  return { contentId: c.ContentID, width: c.ImageWidth, height: c.ImageHeight };
}
function jpegSize(buf) {
  var i = 2, marker, n;
  if (buf.length < 12 || buf.length > MAX_IMAGE || buf[0] !== 255 || buf[1] !== 216 || buf[buf.length - 2] !== 255 || buf[buf.length - 1] !== 217) invalid();
  while (i < buf.length - 2) {
    if (buf[i++] !== 255) invalid();
    while (buf[i] === 255) i++;
    marker = buf[i++];
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || marker >= 208 && marker <= 215) continue;
    if (i + 2 > buf.length) invalid();
    n = buf.readUInt16BE(i);
    if (n < 2 || i + n > buf.length) invalid();
    if ([192,193,194].indexOf(marker) >= 0) {
      if (n < 8) invalid();
      return { height: buf.readUInt16BE(i + 3), width: buf.readUInt16BE(i + 5) };
    }
    i += n;
  }
  invalid();
}
function bytes(n) { return Buffer.alloc ? Buffer.alloc(n) : new Buffer(n); }
// The one way this shard makes a Buffer from a string or byte list.
function buffer(v, encoding) { return Buffer.from && Buffer.from !== Uint8Array.from ? Buffer.from(v, encoding) : new Buffer(v, encoding); }
function text(s) { return buffer(s, 'utf8'); }
// Minimal masked client text frame (RFC 6455).
function wsFrame(s) {
  var payload = text(s), n = payload.length, head = bytes(n < 126 ? 2 : 4), mask = crypto.randomBytes(4), body = bytes(n), i;
  head[0] = 129;
  if (n < 126) head[1] = 128 | n; else { head[1] = 254; head.writeUInt16BE(n, 2); }
  for (i = 0; i < n; i++) body[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([head, mask, body]);
}
function wsFrames(buf) {
  var out = [], len, off;
  for (;;) {
    if (buf.length < 2) break;
    len = buf[1] & 127; off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = buf.readUInt32BE(6); off = 10; }
    if (len > 65536) invalid();
    if (buf.length < off + len) break;
    out.push({ opcode: buf[0] & 15, data: buf.slice(off, off + len) }); buf = buf.slice(off + len);
  }
  return { frames: out, rest: buf };
}
// Only the two whole-number picture values are kept from the Art API reply.
function parseSettings(list) {
  var look = {}, ranges = { brightness: [0, 10, 'brightness'], color_temperature: [-5, 5, 'colorTemperature'] };
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { invalid(); } }
  if (!Array.isArray(list)) invalid();
  list.forEach(function (item) {
    var r = item && ranges[item.item], v;
    if (!r) return;
    v = Number(item.value);
    if (typeof item.value !== 'string' && typeof item.value !== 'number' || !isFinite(v) || v % 1 || v < r[0] || v > r[1]) return;
    look[r[2]] = v;
  });
  if (look.colorTemperature === undefined) invalid();
  return look;
}
function artHost(data) {
  var self = data && data.id, found = null;
  ((data && data.clients) || []).forEach(function (c) {
    if (!found && c && c.isHost && c.id !== self && typeof c.id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(c.id) && !(c.attributes && c.attributes.name)) found = c.id;
  });
  return found;
}
// Read-only Art Mode picture settings from the TV's own Art channel (port 8001,
// no pairing token). One short-lived connection; nothing is ever written.
function artSettings(timeoutMs) {
  return new Promise(function (resolve, reject) {
    var stage = 'connect', target = 'host', socket, buf = bytes(0), upgraded = false, done = false, sent = false, id = crypto.randomBytes(16).toString('hex'), timer;
    function finish(err, value) {
      if (done) return; done = true; clearTimeout(timer);
      try { socket.destroy(); } catch (e) { /* closed */ }
      if (err) reject(new Error('Art settings unavailable (' + stage + ')')); else resolve(value);
    }
    function send() {
      if (sent) return; sent = true; stage = 'reply';
      socket.write(wsFrame(JSON.stringify({ method: 'ms.channel.emit', params: { event: 'art_app_request', to: target,
        data: JSON.stringify({ request: 'get_artmode_settings', id: id, request_id: id }) } })));
    }
    timer = setTimeout(function () { finish(true); }, timeoutMs || 8000);
    socket = net.connect({ host: '127.0.0.1', port: 8001 }, function () {
      socket.write('GET /api/v2/channels/com.samsung.art-app?name=' + text('CleanFrame').toString('base64') + ' HTTP/1.1\r\nHost: 127.0.0.1:8001\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    socket.on('error', function () { finish(true); });
    socket.on('close', function () { finish(true); });
    socket.on('data', function (chunk) {
      var end, parsed;
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 262144) { finish(true); return; }
      if (!upgraded) {
        end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        if (!/^HTTP\/1\.1 101/.test(buf.toString('utf8', 0, end))) { finish(true); return; }
        upgraded = true; stage = 'ready'; buf = buf.slice(end + 4);
      }
      try { parsed = wsFrames(buf); } catch (e) { finish(true); return; }
      buf = parsed.rest;
      parsed.frames.forEach(function (f) {
        var msg, payload;
        if (done || f.opcode !== 1) return;
        try { msg = JSON.parse(f.data.toString('utf8')); } catch (e) { return; }
        if (msg.event === 'ms.channel.ready') send();
        else if (msg.event === 'ms.channel.connect') {
          // On the TV itself this client is also flagged as a host, so address the Art app's own client.
          target = artHost(msg.data) || 'host';
          setTimeout(send, 400);
        }
        else if (msg.event === 'd2d_service_message') {
          try { payload = JSON.parse(msg.data); } catch (e) { return; }
          if (!payload || payload.request_id !== id && payload.id !== id) return;
          if (payload.event !== 'get_artmode_settings') { stage = 'reply ' + String(payload.event).slice(0, 40); finish(true); return; }
          try { finish(null, parseSettings(payload.data)); } catch (e) { finish(true); }
        }
      });
    });
  });
}
/* ---------- Doorbell picture-in-picture ----------
   Listens to Home Assistant over MQTT with Vetro's saved broker login, and on a ring starts
   the bundled native overlay (pip/cleanframe-pip.dll) above whatever is playing. */
var VETRO_MQTT = '/opt/usr/home/owner/share/vetro-mqtt.json', DOORBELL_TOPIC = 'vetro/cleanframe/doorbell';
var PIP_DLL = 'cleanframe-pip.dll', PIP_CONFIG = 'cleanframe-pip.runtimeconfig.json', PIP_FILE = /^(?:cleanframe-pip\.(?:dll|runtimeconfig\.json)|res\/(?:frame|mask)\.png)$/;
var STREAM_RE = /^http:\/\/(?:10(?:\.\d{1,3}){3}|(?:192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){2}):\d{2,5}\/[A-Za-z0-9\/._?=&%-]{1,200}$/;
function mqttString(s) { var b = text(s), h = bytes(2); h.writeUInt16BE(b.length, 0); return Buffer.concat([h, b]); }
function mqttPacket(type, body) {
  var len = body.length, head = [type];
  do { var d = len % 128; len = Math.floor(len / 128); head.push(len > 0 ? d | 128 : d); } while (len > 0);
  return Buffer.concat([buffer(head), body]);
}
// Complete MQTT packets in buf: [{type, flags, body}], plus the unread rest.
function mqttPackets(buf) {
  var out = [], i, mult, len, pos;
  for (;;) {
    if (buf.length < 2) break;
    len = 0; mult = 1; pos = 1;
    do { if (pos >= buf.length) return { packets: out, rest: buf }; i = buf[pos++]; len += (i & 127) * mult; mult *= 128; if (mult > 2097152) invalid(); } while (i & 128);
    if (len > 65536) invalid();
    if (buf.length < pos + len) break;
    out.push({ type: buf[0] >> 4, flags: buf[0] & 15, body: buf.slice(pos, pos + len) });
    buf = buf.slice(pos + len);
  }
  return { packets: out, rest: buf };
}
// Topic and payload of a PUBLISH body (QoS from the fixed-header flags).
function mqttPublish(p) {
  var body = p.body, n, at;
  if (!Buffer.isBuffer(body) || body.length < 2) invalid();
  n = body.readUInt16BE(0); at = 2 + n + (((p.flags >> 1) & 3) ? 2 : 0);
  if (at > body.length) invalid();
  return { topic: body.toString('utf8', 2, 2 + n), payload: body.toString('utf8', at) };
}
function quote(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }
// A private directory owned by this process: created 0700, never a symlink or another
// user's, canonical, and re-chmodded on every use.
function privateDir(d) {
  var st;
  if (!fs.existsSync(d)) fs.mkdirSync(d, 448);
  st = fs.lstatSync(d);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || fs.realpathSync(d) !== d) invalid();
  fs.chmodSync(d, 448);
}
function unlink(file) { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
// Optional shared secret (private config `key`): printable ASCII, 24 to 256 characters.
// Only its SHA-256 is kept, so the per-request comparison is always on equal-length buffers.
function bridgeKey(config) {
  var k = config.key;
  if (k === undefined || k === null || k === '') return null;
  if (typeof k !== 'string' || k.length < 24 || k.length > 256 || /[^\x21-\x7e]/.test(k)) throw new Error('Invalid bridge key');
  return crypto.createHash('sha256').update(k, 'utf8').digest();
}
function keyMatches(digest, given) {
  if (!digest) return true;
  if (typeof given !== 'string' || given.length > 1024) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(given, 'utf8').digest(), digest);
}
// A regular expression for pkill -f that matches only a process started as `dotnet <dll> ...`.
// It is anchored at the command's start so the root shell running the ring command never matches itself.
function pkillPattern(dll) { return '^[^ ]*dotnet ' + dll.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + '( |$)'; }
function localClient(address, remote) { return String(remote || '').replace(/^::ffff:/, '') === address; }
function listenAddress(config) {
  var address = config.address || '127.0.0.1', interfaces = os.networkInterfaces(), found = address === '127.0.0.1';
  Object.keys(interfaces).forEach(function (name) { (interfaces[name] || []).forEach(function (info) {
    if ((info.family === 'IPv4' || info.family === 4) && info.address === address) found = true;
  }); });
  if (!found || address === '0.0.0.0') throw new Error('Invalid bridge address');
  return address;
}
function moduleFactory(ctx) {
  var dir = path.join(fs.realpathSync(ctx.dir), 'art-cache'), server = null, sockets = [], current = null, revisions = [], running = false;
  var pendingHTTP = 0, address = '127.0.0.1', keyDigest = null, readSettings = ctx.artSettings || artSettings;
  var look = null, lookAt = 0, lookTried = 0, lookRead = null, lookError = null;
  var mq = null, mqTimer = null, mqPing = null, pipHashes = null, pipState = { ringing: 0, lastError: null, installError: null, connected: false };
  // Overridable only by the offline test harness; Vetro passes none of these.
  var mqttFile = ctx.vetroMqttPath || VETRO_MQTT, mqttRetry = ctx.mqttRetryMs || 10000, mqttConfigRetry = ctx.mqttConfigRetryMs || 60000;
  var reuseMs = ctx.reuseMs || 1500, lookMaxAge = ctx.lookMaxAgeMs || 3000, lookWait = ctx.lookWaitMs || 800;
  var lightsInterval = ctx.lightsIntervalMs || 1500, ringInterval = ctx.ringIntervalMs || 3000;
  var inflight = null, starting = null, rejectStart = null, generation = 0, counter = 0, lastRead = 0, lastError = false;
  function active(g) { if (!running || g !== generation) invalid(); }
  function execute(cmd) {
    return Promise.resolve().then(function () { return ctx.execute(cmd, 4000); }).then(function (r) {
      if (!r || r.exit_code !== 0 || r.timed_out || typeof r.stdout !== 'string' || r.stdout.length > 100000) invalid();
      return r.stdout;
    });
  }
  function readPreference() {
    return execute('head -c ' + (MAX_PREF + 1) + ' ' + quote(PREF) + ' | base64').then(function (out) {
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(out)) invalid();
      var value = out.replace(/[\r\n]/g, '');
      return parsePreference(buffer(value, 'base64'));
    });
  }
  function refresh() {
    if (inflight) return inflight;
    if (current && Date.now() - lastRead < reuseMs) return Promise.resolve(current);
    var g = generation, tmp = path.join(dir, 'copy-' + process.pid + '-' + (++counter) + '.tmp');
    inflight = readPreference().then(function (meta) {
      active(g);
      // Same selection as last time: reuse the cached JPEG instead of copying 4K bytes again.
      // Each upload gets a new content ID, so an unchanged ID and size means an unchanged image.
      if (current && current.contentId === meta.contentId && current.width === meta.width && current.height === meta.height &&
          fs.existsSync(path.join(dir, current.revision + '.jpg'))) { lastRead = Date.now(); lastError = false; return current; }
      var source = imagePath(meta.contentId, PHOTO + meta.contentId + '.jpg');
      // No JPEG bytes cross execute stdout. Noclobber, canonical source, bounded copy,
      // private permissions and numeric ownership precede the unprivileged atomic rename.
      var cmd = 'set -e; test ! -L ' + quote(source) + '; test -f ' + quote(source) +
        '; test "$(readlink -f ' + quote(source) + ')" = ' + quote(source) +
        '; test "$(readlink -f ' + quote(dir) + ')" = ' + quote(dir) +
        '; umask 077; set -C; head -c ' + (MAX_IMAGE + 1) + ' ' + quote(source) + ' > ' + quote(tmp) +
        // umask already made it 600; chown -h never follows a symlink swapped in after the copy.
        '; chown -h ' + process.getuid() + ':' + process.getgid() + ' ' + quote(tmp);
      return execute(cmd).then(function () {
        active(g);
        var st = fs.lstatSync(tmp), bytes, size, revision, dest;
        if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_IMAGE || st.uid !== process.getuid() || (st.mode & 63)) invalid();
        bytes = fs.readFileSync(tmp); size = jpegSize(bytes);
        if (size.width !== meta.width || size.height !== meta.height) invalid();
        revision = crypto.createHash('sha256').update(JSON.stringify(meta)).update(bytes).digest('hex');
        dest = path.join(dir, revision + '.jpg');
        // Re-read the preference after copying: don't publish a mixed selection.
        return readPreference().then(function (after) {
          active(g);
          if (JSON.stringify(meta) !== JSON.stringify(after)) invalid();
          if (revisions.indexOf(revision) < 0) { fs.renameSync(tmp, dest); revisions.push(revision); }
          else unlink(tmp);
          current = { revision: revision, contentId: meta.contentId, imageUrl: '/art/' + revision + '/image.jpg', width: meta.width, height: meta.height };
          while (revisions.length > 2) unlink(path.join(dir, revisions.shift() + '.jpg'));
          lastRead = Date.now(); lastError = false;
          return current;
        });
      });
    }).then(function (result) { unlink(tmp); inflight = null; return result; }, function () {
      // Never return stale current metadata as a successful refresh, or leak exec output.
      try { unlink(tmp); } catch (e) { /* A later start removes owned cache debris. */ }
      inflight = null; if (g === generation) lastError = true; throw new Error('Art unavailable');
    });
    return inflight;
  }
  // Art picture settings are optional. At most one read runs at a time, and a new one starts
  // at most 3 s after the previous one finished. Returns the read in flight (it never rejects), or null.
  function settings() {
    var g = generation, read;
    if (!lookRead && (!lookTried || Date.now() - lookTried > lookMaxAge)) {
      lookTried = Date.now();
      read = lookRead = Promise.resolve().then(function () { return readSettings(8000); }).then(function (value) {
        if (running && g === generation) { look = value; lookAt = Date.now(); lookError = null; }
      }, function (e) { if (running && g === generation) lookError = String(e && e.message || e).slice(0, 80); })
        .then(function () { if (lookRead === read) { lookRead = null; lookTried = Date.now(); } });
    }
    return lookRead;
  }
  // When the last good look is over 3 s old, current.json waits up to 800 ms for the read in
  // flight, so a just-changed Art brightness or colour temperature shows on the first request.
  // A slower Art channel never holds the reply longer; the last known look (or none) is used.
  function freshLook() {
    var pending = settings();
    if (!pending || (lookAt && Date.now() - lookAt <= lookMaxAge)) return Promise.resolve();
    return new Promise(function (resolve) {
      var timer = setTimeout(resolve, lookWait);
      pending.then(function () { clearTimeout(timer); resolve(); });
    });
  }
  // Home's Lights button: fire the owner's Vetro rule, which publishes MQTT for Home Assistant.
  // A fixed trigger only; the request body is ignored, so callers cannot choose rules or topics.
  // The 1.5 s limit starts only after Vetro accepted the rule: a press right after a failure
  // tries again instead of reading as success. A press while one is still running gets 429.
  var lightsAt = 0, lightsBusy = false, vetroPort = ctx.vetroPort || 8099, lightsTimeout = ctx.lightsTimeoutMs || 5000;
  function lights(res) {
    var req2, timer, answered = false, g = generation;
    if (lightsBusy || (lightsAt && Date.now() - lightsAt < lightsInterval)) { res.writeHead(429); res.end(); return; }
    lightsBusy = true;
    function answer(status) {
      if (answered) return; answered = true; clearTimeout(timer);
      if (g === generation) { lightsBusy = false; if (status === 204) lightsAt = Date.now(); }
      res.writeHead(status); res.end();
    }
    req2 = http.request({ host: '127.0.0.1', port: vetroPort, path: '/remap/run', method: 'POST', headers: { 'Content-Type': 'application/json' } }, function (r) {
      r.resume(); answer(r.statusCode >= 200 && r.statusCode < 300 ? 204 : 502);
    });
    // An explicit wall-clock limit: a stalled Vetro never leaves the button hanging.
    timer = setTimeout(function () { answer(502); req2.abort(); }, lightsTimeout);
    req2.on('error', function () { answer(502); });
    req2.end(JSON.stringify({ type: 'http', value: LIGHTS_TRIGGER }));
  }
  function pipDir() { return path.join(dir, '..', 'pip'); }
  // The overlay ships base64-encoded in the bundle (bundles are text). Root runs it, so it is
  // unpacked with the art cache's checks and each file's sha256 is kept for the root command to verify.
  function unpackPip() {
    var src = path.join(fs.realpathSync(ctx.dir), 'pip.b64.json'), out = pipDir(), files, hashes = {};
    pipHashes = null;
    if (!fs.existsSync(src)) return false;
    files = JSON.parse(fs.readFileSync(src, 'utf8'));
    if (!files || typeof files !== 'object') invalid();
    privateDir(out); privateDir(path.join(out, 'res'));
    Object.keys(files).forEach(function (name) {
      if (!PIP_FILE.test(name) || typeof files[name] !== 'string') return;
      var data = buffer(files[name], 'base64'), file = path.join(out, name), tmp = file + '.' + process.pid + '.tmp', st = null;
      try { st = fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (st && (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid())) { unlink(file); st = null; }
      if (!st || !fs.readFileSync(file).equals(data)) {
        unlink(tmp);
        fs.writeFileSync(tmp, data, { mode: 384, flag: 'wx' });
        fs.chmodSync(tmp, 384); fs.renameSync(tmp, file);
      }
      fs.chmodSync(file, 384);
      hashes[name] = crypto.createHash('sha256').update(data).digest('hex');
    });
    if (!hashes[PIP_DLL] || !hashes[PIP_CONFIG]) return false;
    pipHashes = hashes;
    return true;
  }
  function pipConfig() {
    var c = (ctx.config.get() || {}).pip || {};
    return { stream: STREAM_RE.test(c.stream || '') ? c.stream : null, seconds: c.seconds >= 5 && c.seconds <= 600 ? Math.round(c.seconds) : 30 };
  }
  // The root command that (re)starts the overlay. It fails closed: unless every unpacked file
  // still has the hash recorded at unpack time, nothing runs and the exit status is non-zero.
  // Root copies the PiP into a root-only folder, verifies the copies there and runs (and logs)
  // only from there, so nothing writable by the shard's user is executed or appended to by root.
  // Only the stop flag stays in the shard's folder: root (the overlay) only checks whether it
  // exists, and the shard itself removes it before each ring, so root deletes nothing there.
  // Before starting it stops both a systemd-run overlay and a fallback setsid one (pkill, when
  // present), and keeps the previous run's log as pip.log.1.
  var PIP_ROOT = '/run/cleanframe-pip', HOME_ROOT = '/run/cleanframe-home';
  // Stops the unit (and a fallback setsid run from the same root), copies and verifies the
  // unpacked files into root's folder, then starts the program there with its own arguments.
  function rootRun(unit, root, d, hashes, args, systemd) {
    var names = Object.keys(hashes).sort(), log = path.join(root, unit.replace('cleanframe-', '') + '.log');
    var run = '/usr/bin/env HOME=/home/owner XDG_RUNTIME_DIR=/run WAYLAND_DISPLAY=wayland-0 /usr/bin/dotnet ' + quote(path.join(root, PIP_DLL)) + ' ' + args + ' --log ' + quote(log);
    var copy = 'test ! -L ' + quote(root) + '; mkdir -p ' + quote(path.join(root, 'res')) + '; test ! -L ' + quote(path.join(root, 'res')) +
      '; chmod 700 ' + quote(root) + ' ' + quote(path.join(root, 'res')) + '; rm -f ' + names.map(function (name) { return quote(path.join(root, name)); }).join(' ') +
      '; if test -f ' + quote(log) + '; then mv -f ' + quote(log) + ' ' + quote(log + '.1') + '; fi; ' + names.map(function (name) {
      return 'cat ' + quote(path.join(d, name)) + ' > ' + quote(path.join(root, name));
    }).join('; ');
    var verify = names.map(function (name) {
      var file = quote(path.join(root, name));
      return 'test -f ' + file + '; test "$(cfsum ' + file + ')" = ' + hashes[name];
    }).join('; ');
    return 'set -e; umask 077; cfsum() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else openssl dgst -sha256 -r "$1"; fi | cut -c1-64; }; ' +
      stopRun(unit, root) + '; ' + copy + '; ' + verify + '; ' +
      'systemd-run --unit=' + unit + ' --collect ' + systemd + ' ' + run + ' >/dev/null 2>&1 || (setsid nohup ' + run + ' </dev/null >/dev/null 2>&1 &)';
  }
  function stopRun(unit, root) {
    return 'systemctl stop ' + unit + ' >/dev/null 2>&1 || true; ' +
      'if command -v pkill >/dev/null 2>&1; then pkill -f ' + quote(pkillPattern(path.join(root, PIP_DLL))) + ' >/dev/null 2>&1 || true; fi';
  }
  // A ring while it is showing restarts the timer with a fresh window.
  function ringCommand(c, d, hashes) {
    return rootRun('cleanframe-pip', ctx.pipRoot || PIP_ROOT, d, hashes,
      '--url ' + quote(c.stream) + ' --seconds ' + c.seconds + ' --stop ' + quote(path.join(d, 'stop')), '-p KillSignal=SIGKILL');
  }
  /* ---------- Home key ----------
     With private config home.app set, the same program runs in Home mode from its own root
     folder: it claims the remote's Home key, so Samsung's Home never flashes up, and opens the
     app. systemd restarts it if it dies; stopping the bridge stops it and Samsung gets the key back. */
  // A start can fail when the bridge comes up before Vetro's root shell has reconnected (after a
  // TV restart or a Vetro update), so a failed start is tried again until it works.
  var homeState = { running: false, error: null }, homeTimer = null, homeRetry = ctx.homeRetryMs || 5000, homeWait = homeRetry;
  function homeConfig() {
    var app = ((ctx.config.get() || {}).home || {}).app;
    return typeof app === 'string' && /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{1,64}$/.test(app) ? app : null;
  }
  function homeStart() {
    var app = homeConfig(), g = generation;
    homeTimer = null; homeState.running = false; homeState.error = null;
    if (!app) return Promise.resolve(false);
    if (!pipHashes) { homeState.error = 'Home helper not installed'; return Promise.resolve(false); }
    return execute(rootRun('cleanframe-home', ctx.homeRoot || HOME_ROOT, pipDir(), pipHashes, '--home ' + quote(app), '-p Restart=always -p RestartSec=2 -p KillSignal=SIGKILL'))
      .then(function () { if (g === generation) { homeState.running = true; homeWait = homeRetry; } return true; },
        function () {
          if (g !== generation) return false;
          homeState.error = 'Home helper start failed';
          if (running && !homeTimer) { homeTimer = setTimeout(homeStart, homeWait); homeWait = Math.min(homeWait * 2, 60000); }
          return false;
        });
  }
  function homeStop() {
    var was = homeState.running || !!homeConfig();
    clearTimeout(homeTimer); homeTimer = null; homeWait = homeRetry;
    homeState.running = false;
    return was ? execute(stopRun('cleanframe-home', ctx.homeRoot || HOME_ROOT)).catch(function () { /* Best effort. */ }) : Promise.resolve();
  }
  function ring() {
    var c = pipConfig(), d = pipDir(), now = Date.now(), hashes = pipHashes;
    if (!c.stream) return null;
    if (!hashes || !hashes[PIP_DLL] || !fs.existsSync(path.join(d, PIP_DLL))) { pipState.lastError = 'PiP not installed'; return null; }
    if (now - pipState.ringing < ringInterval) return null;
    pipState.ringing = now;
    // A clear from the last ring must not close this one. If it cannot be removed, the overlay
    // closes at once and the next ring tries again.
    try { unlink(path.join(d, 'stop')); } catch (e) { pipState.lastError = 'PiP stop flag stuck'; }
    return execute(ringCommand(c, d, hashes))
      .then(function () { pipState.lastError = null; return true; }, function () { pipState.lastError = 'PiP start failed'; return false; });
  }
  function clearPip() { try { fs.writeFileSync(path.join(pipDir(), 'stop'), ''); } catch (e) { /* Nothing showing. */ } }
  function scheduleMqtt(ms) { if (running && !mqTimer) mqTimer = setTimeout(mqttConnect, ms); }
  function mqttStop() {
    var socket = mq;
    clearTimeout(mqTimer); mqTimer = null; clearInterval(mqPing); mqPing = null; mq = null; pipState.connected = false;
    if (socket) socket.destroy();
  }
  function mqttConnect() {
    var c, socket, buf = bytes(0), ping = null, g = generation;
    mqTimer = null;
    if (!running || mq) return;
    // Settings may appear later (Vetro's MQTT turned on, pip.stream added): check again while running.
    if (!pipConfig().stream) { scheduleMqtt(mqttConfigRetry); return; }
    try { c = JSON.parse(fs.readFileSync(mqttFile, 'utf8')); } catch (e) { pipState.lastError = 'No Vetro MQTT settings'; scheduleMqtt(mqttConfigRetry); return; }
    if (!c || !c.enabled || typeof c.host !== 'string' || !(c.port > 0 && c.port < 65536)) { pipState.lastError = 'Vetro MQTT is off'; scheduleMqtt(mqttConfigRetry); return; }
    function retry() {
      clearInterval(ping); if (mqPing === ping) mqPing = null;
      if (mq !== socket) return;          // Already stopped or replaced.
      mq = null; pipState.connected = false;
      if (running && g === generation) scheduleMqtt(mqttRetry);
    }
    socket = mq = c.tls ? tls.connect({ host: c.host, port: c.port, ca: c.ca || undefined, servername: c.host }) : net.connect({ host: c.host, port: c.port });
    socket.setTimeout(90000);
    socket.on(c.tls ? 'secureConnect' : 'connect', function () {
      // Own client id: sharing Vetro's would make the broker drop one of the two sessions.
      var flags = 2 | (c.username ? 128 : 0) | (c.password ? 64 : 0), vh = Buffer.concat([mqttString('MQTT'), buffer([4, flags, 0, 60])]);
      var payload = [mqttString('cleanframe-' + crypto.randomBytes(6).toString('hex'))];
      if (c.username) payload.push(mqttString(c.username));
      if (c.password) payload.push(mqttString(c.password));
      socket.write(mqttPacket(16, Buffer.concat([vh].concat(payload))));
      clearInterval(ping);
      ping = mqPing = setInterval(function () { socket.write(buffer([192, 0])); }, 30000);
    });
    socket.on('data', function (chunk) {
      var parsed;
      // Any malformed packet drops this connection (and reconnects later); it never throws into Vetro.
      try {
        buf = Buffer.concat([buf, chunk]);
        parsed = mqttPackets(buf);
        buf = parsed.rest;
        parsed.packets.forEach(function (p) {
          var m;
          if (mq !== socket) return;
          if (p.type === 2) {                       // CONNACK
            if (p.body.length < 2 || p.body[1] !== 0) { pipState.lastError = 'MQTT refused the login'; socket.destroy(); return; }
            pipState.connected = true; pipState.lastError = null;
            socket.write(mqttPacket(130, Buffer.concat([buffer([0, 1]), mqttString(DOORBELL_TOPIC), buffer([0])])));
          } else if (p.type === 3) {                // PUBLISH
            m = mqttPublish(p);
            if (m.topic !== DOORBELL_TOPIC || (p.flags & 1)) return;   // Retained messages are history, not a ring.
            if (m.payload === 'ring') ring(); else if (m.payload === 'clear') clearPip();
          }
        });
      } catch (e) { socket.destroy(); }
    });
    socket.on('timeout', function () { socket.destroy(); });
    socket.on('error', function () { pipState.connected = false; pipState.lastError = 'MQTT connection failed'; });
    socket.on('close', retry);
  }
  function handler(req, res) {
    var origin = req.headers.origin, match, allow, closed = false, released = false;
    // Some Frame web runtimes block loopback. When bound to the TV's own
    // interface, accept only connections originating from that exact address.
    if (!localClient(address, req.socket.remoteAddress)) { res.writeHead(403); res.end(); return; }
    if (origin && (origin.length > 256 || !/^(?:null|(?:file|widget|wgt|tizen):\/\/[^\r\n]*)$/.test(origin))) { res.writeHead(403); res.end(); return; }
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin, X-CleanFrame-Key'); res.setHeader('X-Content-Type-Options', 'nosniff');
    match = /^\/art\/([a-f0-9]{64})\/image\.jpg$/.exec(req.url);
    allow = req.url === '/lights' ? 'POST' : req.url === '/current.json' || match ? 'GET' : null;
    // CORS preflight carries no key; it only says which method and header the real request may use.
    if (req.method === 'OPTIONS' && allow) {
      res.writeHead(204, { 'Access-Control-Allow-Methods': allow, 'Access-Control-Allow-Headers': 'X-CleanFrame-Key', 'Access-Control-Max-Age': '600' }); res.end(); return;
    }
    // With a configured key, every other request must carry it: other pages in the TV's own
    // browser are also local clients with an opaque origin.
    if (!keyMatches(keyDigest, req.headers['x-cleanframe-key'])) { req.resume(); res.writeHead(403); res.end(); return; }
    if (req.url === '/lights' && req.method === 'POST') { req.resume(); lights(res); return; }
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
    if (pendingHTTP >= 8) { res.writeHead(503); res.end(); return; }
    pendingHTTP++;
    function release() { if (released) return; released = true; pendingHTTP--; }
    res.once('finish', release); res.once('close', function () { closed = true; release(); });
    if (req.url === '/current.json') {
      var lookReady = freshLook();
      refresh().then(function (meta) { return lookReady.then(function () { return meta; }); }).then(function (meta) {
        var value = look, body;
        if (closed) return;
        body = { revision: meta.revision, contentId: meta.contentId, imageUrl: meta.imageUrl, width: meta.width, height: meta.height };
        if (value) body.look = value;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body));
      }, function () { if (!closed) { res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"error":"Art unavailable"}'); } });
      return;
    }
    if (!match || revisions.indexOf(match[1]) < 0) { res.writeHead(404); res.end(); return; }
    fs.open(path.join(dir, match[1] + '.jpg'), 'r', function (err, fd) {
      if (closed) { if (!err) fs.close(fd, function () {}); return; }
      if (err) { res.writeHead(404); res.end(); return; }
      // An open descriptor remains immutable even when a newer refresh evicts it.
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
      var stream = fs.createReadStream(null, { fd: fd });
      stream.on('error', function () { res.destroy(); }); res.on('close', function () { stream.destroy(); }); stream.pipe(res);
    });
  }
  function start() {
    if (running) return starting || Promise.resolve();
    if (inflight) return inflight.then(start, start);
    var config = ctx.config.get() || {}, configured = config.port;
    var port = Number(configured === undefined || configured === null || configured === '' ? 8643 : configured), g;
    if (!isFinite(port) || port % 1 || port < 1024 || port > 65535) return Promise.reject(new Error('Invalid bridge port'));
    try { address = listenAddress(config); keyDigest = bridgeKey(config); } catch (e) { return Promise.reject(e); }
    try {
      privateDir(dir);
      fs.readdirSync(dir).forEach(function (name) { if (/^(?:[a-f0-9]{64}\.jpg|copy-[0-9]+-[0-9]+\.tmp)$/.test(name)) unlink(path.join(dir, name)); });
    } catch (e) { return Promise.reject(new Error('Cache unavailable')); }
    running = true; g = ++generation;
    pipState.installError = null;
    try { unpackPip(); } catch (e) { pipHashes = null; pipState.installError = 'PiP unpack failed'; }
    starting = new Promise(function (resolve, reject) {
      rejectStart = reject;
      server = http.createServer(handler); server.timeout = 10000; server.maxConnections = 8;
      server.on('connection', function (socket) { sockets.push(socket); socket.on('close', function () { var i = sockets.indexOf(socket); if (i >= 0) sockets.splice(i, 1); }); });
      server.once('error', function () { if (g === generation) { running = false; mqttStop(); server = null; starting = null; rejectStart = null; } reject(new Error('Bridge listen failed')); });
      server.listen(port, address, function () { if (g !== generation) { reject(new Error('Bridge stopped')); return; } rejectStart = null; mqttConnect(); homeStart(); resolve(); });
    });
    return starting;
  }
  function stop() {
    running = false; generation++; current = null; revisions = []; lastRead = 0; lastError = false; lookError = null; look = null; lookAt = 0; lookTried = 0; lookRead = null; lightsBusy = false;
    mqttStop(); homeStop();
    var old = server; server = null; starting = null;
    if (rejectStart) { rejectStart(new Error('Bridge stopped')); rejectStart = null; }
    sockets.slice().forEach(function (socket) { socket.destroy(); });
    return new Promise(function (resolve) { if (old) old.close(resolve); else resolve(); });
  }
  return { start: start, stop: stop,
    status: function () { return { running: running, keyed: !!keyDigest, available: !!current, refreshing: !!inflight, error: lastError ? 'Art unavailable' : null, look: look, lookError: lookError, doorbell: { listening: pipState.connected, configured: !!pipConfig().stream, error: pipState.installError || pipState.lastError }, home: { configured: !!homeConfig(), running: homeState.running, error: homeState.error } }; },
    route: function (req, res) { res.writeHead(404); res.end(); },
    // Offline harness hooks; Vetro never calls these.
    _test: { unpackPip: unpackPip, ring: ring, homeStart: homeStart, homeRetrying: function () { return !!homeTimer; }, pipDir: pipDir, pipHashes: function () { return pipHashes; }, mqttTimers: function () { return { retry: !!mqTimer, ping: !!mqPing, socket: !!mq }; } }
  };
}
module.exports = moduleFactory;
// Pure helpers for offline corruption/path tests; never exposed over HTTP.
module.exports.parsePreference = parsePreference;
module.exports.imagePath = imagePath;
module.exports.jpegSize = jpegSize;
module.exports.localClient = localClient;
module.exports.pkillPattern = pkillPattern;
module.exports.listenAddress = listenAddress;
module.exports.parseSettings = parseSettings;
module.exports.wsFrames = wsFrames;
module.exports.artHost = artHost;
module.exports.mqttPackets = mqttPackets;
module.exports.mqttPublish = mqttPublish;
module.exports.mqttPacket = mqttPacket;
