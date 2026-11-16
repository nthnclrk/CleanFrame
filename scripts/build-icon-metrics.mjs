import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { openPreview, root } from './browser.mjs';
const files = readdirSync(root + 'app/assets/icons').filter(n => /\.(svg|png)$/.test(n));
const preview = await openPreview();
try {
  const page = await preview.browser.newPage();
  // Any same-origin document lets the page fetch the bundled icons.
  await page.goto(preview.baseURL + '/home/icon.png');
  const metrics = await page.evaluate(async files => {
    const result = {}, size = 240;
    for (const file of files) {
      const id = file.replace(/\.(svg|png)$/, '');
      const response = await fetch('/home/assets/icons/' + file);
      let blob;
      if (file.endsWith('.svg')) {
        const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
        svg.setAttribute('width', size); svg.setAttribute('height', size);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
      } else blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const pixels = context.getImageData(0, 0, size, size).data;
      let left = size, top = size, right = -1, bottom = -1, ink = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const alpha = pixels[(y * size + x) * 4 + 3];
          ink += alpha / 255;
          if (alpha > 40) {
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x); bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < left || bottom < top) throw Error('Empty icon: ' + id);
      const width = right - left + 1, height = bottom - top + 1;
      result[id] = { n: size, x: left, y: top, w: width, h: height, fill: ink / (width * height) };
    }
    return result;
  }, files);
  mkdirSync(root + '.local', { recursive: true });
  writeFileSync(root + '.local/icon-metrics.js', '/* Visible icon ink measured at build time. */\nwindow.FrameIconMetrics = ' + JSON.stringify(metrics) + ';\n');
  console.log('Measured ' + files.length + ' icons. Output: .local/icon-metrics.js');
} finally { await preview.close(); }
