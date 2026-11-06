// ============================================================
// REEF CHECK — every Reef Drop reef against the checks in scripts/reef-lib.mjs,
// quietly: one line per problem, then one summary line.
//
// usage: node scripts/reef-check.mjs                 (all reefs)
//        node scripts/reef-check.mjs 43-54           (some: numbers as players see them)
//        node scripts/reef-check.mjs 43-54 --sheet   (and a contact sheet of them,
//              saved to qa-shots/reefs.png: it serves the repo itself and needs
//              Playwright's Chromium)
// ============================================================
import * as D from '../src/arcade/ReefDropLogic.js';
import { check } from './reef-lib.mjs';

const args = process.argv.slice(2), SHEET = args.includes('--sheet');
const spec = args.find(a => /^\d/.test(a));
const pickIdx = () => {
    if (!spec) return D.LEVELS.map((_, i) => i);
    const out = [];
    for (const part of spec.split(',')) { const [a, b] = part.split('-').map(Number); for (let n = a; n <= (b || a); n++) out.push(n - 1); }
    return out.filter(i => i >= 0 && i < D.LEVELS.length);
};
const idx = pickIdx();
let bad = 0, minLeft = 99, maxLong = 0;
const t0 = Date.now();
for (const i of idx) {
    const lv = D.LEVELS[i], c = check(lv, null, true);
    minLeft = Math.min(minLeft, c.left); maxLong = Math.max(maxLong, c.longest);
    if (!c.ok) { bad++; console.log(`FAIL ${i + 1}. ${lv.name}: ${c.problems.join('; ')}`); }
}
console.log(`${bad ? 'REEFS FAIL' : 'REEFS OK'}: ${idx.length - bad}/${idx.length} pass (fewest pearls left ${minLeft}, longest drop ${maxLong.toFixed(1)}s) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

if (SHEET) await sheet(idx);
process.exit(bad ? 1 : 0);

/** A contact sheet of these reefs: serves the repo, opens each reef, tiles the canvases. */
async function sheet(list) {
    const http = await import('http'), fs = await import('fs'), path = await import('path'), { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
    const root = path.resolve(new URL('..', import.meta.url).pathname);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
    const server = http.createServer((q, res) => {
        const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
        if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    }).listen(0);
    const port = server.address().port;
    const b = await pw.chromium.launch({ args: ['--no-sandbox', '--mute-audio'] });
    const p = await (await b.newContext({ viewport: { width: 375, height: 667 } })).newPage();
    await p.goto(`http://127.0.0.1:${port}/index.html`); await p.waitForFunction(() => !!window.__claw);
    await p.click('[data-go="solo"]'); await p.click('#solo-list [data-game="reefdrop"]'); await p.click('#pv-play');
    const shots = [];
    for (const i of list) {
        await p.evaluate(i => import('/src/arcade/ReefDrop.js').then(G => G.play(i)), i);
        await p.waitForTimeout(350);
        shots.push({ n: i + 1, name: D.LEVELS[i].name, png: (await (await p.$('#ag-cv')).screenshot()).toString('base64') });
    }
    const cols = Math.min(6, shots.length);
    await p.setViewportSize({ width: cols * 190, height: 300 });
    await p.setContent(`<body style="margin:0;background:#fff;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},190px)">${shots.map(s => `<div style="text-align:center"><img src="data:image/png;base64,${s.png}" style="width:186px"><div>${s.n}. ${s.name}</div></div>`).join('')}</body>`);
    fs.mkdirSync(path.join(root, 'qa-shots'), { recursive: true });
    const out = path.join(root, 'qa-shots', 'reefs.png');
    await p.screenshot({ path: out, fullPage: true });
    await b.close(); server.close();
    console.log(`sheet: ${out}`);
}
