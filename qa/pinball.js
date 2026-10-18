// ============================================================
// CLAW PINBALL — real touches and real games through claw-core:
//   1. four fingers at once (one per zone), lifting two, then 6 s of random
//      multi-finger chaos with a system touchcancel: nothing stuck
//   2. nudge: a real flick raises the tilt meter; three TILT the table and the
//      flippers stay dead while held
//   3. drain resets the multiplier; inside the ball saver it doesn't
//   4. kickback, targets → LOCK + an attack on the other table
//   5. the claw: two ramp shots with LOCK lit → two locks → MULTIBALL, then a
//      JACKPOT on the ramp
//   6. the scoop starts a mission; three missions → CLAW CRAZE
//   7. each attack does what it says (freeze, mirror, heavy, blocker)
//   8. vs a bot: the full 120 s, the bot scores, no ball ever escapes, Stats
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

    // Read a summary of both tables, or run `fn(tables, api)` in the page.
    const qa = () => page.evaluate(async () => {
        const q = (await import('/src/games/Pinball.js'))._qa();
        if (!q.tables) return null;
        return { clock: q.clock, over: q.over, ptrs: q.ptrs, t: q.tables.map(t => ({
            press: t.press.slice(), up: t.flips.map(f => Math.abs(f.a - f.up) < 0.05), rest: t.flips.map(f => Math.abs(f.a - f.rest) < 0.05),
            score: t.score, mult: t.mult, balls: t.balls.length, drains: t.drains, escapes: t.escapes, saves: t.saves,
            tilt: t.t < t.tiltUntil, meter: t.tiltMeter, lockLit: t.lockLit, locks: t.locks, multiball: t.multiball,
            jackpots: t.jackpots, mission: t.mission && t.mission.key, missionsDone: t.missionsDone, wizard: t.t < t.wizardUntil,
            attack: t.attack && { key: t.attack.key, live: t.attack.warn <= 0 }, kickback: t.kickback, claw: !!t.claw, rides: t.rides.length })) };
    });
    const run = (src, arg) => page.evaluate(async ({ src, arg }) => {
        const api = (await import('/src/games/Pinball.js'))._qa();
        return new Function('T', 'api', 'arg', src)(api.tables, api, arg);
    }, { src, arg });
    const wait = ms => page.waitForTimeout(ms);

    async function launch(bots) {
        await page.evaluate(bots => { const c = window.__claw; c.seats.count = 2; c.seats.bots = bots; c.show('grid'); c.play('pinball'); }, bots);
        for (let i = 0; i < 80; i++) {
            const q = await qa().catch(() => null);
            const live = await page.evaluate(() => window.__claw.state.mgActive);
            if (live && q && q.clock < 119.9 && q.clock > 110) return true;
            await page.evaluate(() => ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2'].forEach(id => {
                const b = document.getElementById(id); if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            }));
            await wait(250);
        }
        return false;
    }

    // The four zones, as each player sees them: P1 owns the bottom half, P2 the
    // top half upside down (so P2's LEFT is the screen's right).
    const Z = { p1L: [90, 780], p1R: [322, 780], p2L: [322, 110], p2R: [90, 110] };
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([k, id, dy = 0]) => ({ x: Z[k][0], y: Z[k][1] + dy, id })) });

    // ── 1. Four fingers ─────────────────────────────────────────────────────
    ok(await launch([false, false, false, false]), 'two humans: game started');
    await touch('touchStart', [['p1L', 1], ['p1R', 2], ['p2L', 3], ['p2R', 4]]);
    await wait(150);
    let q = await qa();
    ok(q.t[0].press.join() === '1,1' && q.t[1].press.join() === '1,1', `four fingers: every zone held (P1 ${q.t[0].press} P2 ${q.t[1].press})`);
    ok(q.t.every(t => t.up.every(Boolean)), 'four fingers: all four flippers up');
    await touch('touchEnd', [['p1L', 1], ['p2R', 4]]);
    await wait(200);
    q = await qa();
    ok(q.t[0].rest[0] && q.t[0].up[1] && q.t[1].up[0] && q.t[1].rest[1], 'lift two: only those two flippers drop');
    await touch('touchEnd', [['p1R', 2], ['p2L', 3]]);
    await wait(200);

    const keys = Object.keys(Z);
    let next = 10, down = new Map(), cancelled = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
        if (down.size < 6 && Math.random() < 0.6) { const k = keys[Math.floor(Math.random() * 4)]; down.set(next, k); await touch('touchStart', [[k, next++]]); }
        else if (down.size) {
            if (!cancelled && Date.now() - t0 > 3000) { cancelled = true; await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); down.clear(); continue; }
            const [id, k] = [...down][Math.floor(Math.random() * down.size)]; down.delete(id);
            await touch('touchEnd', [[k, id]]);
        }
        await wait(20 + Math.random() * 60);
    }
    for (const [id, k] of down) await touch('touchEnd', [[k, id]]);
    await wait(300);
    q = await qa();
    ok(q.ptrs === 0, `chaos: no pointers left tracked (${q.ptrs})`);
    ok(q.t.every(t => t.press.join() === '0,0' && t.rest.every(Boolean)), 'chaos: every flipper back at rest');

    // ── 2. Nudge and tilt ───────────────────────────────────────────────────
    const flick = async (k, id) => {   // a real finger: down, up the table 60 px fast, lift
        const dir = k.startsWith('p1') ? -1 : 1;
        await touch('touchStart', [[k, id]]);
        await touch('touchMove', [[k, id, dir * 30]]);
        await touch('touchMove', [[k, id, dir * 60]]);
        await touch('touchEnd', [[k, id, dir * 60]]);
    };
    await run('T[0].tiltMeter = 0; T[0].tiltUntil = 0;');
    await flick('p1L', 100);
    q = await qa();
    ok(q.t[0].meter > 0.8 && !q.t[0].tilt, `nudge: a flick bumps the table (meter ${q.t[0].meter.toFixed(2)})`);
    await flick('p2L', 101);
    q = await qa();
    ok(q.t[1].meter > 0.8, 'nudge: P2 flicks toward their own far end');
    await run('T[0].tiltMeter = 0;');
    await flick('p1R', 102); await flick('p1L', 103); await flick('p1R', 105);
    q = await qa();
    ok(q.t[0].tilt, 'tilt: three nudges in a burst TILT the table');
    await touch('touchStart', [['p1L', 104]]);
    await wait(200);
    q = await qa();
    ok(q.t[0].rest[0], 'tilt: a held flipper stays dead');
    await touch('touchEnd', [['p1L', 104]]);
    await run('T[0].tiltUntil = 0; T[1].tiltMeter = 0;');

    // ── 3. Drain and the ball saver ─────────────────────────────────────────
    const dropBall = 'T[arg.p].balls = [{ x: arg.x ?? 138, y: arg.y ?? 395, vx: arg.vx ?? 0, vy: arg.vy ?? 400, inPlay: true }];';
    await run('T[0].saveUntil = 0; T[0].mult = 3;' + dropBall, { p: 0 });
    await wait(250);
    q = await qa();
    ok(q.t[0].mult === 1, `drain: multiplier reset to x${q.t[0].mult}`);
    await wait(1300);
    q = await qa();
    ok(q.t[0].balls >= 1, 'drain: a new ball is back');
    await run('T[0].saveUntil = T[0].t + 5; T[0].mult = 4;' + dropBall, { p: 0 });
    await wait(250);
    q = await qa();
    ok(q.t[0].mult === 4 && q.t[0].saves >= 1, `ball saver: saved, still x${q.t[0].mult}`);

    // ── 4. Kickback, targets, lock, attack ──────────────────────────────────
    await run('T[0].kickback = true; T[0].saveUntil = 0;' + dropBall, { p: 0, x: 10, y: 345, vy: 300 });
    await wait(120);
    q = await qa();
    ok(!q.t[0].kickback && q.t[0].balls >= 1, 'kickback: kicked the ball back out of the left outlane');
    await run('T[0].targets = [true, true, false]; T[0].lockLit = false; T[1].attack = null;' + dropBall, { p: 0, x: 30, y: 213, vx: -500, vy: 0 });
    await wait(200);
    q = await qa();
    ok(q.t[0].lockLit, 'targets: LOCK is lit');
    ok(q.t[1].attack, `targets: attack sent to P2 (${q.t[1].attack?.key})`);
    await wait(900);
    q = await qa();
    ok(q.t[1].attack?.live, 'attack: lands after its warning');
    await page.screenshot({ path: 'qa/shot-pinball-attack.png' });

    // ── 5. Claw lock → multiball → jackpot ──────────────────────────────────
    for (let n = 1; n <= 2; n++) {
        await run('T[0].lockLit = true; T[0].claw = null;' + dropBall, { p: 0, x: 241, y: 178, vx: 0, vy: -500 });
        await wait(n === 1 ? 900 : 700);
        if (n === 1) await page.screenshot({ path: 'qa/shot-pinball-claw.png' });
        await wait(1600);
        q = await qa();
        ok(n === 1 ? q.t[0].locks === 1 : q.t[0].multiball, n === 1 ? `claw: ball locked (${q.t[0].locks}/2)` : `claw: second lock starts MULTIBALL (${q.t[0].balls} balls)`);
    }
    await run('T[0].saveUntil = T[0].t + 30; T[0].balls.push({ x: 241, y: 178, vx: 0, vy: -500, inPlay: true });');
    await wait(200);
    q = await qa();
    ok(q.t[0].jackpots >= 1, `multiball: ramp scores a JACKPOT (${q.t[0].jackpots})`);
    await page.screenshot({ path: 'qa/shot-pinball-multiball.png' });

    // ── 6. Missions → wizard ────────────────────────────────────────────────
    await run('T[1].mission = null; T[1].missionsDone = 0; T[1].wizardUntil = 0; T[1].held = null; T[1].superLit = false;' + dropBall, { p: 1, x: 138, y: 206, vx: 0, vy: 80 });
    await wait(150);
    q = await qa();
    ok(!!q.t[1].mission, `scoop: mission started (${q.t[1].mission})`);
    // A mission completes on real play: one bumper hit finishes a 1-hit Pop Frenzy.
    await run(`const t = T[1]; t.missionsDone = 0; t.mission = { key: 'pops', name: 'POP FRENZY', hint: '', need: 1, have: 0, until: t.t + 20 }; t.balls = [{ x: 104, y: 84, vx: 0, vy: 200, inPlay: true }];`);
    await wait(200);
    q = await qa();
    ok(q.t[1].missionsDone === 1 && !q.t[1].mission, `missions: a bumper hit completed POP FRENZY (${q.t[1].missionsDone} done)`);
    // The real path into the wizard: complete a third mission through _progress.
    await run(`const t = T[1]; t.missionsDone = 2; t.mission = { key: 'pops', name: 'POP FRENZY', hint: '', need: 1, have: 0, until: t.t + 20 }; t.balls = [{ x: 104, y: 84, vx: 0, vy: 200, inPlay: true }];`);
    await wait(200);
    q = await qa();
    ok(q.t[1].wizard, 'third mission (a real bumper hit) starts CLAW CRAZE');

    // ── 7. Each attack ──────────────────────────────────────────────────────
    await run(`api.attack(0, 'freeze'); T[0].attack.warn = 0; T[0].tiltUntil = 0;`);
    await touch('touchStart', [['p1L', 200]]); await wait(150);
    q = await qa();
    ok(q.t[0].rest[0], 'FREEZE: a held flipper stays down');
    await touch('touchEnd', [['p1L', 200]]);
    await run(`api.attack(0, 'mirror'); T[0].attack.warn = 0;`);
    await touch('touchStart', [['p1L', 201]]); await wait(150);
    q = await qa();
    ok(q.t[0].up[1] && q.t[0].rest[0], 'MIRROR: the left zone raises the right flipper');
    await touch('touchEnd', [['p1L', 201]]);
    await run(`api.attack(0, 'heavy'); T[0].attack.warn = 0;`);
    await wait(100);
    q = await qa();
    ok(q.t[0].attack?.key === 'heavy', 'HEAVY: active');
    await run(`api.attack(0, 'blocker'); T[0].attack.warn = 0; T[0].targets = [false,false,false];` + dropBall, { p: 0, x: 40, y: 190, vx: -500, vy: 0 });
    await wait(150);
    q = await qa();
    const tg = await run('return T[0].targets.some(Boolean);');
    ok(!tg, 'BLOCKER: a shot at the targets is stopped by the bar');
    await page.screenshot({ path: 'qa/shot-pinball-blocker.png' });

    // Wait out the two-human game.
    await page.waitForFunction(() => {
        document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
        return !document.getElementById('arcade').hidden && !window.__claw.state.mgActive;
    }, null, { timeout: 150000, polling: 500 });

    // ── 8. A full game against the bot ──────────────────────────────────────
    const before = errs.length;
    ok(await launch([false, true, false, false]), 'vs bot: game started');
    const start = Date.now();
    let shot = false, last = null;
    while (Date.now() - start < 150000) {
        const r = await qa().catch(() => null);
        if (r) last = r;
        if (r && !shot && r.clock < 70) { await page.screenshot({ path: 'qa/shot-pinball-play.png' }); shot = true; }
        const back = await page.evaluate(() => {
            document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
            return !document.getElementById('arcade').hidden && !window.__claw.state.mgActive;
        });
        if (back && last && last.clock === 0) break;
        await wait(500);
    }
    const secs = Math.round((Date.now() - start) / 1000);
    ok(last && last.clock === 0, `vs bot: ran the full clock (${secs}s)`);
    ok(last && last.t[1].score > 0, `vs bot: the bot scored ${last?.t[1].score.toLocaleString()} (${last?.t[1].drains} drains, x${last?.t[1].mult})`);
    console.log(`     idle P1: ${last?.t[0].score.toLocaleString()} (${last?.t[0].drains} drains)`);
    ok(last && last.t.every(t => t.escapes === 0), `vs bot: no ball escaped the table (${last?.t.map(t => t.escapes)})`);
    const plays = await page.evaluate(async () => (await import('/src/arcade/Stats.js')).plays('pinball'));
    ok(plays >= 2, `Stats recorded both games (plays=${plays})`);
    ok(!errs.length, 'no page errors');
    errs.forEach(e => console.log('     ' + e.slice(0, 200)));

    await browser.close();
    console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
    process.exit(failed ? 1 : 0);
})();
