// ============================================================
// TVREACT — faces and reactions in a TV room, over the loopback (?net=local).
//
// The TV is a mirrored tablet (the target device for TV mode). Ann and Bob
// join from the QR link; they're saved players on this browser, so their
// phones send a character and the TV draws their faces. Bob sends 🔥: it
// floats up the TV from Bob's row; a second one straight after is dropped
// (one per 600 ms per phone). A phone-hosted room shows no reaction row.
// The TV is screenshotted at tablet landscape, tablet portrait and a phone
// held sideways.
//
// usage: node qa/tvreact.js              (static server on :8140)
//        QA_SHOTS=dir node qa/tvreact.js
// ============================================================
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';
const SHOTS = process.env.QA_SHOTS || '';

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
    const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `tvreact-${name}.png`) }); } };

    const ctx = await browser.newContext({ hasTouch: true });
    await ctx.addInitScript(() => {
        if (!localStorage.getItem('claw.profiles')) localStorage.setItem('claw.profiles', JSON.stringify({
            list: [{ id: 'p1', name: 'Ann', char: 'cat' }, { id: 'p2', name: 'Bob', char: 'frog' }], stats: {}, lastId: 2 }));
    });

    // ---- the TV: a tablet, landscape -----------------------------------------
    const tv = await ctx.newPage(); watch(tv, 'TV');
    await tv.setViewportSize({ width: 1180, height: 820 });
    await tv.goto(BASE); await tv.waitForFunction(() => !!window.__claw);
    await tv.click('[data-go="together"]');
    await tv.click('#btn-net-tv');
    await tv.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('tv-code').textContent), null, { timeout: 15000 });
    const code = await tv.textContent('#tv-code');

    const phone = async (name, who) => {
        const p = await ctx.newPage(); watch(p, who);
        await p.setViewportSize({ width: 390, height: 844 });
        await p.goto(BASE.replace('?net=local', `?join=${code}&net=local`)); await p.waitForFunction(() => !!window.__claw);
        await p.fill('#net-name', name);
        await p.click('#btn-net-join');
        return p;
    };
    const ann = await phone('Ann', 'Ann');
    await tv.waitForFunction(() => document.querySelectorAll('#tv-seats .st-row').length === 1, null, { timeout: 15000 });
    const bob = await phone('Bob', 'Bob');
    await tv.waitForFunction(() => document.querySelectorAll('#tv-seats .st-row').length === 2, null, { timeout: 15000 });
    await tv.waitForTimeout(400);
    const faces = await tv.$$eval('#tv-seats .st-row .st-dot img.face', e => e.map(x => x.alt));
    check(faces.length === 2, `TV draws both players' faces: ${JSON.stringify(faces)}`);

    await bob.waitForFunction(() => { const b = document.getElementById('net-reacts'); return b && !b.hidden; }, null, { timeout: 10000 }).catch(() => {});
    check(await bob.isVisible('#net-reacts') && await ann.isVisible('#net-reacts'), 'both phones get the reaction row in a TV room');
    await shot(bob, 'phone');

    await bob.click('#net-reacts .react-btn[data-e="🔥"]');
    await tv.waitForSelector('#tv-reacts .tv-react', { timeout: 5000 }).catch(() => {});
    const r1 = await tv.$$eval('#tv-reacts .tv-react', e => e.map(x => ({ t: x.textContent, top: parseFloat(x.style.top) })));
    const bobRow = await tv.$eval('#tv-seats .st-row[data-seat="1"]', el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    check(r1.length === 1 && r1[0].t === '🔥', `Bob's 🔥 floats up the TV (${r1.map(x => x.t).join('')})`);
    check(r1.length && r1[0].top >= bobRow.top && r1[0].top <= bobRow.bottom, "…from Bob's row");
    // A second tap inside the phone's own 700 ms is swallowed there; past it, the TV's 600 ms gap lets it through.
    await bob.evaluate(() => { document.querySelector('#net-reacts .react-btn[data-e="😂"]').click(); });
    await tv.waitForTimeout(300);
    check((await tv.$$('#tv-reacts .tv-react')).length === 1, 'a second tap straight after is dropped');
    await tv.waitForTimeout(600);
    await bob.click('#net-reacts .react-btn[data-e="🎉"]');
    await tv.waitForFunction(() => document.querySelectorAll('#tv-reacts .tv-react').length === 2, null, { timeout: 5000 }).catch(() => {});
    check((await tv.$$('#tv-reacts .tv-react')).length === 2, 'and one a moment later lands');
    await ann.click('#net-reacts .react-btn[data-e="👏"]');
    await tv.waitForTimeout(250);
    await shot(tv, 'tablet-landscape');

    // ---- the same room on other screens -------------------------------------
    await tv.setViewportSize({ width: 820, height: 1180 });
    await tv.waitForTimeout(300);
    await shot(tv, 'tablet-portrait');
    await tv.setViewportSize({ width: 844, height: 390 });
    await tv.waitForTimeout(300);
    await shot(tv, 'phone-landscape');
    const fits = await tv.evaluate(() => { const s = document.getElementById('scr-tvroom'); return s.scrollWidth <= s.clientWidth + 1; });
    check(fits, 'no sideways scroll on a phone held sideways');

    // ---- a phone-hosted room has no reactions --------------------------------
    await tv.click('#scr-tvroom [data-back]');
    await tv.click('.confirm-yes').catch(() => {});
    await ann.waitForFunction(() => !document.getElementById('scr-home').hidden, null, { timeout: 8000 }).catch(() => {});
    await ann.click('[data-go="together"]');
    await ann.click('#btn-net-host');
    // Not the TV room's code, still on the screen from a moment ago: Ann's own room's.
    await ann.waitForFunction(old => { const t = document.getElementById('room-code').textContent; return /^[A-Z0-9]{4}$/.test(t) && t !== old; }, code, { timeout: 15000 });
    const hostCode = await ann.textContent('#room-code');
    await bob.goto(BASE); await bob.waitForFunction(() => !!window.__claw);
    await bob.click('[data-go="together"]');
    await bob.fill('#net-name', 'Bob'); await bob.fill('#net-code', hostCode);
    await bob.click('#btn-net-join');
    await bob.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 2, null, { timeout: 15000 });
    check(!(await bob.isVisible('#net-reacts')) && !(await ann.isVisible('#net-reacts')), 'a phone-hosted room shows no reaction row');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`TVREACT FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('TVREACT PASS');
})();
