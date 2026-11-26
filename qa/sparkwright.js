// ============================================================
// SPARKWRIGHT — the campaign (Home Base + every shift) and the arcade sprint.
//   1. roster: listed at 2 seats, in MG_PARALLEL and the Solo grid
//   2. vs a bot: both turns run (human seat autoplays the solver tape), the
//      result reaches Stats, back to the arcade, no page errors
//   3. solo (SoloArena.play): same seed → same level; reports a score > 0
//   4. campaign from the SOLO hub: Home Base, a locked door stays shut, all six
//      shifts played (solver tapes) and each one comes BACK TO BASE at its own
//      door with the next door open; ✕ in a shift goes to base, not out; the
//      Field Manual; progress survives a reload; ✕ at base returns to the hub
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
    // Clear saves once per test run, not on every load (section 4 reloads to prove saving).
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('qa-swr')) { localStorage.clear(); sessionStorage.setItem('qa-swr', '1'); } } catch (e) {} window.__swrAutoplay = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw, null, { timeout: 20000 });

    // ── 1. Roster ──
    const roster = await page.evaluate(async () => {
        const Cat = await import('/src/arcade/Catalog.js');
        const Reg = await import('/src/claw-core/config/MinigameRegistry.js');
        const Solo = await import('/src/arcade/Solo.js');
        return { listed: Cat.eligible(2).includes('sparksprint'), parallel: Reg.MG_PARALLEL.includes('sparksprint'), solo: Solo.GAMES.includes('sparksprint') };
    });
    ok(roster.listed, 'arcade lists sparksprint at 2 seats');
    ok(roster.parallel, 'sparksprint is in MG_PARALLEL (Play Together)');
    ok(roster.solo, 'sparksprint is in the Solo grid');

    // ── 2. vs a bot ──
    const before = errs.length;
    await page.evaluate(() => { const c = window.__claw; c.seats.count = 2; c.seats.bots = [false, true, false, false]; c.show('grid'); c.play('sparksprint'); });
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
    const plays = await page.evaluate(async () => (await import('/src/arcade/Stats.js')).plays('sparksprint'));
    ok(sawGame, `vs bot: the level ran (${level})`);
    ok(sawResult, 'vs bot: both turns finished and a result was shown');
    ok(back, `vs bot: returned to the arcade in ${Math.round((Date.now() - t0) / 1000)}s`);
    ok(plays >= 1, `vs bot: Stats recorded the game (plays=${plays})`);

    // ── 3. Solo ──
    const solo = await page.evaluate(async () => {
        const SA = await import('/src/claw-core/minigames/SoloArena.js');
        const SW = await import('/src/games/sparkwright/Sparkwright.js');
        const run = seed => new Promise(res => { let lvl = null; const iv = setInterval(() => { lvl = lvl || SW.debugState().level; const b = [...document.querySelectorAll('#minigame-layer button')].find(x => /START/.test(x.textContent) && x.offsetParent); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, 50); SA.play('sparksprint', seed, score => { clearInterval(iv); res({ score, lvl }); }); });
        const a = await run(4242); SA.reset();
        const b = await run(4242); SA.reset();
        return { a, b };
    });
    ok(solo.a.score > 0 && solo.b.score > 0, `solo: reported scores ${solo.a.score}, ${solo.b.score}`);
    ok(solo.a.lvl && solo.a.lvl === solo.b.lvl, `solo: same seed → same level (${solo.a.lvl} / ${solo.b.lvl})`);

    // ── 4. Campaign ──
    const openCampaign = async () => {
        await page.evaluate(() => window.__claw.show('home'));
        await page.click('[data-go="solo"]'); await page.waitForSelector('#scr-solo:not([hidden])');
        await page.$eval('#solo-list [data-game="sparkwright"]', e => e.scrollIntoView({ block: 'center' }));
        await page.click('#solo-list [data-game="sparkwright"]'); await page.click('#pv-play');
        await page.waitForFunction(() => window.__swrCampaign?.scene === 'hub', null, { timeout: 10000 });
        await page.waitForTimeout(300);
    };
    await openCampaign();
    await page.screenshot({ path: 'qa/shot-sparkwright-base.png' });
    const C = fn => page.evaluate(fn);
    const doorAt = async to => { await page.evaluate(to => window.__swrCampaign.toHub(to), to); await page.waitForTimeout(250); };
    const pressUp = async () => { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300); };
    await doorAt('m02'); await pressUp();
    ok(await C(() => window.__swrCampaign.scene) === 'hub', 'campaign: door 02 is locked before 01 is cleared');
    const levels = await page.evaluate(async () => (await import('/src/games/sparkwright/levels/index.js')).LEVELS.map(l => l.id));
    let allBack = true;
    for (let i = 0; i < levels.length; i++) {
        const id = levels[i];
        await doorAt(id); await pressUp();
        const inShift = await C(() => window.__swrCampaign.scene);
        if (i === 0) {   // ✕ in a shift goes back to base, not out of the game
            await page.locator('.swr-hud button[title="Exit"]').click(); await page.waitForTimeout(300);
            ok(await C(() => window.__swrCampaign.scene) === 'hub' && await C(() => !!document.querySelector('.swr')), 'campaign: ✕ in a shift returns to Home Base');
            await doorAt(id); await pressUp();
        }
        const won = await page.waitForFunction(() => window.__swrCampaign.game?.done, null, { timeout: 30000 }).then(() => true).catch(() => false);
        if (i === 1) await page.screenshot({ path: 'qa/shot-sparkwright-complete.png' });
        await page.locator('.swr-card button', { hasText: 'BACK TO BASE' }).click();
        await page.waitForTimeout(400);
        const st = await page.evaluate(id => { const c = window.__swrCampaign, p = c.game.world.s.p, d = c.game.world.L.dev.portal.find(x => x.to === id); return { scene: c.scene, atDoor: Math.abs(p.x + 0.35 - (d.x + 0.5)) < 0.6, done: c.progress.summary().done }; }, id);
        const next = levels[i + 1];
        const nextOpen = !next || await page.evaluate(n => window.__swrCampaign.progress.isUnlocked(n), next);
        const good = inShift === id && won && st.scene === 'hub' && st.atDoor && st.done === i + 1 && nextOpen;
        if (!good) { allBack = false; console.log('     ', id, JSON.stringify({ inShift, won, ...st, nextOpen })); }
    }
    ok(allBack, `campaign: all ${levels.length} shifts played, each back at its own door with the next door open`);
    await page.screenshot({ path: 'qa/shot-sparkwright-base-done.png' });
    await doorAt('manual'); await pressUp();
    const man = await C(() => { const m = document.querySelector('.swr-manual'); return m ? m.querySelectorAll('.c:not(.no)').length : -1; });
    ok(man === 8, `campaign: the Field Manual lists every learned formula (${man})`);
    await page.locator('.swr-manual button').click();
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!window.__claw);
    await openCampaign();
    const kept = await C(() => window.__swrCampaign.progress.summary());
    ok(kept.done === levels.length, `campaign: progress survives a reload (${kept.done}/${kept.total}, ${kept.stars}★)`);
    await page.locator('.swr-hud button[title="Exit"]').click(); await page.waitForTimeout(500);
    const out = await C(() => ({ solo: !document.getElementById('scr-solo').hidden, swr: !!document.querySelector('.swr'), card: document.querySelector('#solo-list [data-game="sparkwright"] .cs')?.textContent }));
    ok(out.solo && !out.swr, `campaign: ✕ at Home Base returns to the solo hub (card: ${out.card})`);

    const newErrs = errs.slice(before);
    ok(!newErrs.length, 'no page errors');
    newErrs.forEach(e => console.log('     ' + e.slice(0, 200)));
    await browser.close();
    console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
    process.exit(failed ? 1 : 0);
})();
