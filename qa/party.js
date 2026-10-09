// ============================================================
// PARTY — play whole parties end to end: setup → pick (by each picker) →
// real games against real bots → standings → podium. Fails on page errors,
// a stuck screen, a repeated game, or points that don't add up.
//
// usage: node qa/party.js            (static server on :8140)
//   QA_PICKERS=draft,wheel QA_SEATS=3 node qa/party.js
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const PICKERS = (process.env.QA_PICKERS || 'shuffle,draft,wheel,pick').split(',');
const SEATS = +(process.env.QA_SEATS || 3);
const GAMES = 3;

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw);

    const fail = [];
    for (const picker of PICKERS) {
        const t0 = Date.now(), before = errs.length;
        // Through the real UI: home → seats → party setup.
        await page.click('[data-go="party"]');
        await page.click(`.seat-count [data-n="${SEATS}"]`);
        await page.evaluate(() => { const s = window.__claw.seats; s.bots = [false, true, true, true]; });
        await page.click('#btn-seats-go');
        await page.click(`#party-len button:has-text("${GAMES} games")`);
        await page.click(`[data-picker="${picker}"]`);
        await page.click('#btn-party-start');

        let done = false, screens = new Set(), stuck = '';
        while ((Date.now() - t0) / 1000 < 600) {
            const st = await page.evaluate(() => {
                const cur = [...document.querySelectorAll('.screen')].find(s => !s.hidden);
                const arcade = !document.getElementById('arcade').hidden;
                const screen = arcade ? cur?.dataset.screen : 'GAME';
                const vis = el => el && el.offsetParent !== null;
                if (screen === 'standings') document.getElementById('btn-st-go').click();
                else if (screen === 'draft') {
                    const t = document.getElementById('draft-turn').textContent;
                    if (/tap a game/.test(t)) document.querySelector('#draft-grid .card:not(.banned)')?.click();
                } else if (screen === 'wheel') {
                    const r = document.getElementById('wheel-result');
                    if (!r.hidden) document.getElementById('btn-wheel-play').click();
                    else if (!document.getElementById('btn-spin').disabled) document.getElementById('btn-spin').click();
                } else if (screen === 'grid') document.querySelector('#game-grid .card:not(.blocked)')?.click();
                else if (screen === 'GAME') {
                    for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1']) {
                        const b = document.getElementById(id);
                        if (vis(b)) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    }
                    const layer = document.getElementById('minigame-layer');
                    if (getComputedStyle(layer).display !== 'none') {
                        const r = layer.getBoundingClientRect();
                        const x = r.left + Math.random() * r.width, y = r.top + r.height * (0.6 + Math.random() * 0.38);
                        const el = document.elementFromPoint(x, y);
                        if (el) for (const t of ['pointerdown', 'pointermove', 'pointerup'])
                            el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
                    }
                    document.querySelectorAll('.mg-sc-btn').forEach(b => vis(b) && b.click());
                }
                return { screen, party: JSON.parse(JSON.stringify(window.__claw.party)) };
            });
            screens.add(st.screen);
            if (st.screen === 'podium') { done = st.party; break; }
            await page.waitForTimeout(200);
        }
        const newErrs = errs.slice(before);
        const p = done || {};
        const sum = (p.points || []).reduce((a, b) => a + b, 0);
        const unique = new Set(p.played || []).size === (p.played || []).length;
        const ok = !!done && p.round === GAMES && sum > 0 && unique && !newErrs.length;
        const podium = done ? await page.textContent('#podium-h') : '';
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${picker.padEnd(8)} ${SEATS}P ${Math.round((Date.now() - t0) / 1000)}s ` +
            `rounds=${p.round} points=${JSON.stringify(p.points)} played=${(p.played || []).join(',')} ` +
            `screens=${[...screens].join('>')} | ${podium}`);
        newErrs.forEach(e => console.log('     ' + e.slice(0, 200)));
        if (!ok) fail.push(picker);
        if (done) await page.screenshot({ path: `/tmp/claude-0/-home-user/feef9cb7-b3ea-5463-a3fa-376dc616dfcb/scratchpad/shots/podium-${picker}.png` }).catch(() => {});
        await page.evaluate(() => document.getElementById('btn-podium-home').click());
    }
    await browser.close();
    if (fail.length) { console.log(`PARTY FAIL — ${fail.join(', ')}`); process.exit(1); }
    console.log(`PARTY PASS — ${PICKERS.length} parties of ${GAMES} games`);
})();
