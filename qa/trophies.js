// ============================================================
// TROPHIES — the rules award what they say and nothing else, an earned trophy
// stays earned (and is not announced twice), a save from before trophies
// existed still loads, the screen fits a phone, and a real game played
// through the UI moves the numbers.
//
// usage: (static server on :8140 serving the repo root)   node qa/trophies.js
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';

const pass = [], fail = [];
const ok = (name, cond, detail = '') => (cond ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const boot = async () => { await page.goto(BASE); await page.waitForFunction(() => !!window.__claw, null, { timeout: 20000 }); };

    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await boot();
    ok('a fresh arcade has no trophies', (await page.textContent('#home-trophies-n')).trim() === '0 / 15',
        await page.textContent('#home-trophies-n'));

    // ---- the rules ----------------------------------------------------------
    const step = (calls) => page.evaluate(async calls => {
        const S = await import('/src/arcade/Stats.js'), T = await import('/src/arcade/Trophies.js');
        for (const [fn, ...args] of calls) S[fn](...args);
        return T.check().map(t => t.id).sort();
    }, calls);

    let got = await step([['record', 'snapstrike', 1, [false, true], { tier: 'hard', via: 'quick' }]]);
    ok('losing to a bot earns nothing', got.length === 0, JSON.stringify(got));

    got = await step([['record', 'snapstrike', 0, [false, true], { tier: 'hard', via: 'wheel' }]]);
    ok('beating a Hard bot: First Win and Bot Boss, not the other tiers',
        JSON.stringify(got) === JSON.stringify(['bot_hard', 'first_win']), JSON.stringify(got));

    got = await step([['record', 'oddoneout', 0, [false, false], { tier: 'easy', via: 'quick' }]]);
    ok('beating a human is not beating a bot', !got.includes('bot_easy'), JSON.stringify(got));

    got = await step([
        ['record', 'gridrecall', 0, [false, true], { tier: 'easy', via: 'quick' }],
        ['record', 'lightcycles', 0, [false, true], { tier: 'medium', via: 'quick' }],
    ]);
    ok('three wins over bots in a row: On Fire, Bot Basher, Bot Breaker',
        ['bot_easy', 'bot_medium', 'on_fire'].every(id => got.includes(id)), JSON.stringify(got));

    got = await step([['recordParty', false]]);
    ok('a party a bot won: Party Animal only', JSON.stringify(got) === JSON.stringify(['party']), JSON.stringify(got));
    got = await step([['recordParty', true], ['recordTogether']]);
    ok('a party a human won, and a Play Together round', JSON.stringify(got) === JSON.stringify(['party_win', 'together']), JSON.stringify(got));

    // ---- it stays earned, and is not announced again ---------------------------
    await boot();
    const after = await page.evaluate(async () => {
        const T = await import('/src/arcade/Trophies.js');
        return { count: T.count().earned, again: T.check().length };
    });
    ok('earned trophies survive a reload', after.count === 8, `earned ${after.count}`);
    ok('and are not announced a second time', after.again === 0, `check() gave ${after.again}`);
    ok('the home button shows the count', (await page.textContent('#home-trophies-n')).trim() === '8 / 15');

    // ---- the screen ------------------------------------------------------------
    await page.click('[data-go="trophies"]');
    const scr = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#trophy-list .trophy')];
        const s = document.getElementById('scr-trophies');
        return { n: cards.length, earnedFirst: cards.slice(0, 8).every(c => c.classList.contains('got')) && !cards[8].classList.contains('got'),
                 overflow: s.scrollWidth > s.clientWidth + 1, sum: document.getElementById('trophy-sum').textContent };
    });
    ok('the screen lists all 15, earned first', scr.n === 15 && scr.earnedFirst, JSON.stringify(scr));
    ok('and fits a 412 px phone without sideways scroll', !scr.overflow);
    await page.screenshot({ path: '/tmp/claude-0/-home-user/feef9cb7-b3ea-5463-a3fa-376dc616dfcb/scratchpad/shot-trophies.png', fullPage: false }).catch(() => {});

    // ---- a save from before trophies -------------------------------------------
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('claw.stats', JSON.stringify({ plays: { puck: 4 }, humanWins: { puck: 2 }, botWins: {}, draws: 0, recent: ['puck'] }));
    });
    await boot();
    const old = await page.evaluate(async () => {
        const S = await import('/src/arcade/Stats.js'), T = await import('/src/arcade/Trophies.js');
        S.record('puck', 0, [false, true], { tier: 'easy', via: 'quick' });
        return { plays: S.plays('puck'), got: T.check().map(t => t.id).sort() };
    });
    ok('an old save loads and keeps counting', old.plays === 5 && old.got.includes('first_win') && old.got.includes('bot_easy'), JSON.stringify(old));

    // ---- a real game, through the UI -------------------------------------------
    await page.evaluate(() => localStorage.clear());
    await boot();
    await page.evaluate(() => { const c = window.__claw; c.seats.count = 2; c.seats.bots = [false, true]; c.show('grid'); c.play('snapstrike'); });
    const t0 = Date.now();
    let back = false, toasts = new Set();
    while (Date.now() - t0 < 120000) {
        const st = await page.evaluate(() => {
            for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1']) {
                const b = document.getElementById(id); if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            }
            document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
            return { arcade: !document.getElementById('arcade').hidden, active: window.__claw.state.mgActive,
                     toast: document.getElementById('toast-host').textContent };
        });
        if (st.toast) toasts.add(st.toast);
        if (!st.active && st.arcade && Date.now() - t0 > 3000) { back = true; break; }
        await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1500);
    const real = await page.evaluate(async () => {
        const S = await import('/src/arcade/Stats.js'), T = await import('/src/arcade/Trophies.js');
        return { plays: S.plays('snapstrike'), warm: T.all().find(t => t.id === 'warm_up').have,
                 toast: document.getElementById('toast-host').textContent };
    });
    ok('a real game is recorded', back && real.plays === 1 && real.warm === 1, JSON.stringify(real));
    ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

    await browser.close();
    pass.forEach(p => console.log('OK   ' + p));
    fail.forEach(f => console.log('FAIL ' + f));
    console.log(fail.length ? `TROPHIES FAIL — ${fail.length} of ${pass.length + fail.length}` : `TROPHIES PASS — ${pass.length} checks`);
    process.exit(fail.length ? 1 : 0);
})();
