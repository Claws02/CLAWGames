// ============================================================
// YATZY — the scoring rules, then two real games through claw-core:
//   1. scoreOf / totals against hand-worked cards (no game running)
//   2. vs a bot: the human rolls and plays the best preview each turn; the card
//      never turns round; the bot fills its column; the result reaches Stats
//   3. two humans: the card turns to whoever's up, and back
// Fails on any page error.
//
// usage: (static server on :8140 serving the repo root)
//   node qa/yatzy.js          (screenshots: qa/shot-yatzy-*.png)
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

    // ── 1. Rules ────────────────────────────────────────────────────────────
    const rules = await page.evaluate(async () => {
        const Y = await import('/src/games/Yatzy.js');
        const s = (c, d) => Y.scoreOf(c, d);
        return [
            ['threes 3,3,3,1,2', s('threes', [3, 3, 3, 1, 2]), 9],
            ['sixes none', s('sixes', [1, 2, 3, 4, 5]), 0],
            ['3x yes', s('three', [4, 4, 4, 1, 2]), 15],
            ['3x no', s('three', [4, 4, 1, 1, 2]), 0],
            ['4x from yatzy', s('four', [5, 5, 5, 5, 5]), 25],
            ['4x no', s('four', [5, 5, 5, 1, 1]), 0],
            ['full house', s('full', [2, 2, 3, 3, 3]), 25],
            ['full house not from yatzy', s('full', [3, 3, 3, 3, 3]), 0],
            ['small 1234+6', s('small', [6, 1, 3, 2, 4]), 30],
            ['small 3456 with dup', s('small', [3, 4, 4, 5, 6]), 30],
            ['small no', s('small', [1, 2, 3, 5, 6]), 0],
            ['large 23456', s('large', [6, 5, 4, 3, 2]), 40],
            ['large no', s('large', [1, 2, 3, 4, 6]), 0],
            ['yatzy', s('yatzy', [6, 6, 6, 6, 6]), 50],
            ['chance', s('chance', [1, 2, 3, 4, 6]), 16],
            ['bonus at 63', Y.totals({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }).total, 63 + 35],
            ['no bonus at 62', Y.totals({ ones: 2, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, chance: 20 }).total, 62 + 20],
        ];
    });
    rules.forEach(([n, got, want]) => ok(got === want, `rule ${n}: ${got} (want ${want})`));

    // The arcade lists it, HBD's roster file is untouched by it.
    const listed = await page.evaluate(async () => (await import('/src/arcade/Catalog.js')).eligible(2).includes('yatzy'));
    ok(listed, 'arcade lists yatzy at 2 seats');

    // ── 2 & 3. Real games ───────────────────────────────────────────────────
    async function game(bots, label) {
        const before = errs.length;
        await page.evaluate(bots => {
            const c = window.__claw;
            c.seats.count = 2; c.seats.bots = bots;
            c.show('grid'); c.play('yatzy');
        }, bots);
        const t0 = Date.now();
        let sawFlip = false, sawUnflip = false, flipWithBot = false, shots = 0, back = false;
        while ((Date.now() - t0) / 1000 < 600) {
            const st = await page.evaluate(() => {
                const fire = el => el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2']) {
                    const b = document.getElementById(id);
                    if (b && b.offsetParent) fire(b);
                }
                const yz = document.querySelector('.yz');
                const out = { active: window.__claw.state.mgActive, arcade: !document.getElementById('arcade').hidden, yz: !!yz };
                if (!yz) return out;
                const frame = yz.querySelector('.yz-frame');
                out.flip = frame.classList.contains('flip');
                out.turn = yz.querySelector('.yz-turn').textContent;
                out.thinking = /THINKING/.test(yz.querySelector('.yz-hint').textContent);
                const end = yz.querySelector('.yz-end');
                if (end) { out.end = end.textContent; return out; }
                if (out.thinking) return out;
                // Human: roll until three are used, then play the best preview.
                const roll = yz.querySelector('.yz-roll');
                const ghosts = [...yz.querySelectorAll('.yz-cell.ghost')];
                const used = yz.querySelectorAll('.yz-rp.used').length;
                if (!ghosts.length || (used < 3 && Math.random() < 0.4)) { fire(roll); return out; }
                const pick = yz.querySelector('.yz-cell.pick');
                if (pick) { fire(yz.querySelector('.yz-play')); return out; }
                ghosts.sort((a, b) => +b.textContent - +a.textContent);
                fire(ghosts[0]);
                return out;
            });
            if (st.yz && st.flip) sawFlip = true;
            if (st.yz && sawFlip && !st.flip) sawUnflip = true;
            if (st.yz && st.flip && bots[1]) flipWithBot = true;
            if (st.yz && shots === 0 && (Date.now() - t0) > 12000) { await page.screenshot({ path: `qa/shot-yatzy-${label}-mid.png` }); shots++; }
            if (st.end && shots === 1) {
                await page.screenshot({ path: `qa/shot-yatzy-${label}-end.png` }); shots++;
                console.log(`     end: ${st.end.replace(/\s+/g, ' ').slice(0, 120)}`);
                await page.evaluate(() => document.querySelector('.yz-end').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
            }
            if (shots >= 2 && st.arcade && !st.yz) { back = true; break; }
            await page.waitForTimeout(120);
        }
        const secs = Math.round((Date.now() - t0) / 1000);
        const plays = await page.evaluate(async () => (await import('/src/arcade/Stats.js')).plays('yatzy'));
        ok(back, `${label}: finished and returned to the arcade in ${secs}s`);
        ok(plays >= 1, `${label}: Stats recorded the game (plays=${plays})`);
        if (bots[1]) ok(!flipWithBot, `${label}: the card never turned away from the human`);
        else ok(sawFlip && sawUnflip, `${label}: the card turned to P2 and back (flip=${sawFlip} back=${sawUnflip})`);
        const newErrs = errs.slice(before);
        ok(!newErrs.length, `${label}: no page errors`);
        newErrs.forEach(e => console.log('     ' + e.slice(0, 200)));
    }

    await game([false, true, false, false], 'bot');
    await game([false, false, false, false], 'twohuman');

    await browser.close();
    console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
    process.exit(failed ? 1 : 0);
})();
