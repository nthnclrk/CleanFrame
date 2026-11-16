// Offline, deterministic text bundle. Never packages a cache, config or photo.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(root + 'vetro/cleanframe-art/manifest.json', 'utf8'));
const bundle = { format: 'vetro-plugin', version: 1, manifest, files: { 'index.js': readFileSync(root + 'vetro/cleanframe-art/index.js', 'utf8') } };
const bytes = JSON.stringify(bundle) + '\n';
if (Object.keys(bundle.files).length > 20 || Buffer.byteLength(bytes) > 512 * 1024) throw Error('Shard exceeds bundle bounds');
mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'dist/cleanframe-art.vplugin', bytes);
console.log('Wrote dist/cleanframe-art.vplugin (no credentials or artwork)');
