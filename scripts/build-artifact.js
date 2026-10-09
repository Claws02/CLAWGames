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
// three.js r128 and cannon.js 0.6.2 (the vendored builds) come from a CDN —
// the host only serves scripts from a few — and from the NEXT one if that one
// is unreachable: a single CDN was a single point of failure, and when it did
// not load the boot check showed "Couldn't load the game engine". Fonts come
// from Google Fonts; every face has a fallback stack.
const LIBS = {
    THREE:  ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
             'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
             'https://unpkg.com/three@0.128.0/build/three.min.js'],
    CANNON: ['https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js',
             'https://cdn.jsdelivr.net/npm/cannon@0.6.2/build/cannon.min.js',
             'https://unpkg.com/cannon@0.6.2/build/cannon.min.js'],
};
const LOADER = `<script>
(function () {
    var LIBS = ${JSON.stringify(LIBS)};
    function load(name, i, done) {
        if (window[name]) return done();
        if (i >= LIBS[name].length) return done();
        var s = document.createElement('script');
        s.src = LIBS[name][i];
        s.onload = function () { window[name] ? done() : load(name, i + 1, done); };
        s.onerror = function () { load(name, i + 1, done); };
        document.head.appendChild(s);
    }
    window.__clawLibs = new Promise(function (res) { load('THREE', 0, function () { load('CANNON', 0, res); }); });
})();
</script>`;
html = html
    .replace('<script src="vendor/three.min.js"></script>', LOADER)
    .replace('<script src="vendor/cannon.min.js"></script>', '')
    .replace(/<link rel="preload"[^>]*woff2[^>]*>\s*/g, '')
    .replace(/<style>\s*@font-face[\s\S]*?<\/style>/, '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;700;800;900&display=swap">');
// The boot check runs once the loader has finished, not at parse time.
const BOOT = "if (typeof window.THREE === 'undefined' || typeof window.CANNON === 'undefined') {";
if (!html.includes(BOOT)) throw new Error('boot check not found in index.html');
html = html.replace(BOOT, "window.__clawLibs.then(function () {\n        " + BOOT);
const BOOT_END = "document.body.appendChild(m);\n        }";
if (!html.includes(BOOT_END)) throw new Error('boot check end not found in index.html');
html = html.replace(BOOT_END, BOOT_END + "\n        });");
for (const s of ['vendor/three.min.js', 'vendor/cannon.min.js']) if (html.includes(s)) throw new Error('still references ' + s);
fs.rmSync(path.join(OUT, 'vendor'), { recursive: true, force: true });
fs.rmSync(path.join(OUT, 'assets'), { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(path.relative(OUT, p)); } })(OUT);
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify(files.filter(f => f !== 'index.html' && f !== 'files.json')));
console.log(`dist-artifact/: ${files.length} files`);
