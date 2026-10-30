// ============================================================
// PHONE GAMES — the arcade's online-only games (src/games/PhoneGame.js):
// Stop the Clock and Higher or Lower.
//   1. They're online only: off the shared-screen lists, on Quick Play for
//      one, and in MG_PARALLEL so rooms and the TV wheel deal them.
//   2. Two phones with the same seed face the same challenge.
//   3. Each plays to the end alone and reports a sensible score.
//
// usage: node qa/phonegames.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const GAMES = { stopclock: '/src/games/StopClock.js', higherlower: '/src/games/HigherLower.js' };

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const open = async () => {
        const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        return p;
    };
    const play = (p, type, seed) => p.evaluate(({ type, seed }) => import('/src/claw-core/minigames/SoloArena.js').then(S => {
        window.__score = null; document.getElementById('arcade').hidden = true;
        S.play(type, seed, sc => { window.__score = sc; }, 90000);
    }), { type, seed });
    const state = (p, type) => p.evaluate(m => import(m).then(x => x._debugState()), GAMES[type]);
    const tap = async (p, k = 0) => { const b = (await p.$$('.phone-game button'))[k]; const bb = await b.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); };

    const a = await open(), b = await open();
    const lists = await a.evaluate(() => Promise.all([import('/src/arcade/Catalog.js'), import('/src/claw-core/config/MinigameRegistry.js')])
        .then(([C, R]) => ({ local: C.allTypes(), solo: C.allTypes(true), par: R.MG_PARALLEL })));
    for (const t of Object.keys(GAMES)) {
        check(!lists.local.includes(t) && lists.solo.includes(t) && lists.par.includes(t), `${t}: online only (not on shared screens; solo and rooms yes)`);
    }

    // Same seed, same challenge.
    for (const type of Object.keys(GAMES)) {
        await play(a, type, 4242); await play(b, type, 4242);
        await a.waitForTimeout(300);
        const [sa, sb] = [await state(a, type), await state(b, type)];
        const key = s => JSON.stringify(type === 'stopclock' ? [s.target, s.dark] : [s.cur, s.next]);
        check(key(sa) === key(sb), `${type}: two phones, one seed, the same challenge ${key(sa)}`);
        await Promise.all([a, b].map(p => p.evaluate(() => import('/src/claw-core/minigames/SoloArena.js').then(S => { S.forceEnd(); S.reset(); }))));
    }
    await b.close();

    // Played to the end.
    await play(a, 'stopclock', 99);
    let t0 = Date.now();
    while (Date.now() - t0 < 90000 && await a.evaluate(() => window.__score == null)) {
        const s = await state(a, 'stopclock');
        if (s.phase === 'run') { await a.waitForTimeout(s.target * 1000 - 150); await tap(a); }
        await a.waitForTimeout(100);
    }
    const clock = await a.evaluate(() => window.__score);
    check(clock > 3500 && clock <= 5000, `Stop the Clock: five stops near the target score ${clock} / 5000`);

    await play(a, 'higherlower', 99);
    t0 = Date.now(); let calls = 0;
    while (Date.now() - t0 < 90000 && await a.evaluate(() => window.__score == null)) {
        const s = await state(a, 'higherlower');
        if (s.phase === 'pick' && s.next) { calls++; await tap(a, calls < 6 ? (s.next.r >= s.cur.r ? 0 : 1) : (s.next.r >= s.cur.r ? 1 : 0)); }
        await a.waitForTimeout(100);
    }
    const hl = await a.evaluate(() => window.__score);
    check(Math.floor(hl / 10) === 5, `Higher or Lower: five right calls then a wrong one scores 5×10 + speed: ${hl}`);

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`PHONE GAMES FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('PHONE GAMES PASS');
})();
