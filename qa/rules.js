// ============================================================
// RULES — the party rules that aren't a game: the rotation (no game comes
// round twice before every game has), two vetoes per session for the whole
// table, and the final game paying double.
//
// usage: node qa/rules.js            (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';

const pass = [], fail = [];
const ok = (n, c, d = '') => (c ? pass : fail).push(`${n}${d ? ` — ${d}` : ''}`);

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw);

    // ---- rotation ----
    const rot = await page.evaluate(async () => {
        const R = await import('/src/arcade/Rotation.js');
        const n = 4, seen = [], total = R.progress(n).total;
        for (let i = 0; i < total; i++) {
            const f = R.fresh(n);
            const t = f[Math.floor(Math.random() * f.length)];
            seen.push(t); R.mark(t, n);
        }
        const last = seen[seen.length - 1];
        const next = R.fresh(n);
        const saved = JSON.parse(localStorage.getItem('claw.rotation'))[n];
        return { total, unique: new Set(seen).size, nextHasLast: next.includes(last), nextSize: next.length, saved };
    });
    ok('rotation: every game once before any repeats', rot.unique === rot.total, `${rot.unique}/${rot.total}`);
    ok('rotation: a new cycle never opens with the game that closed the last', !rot.nextHasLast && rot.nextSize === rot.total - 1, `next=${rot.nextSize}`);
    ok('rotation: the deck is saved between visits', rot.saved && Array.isArray(rot.saved.played), JSON.stringify(rot.saved).slice(0, 80));

    // ---- the wheel: two vetoes per session, then none ----
    await page.click('[data-go="quick"]');
    await page.click('#btn-seats-go');
    await page.click('#btn-grid-spin', { force: true });
    const spinAndWait = async () => {
        await page.waitForFunction(() => !document.getElementById('btn-spin').disabled, null, { timeout: 15000 });
        await page.evaluate(() => document.getElementById('btn-spin').click());
        await page.waitForFunction(() => !document.getElementById('wheel-result').hidden, null, { timeout: 15000 });
    };
    await spinAndWait();
    const v0 = await page.evaluate(() => ({ t: document.getElementById('btn-wheel-veto').textContent, landed: document.getElementById('wheel-stage').classList.contains('landed'),
        wheel: document.getElementById('wheel-wrap').getBoundingClientRect().width }));
    ok('wheel: lands with VETO (2)', /VETO \(2\)/.test(v0.t), v0.t);
    ok('wheel: the result takes the middle and the wheel shrinks', v0.landed, `wheel ${Math.round(v0.wheel)}px`);
    const picks = [];
    for (let k = 0; k < 2; k++) {
        picks.push(await page.textContent('#wr-title'));
        await page.evaluate(() => document.getElementById('btn-wheel-veto').click());
        await spinAndWait();
    }
    const v2 = await page.evaluate(() => { const b = document.getElementById('btn-wheel-veto'); return { t: b.textContent, d: b.disabled, title: document.getElementById('wr-title').textContent }; });
    ok('wheel: after two vetoes, no more', v2.d && /NO VETOES/.test(v2.t), v2.t);
    ok('wheel: a vetoed game left the wheel', !picks.includes(v2.title), `${picks.join(', ')} → ${v2.title}`);
    const spinning = await page.evaluate(async () => {
        document.getElementById('btn-wheel-veto').click();     // disabled: nothing happens
        await new Promise(r => setTimeout(r, 300));
        return !document.getElementById('wheel-result').hidden;
    });
    ok('wheel: a spent veto button does nothing', spinning);

    // A new session from the home screen has two again.
    await page.evaluate(() => window.__claw.show('home', false));
    await page.click('[data-go="quick"]');
    await page.click('#btn-seats-go');
    await page.click('#btn-grid-spin', { force: true });
    await spinAndWait();
    ok('wheel: a new session starts with two again', /VETO \(2\)/.test(await page.textContent('#btn-wheel-veto')));

    // ---- party: shared vetoes, and the final game pays double ----
    const party = await page.evaluate(async () => {
        const P = await import('/src/arcade/Party.js');
        const V = await import('/src/arcade/Vetoes.js');
        P.party.length = 3; P.start();
        const fresh = V.left();
        P.record(P.pool()[0], 0, null);
        P.record(P.pool()[0], 0, null);
        const finalBefore = P.finalNext(), hype = P.party.hype.slice();
        const before = P.party.points.slice();
        P.record(P.pool()[0], 1, null);
        const gain = P.party.points.map((p, i) => p - before[i]);
        return { fresh, finalBefore, hype, gain, double: P.party.last.double, unique: new Set(P.party.played).size };
    });
    ok('party: starts with two vetoes', party.fresh === 2);
    ok('party: the last game is flagged as the final', party.finalBefore && party.hype.some(h => /DOUBLE/.test(h)), party.hype.join(' | '));
    ok('party: the final game pays double', party.double && party.gain[1] === 6, JSON.stringify(party.gain));
    ok('party: no game repeats in a party', party.unique === 3);
    ok('no page errors', !errs.length, errs.slice(0, 2).join(' | '));

    await browser.close();
    pass.forEach(p => console.log('  ✓ ' + p));
    fail.forEach(f => console.log('  ✗ ' + f));
    console.log(`\n${pass.length}/${pass.length + fail.length}`);
    process.exit(fail.length ? 1 : 0);
})();
