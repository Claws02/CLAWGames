// ============================================================
// HOST TOOLS — audit roadmap 5–8 (?net=local loopback).
//   1. a shared phone (pass the phone) keeps the memorable games off SURPRISE ME
//      and the TV's wheel, and marks them on the picker; without one, all games
//   2. the host removes a player: that phone goes home, told why, and can't
//      come back; mid-round the round still finishes
//   3. guests are told drinking mode is the host's call
//   4. a tampered score is capped; an oversized ghost is dropped
//   5. a TURN server pasted into AppHost reaches the room's WebRTC config
//   6. the Play Together screen has the privacy note
//
// usage: node qa/hosttools.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';
const MEMORABLE = ['trivia', 'higherlower', 'stopclock', 'shellgame', 'balloonpump'];

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const open = async (who, more = [], before) => {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
        if (before) await before(p);
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
    const join = async (p, code) => { await p.fill('#net-code', code); await p.click('#btn-net-join'); };
    const host = async p => {
        await p.click('#btn-net-host');
        await p.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('room-code').textContent), null, { timeout: 15000 });
        return p.textContent('#room-code');
    };
    const seats = p => room(p, 'R.seats().map(s => s.name)');
    const removeRow = async (p, name) => {
        const rows = await p.$$('#room-seats .st-row');
        for (const r of rows) if ((await r.textContent()).includes(name)) { await r.click(); break; }
        await p.waitForSelector('.confirm-yes', { timeout: 5000 });
        await p.click('.confirm-yes');
    };

    // 6. privacy note
    const ann = await open('Ann');
    check(/public relays/.test(await ann.textContent('.privacy-note')) && await ann.isVisible('.privacy-note'), '6. the Play Together screen says what the relays can see');

    // 1. shared phone
    const code = await host(ann);
    const cat = await open('Cat');
    await join(cat, code);
    await ann.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 2, null, { timeout: 15000 });
    const pool0 = await ann.evaluate(() => import('/src/arcade/Together.js').then(T => T.fairPool()));
    check(MEMORABLE.every(t => pool0.includes(t)) && !(await room(ann, 'R.sharedPhone()')), `1. no shared phone: SURPRISE ME draws from all ${pool0.length} games`);
    const bob = await open('Bob', ['Bea']);
    await join(bob, code);
    await ann.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 4, null, { timeout: 15000 });
    const draws = await ann.evaluate(() => import('/src/arcade/Together.js').then(T => Array.from({ length: 80 }, () => T.surprise())));
    const bad = draws.filter(t => MEMORABLE.includes(t));
    check(await room(ann, 'R.sharedPhone()') && bad.length === 0, `   Bob and Bea share a phone: 80 SURPRISE ME draws, memorable games drawn: ${bad.length}`);
    const warned = await ann.evaluate(() => [...document.querySelectorAll('#room-games .card.warn')].map(c => c.dataset.type));
    check(MEMORABLE.every(t => warned.includes(t)) && warned.length === MEMORABLE.length, `   the picker marks them ⚠ SHARED PHONE: ${warned.join(', ')}`);
    check(/SURPRISE ME skips them/.test(await ann.textContent('#room-hint')), '   and the host is told why');

    // the TV's wheel too
    const tv = await open('TV');
    await tv.click('#btn-net-tv');
    await tv.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('tv-code').textContent), null, { timeout: 15000 });
    const tvCode = await tv.textContent('#tv-code');
    const tvPhone = await open('Dee', ['Eli']);
    await join(tvPhone, tvCode);
    await tv.waitForFunction(() => document.querySelectorAll('#tv-seats .st-row').length === 2, null, { timeout: 15000 });
    const wheel = await tv.evaluate(() => import('/src/arcade/TvHost.js').then(T => T.pool()));
    check(wheel.length > 0 && !wheel.some(t => MEMORABLE.includes(t)), `   the TV's wheel (one phone, two players) deals only: ${wheel.join(', ')}`);
    await tvPhone.close(); await tv.close();

    // 3. guests see whose call drinking is
    check(/host's call: OFF/.test(await cat.textContent('#room-drink-note')) && await cat.isVisible('#room-drink-note') && !(await ann.isVisible('#room-drink-note')),
        `3. a guest is told: "${await cat.textContent('#room-drink-note')}"`);
    await ann.click('#btn-room-drink');
    await cat.waitForFunction(() => /ON/.test(document.getElementById('room-drink-note').textContent), null, { timeout: 5000 }).catch(() => {});
    check(/host's call: ON/.test(await cat.textContent('#room-drink-note')), '   and it follows the host\'s switch');
    await ann.click('#btn-room-drink');

    // 4. score cap and ghost cap, in a Loot Catch round (max 30 in the game)
    await ann.click('#room-games .card[data-type="lootcatch"]');
    for (const p of [ann, cat, bob]) { await p.waitForFunction(() => !document.getElementById('scr-netcard').hidden); }
    for (const p of [ann, cat]) await p.click('#btn-nc-ready');
    await bob.click('#btn-nc-ready');
    await Promise.all([ann, cat].map(p => p.waitForFunction(() => document.getElementById('arcade').hidden, null, { timeout: 15000 })));
    const n = +(await ann.textContent('#nc-round')).replace(/\D/g, '');
    await bob.evaluate(n => import('/src/claw-core/net/NetTransport.js').then(T => {
        T.send({ t: 'ghost', v: 1, n, seat: 1, s: { x: 1, junk: 'x'.repeat(2000) } });
        T.send({ t: 'ghost', v: 1, n, seat: 2, s: { x: 1, z: 2, h: 0, p: 0.1, done: 0 } });
    }), n);
    await ann.waitForTimeout(500);
    const g = await room(ann, 'R.ghosts().map(x => x.seat)');
    check(!g.includes(1) && g.includes(2), `4. an oversized ghost is dropped, a normal one kept (seats heard: ${JSON.stringify(g)})`);
    // Bob's phone (two players) is still in its game: report its scores straight to the host, tampered.
    await bob.evaluate(() => import('/src/claw-core/minigames/SoloArena.js').then(S => { S.forceEnd(0); S.reset(); }));
    await bob.evaluate(() => import('/src/net/Room.js').then(R => R.reportScore([99999, 7])));
    await Promise.all([ann, cat].map((p, i) => end(p, [4, 5][i])));
    await ann.waitForFunction(() => !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length === 4, null, { timeout: 30000 });
    const pts = await ann.evaluate(() => [...document.querySelectorAll('#nr-rows .st-pts small')].map(e => +e.textContent.split(' ')[0]));
    check(pts[2] <= 60 && pts[3] === 7, `   a tampered 99999 is capped: Loot Catch scores ${pts.join(', ')}`);
    await ann.click('#btn-nr-next');

    // 2. remove a player between rounds
    await removeRow(ann, 'Cat');
    await cat.waitForFunction(() => document.querySelector('[data-screen="home"]') && !document.querySelector('[data-screen="home"]').hidden, null, { timeout: 8000 }).catch(() => {});
    check(await screen(cat) === 'home' && JSON.stringify(await seats(ann)) === '["Ann","Bob","Bea"]', `2. the host removes Cat: she's sent home; seats ${JSON.stringify(await seats(ann))}`);
    await cat.click('[data-go="together"]'); await join(cat, code);
    await cat.waitForFunction(() => /removed/.test(document.getElementById('room-hint').textContent), null, { timeout: 8000 }).catch(() => {});
    check(/removed/.test(await cat.textContent('#room-hint')) && (await seats(ann)).length === 3, `   and can't come back: "${await cat.textContent('#room-hint')}"`);

    // remove mid-round: a fresh guest, then the round
    const dan = await open('Dan');
    await join(dan, code);
    await ann.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 4, null, { timeout: 15000 });
    await ann.click('#room-games .card[data-type="snapstrike"]');
    for (const p of [ann, bob, dan]) { await p.waitForFunction(() => !document.getElementById('scr-netcard').hidden); await p.click('#btn-nc-ready'); }
    // (Bob's phone, two players, is on its pass-the-phone card.)
    await Promise.all([ann, dan].map(p => p.waitForFunction(() => document.getElementById('arcade').hidden, null, { timeout: 15000 })));
    // The host's own game is up; remove Dan through the API the row calls.
    await room(ann, 'R.remove(3)');
    await dan.waitForFunction(() => !document.querySelector('[data-screen="home"]').hidden, null, { timeout: 8000 }).catch(() => {});
    check(await screen(dan) === 'home', '   mid-round: Dan is sent home');
    await bob.evaluate(() => import('/src/net/Room.js').then(R => R.reportScore([4, 5])));
    await end(ann, 3);
    await ann.waitForFunction(() => !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length >= 3, null, { timeout: 30000 }).catch(() => {});
    check(await screen(ann) === 'netresult', '   and the round still finishes');
    await ann.click('#btn-nr-next');
    check(JSON.stringify(await seats(ann)) === '["Ann","Bob","Bea"]', `   his seat is gone after it: ${JSON.stringify(await seats(ann))}`);

    // 5. TURN: a pasted server reaches the WebRTC config
    const turn = await open('Tia', [], async p => {
        await p.route('**/src/AppHost.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('export const TURN_SERVERS = [];', "export const TURN_SERVERS = [{ urls: 'turn:relay.example.test:80', username: 'u', credential: 'c' }];") }); });
        await p.route('**/LoopbackStrategy.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('export function joinRoom(config, roomId) {', 'export function joinRoom(config, roomId) {\n    globalThis.__rtc = config.rtcConfig || null;') }); });
    });
    await join(turn, code);
    await turn.waitForFunction(() => 'rtc' in window || '__rtc' in globalThis, null, { timeout: 8000 }).catch(() => {});
    const rtc = await turn.evaluate(() => globalThis.__rtc);
    const urls = rtc ? rtc.iceServers.flatMap(s => [].concat(s.urls)) : [];
    check(urls.includes('turn:relay.example.test:80') && urls.some(u => u.startsWith('stun:')), `5. a pasted TURN server reaches the room: ${urls.join(' ')}`);

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`HOST TOOLS FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('HOST TOOLS PASS');
})();
