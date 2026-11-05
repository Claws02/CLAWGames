// ============================================================
// DAILY GAMES — the second wave of solo games and the come-back-tomorrow
// systems, played by tapping on a small phone.
//   1. the hub: 10 cards (Prize Shelf first); TODAY has the date's three
//      dailies, labelled with the weekday's difficulty
//   2. a tide pass saves a streak with a missed day when the hub opens
//   3. Ice Floe: arrow taps along the shortest route stop on the fish, in par
//   4. Rock Pool Paths: dragging each path with a finger solves the pool
//   5. Coral Merge: two shells dropped by finger fall, touch and merge, with the juice
//   6. Kite Wind: a tap tugs the kite up; a ring scores and builds a combo;
//      a gull ends the flight
//   7. a daily solved: a claw token, and SHARE hands the result to the phone
//   8. Prize Shelf: no token, no drop; a drop over the lucky spot wins a
//      plush that goes on the shelf
//
// usage: node qa/dailygames.js        (static server on :8140)
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
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });
    // The phone's share sheet, recorded instead of opened.
    await ctx.addInitScript(() => { window.__shared = []; navigator.share = async d => { window.__shared.push(d.text); }; });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`PAGEERROR ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`CONSOLE ${m.text()}`); });
    await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
    const S = expr => p.evaluate(e => import('/src/arcade/SoloStats.js').then(S => (new Function('S', 'return ' + e))(S)), expr);
    const mod = (name, expr) => p.evaluate(([n, e]) => import(`/src/arcade/${n}.js`).then(M => (new Function('M', 'return ' + e))(M)), [name, expr]);
    const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
    const hub = async () => { await p.click('#scr-sologame [data-back]').catch(() => {}); await p.waitForSelector('#scr-solo:not([hidden])'); };
    const game = async id => { await p.click(`#solo-list [data-game="${id}"]`); await p.waitForSelector('#scr-sologame:not([hidden])'); };

    // 2 (set up first). A streak of 3 days ending the day before yesterday, a pass in hand: yesterday was missed.
    await S(`(() => { S._reset(); const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return S.today(x); };
        const s = JSON.parse(localStorage.getItem('claw.solo')); s.daily[d(2)] = { treasure: true }; s.daily[d(3)] = { treasure: true }; s.daily[d(4)] = { treasure: true }; s.passes = 1;
        localStorage.setItem('claw.solo', JSON.stringify(s)); return true; })()`);
    await p.reload(); await p.waitForFunction(() => !!window.__claw);

    // 1. the hub
    await p.click('[data-go="solo"]');
    await p.waitForSelector('#scr-solo:not([hidden])');
    const cards = await p.$$eval('#solo-list .hub-card', els => els.map(e => e.dataset.game));
    check(cards.length === 13 && cards[0] === 'shelf', `1. the hub: ${cards.length} cards, Prize Shelf first (${cards.join(', ')})`);
    const today = await p.$$eval('#solo-today .hub-day', els => els.map(e => e.dataset.daily));
    const want = await S('S.todaysDailies()'), level = await S('S.dailyLevel()');
    check(JSON.stringify(today) === JSON.stringify(want), `   TODAY: the date's three dailies (${today.join(', ')})`);
    const labels = await p.$$eval('#solo-today .sd-s', els => els.map(e => e.textContent));
    check(labels.some(l => l === level.toUpperCase()), `   labelled with today's difficulty: ${labels.join(' / ')} (${level})`);
    // 2. the pass
    const streakText = await p.textContent('#solo-streak');
    check(/4 days in a row/.test(streakText) && (await S('S.passes()')) === 0, `2. a missed day: a tide pass saved the streak ("${streakText}")`);
    await shot('hub');

    // 3. Ice Floe
    await game('icefloe');
    await p.click('.cs-level[data-level="easy"]');
    await p.waitForSelector('#if-board .if-sq');
    const ice = await mod('IceFloe', 'M._debug()');
    const route = await p.evaluate(d => import('/src/arcade/IceFloeLogic.js').then(L => L.route(d.p, d.p.grid, d.p.start, d.p.fish)), ice);
    for (const dir of route) { await p.click(`#scr-sologame [data-dir="${dir}"]`); await p.waitForTimeout(480); }
    await p.waitForSelector('#if-done:not([hidden])', { timeout: 4000 }).catch(() => {});
    check(/★★★/.test(await p.textContent('#if-done-h').catch(() => '')), `3. Ice Floe: ${route.length} taps along the shortest route (${route.join(' ')}): "${await p.textContent('#if-done-h').catch(() => '')}"`);
    await shot('icefloe');
    await hub();

    // 4. Rock Pool Paths, by finger
    await game('paths');
    await p.click('.cs-level[data-level="easy"]');
    await p.waitForSelector('#pp-board .pp-sq');
    const pool = (await mod('Paths', 'M._debug()')).p;
    const box = await (await p.$('#pp-board')).boundingBox(), cell = box.width / pool.n;
    const at = k => [box.x + (k % pool.n + 0.5) * cell, box.y + (Math.floor(k / pool.n) + 0.5) * cell];
    for (const path of pool.solution) {
        await p.mouse.move(...at(path[0])); await p.mouse.down();
        for (const k of path.slice(1)) await p.mouse.move(...at(k), { steps: 3 });
        await p.mouse.up();
    }
    await p.waitForSelector('#pp-done:not([hidden])', { timeout: 4000 }).catch(() => {});
    check(await p.isVisible('#pp-done'), `4. Rock Pool Paths: ${pool.solution.length} paths dragged by finger solve the pool (${await p.textContent('#pp-status')})`);
    await shot('paths');
    await hub();

    // 5. Coral Merge
    await game('coral');
    await p.waitForSelector('#cm-cv');
    // Two shells next: set the queue, then drop both by finger at the same spot.
    await p.evaluate(() => import('/src/arcade/Coral.js').then(C => { const g = C._game(); g.next = 0; g.after = 0; }));
    const cb = await (await p.$('#cm-cv')).boundingBox();
    const tapAt = async fx => { await p.mouse.move(cb.x + cb.width * fx, cb.y + 20); await p.mouse.down(); await p.mouse.up(); };
    await tapAt(0.5); await p.waitForTimeout(700); await tapAt(0.52);
    let reef = null;
    for (let i = 0; i < 40; i++) { reef = await mod('Coral', 'M._debug()'); if (reef.kinds.includes(1)) break; await p.waitForTimeout(100); }
    check(reef.kinds.includes(1) && !reef.kinds.includes(0) && reef.score > 0, `5. Coral Merge: two shells dropped by finger fall, touch and merge into a snail (score ${reef.score})`);
    check(reef.bursts > 0, `   the merge throws a burst of particles (${reef.bursts})`);
    await shot('coral');
    await hub();

    // 6. Kite Wind
    await game('kite');
    await p.click('#btn-kt-go');
    await mod('Kite', 'M._calm()');
    const kb = await (await p.$('#kt-cv')).boundingBox();
    await p.waitForTimeout(300);
    const y0 = (await mod('Kite', 'M._debug()')).y;
    await p.mouse.click(kb.x + kb.width / 2, kb.y + kb.height / 2);
    await p.waitForTimeout(160);
    const y1 = (await mod('Kite', 'M._debug()')).y;
    check(y1 < y0, `6. Kite Wind: a tap tugs the kite up (${y0.toFixed(2)} → ${y1.toFixed(2)})`);
    await mod('Kite', "M._place('ring')"); await p.waitForTimeout(150);
    await mod('Kite', "M._place('ring')"); await p.waitForTimeout(150);
    const k2 = await mod('Kite', 'M._debug()');
    check(k2.rings === 2 && k2.combo === 3 && k2.score === 30, `   two rings: ${k2.rings} rings, combo ×${k2.combo}, ${k2.score} points (10 + 20)`);
    await shot('kite');
    await mod('Kite', "M._place('gull')"); await p.waitForTimeout(200);
    const k3 = await mod('Kite', 'M._debug()');
    check(k3.over && /gull/.test(k3.why) && await p.isVisible('#kt-over'), `   a gull ends it: "${k3.why}"`);
    await hub();

    // 7. a daily: token and SHARE
    const tokens0 = await S('S.tokens()');
    const daily = today.find(id => id !== 'critter') || today[0];
    await p.click(`#solo-today [data-daily="${daily}"]`);
    await p.waitForTimeout(300);
    const solved = await p.evaluate(async id => {
        const sel = { treasure: 'td', lighthouse: 'lh', icefloe: 'if', paths: 'pp' }[id];
        if (id === 'treasure') { const T = await import('/src/arcade/TreasureDig.js'); T._debug().chests.forEach(k => T.dig(k)); }
        if (id === 'lighthouse') { const L = await import('/src/arcade/Lighthouse.js'); L._debug().p.solution.forEach(k => L.toggle(k)); }
        if (id === 'icefloe') { const I = await import('/src/arcade/IceFloe.js'), G = await import('/src/arcade/IceFloeLogic.js'); const d = I._debug(); for (const dir of G.route(d.p, d.p.grid, d.p.start, d.p.fish)) { I.move(dir); await new Promise(r => setTimeout(r, 480)); } }
        if (id === 'paths') { const P = await import('/src/arcade/Paths.js'); const d = P._debug(); d.p.solution.forEach(path => { P.begin(path[0]); path.slice(1).forEach(k => P.extend(k)); P.end(); }); }
        await new Promise(r => setTimeout(r, 600));
        return !document.getElementById(`${sel}-done`).hidden;
    }, daily);
    const tokens1 = await S('S.tokens()');
    check(solved && tokens1 === tokens0 + 1, `7. today's ${daily} solved: a claw token (${tokens0} → ${tokens1})`);
    await p.click('#scr-sologame .share-btn');
    const sharedText = await p.evaluate(() => window.__shared[0] || '');
    check(/CLAW Games daily/.test(sharedText) && /claws02\.github\.io/.test(sharedText), `   SHARE hands the phone: "${sharedText.replace(/\n/g, ' / ')}"`);
    await shot('daily-done');
    await hub();

    // 8. the Prize Shelf
    await S('(() => { const s = JSON.parse(localStorage.getItem("claw.solo")); s.tokens = 0; localStorage.setItem("claw.solo", JSON.stringify(s)); return true; })()');
    await p.reload(); await p.waitForFunction(() => !!window.__claw);
    await p.click('[data-go="solo"]'); await p.waitForSelector('#scr-solo:not([hidden])');
    await game('shelf');
    check(await p.$eval('#btn-ps-drop', b => b.disabled) && /No tokens/.test(await p.textContent('#ps-hint')), '8. Prize Shelf: no token, no drop');
    await S('S.giveTokens(2)');
    await hub(); await game('shelf');
    const spot = (await mod('PrizeShelf', 'M._debug()')).lucky;
    const prize = await p.evaluate(x => import('/src/arcade/PrizeShelf.js').then(P => P.dropClaw(x)), spot);
    await p.waitForTimeout(200);
    const shelf = await S('S.shelf()');
    check(prize && shelf[prize.id] === 1 && /lucky drop/.test(await p.textContent('#ps-won')), `   a drop over the lucky spot: ${prize && prize.icon} ${prize && prize.id} (${prize && prize.rarity}), on the shelf`);
    check((await p.$$('#ps-shelf .ps-slot:not(.empty)')).length === 1 && (await S('S.tokens()')) === 1, '   the shelf shows it, one token left');
    await shot('shelf');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`DAILY GAMES FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('DAILY GAMES PASS');
})();
