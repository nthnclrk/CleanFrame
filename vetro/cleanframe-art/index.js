/* MIT. Vetro shard; ES5 / Node 4.4. No device action occurs until start(). */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), os = require('os');
var PREF = '/opt/usr/home/owner/apps_rw/org.tizen.art-app/data/.pref/0f61537ef36906f51e0fa75852758b33df2df340';
var PHOTO = '/opt/usr/home/owner/apps_rw/org.tizen.art-app/shared/trusted/data/my_photo/';
var KEY = 'ArtLatestFullScreenData', MAX_PREF = 65536, MAX_IMAGE = 12 * 1024 * 1024;
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
  var pendingHTTP = 0, address = '127.0.0.1';
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
  function handler(req, res) {
    var origin = req.headers.origin, match, closed = false, released = false;
    // Some Frame web runtimes block loopback. When bound to the TV's own
    // interface, accept only connections originating from that exact address.
    if (!localClient(address, req.socket.remoteAddress)) { res.writeHead(403); res.end(); return; }
    if (origin && (origin.length > 256 || !/^(?:null|(?:file|widget|wgt|tizen):\/\/[^\r\n]*)$/.test(origin))) { res.writeHead(403); res.end(); return; }
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
    if (pendingHTTP >= 8) { res.writeHead(503); res.end(); return; }
    pendingHTTP++;
    function release() { if (released) return; released = true; pendingHTTP--; }
    res.once('finish', release); res.once('close', function () { closed = true; release(); });
    if (req.url === '/current.json') {
      refresh().then(function (meta) {
        if (closed) return;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(meta));
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
    running = false; generation++; current = null; revisions = []; lastRead = 0;
    var old = server; server = null; starting = null;
    if (rejectStart) { rejectStart(new Error('Bridge stopped')); rejectStart = null; }
    sockets.slice().forEach(function (socket) { socket.destroy(); });
    return new Promise(function (resolve) { if (old) old.close(resolve); else resolve(); });
  }
  return { start: start, stop: stop,
    status: function () { return { running: running, available: !!current, refreshing: !!inflight, error: lastError ? 'Art unavailable' : null }; },
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
