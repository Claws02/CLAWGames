// ============================================================
// SPARKWRIGHT SPRINT — the arcade entry end to end, plus the solo path.
//   1. roster: listed at 2 seats, in MG_PARALLEL and the Solo grid
//   2. vs a bot: both turns run (human seat autoplays the solver tape), the
//      result reaches Stats, back to the arcade, no page errors
//   3. solo (SoloArena.play): same seed → same level; reports a score > 0
// usage: (static server on :8140 serving the repo root)
//   node qa/sparkwright.js          (screenshots: qa/shot-sparkwright-*.png)
// Level rules themselves are proven headless: node src/games/sparkwright/tools/check.mjs
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__swrAutoplay = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw, null, { timeout: 20000 });

    // ── 1. Roster ──
    const roster = await page.evaluate(async () => {
        const Cat = await import('/src/arcade/Catalog.js');
        const Reg = await import('/src/claw-core/config/MinigameRegistry.js');
        const Solo = await import('/src/arcade/Solo.js');
        return { listed: Cat.eligible(2).includes('sparkwright'), parallel: Reg.MG_PARALLEL.includes('sparkwright'), solo: Solo.GAMES.includes('sparkwright') };
    });
    ok(roster.listed, 'arcade lists sparkwright at 2 seats');
    ok(roster.parallel, 'sparkwright is in MG_PARALLEL (Play Together)');
    ok(roster.solo, 'sparkwright is in the Solo grid');

    // ── 2. vs a bot ──
    const before = errs.length;
    await page.evaluate(() => { const c = window.__claw; c.seats.count = 2; c.seats.bots = [false, true, false, false]; c.show('grid'); c.play('sparkwright'); });
    const t0 = Date.now();
    let shots = 0, back = false, sawGame = false, sawResult = false, level = null;
    while ((Date.now() - t0) / 1000 < 180) {
        const st = await page.evaluate(() => {
            const fire = el => el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2']) { const b = document.getElementById(id); if (b && b.offsetParent) fire(b); }
            const layer = document.getElementById('minigame-layer');
            const start = [...(layer?.querySelectorAll('button') || [])].find(b => /START/.test(b.textContent) && b.offsetParent);
            if (start) fire(start);
            return { arcade: !document.getElementById('arcade').hidden, game: !!document.querySelector('.swr'), result: /WINS|DRAW/.test(layer?.innerText || ''), text: (layer?.innerText || '').slice(0, 160) };
        });
        if (st.game) { sawGame = true; if (!level) level = await page.evaluate(async () => (await import('/src/games/sparkwright/Sparkwright.js')).debugState().level); }
        if (st.game && shots === 0 && Date.now() - t0 > 4000) { await page.screenshot({ path: 'qa/shot-sparkwright-run.png' }); shots++; }
        if (st.result && !sawResult) { sawResult = true; await page.screenshot({ path: 'qa/shot-sparkwright-result.png' }); console.log('     result: ' + st.text.replace(/\s+/g, ' ')); }
        if (sawResult && st.arcade && !st.game) { back = true; break; }
        await page.waitForTimeout(150);
    }
    const plays = await page.evaluate(async () => (await import('/src/arcade/Stats.js')).plays('sparkwright'));
    ok(sawGame, `vs bot: the level ran (${level})`);
    ok(sawResult, 'vs bot: both turns finished and a result was shown');
    ok(back, `vs bot: returned to the arcade in ${Math.round((Date.now() - t0) / 1000)}s`);
    ok(plays >= 1, `vs bot: Stats recorded the game (plays=${plays})`);

    // ── 3. Solo ──
    const solo = await page.evaluate(async () => {
        const SA = await import('/src/claw-core/minigames/SoloArena.js');
        const SW = await import('/src/games/sparkwright/Sparkwright.js');
        const run = seed => new Promise(res => { let lvl = null; const iv = setInterval(() => { lvl = lvl || SW.debugState().level; const b = [...document.querySelectorAll('#minigame-layer button')].find(x => /START/.test(x.textContent) && x.offsetParent); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, 50); SA.play('sparkwright', seed, score => { clearInterval(iv); res({ score, lvl }); }); });
        const a = await run(4242); SA.reset();
        const b = await run(4242); SA.reset();
        return { a, b };
    });
    ok(solo.a.score > 0 && solo.b.score > 0, `solo: reported scores ${solo.a.score}, ${solo.b.score}`);
    ok(solo.a.lvl && solo.a.lvl === solo.b.lvl, `solo: same seed → same level (${solo.a.lvl} / ${solo.b.lvl})`);

    const newErrs = errs.slice(before);
    ok(!newErrs.length, 'no page errors');
    newErrs.forEach(e => console.log('     ' + e.slice(0, 200)));
    await browser.close();
    console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
    process.exit(failed ? 1 : 0);
})();
