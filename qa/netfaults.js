// ============================================================
// NETFAULTS — Play Together when messages go missing (?net=local loopback).
// Each phone can lose the next message of a kind (window.__dropOnce), as a
// phone does when its link blips. Three phones, host playing too.
//   1. a lost ROUND: the host sends it again, the phone gets its card
//   2. a lost GO: the phone starts within seconds, not at the round's cap
//   3. a lost RESULT (drinking on): the phone asks, and gets it and the DRINK card
//   4. a phone that never taps ready: the host gets START WITHOUT CAT, and it works
//   5. a forged ROSTER from a guest is ignored; a SCORE for another round is ignored
//
// usage: node qa/netfaults.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';

// Lose the next loopback message of each kind listed in window.__dropOnce.
const DROP = () => {
    window.__dropOnce = [];
    window.__dropped = [];
    const d = Object.getOwnPropertyDescriptor(BroadcastChannel.prototype, 'onmessage');
    Object.defineProperty(BroadcastChannel.prototype, 'onmessage', {
        set(fn) {
            d.set.call(this, e => {
                const m = e.data, t = m && m.k === 'data' && m.d && m.d.t;
                const i = t ? window.__dropOnce.indexOf(t) : -1;
                if (i >= 0) { window.__dropOnce.splice(i, 1); window.__dropped.push(t); return; }
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
    await ctx.addInitScript(DROP);
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const open = async who => {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        await p.click('[data-go="together"]');
        await p.fill('#net-name', who);
        return p;
    };
    const room = (p, expr) => p.evaluate(e => import('/src/net/Room.js').then(R => (new Function('R', 'return ' + e))(R)), expr);
    const end = (p, s) => p.evaluate(s => import('/src/claw-core/minigames/SoloArena.js').then(S => S.forceEnd(s)), s);
    const visible = (p, sel) => p.evaluate(s => { const el = document.querySelector(s); return !!el && !el.hidden && !!el.offsetParent; }, sel);
    const until = async (p, fn, arg, ms) => { const t = Date.now(); try { await p.waitForFunction(fn, arg, { timeout: ms }); return Date.now() - t; } catch (e) { return -1; } };
    const onCard = p => until(p, () => !document.getElementById('scr-netcard').hidden && !document.getElementById('btn-nc-ready').disabled, null, 8000);
    const inGame = p => until(p, () => document.getElementById('arcade').hidden, null, 10000);
    const onResult = (p, ms = 10000) => until(p, () => !document.getElementById('scr-netresult').hidden && document.querySelectorAll('#nr-rows .st-row').length === 3, null, ms);

    const ann = await open('Ann'), bob = await open('Bob'), cat = await open('Cat');
    const all = [ann, bob, cat];
    await ann.click('#btn-net-host');
    await ann.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('room-code').textContent), null, { timeout: 15000 });
    const code = await ann.textContent('#room-code');
    for (const p of [bob, cat]) { await p.fill('#net-code', code); await p.click('#btn-net-join'); }
    await ann.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 3, null, { timeout: 15000 });
    check(true, `room ${code}: three phones`);
    const pick = () => ann.click('#room-games .card[data-type="snapstrike"]');
    const play = async scores => {
        await Promise.all(all.map(inGame));
        await Promise.all(all.map((p, i) => end(p, scores[i])));
    };

    // 1. lost ROUND
    await cat.evaluate(() => { window.__dropOnce = ['round']; });
    await pick();
    const tCard = await onCard(cat);
    check(tCard >= 0 && (await cat.evaluate(() => window.__dropped)).includes('round'), `1. Cat lost the ROUND and got its card again ${tCard} ms later`);
    for (const p of all) await p.click('#btn-nc-ready');

    // 2. (same round) everyone's in the game; Cat would have lost GO next time, so finish this one
    await play([3, 5, 7]);
    check(await onResult(ann) >= 0 && await onResult(cat) >= 0, '   and the round finished for everyone');
    await ann.click('#btn-nr-next');

    await cat.evaluate(() => { window.__dropOnce = ['go']; });
    await pick();
    await Promise.all(all.map(onCard));
    for (const p of all) await p.click('#btn-nc-ready');
    const tGo = await inGame(cat);
    check(tGo >= 0 && tGo < 8000 && (await cat.evaluate(() => window.__dropped)).includes('go'), `2. Cat lost GO and started ${tGo} ms later (not at the 98 s cap)`);
    await play([3, 5, 7]);
    await onResult(ann);
    await ann.click('#btn-nr-next');

    // 3. lost RESULT, drinking mode on
    await ann.click('#btn-room-drink');
    await cat.evaluate(() => { window.__dropOnce = ['result']; });
    await pick();
    await Promise.all(all.map(onCard));
    for (const p of all) await p.click('#btn-nc-ready');
    await play([3, 5, 7]);
    const tRes = await onResult(cat, 9000);
    const catCard = await cat.evaluate(() => !!document.querySelector('.drink-wrap'));
    const [hostTot, catTot] = [await room(ann, 'R.totals()'), await room(cat, 'R.totals()')];
    check(tRes >= 0 && catCard && (await cat.evaluate(() => window.__dropped)).includes('result'), `3. Cat lost RESULT and had it ${tRes} ms later, with the DRINK card`);
    check(JSON.stringify(hostTot) === JSON.stringify(catTot), `   and the same totals as the host: ${JSON.stringify(catTot)}`);
    for (const p of all) await p.evaluate(() => document.querySelector('.drink-ok')?.click());
    await ann.click('#btn-nr-next');
    await ann.click('#btn-room-drink');

    // 4. Cat never taps ready
    await pick();
    await Promise.all(all.map(onCard));
    for (const p of [ann, bob]) await p.click('#btn-nc-ready');
    const wait = await ann.textContent('#nc-wait');
    check(/waiting for Cat/.test(wait), `4. the host sees who it's waiting for: "${wait}"`);
    const tForce = await until(ann, () => !document.getElementById('btn-nc-force').hidden, null, 30000);
    const label = await ann.textContent('#btn-nc-force');
    check(tForce >= 0 && /CAT/.test(label), `   after ${Math.round(tForce / 1000)} s more: "${label}"`);
    await ann.click('#btn-nc-force');
    check(await inGame(ann) >= 0 && await inGame(cat) >= 0, '   one tap starts the round, Cat included');
    await play([3, 5, 7]);
    check(await onResult(ann) >= 0, '   and it finishes');
    await ann.click('#btn-nr-next');

    // 5. a guest forges a ROSTER; a SCORE for another round
    const before = JSON.stringify(await room(cat, 'R.seats().map(s => s.name)'));
    await bob.evaluate(() => import('/src/claw-core/net/NetTransport.js').then(T => T.send({ t: 'roster', v: 1, seats: [{ name: 'PWNED', peer: 'x' }], totals: [999], rid: 'fake' })));
    await cat.waitForTimeout(800);
    const after = JSON.stringify(await room(cat, 'R.seats().map(s => s.name)'));
    check(before === after, `5. a guest's forged ROSTER is ignored: ${after}`);
    await pick();
    await Promise.all(all.map(onCard));
    for (const p of all) await p.click('#btn-nc-ready');
    await Promise.all(all.map(inGame));
    let counted = 0;
    await ann.evaluate(() => import('/src/net/Room.js').then(R => R.on('scoreCount', k => { window.__sc = k; })));
    await bob.evaluate(() => import('/src/claw-core/net/NetTransport.js').then(T => T.send({ t: 'score', v: 1, n: 1, scores: [99999] })));
    await ann.waitForTimeout(600);
    counted = await ann.evaluate(() => window.__sc || 0);
    check(counted === 0, `   a SCORE for an old round is ignored (scores in: ${counted})`);
    await play([3, 5, 7]);
    await onResult(ann);
    const pts = await ann.evaluate(() => [...document.querySelectorAll('#nr-rows .st-pts small')].map(e => e.textContent.split(' ')[0]));
    check(!pts.includes('99999'), `   the result has the real scores: ${pts.join(', ')}`);

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`NETFAULTS FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('NETFAULTS PASS');
})();
