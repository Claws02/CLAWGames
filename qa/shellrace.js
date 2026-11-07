// ============================================================
// SHELL RACE — Shell Game as a race: the first RIGHT answer takes the round,
// a wrong pick is locked out of it, first to 3 rounds wins.
//   1. Same screen (one human, one bot): a wrong pick greys you out and the
//      round stays open; the match ends when someone reaches 3.
//   2. Across phones (?net=local loopback): two phones, the host judges by how
//      fast each phone answered after ITS cups stopped; both phones see the
//      same call; the race ends at 3 and the room result follows the wins.
//
// usage: node qa/shellrace.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const MOD = '/src/claw-core/minigames/ShellGame.js';

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const page = async (who, url) => {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
        await p.goto(url); await p.waitForFunction(() => !!window.__claw);
        return p;
    };
    const st = p => p.evaluate(m => import(m).then(x => x._debugState()), MOD);
    const until = async (p, fn, ms = 30000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { const s = await st(p); if (fn(s)) return s; await p.waitForTimeout(60); }
        return null;
    };
    // Tap seat `slot`'s button k (0 = their left) the way a finger would.
    const tap = (p, slot, k) => p.evaluate(({ m, slot, k }) => import(m).then(x => {
        const at = x._debugPad(slot, k); if (!at) return false;
        const el = document.elementFromPoint(at.x, at.y);
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: at.x, clientY: at.y, pointerId: 3 }));
        return true;
    }), { m: MOD, slot, k });
    // Seat 0 reads the table from P1's end: button k is position k.
    const wrong = a => (a + 1) % 3;

    // ---- 1. same screen ----------------------------------------------------
    const solo = await page('local', ROOT);
    await solo.evaluate(() => {
        const c = window.__claw;
        c.seats.count = 2; c.seats.bots = [false, true, true, true];
        window.__end = null;
        c.show('grid');
        c.play('shellgame', (w, s) => { window.__end = { w, s }; });
    });
    // Click through the intro until the game runs.
    let s = null;
    for (let i = 0; i < 80 && !(s && s.phase === 'play'); i++) {
        await solo.evaluate(() => {
            for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2']) {
                const b = document.getElementById(id);
                if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            }
        });
        await solo.waitForTimeout(250);
        s = await st(solo).catch(() => null);
    }
    s = await until(solo, s => s.phase === 'play' && s.sub === 'pick');
    check(s && s.racing && !s.race, `1. same screen: the duel is a race (racing ${s && s.racing})`);
    if (s) {
        await solo.evaluate(m => import(m).then(x => x._debugFreeze(true)), MOD);   // hold the bot back
        await tap(solo, 0, wrong(s.answer));
        let a = await st(solo);
        check(a.locked[0] && a.sub === 'pick' && a.winner === -1, '   a wrong pick is locked out and the round stays open');
        await tap(solo, 0, s.answer);
        a = await st(solo);
        check(a.picks[0] === wrong(s.answer) && a.locked[0], '   a second tap in the same round does nothing');
        await solo.evaluate(m => import(m).then(x => x._debugFreeze(false)), MOD);
    }
    // Then play it out: the human always right and quick, so the human reaches 3.
    let rounds = new Set(), doubles = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
        const e = await solo.evaluate(() => window.__end);
        if (e) break;
        const q = await st(solo).catch(() => null);
        if (q && q.phase === 'play' && q.sub === 'pick' && q.picks[0] == null && !rounds.has(q.round)) {
            rounds.add(q.round);
            await tap(solo, 0, q.answer);
        }
        if (q && q.sub === 'reveal' && q.winner >= 0 && q.score.reduce((x, y) => x + y, 0) > q.round) doubles++;
        await solo.waitForTimeout(80);
    }
    const end = await solo.evaluate(() => window.__end);
    const fin = await st(solo).catch(() => null);
    check(!!end, `   the match ends (winner seat ${end && end.w}, after ${fin && fin.round} rounds)`);
    check(fin && Math.max(...fin.score) === 3 && fin.score.filter(v => v >= 3).length === 1, `   first to 3: scores ${fin && fin.score.join('-')}`);
    check(doubles === 0, '   never more than one point a round');
    await solo.close();

    // ---- 2. across phones --------------------------------------------------
    const ann = await page('Ann', ROOT + '?net=local');
    await ann.click('[data-go="together"]'); await ann.fill('#net-name', 'Ann'); await ann.click('#btn-net-host');
    await ann.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('room-code').textContent), null, { timeout: 15000 });
    const code = await ann.textContent('#room-code');
    const cat = await page('Cat', ROOT + '?net=local');
    await cat.click('[data-go="together"]'); await cat.fill('#net-name', 'Cat'); await cat.fill('#net-code', code); await cat.click('#btn-net-join');
    await ann.waitForFunction(() => document.querySelectorAll('#room-seats .st-row').length === 2, null, { timeout: 15000 });
    check(await ann.evaluate(() => import('/src/net/Room.js').then(R => R.raceable())), '2. two phones, one player each: the room can race');
    await ann.evaluate(() => import('/src/net/Room.js').then(R => R.startRound('shellgame')));
    await Promise.all([ann, cat].map(p => p.waitForFunction(() => !document.getElementById('scr-netcard').hidden, null, { timeout: 15000 })));
    await Promise.all([ann, cat].map(p => p.click('#btn-nc-ready')));
    const phones = [ann, cat];
    // Round plan: Cat is right first in round 1 (Ann right but slower); after
    // that Ann is right and Cat wrong, so Ann wins rounds 2, 3, 4 and the race.
    const calls = [], seen = new Set();
    const t1 = Date.now();
    while (Date.now() - t1 < 150000) {
        const res = await Promise.all(phones.map(p => p.evaluate(() => !document.getElementById('scr-netresult').hidden)));
        if (res.every(Boolean)) break;
        const ss = await Promise.all(phones.map(p => st(p).catch(() => null)));
        if (ss.every(q => q && q.phase === 'play' && q.sub === 'pick' && q.picks[0] == null) && ss[0].round === ss[1].round && !seen.has(ss[0].round)) {
            const r = ss[0].round; seen.add(r);
            check(ss[0].answer === ss[1].answer, `   round ${r}: both phones shuffled to the same cup`);
            check(ss.every(q => q.race), `   round ${r}: both phones are racing the room`);
            if (r === 1) { await tap(cat, 0, ss[1].answer); await ann.waitForTimeout(500); await tap(ann, 0, ss[0].answer); }
            else { await tap(cat, 0, wrong(ss[1].answer)); await ann.waitForTimeout(300); await tap(ann, 0, ss[0].answer); }
        }
        for (const r of seen) if (!calls[r]) {
            const c = await ann.evaluate(r => import('/src/net/Room.js').then(R => R.raceCall(r)), r);
            const c2 = await cat.evaluate(r => import('/src/net/Room.js').then(R => R.raceCall(r)), r);
            if (c && c2) { calls[r] = c; check(c.winner === c2.winner, `   round ${r}: both phones hear the call: ${c.name || 'nobody'} (${JSON.stringify(c.wins)})`); }
        }
        await ann.waitForTimeout(80);
    }
    check(calls[1] && calls[1].name === 'Cat', '   the quicker right answer takes the round (Cat, round 1)');
    check(calls[2] && calls[2].name === 'Ann', '   a wrong pick never wins, however quick (Ann, round 2)');
    const last = calls.filter(Boolean).pop();
    check(last && last.done && last.name === 'Ann' && last.wins[0] === 3, `   the race ends when Ann reaches 3 (round ${calls.length - 1})`);
    await Promise.all(phones.map(p => p.waitForFunction(() => !document.getElementById('scr-netresult').hidden, null, { timeout: 30000 }).catch(() => {})));
    const scores = await ann.evaluate(() => import('/src/net/Room.js').then(R => R.totals ? R.totals() : null)).catch(() => null);
    const rows = await ann.$$eval('#nr-rows .st-row', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim())).catch(() => []);
    check(rows.length === 2 && /Ann/.test(rows[0]), `   the room result puts Ann first: ${rows.join(' | ')}${scores ? ' ' + JSON.stringify(scores) : ''}`);

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`SHELL RACE FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('SHELL RACE PASS');
})();
