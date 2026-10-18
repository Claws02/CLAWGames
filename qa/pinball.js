// ============================================================
// PINBALL — real touches and real games through claw-core:
//   1. two humans: four fingers down at once (one per zone), every flipper up;
//      lift two, only theirs drop; 6 s of random four-finger chaos plus a
//      cancelled touch, then nothing stuck and no pointers left tracked
//   2. a drain resets the multiplier and a new ball comes back
//   3. lighting all three targets raises the multiplier and blocks the other
//   4. vs a bot: the full 90 s, the bot scores, no ball ever escapes the table,
//      the result reaches Stats
// Fails on any page error.
//
// usage: (static server on :8140 serving the repo root)
//   node qa/pinball.js        (screenshots: qa/shot-pinball-*.png)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const W = 412, H = 892;

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--mute-audio'] });
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw, null, { timeout: 20000 });

    const qa = () => page.evaluate(async () => {
        const q = (await import('/src/games/Pinball.js'))._qa();
        if (!q.tables) return null;
        return { clock: q.clock, over: q.over, ptrs: q.ptrs, t: q.tables.map(t => ({
            press: t.press.slice(), up: t.flips.map(f => Math.abs(f.a - f.up) < 0.05), rest: t.flips.map(f => Math.abs(f.a - f.rest) < 0.05),
            score: t.score, mult: t.mult, ball: !!t.ball, blocked: t.blocked, drains: t.drains, escapes: t.escapes })) };
    });

    async function launch(bots) {
        await page.evaluate(bots => { const c = window.__claw; c.seats.count = 2; c.seats.bots = bots; c.show('grid'); c.play('pinball'); }, bots);
        for (let i = 0; i < 80; i++) {
            const q = await qa().catch(() => null);
            const live = await page.evaluate(() => window.__claw.state.mgActive);
            if (live && q && q.clock < 89.9 && q.clock > 80) return true;
            await page.evaluate(() => ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2'].forEach(id => {
                const b = document.getElementById(id); if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            }));
            await page.waitForTimeout(250);
        }
        return false;
    }

    // The four zones, as each player sees them: P1 owns the bottom half, P2 the
    // top half upside down (so P2's LEFT is the screen's right).
    const Z = { p1L: [90, 780], p1R: [322, 780], p2L: [322, 110], p2R: [90, 110] };
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([k, id]) => ({ x: Z[k][0] + (Math.random() * 20 - 10), y: Z[k][1], id })) });

    // ── 1. Four fingers ─────────────────────────────────────────────────────
    ok(await launch([false, false, false, false]), 'two humans: game started');
    await touch('touchStart', [['p1L', 1], ['p1R', 2], ['p2L', 3], ['p2R', 4]]);
    await page.waitForTimeout(150);
    let q = await qa();
    ok(q.t[0].press.join() === '1,1' && q.t[1].press.join() === '1,1', `four fingers: every zone held (P1 ${q.t[0].press} P2 ${q.t[1].press})`);
    ok(q.t.every(t => t.up.every(Boolean)), 'four fingers: all four flippers up');
    await page.screenshot({ path: 'qa/shot-pinball-four.png' });
    await touch('touchEnd', [['p1L', 1], ['p2R', 4]]);   // lift P1's left and P2's right
    await page.waitForTimeout(200);
    q = await qa();
    ok(q.t[0].rest[0] && q.t[0].up[1] && q.t[1].up[0] && q.t[1].rest[1], 'lift two: only those two flippers drop');
    await touch('touchEnd', [['p1R', 2], ['p2L', 3]]);
    await page.waitForTimeout(200);

    // Chaos: random fingers going down and up in all four zones, several per
    // zone at times, for 6 s; halfway, the system cancels every touch at once.
    const keys = Object.keys(Z);
    let next = 10, down = new Map(), cancelled = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
        if (down.size < 6 && Math.random() < 0.6) { const k = keys[Math.floor(Math.random() * 4)]; down.set(next, k); await touch('touchStart', [[k, next++]]); }
        else if (down.size) {
            // Now and then the system takes every touch away at once (a call
            // coming in, a gesture): touchCancel, which carries no points.
            if (!cancelled && Date.now() - t0 > 3000) { cancelled = true; await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); down.clear(); continue; }
            const [id, k] = [...down][Math.floor(Math.random() * down.size)]; down.delete(id);
            await touch('touchEnd', [[k, id]]);
        }
        await page.waitForTimeout(20 + Math.random() * 60);
    }
    for (const [id, k] of down) await touch('touchEnd', [[k, id]]);
    await page.waitForTimeout(300);
    q = await qa();
    ok(q.ptrs === 0, `chaos: no pointers left tracked (${q.ptrs})`);
    ok(q.t.every(t => t.press.join() === '0,0' && t.rest.every(Boolean)), 'chaos: every flipper back at rest');

    // ── 2. Drain ────────────────────────────────────────────────────────────
    await page.evaluate(async () => {
        const t = (await import('/src/games/Pinball.js'))._qa().tables[0];
        t.mult = 3;
        t.ball = { x: 138, y: 395, vx: 0, vy: 400, inPlay: true };
    });
    await page.waitForTimeout(250);
    q = await qa();
    ok(q.t[0].mult === 1 && q.t[0].drains >= 1, `drain: multiplier reset to x${q.t[0].mult}`);
    await page.waitForTimeout(1200);
    q = await qa();
    ok(q.t[0].ball, 'drain: a new ball is back');

    // ── 3. Targets and the blocker ──────────────────────────────────────────
    const mult0 = q.t[0].mult;
    await page.evaluate(async () => {
        const t = (await import('/src/games/Pinball.js'))._qa().tables[0];
        t.targets = [true, true, false];
        // Roll the ball straight into the last target.
        t.ball = { x: 30, y: 211, vx: -500, vy: 0, inPlay: true };
    });
    await page.waitForTimeout(200);
    q = await qa();
    ok(q.t[0].mult === mult0 + 1, `targets: multiplier x${mult0} → x${q.t[0].mult}`);
    ok(q.t[1].blocked > 7, `targets: P2 blocked for ${q.t[1].blocked.toFixed(1)} s`);
    await page.screenshot({ path: 'qa/shot-pinball-blocked.png' });

    // ── 4. A full game against the bot ──────────────────────────────────────
    // (the two-human game is still running: wait it out, it ends on its clock)
    await page.waitForFunction(() => {
        document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
        return !document.getElementById('arcade').hidden && !window.__claw.state.mgActive;
    }, null, { timeout: 120000, polling: 500 });
    const before = errs.length;
    ok(await launch([false, true, false, false]), 'vs bot: game started');
    const start = Date.now();
    let shot = false, last = null;
    while (Date.now() - start < 115000) {
        const r = await qa().catch(() => null);
        if (r) last = r;
        if (r && !shot && r.clock < 60) { await page.screenshot({ path: 'qa/shot-pinball-play.png' }); shot = true; }
        const back = await page.evaluate(() => {
            document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
            return !document.getElementById('arcade').hidden && !window.__claw.state.mgActive;
        });
        if (back && last && last.clock === 0) break;
        await page.waitForTimeout(500);
    }
    const secs = Math.round((Date.now() - start) / 1000);
    ok(last && last.clock === 0, `vs bot: ran the full clock (${secs}s)`);
    ok(last && last.t[1].score > 0, `vs bot: the bot scored ${last?.t[1].score} (${last?.t[1].drains} drains)`);
    ok(last && last.t.every(t => t.escapes === 0), `vs bot: no ball escaped the table (${last?.t.map(t => t.escapes)})`);
    const plays = await page.evaluate(async () => (await import('/src/arcade/Stats.js')).plays('pinball'));
    ok(plays >= 2, `Stats recorded both games (plays=${plays})`);
    ok(!errs.length, 'no page errors');
    errs.forEach(e => console.log('     ' + e.slice(0, 200)));

    await browser.close();
    console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
    process.exit(failed ? 1 : 0);
})();
