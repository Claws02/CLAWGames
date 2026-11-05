// ============================================================
// CRITTER SQUARE — the screen, played by tapping (qa/critter.mjs has the rules).
//   home → SOLO GAMES → Critter Square → pick a level → the board (givens locked,
//   fences drawn) → a clash glows red → HINT fills a square → solve it by
//   tapping → SOLVED with the time; a best only without hints, and it shows
//   on the level buttons → CONTINUE a half-done puzzle → all three sizes fit
//   a small phone. Screenshots go to QA_SHOTS (default: none).
//
// usage: node qa/critter.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const SHOTS = process.env.QA_SHOTS || '';

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });   // a small iPhone
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`PAGEERROR ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`CONSOLE ${m.text()}`); });
    await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
    const dbg = () => p.evaluate(() => import('/src/arcade/CritterSquare.js').then(C => C._debug()));
    const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
    const tapSq = k => p.click(`#cs-board .cs-sq[data-k="${k}"]`);
    const tapPet = v => p.click(`#cs-tray .cs-pet[data-v="${v}"]`);
    // Critter Square lives in the SOLO GAMES hub; its back button returns there.
    const openCritter = async () => {
        if (!(await p.isVisible('#scr-solo'))) await p.click('[data-go="solo"]');
        await p.click('#solo-list [data-game="critter"]'); await p.click('#pv-play');
    };

    // home → the card → levels
    await shot('home');
    await openCritter();
    check(await p.isVisible('#cs-pick') && (await p.$$('#cs-pick .cs-level')).length === 3, 'SOLO GAMES → Critter Square opens with three levels');
    check(/not solved yet/.test(await p.textContent('#cs-pick .cs-level[data-level="easy"]')), `the levels show no best yet: "${await p.textContent('#cs-pick .cs-level[data-level="easy"]')}"`);
    await shot('pick');

    // Easy
    await p.click('#cs-pick .cs-level[data-level="easy"]');
    let d = await dbg();
    const sq = await p.$$('#cs-board .cs-sq');
    const given = await p.$$('#cs-board .cs-sq.given');
    check(sq.length === 16 && given.length === d.p.givens.filter(v => v >= 0).length, `Easy: a 4×4 board, ${given.length} squares given`);
    const fenceCount = await p.evaluate(() => [...document.querySelectorAll('#cs-board .cs-fence')].filter(f => f.textContent.trim()).length);
    check(fenceCount === d.p.fences.length, `   ${fenceCount} fences drawn, as the puzzle has`);
    // the fences point the right way
    const dirsOk = await p.evaluate(() => import('/src/arcade/CritterSquare.js').then(C => {
        const { p } = C._debug(), n = p.n, cells = [...document.querySelectorAll('#cs-board > *')];
        const at = (R, Cc) => cells[R * (2 * n - 1) + Cc].textContent;
        return p.fences.every(f => {
            const ra = Math.floor(f.a / n), ca = f.a % n, horiz = f.b === f.a + 1;
            const t = horiz ? at(2 * ra, 2 * ca + 1) : at(2 * ra + 1, 2 * ca);
            const aBig = p.solution[f.a] > p.solution[f.b];
            return horiz ? t === (aBig ? '>' : '<') : t === (aBig ? '∨' : '∧');
        });
    }));
    check(dirsOk, '   every fence opens towards the bigger critter of the solution');
    await shot('easy');

    // a given can't be changed
    const g0 = d.p.givens.findIndex(v => v >= 0);
    await tapSq(g0);
    check((await dbg()).sel !== g0, '   a starting square can\'t be picked');

    // a clash glows red
    const e0 = d.p.givens.findIndex(v => v < 0);
    const r0 = Math.floor(e0 / 4), rowGiven = [0, 1, 2, 3].map(c => r0 * 4 + c).find(k => d.p.givens[k] >= 0);
    const colGiven = [0, 1, 2, 3].map(r => r * 4 + (e0 % 4)).find(k => d.p.givens[k] >= 0);
    const clashWith = rowGiven ?? colGiven;
    if (clashWith !== undefined) {
        await tapSq(e0); await tapPet(d.p.givens[clashWith]);
        check(await p.$eval(`#cs-board .cs-sq[data-k="${e0}"]`, el => el.classList.contains('bad')), '   putting a repeat in a row or column turns it red');
        await shot('clash');
        await tapSq(e0); await tapPet(-1);
        check(!(await p.$eval(`#cs-board .cs-sq[data-k="${e0}"]`, el => el.classList.contains('bad'))), '   ⌫ clears it');
    }

    // a hint
    await p.click('#btn-cs-hint');
    d = await dbg();
    check(d.hints === 1 && d.grid.filter((v, k) => v >= 0 && d.p.givens[k] < 0).every((v, k, a) => true) && d.grid.some((v, k) => d.p.givens[k] < 0 && v === d.p.solution[k]), `   HINT fills a square correctly (${await p.textContent('#btn-cs-hint')})`);

    // solve the rest by tapping
    for (let k = 0; k < 16; k++) if (d.p.givens[k] < 0 && d.grid[k] !== d.p.solution[k]) { await tapSq(k); await tapPet(d.p.solution[k]); }
    await p.waitForSelector('#cs-done:not([hidden])', { timeout: 5000 }).catch(() => {});
    check(await p.isVisible('#cs-done'), `   solved: "${(await p.textContent('#cs-done-t')).trim()}" · "${await p.textContent('#cs-done-best')}"`);
    check(/without hints/.test(await p.textContent('#cs-done-best')) && !(await p.evaluate(() => JSON.parse(localStorage.getItem('claw.critterBest') || '{}').easy)), '   with a hint used, no best time is saved');
    await shot('solved');

    // NEXT PUZZLE, solved with no hints: a best time
    await p.click('#btn-cs-again');
    d = await dbg();
    for (let k = 0; k < 16; k++) if (d.p.givens[k] < 0) { await tapSq(k); await tapPet(d.p.solution[k]); }
    await p.waitForSelector('#cs-done:not([hidden])', { timeout: 5000 }).catch(() => {});
    const best = await p.evaluate(() => JSON.parse(localStorage.getItem('claw.critterBest') || '{}').easy);
    check(/NEW BEST/.test(await p.textContent('#cs-done-best')) && best > 0, `NEXT PUZZLE, no hints: "${await p.textContent('#cs-done-best')}" (saved ${best} s)`);
    await p.click('#btn-cs-levels');
    check(/best \d+:\d\d/.test(await p.textContent('#cs-pick .cs-level[data-level="easy"]')), `   the level button shows it: "${await p.textContent('#cs-pick .cs-level[data-level="easy"]')}"`);

    // Medium and Hard: the board fits a small phone, tray included
    for (const [level, n] of [['medium', 5], ['hard', 6]]) {
        await p.click(`#cs-pick .cs-level[data-level="${level}"]`);
        const box = await p.$eval('#cs-board', el => { const r = el.getBoundingClientRect(); return { w: r.width, right: r.right, left: r.left }; });
        const tray = await p.$eval('#cs-tray', el => el.getBoundingClientRect().bottom);
        const count = (await p.$$('#cs-board .cs-sq')).length;
        check(count === n * n && box.left >= 0 && box.right <= 375 && tray <= 667 + 1, `${level}: ${n}×${n} fits a 375×667 screen (board ${Math.round(box.w)} px wide, tray ends at ${Math.round(tray)} px)`);
        await shot(level);
        if (level === 'medium') {
            // leave half done, come back: CONTINUE
            const dm = await dbg(); const k = dm.p.givens.findIndex(v => v < 0);
            await tapSq(k); await tapPet(dm.p.solution[k]);
            await p.click('#scr-critter [data-back]');
            await openCritter();
            check(await p.isVisible('#btn-cs-continue'), `   leave half done and come back: "${await p.textContent('#btn-cs-continue')}"`);
            await p.click('#btn-cs-continue');
            check((await dbg()).grid[k] === dm.p.solution[k], '   CONTINUE brings the same board back');
            await p.click('#scr-critter [data-back]'); await openCritter();
        } else {
            await p.click('#scr-critter [data-back]');
        }
    }

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`CRITTER SCREEN FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('CRITTER SCREEN PASS');
})();
