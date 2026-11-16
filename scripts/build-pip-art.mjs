// Renders the doorbell PiP's rounded glass frame and corner mask (9-slice PNGs). Offline, deterministic.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const out = await page.evaluate(() => {
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    // Frame: 128x128, 9-slice border 48. Soft shadow, dark frosted rim, thin light stroke.
    const f = document.createElement('canvas'); f.width = f.height = 128; let c = f.getContext('2d');
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    rr(c, 16, 12, 96, 96, 32); c.fillStyle = 'rgba(28,32,36,.62)'; c.fill();
    c.shadowColor = 'transparent';
    rr(c, 16.75, 12.75, 94.5, 94.5, 31.25); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.38)'; c.stroke();
    // Mask: opaque rounded rect for clipping the video, 9-slice border 24.
    const m = document.createElement('canvas'); m.width = m.height = 64; c = m.getContext('2d');
    rr(c, 0, 0, 64, 64, 24); c.fillStyle = '#fff'; c.fill();
    return { frame: f.toDataURL('image/png'), mask: m.toDataURL('image/png') };
  });
  for (const [k, v] of Object.entries(out)) writeFileSync('native/doorbell-pip/res/' + k + '.png', Buffer.from(v.split(',')[1], 'base64'));
  console.log('Wrote native/doorbell-pip/res/frame.png and mask.png');
} finally { await browser.close(); }
