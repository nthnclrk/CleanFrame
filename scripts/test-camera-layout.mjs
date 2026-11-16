// The real ES5 camera layout, run outside the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../app/camera-layout.js', import.meta.url), 'utf8'), context);
const { layout, fullBox, box, gap } = context.window.FrameCameraLayout;
const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
function sound(ratios) {
  const tiles = layout(ratios);
  assert.equal(tiles.length, ratios.length);
  tiles.forEach((t, i) => {
    assert.ok(Math.abs(t.w / t.h - ratios[i]) < 0.001, 'tile ' + i + ' keeps its shape');
    assert.ok(t.x >= box.x - 0.5 && t.y >= box.y - 0.5 && t.x + t.w <= box.x + box.w + 0.5 && t.y + t.h <= box.y + box.h + 0.5, 'tile ' + i + ' stays in the box');
    tiles.slice(i + 1).forEach((u, j) => {
      assert.ok(!overlap(t, u), 'tiles ' + i + ' and ' + (i + j + 1) + ' do not overlap');
      // Neighbours are separated by the gap along whichever axis keeps them apart.
      const apart = Math.max(u.x - (t.x + t.w), t.x - (u.x + u.w), u.y - (t.y + t.h), t.y - (u.y + u.h));
      assert.ok(apart >= gap - 0.5, 'tiles ' + i + ' and ' + (i + j + 1) + ' are ' + apart + ' px apart');
    });
  });
  return tiles;
}
test('every camera keeps its own shape, inside the box, without overlap', () => {
  for (const ratios of [[16 / 9], [3 / 4, 10 / 3, 16 / 9], [16 / 9, 16 / 9], [4 / 3, 4 / 3, 4 / 3, 4 / 3], [16 / 9, 3 / 4, 16 / 9, 3 / 4, 16 / 9], Array(6).fill(16 / 9)]) sound(ratios);
});
test('the owner\'s three cameras get a usable size each', () => {
  const tiles = sound([3 / 4, 10 / 3, 16 / 9]);
  assert.ok(tiles.every(t => t.w * t.h > 200000), JSON.stringify(tiles));
});
test('one camera fills the box along one side, and full screen fits the stage', () => {
  const [t] = layout([16 / 9]);
  assert.ok(Math.abs(t.w - box.w) < 1 || Math.abs(t.h - box.h) < 1);
  assert.deepEqual(JSON.parse(JSON.stringify(fullBox(16 / 9))), { x: 0, y: 0, w: 1920, h: 1080 });
  const tall = fullBox(3 / 4); assert.equal(tall.h, 1080); assert.equal(tall.x, (1920 - 810) / 2);
});
test('the same shapes return the cached result', () => {
  const a = layout([3 / 4, 10 / 3, 16 / 9]); assert.equal(layout([3 / 4, 10 / 3, 16 / 9]), a);
});
