// ============================================================
// AIM GAMES — Orbit Putt, Crab Cannon, Sea Snooker, Reef Drop and Mirror
// Lagoon in the browser, on a small phone, plus Rebound's new worlds.
//   1. the hub has 15 cards, the new games among them
//   2. each aim game: level 1 opens, a real pull-and-release takes a shot, and
//      the solver's shots (or a greedy aim, for Reef Drop) clear it on screen
//      with stars; level 2 opens
//   3. Mirror Lagoon: tapping the mirrors that differ from the answer lights
//      every lantern
//   4. Rebound: the four worlds in the picker; the daily tank opens
//
// usage: node qa/aimgames.js        (static server on :8140)
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
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`PAGEERROR ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`CONSOLE ${m.text()}`); });
    await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
    const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
    const hub = async () => { await p.click('#scr-sologame [data-back]').catch(() => {}); await p.waitForSelector('#scr-solo:not([hidden])'); };

    await p.click('[data-go="solo"]'); await p.waitForSelector('#scr-solo:not([hidden])');
    const cards = await p.$$eval('#solo-list .hub-card', els => els.map(e => e.dataset.game));
    check(cards.length === 15 && ['orbit', 'cannon', 'snooker', 'reefdrop', 'mirror'].every(c => cards.includes(c)), `1. the hub: ${cards.length} cards (${cards.join(', ')})`);

    // 2. the aim games
    const games = [['orbit', 'Orbit', 'OrbitLogic'], ['cannon', 'Cannon', 'CannonLogic'], ['snooker', 'Snooker', 'SnookerLogic'], ['reefdrop', 'ReefDrop', 'ReefDropLogic']];
    for (const [id, screen, logic] of games) {
        await p.click(`#solo-list [data-game="${id}"]`);
        await p.click('.rb-lv[data-i="0"]');
        await p.waitForSelector('#ag-cv');
        // a real pull back and release
        const cv = await (await p.$('#ag-cv')).boundingBox();
        await p.mouse.move(cv.x + cv.width / 2, cv.y + cv.height * 0.5); await p.mouse.down();
        await p.mouse.move(cv.x + cv.width / 2 + 5, cv.y + cv.height * 0.5 + 60, { steps: 4 });
        await shot(`${id}-aim`);
        await p.mouse.up();
        await p.waitForFunction(m => import(m).then(G => !G._debug().moving), `/src/arcade/${screen}.js`, { timeout: 15000 }).catch(() => {});
        await p.waitForTimeout(300);
        const took = await p.evaluate(m => import(m).then(G => G._debug().shots), `/src/arcade/${screen}.js`);
        // then restart and clear it with the solver's shots
        const res = await p.evaluate(async ([screen, logic, id]) => {
            const G = await import(`/src/arcade/${screen}.js`), L = await import(`/src/arcade/${logic}.js`), A = await import('/src/arcade/AimSearch.js');
            G.play(0);
            const wait = async () => { for (let k = 0; k < 400 && G._debug().moving; k++) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 150)); };
            if (id === 'reefdrop') {
                for (let n = 0; n < 10 && !G._debug().cleared; n++) {
                    const s = G._debug().state; let best = null;
                    for (let a = 0; a < 60; a++) for (const pw of [0.3, 0.6, 1]) { const c = L.copy(s), ang = 0.05 + (a / 60) * (Math.PI - 0.1); L.shot(L.LEVELS[0], c, ang, pw); L.settle(L.LEVELS[0], c); const sc = L.score(L.LEVELS[0], c); if (!best || sc > best.sc) best = { sc, ang, pw }; }
                    G.shoot(best.ang, best.pw); await wait();
                }
            } else {
                const r = A.solve(L, L.LEVELS[0], { maxDepth: L.LEVELS[0].par, ...L.SEARCH });
                for (const [a, pw] of r.path) { G.shoot(a, pw); await wait(); }
            }
            await new Promise(r => setTimeout(r, 300));
            return { ...G._debug(), done: !document.getElementById('ag-done').hidden, title: document.getElementById('ag-done-h').textContent };
        }, [screen, logic, id]);
        check(took >= 1 && res.cleared && res.done && /★/.test(res.title), `2. ${screen}: a real pull-and-release took a shot (${took}); level 1 cleared on screen: "${res.title}"`);
        await shot(`${id}-done`);
        await p.click('#btn-ag-levels');
        check(!(await p.$eval('.rb-lv[data-i="1"]', e => e.classList.contains('locked'))), `   ${screen}: level 2 is open`);
        await hub();
    }

    // 3. Mirror Lagoon by taps
    await p.click('#solo-list [data-game="mirror"]');
    await p.click('.rb-lv[data-i="0"]');
    await p.waitForSelector('#ml-board .ml-sq');
    await shot('mirror');
    const d = await p.evaluate(() => import('/src/arcade/Mirror.js').then(M => M._debug()));
    const toFlip = Object.keys(d.lv.solution).filter(k => d.lv.solution[k] !== d.mirrors[k]);
    for (const k of toFlip) await p.click(`#ml-board button[data-k="${k}"]`);
    await p.waitForSelector('#ml-done:not([hidden])', { timeout: 4000 }).catch(() => {});
    check(await p.isVisible('#ml-done'), `3. Mirror Lagoon: ${toFlip.length} taps light every lantern: "${await p.textContent('#ml-done-h').catch(() => '')}" (${await p.textContent('#ml-done-t').catch(() => '')})`);
    await shot('mirror-done');
    await hub();

    // 4. Rebound
    await p.click('#solo-list [data-game="rebound"]');
    const worlds = await p.$$eval('.rb-world .panel-h', els => els.map(e => e.textContent.trim().split('★')[0].trim()));
    check(worlds.length === 4 && (await p.$$('.rb-lv')).length === 32, `4. Rebound: ${worlds.join(' · ')}, 32 tanks`);
    await hub();
    await p.evaluate(() => import('/src/arcade/SoloHub.js').then(H => H.playDaily('rebound')));
    await p.waitForSelector('#rb-cv');
    const dt = await p.evaluate(() => import('/src/arcade/Rebound.js').then(R => R._debug()));
    check(dt.daily && dt.par >= 2 && /DAILY/.test(await p.textContent('#scr-sologame .cs-top')), `   the daily tank opens (par ${dt.par})`);
    await shot('rebound-daily');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`AIM GAMES (browser) FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('AIM GAMES (browser) PASS');
})();
