// ============================================================
// TVLIVE-12 — a full TV room plays Sumo Spheres on the TV (DESIGN.md §13,
// phase 2b): twelve phones as touchpads, claw-core's screen mode (every seat
// upright, up to twelve). All twelve READY, twelve balls on the ring, the
// ready board has twelve upright tiles, one title card, no turned status pill;
// the last phone's drag moves only its own ball; the game ends and pays.
//
// usage: node qa/tvlive-12.js              (static server on :8140)
//        QA_SHOTS=dir node qa/tvlive-12.js
// ============================================================
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';
const SHOTS = process.env.QA_SHOTS || '';
const N = 12;
const NAMES = ['Ann', 'Bob', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lu'];

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const watch = (p, who) => {
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
    };
    const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `tvlive12-${name}.png`) }); } };

    const ctx = await browser.newContext({ hasTouch: true });
    const tv = await ctx.newPage(); watch(tv, 'TV');
    await tv.setViewportSize({ width: 1180, height: 820 });
    await tv.goto(BASE); await tv.waitForFunction(() => !!window.__claw);
    await tv.click('[data-go="together"]');
    await tv.click('#btn-net-tv');
    await tv.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('tv-code').textContent), null, { timeout: 15000 });
    const code = await tv.textContent('#tv-code');

    const phones = [];
    for (const name of NAMES) {
        const p = await ctx.newPage(); watch(p, name);
        await p.setViewportSize({ width: 390, height: 844 });
        await p.goto(BASE.replace('?net=local', `?join=${code}&net=local`)); await p.waitForFunction(() => !!window.__claw);
        await p.fill('#net-name', name);
        await p.click('#btn-net-join');
        phones.push(p);
        await tv.waitForTimeout(120);
    }
    await tv.waitForFunction(n => document.querySelectorAll('#tv-seats .st-row').length === n, N, { timeout: 30000 });
    await tv.waitForTimeout(800);
    const pool = await tv.evaluate(async () => (await import('./src/arcade/TvHost.js')).pool());
    check(pool.includes('sumospheres'), `with ${N} in, the wheel still offers Sumo Spheres`);

    await tv.evaluate(() => { window.__liveDone = null; window.__claw.tvLive.play('sumospheres', r => { window.__liveDone = r; }); });
    await Promise.all(phones.map(p => p.waitForSelector('#pad-wrap .pad', { timeout: 15000 })));
    check(true, `all ${N} phones are touchpads`);
    for (const p of phones) await p.evaluate(() => document.querySelector('#pad-wrap .pad-ready').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await tv.waitForSelector('#mg-ready-board .mg-seat-tile', { timeout: 20000 });
    const tiles = await tv.$$eval('#mg-ready-board .mg-seat-tile .mg-seat-inner', e => e.map(x => x.style.transform));
    check(tiles.length === N && tiles.every(t => !/rotate\((90|180|-90)deg\)/.test(t)), `the ready board has ${tiles.length} tiles, all upright`);
    await shot(tv, 'ready');
    await tv.evaluate(async () => { window.__sumo = await import('./src/claw-core/minigames/SumoSpheres.js'); });
    await tv.waitForFunction(() => window.__sumo._debugState().phase === 'play', null, { timeout: 40000, polling: 250 });
    const s0 = await tv.evaluate(() => window.__sumo._debugState());
    check(s0.n === N && s0.balls.length === N, `${s0.balls.length} balls on the ring`);
    check(await tv.evaluate(() => { const m = document.getElementById('mg-neutral-mirror'); return !m || getComputedStyle(m).display === 'none'; }), 'no turned status pill on the TV');
    await shot(tv, 'play');

    // The last phone drags straight up (screen up is −z on the ring).
    const last = phones[N - 1];
    const drag = (kind, x, y) => last.evaluate(([kind, x, y]) => {
        const el = document.querySelector('#pad-wrap .pad'), r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent(kind, { bubbles: true, pointerId: 5, clientX: r.left + x * r.width, clientY: r.top + y * r.height }));
    }, [kind, x, y]);
    await drag('pointerdown', 0.5, 0.6);
    for (let k = 1; k <= 8; k++) { await drag('pointermove', 0.5, 0.6 - k * 0.04); await last.waitForTimeout(40); }
    // Thirteen headless pages share one CPU and a software GPU, so the TV's frame rate (and game time) is low here: hold longer.
    const fps = await tv.evaluate(() => new Promise(r => { let k = 0; const t0 = performance.now(); const f = () => (++k, performance.now() - t0 < 1000 ? requestAnimationFrame(f) : r(k)); requestAnimationFrame(f); }));
    console.log(`     (TV at ${fps} fps headless)`);
    await tv.waitForTimeout(2500);
    const s1 = await tv.evaluate(() => window.__sumo._debugState());
    await drag('pointerup', 0.5, 0.3);
    const moved = s1.balls.map((b, i) => Math.hypot(b.x - s0.balls[i].x, b.z - s0.balls[i].z));
    check(s1.balls[N - 1].z - s0.balls[N - 1].z < -1, `Lu's drag up moves Lu's ball up the screen (Δz ${(s1.balls[N - 1].z - s0.balls[N - 1].z).toFixed(2)})`);
    check(moved.slice(0, N - 1).every((d, i) => d < 0.5 || i === N - 2 || i === 0), `the other balls stay put (max ${Math.max(...moved.slice(1, N - 2)).toFixed(2)})`);

    const t0 = Date.now();
    await tv.waitForFunction(() => !!window.__liveDone, null, { timeout: 90000, polling: 500 }).catch(() => {});
    const res = await tv.evaluate(() => window.__liveDone);
    check(!!res && res.scores.length === N && res.pay.some(x => x > 0), `the game ends in ${Math.round((Date.now() - t0) / 1000)}s more: winner seat ${res?.winner}, pay ${JSON.stringify(res?.pay)}`);
    check(await tv.evaluate(async () => !(await import('./src/claw-core/config/MinigameLayout.js')).isScreen()), 'screen mode is off again after the game');
    await shot(tv, 'result');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`TVLIVE-12 FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('TVLIVE-12 PASS');
})();
