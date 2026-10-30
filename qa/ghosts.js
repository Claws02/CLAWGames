// ============================================================
// GHOSTS — the time trials (Kart GP, Speed Boat, Rift Dive) in a room: a TV
// and three phones over the loopback transport (?net=local).
//   Each phone plays the race alone, full screen, on the bigger course, and
//   draws the other two racers as ghosts; the TV shows the running order;
//   every phone reports a score and the room has a result.
//
// usage: node qa/ghosts.js        (static server on :8140)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:8140/index.html') + '?net=local';
const RACES = (process.env.QA_GAMES || 'kartgp,speedboat,riftdive').split(',');
const MOD = { kartgp: 'KartGrandPrix', speedboat: 'SpeedBoat', riftdive: 'RiftDive' };

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const ctx = await browser.newContext({ hasTouch: true });
    const page = async (who, w, h) => {
        const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h });
        p.on('pageerror', e => errs.push(`${who} PAGEERROR ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${who} CONSOLE ${m.text()}`); });
        await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
        return p;
    };
    const tv = await page('TV', 1280, 720);
    await tv.click('[data-go="together"]'); await tv.click('#btn-net-tv');
    await tv.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('tv-code').textContent), null, { timeout: 15000 });
    const code = await tv.textContent('#tv-code');
    const phones = [];
    for (const name of ['Ann', 'Bob', 'Cat']) {
        const p = await page(name, 390, 844);
        await p.click('[data-go="together"]'); await p.fill('#net-name', name); await p.fill('#net-code', code); await p.click('#btn-net-join');
        phones.push(p);
    }
    await tv.waitForFunction(() => document.querySelectorAll('#tv-seats .st-row').length === 3, null, { timeout: 20000 });

    for (const type of RACES) {
        // Deal this race straight from the TV.
        await tv.evaluate(t => import('/src/net/Room.js').then(R => R.startRound(t)), type);
        await Promise.all(phones.map(p => p.waitForFunction(() => !document.getElementById('scr-netcard').hidden, null, { timeout: 15000 })));
        await Promise.all(phones.map(p => p.click('#btn-nc-ready')));
        const mod = `/src/claw-core/minigames/${MOD[type]}.js`;
        const st = p => p.evaluate(m => import(m).then(x => x._debugState()), mod);
        // Hold a steer on each phone so the racers spread out, until everyone sees two ghosts.
        const t0 = Date.now();
        let seen = [];
        while (Date.now() - t0 < 60000) {
            await Promise.all(phones.map((p, i) => p.evaluate(i => {
                const el = document.querySelector('#minigame-layer canvas') || document.getElementById('minigame-layer');
                const r = el.getBoundingClientRect(), x = r.left + r.width * (0.3 + 0.2 * i), y = r.top + r.height * 0.7;
                for (const t of ['pointerdown', 'pointermove']) el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: t === 'pointermove' ? x + 30 : x, clientY: y, pointerId: 7 }));
            }, i)));
            seen = await Promise.all(phones.map(st));
            if (seen.every(s => s.ghosts === 2)) break;
            await tv.waitForTimeout(400);
        }
        const s0 = seen[0];
        check(seen.every(s => s.solo && s.views === 1), `${type}: each phone races alone, full screen`);
        check(type === 'kartgp' ? s0.trackW > 8 && s0.laps === 2 : type === 'speedboat' ? s0.rw > 9 : s0.radius > 7,
            `${type}: the bigger course (${type === 'kartgp' ? `track ${s0.trackW}, ${s0.laps} laps` : type === 'speedboat' ? `river ${s0.rw}` : `shaft ${s0.radius}`})`);
        check(seen.every(s => s.ghosts === 2), `${type}: every phone sees the other two as ghosts (${seen.map(s => s.ghosts).join(', ')})`);
        await tv.waitForFunction(() => document.querySelectorAll('#tvr-race li').length === 3, null, { timeout: 5000 }).catch(() => {});
        const board = await tv.$$eval('#tvr-race li', els => els.map(e => e.textContent));
        check(board.length === 3, `${type}: the TV shows the running order: ${board.join(' | ')}`);
        await phones[0].screenshot({ path: `qa/shot-ghosts-${type}.png` });
        // End the race on every phone with what it banked.
        await Promise.all(phones.map(p => p.evaluate(() => import('/src/claw-core/minigames/SoloArena.js').then(S => S.forceEnd()))));
        await tv.waitForFunction(() => !document.getElementById('scr-tvresult').hidden, null, { timeout: 30000 });
        const pts = await tv.$$eval('#tvx-rows .st-pts', els => els.map(e => e.textContent));
        check(pts.length === 3, `${type}: the room has a result: ${pts.join(' | ')}`);
        await Promise.all(phones.map(p => p.waitForFunction(() => !document.getElementById('scr-netresult').hidden, null, { timeout: 15000 })));
        await Promise.all(phones.map(p => p.click('#btn-nr-next').catch(() => {})));
        await tv.evaluate(() => window.__claw.show('tvroom', false));
    }
    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`GHOSTS FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('GHOSTS PASS');
})();
