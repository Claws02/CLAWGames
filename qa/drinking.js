// ============================================================
// DRINKING — drinking mode end to end, in the browser.
//   1. One device: a game against a bot ends with the DRINK card; CHEERS closes it.
//   2. Online: a host and eleven guests (twelve players, ?net=local loopback).
//      The host's DRINKING MODE button flips the room for everyone; a round
//      ends with the DRINK card on every phone, the winner safe and last
//      place drinking most.
//
// usage: node qa/drinking.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const N = +(process.env.QA_PLAYERS || 12);

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

    // ---- 1. one device -------------------------------------------------------------
    {
        const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, hasTouch: true });
        await ctx.addInitScript(() => localStorage.setItem('claw.drinkMode', 'true'));
        const p = await ctx.newPage(); watch(p, 'LOCAL');
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        await p.evaluate(() => { const c = window.__claw; c.seats.count = 2; c.seats.bots = [false, true]; c.show('grid'); c.play('snapstrike'); });
        const t0 = Date.now();
        while (Date.now() - t0 < 120000 && !(await p.isVisible('.drink-wrap'))) {
            await p.evaluate(() => {
                for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1']) { const b = document.getElementById(id); if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
                document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
            });
            await p.waitForTimeout(250);
        }
        const card = await p.evaluate(() => document.querySelector('.drink-card')?.innerText || '');
        check(/DRINK UP/.test(card) && /(sip|Nobody drinks)/.test(card), `one device vs a bot: the DRINK card after the game (${card.split('\n').slice(1, 3).join(' / ')})`);
        check(!/Bot/.test(card.split('🎁')[0].split('Safe:')[0]), 'bots are never told to drink');
        await p.click('.drink-ok');
        check(!(await p.isVisible('.drink-wrap')), 'CHEERS closes it');
        await ctx.close();
    }

    // ---- 2. twelve phones online ---------------------------------------------------
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const phones = [];
    for (let i = 0; i < N; i++) {
        const p = await ctx.newPage(); watch(p, `P${i}`);
        await p.goto(BASE + '?net=local'); await p.waitForFunction(() => !!window.__claw);
        await p.click('[data-go="together"]');
        await p.fill('#net-name', `P${i}`);
        phones.push(p);
    }
    const [host, ...guests] = phones;
    await host.evaluate(() => localStorage.setItem('claw.drinkMode', 'false'));
    await host.click('#btn-net-host');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('room-code').textContent), null, { timeout: 15000 });
    const code = await host.textContent('#room-code');
    for (const g of guests) { await g.fill('#net-code', code); await g.click('#btn-net-join'); }
    await host.waitForFunction(n => document.querySelectorAll('#room-seats .st-row').length === n, N, { timeout: 60000 }).catch(() => {});
    check((await host.$$('#room-seats .st-row')).length === N, `${N} players in one room`);

    check(await host.isVisible('#btn-room-drink') && !(await guests[0].isVisible('#btn-room-drink')), 'only the host gets the drinking switch');
    check(/OFF/.test(await host.textContent('#btn-room-drink')), 'it starts off (the host never tapped the crab)');
    await host.click('#btn-room-drink');
    check(/ON/.test(await host.textContent('#btn-room-drink')), 'one tap turns drinking mode on');
    const modes = await Promise.all(phones.map(p => p.evaluate(() => import('/src/net/Room.js').then(R => R.mode()))));
    check(modes.every(m => m === 'drinking'), 'every phone hears it');

    await host.click('#room-games .card[data-type="snapstrike"]');
    await Promise.all(phones.map(p => p.waitForFunction(() => !document.getElementById('scr-netcard').hidden, null, { timeout: 20000 })));
    await Promise.all(phones.map(p => p.click('#btn-nc-ready')));
    await Promise.all(phones.map(p => p.waitForFunction(() => document.getElementById('arcade').hidden, null, { timeout: 30000 })));
    // Each phone ends its game with a different score: P0 tops the table, the last phone is bottom.
    await Promise.all(phones.map((p, i) => p.evaluate(s => import('/src/claw-core/minigames/SoloArena.js').then(S => S.forceEnd(s)), (N - i) * 3)));
    await Promise.all(phones.map(p => p.waitForFunction(n => !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length === n, N, { timeout: 60000 })));
    check(true, `round played: all ${N} phones have the result`);
    const cards = await Promise.all(phones.map(p => p.evaluate(() => ({ open: !!document.querySelector('.drink-wrap'), me: document.querySelector('.drink-me')?.textContent || '' }))));
    check(cards.every(c => c.open), 'the DRINK card is up on every phone');
    check(/SAFE/.test(cards[0].me), `the winner is safe: "${cards[0].me}"`);
    const lastSips = +(/(\d+)/.exec(cards[N - 1].me) || [0, 0])[1];
    check(lastSips >= 2, `last place drinks most: "${cards[N - 1].me}"`);
    const rule = await phones[1].evaluate(() => document.querySelector('.drink-rule')?.textContent || '');
    check(rule.includes(`P${N - 1}`), `last place gets a house rule: "${rule}"`);
    await host.click('.drink-ok');
    check(!(await host.isVisible('.drink-wrap')), 'CHEERS closes it');

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`DRINKING FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('DRINKING PASS');
})();
