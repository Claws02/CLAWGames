// ============================================================
// ANIMAL STACK — real input and real games through claw-core:
//   1. two humans: a drag moves the animal the right way for whoever's up
//      (P2's view is turned 180°), ROTATE turns it 45°, a second finger is
//      ignored, DROP settles and passes the turn, and the picture turns to P2
//   2. the turn clock: at zero the claw lets go by itself
//   3. dropping off the edge: that player loses, the other wins, Stats
//   4. vs a bot: the human drops in the middle every turn; the bot searches,
//      aims and drops; it survives its first turns; the game ends cleanly
// Fails on any page error.
//
// usage: (static server on :8140 serving the repo root)
//   node qa/animalstack.js     (screenshots: qa/shot-animalstack-*.png)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw, null, { timeout: 20000 });

    const q = () => page.evaluate(async () => { const s = (await import('/src/games/AnimalStack.js'))._qa(); delete s.lab; delete s.setTurnLeft; return s; });
    const wait = ms => page.waitForTimeout(ms);
    const fire = (sel, type = 'pointerdown', init = {}) => page.evaluate(([sel, type, init]) => {
        const el = document.querySelector(sel); if (el) el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init }));
        return !!el;
    }, [sel, type, init]);
    const flipped = () => page.evaluate(() => document.querySelector('.as-frame')?.classList.contains('flip'));
    const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await q(); if (fn(s)) return s; await wait(150); } return q(); };
    const toArcade = () => page.waitForFunction(() => {
        document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
        return !document.getElementById('arcade').hidden && !window.__claw.state.mgActive;
    }, null, { timeout: 30000, polling: 300 });

    async function launch(bots) {
        await page.evaluate(bots => { const c = window.__claw; c.seats.count = 2; c.seats.bots = bots; c.show('grid'); c.play('animalstack'); }, bots);
        for (let i = 0; i < 60; i++) {
            if (await page.$('.as')) return true;
            await page.evaluate(() => ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2'].forEach(id => {
                const b = document.getElementById(id); if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            }));
            await wait(250);
        }
        return false;
    }
    // A finger on the canvas: down at x, move by dx, up.
    const drag = async (x, dx, id = 1) => {
        await fire('.as canvas', 'pointerdown', { pointerId: id, clientX: x, clientY: 450 });
        for (let k = 1; k <= 5; k++) await fire('.as canvas', 'pointermove', { pointerId: id, clientX: x + dx * k / 5, clientY: 450 });
        await fire('.as canvas', 'pointerup', { pointerId: id, clientX: x + dx, clientY: 450 });
    };

    // ── 1. Two humans: drag, rotate, drop, flip ─────────────────────────────
    ok(await launch([false, false, false, false]), 'two humans: game started');
    let s = await until(s => s.phase === 'aim' && s.held);
    await wait(500);
    const f0 = await flipped();
    ok(f0 === (s.turn === 1), `the picture faces whoever's up (turn P${s.turn + 1}, turned=${f0})`);
    const x0 = s.held.x;
    await drag(150, 80);
    s = await q();
    const dir = s.turn === 0 ? 1 : -1;
    ok(Math.sign(s.held.x - x0) === dir && Math.abs(s.held.x - x0) > 0.5, `drag moves the animal the way the player dragged (Δx ${(s.held.x - x0).toFixed(2)} m)`);
    // A second finger landing mid-drag doesn't take over.
    await fire('.as canvas', 'pointerdown', { pointerId: 1, clientX: 200, clientY: 450 });
    await fire('.as canvas', 'pointerdown', { pointerId: 2, clientX: 300, clientY: 450 });
    const x1 = (await q()).held.x;
    await fire('.as canvas', 'pointermove', { pointerId: 2, clientX: 380, clientY: 450 });
    ok(Math.abs((await q()).held.x - x1) < 1e-6, 'a second finger is ignored');
    await fire('.as canvas', 'pointerup', { pointerId: 1 }); await fire('.as canvas', 'pointerup', { pointerId: 2 });
    // Bring it back to the middle, rotate, drop.
    await page.evaluate(async () => { const m = await import('/src/games/AnimalStack.js'); });
    const a0 = (await q()).held.angle;
    await fire('.as-rot');
    ok(Math.abs((await q()).held.angle - a0 - Math.PI / 4) < 1e-6, 'ROTATE turns it 45°');
    const before = await q();
    // centre it: drag back by the amount moved
    await drag(250, -dir * (before.held.x) * 412 / 6.0);
    await fire('.as-drop');
    s = await q();
    ok(s.phase === 'settle' && s.pile === 1, 'DROP lets go and the pile settles');
    await page.screenshot({ path: 'qa/shot-animalstack-drop.png' });
    s = await until(s => s.phase === 'aim' && s.turn !== before.turn);
    ok(s.turn !== before.turn, `the turn passes to P${s.turn + 1}`);
    await wait(600);
    ok(await flipped() === (s.turn === 1), 'and the picture turns round to face them');

    // ── 2. The turn clock ───────────────────────────────────────────────────
    const turnNow = s.turn, pileNow = s.pile;
    await page.evaluate(async () => (await import('/src/games/AnimalStack.js'))._qa().setTurnLeft(0.2));
    s = await until(s => s.pile > pileNow, 3000);
    ok(s.pile === pileNow + 1, 'at zero the claw drops it by itself');
    s = await until(s => (s.phase === 'aim' && s.turn !== turnNow) || s.loser !== -1);

    // ── 3. Off the edge: the dropper loses ──────────────────────────────────
    if (s.loser === -1) {
        const dropper = s.turn;
        await wait(600);   // input is locked while the picture turns round
        // all the way to the right edge (from the player's own view)
        await drag(100, (s.turn === 0 ? 1 : -1) * 400);
        const aimed = await q();
        await fire('.as-drop');
        s = await until(s => s.loser !== -1, 10000);
        console.log(`     aimed x=${aimed.held?.x.toFixed(2)} (${aimed.held?.key}), after: phase ${s.phase} pile ${s.pile} loser ${s.loser}`);
        ok(s.loser === dropper, `dropping off the edge loses: P${dropper + 1} (loser P${s.loser + 1})`);
        await wait(1900);
        await page.screenshot({ path: 'qa/shot-animalstack-end.png' });
        const banners = await page.evaluate(() => document.querySelectorAll('.as-endbox').length);
        ok(banners === 2, `the result reads from both ends (${banners} banners)`);
        await fire('.as-end');
    }
    await toArcade();
    const plays = await page.evaluate(async () => (await import('/src/arcade/Stats.js')).plays('animalstack'));
    ok(plays >= 1, `Stats recorded the game (plays=${plays})`);

    // ── 4. Against the bot ──────────────────────────────────────────────────
    ok(await launch([false, true, false, false]), 'vs bot: game started');
    let botTurns = 0, botSafe = 0, maxThink = 0, t0 = Date.now(), last = null;
    while (Date.now() - t0 < 180000) {
        s = await q();
        if (s.done || s.loser !== -1) break;
        if (s.phase === 'aim' && s.turn === 0 && s.held) {
            ok(!(await flipped()), 'vs bot: the picture stays facing the human') || 0;
            // Play it properly: try spots with the same simulator the bot uses.
            const best = await page.evaluate(async () => {
                const { lab } = (await import('/src/games/AnimalStack.js'))._qa();
                let top = { x: 0, sc: -Infinity };
                for (let x = -2; x <= 2.01; x += 0.5) { const sc = lab.simulate(lab.pile(), lab.heldDef(), x, 0); if (sc > top.sc) top = { x, sc }; }
                return top.x;
            });
            await drag(200, (best - s.held.x) * 412 / 6.0);
            await fire('.as-drop');
        }
        if (s.phase === 'aim' && s.turn === 1 && (!last || last.turn !== 1 || last.phase !== 'aim')) {
            const tb = Date.now();
            const r = await until(r => r.phase !== 'aim' || r.loser !== -1, 25000);
            maxThink = Math.max(maxThink, Date.now() - tb);
            botTurns++;
            const r2 = await until(r => (r.phase === 'aim' && r.turn === 0) || r.loser !== -1, 10000);
            if (r2.loser === -1) botSafe++;
            if (botTurns === 3) await page.screenshot({ path: 'qa/shot-animalstack-bot.png' });
            last = r2; continue;
        }
        last = s;
        await wait(200);
    }
    s = await q();
    console.log(`     bot turns ${botTurns}, survived ${botSafe}, longest think ${(maxThink / 1000).toFixed(1)}s, pile ${s.pile}, loser ${s.loser === 1 ? 'bot' : s.loser === 0 ? 'human' : s.loser}`);
    ok(botTurns >= 3 && botSafe >= Math.min(3, botTurns - 1), 'vs bot: the bot plays and survives its early turns');
    ok(maxThink < 12000, 'vs bot: the bot never stalls a turn');
    await page.evaluate(() => document.querySelector('.as-end')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await toArcade().catch(() => {});
    ok(!errs.length, 'no page errors');
    errs.forEach(e => console.log('     ' + e.slice(0, 200)));
    await browser.close();
    console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
    process.exit(failed ? 1 : 0);
})();
