// ============================================================
// HOST SITS OUT — a phone hosts with HOST PLAYS TOO switched off: it runs the
// room (picks the game, sees the round go by and the result) and never plays;
// only the two guests are seated. ?net=local loopback.
//
// usage: node qa/hostwatch.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const open = async who => {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        await p.click('[data-go="together"]'); await p.fill('#net-name', who);
        return p;
    };
    const screen = p => p.evaluate(() => document.getElementById('arcade').hidden ? 'GAME'
        : [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.dataset.screen);

    const host = await open('Hoster');
    check(/ON/.test(await host.textContent('#btn-net-plays')), 'HOST PLAYS TOO starts on');
    await host.click('#btn-net-plays');
    check(/OFF/.test(await host.textContent('#btn-net-plays')), 'one tap switches it off');
    await host.reload(); await host.waitForFunction(() => !!window.__claw); await host.click('[data-go="together"]');
    check(/OFF/.test(await host.textContent('#btn-net-plays')), 'and it is remembered');
    await host.click('#btn-net-host');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('room-code').textContent), null, { timeout: 15000 });
    const code = await host.textContent('#room-code');
    check((await host.$$('#room-seats .st-row')).length === 0, 'the host takes no seat');

    const guests = [await open('Ann'), await open('Bob')];
    for (const g of guests) { await g.fill('#net-code', code); await g.click('#btn-net-join'); }
    await host.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 2, null, { timeout: 15000 });
    await guests[0].waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 2, null, { timeout: 15000 });
    const names = await guests[0].$$eval('#room-seats .st-name', els => els.map(e => e.textContent));
    check(names.join(',') === 'Ann,Bob', `only the guests are seated, nobody labelled host: ${names.join(', ')}`);
    check(await host.isVisible('#room-host-panel'), 'the host still picks the games');

    await host.click('#room-games .card[data-type="snapstrike"]');
    await Promise.all([host, ...guests].map(p => p.waitForFunction(() => !document.getElementById('scr-netcard').hidden, null, { timeout: 10000 })));
    check(!(await host.isVisible('#btn-nc-ready')) && await guests[0].isVisible('#btn-nc-ready'), 'only the guests get I\'M READY');
    await Promise.all(guests.map(g => g.click('#btn-nc-ready')));
    await Promise.all(guests.map(g => g.waitForFunction(() => document.getElementById('arcade').hidden, null, { timeout: 15000 })));
    await host.waitForTimeout(800);
    check(await screen(host) === 'netcard', `the host watches, never plays (${await screen(host)})`);
    check(/PLAYING/.test(await host.textContent('#nc-wait')), `the host sees the round go: "${await host.textContent('#nc-wait')}"`);
    await Promise.all(guests.map((g, i) => g.evaluate(s => import('/src/claw-core/minigames/SoloArena.js').then(S => S.forceEnd(s)), 10 - i * 5)));
    await host.waitForFunction(() => !document.getElementById('scr-netresult').hidden, null, { timeout: 30000 });
    const rows = await host.$$('#nr-rows .st-row');
    check(rows.length === 2, 'the host gets the result: two rows');
    check(/Ann WINS/.test(await host.textContent('#nr-title')), `"${await host.textContent('#nr-title')}"`);
    check(await host.isVisible('#btn-nr-next'), 'and picks the next game');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`HOST WATCH FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('HOST WATCH PASS');
})();
