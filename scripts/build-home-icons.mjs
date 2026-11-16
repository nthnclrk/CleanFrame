// Reproducible offline rasterisation of the retained ESPN mark and original Home glyph.
// No owner photo or TV connection. Playwright is a development dependency only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const espn = readFileSync('scripts/assets/espn.svg', 'utf8');
  const home = readFileSync('app/assets/icons/home.svg', 'utf8');
  const tv = readFileSync('app/assets/icons/livetv.svg', 'utf8');
  const result = await page.evaluate(async ({ espn, home, tv }) => {
    async function draw(svg, size, x, y, width, height, background) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, size, size); }
      const image = new Image(); image.src = 'data:image/svg+xml,' + encodeURIComponent(svg); await image.decode();
      ctx.drawImage(image, x, y, width, height); return canvas;
    }
    function metrics(canvas) {
      const n = canvas.width, data = canvas.getContext('2d').getImageData(0,0,n,n).data;
      let x = n, y = n, right = -1, bottom = -1, ink = 0;
      for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
        const a = data[(row*n+col)*4+3]; ink += a/255;
        if (a > 40) { x = Math.min(x,col); y = Math.min(y,row); right = Math.max(right,col); bottom = Math.max(bottom,row); }
      }
      const w = right-x+1, h = bottom-y+1; return { n, x, y, w, h, fill: ink/(w*h) };
    }
    const e = await draw(espn, 512, 0, (512-512*137/554)/2, 512, 512*137/554);
    const t = await draw(tv, 240, 0, 0, 240, 240);
    const h = await draw(home, 512, 104, 104, 304, 304, '#182026');
    const fixture = document.createElement('canvas'); fixture.width = 64; fixture.height = 36;
    const f = fixture.getContext('2d'); f.fillStyle = '#608090'; f.fillRect(0,0,64,36); f.fillStyle = '#253747'; f.fillRect(0,24,64,12);
    return { espn: e.toDataURL('image/png'), home: h.toDataURL('image/png'), fixture: fixture.toDataURL('image/jpeg', .9), metrics: { espn: metrics(e), livetv: metrics(t) } };
  }, { espn, home, tv });
  for (const [name, dest] of [['espn','app/assets/icons/espn.png'], ['home','app/icon.png'], ['fixture','scripts/fixtures/art-test.jpg']]) {
    mkdirSync(dest.slice(0,dest.lastIndexOf('/')), { recursive: true }); writeFileSync(dest, Buffer.from(result[name].split(',')[1], 'base64'));
  }
  const source = readFileSync('app/assets/icons/metrics.js', 'utf8');
  const metrics = JSON.parse(source.slice(source.indexOf('=')+1).trim().replace(/;$/, ''));
  Object.assign(metrics, result.metrics);
  writeFileSync('app/assets/icons/metrics.js', '/* Visible icon ink measured at build time. */\nwindow.FrameIconMetrics = ' + JSON.stringify(metrics) + ';\n');
  console.log('Built transparent white ESPN PNG, Home package icon, TV metrics and tiny test JPEG.');
} finally { await browser.close(); }
