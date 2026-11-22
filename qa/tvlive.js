// ============================================================
// TVLIVE — the TV runs the game, the phones are touchpads (DESIGN.md §13,
// phase 2), over the loopback transport (?net=local).
//
// A tablet TV hosts; Ann and Bob join. The wheel's pool now offers Sumo
// Spheres (a game the TV runs). The TV starts it: both phones show a pad,
// tap I'M READY, and the TV's ready board counts down. Bob drags his pad
// towards one side and his ball on the TV rolls that way; Ann holds still.
// The game runs to its end on the TV, and the TV and both phones agree on
// the result. The pads come down with it.
//
// usage: node qa/tvlive.js              (static server on :8140)
//        QA_SHOTS=dir node qa/tvlive.js
// ============================================================
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';
const SHOTS = process.env.QA_SHOTS || '';
const GAME = 'sumospheres';

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
    const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `tvlive-${name}.png`) }); } };
    const sumo = tv => tv.evaluate(async () => (await import('./src/claw-core/minigames/SumoSpheres.js'))._debugState());

    const ctx = await browser.newContext({ hasTouch: true });
    const tv = await ctx.newPage(); watch(tv, 'TV');
    await tv.setViewportSize({ width: 1180, height: 820 });
    await tv.goto(BASE); await tv.waitForFunction(() => !!window.__claw);
    await tv.click('[data-go="together"]');
    await tv.click('#btn-net-tv');
    await tv.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('tv-code').textContent), null, { timeout: 15000 });
    const code = await tv.textContent('#tv-code');

    const phone = async name => {
        const p = await ctx.newPage(); watch(p, name);
        await p.setViewportSize({ width: 390, height: 844 });
        await p.goto(BASE.replace('?net=local', `?join=${code}&net=local`)); await p.waitForFunction(() => !!window.__claw);
        await p.fill('#net-name', name);
        await p.click('#btn-net-join');
        return p;
    };
    const ann = await phone('Ann');
    await tv.waitForFunction(() => document.querySelectorAll('#tv-seats .st-row').length === 1, null, { timeout: 15000 });
    const bob = await phone('Bob');
    await tv.waitForFunction(() => document.querySelectorAll('#tv-seats .st-row').length === 2, null, { timeout: 15000 });
    await tv.waitForTimeout(500);

    const pool = await tv.evaluate(async () => (await import('./src/arcade/TvHost.js')).pool());
    check(pool.includes(GAME), `the TV's wheel offers ${GAME} (a game the TV runs): ${pool.length} games`);

    // Start it as the wheel's PLAY would.
    await tv.evaluate(g => { window.__liveDone = null; window.__claw.tvLive.play(g, r => { window.__liveDone = r; }); }, GAME);
    await Promise.all([ann, bob].map(p => p.waitForSelector('#pad-wrap .pad', { timeout: 10000 })));
    check(true, 'both phones turn into touchpads');
    check(await tv.evaluate(() => document.getElementById('arcade').hidden), 'the game is on the TV');
    await shot(ann, 'pad-ready');

    // READY straight away: during the rules card, so the TV holds it until the ready board is up.
    for (const p of [ann, bob]) await p.evaluate(() => document.querySelector('#pad-wrap .pad-ready').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    // (waitForFunction treats a Promise as truthy: load the module first, then poll it synchronously.)
    await tv.evaluate(async () => { window.__sumo = await import('./src/claw-core/minigames/SumoSpheres.js'); });
    await tv.waitForFunction(() => window.__sumo._debugState().phase === 'play', null, { timeout: 30000, polling: 250 });
    check(true, 'both READYs land on the TV: the countdown runs and the game starts');
    await shot(tv, 'play');

    // Bob drags his pad hard to the right and holds it there.
    const s0 = await sumo(tv);
    const drag = (p, kind, x, y) => p.evaluate(([kind, x, y]) => {
        const el = document.querySelector('#pad-wrap .pad'), r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent(kind, { bubbles: true, pointerId: 5, clientX: r.left + x * r.width, clientY: r.top + y * r.height }));
    }, [kind, x, y]);
    await drag(bob, 'pointerdown', 0.5, 0.5);
    for (let k = 1; k <= 8; k++) { await drag(bob, 'pointermove', 0.5 + k * 0.05, 0.5); await bob.waitForTimeout(40); }
    await tv.waitForTimeout(900);
    const s1 = await sumo(tv);
    await shot(bob, 'pad-drag');
    await drag(bob, 'pointerup', 0.9, 0.5);
    const dBob = s1.balls[1].x - s0.balls[1].x, dAnn = Math.hypot(s1.balls[0].x - s0.balls[0].x, s1.balls[0].z - s0.balls[0].z);
    check(dBob > 1, `Bob's drag to the right rolls his ball right on the TV (Δx ${dBob.toFixed(2)})`);
    check(dAnn < 0.5, `Ann's ball, untouched, stays put (moved ${dAnn.toFixed(2)})`);

    // Let the ring close: the game ends itself (Bob keeps pushing towards Ann to settle it sooner).
    const t0 = Date.now();
    while (Date.now() - t0 < 90000 && !(await tv.evaluate(() => !!window.__liveDone))) {
        const st = await sumo(tv).catch(() => null);
        if (st && st.balls?.length === 2) {
            const a = st.balls[0], b = st.balls[1], dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz) || 1;
            await drag(bob, 'pointerdown', 0.5, 0.5);
            await drag(bob, 'pointermove', 0.5 + dx / d * 0.3, 0.5 + dz / d * 0.3);
            await tv.waitForTimeout(500);
            await drag(bob, 'pointerup', 0.5, 0.5);
        } else await tv.waitForTimeout(500);
    }
    const res = await tv.evaluate(() => window.__liveDone);
    check(!!res && res.live && res.type === GAME, `the game ends on the TV in ${Math.round((Date.now() - t0) / 1000)}s: winner seat ${res?.winner}, pay ${JSON.stringify(res?.pay)}`);
    await tv.waitForFunction(() => !document.getElementById('scr-tvresult').hidden, null, { timeout: 8000 }).catch(() => {});
    check(!(await tv.isHidden('#scr-tvresult')), 'the TV shows the result');
    await Promise.all([ann, bob].map(p => p.waitForFunction(() => !document.getElementById('scr-netresult').hidden, null, { timeout: 10000 }).catch(() => {})));
    check(!(await ann.$('#pad-wrap')) && !(await bob.$('#pad-wrap')), 'the pads come down');
    const pts = await Promise.all([tv, ann, bob].map(p => p.evaluate(() => [...document.querySelectorAll('.screen:not([hidden]) .st-pts')].map(e => e.textContent.trim().split(/\s/)[0]))));
    check(pts[1].length === 2 && JSON.stringify(pts[1]) === JSON.stringify(pts[2]), `both phones agree on the totals: ${JSON.stringify(pts.slice(1))}`);
    check((res?.pay || []).some(x => x > 0), 'somebody scored');
    await shot(tv, 'result');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`TVLIVE FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('TVLIVE PASS');
})();
