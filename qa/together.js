// ============================================================
// TOGETHER — two phones, one room, over the loopback transport (?net=local:
// a BroadcastChannel between pages, no network). Host opens a room, a guest
// joins by code, they play two parallel rounds, both see the same results,
// then the guest leaves and the host's roster shrinks.
//
// usage: node qa/together.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';
const GAMES = (process.env.QA_GAMES || 'snapstrike,steadyhand').split(',');

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errs = [];
    const open = async who => {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        await p.click('[data-go="together"]');
        await p.fill('#net-name', who);
        return p;
    };
    const screen = p => p.evaluate(() => document.getElementById('arcade').hidden ? 'GAME'
        : [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.dataset.screen);
    const fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };

    const host = await open('Ann'), guest = await open('Bob');
    await host.click('#btn-net-host');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('room-code').textContent), null, { timeout: 15000 });
    const code = await host.textContent('#room-code');
    await guest.fill('#net-code', code);
    await guest.click('#btn-net-join');
    const both = async fn => Promise.all([host, guest].map(fn));
    await both(p => p.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 2, null, { timeout: 15000 }));
    check(true, `room ${code}: host and guest both see 2 seats`);
    check(!(await guest.isVisible('#room-host-panel')) && await host.isVisible('#room-host-panel'), 'only the host gets the game picker');

    for (const [i, type] of GAMES.entries()) {
        const t0 = Date.now();
        await host.click(`#room-games .card[data-type="${type}"]`);
        await both(p => p.waitForFunction(() => !document.getElementById('scr-netcard').hidden, null, { timeout: 10000 }));
        await both(p => p.click('#btn-nc-ready'));
        // Play: random taps all over the screen, on both phones, until results.
        let done = false;
        while ((Date.now() - t0) / 1000 < 150 && !done) {
            // Round 1: only the guest plays, so the result can't be a lockstep tie.
            await Promise.all((i === 0 ? [guest] : [host, guest]).map(p => p.evaluate(() => {
                const x = Math.random() * innerWidth, y = Math.random() * innerHeight;
                const el = document.elementFromPoint(x, y);
                if (el) for (const t of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
            })));
            const s = await Promise.all([host, guest].map(p => p.evaluate(() =>
                !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length)));
            done = s.every(x => x === 2);
            await host.waitForTimeout(150);
        }
        const res = await both(p => p.evaluate(() => ({ title: document.getElementById('nr-title').textContent,
            pts: [...document.querySelectorAll('#nr-rows .st-pts')].map(e => e.textContent) })));
        check(done && JSON.stringify(res[0].pts) === JSON.stringify(res[1].pts),
            `round ${i + 1} ${type} in ${Math.round((Date.now() - t0) / 1000)}s: host "${res[0].title}" guest "${res[1].title}" points ${JSON.stringify(res[0].pts)}`);
        if (i === 0) {
            const gScore = await guest.evaluate(() => +document.querySelectorAll('#nr-rows .st-pts small')[1]?.textContent.split(' ')[0] || 0);
            // Rows are in seat order: 0 = host, 1 = guest.
            check(gScore === 0 || (res[1].title === 'YOU WIN!' && res[0].title === 'Bob WINS!'),
                `idle host loses to a guest who scored ${gScore}`);
        }
        check(await host.isVisible('#btn-nr-next') && !(await guest.isVisible('#btn-nr-next')), 'only the host can start the next game');
        await host.click('#btn-nr-next');
        await host.waitForFunction(() => !document.getElementById('scr-room').hidden);
    }

    await guest.click('.screen:not([hidden]) [data-back]');
    await host.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 1, null, { timeout: 10000 }).catch(() => {});
    check((await host.$$('#room-seats .st-row')).length === 1, 'guest leaves: host roster drops to 1');
    check(await screen(guest) === 'home', 'guest is back home');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`TOGETHER FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('TOGETHER PASS');
})();
