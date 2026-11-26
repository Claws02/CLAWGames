// ============================================================
// MIX — what kind of games a party, Quick Play and the TV deal (Mix.js).
//   1. lengths (quick / medium / long), board games, presets
//   2. the party pool follows the mix; balanced mixing after a long game;
//      the time estimate
//   3. party setup: the presets with their counts, CUSTOM chips, an empty
//      mix can't start, the choice is kept after a reload
//   4. Quick Play's length chips
//   5. the TV room's mix decides what its wheel deals
//
// usage: node qa/mix.js        (static server on :8140)
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
    const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await page.addInitScript(() => { if (!sessionStorage.getItem('mixqa')) { localStorage.clear(); sessionStorage.setItem('mixqa', '1'); } });
    await page.goto(BASE); await page.waitForFunction(() => !!window.__claw);

    // ── 1. Lengths and presets ──────────────────────────────────────────────
    const L = await page.evaluate(async () => {
        const M = await import('/src/arcade/Mix.js'), C = await import('/src/arcade/Catalog.js');
        const base = C.eligible(2);
        const by = id => base.filter(M.PRESETS[id].test);
        return {
            len: ['snapstrike', 'lootcatch', 'minigolf', 'bowling', 'brainrot', 'yatzy', 'mancala', 'clawrace'].map(t => `${t}:${M.lengthOf(t)}`),
            board: [M.isBoard('mancala'), M.isBoard('fourinarow'), M.isBoard('brainrot'), M.isBoard('snapstrike')],
            all: base.length,
            quick: by('quick').every(t => M.lengthOf(t) === 'quick') && by('quick').length > 10,
            boards: by('board').every(M.isBoard) && by('board').length >= 10,
            brain: by('brain').every(t => C.genreOf(t) === 'brain'),
            action: by('action').every(t => !M.isBoard(t) && M.lengthOf(t) !== 'long'),
            est: [M.estimate(by('quick'), 5), M.estimate(by('board'), 5)],
        };
    });
    ok(L.len.join() === 'snapstrike:quick,lootcatch:quick,minigolf:medium,bowling:medium,brainrot:medium,yatzy:long,mancala:long,clawrace:long', `lengths: ${L.len.join(' ')}`);
    ok(L.board.join() === 'true,true,false,false', 'board games are the table games, not the stacking ones');
    ok(L.quick && L.boards && L.brain && L.action, `presets deal what they say (of ${L.all} games at 2 seats)`);
    ok(L.est[0] > 0 && L.est[1] > L.est[0] * 2, `a board game night takes much longer than quick fire (${L.est[0]} vs ${L.est[1]} min for 5)`);

    // ── 2. The party pool ───────────────────────────────────────────────────
    const P = await page.evaluate(async () => {
        const Party = await import('/src/arcade/Party.js'), M = await import('/src/arcade/Mix.js'), C = await import('/src/arcade/Catalog.js');
        window.__claw.seats.count = 2;
        const out = {};
        Party.mix.setPreset('board'); Party.start();
        out.board = Party.pool().length > 0 && Party.pool().every(M.isBoard);
        out.shuffle = M.isBoard(Party.shuffleNext());
        Party.mix.setPreset('custom');
        ['quick', 'medium', 'long'].forEach(l => { if (Party.mix.state.lengths.includes(l)) Party.mix.toggle('length', l); });
        Party.mix.toggle('length', 'long');
        Object.keys(C.MG_GENRES).forEach(g => { if (Party.mix.state.genres.includes(g) && g !== 'brain') Party.mix.toggle('genre', g); });
        out.custom = Party.pool().length > 0 && Party.pool().every(t => C.genreOf(t) === 'brain' && M.lengthOf(t) === 'long');
        out.whyOut = Party.whyOut('snapstrike');
        Party.mix.setPreset('everything'); Party.start();
        Party.party.last = { type: 'yatzy' };
        out.balanced = Party.pool().every(t => M.lengthOf(t) !== 'long') && Party.pool().length > 0;
        Party.party.last = { type: 'snapstrike' };
        out.mixedAgain = Party.pool().some(t => M.lengthOf(t) === 'long');
        Party.party.active = false;
        return out;
    });
    ok(P.board && P.shuffle, 'a Board Game Night party deals only board games');
    ok(P.custom, 'a custom mix (brain × long) deals only those');
    ok(P.whyOut === 'Not in this mix', `host picks greys out a game outside the mix: "${P.whyOut}"`);
    ok(P.balanced && P.mixedAgain, 'after a long game the next comes from the shorter ones; after a short one, long games are back');

    // ── 3. Party setup ──────────────────────────────────────────────────────
    await page.evaluate(() => { const c = window.__claw; c.seats.count = 2; c.show('party'); });
    await page.evaluate(async () => (await import('/src/arcade/PartyScreens.js')).paintSetup());
    const presets = await page.$$eval('#party-mix .mix-preset', e => e.map(x => x.dataset.preset));
    ok(['everything', 'quick', 'board', 'brain', 'action', 'custom'].every(p => presets.includes(p)), `setup offers the mixes: ${presets.join(', ')}`);
    await page.click('.mix-preset[data-preset="quick"]');
    const hq = await page.textContent('#party-hint');
    await page.click('.mix-preset[data-preset="board"]');
    const hb = await page.textContent('#party-hint');
    const n = h => +(h.match(/(\d+) games? in this mix/) || [])[1], m = h => +(h.match(/about (\d+) min/) || [])[1];
    ok(n(hq) > n(hb) && m(hb) > m(hq), `the hint follows the mix: quick "${n(hq)} games, ${m(hq)} min" · board "${n(hb)} games, ${m(hb)} min"`);
    await page.click('.mix-preset[data-preset="custom"]');
    for (const l of ['quick', 'medium', 'long']) if (await page.$(`.mix-chip.on[data-id="${l}"]`)) await page.click(`.mix-chip[data-id="${l}"]`);
    ok(await page.$eval('#btn-party-start', b => b.disabled) && /No game fits/.test(await page.textContent('#party-hint')), 'every length off: the party can\'t start, and says why');
    await page.click('.mix-chip[data-id="medium"]');
    ok(!(await page.$eval('#btn-party-start', b => b.disabled)), 'one length back on: it can');
    await page.click('.mix-preset[data-preset="brain"]');
    await page.reload(); await page.waitForFunction(() => !!window.__claw);
    const kept = await page.evaluate(async () => (await import('/src/arcade/Party.js')).mix.state.preset);
    ok(kept === 'brain', `the mix is kept after a reload (${kept})`);
    await page.evaluate(async () => (await import('/src/arcade/Party.js')).mix.setPreset('everything'));

    // ── 4. Quick Play's length chips ────────────────────────────────────────
    await page.evaluate(() => { const c = window.__claw; c.seats.count = 2; c.show('grid'); });
    await page.evaluate(async () => (await import('/src/arcade/Grid.js')).open(() => {}));
    ok(!!(await page.$('#len-chips button[data-len="long"]')), 'Quick Play has length chips');
    await page.click('#len-chips button[data-len="long"]');
    const longOnly = await page.evaluate(async () => {
        const M = await import('/src/arcade/Mix.js');
        const cards = [...document.querySelectorAll('#game-grid .card')].map(c => c.dataset.type);
        return { n: cards.length, ok: cards.every(t => M.lengthOf(t) === 'long') };
    });
    ok(longOnly.n > 0 && longOnly.ok, `🐢 LONG shows only the long games (${longOnly.n})`);
    await page.click('#len-chips button[data-len="all"]');

    // ── 5. The TV room ──────────────────────────────────────────────────────
    const tv = await ctx.newPage();
    tv.on('pageerror', e => errs.push('TV PAGEERROR ' + e.message));
    await tv.setViewportSize({ width: 1180, height: 820 });
    await tv.goto(BASE + '?net=local'); await tv.waitForFunction(() => !!window.__claw);
    await tv.click('[data-go="together"]');
    await tv.click('#btn-net-tv');
    await tv.waitForSelector('#tv-mix .mix-preset', { timeout: 15000 });
    const tvPresets = await tv.$$eval('#tv-mix .mix-preset', e => e.map(x => x.dataset.preset));
    ok(tvPresets.includes('quick') && !tvPresets.includes('board'), `the TV room offers the mixes that fit its games (${tvPresets.join(', ')})`);
    await tv.click('#tv-mix .mix-preset[data-preset="quick"]');
    const tvPool = await tv.evaluate(async () => { const H = await import('/src/arcade/TvHost.js'), M = await import('/src/arcade/Mix.js'); const p = H.pool(); return { n: p.length, ok: p.every(t => M.lengthOf(t) === 'quick') }; });
    ok(tvPool.n > 0 && tvPool.ok, `QUICK FIRE on the TV: its wheel deals ${tvPool.n} quick games`);
    await tv.click('#tv-mix .mix-preset[data-preset="everything"]');
    await tv.click('#scr-tvroom [data-back]');
    await tv.click('.confirm-yes').catch(() => {});

    ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    console.log(failed ? `\nMIX: ${failed} FAILED` : '\nMIX PASS');
    process.exit(failed ? 1 : 0);
})();
