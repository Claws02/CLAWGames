// ============================================================
// GAME CARDS — the clip cards and the preview sheet, on a small phone.
//   1. every card in the solo hub and the party grid has a clip and a poster
//      (the files are there and small)
//   2. clips load lazily: a card far down has no video yet; scrolled to, it does
//   3. a tap opens the preview (the clip big, how to play, PLAY); ✕ closes it
//   4. PLAY starts the game: a solo-hub game, an arcade high-score game, a party game
//   5. a game the table can't play: the preview says why, PLAY is off
//   6. reduced motion: posters only, no video
//
// usage: node qa/gamecards.js        (static server on :8140)
// ============================================================
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';

(async () => {
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
    const errs = [], fail = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`PAGEERROR ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|media/i.test(m.text())) errs.push(`CONSOLE ${m.text()}`); });
    await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);

    // 1. every card has a clip
    await p.click('[data-go="solo"]'); await p.waitForSelector('#scr-solo:not([hidden])');
    const solo = await p.$$eval('#solo-list .card', els => els.map(e => ({ id: e.dataset.game, poster: e.querySelector('.cm-img')?.getAttribute('src'), video: e.querySelector('.cm-vid')?.dataset.src })));
    const party = await p.evaluate(async () => (await import('/src/arcade/Catalog.js')).allTypes(false));
    const missing = solo.filter(c => !c.poster || !c.video).map(c => c.id);
    const files = [...new Set([...solo.map(c => c.id), ...party])];
    const absent = files.filter(id => !['mp4', 'jpg'].every(x => fs.existsSync(path.join(__dirname, '..', 'assets', 'clips', `${id}.${x}`))));
    const kb = files.reduce((a, id) => a + (fs.existsSync(path.join(__dirname, '..', 'assets', 'clips', `${id}.mp4`)) ? fs.statSync(path.join(__dirname, '..', 'assets', 'clips', `${id}.mp4`)).size : 0), 0) / 1024;
    check(solo.length === 28 && !missing.length && !absent.length, `1. ${solo.length} solo cards and ${party.length} party games all have a clip and a poster (${files.length} clips, ${Math.round(kb)} KB in all)${missing.length || absent.length ? ` — missing ${[...missing, ...absent].join(', ')}` : ''}`);

    // 2. lazy: the last card has no video until it's scrolled to
    const lastId = solo[solo.length - 1].id;
    const before = await p.$eval(`#solo-list [data-game="${lastId}"] .cm-vid`, v => !!v.getAttribute('src'));
    await p.$eval(`#solo-list [data-game="${lastId}"]`, e => e.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(600);
    const after = await p.$eval(`#solo-list [data-game="${lastId}"] .cm-vid`, v => !!v.getAttribute('src'));
    const firstGone = await p.$eval(`#solo-list [data-game="${solo[2].id}"] .cm-vid`, v => v.paused);
    check(!before && after && firstGone, `2. clips load as they scroll into view (${lastId}: ${before ? 'early!' : 'none'} → ${after ? 'loaded' : 'still none'}), and pause off screen`);

    // 3. the preview
    await p.$eval('#solo-list [data-game="rebound"]', e => e.scrollIntoView({ block: 'center' }));
    await p.click('#solo-list [data-game="rebound"]');
    await p.waitForSelector('#pv.open');
    const pv = await p.evaluate(() => ({ title: document.querySelector('.pv-title')?.textContent, vid: document.querySelector('.pv-media video')?.getAttribute('src'), desc: document.querySelector('.pv-desc')?.textContent || '', play: document.querySelector('#pv-play')?.textContent }));
    await p.screenshot({ path: process.env.QA_SHOTS ? `${process.env.QA_SHOTS}/preview.png` : '/dev/null' }).catch(() => {});
    await p.click('#pv-x'); await p.waitForTimeout(300);
    check(pv.title === 'Rebound' && /rebound\.mp4/.test(pv.vid || '') && pv.desc.length > 20 && /PLAY/.test(pv.play) && !(await p.$('#pv')), `3. a tap opens the preview: "${pv.title}", its clip, how to play, ${pv.play}; ✕ closes it`);

    // 4. PLAY starts the game
    await p.click('#solo-list [data-game="rebound"]'); await p.click('#pv-play');
    await p.waitForSelector('#scr-sologame:not([hidden]) .rb-lv', { timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(300);   // the sheet slides away
    check((await p.$$('#scr-sologame .rb-lv')).length === 32 && !(await p.$('#pv')), '4. PLAY starts a solo-hub game (Rebound\'s 32 tanks)');
    await p.click('#scr-sologame [data-back]'); await p.waitForSelector('#scr-solo:not([hidden])');
    await p.$eval('#solo-list [data-game="snapstrike"]', e => e.scrollIntoView({ block: 'center' }));
    await p.click('#solo-list [data-game="snapstrike"]');
    const arc = await p.evaluate(() => ({ best: document.querySelector('.pv-best')?.textContent, tag: document.querySelector('.pv-tag')?.textContent }));
    await p.click('#pv-play'); await p.waitForTimeout(1200);
    const started = await p.evaluate(() => document.getElementById('arcade').hidden);
    check(started && /score/i.test(arc.best || ''), `   PLAY starts an arcade high-score game from the hub (Snap Strike, ${arc.tag}; "${arc.best}")`);
    await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);

    // 4b/5. the party grid: PLAY starts a game; a game the table can't play says why
    await p.evaluate(() => { const c = window.__claw; c.seats.count = 2; c.seats.bots = [false, true, true, true]; c.show('grid'); });
    await p.evaluate(async () => { const G = await import('/src/arcade/Grid.js'); G.open(t => { window.__picked = t; }); });
    await p.waitForSelector('#game-grid .card .cm-img');
    await p.click('#game-grid .card:not(.blocked)'); await p.click('#pv-play');
    const picked = await p.evaluate(() => window.__picked);
    await p.evaluate(() => { const c = window.__claw; c.seats.count = 4; });
    await p.evaluate(async () => { const G = await import('/src/arcade/Grid.js'); G.open(t => { window.__picked2 = t; }); });
    const blocked = await p.$('#game-grid .card.blocked');
    let why = '', off = false;
    if (blocked) { await blocked.scrollIntoViewIfNeeded(); await blocked.click(); why = await p.textContent('.pv-why').catch(() => ''); off = await p.$eval('#pv-play', b => b.disabled); await p.click('#pv-play', { force: true }).catch(() => {}); await p.click('#pv-x').catch(() => {}); }
    const picked2 = await p.evaluate(() => window.__picked2);
    check(!!picked && (!blocked || (why && off && !picked2)), `4. the party grid: PLAY picks ${picked}; 5. a game 4 can't play: "${why.trim()}", PLAY off${blocked ? '' : ' (none blocked at 4)'}`);

    // 6. reduced motion: no video at all
    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, reducedMotion: 'reduce' });
    const q = await ctx2.newPage();
    await q.goto(BASE); await q.waitForFunction(() => !!window.__claw);
    await q.click('[data-go="solo"]'); await q.waitForSelector('#scr-solo:not([hidden])'); await q.waitForTimeout(600);
    const anyVid = await q.$$eval('#solo-list .cm-vid', vs => vs.some(v => v.getAttribute('src')));
    await q.click('#solo-list [data-game="treasure"]');
    const pvVid = await q.$('.pv-media video');
    check(!anyVid && !pvVid, '6. reduced motion: posters only, no video (cards or preview)');
    await ctx2.close();

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`GAME CARDS FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('GAME CARDS PASS');
})();
