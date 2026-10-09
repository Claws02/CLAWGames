// Copies the shipped app into www/, the folder Capacitor packages. Same shape
// as HundredBlockDash's: the repo root IS the web build (no bundler), so this
// is a copy that leaves dev-only folders behind and then proves nothing
// shipped imports something that was left behind.
// usage: node scripts/build-web.js   (run `npm run setup` first)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');
const SHIP = ['index.html', 'css', 'src', 'vendor', 'assets'];
const SKIP = [/\/archived(\/|$)/, /\/\./, /\.md$/, /_template(3d)?\.js$/];

if (!fs.existsSync(path.join(ROOT, 'src/claw-core/minigames/MinigameManager.js'))) {
    console.error('src/claw-core is empty: run `git submodule update --init` (or `npm run setup`).');
    process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });
let files = 0, bytes = 0;
function copy(rel) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src) || SKIP.some(r => r.test('/' + rel))) return;
    const st = fs.statSync(src);
    if (st.isDirectory()) { fs.readdirSync(src).forEach(f => copy(path.join(rel, f))); return; }
    const dst = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    files++; bytes += st.size;
}
SHIP.forEach(copy);

const bad = [];
(function scan(dir) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) { scan(p); continue; }
        if (!p.endsWith('.js')) continue;
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/(?:import\s[^'"]*?from\s*|import\(\s*)['"](\.[^'"]+)['"]/g)) {
            const target = path.resolve(path.dirname(p), m[1]);
            if (!fs.existsSync(target)) bad.push(`${path.relative(OUT, p)} → ${m[1]}`);
        }
    }
})(path.join(OUT, 'src'));
if (bad.length) {
    console.error('Imports that point outside the build:\n  ' + bad.join('\n  '));
    process.exit(1);
}
console.log(`www/: ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
