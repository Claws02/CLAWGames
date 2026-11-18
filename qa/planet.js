// ============================================================
// TINY PLANET in the browser, on a small phone.
//   1. the hub card opens it over the whole screen: the title card, a planet being drawn
//   2. PLAY: a real finger drag walks the crab; the tracker moves on from "drag to walk"
//   2b. two thumbs at once: the left half walks, the right half turns the camera
//   3. the 🌴 button plants a palm; a locked building says what opens it
//   4. JUMP hops; the action button shakes a palm, picks up a rock and throws it at a star
//   5. a fiendish boardwalk is drawn (sweepers, a crumbling bridge, a spring, checkpoints); timed and
//      jumped to the end it pays shells and stardust and is cleared away
//   6. the autopilot plays on: night falls, stars are caught, the camp becomes a village
//   7. pause stops the clock; SAVE & LEAVE goes back to the hub; CONTINUE picks the city up
//   7b. the Trick Hut: Old Ink's Lair opens; coconuts are picked up, thrown with the real button and
//       picked up again; hints; the answer is played on screen; stars, stardust and shells are paid
//   8. the end: the card counts the crabs, pays stardust and keeps the biggest city
//   9. the workshop: an upgrade and a crab colour, kept after a reload
//  10. no page errors
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
    // M: the screen, L: the rules
    const M = expr => p.evaluate(e => Promise.all([import('/src/arcade/Planet.js'), import('/src/arcade/PlanetLogic.js')]).then(([M, L]) => (new Function('M', 'L', 'return ' + e))(M, L)), expr);
    const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
    const openGame = async () => {
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        await p.click('[data-go="solo"]'); await p.waitForSelector('#scr-solo:not([hidden])');
        await p.click('#solo-list [data-game="planet"]'); await p.click('#pv-play');
        await p.waitForSelector('#tp-cv');
    };
    const until = async (expr, ms = 20000) => { for (let t = 0; t < ms; t += 200) { if (await M(expr)) return true; await p.waitForTimeout(200); } return false; };
    const tap = sel => p.dispatchEvent(sel, 'pointerdown', { bubbles: true, pointerId: 7 });

    // 1. the title card, over the whole screen
    await openGame();
    await p.waitForTimeout(900);
    let d = await M('M._debug()');
    const box = await (await p.$('#tp-wrap')).boundingBox();
    check(d.mode === 'menu' && d.gl && d.calls > 20 && box.x === 0 && box.y === 0 && box.width === 375 && box.height === 667 && await p.isVisible('#btn-tp-play') && !(await p.isVisible('#tp-bar')) && !(await p.isVisible('#btn-tp-continue')),
        `1. the game fills the screen (${box.width}×${box.height}): the title card over a planet being drawn (${d.calls} draw calls), no CONTINUE yet`);
    await shot('planet-menu');

    // 2. a real drag walks the crab
    await p.click('#btn-tp-play');
    d = await M('M._debug()');
    const goal0 = await p.textContent('#tp-goal');
    const cx = 150, cy = 380;
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 60, cy - 10, { steps: 4 });
    const stick = await p.isVisible('#tp-stick');
    await p.waitForTimeout(1100);
    await p.mouse.up();
    await p.waitForTimeout(150);
    const d2 = await M('M._debug()'), goal1 = await p.textContent('#tp-goal');
    const moved = Math.hypot(d2.crab[0] - d.crab[0], d2.crab[1] - d.crab[1], d2.crab[2] - d.crab[2]);
    check(d.mode === 'play' && stick && moved > 0.2 && !(await p.isVisible('#tp-stick')) && /DRAG/.test(goal0) && !/DRAG/.test(goal1), `2. PLAY, then a finger drag: the stick shows, the crab walks, and the tracker moves on ("${goal0.trim()}" → "${goal1.trim()}")`);

    // 2b. two thumbs: the left half walks, the right half turns the camera, both at once
    const finger = (type, id, x, y) => p.evaluate(([type, id, x, y]) => { const ev = new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true }); (type === 'pointerdown' ? document.getElementById('tp-cv') : window).dispatchEvent(ev); }, [type, id, x, y]);
    const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    const view0 = await M('M._game().crab.f.slice()'), pos0 = await M('M._game().crab.p.slice()');
    await finger('pointerdown', 21, 300, 420); await finger('pointermove', 21, 360, 420); await finger('pointerup', 21, 360, 420);
    const view1 = await M('M._game().crab.f.slice()'), pos1 = await M('M._game().crab.p.slice()');
    check(Math.abs(ang(view0, view1) - 0.72) < 0.08 && ang(pos0, pos1) < 0.02 && !(await p.isVisible('#tp-stick')), `2b. a drag on the right half turns the camera by ${ang(view0, view1).toFixed(2)} rad (60 px) and doesn't move the crab or show the stick`);
    await finger('pointerdown', 22, 100, 420); await finger('pointermove', 22, 100, 360);        // left thumb: walk forward
    await finger('pointerdown', 23, 300, 420);
    const walkFrom = await M('M._game().crab.p.slice()'), turnFrom = await M('M._game().crab.f.slice()');
    for (let k = 1; k <= 8; k++) { await finger('pointermove', 23, 300 - k * 10, 420); await p.waitForTimeout(90); }
    const stickShown = await p.isVisible('#tp-stick');
    await finger('pointerup', 22, 100, 360); await finger('pointerup', 23, 220, 420);
    const walkTo = await M('M._game().crab.p.slice()'), turnTo = await M('M._game().crab.f.slice()');
    check(stickShown && ang(walkFrom, walkTo) > 0.1 && ang(turnFrom, turnTo) > 0.5, `    both thumbs at once: the crab walked (${ang(walkFrom, walkTo).toFixed(2)} rad round) while the view turned (${ang(turnFrom, turnTo).toFixed(2)} rad)`);
    check(await p.evaluate(() => { const z = document.getElementById('tp-zones'); return !!z && z.hidden; }), '    and the "left thumb walks, right thumb looks" cue goes away once both have been used');

    // 3. the palm button, and a locked one
    await M('(M._game().shells = 9, M._game().course = null, 1)');
    await p.waitForTimeout(150);
    const before = await M('M._debug()');
    await p.click('#tp-bar [data-build="palm"]');
    const after = await M('M._debug()');
    await p.click('#tp-bar [data-build="tower"]');
    const locked = await p.textContent('#tp-hint'), lockTxt = await p.textContent('#tp-bar [data-build="tower"] small');
    check(after.builds.filter(k => k === 'palm').length === before.builds.filter(k => k === 'palm').length + 1 && after.shells === 5 && /VILLAGE \(5 CRABS\)/.test(locked) && /🔒/.test(lockTxt) && after.builds.length === (await M('M._debug()')).builds.length,
        `3. 🌴 plants a palm for 4 shells; the tower is locked and says so: "${locked}"`);
    await shot('planet-palm');

    // 4. jump, and the action button
    await tap('#btn-tp-jump');
    const air = await M('M._debug().air');
    await p.waitForTimeout(800);
    // (stand by the palm, grown; then by a rock; then a star to throw at)
    await M(`(() => { const s = M._game(), palm = s.builds.find(b => b.kind === 'palm'); palm.age = 99; s.crab.p = L.walk(palm.p, L.tangent(palm.p, [1, 0, 0]), 1 / s.R); s.items = []; return 1; })()`);
    await p.waitForTimeout(200);
    const actLabel = await p.textContent('#btn-tp-act small');
    await tap('#btn-tp-act');
    const nuts = await M(`M._game().items.filter(i => i.kind === 'nut').length + M._game().nuts`);
    await M(`(() => { const s = M._game(); s.items = [{ id: 9001, kind: 'rock', p: L.walk(s.crab.p, s.crab.f, 0.8 / s.R) }]; return 1; })()`);
    await M(`(() => { const s = M._game(), palm = s.builds.find(b => b.kind === 'palm'); s.crab.p = L.walk(s.items[0].p, s.crab.f, 0.2 / s.R); if (L.context(s).kind !== 'carry') s.crab.p = s.items[0].p.slice(); return 1; })()`);
    await p.waitForTimeout(200);
    const pick = await p.textContent('#btn-tp-act small');
    await tap('#btn-tp-act');
    const carry = await M('M._debug().carry');
    await M(`(() => { const s = M._game(); s.phase = 'night'; s.pt = 0; s.due = []; s.stars = [{ id: 9100, p: s.builds[0].p.slice(), t: 0, T: 9, r: L.BIG_R, big: true }]; return 1; })()`);
    await p.waitForTimeout(400);
    const thr = await p.textContent('#btn-tp-act small'), drawnStar = await M('M._debug().drawn.stars');
    await tap('#btn-tp-act');
    d = await M('M._debug()');
    check(air > 0 && /SHAKE/.test(actLabel) && nuts === 1 && /PICK UP/.test(pick) && carry === 'rock' && /THROW/.test(thr) && drawnStar === 1 && d.stars === 0 && !d.carry,
        `4. JUMP hops; the action button reads ${actLabel} by a palm (a coconut drops), ${pick} by a rock, then ${thr} at a big star, which is gone`);
    await M(`(() => { const s = M._game(); s.phase = 'day'; s.pt = 0; return 1; })()`);

    // 5. the boardwalk
    await M(`(() => { const s = M._game(); s.rnd = Math.random; s.town = 2; s.R = 7.4; L._newCourse(s, 3); return 1; })()`);
    await p.waitForTimeout(400);
    const planks = await M('M._debug().drawn.course'), sh0 = await M('M._debug().shells');
    // (a player who looks ahead: walk on, jump or wait, whichever doesn't fall; the jump goes through the real button code)
    const prize = await M(`(() => { const s = M._game(), co = s.course, c = s.crab; s.items = []; c.p = co.pts[0].slice(); L.step(s, 1 / 60);
        const ahead = act => { const t = L.load(L.save(s), () => 0.5), o = t.course; if (act === 'jump') L.jump(t);
            for (let i = 0; i < 54 && !o.done; i++) { const b = o.pts[Math.min(o.k + 1, o.pts.length - 1)], dd = L.toward(t.crab.p, b), r = L.cross(t.crab.f, t.crab.p); if (L.step(t, 1 / 60, act === 'wait' && i < 12 ? { x: 0, y: 0 } : { x: L.dot(dd, r), y: L.dot(dd, t.crab.f) }).some(e => e.type === 'fell')) return false; } return true; };
        let falls = 0;
        for (let i = 0; i < 60 * 60 && co.k >= 0 && !co.done; i++) { let act = 'go'; if (i % 3 === 0 && !ahead('go')) act = ahead('jump') ? 'jump' : 'wait';
            if (act === 'jump') M.pressJump();
            const b = co.pts[co.k + 1], dd = L.toward(c.p, b), r = L.cross(c.f, c.p);
            if (L.step(s, 1 / 60, act === 'wait' ? { x: 0, y: 0 } : { x: L.dot(dd, r), y: L.dot(dd, c.f) }).some(e => e.type === 'fell')) falls++; }
        return co.done ? { prize: co.prize + co.pts.length - 1, dust: s.stats.dust, falls, kinds: [...new Set(co.segs)].join(' ') } : null; })()`);
    await p.waitForTimeout(400);
    d = await M('M._debug()');
    check(planks > 30 && prize && d.shells >= sh0 + prize.prize && prize.dust === 8 && d.drawn.course === 0, `5. a fiendish boardwalk is drawn (${planks} pieces: ${prize && prize.kinds}); timed and jumped to the end it pays ${prize && prize.prize} shells and ${prize && prize.dust} stardust, and is cleared away`);
    await M(`(() => { const s = M._game(); s.town = 0; s.R = L.R0; s.stats.dust = 0; s.course = null; return 1; })()`);

    // 6. the autopilot plays on, fast
    await M('(M._game().shells += 20, M._game().nuts += 8, M._pilot(true, 10), 1)');
    const night = await until('M._debug().phase === "night" && M._debug().drawn.stars > 0');
    await shot('planet-night');
    const village = await until('(M._debug().town >= 1 && M._debug().caught > 0) || M._debug().mode !== "play"', 60000);
    d = await M('M._debug()');
    check(night && village && d.town >= 1 && d.pop >= 5 && d.caught > 0 && d.drawn.builds === d.builds.length && d.visR > 5.6 && /CRABS/.test(await p.textContent('#tp-goal')),
        `6. the autopilot plays on: ${d.caught} stars caught; day ${d.day}, ${d.pop} crabs make a village, the planet has grown (${d.visR}) and the tracker now reads "${(await p.textContent('#tp-goal')).trim()}"`);
    await shot('planet-village');

    // 7. pause, save & leave, continue
    await M('(M._pilot(false, 1), 1)');
    await p.click('#btn-tp-pause');
    const t0 = await M('M._game().t'); await p.waitForTimeout(600); const t1 = await M('M._game().t');
    d = await M('M._debug()');
    const want = { day: d.day, shells: d.shells, pop: d.pop, n: d.builds.length };
    check(d.paused && t0 === t1 && d.saved && d.saved.day === d.day && await p.isVisible('#btn-tp-leave'), `7. ⏸ stops the clock and saves the city (day ${d.day})`);
    await shot('planet-pause');
    await p.click('#btn-tp-leave');
    await p.waitForSelector('#scr-solo:not([hidden])');
    const gone = !(await p.isVisible('#tp-wrap')) && !(await M('M._debug().gl'));
    await openGame();
    const cont = await p.textContent('#btn-tp-continue');
    await p.click('#btn-tp-continue');
    d = await M('M._debug()');
    check(gone && new RegExp(`${want.pop} crabs · day ${want.day}`).test(cont) && d.mode === 'play' && d.day === want.day && Math.abs(d.shells - want.shells) <= 2 && d.pop === want.pop && d.builds.length === want.n && d.town >= 1,
        `   SAVE & LEAVE goes back to the hub; "${cont.trim()}" brings the same city back (${d.pop} crabs, ${d.builds.length} things built)`);

    // 7b. Old Ink's Lair, through the Trick Hut
    const MK = expr => p.evaluate(e => Promise.all([import('/src/arcade/Planet.js'), import('/src/arcade/PlanetLogic.js'), import('/src/arcade/LairLogic.js'), import('/qa/lair-solve.mjs')]).then(([M, L, K, S]) => (new Function('M', 'L', 'K', 'S', 'return ' + e))(M, L, K, S)), expr);
    const city0 = await M('M._debug()');
    await M(`(() => { const s = M._game(), th = s.builds.find(b => b.kind === 'trick'); s.trickArmed = true; s.crab.p = L.walk(th.p, L.tangent(th.p, [1, 0, 0]), 0.7 / s.R); return 1; })()`);
    await p.waitForSelector('.tp-lvl');
    const card0 = await p.textContent('#tp-over');
    check((await M('M._debug().mode')) === 'trick' && /OLD INK/.test(card0) && /Tide Pearl/.test(card0) && /3 coconuts/.test(card0) && (await p.$$('.tp-lvl')).length === 7 && /WORLD 2/.test(card0) && (await p.$$('.tp-lvl:disabled')).length === 0 && /WORLD 1/.test(card0) && !(await p.isVisible('#tp-bar')), `7b. walking into the Trick Hut opens Old Ink's Lair: the story, the rules of the claws, one chamber`);
    await shot('lair-card');
    await p.click('.tp-lvl[data-arg="3"]');
    await p.waitForTimeout(500);
    let tr = (await M('M._debug().trial'));
    const hudStart = await p.textContent('#tp-trial-s'), hintBtn = await p.isVisible('#btn-tp-hint');
    await p.waitForSelector('#tp-sign', { state: 'visible', timeout: 6000 });
    const sign = (await p.isVisible('#tp-sign')) ? await p.textContent('#tp-sign') : '';
    check(/4\s*\/7/.test(sign) && /THE DROWNED STAIR/.test(sign) && /OLD INK/.test(sign) && /GULL/.test(sign) && /VENTS/.test(sign), `    after a look at the pearl, an arrival card at the door: the chamber number, its name, and what's inside ("${sign.replace(/\s+/g, ' ').trim().slice(0, 70)}…")`);
    check(tr.id === 'stair' && tr.held === 0 && tr.count.loose === 3 && /0\/3/.test(hudStart) && hintBtn, `    the Drowned Stair starts with three coconuts under the palm and none in the claws ("${hudStart.trim()}"), and a 💡 button`);
    // no coconut: the throw button says so and throws nothing
    await p.dispatchEvent('#btn-tp-act', 'pointerdown', { bubbles: true, pointerId: 9 }); await p.waitForTimeout(250);
    await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9 })));
    const noNut = await p.textContent('#tp-hint');
    check(/NO COCONUT/.test(noNut) && (await M('M._debug().trial')).throws === 0, `    with none in the claws the throw button throws nothing: "${noNut.trim()}"`);
    // walk into one (the real pick-up), throw it with the real button, walk to it again
    await MK(`(() => { const s = M._trialNow().state(), n = s.nuts.find(x => x.state === 'rest'); s.crab.p = n.p.slice(); return 1; })()`);
    await p.waitForTimeout(200);
    const held1 = (await M('M._debug().trial')).held;
    await MK(`(() => { const s = M._trialNow().state(); s.crab.f = L.tangent(s.crab.p, K.at(K.STAIR.bank + 3, 100)); s.crab.face = s.crab.f; return 1; })()`);
    await p.dispatchEvent('#btn-tp-act', 'pointerdown', { bubbles: true, pointerId: 9 }); await p.waitForTimeout(400);
    const winding = (await M('M._debug().trial')).charging, label = await p.textContent('#btn-tp-act small');
    await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9 })));
    await p.waitForTimeout(1300);
    tr = await M('M._debug().trial');
    await MK(`(() => { const s = M._trialNow().state(), n = s.nuts.find(x => x.state === 'rest' && x.id > 3); if (n) s.crab.p = n.p.slice(); return 1; })()`);
    await p.waitForTimeout(250);
    const held2 = (await M('M._debug().trial')).held;
    check(held1 === 1 && winding > 0.2 && /LET GO/.test(label) && tr.held === 0 && tr.throws === 1 && held2 === 1, `    walking into a coconut picks it up (1/3); holding 🥥 winds up (${winding.toFixed(2)}) and letting go throws it (0 held); walking into it again picks it up`);
    await tap('#btn-tp-jump'); await p.waitForTimeout(150);
    const up = (await M('M._debug().trial')).h;
    check(up > 0.3, `    JUMP jumps (${up} up)`);
    // the 💡 button reveals hints one at a time
    await p.click('#btn-tp-hint'); const h1 = await p.textContent('#tp-goal'); await p.click('#btn-tp-hint'); const h2 = await p.textContent('#tp-goal');
    check(/1\/6/.test(h1) && /2\/6/.test(h2) && h1 !== h2, `    the 💡 button shows the hints one at a time ("${h2.trim().slice(0, 60)}…")`);
    await shot('lair-start');
    await p.click('#btn-tp-pause'); await p.click('[data-do="trial-again"]');
    const fresh = await M('M._debug().trial');
    check(fresh.held === 0 && fresh.throws === 0 && fresh.count.loose === 3, `    ⏸ START AGAIN gives a fresh chamber`);
    // play the answer: the player that solves it, on the screen's own state (two stages, with a look at each)
    await MK(`(() => { const st = M._trialNow().state(); S.solve({ s: st, stopAtShelf: true }); return 1; })()`);
    await p.waitForTimeout(600);
    d = await M('M._debug()');
    check(d.trial.plug.A && d.trial.held === 2 && d.trial.cp === 1 && d.trial.count.working === 1, `    the answer, parts 1 and 2 on screen: vent A plugged by a coconut the current carried, across the rocks, up vent B and over the cliff, onto the shelf with two coconuts and its flag`);
    await shot('lair-shelf');
    await MK(`(() => { const st = M._trialNow().state(); S.solve({ s: st, from: 'shelf' }); return 1; })()`);
        await p.waitForSelector('#btn-tp-next, .tp-big', { timeout: 20000 });
    const win = await p.textContent('#tp-over');
    d = await M('M._debug()');
    check(/TIDE PEARL/.test(win) && /⭐⭐⭐/.test(win) && /\+24 ✨/.test(win) && /\+40 🐚/.test(win) && d.lair.stair.every(Boolean) && d.dust === city0.dust + 24, `    parts 3 and 4: over the step on the gull's back, the plate and the bullseye, the pearl: ⭐⭐⭐ (no falls, quick), +24 stardust and +40 shells for the city`);
    await shot('lair-won');
    await p.click('#btn-tp-city');
    d = await M('M._debug()');
    check(d.mode === 'play' && !d.trial && d.pop === city0.pop && d.shells >= city0.shells + 40 && d.shells <= city0.shells + 44 && await p.isVisible('#tp-bar') && !(await p.isVisible('#btn-tp-hint')), `    BACK TO THE CITY: the same city, 40 shells richer, the lair's buttons gone`);

    // 8. the end
    await p.click('#btn-tp-pause'); await p.click('[data-do="giveup"]');
    d = await M('M._debug()');
    const card = await p.textContent('#tp-over');
    const best = await p.evaluate(() => JSON.parse(localStorage.getItem('claw.solo') || '{}').best?.planetCity);
    check(d.mode === 'over' && d.dust > 24 && best >= want.pop && /STARDUST/.test(card) && /biggest yet/i.test(card) && !d.saved, `8. the end: the card counts the city (${best} crabs), pays +${d.dust} stardust, and the save is gone`);
    await shot('planet-over');

    // 9. the workshop
    await M('(M._reset(), 1)');
    await p.evaluate(() => localStorage.setItem('claw.planet', JSON.stringify({ dust: 30, skins: ['coral'] })));
    await openGame();
    await p.click('#btn-tp-shop');
    await p.click('[data-do="up"][data-arg="speed"]');
    await p.click('[data-do="skin"][data-arg="sky"]');
    d = await M('M._debug()');
    const maxed = await p.$eval('[data-do="up"][data-arg="start"]', e => e.disabled);
    check(d.up.speed === 1 && d.skin === 'sky' && d.dust === 5 && maxed, `9. the workshop: Quick Claws level 1 (10) and the Sky crab (15) leave 5 stardust, and nothing else can be afforded`);
    await shot('planet-shop');
    await openGame();
    d = await M('M._debug()');
    await p.click('#btn-tp-play');
    const faster = await M('M._game().up.speed === 1');
    check(d.up.speed === 1 && d.skin === 'sky' && d.dust === 5 && faster, '   after a reload they are still there, and the new city has the upgrade');

    // 10. leaving stops it
    await p.click('#btn-tp-pause'); await p.click('#btn-tp-leave'); await p.waitForSelector('#scr-solo:not([hidden])');
    d = await M('M._debug()');
    const cardText = await p.textContent('#solo-list [data-game="planet"] .cs');
    check(!d.gl && /biggest city/.test(cardText), `10. back at the hub the game is stopped, and its card reads "${cardText}"`);
    check(!errs.length, errs.length ? `page errors: ${errs.slice(0, 3).join(' | ')}` : 'no page errors');

    await browser.close();
    console.log(fail.length ? `\nPLANET (browser) FAIL (${fail.length})` : '\nPLANET (browser) PASS');
    process.exit(fail.length ? 1 : 0);
})();
