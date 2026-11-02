// ============================================================
// REJOIN — phones that drop off and come back (?net=local loopback).
// A dead WebRTC link (what Trystero does to a phone that's been locked for
// 5 s) is modelled by telling just those two pages that the other one left.
//   1. a guest's link dies between rounds: it waits, reconnects, same seat and points
//   2. a guest's link dies mid-round: the round waits a little, it rejoins and scores
//   3. a guest reloads: it joins again into its own seat and points
//   4. the host's links die: nobody is sent home, the next round plays
//   5. the host reloads: REOPEN ROOM brings everyone back, points intact
//   6. a guest leaves on purpose: its seat goes
//
// usage: node qa/rejoin.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';
const DEAD_MS = 6000;   // how long a cut link stays dead before the phones can find each other again

// The loopback hears every page; a dead link must not. window.__block lists
// the pages this one can't hear while its link to them is down.
// After that, like a real link, nothing flows until the two shake hands again
// (a loopback 'hello' or 'here'): window.__shake.
const BLOCK = () => {
    window.__block = []; window.__shake = []; window.__me = null;
    const post = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (m) { if (m && m.from && m.k === 'hello') window.__me = m.from; return post.call(this, m); };
    const d = Object.getOwnPropertyDescriptor(BroadcastChannel.prototype, 'onmessage');
    Object.defineProperty(BroadcastChannel.prototype, 'onmessage', {
        set(fn) {
            d.set.call(this, e => {
                const m = e.data, from = m && m.from;
                if (m && window.__block.includes(from) && m.k !== 'bye') return;
                if (m && window.__shake.includes(from)) {
                    if (m.k === 'hello' || (m.k === 'here' && m.to === window.__me)) window.__shake = window.__shake.filter(i => i !== from);
                    else if (m.k === 'data') return;
                }
                fn(e);
            });
        },
        get() { return d.get.call(this); },
    });
};

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await ctx.addInitScript(BLOCK);
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const watch = (p, who) => {
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
    };
    const open = async who => {
        const p = await ctx.newPage(); watch(p, who);
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        await p.click('[data-go="together"]');
        await p.fill('#net-name', who);
        return p;
    };
    const screen = p => p.evaluate(() => document.getElementById('arcade').hidden ? 'GAME'
        : [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.dataset.screen);
    const room = (p, expr) => p.evaluate(e => import('/src/net/Room.js').then(R => (new Function('R', 'return ' + e))(R)), expr);
    const end = (p, s) => p.evaluate(s => import('/src/claw-core/minigames/SoloArena.js').then(S => S.forceEnd(s)), s);
    const id = p => p.evaluate(() => import('/src/claw-core/net/NetTransport.js').then(T => T.selfId()));
    // Kill the link between a and b only, for DEAD_MS: each is told the other
    // left and can't hear it; after that they can find each other again, but
    // only by signing in afresh (as Trystero would re-handshake).
    const cut = async (a, b, code) => {
        const [x, y] = [await id(a), await id(b)];
        await a.evaluate(y => { window.__block.push(y); }, y);
        await b.evaluate(x => { window.__block.push(x); }, x);
        const lift = (p, i) => p.evaluate(i => { window.__block = window.__block.filter(k => k !== i); window.__shake.push(i); }, i).catch(() => {});
        setTimeout(() => { lift(a, y); lift(b, x); }, DEAD_MS);
        await a.evaluate(([x, y, c]) => { const ch = new BroadcastChannel('hbd-loopback:claw-games-' + c); ch.postMessage({ k: 'bye', from: x, to: y }); ch.postMessage({ k: 'bye', from: y, to: x }); ch.close(); }, [x, y, code]);
    };
    const until = async (p, fn, arg, ms) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
    const seatsOf = p => room(p, 'R.seats().map(s => s.name + (s.away ? "~" : ""))');

    let [ann, bob, cat] = [await open('Ann'), await open('Bob'), await open('Cat')];
    await ann.click('#btn-net-host');
    await ann.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('room-code').textContent), null, { timeout: 15000 });
    const code = await ann.textContent('#room-code');
    for (const p of [bob, cat]) { await p.fill('#net-code', code); await p.click('#btn-net-join'); }
    await ann.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 3, null, { timeout: 15000 });
    const all = () => [ann, bob, cat];
    const round = async (scores, mid) => {
        await ann.click('#room-games .card[data-type="snapstrike"]');
        await Promise.all(all().map(p => p.waitForFunction(() => !document.getElementById('scr-netcard').hidden && !document.getElementById('btn-nc-ready').disabled, null, { timeout: 15000 })));
        for (const p of all()) await p.click('#btn-nc-ready');
        await Promise.all(all().map(p => p.waitForFunction(() => document.getElementById('arcade').hidden, null, { timeout: 15000 })));
        if (mid) await mid();
        await Promise.all(all().map((p, i) => end(p, scores[i])));
        await Promise.all(all().map(p => p.waitForFunction(() => !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length === 3, null, { timeout: 60000 })));
        await ann.click('#btn-nr-next');
    };
    await round([1, 9, 5]);
    const t0 = await room(ann, 'R.totals()');
    check(t0[1] > 0, `room ${code}, after a round: totals ${JSON.stringify(t0)}`);

    // 1. Bob's link dies between rounds
    await cut(bob, ann, code);
    await bob.waitForTimeout(800);
    check(await screen(bob) !== 'home' && await bob.isVisible('#net-banner'), `1. Bob loses the host: not sent home, "${(await bob.textContent('#net-banner').catch(() => ''))}"`);
    check(JSON.stringify(await seatsOf(ann)) === '["Ann","Bob~","Cat"]', `   the host keeps his seat, away: ${JSON.stringify(await seatsOf(ann))}`);
    const back = await until(bob, () => !document.getElementById('net-banner'), null, 30000);
    const t1 = await room(ann, 'R.totals()');
    check(back && JSON.stringify(await seatsOf(ann)) === '["Ann","Bob","Cat"]' && JSON.stringify(t1) === JSON.stringify(t0), `   he's back by himself: ${JSON.stringify(await seatsOf(ann))} totals ${JSON.stringify(t1)}`);

    // 2. Cat's link dies mid-round, and comes back
    await round([2, 3, 8], async () => {
        await cut(cat, ann, code);
        await cat.waitForTimeout(500);
        check(await screen(cat) === 'GAME', '2. Cat loses the host mid-game: still playing');
        await until(cat, () => !document.getElementById('net-banner'), null, 30000);
    });
    const t2 = await room(ann, 'R.totals()');
    check(t2[2] > t1[2], `   she rejoined in time and her score counted: ${JSON.stringify(t2)}`);

    // 3. Bob reloads between rounds
    await bob.reload(); await bob.waitForFunction(() => !!window.__claw);
    await bob.click('[data-go="together"]');
    await bob.fill('#net-name', 'Bob'); await bob.fill('#net-code', code); await bob.click('#btn-net-join');
    await until(ann, () => document.querySelectorAll('#room-seats .st-row.away').length === 0, null, 15000);
    const t3 = await room(ann, 'R.totals()');
    check(JSON.stringify(await seatsOf(ann)) === '["Ann","Bob","Cat"]' && JSON.stringify(t3) === JSON.stringify(t2), `3. Bob reloads and joins again: his own seat ${JSON.stringify(await seatsOf(ann))}, totals ${JSON.stringify(t3)}`);
    check(await room(bob, 'R.mySeat()') === 1, '   and his phone knows it');

    // 4. The host's links die
    await cut(ann, bob, code); await cut(ann, cat, code);
    await bob.waitForTimeout(800);
    check(await screen(bob) !== 'home' && await screen(cat) !== 'home', '4. the host drops off: nobody is sent home');
    const both = await until(bob, () => !document.getElementById('net-banner'), null, 30000) && await until(cat, () => !document.getElementById('net-banner'), null, 30000);
    check(both, '   both phones find the host again');
    await round([4, 4, 9]);
    check(true, '   and the next round plays');
    const t4 = await room(ann, 'R.totals()');

    // 5. The host reloads
    await ann.reload(); await ann.waitForFunction(() => !!window.__claw);
    await bob.waitForTimeout(800);
    check(await bob.isVisible('#net-banner'), '5. the host reloads: phones wait for it');
    await until(ann, () => !document.getElementById('btn-net-resume').hidden, null, 5000);
    check(await ann.isVisible('#btn-net-resume'), `   the host's page offers "${await ann.textContent('#btn-net-resume').catch(() => '')}"`);
    await ann.click('#btn-net-resume');
    const resumed = await until(ann, () => document.querySelectorAll('#room-seats .st-row.away').length === 0 && document.querySelectorAll('#room-seats .st-row').length === 3, null, 30000);
    const t5 = await room(ann, 'R.totals()');
    check(resumed && JSON.stringify(t5) === JSON.stringify(t4) && await ann.textContent('#room-code') === code, `   REOPEN: same code ${code}, everyone back, totals ${JSON.stringify(t5)}`);
    check(await until(bob, () => !document.getElementById('net-banner'), null, 15000), '   the phones are back in');
    await round([1, 2, 3]);
    check(true, '   and a round plays');

    // 6. Cat leaves on purpose
    await cat.click('.screen:not([hidden]) [data-back]');
    await until(ann, () => document.querySelectorAll('#room-seats .st-row').length === 2, null, 10000);
    check(JSON.stringify(await seatsOf(ann)) === '["Ann","Bob"]' && await screen(cat) === 'home', `6. Cat leaves: ${JSON.stringify(await seatsOf(ann))}`);

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`REJOIN FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('REJOIN PASS');
})();
