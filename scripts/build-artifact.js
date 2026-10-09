// Packages www/ as a hosted web page for sharing a playable link: the host
// wraps the page in its own <html>/<body>, so the outer tags are stripped and
// body's class is set from script instead. Peer-to-peer is blocked there, so
// Play Together is marked app-only (CLAW_NO_P2P).
// usage: node scripts/build-web.js && node scripts/build-artifact.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), WWW = path.join(ROOT, 'www'), OUT = path.join(ROOT, 'dist-artifact');
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
// The host serves libraries and fonts only from known CDNs, so load the same
// versions from there and ship neither copy: three.js r128 and cannon.js 0.6.2
// (the vendored builds), Nunito and Bebas Neue from Google Fonts.
html = html
    .replace('<script src="vendor/three.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>')
    .replace('<script src="vendor/cannon.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js"></script>')
    .replace(/<link rel="preload"[^>]*woff2[^>]*>\s*/g, '')
    .replace(/<style>\s*@font-face[\s\S]*?<\/style>/, '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;700;800;900&display=swap">');
for (const s of ['vendor/three.min.js', 'vendor/cannon.min.js']) if (html.includes(s)) throw new Error('still references ' + s);
fs.rmSync(path.join(OUT, 'vendor'), { recursive: true, force: true });
fs.rmSync(path.join(OUT, 'assets'), { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(path.relative(OUT, p)); } })(OUT);
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify(files.filter(f => f !== 'index.html' && f !== 'files.json')));
console.log(`dist-artifact/: ${files.length} files`);
