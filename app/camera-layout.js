/* Camera tile placement for CleanFrame's Cameras view: pure functions of the cameras' shapes
   (width / height), on the 1920 x 1080 stage. Exposed as window.FrameCameraLayout. */
(function () {
  'use strict';
  var CAM_BOX = { x: 80, y: 168, w: 1760, h: 808 }, CAM_GAP = 24;
  /* Tiles keep each camera's own shape (no crop, no bars). Every order of the cameras is
     tried as a row, a column, one tall tile beside a stack (either side), a wide tile above
     or below a row, and two rows; the arrangement that gives every camera the most picture wins. */
  var layoutCache = { key: '', tiles: null };
  // The search is pure in the ratios, so it runs once per set of camera shapes, never per key press.
  function cameraLayout(ratios) {
    var key = ratios.map(function (r) { return r.toFixed(4); }).join(',');
    if (key !== layoutCache.key) { layoutCache.key = key; layoutCache.tiles = searchCameraLayout(ratios); }
    return layoutCache.tiles;
  }
  function searchCameraLayout(ratios) {
    var B = CAM_BOX, G = CAM_GAP, best = null, bestArea = -1;
    function row(list, x, y, w, h) {
      var sum = 0, height, cx, out = [];
      list.forEach(function (r) { sum += r.r; });
      height = Math.min(h, (w - G * (list.length - 1)) / sum); cx = x + (w - (height * sum + G * (list.length - 1))) / 2;
      list.forEach(function (r) { out.push({ i: r.i, x: cx, y: y + (h - height) / 2, w: height * r.r, h: height }); cx += height * r.r + G; });
      return out;
    }
    function column(list, x, y, w, h) {
      var inv = 0, width, cy, out = [];
      list.forEach(function (r) { inv += 1 / r.r; });
      width = Math.min(w, (h - G * (list.length - 1)) / inv); cy = y + (h - (width * inv + G * (list.length - 1))) / 2;
      list.forEach(function (r) { out.push({ i: r.i, x: x + (w - width) / 2, y: cy, w: width, h: width / r.r }); cy += width / r.r + G; });
      return out;
    }
    // Shrink-wrap a candidate and centre it in the box.
    function centre(tiles) {
      var l = Infinity, tp = Infinity, r = -Infinity, b = -Infinity, dx, dy;
      tiles.forEach(function (c) { l = Math.min(l, c.x); tp = Math.min(tp, c.y); r = Math.max(r, c.x + c.w); b = Math.max(b, c.y + c.h); });
      dx = B.x + (B.w - (r - l)) / 2 - l; dy = B.y + (B.h - (b - tp)) / 2 - tp;
      return tiles.map(function (c) { return { i: c.i, x: c.x + dx, y: c.y + dy, w: c.w, h: c.h }; });
    }
    function consider(tiles) {
      var area = 0; tiles.forEach(function (c) { area += Math.sqrt(c.w * c.h); }); // Fair share: no camera shrinks to a sliver.
      if (area > bestArea + 1) { bestArea = area; best = centre(tiles); }
    }
    // Move a group so its leading edge sits at `to` along axis x or y (no gap between groups).
    function extent(tiles, axis) { var d = axis === 'x' ? 'w' : 'h', lo = Infinity, hi = -Infinity; tiles.forEach(function (c) { lo = Math.min(lo, c[axis]); hi = Math.max(hi, c[axis] + c[d]); }); return hi - lo; }
    function flush(tiles, axis, to) { var lo = Math.min.apply(null, tiles.map(function (c) { return c[axis]; })); return tiles.map(function (c) { var o = { i: c.i, x: c.x, y: c.y, w: c.w, h: c.h }; o[axis] += to - lo; return o; }); }
    // One group takes a share of the box (left/right or top/bottom); the other fills the rest.
    function split(first, rest, vertical, firstSide) {
      [0.3, 0.4, 0.5, 0.6, 0.7].forEach(function (share) {
        var a, b2, size;
        if (!vertical) {
          a = column(first, 0, B.y, (B.w - G) * share, B.h);
          size = Math.max.apply(null, a.map(function (c) { return c.w; }));
          a = column(first, firstSide ? B.x : B.x + B.w - size, B.y, size, B.h);
          b2 = column(rest, firstSide ? B.x + size + G : B.x, B.y, B.w - size - G, B.h);
          b2 = flush(b2, 'x', firstSide ? a[0].x + size + G : a[0].x - G - extent(b2, 'x'));
        } else {
          a = row(first, B.x, 0, B.w, (B.h - G) * share);
          size = Math.max.apply(null, a.map(function (c) { return c.h; }));
          a = row(first, B.x, firstSide ? B.y : B.y + B.h - size, B.w, size);
          b2 = row(rest, B.x, firstSide ? B.y + size + G : B.y, B.w, B.h - size - G);
          b2 = flush(b2, 'y', firstSide ? a[0].y + size + G : a[0].y - G - extent(b2, 'y'));
        }
        consider(a.concat(b2));
      });
    }
    function orders(list) {
      if (list.length <= 1) return [list];
      var out = [];
      list.forEach(function (item, k) { orders(list.slice(0, k).concat(list.slice(k + 1))).forEach(function (o) { out.push([item].concat(o)); }); });
      return out;
    }
    var items = ratios.map(function (r, i) { return { i: i, r: r }; }), seen = {}, all = (items.length <= 4 ? orders(items) : items.map(function (hero) {
      // Five or six cameras: each one may lead, the rest keep their order (every order is too slow on a TV).
      return [hero].concat(items.filter(function (x) { return x !== hero; }));
    })).filter(function (o) {
      // Cameras with the same shape are interchangeable: try each distinct shape sequence once.
      var k = o.map(function (x) { return x.r.toFixed(3); }).join(',');
      if (seen[k]) return false; seen[k] = true; return true;
    });
    all.forEach(function (o) {
      var k;
      consider(row(o, B.x, B.y, B.w, B.h));
      consider(column(o, B.x, B.y, B.w, B.h));
      for (k = 1; k < o.length; k++) {
        split(o.slice(0, k), o.slice(k), false, true); split(o.slice(0, k), o.slice(k), false, false);
        split(o.slice(0, k), o.slice(k), true, true); split(o.slice(0, k), o.slice(k), true, false);
      }
    });
    return best.sort(function (a, b) { return a.i - b.i; });
  }
  function fullBox(r) { var w = Math.min(1920, 1080 * r), h = w / r; return { x: (1920 - w) / 2, y: (1080 - h) / 2, w: w, h: h }; }
  window.FrameCameraLayout = { layout: cameraLayout, fullBox: fullBox, box: CAM_BOX, gap: CAM_GAP };
}());
