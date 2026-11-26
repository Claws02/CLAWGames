// usage: node tools/build-preview.mjs [out.html]
// Bundles preview.html + its modules into ONE self-contained HTML file (for
// sharing / a Claude artifact / a phone). Needs esbuild: `npx esbuild` is used.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'dist-preview.html');
const html = readFileSync(join(root, 'preview.html'), 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
const tmp = mkdtempSync(join(tmpdir(), 'swr-'));
const entry = join(root, '.preview-entry.mjs');
writeFileSync(entry, m[1]);
const bundle = join(tmp, 'bundle.js');
try {
    execFileSync('npx', ['--yes', 'esbuild', entry, '--bundle', '--format=iife', '--minify', `--outfile=${bundle}`], { stdio: 'inherit' });
} finally {
    try { execFileSync('rm', ['-f', entry]); } catch (e) {}
}
const js = readFileSync(bundle, 'utf8').replace(/<\/script/g, '<\\/script');
writeFileSync(out, html.replace(m[0], () => `<script>${js}</script>`));   // function form: js contains $& etc.
console.log('wrote', out, (readFileSync(out).length / 1024).toFixed(1) + ' KB');
