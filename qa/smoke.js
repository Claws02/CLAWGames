// ============================================================
// SMOKE — boot the arcade, set a table, and play real games end to end
// through claw-core: intro → ready → play (random taps for the human,
// real bots for the rest) → result → back on the arcade screen with stats
// recorded. Fails on any page error or a game that never hands back.
//
// usage: (static server on :8140 serving the repo root)
//   node qa/smoke.js                 # a sample at 2 and 3 seats
//   QA_ALL=1 node qa/smoke.js        # every eligible game at 2 seats
//   QA_ONLY=sumospheres,bowling node qa/smoke.js
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const PER_GAME_S = +(process.env.QA_PER_GAME || 150);

(async () => {
    const exe = process.env.CHROMIUM_PATH || [ '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' ].find(p => fs.existsSync(p));
    const browser = await chromium.launch({
        ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
    });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw, null, { timeout: 20000 });

    const eligible = n => page.evaluate(async n =>
        (await import('/src/arcade/Catalog.js')).eligible(n), n);

    let plan;
    if (process.env.QA_ONLY) plan = process.env.QA_ONLY.split(',').map(t => [t.trim(), 2]);
    else if (process.env.QA_ALL) plan = (await eligible(2)).map(t => [t, 2]);
    else plan = [['snapstrike', 2], ['sumospheres', 2], ['highnoon', 2], ['sortrush', 3], ['lootcatch', 3]];

    const fail = [];
    for (const [type, n] of plan) {
        const before = errs.length;
        await page.evaluate(({ type, n }) => {
            const c = window.__claw;
            c.seats.count = n;
            c.seats.bots = [false, true, true, true];   // one human, real bots
            c.show('grid');
            c.play(type);
        }, { type, n });
        const t0 = Date.now();
        let sawActive = false, back = false, winner = '';
        while ((Date.now() - t0) / 1000 < PER_GAME_S) {
            const st = await page.evaluate(() => {
                const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && !e.hidden; };
                for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1']) {
                    const b = document.getElementById(id);
                    if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                }
                // The human taps and drags at random inside their own zone.
                const layer = document.getElementById('minigame-layer');
                if (vis('minigame-layer')) {
                    const r = layer.getBoundingClientRect();
                    const x = r.left + Math.random() * r.width, y = r.top + r.height * (0.6 + Math.random() * 0.38);
                    const el = document.elementFromPoint(x, y);
                    if (el) for (const t of ['pointerdown', 'pointermove', 'pointerup'])
                        el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
                }
                document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
                return { active: window.__claw.state.mgActive, arcade: !document.getElementById('arcade').hidden,
                         toast: document.getElementById('toast-host').textContent };
            });
            if (st.active) sawActive = true;
            if (sawActive && st.arcade) { back = true; winner = st.toast; break; }
            await page.waitForTimeout(150);
        }
        const plays = await page.evaluate(async t => (await import('/src/arcade/Stats.js')).plays(t), type);
        const newErrs = errs.slice(before);
        const ok = back && plays >= 1 && !newErrs.length;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${type.padEnd(13)} ${n}P ${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s active=${sawActive} back=${back} plays=${plays} | ${winner.slice(0, 50)}`);
        newErrs.forEach(e => console.log('     ' + e.slice(0, 200)));
        if (!ok) {
            fail.push(type);
            await page.evaluate(async () => {
                const M = await import('/src/claw-core/minigames/MinigameManager.js');
                try { M.endMinigame(-1); } catch (e) {}
            });
        }
        await page.waitForTimeout(500);
    }
    await browser.close();
    if (fail.length) { console.log(`SMOKE FAIL — ${fail.join(', ')}`); process.exit(1); }
    console.log(`SMOKE PASS — ${plan.length} games played end to end`);
})();
