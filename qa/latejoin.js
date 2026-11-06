// ============================================================
// LATE JOIN — the doors into a room (?net=local loopback).
//   1. the screen is kept awake in a room (Screen Wake Lock), and let go after
//   2. a phone that joins mid-round is told it's in from the next one, sees
//      nothing of the round, and is seated (and plays) the moment it ends
//   3. a phone on another version is told to refresh, with a button
//   4. the 13th player is told the room is full
//
// usage: node qa/latejoin.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';

// A stand-in Wake Lock API that records what was asked of it.
const WAKE = () => {
    window.__wake = { req: 0, rel: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        window.__wake.req++;
        const l = new EventTarget();
        l.release = async () => { window.__wake.rel++; l.dispatchEvent(new Event('release')); };
        return l;
    } } });
};

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await ctx.addInitScript(WAKE);
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const open = async (who, more = [], before) => {
        const p = await ctx.newPage();
        if (before) await before(p);
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        await p.click('[data-go="together"]');
        await p.fill('#net-name', who);
        for (const [i, n] of more.entries()) { await p.click('#btn-net-add'); await p.fill(`#net-more .join-row:nth-child(${i + 1}) input`, n); }
        return p;
    };
    const screen = p => p.evaluate(() => document.getElementById('arcade').hidden ? 'GAME'
        : [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.dataset.screen);
    const room = (p, expr) => p.evaluate(e => import('/src/net/Room.js').then(R => (new Function('R', 'return ' + e))(R)), expr);
    const end = (p, s) => p.evaluate(s => import('/src/claw-core/minigames/SoloArena.js').then(S => S.forceEnd(s)), s);
    const wake = p => p.evaluate(() => import('/src/arcade/WakeLock.js').then(W => ({ held: W.held(), ...window.__wake })));
    const join = async (p, code) => { await p.fill('#net-code', code); await p.click('#btn-net-join'); };

    const ann = await open('Ann'), bob = await open('Bob');
    await ann.click('#btn-net-host');
    await ann.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('room-code').textContent), null, { timeout: 15000 });
    const code = await ann.textContent('#room-code');
    await join(bob, code);
    await ann.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 2, null, { timeout: 15000 });

    // 1. wake lock
    const w = await wake(bob);
    check(w.held && w.req >= 1, `1. in the room the screen is kept awake (${JSON.stringify(w)})`);
    check((await ann.textContent('#room-hint')).includes('Keep this phone on'), `   the host is told to keep its phone on: "${await ann.textContent('#room-hint')}"`);

    // 2. Cat joins mid-round
    await ann.click('#room-games .card[data-type="snapstrike"]');
    for (const p of [ann, bob]) { await p.waitForFunction(() => !document.getElementById('scr-netcard').hidden); await p.click('#btn-nc-ready'); }
    await Promise.all([ann, bob].map(p => p.waitForFunction(() => document.getElementById('arcade').hidden, null, { timeout: 15000 })));
    const cat = await open('Cat');
    await join(cat, code);
    await cat.waitForFunction(() => /next one/.test(document.getElementById('room-hint').textContent), null, { timeout: 10000 }).catch(() => {});
    check(/next one/.test(await cat.textContent('#room-hint')), `2. Cat joins mid-round: "${await cat.textContent('#room-hint')}"`);
    check(await screen(cat) === 'room' && await room(cat, 'R.mySeat()') === -1, '   she sees no card and has no seat yet');
    await Promise.all([ann, bob].map((p, i) => end(p, 3 + i)));
    await ann.waitForFunction(() => !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length === 2, null, { timeout: 15000 });
    await cat.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 3, null, { timeout: 10000 }).catch(() => {});
    check(await room(cat, 'R.mySeat()') === 2 && await screen(cat) === 'room', `   the round ends: Cat is seated (${JSON.stringify(await room(ann, 'R.seats().map(s => s.name)'))}) and never saw its result`);
    await ann.click('#btn-nr-next');
    await ann.click('#room-games .card[data-type="snapstrike"]');
    await cat.waitForFunction(() => !document.getElementById('scr-netcard').hidden, null, { timeout: 10000 }).catch(() => {});
    check(await screen(cat) === 'netcard', '   and gets the next round\'s card');
    for (const p of [ann, bob, cat]) await p.click('#btn-nc-ready');
    await Promise.all([ann, bob, cat].map(p => p.waitForFunction(() => document.getElementById('arcade').hidden, null, { timeout: 15000 })));
    await Promise.all([ann, bob, cat].map((p, i) => end(p, 3 + i)));
    await ann.waitForFunction(() => !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length === 3, null, { timeout: 15000 });
    check(true, '   and plays it');
    await ann.click('#btn-nr-next');

    // 3. a phone on another version (same browser context: the loopback doesn't cross contexts)
    const dan = await open('Dan', [], p => p.route('**/src/net/Room.js', async r => {
        const res = await r.fetch();
        r.fulfill({ response: res, body: (await res.text()).replace(/export const PROTO = \d+;/, 'export const PROTO = 1;') });
    }));
    await join(dan, code);
    await dan.waitForFunction(() => !document.getElementById('btn-room-refresh').hidden, null, { timeout: 10000 }).catch(() => {});
    check(await dan.isVisible('#btn-room-refresh') && /version/.test(await dan.textContent('#room-hint')), `3. an older build: "${await dan.textContent('#room-hint')}" + ${await dan.textContent('#btn-room-refresh').catch(() => '')}`);
    await dan.close();

    // 4. fill the room to 12 (Ann, Bob, Cat + 4 + 4 + 1), then a 13th
    const big = await open('Eve', ['Fay', 'Gus', 'Hal']);
    await join(big, code);
    const big2 = await open('Ida', ['Jo', 'Kim', 'Lu']);
    await join(big2, code);
    const one = await open('Max');
    await join(one, code);
    await ann.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 12, null, { timeout: 15000 }).catch(() => {});
    check((await room(ann, 'R.seats().length')) === 12, '4. twelve players in');
    const ned = await open('Ned');
    await join(ned, code);
    await ned.waitForFunction(() => /full/.test(document.getElementById('room-hint').textContent), null, { timeout: 10000 }).catch(() => {});
    check(/full/.test(await ned.textContent('#room-hint')), `   the 13th: "${await ned.textContent('#room-hint')}"`);

    // 1b. leaving lets the screen sleep again
    await bob.click('.screen:not([hidden]) [data-back]');
    const w2 = await wake(bob);
    check(!w2.held && w2.rel >= 1 && await screen(bob) === 'home', `   leaving the room lets the screen sleep (${JSON.stringify(w2)})`);

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`LATE JOIN FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('LATE JOIN PASS');
})();
