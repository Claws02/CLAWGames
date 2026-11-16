// ============================================================
// TINY PLANET in the browser, on a small phone.
//   1. the hub card opens the title card, over a planet that is being drawn
//   2. PLAY: a real finger drag walks the crab; the stick shows and goes
//   3. the 🌴 button plants a palm where the crab stands (and says why not, on top of it)
//   4. the autopilot plays on: night falls, stars are drawn and caught, the village grows
//   5. the island is lost in the end: the card pays stardust and keeps the best day
//   6. the workshop: an upgrade is bought, a crab colour worn, both kept after a reload
//   7. leaving the screen stops everything; no page errors
//
// usage: node qa/planet.js        (static server on :8140)
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
    const M = expr => p.evaluate(e => import('/src/arcade/Planet.js').then(M => (new Function('M', 'return ' + e))(M)), expr);
    const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
    const openGame = async () => {
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        await p.click('[data-go="solo"]'); await p.waitForSelector('#scr-solo:not([hidden])');
        await p.click('#solo-list [data-game="planet"]'); await p.click('#pv-play');
        await p.waitForSelector('#tp-cv');
    };
    const until = async (expr, ms = 20000) => { for (let t = 0; t < ms; t += 200) { if (await M(expr)) return true; await p.waitForTimeout(200); } return false; };

    // 1. the title card, over a live planet
    await openGame();
    await p.waitForTimeout(900);
    let d = await M('M._debug()');
    check(d.mode === 'menu' && d.gl && d.calls > 20 && await p.isVisible('#btn-tp-play') && !(await p.isVisible('#tp-bar')), `1. the title card over a planet being drawn (${d.calls} draw calls), the build bar hidden`);
    await shot('planet-menu');

    // 2. a real drag walks the crab
    await p.click('#btn-tp-play');
    d = await M('M._debug()');
    const box = await (await p.$('#tp-cv')).boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height * 0.55;
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 60, cy - 10, { steps: 4 });
    const stick = await p.isVisible('#tp-stick');
    await p.waitForTimeout(700);
    await p.mouse.up();
    const d2 = await M('M._debug()');
    const moved = Math.hypot(d2.crab[0] - d.crab[0], d2.crab[1] - d.crab[1], d2.crab[2] - d.crab[2]);
    check(d.mode === 'play' && stick && moved > 0.2 && !(await p.isVisible('#tp-stick')), `2. PLAY, then a finger drag: the stick shows, the crab walks (${moved.toFixed(2)} of the way round), the stick goes`);

    // 3. the palm button
    await M('(M._game().shells = 9, 1)');
    await p.waitForTimeout(150);
    const before = await M('M._debug()');
    await p.click('#tp-bar [data-build="palm"]');
    const after = await M('M._debug()');
    await p.waitForTimeout(200);
    const crowd = await p.$eval('#tp-bar [data-build="palm"]', e => e.classList.contains('crowd'));
    await p.click('#tp-bar [data-build="palm"]');
    const again = await M('M._debug()');
    check(after.builds.filter(k => k === 'palm').length === before.builds.filter(k => k === 'palm').length + 1 && after.shells === 5 && crowd && again.builds.length === after.builds.length && again.shells === 5,
        `3. 🌴 plants a palm for 4 shells where the crab stands; on top of it the button says step away, and nothing is spent`);
    await shot('planet-palm');

    // 4. the autopilot plays on, fast
    await M('(M._pilot(true, 10), 1)');
    const night = await until('M._debug().phase === "night" && M._debug().drawn.stars > 0');
    await shot('planet-night');
    const day5 = await until('M._debug().day >= 5 || M._debug().mode !== "play"', 40000);
    d = await M('M._debug()');
    check(night && day5 && d.day >= 5 && d.caught > 0 && d.pop >= 2 && d.drawn.builds === d.builds.length && d.visR > 5.6,
        `4. the autopilot plays on: stars fell and were drawn, ${d.caught} caught; day ${d.day}, a village of ${d.pop}, ${d.builds.length} things built and drawn, and the planet has grown (${d.visR})`);
    await shot('planet-day5');

    // 5. the end: stop helping and the island is lost
    await M('(M._pilot(false, 30), 1)');
    const over = await until('M._debug().mode === "over"', 60000);
    d = await M('M._debug()');
    const card = await p.textContent('#tp-over');
    const best = await p.evaluate(() => JSON.parse(localStorage.getItem('claw.solo') || '{}').best?.planet);
    check(over && d.over && d.dust > 0 && best === d.day && /STARDUST/.test(card) && /new best/i.test(card), `5. left alone, the island is lost on day ${d.day}: +${d.dust} stardust, best day ${best}`);
    await shot('planet-over');

    // 6. the workshop
    await M('(M._reset(), 1)');
    await p.evaluate(() => localStorage.setItem('claw.planet', JSON.stringify({ dust: 30, skins: ['coral'] })));
    await openGame();
    await p.click('#btn-tp-shop');
    await p.click('[data-do="up"][data-arg="speed"]');
    await p.click('[data-do="skin"][data-arg="sky"]');
    d = await M('M._debug()');
    const maxed = await p.$eval('[data-do="up"][data-arg="start"]', e => e.disabled);
    check(d.up.speed === 1 && d.skin === 'sky' && d.dust === 5 && maxed, `6. the workshop: Quick Claws level 1 (10) and the Sky crab (15) leave 5 stardust, and nothing else can be afforded`);
    await shot('planet-shop');
    await openGame();
    d = await M('M._debug()');
    await p.click('#btn-tp-play');
    const faster = await M('M._game().up.speed === 1');
    check(d.up.speed === 1 && d.skin === 'sky' && d.dust === 5 && faster, '   after a reload they are still there, and the new island has the upgrade');

    // 7. leaving stops it
    await p.click('#scr-sologame [data-back]'); await p.waitForSelector('#scr-solo:not([hidden])');
    d = await M('M._debug()');
    const cardText = await p.textContent('#solo-list [data-game="planet"] .cs');
    check(!d.gl && /best day/.test(cardText), `7. back at the hub the game is stopped, and its card reads "${cardText}"`);
    check(!errs.length, errs.length ? `page errors: ${errs.slice(0, 3).join(' | ')}` : 'no page errors');

    await browser.close();
    console.log(fail.length ? `\nPLANET (browser) FAIL (${fail.length})` : '\nPLANET (browser) PASS');
    process.exit(fail.length ? 1 : 0);
})();
