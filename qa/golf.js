// ============================================================
// GOLF — the Mini Golf mode: home → seats → the clubhouse → a round → back.
//   1. The home screen has the MINI GOLF banner; it leads (via seats) to the
//      course picker: four courses, 3/9/18 holes, turns or chaos.
//   2. The picks reach the game: the course, all nine holes, the mode.
//   3. After the round: the last round on the clubhouse screen, a best kept
//      for the course, the Full Round trophy.
//   4. The course and holes were for that round only (a party after it plays
//      a sampler); the mode is a setting and stays.
//   5. Eighteen holes is the course and the next one.
//   6. Turns is played upright; chaos sideways.
// usage: node qa/golf.js            (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const pass = [], fail = [];
const ok = (n, c, d = '') => (c ? pass : fail).push(`${n}${d ? ` — ${d}` : ''}`);

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('kept')) { localStorage.clear(); sessionStorage.setItem('kept', '1'); } } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw);
    const G = (fn, ...a) => page.evaluate(async ([fn, a]) => { const m = await import('/src/claw-core/minigames/MiniGolf.js'); return m[fn](...a); }, [fn, a]);
    const screen = () => page.evaluate(() => document.getElementById('arcade').hidden ? 'GAME' : [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.dataset.screen);
    const throughGates = async (ms = 30000, want = () => true) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            const s = await page.evaluate(async () => {
                const vis = el => el && el.offsetParent !== null;
                for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2']) { const b = document.getElementById(id); if (vis(b)) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
                const m = await import('/src/claw-core/minigames/MiniGolf.js');
                return m._debugState();
            });
            if (s && s.phase === 'play' && s.hole >= 0 && want(s)) return s;
            await page.waitForTimeout(250);
        }
        return G('_debugState');
    };
    const backTo = async (name, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await screen() === name) return true; await page.waitForTimeout(200); } return false; };

    // 1. Home → seats → the clubhouse.
    ok('home: the MINI GOLF banner', await page.isVisible('.golf-hero'));
    await page.click('.golf-hero');
    ok('seats: Mini Golf offers 1 player (solo)', await page.isVisible('.seat-count [data-n="1"]'));
    await page.click('#btn-seats-go');
    ok('it opens the clubhouse after seats', await screen() === 'golf');
    const pick = await page.evaluate(() => ({ courses: [...document.querySelectorAll('.golf-course')].map(b => b.dataset.course),
        holes: [...document.querySelectorAll('#golf-holes button')].map(b => b.textContent), mode: [...document.querySelectorAll('#golf-mode button')].map(b => b.dataset.v) }));
    ok('four courses, 3 / 9 / 18 holes, solo, turns or chaos', pick.courses.join() === 'backyard,pirate,candy,space' && pick.holes.length === 3 && pick.mode.join() === 'solo,turns,chaos', JSON.stringify(pick));
    await page.screenshot({ path: 'qa/shot-golf-clubhouse.png' });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok('the clubhouse fits a phone (no sideways scroll)', wide);

    // 2. Candy Land, 9 holes, chaos.
    await page.click('.golf-course[data-course="candy"]');
    await page.click('#golf-holes button[data-v="9"]');
    await page.click('#golf-mode button[data-v="chaos"]');
    await page.click('#btn-golf-start');
    let s = await throughGates();
    ok('the round is the course picked, all nine holes, in chaos', s.course === 'candy' && s.holes.length === 9 && s.mode === 'chaos', `${s.course} ${s.holes.length} ${s.mode}`);
    const cfg = await G('configured');
    ok('the course and holes were for this round only; the mode stays', cfg.course === null && cfg.holes === 'sampler' && cfg.mode === 'chaos', JSON.stringify(cfg));

    // 3. Finish it: P1 25 (under par), the bot 31.
    await G('_debugScore', [[2, 2, 3, 2, 3, 4, 3, 2, 4], [3, 3, 4, 3, 3, 4, 4, 3, 4]], [Array(9).fill(5), Array(9).fill(5)]);
    ok('back to the clubhouse after the round', await backTo('golf', 25000));
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ last: document.getElementById('golf-last').textContent, hidden: document.getElementById('golf-last').hidden,
        card: document.querySelector('.golf-course[data-course="candy"]').textContent, store: JSON.parse(localStorage.getItem('claw.golf') || localStorage.getItem('golf') || 'null') }));
    ok('the last round is on the clubhouse screen, with a new best', !after.hidden && /NEW BEST/.test(after.last) && /25/.test(after.last), after.last.slice(0, 120));
    ok('the course card shows the best round', /BEST 25 \(-\d+\)/.test(after.card), after.card.replace(/\s+/g, ' ').slice(0, 160));
    await page.screenshot({ path: 'qa/shot-golf-after.png' });
    const tro = await page.evaluate(async () => { const T = await import('/src/arcade/Trophies.js'); return T.all().filter(t => /golf/.test(t.id)).map(t => [t.id, !!t.earned]); });
    ok('the Full Round and Under Par trophies', tro.find(t => t[0] === 'golf_round')?.[1] && tro.find(t => t[0] === 'golf_under')?.[1], JSON.stringify(tro));

    // 5. Eighteen: Candy Land then the Space Station.
    await page.click('#golf-holes button[data-v="18"]');
    await page.click('#btn-golf-start');
    s = await throughGates();
    const C = await page.evaluate(async () => { const c = await import('/src/claw-core/minigames/golf/Courses.js'); return { candy: c.courseByKey('candy').holes.map(h => h.key), space: c.courseByKey('space').holes.map(h => h.key) }; });
    ok('eighteen holes: the course, then the next one', s.holes.length === 18 && s.holes.slice(0, 9).join() === C.candy.join() && s.holes.slice(9).join() === C.space.join(), s.holes.join(','));
    await G('_debugScore', [Array(18).fill(3), Array(18).fill(3)], [Array(18).fill(5), Array(18).fill(6)]);
    ok('back again after eighteen', await backTo('golf', 25000));

    // Solo: one ball against par, upright, no pass card; the best counts.
    await page.waitForTimeout(600);
    // Picked the way a player would: 1 on the seats screen.
    await page.evaluate(() => window.__claw.show('home', false));
    await page.click('.golf-hero');
    await page.click('.seat-count [data-n="1"]');
    const seatsSolo = await page.evaluate(() => document.querySelectorAll('#seat-list .seat').length);
    await page.click('#btn-seats-go');
    await backTo('golf');
    const soloSel = await page.evaluate(() => document.querySelector('#golf-mode button.sel')?.dataset.v);
    ok('seats: 1 is one seat, and the clubhouse opens on Solo', seatsSolo === 1 && soloSel === 'solo', `seats ${seatsSolo} mode ${soloSel}`);
    await page.click('.golf-course[data-course="backyard"]');
    await page.click('#golf-holes button[data-v="9"]');
    await page.click('#btn-golf-start');
    s = await throughGates(30000, st => st.n === 1);
    ok('solo: one ball, upright, nobody to pass to', s.n === 1 && s.balls.length === 1 && s.mode === 'turns' && s.turned === false && s.pass === -1, `n=${s.n} ${s.mode} turned=${s.turned} pass=${s.pass}`);
    const par = s.par.reduce((a, b) => a + b, 0);
    await G('_debugScore', [s.par.map(p => p - 1).map((p, i) => i ? p + 1 : p)], [Array(9).fill(5)]);
    ok('solo: back to the clubhouse', await backTo('golf', 25000));
    await page.waitForTimeout(400);
    const solo = await page.evaluate(() => ({ last: document.getElementById('golf-last').textContent, card: document.querySelector('.golf-course[data-course="backyard"]').textContent }));
    ok('solo: the round and a new best (one under)', /NEW BEST/.test(solo.last) && solo.card.includes(`BEST ${par - 1} (-1)`), solo.last.slice(0, 100) + ' | ' + solo.card.replace(/\s+/g, ' ').slice(0, 120));
    await page.screenshot({ path: 'qa/shot-golf-solo.png' });
    await page.click('#golf-mode button[data-v="chaos"]');


    // Other modes never offer 1, and the table is still the saved one.
    await page.evaluate(() => window.__claw.show('home', false));
    await page.click('[data-go="party"]');
    const party1 = await page.isVisible('.seat-count [data-n="1"]'), partyN = await page.evaluate(() => document.querySelectorAll('#seat-list .seat').length);
    ok('seats: a party never offers 1; the saved table is back', !party1 && partyN >= 2, `1 visible ${party1}, seats ${partyN}`);

    // 4. A party's mini golf is a sampler again, in the saved mode.
    await page.evaluate(() => window.__claw.show('home', false));
    await page.evaluate(() => window.__claw.play('minigolf'));
    s = await throughGates();
    ok('mini golf in a party or Quick Play: a three-hole sampler of par-3s, always chaos', s.holes.length === 3 && s.mode === 'chaos' && s.par.every(p => p <= 3), `${s.holes.length} ${s.mode} par ${s.par}`);
    await page.evaluate(async () => { const MM = await import('/src/claw-core/minigames/MinigameManager.js'); MM.forceEndMinigame(); });

    // With Take turns saved, a party's golf is still chaos; the mode's own round is turns, upright.
    await page.waitForTimeout(800);
    await page.evaluate(async () => { const G = await import('/src/arcade/Golf.js'); G.setMode('turns'); });
    await page.evaluate(() => window.__claw.play('minigolf'));
    s = await throughGates(30000, st => st.gl);
    ok('a party\'s golf stays chaos with Take turns saved', s.mode === 'chaos' && s.turned === true, `${s.mode} turned=${s.turned}`);
    await page.evaluate(async () => { const MM = await import('/src/claw-core/minigames/MinigameManager.js'); MM.forceEndMinigame(); });
    await page.waitForTimeout(800);
    await page.evaluate(async () => { const G = await import('/src/arcade/Golf.js'); G.configureNext(); });
    await page.evaluate(() => window.__claw.play('minigolf'));
    s = await throughGates(30000, st => st.mode === 'turns');
    ok('turns (the Mini Golf mode): played upright, not turned sideways', s.mode === 'turns' && s.turned === false, `${s.mode} turned=${s.turned}`);
    await page.evaluate(async () => { const MM = await import('/src/claw-core/minigames/MinigameManager.js'); MM.forceEndMinigame(); });

    ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    await browser.close();
    pass.forEach(p => console.log('  ✓ ' + p));
    fail.forEach(f => console.log('  ✗ ' + f));
    console.log(`\n${pass.length}/${pass.length + fail.length}`);
    process.exit(fail.length ? 1 : 0);
})();
