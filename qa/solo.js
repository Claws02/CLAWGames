// ============================================================
// SOLO — Quick Play for one: home → seats "1" → the solo grid → a game → the
// high-score table → again / another game.
//   1. Quick Play's seats screen offers 1; a party's never does.
//   2. The solo grid: only the games that play alone are open, each card shows
//      its best (or "no score yet"); no SPIN.
//   3. A game is played alone on the whole screen and its score goes on the
//      table: NEW HIGH SCORE the first time, then a rank under it.
//   4. The table is per game, kept on this phone, and the grid shows the best.
//   5. Mini Golf plays solo here too.
// usage: node qa/solo.js            (static server on :8140)
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
    const screen = () => page.evaluate(() => document.getElementById('arcade').hidden ? 'GAME' : [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.dataset.screen);
    const until = async (want, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await screen() === want) return true; await page.waitForTimeout(150); } return false; };
    // End the solo game in progress with a given score (as if the clock ran out).
    const finish = score => page.evaluate(async s => { const A = await import('/src/claw-core/minigames/SoloArena.js'); A.forceEnd(s); }, score);

    // 1. Seats: Quick Play offers 1.
    await page.click('[data-go="quick"]');
    ok('Quick Play\'s seats screen offers 1 player', await page.isVisible('.seat-count [data-n="1"]'));
    await page.click('.seat-count [data-n="1"]');
    const seatsN = await page.evaluate(() => document.querySelectorAll('#seat-list .seat').length);
    ok('1 is one seat, with no human/bot switch', seatsN === 1 && !(await page.isVisible('#seat-list .kind')), `${seatsN} seats`);
    await page.click('#btn-seats-go');

    // 2. The solo grid.
    ok('the grid opens', await until('grid'));
    const g = await page.evaluate(() => ({
        head: [...document.querySelectorAll('#game-grid .grid-head')].map(h => h.textContent),
        open: [...document.querySelectorAll('#game-grid .card:not(.blocked)')].map(c => c.dataset.type),
        best: document.querySelector('#game-grid .card[data-type="lootcatch"] .cs')?.textContent,
        spin: !document.getElementById('btn-grid-spin').hidden,
        who: document.querySelectorAll('#grid-who i').length,
    }));
    const solo = ['snapstrike', 'oddoneout', 'steadyhand', 'lootcatch', 'treeclimb', 'minigolf', 'stopclock', 'higherlower'];
    ok('only the solo games are open', g.open.length === solo.length && solo.every(t => g.open.includes(t)), g.open.join(','));
    ok('a card says there is no score yet; no SPIN; one seat in the strip', g.best === 'no score yet' && !g.spin && g.who === 1, `${g.best} spin=${g.spin} who=${g.who}`);
    await page.screenshot({ path: 'qa/shot-solo-grid.png' });

    // 3. Loot Catch, alone: 17 coins, a new high score.
    await page.click('#game-grid .card[data-type="lootcatch"]');
    ok('the game is played alone on the screen', await until('GAME'));
    await page.waitForTimeout(2500);
    const solo1 = await page.evaluate(async () => (await import('/src/claw-core/minigames/SoloArena.js')).isSolo());
    ok('…in solo (no other half, no bot)', solo1);
    await page.screenshot({ path: 'qa/shot-solo-game.png' });
    await finish(17);
    ok('the result screen comes up', await until('soloresult'));
    let r = await page.evaluate(() => ({ score: document.getElementById('so-score').textContent, note: document.getElementById('so-note').textContent, rows: [...document.querySelectorAll('#so-table .so-row')].map(x => x.textContent) }));
    ok('the score, NEW HIGH SCORE, and a one-row table', r.score === '17 coins' && /NEW HIGH SCORE/.test(r.note) && r.rows.length === 1, JSON.stringify(r));
    await page.screenshot({ path: 'qa/shot-solo-result.png' });

    // Again: 9 coins — second on the table, the 17 still on top.
    await page.click('#btn-so-again');
    ok('PLAY AGAIN plays the same game again', await until('GAME'));
    await page.waitForTimeout(1500);
    await finish(9);
    await until('soloresult');
    r = await page.evaluate(() => ({ note: document.getElementById('so-note').textContent, rows: [...document.querySelectorAll('#so-table .so-row')].map(x => x.textContent), me: document.querySelector('#so-table .so-row.me')?.textContent }));
    ok('a lower score goes under it, and is the one lit', /#2/.test(r.note) && r.rows.length === 2 && /9 coins/.test(r.me || ''), JSON.stringify(r));

    // 4. Another game: the grid shows the best.
    await page.click('#btn-so-other');
    await until('grid');
    const best = await page.evaluate(() => document.querySelector('#game-grid .card[data-type="lootcatch"] .cs')?.textContent);
    ok('the grid card shows the best', /17 coins/.test(best || ''), best);

    // 5. Mini Golf, solo here too.
    await page.click('#game-grid .card[data-type="minigolf"]');
    await until('GAME');
    await page.waitForTimeout(3000);
    const gs = await page.evaluate(async () => { const M = await import('/src/claw-core/minigames/MiniGolf.js'); const s = M._debugState(); return { n: s.n, mode: s.mode, holes: s.holes.length, turned: s.turned }; });
    ok('Mini Golf: one ball, upright, three holes', gs.n === 1 && gs.mode === 'turns' && gs.holes === 3 && !gs.turned, JSON.stringify(gs));
    await page.screenshot({ path: 'qa/shot-solo-golf.png' });
    await page.evaluate(async () => { const M = await import('/src/claw-core/minigames/MiniGolf.js'); M._debugScore([[2, 3, 3]], [[5, 5, 5]]); });
    ok('…and its points go on its own table', await until('soloresult', 20000));
    const gr = await page.evaluate(() => document.getElementById('so-score').textContent);
    ok('three holes at 2, 3, 3 on par-3s: 3 + 2 + 2 = 7 pts', gr === '7 pts', gr);

    // 1b. A party never offers 1.
    await page.evaluate(() => window.__claw.show('home', false));
    await page.click('[data-go="party"]');
    ok('a party\'s seats screen never offers 1', !(await page.isVisible('.seat-count [data-n="1"]')));

    ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    await browser.close();
    pass.forEach(p => console.log('  ✓ ' + p));
    fail.forEach(f => console.log('  ✗ ' + f));
    console.log(`\n${pass.length}/${pass.length + fail.length}`);
    process.exit(fail.length ? 1 : 0);
})();
