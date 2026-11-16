/* MIT. Vetro shard; ES5 / Node 4.4. No device action occurs until start(). */
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
function text(s) { return Buffer.from && Buffer.from !== Uint8Array.from ? Buffer.from(s, 'utf8') : new Buffer(s, 'utf8'); }
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
var STREAM_RE = /^http:\/\/(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){2,3}:\d{2,5}\/[A-Za-z0-9\/._?=&%-]{1,200}$/;
function mqttString(s) { var b = text(s), h = bytes(2); h.writeUInt16BE(b.length, 0); return Buffer.concat([h, b]); }
function mqttPacket(type, body) {
  var len = body.length, head = [type];
  do { var d = len % 128; len = Math.floor(len / 128); head.push(len > 0 ? d | 128 : d); } while (len > 0);
  return Buffer.concat([Buffer.from ? Buffer.from(head) : new Buffer(head), body]);
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
  var n = p.body.readUInt16BE(0), topic = p.body.toString('utf8', 2, 2 + n), at = 2 + n + (((p.flags >> 1) & 3) ? 2 : 0);
  return { topic: topic, payload: p.body.toString('utf8', at) };
}
function quote(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }
function unlink(file) { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
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
  var pendingHTTP = 0, address = '127.0.0.1', readSettings = ctx.artSettings || artSettings, look = null, lookAt = 0, lookRead = null, lookError = null;
  var mq = null, mqTimer = null, pipState = { ringing: 0, lastError: null, connected: false };
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
      return parsePreference(Buffer.from ? Buffer.from(value, 'base64') : new Buffer(value, 'base64'));
    });
  }
  function refresh() {
    if (inflight) return inflight;
    if (current && Date.now() - lastRead < 1500) return Promise.resolve(current);
    var g = generation, tmp = path.join(dir, 'copy-' + process.pid + '-' + (++counter) + '.tmp');
    inflight = readPreference().then(function (meta) {
      active(g);
      var source = imagePath(meta.contentId, PHOTO + meta.contentId + '.jpg');
      // No JPEG bytes cross execute stdout. Noclobber, canonical source, bounded copy,
      // private permissions and numeric ownership precede the unprivileged atomic rename.
      var cmd = 'set -e; test ! -L ' + quote(source) + '; test -f ' + quote(source) +
        '; test "$(readlink -f ' + quote(source) + ')" = ' + quote(source) +
        '; test "$(readlink -f ' + quote(dir) + ')" = ' + quote(dir) +
        '; umask 077; set -C; head -c ' + (MAX_IMAGE + 1) + ' ' + quote(source) + ' > ' + quote(tmp) +
        '; chmod 600 ' + quote(tmp) + '; chown ' + process.getuid() + ':' + process.getgid() + ' ' + quote(tmp);
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
      inflight = null; lastError = true; throw new Error('Art unavailable');
    });
    return inflight;
  }
  // Settings are optional and read in the background: Art Mode can take seconds to
  // answer, so current.json never waits. It returns the last good value at once.
  function settings() {
    if (!lookRead && (!lookAt || Date.now() - lookAt > 3000)) {
      var g = generation;
      lookAt = Date.now();
      lookRead = readSettings(8000).then(function (value) {
        lookRead = null; if (running && g === generation) { look = value; lookAt = Date.now(); lookError = null; }
      }, function (e) { lookRead = null; if (running && g === generation) lookError = String(e && e.message || e).slice(0, 80); });
    }
    return look;
  }
  // Home's Lights button: fire the owner's Vetro rule, which publishes MQTT for Home Assistant.
  // A fixed trigger only; the request body is ignored, so callers cannot choose rules or topics.
  var lightsAt = 0;
  function lights(res) {
    var now = Date.now(), req2;
    if (now - lightsAt < 1500) { res.writeHead(429); res.end(); return; }
    lightsAt = now;
    req2 = http.request({ host: '127.0.0.1', port: 8099, path: '/remap/run', method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 5000 }, function (r) {
      var ok = r.statusCode === 200; r.resume();
      res.writeHead(ok ? 204 : 502); res.end();
    });
    req2.on('timeout', function () { req2.abort(); });
    req2.on('error', function () { if (!res.headersSent) { res.writeHead(502); res.end(); } });
    req2.end(JSON.stringify({ type: 'http', value: LIGHTS_TRIGGER }));
  }
  function pipDir() { return path.join(dir, '..', 'pip'); }
  // The overlay ships base64-encoded in the bundle (bundles are text); unpack it once per version.
  function unpackPip() {
    var src = path.join(fs.realpathSync(ctx.dir), 'pip.b64.json'), out = pipDir(), files;
    if (!fs.existsSync(src)) return false;
    files = JSON.parse(fs.readFileSync(src, 'utf8'));
    if (!fs.existsSync(out)) fs.mkdirSync(out, 448);
    if (!fs.existsSync(path.join(out, 'res'))) fs.mkdirSync(path.join(out, 'res'), 448);
    Object.keys(files).forEach(function (name) {
      if (!/^(?:cleanframe-pip\.(?:dll|runtimeconfig\.json)|res\/(?:frame|mask)\.png)$/.test(name)) return;
      var data = Buffer.from ? Buffer.from(files[name], 'base64') : new Buffer(files[name], 'base64'), file = path.join(out, name);
      if (!fs.existsSync(file) || fs.readFileSync(file).toString('base64') !== files[name]) fs.writeFileSync(file, data, { mode: 420 });
    });
    return true;
  }
  function pipConfig() {
    var c = (ctx.config.get() || {}).pip || {};
    return { stream: STREAM_RE.test(c.stream || '') ? c.stream : null, seconds: c.seconds >= 5 && c.seconds <= 600 ? Math.round(c.seconds) : 30 };
  }
  function ring() {
    var c = pipConfig(), d = pipDir(), now = Date.now();
    if (!c.stream || now - pipState.ringing < 3000) return;
    pipState.ringing = now;
    var env = '/usr/bin/env HOME=/home/owner XDG_RUNTIME_DIR=/run WAYLAND_DISPLAY=wayland-0 /usr/bin/dotnet ' + quote(path.join(d, 'cleanframe-pip.dll')) +
      ' --url ' + quote(c.stream) + ' --seconds ' + c.seconds + ' --stop ' + quote(path.join(d, 'stop')) + ' --log ' + quote(path.join(d, 'pip.log'));
    // A ring while it is showing restarts the timer with a fresh window.
    execute('systemctl stop cleanframe-pip >/dev/null 2>&1; rm -f ' + quote(path.join(d, 'stop')) + '; ' +
      'systemd-run --unit=cleanframe-pip --collect -p KillSignal=SIGKILL ' + env + ' >/dev/null 2>&1 || (setsid nohup ' + env + ' </dev/null >/dev/null 2>&1 &); echo ok')
      .then(function () { pipState.lastError = null; }, function () { pipState.lastError = 'PiP start failed'; });
  }
  function clearPip() { try { fs.writeFileSync(path.join(pipDir(), 'stop'), ''); } catch (e) { /* Nothing showing. */ } }
  function mqttConnect() {
    var c, socket, buf = bytes(0), ping = null, g = generation;
    mqTimer = null;
    if (!running || !pipConfig().stream) return;
    try { c = JSON.parse(fs.readFileSync(VETRO_MQTT, 'utf8')); } catch (e) { pipState.lastError = 'No Vetro MQTT settings'; return; }
    if (!c || !c.enabled || typeof c.host !== 'string' || !(c.port > 0 && c.port < 65536)) { pipState.lastError = 'Vetro MQTT is off'; return; }
    function retry() {
      clearInterval(ping); pipState.connected = false;
      if (mq === socket) mq = null;
      if (running && g === generation && !mqTimer) mqTimer = setTimeout(mqttConnect, 10000);
    }
    socket = mq = c.tls ? tls.connect({ host: c.host, port: c.port, ca: c.ca || undefined, servername: c.host }) : net.connect({ host: c.host, port: c.port });
    socket.setTimeout(90000);
    socket.on(c.tls ? 'secureConnect' : 'connect', function () {
      // Own client id: sharing Vetro's would make the broker drop one of the two sessions.
      var flags = 2 | (c.username ? 128 : 0) | (c.password ? 64 : 0), vh = Buffer.concat([mqttString('MQTT'), Buffer.from ? Buffer.from([4, flags, 0, 60]) : new Buffer([4, flags, 0, 60])]);
      var payload = [mqttString('cleanframe-' + crypto.randomBytes(6).toString('hex'))];
      if (c.username) payload.push(mqttString(c.username));
      if (c.password) payload.push(mqttString(c.password));
      socket.write(mqttPacket(16, Buffer.concat([vh].concat(payload))));
      ping = setInterval(function () { socket.write(Buffer.from ? Buffer.from([192, 0]) : new Buffer([192, 0])); }, 30000);
    });
    socket.on('data', function (chunk) {
      var parsed;
      buf = Buffer.concat([buf, chunk]);
      try { parsed = mqttPackets(buf); } catch (e) { socket.destroy(); return; }
      buf = parsed.rest;
      parsed.packets.forEach(function (p) {
        var m;
        if (p.type === 2) {                       // CONNACK
          if (p.body[1] !== 0) { pipState.lastError = 'MQTT refused the login'; socket.destroy(); return; }
          pipState.connected = true; pipState.lastError = null;
          socket.write(mqttPacket(130, Buffer.concat([Buffer.from ? Buffer.from([0, 1]) : new Buffer([0, 1]), mqttString(DOORBELL_TOPIC), Buffer.from ? Buffer.from([0]) : new Buffer([0])])));
        } else if (p.type === 3) {                // PUBLISH
          m = mqttPublish(p);
          if (m.topic !== DOORBELL_TOPIC || (p.flags & 1)) return;   // Retained messages are history, not a ring.
          if (m.payload === 'ring') ring(); else if (m.payload === 'clear') clearPip();
        }
      });
    });
    socket.on('timeout', function () { socket.destroy(); });
    socket.on('error', function () { pipState.connected = false; });
    socket.on('close', retry);
  }
  function handler(req, res) {
    var origin = req.headers.origin, match, closed = false, released = false;
    // Some Frame web runtimes block loopback. When bound to the TV's own
    // interface, accept only connections originating from that exact address.
    if (!localClient(address, req.socket.remoteAddress)) { res.writeHead(403); res.end(); return; }
    if (origin && (origin.length > 256 || !/^(?:null|(?:file|widget|wgt|tizen):\/\/[^\r\n]*)$/.test(origin))) { res.writeHead(403); res.end(); return; }
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url === '/lights' && req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Max-Age': '600' }); res.end(); return; }
    if (req.url === '/lights' && req.method === 'POST') { req.resume(); lights(res); return; }
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
    if (pendingHTTP >= 8) { res.writeHead(503); res.end(); return; }
    pendingHTTP++;
    function release() { if (released) return; released = true; pendingHTTP--; }
    res.once('finish', release); res.once('close', function () { closed = true; release(); });
    if (req.url === '/current.json') {
      refresh().then(function (meta) {
        var value = settings(), body;
        if (closed) return;
        body = { revision: meta.revision, contentId: meta.contentId, imageUrl: meta.imageUrl, width: meta.width, height: meta.height };
        if (value) body.look = value;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body));
      }, function () { if (!closed) { res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"error":"Art unavailable"}'); } });
      return;
    }
    match = /^\/art\/([a-f0-9]{64})\/image\.jpg$/.exec(req.url);
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
    try { address = listenAddress(config); } catch (e) { return Promise.reject(e); }
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, 448);
      var st = fs.lstatSync(dir);
      if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || fs.realpathSync(dir) !== dir) invalid();
      fs.chmodSync(dir, 448);
      fs.readdirSync(dir).forEach(function (name) { if (/^(?:[a-f0-9]{64}\.jpg|copy-[0-9]+-[0-9]+\.tmp)$/.test(name)) unlink(path.join(dir, name)); });
    } catch (e) { return Promise.reject(new Error('Cache unavailable')); }
    running = true; g = ++generation;
    try { unpackPip(); } catch (e) { pipState.lastError = 'PiP unpack failed'; }
    mqttConnect();
    starting = new Promise(function (resolve, reject) {
      rejectStart = reject;
      server = http.createServer(handler); server.timeout = 10000; server.maxConnections = 8;
      server.on('connection', function (socket) { sockets.push(socket); socket.on('close', function () { var i = sockets.indexOf(socket); if (i >= 0) sockets.splice(i, 1); }); });
      server.once('error', function () { if (g === generation) { running = false; server = null; starting = null; rejectStart = null; } reject(new Error('Bridge listen failed')); });
      server.listen(port, address, function () { if (g !== generation) { reject(new Error('Bridge stopped')); return; } rejectStart = null; resolve(); });
    });
    return starting;
  }
  function stop() {
    running = false; generation++; current = null; revisions = []; lastRead = 0; look = null; lookAt = 0; lookRead = null;
    clearTimeout(mqTimer); mqTimer = null; if (mq) { mq.destroy(); mq = null; }
    var old = server; server = null; starting = null;
    if (rejectStart) { rejectStart(new Error('Bridge stopped')); rejectStart = null; }
    sockets.slice().forEach(function (socket) { socket.destroy(); });
    return new Promise(function (resolve) { if (old) old.close(resolve); else resolve(); });
  }
  return { start: start, stop: stop,
    status: function () { return { running: running, available: !!current, refreshing: !!inflight, error: lastError ? 'Art unavailable' : null, look: look, lookError: lookError, doorbell: { listening: pipState.connected, configured: !!pipConfig().stream, error: pipState.lastError } }; },
    route: function (req, res) { res.writeHead(404); res.end(); }
  };
}
module.exports = moduleFactory;
// Pure helpers for offline corruption/path tests; never exposed over HTTP.
module.exports.parsePreference = parsePreference;
module.exports.imagePath = imagePath;
module.exports.jpegSize = jpegSize;
module.exports.localClient = localClient;
module.exports.listenAddress = listenAddress;
module.exports.parseSettings = parseSettings;
module.exports.wsFrames = wsFrames;
module.exports.artHost = artHost;
module.exports.mqttPackets = mqttPackets;
module.exports.mqttPublish = mqttPublish;
module.exports.mqttPacket = mqttPacket;
