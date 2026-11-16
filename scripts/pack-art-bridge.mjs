// Offline, deterministic text bundle. Never packages a cache, config or photo.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(root + 'vetro/cleanframe-art/manifest.json', 'utf8'));
const bundle = { format: 'vetro-plugin', version: 1, manifest, files: { 'index.js': readFileSync(root + 'vetro/cleanframe-art/index.js', 'utf8') } };
// The doorbell PiP (native/doorbell-pip, built with `npm run build:pip`) travels base64-encoded:
// bundles are text. Without a build the bridge still works; it just has no PiP to start.
const pipOut = root + 'native/doorbell-pip/bin/Release/net6.0/', pipFiles = ['cleanframe-pip.dll', 'cleanframe-pip.runtimeconfig.json', 'res/frame.png', 'res/mask.png'];
if (pipFiles.every(f => existsSync(pipOut + f))) {
  bundle.files['pip.b64.json'] = JSON.stringify(Object.fromEntries(pipFiles.map(f => [f, readFileSync(pipOut + f).toString('base64')])));
} else console.warn('No doorbell PiP build found; run npm run build:pip to include it.');
const bytes = JSON.stringify(bundle) + '\n';
if (Object.keys(bundle.files).length > 20 || Buffer.byteLength(bytes) > 512 * 1024) throw Error('Shard exceeds bundle bounds');
mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'dist/cleanframe-art.vplugin', bytes);
console.log('Wrote dist/cleanframe-art.vplugin (no credentials or artwork)');
