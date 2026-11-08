// ============================================================
// SHUT THE BOX — the rules, then real games through claw-core:
//   1. options / count / openTotal / expected / bestTile (no game running)
//   2. vs a bot: the human rolls and shuts; the box never turns away from the
//      human; both play their whole box in turn; the result reaches Stats with
//      a score each (tiles shut)
//   3. two humans: the box turns to whoever's up
// Fails on any page error.
//
// usage: (static server on :8140 serving the repo root)
//   node qa/shutbox.js          (screenshots: qa/shot-shutbox-*.png)
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
    const r = await page.evaluate(async () => {
        const S = await import('/src/games/ShutTheBox.js');
        const m = (...ns) => ns.reduce((a, n) => a | (1 << (n - 1)), 0);
        return {
            o34: S.options([3, 4], 0), o34shut3: S.options([3, 4], m(3)), o34stuck: S.options([3, 4], m(3, 4, 7)),
            o33: S.options([3, 3], 0), o66: S.options([6, 6], m(6)), o11: S.options([1, 1], 0),
            c: S.count(m(1, 5, 12)), open: S.openTotal(m(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)), full: S.count(m(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)),
            ev0: S.expected(0), evAlmost: S.expected(m(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)), evFull: S.expected(m(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)),
            best: S.bestTile([6, 6], 0), best2: S.bestTile([1, 2], 0),
        };
    });
    ok(r.o34.join() === '3,4,7', `a 3 and a 4 can shut 3, 4 or 7 (${r.o34})`);
    ok(r.o34shut3.join() === '4,7', `with the 3 shut: 4 or 7 (${r.o34shut3})`);
    ok(r.o34stuck.length === 0, 'with 3, 4 and 7 all shut you are stuck');
    ok(r.o33.join() === '3,6' && r.o11.join() === '1,2', `doubles: 3+3 shuts 3 or 6; 1+1 shuts 1 or 2 (${r.o33} / ${r.o11})`);
    ok(r.o66.join() === '12', `6+6 with the 6 shut: only the 12 (${r.o66})`);
    ok(r.c === 3 && r.open === 12 && r.full === 12, 'counting shut tiles, and the open total');
    ok(r.ev0 > 4 && r.ev0 < 12 && Math.abs(r.evAlmost - 1 / 36) < 1e-9 && r.evFull === 0, `the bot's odds: ${r.ev0.toFixed(2)} tiles from a fresh box; with only the 12 open, 1/36`);
    ok(r.best === 12, `the bot shuts the 12 with double six (the only roll that can) (${r.best})`);
    ok([1, 2, 3].includes(r.best2), `the bot picks a legal tile for 1+2 (${r.best2})`);

    const listed = await page.evaluate(async () => (await import('/src/arcade/Catalog.js')).eligible(2).includes('shutbox'));
    ok(listed, 'arcade lists Shut the Box at 2 seats');

    // ── 2 & 3. Real games ───────────────────────────────────────────────────
    async function game(bots, label) {
        const before = errs.length;
        await page.evaluate(bots => { const c = window.__claw; c.seats.count = 2; c.seats.bots = bots; c.show('grid'); c.play('shutbox'); }, bots);
        const t0 = Date.now();
        let faces = new Set(), sawFlip = false, sawUnflip = false, flipWithBot = false, shots = 0, back = false, endText = '', state = null, bothPlayed = false;
        while ((Date.now() - t0) / 1000 < 400) {
            const st = await page.evaluate(async () => {
                const fire = el => el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2']) { const b = document.getElementById(id); if (b && b.offsetParent) fire(b); }
                const sb = document.querySelector('.sb');
                const out = { arcade: !document.getElementById('arcade').hidden, sb: !!sb };
                if (!sb) return out;
                out.flip = sb.querySelector('.bt-frame').classList.contains('flip');
                const end = sb.querySelector('.bt-end');
                if (end) { out.end = end.textContent; return out; }
                const S = await import('/src/games/ShutTheBox.js'), d = S._debugState();
                out.d = d;
                if (/…/.test(sb.querySelector('.bt-hint').textContent)) return out;   // the bot's go
                if (d.phase === 'roll') fire(sb.querySelector('.bt-btn'));
                else if (d.phase === 'pick') fire(sb.querySelector(`.sb-tile[data-n="${Math.max(...d.opts)}"]`));
                return out;
            });
            if (st.sb && !st.end) faces.add(!!st.flip);
            if (st.sb && st.flip) sawFlip = true;
            if (st.sb && sawFlip && !st.flip) sawUnflip = true;
            if (st.sb && st.flip && bots[1]) flipWithBot = true;
            if (st.d) { state = st.d; if (st.d.played[0] || st.d.played[1]) bothPlayed = bothPlayed || (st.d.turn !== st.d.first); }
            if (st.sb && shots === 0 && st.d && st.d.phase === 'pick' && st.d.boxes.some(b => b)) { await page.screenshot({ path: `qa/shot-shutbox-${label}-mid.png` }); shots++; }
            if (st.end && !endText) {
                endText = st.end.replace(/\s+/g, ' ');
                await page.screenshot({ path: `qa/shot-shutbox-${label}-end.png` });
                await page.evaluate(() => document.querySelector('.bt-end').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
            }
            if (endText && st.arcade && !st.sb) { back = true; break; }
            await page.waitForTimeout(120);
        }
        console.log(`     end: ${endText.slice(0, 140)}`);
        const secs = Math.round((Date.now() - t0) / 1000);
        const plays = await page.evaluate(async () => (await import('/src/arcade/Stats.js')).plays('shutbox'));
        ok(back, `${label}: finished and returned to the arcade in ${secs}s`);
        ok(bothPlayed, `${label}: the second player took their whole box after the first`);
        ok(/TILES SHUT/.test(endText) && /(WINS|DRAW)/.test(endText), `${label}: the end card names the result`);
        ok(plays >= 1, `${label}: Stats recorded the game (plays=${plays})`);
        if (bots[1]) ok(!flipWithBot, `${label}: the box never turned away from the human`);
        else ok(faces.size === 2, `${label}: the box faced each player on their go (first P${state.first + 1})`);
        const newErrs = errs.slice(before);
        ok(!newErrs.length, `${label}: no page errors`);
        newErrs.forEach(e => console.log('     ' + e.slice(0, 200)));
    }
    await game([false, true, false, false], 'bot');
    await game([false, false, false, false], 'twohuman');

    await browser.close();
    console.log(failed ? `\nSHUT THE BOX: ${failed} FAILED` : '\nSHUT THE BOX PASS');
    process.exit(failed ? 1 : 0);
})();
