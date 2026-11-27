// ============================================================
// PARKOUR — Playroom Parkour (src/games/parkour/), headless, in the real app.
//   1. SOLO lists it; its card opens the Toy Box (the hub, four floors), full screen; the hero is drawn
//      from a sheet of poses (your own character, rigged), and it really changes pose
//   2. the real buttons: ▶ walks, JUMP jumps; door 2 is locked at first;
//      ▲ GO at door 1 starts the course; ✕ in a course goes back to the Toy Box at that door
//   3. every course, played by the checker's ★★★ route: the hero cheers, then COURSE CLEAR with ★★★,
//      BACK TO THE TOY BOX lands at that course's door and opens the next one
//   4. progress survives a reload (the card shows 16/16 · 48★); ✕ in the Toy Box leaves to SOLO;
//      the jack-in-the-boxes take you up a shelf at a time to doors 5–8, 9–12 and 13–16
//   no page errors throughout. The course checker is separate:
//   node src/games/parkour/tools/check.mjs (+ tests/physics.test.mjs).
//
// usage: node qa/parkour.js        (static server on :8140)
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
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await page.addInitScript(() => { if (!sessionStorage.getItem('ppk-keep')) { try { localStorage.clear(); } catch (e) {} } });
    await page.goto(BASE); await page.waitForFunction(() => !!window.__claw);
    const C = fn => page.evaluate(fn);

    // ── 1. SOLO card → the Toy Box ──
    const openGame = async () => {
        await page.evaluate(() => window.__claw.show('home'));
        await page.click('[data-go="solo"]'); await page.waitForSelector('#scr-solo:not([hidden])');
        await page.$eval('#solo-list [data-game="parkour"]', e => e.scrollIntoView({ block: 'center' }));
        const sub = await page.$eval('#solo-list [data-game="parkour"] .cs', e => e.textContent);
        await page.click('#solo-list [data-game="parkour"]'); await page.click('#pv-play');
        await page.waitForFunction(() => window.__ppkCampaign?.scene === 'hub', null, { timeout: 10000 });
        await page.waitForTimeout(300);
        return sub;
    };
    const sub0 = await openGame();
    ok(sub0 === 'not played yet', `SOLO lists Playroom Parkour ("${sub0}")`);
    const hub = await C(() => ({ full: !!document.querySelector('.ppk-full .ppk canvas'), doors: window.__ppkCampaign.game.world.L.dev.portal.length, hero: !!document.querySelector('.ppk') }));
    ok(hub.full && hub.doors === 17, `the Toy Box opens full screen with ${hub.doors} doors`);
    const sheet = await C(() => { const v = window.__ppkCampaign.game; const s = v && document.querySelector('.ppk canvas') && window.__ppkCampaign.heroSheet; return s ? { w: s.canvas.width, h: s.canvas.height, run: s.count('run'), cheer: s.count('cheer') } : null; });
    ok(!!sheet && sheet.run === 8 && sheet.cheer === 4, `your character is posed from a sprite sheet (${sheet ? `${sheet.w}×${sheet.h}, run ${sheet.run} frames` : 'none'})`);
    await page.screenshot({ path: 'qa/shot-parkour-hub.png' });

    // ── 2. Real buttons ──
    const pressBtn = async (sel, ms) => {
        const b = await page.$(sel); const r = await b.boundingBox();
        await page.evaluate(([s, x, y]) => { const e = document.querySelector(s); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y })); }, [sel, r.x + r.width / 2, r.y + r.height / 2]);
        await page.waitForTimeout(ms);
        await page.evaluate(s => { const e = document.querySelector(s); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7 })); }, sel);
    };
    const x0 = await C(() => window.__ppkCampaign.game.world.s.p.x);
    await pressBtn('.ppk-btn:nth-child(2)', 500);   // ▶
    const x1 = await C(() => window.__ppkCampaign.game.world.s.p.x);
    ok(x1 > x0 + 1.5, `holding ▶ walks right (${x0.toFixed(1)} → ${x1.toFixed(1)})`);
    await page.evaluate(() => { window.__ppkJumped = false; const g = window.__ppkCampaign.game; const iv = setInterval(() => { if (!g.world.s.p.grounded) window.__ppkJumped = true; }, 16); setTimeout(() => clearInterval(iv), 900); });
    await pressBtn('.ppk-btn.jump', 200);
    await page.waitForTimeout(700);
    ok(await C(() => window.__ppkJumped && window.__ppkCampaign.game.world.s.p.grounded), 'JUMP jumps and you land again');
    // The pose follows what you do: standing still is idle (or a wave), running is the run cycle.
    const poseOf = () => C(() => window.__ppkCampaign.game.pose?.());
    const still = await poseOf();
    await page.evaluate(() => { const b = document.querySelectorAll('.ppk-btn')[1]; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 })); });
    await page.waitForTimeout(250);
    const running = await poseOf();
    await page.evaluate(() => { const b = document.querySelectorAll('.ppk-btn')[1]; b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9 })); });
    await page.waitForTimeout(400);
    ok(['idle', 'blink', 'wave'].includes(still) && running === 'run', `the hero's pose follows what you do (still: ${still}, running: ${running})`);

    const doorAt = async to => { await page.evaluate(to => window.__ppkCampaign.toHub(to), to); await page.waitForTimeout(250); };
    await doorAt('c2');
    ok(await C(() => document.querySelector('.ppk-btn.enter').classList.contains('show')), 'standing at a door shows ▲ GO');
    await pressBtn('.ppk-btn.enter', 80); await page.waitForTimeout(250);
    ok(await C(() => window.__ppkCampaign.scene) === 'hub', 'door 2 is locked before course 1 is cleared');
    await doorAt('c1');
    await pressBtn('.ppk-btn.enter', 80); await page.waitForTimeout(300);
    ok(await C(() => window.__ppkCampaign.scene) === 'c1', '▲ GO at door 1 starts Bounce House');
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'qa/shot-parkour-course.png' });
    // ↺: before any flag it starts the course again; after a flag it goes back to that flag (not a fall)
    const flagBtn = '.ppk-hud button[title="Back to the last flag"]';
    await page.evaluate(() => { window.__ppkCampaign.game.world.s.p.x += 3; });
    await page.click(flagBtn); await page.waitForTimeout(200);
    const r0 = await C(() => { const w = window.__ppkCampaign.game.world; return { x: w.s.p.x, t: w.s.t }; });
    ok(Math.abs(r0.x - 2.15) < 0.6 && r0.t < 40, `↺ before any flag starts the course again (x ${r0.x.toFixed(2)})`);
    await page.evaluate(() => { const w = window.__ppkCampaign.game.world; w.s.check = 0; w.s.checkG = 1; w.s.p.x = 40; });
    await page.waitForTimeout(150);
    await page.click(flagBtn); await page.waitForTimeout(200);
    const r1 = await C(() => { const w = window.__ppkCampaign.game.world, f = w.L.dev.flag[0]; return { x: w.s.p.x, fx: f.x + 0.15, deaths: w.s.deaths, scene: window.__ppkCampaign.scene }; });
    ok(r1.scene === 'c1' && Math.abs(r1.x - r1.fx) < 0.4 && r1.deaths === 0, `↺ after a flag goes back to it, not counted as a fall (x ${r1.x.toFixed(2)})`);
    await page.click('.ppk-hud button[title="Back to the Toy Box"]'); await page.waitForTimeout(300);
    const back = await C(() => ({ scene: window.__ppkCampaign.scene, x: window.__ppkCampaign.game.world.s.p.x }));
    ok(back.scene === 'hub' && Math.abs(back.x - 9.15) < 0.6, `✕ in a course goes back to the Toy Box at its door (x ${back.x.toFixed(2)})`);

    // ── 3. Every course, ★★★ route ──
    const courses = await page.evaluate(async () => (await import('/src/games/parkour/levels/index.js')).COURSES.map(c => ({ id: c.id, name: c.name })));
    await page.evaluate(() => { window.__ppkAutoplay = true; });
    let allGood = true;
    for (let i = 0; i < courses.length; i++) {
        const c = courses[i];
        const t0 = Date.now();
        await page.evaluate(id => window.__ppkCampaign.play(id), c.id);
        const done = await page.waitForFunction(() => window.__ppkCampaign.game?.done, null, { timeout: 90000 }).then(() => true).catch(() => false);
        await page.waitForTimeout(200);
        const cheer = await C(() => window.__ppkCampaign.game.pose?.());
        await page.waitForSelector('.ppk-card.show', { timeout: 3000 }).catch(() => {});
        const card = await C(() => ({ show: !!document.querySelector('.ppk-card.show'), stars: document.querySelector('.ppk-card .stars')?.textContent || '', text: document.querySelector('.ppk-card')?.textContent || '' }));
        const good = done && card.show && card.stars === '★★★' && cheer === 'cheer';
        ok(good, `${c.name}: the hero ${cheer === 'cheer' ? 'cheers' : `doesn't cheer (${cheer})`}, then COURSE CLEAR ${card.stars} in ${Math.round((Date.now() - t0) / 1000)}s`);
        if (i === 0) await page.screenshot({ path: 'qa/shot-parkour-clear.png' });
        await page.click('.ppk-card button.go'); await page.waitForTimeout(350);
        const at = await C(() => ({ scene: window.__ppkCampaign.scene, x: window.__ppkCampaign.game.world.s.p.x }));
        const door = await page.evaluate(id => window.__ppkCampaign.game.world.L.dev.portal.find(d => d.to === id).x, c.id);
        const next = courses[i + 1];
        const nextOpen = next ? await page.evaluate(id => window.__ppkCampaign.progress.isUnlocked(id), next.id) : true;
        const atDoor = at.scene === 'hub' && Math.abs(at.x - (door + 0.15)) < 0.2;
        ok(atDoor && nextOpen, `${c.name}: back in the Toy Box at its door${next ? `, door ${i + 2} open` : ''}`);
        allGood = allGood && good && atDoor && nextOpen;
    }
    const sum = await C(() => window.__ppkCampaign.progress.summary());
    ok(sum.done === 16 && sum.stars === 48, `every course cleared with every star (${sum.done}/16, ${sum.stars}★)`);
    await page.evaluate(() => { window.__ppkAutoplay = false; });

    // ── 4. Progress survives a reload; ✕ in the Toy Box leaves ──
    await page.evaluate(() => sessionStorage.setItem('ppk-keep', '1'));
    await page.reload(); await page.waitForFunction(() => !!window.__claw);
    const sub1 = await openGame();
    ok(sub1 === '16/16 courses · 48★', `progress kept after a reload ("${sub1}")`);
    // Upstairs: the jack-in-the-boxes throw you up a shelf at a time (right wall, left wall, right wall).
    await doorAt('c4');
    await page.evaluate(() => { window.__ppkUp = 0; const g = window.__ppkCampaign.game; const iv = setInterval(() => { const p = g.world.s.p; if (!p.grounded) return; const f = p.y < 6 ? 3 : p.y < 14 ? 2 : p.y < 22 ? 1 : 0; if (f > window.__ppkUp) window.__ppkUp = f; }, 16); setTimeout(() => clearInterval(iv), 40000); });
    const holdKeys = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };
    const heroX = () => C(() => window.__ppkCampaign.game.world.s.p.x);
    const hop = async (toward, level) => {
        // Walk to the jack-in-the-box against the wall, hop onto it, steer back over the shelf above.
        const key = toward > 0 ? 'ArrowRight' : 'ArrowLeft', back = toward > 0 ? 'ArrowLeft' : 'ArrowRight';
        await page.keyboard.down(key);
        for (let i = 0; i < 400 && (toward > 0 ? (await heroX()) < 40.4 : (await heroX()) > 2.6); i++) await page.waitForTimeout(25);
        await page.keyboard.down('Space'); await page.waitForTimeout(300);
        await page.keyboard.up('Space'); await page.keyboard.up(key);
        await page.waitForTimeout(250);
        await holdKeys([back], 700);
        await page.waitForFunction(l => window.__ppkUp >= l, level, { timeout: 4000 }).catch(() => {});
    };
    await hop(1, 1);
    ok(await C(() => window.__ppkUp >= 1), 'the jack-in-the-box by the right wall takes you up to doors 5–8');
    await hop(-1, 2);
    ok(await C(() => window.__ppkUp >= 2), 'the one by the left wall up there takes you to doors 9–12');
    await hop(1, 3);
    ok(await C(() => window.__ppkUp >= 3), 'and the one by the right wall up there to the top shelf, doors 13–16');
    await page.click('.ppk-hud button[title="Leave"]'); await page.waitForTimeout(400);
    ok(await C(() => !document.getElementById('scr-solo').hidden && !document.querySelector('.ppk')), '✕ in the Toy Box goes back to SOLO');
    await page.evaluate(() => sessionStorage.removeItem('ppk-keep'));

    ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    console.log(failed ? `\nPARKOUR: ${failed} FAILED` : '\nPARKOUR PASS');
    process.exit(failed ? 1 : 0);
})();
