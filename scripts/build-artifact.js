// Packages www/ as a hosted web page for sharing a playable link: the host
// wraps the page in its own <html>/<body>, so the outer tags are stripped and
// body's class is set from script instead. Peer-to-peer is blocked there, so
// Play Together is marked app-only (CLAW_NO_P2P).
// usage: node scripts/build-artifact.js   (rebuilds www/ first)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), WWW = path.join(ROOT, 'www'), OUT = path.join(ROOT, 'dist-artifact');
// Always from a fresh www/: packaging a stale one shipped a page without the
// change it was rebuilt for.
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-web.js')], { stdio: 'inherit' });
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(WWW, OUT, { recursive: true });
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html
    .replace(/<!DOCTYPE html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*/i, '')
    .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '')
    .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<body class="arcade">\s*/i, '')
    // Inside the page content, so <body> exists whether or not the host has
    // wrapped it yet.
    .replace('<main id="arcade">', '<main id="arcade"><script>document.body.classList.add("arcade"); window.CLAW_NO_P2P = true;</script>')
    .replace(/<\/body>\s*/i, '');
// three.js and cannon.js ship WITH the page, as published files beside it:
// loading them from a CDN made the page depend on that CDN being reachable
// from wherever it is opened, and when it was not the boot check showed
// "Couldn't load the game engine". Fonts still come from Google Fonts (the
// one font host the page may use); every face has a fallback stack.
html = html
    .replace(/<link rel="preload"[^>]*woff2[^>]*>\s*/g, '')
    .replace(/<style>\s*@font-face[\s\S]*?<\/style>/, '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;700;800;900&display=swap">');
for (const s of ['vendor/three.min.js', 'vendor/cannon.min.js']) {
    if (!html.includes(`<script src="${s}"></script>`)) throw new Error('index.html no longer loads ' + s);
    if (!fs.existsSync(path.join(OUT, s))) throw new Error('missing ' + s);
}
// Play Together is off on the hosted page, so its signaling bundles stay home.
for (const f of fs.readdirSync(path.join(OUT, 'vendor'))) {
    if (!['three.min.js', 'cannon.min.js'].includes(f)) fs.rmSync(path.join(OUT, 'vendor', f));
}
fs.rmSync(path.join(OUT, 'assets'), { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(path.relative(OUT, p)); } })(OUT);
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify(files.filter(f => f !== 'index.html' && f !== 'files.json')));
console.log(`dist-artifact/: ${files.length} files`);
