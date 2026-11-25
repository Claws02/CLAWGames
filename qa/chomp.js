// ============================================================
// CHOMP — Chomp Champs (src/games/ChompChamps.js), headless.
//   1. the rules: what each ball is worth to each player, the bot's sums
//   2. a real game: a ball fed into player 1's jaws and a tap on their half
//      scores it (red +1, blue −1, gold +3); a bomb stuns for 2 s and a
//      stunned gobbler can't chomp
//   3. a game vs the bot to the end (the bot scores), then a two-player game
//      with random taps on both halves; both reach Stats; no page errors
//
// usage: node qa/chomp.js        (static server on :8140)
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
    await page.goto(BASE); await page.waitForFunction(() => !!window.__claw);

    // ── 1. Rules ────────────────────────────────────────────────────────────
    const R = await page.evaluate(async () => {
        const C = await import('/src/games/ChompChamps.js');
        return {
            p1: ['red', 'blue', 'gold', 'bomb'].map(k => C.worth(k, 0)),
            p2: ['red', 'blue', 'gold', 'bomb'].map(k => C.worth(k, 1)),
            val: [C.value(['red', 'red'], 0), C.value(['red', 'bomb'], 0), C.value(['blue', 'gold'], 0)],
            mix: (() => { const n = { red: 0, blue: 0, gold: 0, bomb: 0 }; for (let i = 0; i < 4000; i++) n[C.rollKind()]++; return n; })(),
        };
    });
    ok(R.p1.join() === '1,-1,3,stun' && R.p2.join() === '-1,1,3,stun', `worth: P1 ${R.p1} · P2 ${R.p2}`);
    ok(R.val.join() === '2,-1.5,2', `the bot's sums: two reds 2, red+bomb -1.5, blue+gold 2 (${R.val})`);
    ok(R.mix.red > 1500 && R.mix.blue > 1500 && R.mix.gold > 100 && R.mix.bomb > 150, `the mix of balls: ${JSON.stringify(R.mix)}`);

    // ── 2. Chomping, for real ───────────────────────────────────────────────
    const startGame = bots => page.evaluate(b => { const c = window.__claw; c.seats.count = 2; c.seats.bots = b; c.show('grid'); c.play('chompchamps'); }, bots);
    const pastIntro = () => page.evaluate(() => {
        const fire = el => el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2']) { const b = document.getElementById(id); if (b && b.offsetParent) fire(b); }
    });
    await startGame([false, true, false, false]);
    for (let i = 0; i < 40; i++) { await pastIntro(); await page.waitForTimeout(150); if (await page.evaluate(async () => { const s = (await import('/src/games/ChompChamps.js'))._debugState(); return s.clock < 44.5; })) break; }
    // Tap player 1's half at the bottom of the screen.
    const tapP1 = () => page.evaluate(() => { const o = document.querySelector('#minigame-layer canvas').parentElement, r = o.getBoundingClientRect(); o.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.bottom - 20, pointerId: 3 })); });
    const feedAndChomp = async kind => {
        await page.waitForTimeout(500);   // any chomp in progress recovers
        const before = await page.evaluate(async () => (await import('/src/games/ChompChamps.js'))._debugState());
        await page.evaluate(async k => { const C = await import('/src/games/ChompChamps.js'); C._debugClear(); C._debugFeed(0, k); }, kind);
        await tapP1();
        await page.waitForTimeout(250);
        const after = await page.evaluate(async () => (await import('/src/games/ChompChamps.js'))._debugState());
        return { d: after.scores[0] - before.scores[0], stun: after.stun[0] };
    };
    const red = await feedAndChomp('red'), blue = await feedAndChomp('blue'), gold = await feedAndChomp('gold');
    ok(red.d === 1 && blue.d === -1 && gold.d === 3, `a tap chomps what's in reach: red ${red.d >= 0 ? '+' : ''}${red.d}, blue ${blue.d}, gold +${gold.d}`);
    const bomb = await feedAndChomp('bomb');
    ok(bomb.stun > 1.5, `a bomb stuns (${bomb.stun.toFixed(2)} s left)`);
    const stunned = await feedAndChomp('red');
    ok(stunned.d === 0, 'a stunned gobbler can\'t chomp');

    // ── 3. Whole games ──────────────────────────────────────────────────────
    async function toTheEnd(label, taps) {
        const t0 = Date.now();
        let back = false;
        while ((Date.now() - t0) / 1000 < 90) {
            await pastIntro();
            if (taps) await page.evaluate(() => {
                const o = document.querySelector('#minigame-layer canvas')?.parentElement;
                if (!o) return;
                const r = o.getBoundingClientRect();
                for (const y of [r.bottom - 20, r.top + 20]) if (Math.random() < 0.35) o.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: y, pointerId: Math.floor(Math.random() * 1e6) }));
            });
            if (await page.evaluate(() => !document.getElementById('arcade').hidden && !document.querySelector('#minigame-layer canvas'))) { back = true; break; }
            await page.waitForTimeout(200);
        }
        return { back, secs: Math.round((Date.now() - t0) / 1000) };
    }
    // Watch the bot's score during the rest of this game.
    let botBest = 0;
    const watcher = setInterval(async () => { try { const s = await page.evaluate(async () => (await import('/src/games/ChompChamps.js'))._debugState()); botBest = Math.max(botBest, s.scores[1]); } catch (e) {} }, 1000);
    const g1 = await toTheEnd('bot', false);
    clearInterval(watcher);
    ok(g1.back, `vs the bot: the game ends and returns to the arcade (${g1.secs}s)`);
    ok(botBest > 0, `the bot chomps its colour (reached ${botBest})`);
    await startGame([false, false, false, false]);
    const g2 = await toTheEnd('twohuman', true);
    ok(g2.back, `two players, random taps on both halves: it ends (${g2.secs}s)`);
    const plays = await page.evaluate(async () => (await import('/src/arcade/Stats.js')).plays('chompchamps'));
    ok(plays >= 2, `Stats recorded both games (plays=${plays})`);
    ok(await page.evaluate(async () => (await import('/src/arcade/Catalog.js')).eligible(2).includes('chompchamps')), 'the arcade lists it at 2 seats');

    ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    console.log(failed ? `\nCHOMP: ${failed} FAILED` : '\nCHOMP PASS');
    process.exit(failed ? 1 : 0);
})();
