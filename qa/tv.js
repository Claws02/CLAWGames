// ============================================================
// TV — a TV host and two phones over the loopback transport (?net=local).
// The TV unlocks drinking mode with five taps on the 🦀 and hosts on a TV;
// phone A carries two players (pass the phone), phone B one. The captain
// spins and plays from phone A; every phone readies and plays; the TV and
// the phones agree on the scores, the sips and the new house rule.
//
// usage: node qa/tv.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';
const ROUNDS = +(process.env.QA_ROUNDS || 2);

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const watch = (p, who) => {
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
    };
    const screen = p => p.evaluate(() => document.getElementById('arcade').hidden ? 'GAME'
        : [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.dataset.screen);

    // One context: the loopback transport is a BroadcastChannel, and so is localStorage.
    const ctx = await browser.newContext({ hasTouch: true });
    const tv = await ctx.newPage(); watch(tv, 'TV');
    await tv.setViewportSize({ width: 1280, height: 720 });
    await tv.goto(BASE); await tv.waitForFunction(() => !!window.__claw);
    check((await tv.textContent('#home-mode')).includes('PARTY'), 'starts in party mode');
    for (let i = 0; i < 5; i++) await tv.click('.logo-claw', { force: true });
    check((await tv.textContent('#home-mode')).includes('DRINKING'), 'five taps on the crab: drinking mode');
    await tv.click('[data-go="together"]');
    await tv.click('#btn-net-tv');
    await tv.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('tv-code').textContent), null, { timeout: 15000 });
    const code = await tv.textContent('#tv-code');
    check(await screen(tv) === 'tvroom' && (await tv.textContent('.tv-mode')).includes('DRINKING'), `TV room ${code} open in drinking mode`);

    const phone = async (names, who) => {
        const p = await ctx.newPage(); watch(p, who);
        await p.setViewportSize({ width: 390, height: 844 });
        await p.goto(BASE.replace('?net=local', `?join=${code}&net=local`)); await p.waitForFunction(() => !!window.__claw);
        await p.fill('#net-name', names[0]);
        for (const n of names.slice(1)) { await p.click('#btn-net-add'); await p.fill('#net-more .join-row:last-child input', n); }
        await p.click('#btn-net-join');
        return p;
    };
    const a = await phone(['Ann', 'Cat'], 'A');
    check(await a.inputValue('#net-code') === code, 'the join link fills the code in');
    await tv.waitForFunction(() => document.querySelectorAll('#tv-seats .st-row').length === 2, null, { timeout: 15000 });
    const b = await phone(['Bob'], 'B');
    await tv.waitForFunction(() => document.querySelectorAll('#tv-seats .st-row').length === 3, null, { timeout: 15000 });
    check(true, 'TV sees 3 players from 2 phones');
    await a.waitForFunction(() => !document.getElementById('room-captain').hidden, null, { timeout: 10000 });
    check(await a.isVisible('#room-captain') && !(await b.isVisible('#room-captain')), 'the first phone in is the captain');

    const phones = [a, b];
    for (let round = 1; round <= ROUNDS; round++) {
        // The captain spins, then plays what the wheel lands on.
        if (round === 1) await a.click('#btn-room-spin'); else await a.click('#btn-nr-next');
        await tv.waitForFunction(() => !document.getElementById('scr-wheel').hidden, null, { timeout: 10000 });
        await tv.waitForFunction(() => !document.getElementById('wheel-result').hidden, null, { timeout: 15000 });
        await a.click('#btn-room-spin');
        await tv.waitForFunction(() => !document.getElementById('scr-tvround').hidden, null, { timeout: 10000 });
        const game = await tv.textContent('#tvr-title');
        await Promise.all(phones.map(p => p.waitForFunction(() => !document.getElementById('scr-netcard').hidden, null, { timeout: 10000 })));
        await Promise.all(phones.map(p => p.click('#btn-nc-ready')));
        const t0 = Date.now();
        let handoffs = 0;
        while (Date.now() - t0 < 240000 && await screen(tv) !== 'tvresult') {
            for (const p of phones) {
                const s = await screen(p);
                // Pass the phone: the next player's card.
                if (s === 'netcard' && await p.isVisible('#btn-nc-ready') && /GO!/.test(await p.textContent('#btn-nc-ready'))) { handoffs++; await p.click('#btn-nc-ready'); continue; }
                if (s === 'GAME') await p.evaluate(() => {
                    const x = Math.random() * innerWidth, y = Math.random() * innerHeight;
                    const el = document.elementFromPoint(x, y);
                    if (el) for (const t of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
                });
            }
            await tv.waitForTimeout(120);
        }
        check(await screen(tv) === 'tvresult', `round ${round} ${game} done in ${Math.round((Date.now() - t0) / 1000)}s`);
        check(handoffs === 2, `phone A was passed to both its players (${handoffs} handoffs)`);
        await Promise.all(phones.map(p => p.waitForFunction(() => !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length === 3, null, { timeout: 15000 })));
        const tvPts = await tv.$$eval('#tvx-rows .st-pts', els => els.map(e => e.textContent));
        const phPts = await Promise.all(phones.map(p => p.$$eval('#nr-rows .st-pts', els => els.map(e => e.textContent))));
        check(phPts.every(x => JSON.stringify(x) === JSON.stringify(tvPts)), `TV and phones agree: ${JSON.stringify(tvPts)}`);
        const sips = tvPts.map(t => +(/🍺 (\d+)/.exec(t) || [0, -1])[1]);
        check(sips.every(x => x >= 0) && sips.reduce((s, x) => s + x, 0) >= 2, `sips shown for everyone: ${sips}`);
        const rules = await tv.$$eval('#scr-tvresult .rule-row', els => els.length);
        check(rules <= round, `house rules on the TV: ${rules}`);
        check(await a.isVisible('#btn-nr-next') && !(await b.isVisible('#btn-nr-next')), 'only the captain gets NEXT');
    }

    await tv.click('#btn-tvx-end');
    check((await tv.textContent('#tvx-game')) === 'FINAL SCORES', `final scores: ${await tv.textContent('#tvx-title')}`);
    await b.click('.screen:not([hidden]) [data-back]');
    await tv.click('.screen:not([hidden]) [data-back]');
    await tv.click('.confirm-yes', { timeout: 3000 }).catch(() => {});
    await a.waitForFunction(() => document.querySelector('.screen:not([hidden])')?.dataset.screen === 'home', null, { timeout: 10000 }).catch(() => {});
    check(await screen(a) === 'home', 'TV closes the room: the captain is sent home');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`TV FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('TV PASS');
})();
