// ============================================================
// SOLO GAMES — the hub and its games, played by tapping on a small phone.
//   1. home → SOLO GAMES: TODAY (three dailies, a streak) and five game cards
//   2. Treasure Dig: holes read the steps to the nearest buried chest; all
//      three found → stars, a best, and the Treasure Hunter trophy
//   3. Lighthouse Beams: a clash turns red; the answer solves it
//   4. Pearl Diver: holding dives, letting go floats; air drains under water
//      and refills at the top; a pearl scores; a jellyfish ends the dive
//   5. Rebound: only level 1 is open; a real pull-and-flick clears it with
//      ★★★ and opens level 2
//   6. the dailies: two phones get the same beach; solving marks it done and
//      starts a streak; Critter Square's daily opens as DAILY, sized by the weekday
//   7. leaving a game stops it
//
// usage: node qa/sologames.js   (static server on :8140)
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
    const open = async () => {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`CONSOLE ${m.text()}`); });
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        return p;
    };
    const p = await open();
    const mod = (name, expr) => p.evaluate(([n, e]) => import(`/src/arcade/${n}.js`).then(M => (new Function('M', 'return ' + e))(M)), [name, expr]);
    const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
    const toHub = async () => { await p.click('#scr-sologame [data-back]'); await p.waitForSelector('#scr-solo:not([hidden])'); };

    // 1. the hub
    await p.click('[data-go="solo"]');
    await p.waitForSelector('#scr-solo:not([hidden])');
    const days = await p.$$('#solo-today .hub-day'), cards = await p.$$('#solo-list .hub-card');
    check(days.length === 3 && cards.length >= 5, `1. SOLO GAMES: ${days.length} daily puzzles, ${cards.length} cards`);
    check(/start a streak/.test(await p.textContent('#solo-streak')), `   no streak yet: "${await p.textContent('#solo-streak')}"`);
    await shot('hub');

    // 2. Treasure Dig
    await p.click('#solo-list [data-game="treasure"]');
    await p.waitForSelector('#td-board .td-sq');
    let d = await mod('TreasureDig', 'M._debug()');
    const notChest = [...Array(49).keys()].filter(k => !d.chests.includes(k)).slice(0, 2);
    for (const k of notChest) await p.click(`#td-board [data-k="${k}"]`);
    const shown = await p.evaluate(ks => ks.map(k => document.querySelector(`#td-board [data-k="${k}"]`).textContent), notChest);
    const want = await mod('TreasureDig', `${JSON.stringify(notChest)}.map(k => M.reading(k, M._debug().chests, []))`);
    check(JSON.stringify(shown.map(Number)) === JSON.stringify(want), `2. Treasure Dig: holes read ${shown.join(', ')} steps (nearest chest)`);
    await shot('treasure');
    // marks: in mark mode a tap plants a flag (free); a flagged square can't be dug; tap again to lift it
    await p.click('#btn-td-mark'); await p.click(`#td-board [data-k="${d.chests[0]}"]`);
    const mk = await p.evaluate(k => ({ flag: document.querySelector(`#td-board [data-k="${k}"]`).textContent, st: null }), d.chests[0]);
    await p.click('#btn-td-mark'); await p.click(`#td-board [data-k="${d.chests[0]}"]`);
    const blocked = await p.evaluate(() => import('/src/arcade/TreasureDig.js').then(T => T._debug()));
    await p.click('#btn-td-mark'); await p.click(`#td-board [data-k="${d.chests[0]}"]`); await p.click('#btn-td-mark');
    check(mk.flag === '🚩' && blocked.dug.length === notChest.length && blocked.found.length === 0, `   🚩 a marked square isn't dug by a tap (digs still ${blocked.dug.length}), and marking is free`);
    const say = await p.textContent('#td-say');
    check(say.length > 3, `   Polly calls the digs: "${say}"`);
    for (const k of d.chests) await p.click(`#td-board [data-k="${k}"]`);
    await p.waitForSelector('#td-done:not([hidden])', { timeout: 5000 }).catch(() => {});
    check(/★★★/.test(await p.textContent('#td-done-h')) && /5 digs/.test(await p.textContent('#td-done-t')), `   all found: "${await p.textContent('#td-done-h')}" in "${await p.textContent('#td-done-t')}"`);
    const tro = await p.evaluate(() => import('/src/arcade/Trophies.js').then(T => T.all().find(t => t.id === 'treasure_3')));
    check(!!tro.earned, '   the Treasure Hunter trophy is earned');
    await toHub();
    check(/best 5 digs/.test(await p.textContent('#solo-list [data-game="treasure"]')), '   the hub shows the best: 5 digs');

    // 3. Lighthouse Beams
    await p.click('#solo-list [data-game="lighthouse"]');
    await p.click('.cs-level[data-level="easy"]');
    await p.waitForSelector('#lh-board .lh-sq');
    d = await mod('Lighthouse', 'M._debug()');
    const sea = d.p.grid.map((v, k) => (v === 0 && !d.p.solution.includes(k) ? k : -1)).filter(k => k >= 0);
    // a wrong lighthouse in a right one's beam: a clash (any lighthouse of the answer with sea in its beam)
    let clashed = false;
    for (const L of d.p.solution) {
        const inBeam = await mod('LighthouseLogic', `M.rays(${d.p.n}, ${JSON.stringify(d.p.grid)}, ${L}).filter(k => ${JSON.stringify(sea)}.includes(k))[0] ?? -1`);
        if (inBeam < 0) continue;
        // the wrong one first (L alone may be the whole answer, and would solve it), and L off first after
        await p.click(`#lh-board [data-k="${inBeam}"]`); await p.click(`#lh-board [data-k="${L}"]`);
        clashed = await p.$eval(`#lh-board [data-k="${inBeam}"]`, el => el.classList.contains('bad'));
        await shot('lighthouse');
        await p.click(`#lh-board [data-k="${L}"]`); await p.click(`#lh-board [data-k="${inBeam}"]`);
        break;
    }
    check(clashed, '3. Lighthouse Beams: a lighthouse in another\'s beam turns red');
    for (const k of d.p.solution) await p.click(`#lh-board [data-k="${k}"]`);
    await p.waitForSelector('#lh-done:not([hidden])', { timeout: 5000 }).catch(() => {});
    check(await p.isVisible('#lh-done') && /NEW BEST/.test(await p.textContent('#lh-done-best')), `   the answer solves it: "${await p.textContent('#lh-done-best')}"`);
    await toHub();

    // 4. Pearl Diver
    await p.click('#solo-list [data-game="pearl"]');
    await p.click('#btn-pd-go');
    const cv = await p.$('#pd-cv'), box = await cv.boundingBox();
    const y0 = (await mod('PearlDiver', 'M._debug()')).y;
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.waitForTimeout(900);
    const deep = await mod('PearlDiver', 'M._debug()');
    check(deep.y > y0 + 0.1 && deep.air < 1, `4. Pearl Diver: holding dives (depth ${y0.toFixed(2)} → ${deep.y.toFixed(2)}), air drains (${deep.air.toFixed(2)})`);
    await p.mouse.up(); await p.waitForTimeout(1600);
    const up = await mod('PearlDiver', 'M._debug()');
    check(up.y < deep.y, `   letting go floats back up (→ ${up.y.toFixed(2)})`);
    await p.waitForTimeout(800);
    const top = await mod('PearlDiver', 'M._debug()');
    check(top.air > up.air || top.air === 1, `   at the top the air fills back up (${up.air.toFixed(2)} → ${top.air.toFixed(2)})`);
    await mod('PearlDiver', "M._place('pearl')"); await p.waitForTimeout(250);
    const sc = (await mod('PearlDiver', 'M._debug()')).score;
    check(sc >= 3, `   a pearl scores (${sc})`);
    await shot('pearl');
    await mod('PearlDiver', "M._place('jelly')"); await p.waitForTimeout(300);
    const over = await mod('PearlDiver', 'M._debug()');
    check(over.over && /jellyfish/.test(over.why) && await p.isVisible('#pd-over'), `   a jellyfish ends the dive: "${over.why}"`);
    check(/NEW BEST/.test(await p.textContent('#pd-best')), `   and the score is a best: "${await p.textContent('#pd-best')}"`);

    // 7. leaving stops it
    await p.click('#btn-pd-go');
    await toHub();
    check((await mod('PearlDiver', 'M._debug()')) === null, '7. leaving Pearl Diver mid-dive stops it');

    // 5. Rebound
    await p.click('#solo-list [data-game="rebound"]');
    const locked = await p.$$eval('.rb-lv', els => els.map(e => e.classList.contains('locked')));
    check(!locked[0] && locked.slice(1).every(Boolean), `5. Rebound: only level 1 is open (${locked.filter(x => !x).length} of ${locked.length})`);
    await p.click('.rb-lv[data-i="0"]');
    const rc = await (await p.$('#rb-cv')).boundingBox();
    // pull straight down from the middle: the pearl goes straight up
    await p.mouse.move(rc.x + rc.width / 2, rc.y + rc.height * 0.4);
    await p.mouse.down();
    await p.mouse.move(rc.x + rc.width / 2, rc.y + rc.height * 0.4 + rc.height * 0.28, { steps: 5 });
    await shot('rebound-aim');
    await p.mouse.up();
    await p.waitForSelector('#rb-done:not([hidden])', { timeout: 15000 }).catch(() => {});
    check(/★★★/.test(await p.textContent('#rb-done-h')), `   a pull and flick straight up clears level 1: "${await p.textContent('#rb-done-h')}" (${await p.textContent('#rb-done-t')})`);
    await p.click('#btn-rb-levels');
    check(!(await p.$eval('.rb-lv[data-i="1"]', e => e.classList.contains('locked'))), '   level 2 is open now');
    await toHub();

    // 6. the dailies
    // Today's three rotate by the date (qa/dailygames.js checks that), so open these dailies directly.
    await p.evaluate(() => import('/src/arcade/SoloHub.js').then(H => H.playDaily('treasure')));
    await p.waitForSelector('#td-board .td-sq');
    const day1 = (await mod('TreasureDig', 'M._debug()')).chests;
    const p2 = await open();
    const day2 = await p2.evaluate(() => import('/src/arcade/SoloStats.js').then(S => import('/src/arcade/TreasureDig.js').then(T => T.bury(S.rng(S.dailySeed('treasure'))))));
    check(JSON.stringify(day1) === JSON.stringify(day2), `6. today's beach is the same on another phone: chests at ${day1.join(', ')}`);
    await p2.close();
    for (const k of day1) await p.click(`#td-board [data-k="${k}"]`);
    await p.waitForSelector('#td-done:not([hidden])', { timeout: 5000 }).catch(() => {});
    check(/Today's beach/.test(await p.textContent('#td-done-best')), `   solved: "${await p.textContent('#td-done-best')}"`);
    await toHub();
    check((await mod('SoloStats', "M.dailyDone('treasure')")) && /1 day in a row/.test(await p.textContent('#solo-streak')),
        `   it's marked done and the streak starts: "${await p.textContent('#solo-streak')}"`);
    await p.evaluate(() => import('/src/arcade/SoloHub.js').then(H => H.playDaily('critter')));
    await p.waitForSelector('#cs-play:not([hidden])');
    const lvN = { easy: 16, medium: 25, hard: 36 }[await mod('SoloStats', 'M.dailyLevel()')];
    check(/DAILY/.test(await p.textContent('#cs-level')) && (await p.$$('#cs-board .cs-sq')).length === lvN, `   Critter Square's daily opens at today's size: "${await p.textContent('#cs-level')}"`);

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`SOLO GAMES FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('SOLO GAMES PASS');
})();
