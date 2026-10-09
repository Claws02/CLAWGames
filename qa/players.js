// ============================================================
// PLAYERS — profiles record what they should (head-to-head only between
// profiles, a bot's win is nobody's), the seat picker seats a profile once,
// names and characters reach the game, the Players screens edit and delete,
// an old seat save still loads, and all of it fits a phone.
//
// usage: (static server on :8140 serving the repo root)   node qa/players.js
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const SHOTS = process.env.QA_SHOTS || '/tmp';

const pass = [], fail = [];
const ok = (name, cond, detail = '') => (cond ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const boot = async () => { await page.goto(BASE); await page.waitForFunction(() => !!window.__claw, null, { timeout: 20000 }); };
    const noSideScroll = () => page.evaluate(() => [...document.querySelectorAll('.screen:not([hidden])')]
        .every(s => s.scrollWidth <= s.clientWidth + 1));

    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await boot();

    // ---- the record rules ------------------------------------------------------
    const rules = await page.evaluate(async () => {
        const P = await import('/src/arcade/Profiles.js');
        const a = P.create('Ana', 'bunny'), b = P.create('Ben', 'ghost');
        P.record('puck', 0, [a, b], [false, false]);            // Ana beats Ben
        P.record('puck', 1, [a, b], [false, false]);            // Ben beats Ana
        P.record('snapstrike', 0, [a, b, null], [false, false, true]); // Ana wins, a bot at the table
        P.record('snapstrike', 2, [a, b, null], [false, false, true]); // the bot wins
        P.record('puck', 1, [a, null], [false, false]);         // a guest beats Ana
        const sa = P.stats(a), sb = P.stats(b);
        const out = { aPlays: sa.plays, aWins: sa.wins, aBot: sa.botWins, bPlays: sb.plays, bWins: sb.wins,
                      aVsB: sa.h2h[b], bVsA: sb.h2h[a], best: P.bestGame(a), rivals: P.rivals(a).map(r => r.name),
                      clean: P.cleanName('  <b>Way   too long a name</b> '), taken: P.nameTaken(' ana ') };
        P.remove(b);
        out.afterRemove = Object.keys(P.stats(a).h2h).length;
        P.remove(a);
        return out;
    });
    ok('plays and wins counted per profile', rules.aPlays === 5 && rules.aWins === 2 && rules.bPlays === 4 && rules.bWins === 1, JSON.stringify(rules));
    ok('a win at a table with a bot counts as beating bots', rules.aBot === 1);
    ok('head-to-head: 2–1 Ana, and a bot or guest win is nobody\'s',
        JSON.stringify(rules.aVsB) === '{"w":2,"l":1}' && JSON.stringify(rules.bVsA) === '{"w":1,"l":2}', JSON.stringify([rules.aVsB, rules.bVsA]));
    ok('best game and rivals', rules.best === 'puck' || rules.best === 'snapstrike', rules.best);
    ok('names are trimmed, capped and stripped of markup', rules.clean === 'bWay too long' && rules.taken, JSON.stringify(rules.clean));
    ok('deleting a player drops rivals\' records of them', rules.afterRemove === 0);

    // ---- the seat picker -----------------------------------------------------------
    await page.evaluate(() => { const s = window.__claw.seats; s.count = 2; s.bots = [false, false, true, true]; s.who = [null, null, null, null]; });
    await page.click('[data-go="quick"]');
    await page.waitForSelector('#seat-list .seat');
    const nm = i => page.textContent(`#seat-list .seat[data-seat="${i}"] .nm`);
    ok('guests are "Player N"', (await nm(0)) === 'Player 1' && (await nm(1)) === 'Player 2');
    const faces = await page.evaluate(() => [...document.querySelectorAll('#seat-list .seat .dot img.face')]
        .map(i => i.naturalWidth > 0 && i.src.startsWith('data:image/png')));
    ok('seats show rendered 3D portraits', faces.length === 2 && faces.every(Boolean), JSON.stringify(faces));

    const addAt = async (seat, name) => {
        await page.click(`#seat-list .seat[data-seat="${seat}"] .seat-who`);
        await page.fill('.pick-new input', name);
        await page.click('.pick-new .go-btn');
    };
    await addAt(0, 'Caleb');
    await addAt(1, 'Sam');
    ok('a new player takes the seat', (await nm(0)) === 'Caleb' && (await nm(1)) === 'Sam');
    await page.click('#seat-list .seat[data-seat="1"] .seat-who');
    ok('the picker lists both, marking where Caleb sits', await page.evaluate(() =>
        [...document.querySelectorAll('.pick-row')].map(r => r.textContent).join('|')) === 'CalebRed|Sam');
    await page.screenshot({ path: `${SHOTS}/shot-picker.png` }).catch(() => {});
    await page.fill('.pick-new input', 'caleb');
    await page.click('.pick-new .go-btn');
    ok('a taken name is refused', await page.$('.pick-card') && (await page.getAttribute('.pick-new input', 'placeholder')).includes('taken'));
    await page.click('.pick-row:first-child');
    ok('one player, one seat: Caleb moves, Red becomes a guest', (await nm(0)) === 'Player 1' && (await nm(1)) === 'Caleb');
    await page.click('#seat-list .seat[data-seat="0"] .seat-who');
    await page.click('.pick-row:nth-child(2)');
    ok('Sam sits in Red', (await nm(0)) === 'Sam');
    await page.click('#seat-list .seat[data-seat="1"] [data-k="bot"]');
    ok('a bot seat is named for its colour', (await nm(1)) === 'Bot Blue');
    ok('seat screen fits a phone', await noSideScroll());
    await page.screenshot({ path: `${SHOTS}/shot-seats.png` }).catch(() => {});

    // ---- a real game carries the name and character ------------------------------------
    const samChar = await page.evaluate(async () => (await import('/src/arcade/Profiles.js')).list().find(p => p.name === 'Sam').char);
    await page.click('#btn-seats-go');
    await page.waitForSelector('#scr-grid:not([hidden])');
    await page.evaluate(() => window.__claw.play('snapstrike'));
    const inGame = await page.evaluate(() => window.__claw.state.players.slice(0, 2).map(p => [p.name, p.charType]));
    ok('the game sees the profile\'s name and character', inGame[0][0] === 'Sam' && inGame[0][1] === samChar && inGame[1][0] === 'Bot Blue',
        JSON.stringify(inGame));
    const t0 = Date.now();
    let back = false;
    while (Date.now() - t0 < 120000) {
        const st = await page.evaluate(() => {
            for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1']) {
                const b = document.getElementById(id); if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            }
            document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
            return { arcade: !document.getElementById('arcade').hidden, active: window.__claw.state.mgActive };
        });
        if (!st.active && st.arcade && Date.now() - t0 > 3000) { back = true; break; }
        await page.waitForTimeout(150);
    }
    const rec = await page.evaluate(async () => {
        const P = await import('/src/arcade/Profiles.js');
        const sam = P.list().find(p => p.name === 'Sam'), cal = P.list().find(p => p.name === 'Caleb');
        return { sam: P.stats(sam.id).plays, caleb: P.stats(cal.id).plays };
    });
    ok('the game lands on Sam\'s record and not on the benched Caleb', back && rec.sam === 1 && rec.caleb === 0, JSON.stringify(rec));

    // ---- party names ------------------------------------------------------------------
    const pname = await page.evaluate(async () => (await import('/src/arcade/Party.js')).seatName(0));
    ok('party standings use the profile name', pname === 'Sam');

    // ---- the Players screens -----------------------------------------------------------
    await page.evaluate(() => window.__claw.show('home'));
    ok('home counts the players', (await page.textContent('#home-players-n')).trim() === '2');
    await page.click('[data-go="players"]');
    const cards = await page.evaluate(() => [...document.querySelectorAll('#player-list .pl-card')].map(c => c.textContent));
    ok('the list shows both players and a New player card', cards.length === 3 && cards[0].includes('Caleb') && cards[1].includes('1 played'), JSON.stringify(cards));
    ok('players screen fits a phone', await noSideScroll());
    await page.screenshot({ path: `${SHOTS}/shot-players.png` }).catch(() => {});

    await page.click('#player-list .pl-card[data-id] >> nth=1');   // Sam
    await page.waitForSelector('#scr-player:not([hidden])');
    ok('profile shows the record', (await page.textContent('#pf-stats')).replace(/\s+/g, '').startsWith('1Played'));
    await page.fill('#pf-name', 'Samantha');
    await page.press('#pf-name', 'Tab');
    await page.click('#pf-chars [data-char="investor"]');
    ok('nine characters to pick from, the new one selected', await page.evaluate(() =>
        document.querySelectorAll('#pf-chars .ch-pick').length === 9 && document.querySelector('#pf-chars .sel').dataset.char === 'investor'));
    ok('profile screen fits a phone', await noSideScroll());
    await page.screenshot({ path: `${SHOTS}/shot-profile.png`, fullPage: true }).catch(() => {});
    await boot();
    const kept = await page.evaluate(async () => (await import('/src/arcade/Profiles.js')).list().map(p => `${p.name}:${p.char}`));
    ok('rename and character survive a reload', kept.includes('Samantha:investor'), JSON.stringify(kept));
    ok('and the seat still holds her', await page.evaluate(async () => (await import('/src/arcade/Seats.js')).seatName(0)) === 'Samantha');

    await page.click('[data-go="players"]');
    await page.click('#btn-player-add');
    await page.waitForSelector('#scr-player:not([hidden])');
    await page.click('#btn-pf-delete');
    await page.click('.confirm-yes');
    await page.waitForSelector('#scr-players:not([hidden])');
    ok('a new player can be made and deleted', (await page.$$('#player-list .pl-card[data-id]')).length === 2);

    // ---- Play Together prefill ------------------------------------------------------------
    await page.evaluate(() => window.__claw.show('together'));
    ok('Play Together offers the first player\'s name', (await page.inputValue('#net-name')) === 'Caleb');

    // ---- an old seat save, from before profiles ------------------------------------------
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('claw.seats', JSON.stringify({ count: 3, bots: [false, true, false, true], tier: 'hard' })); });
    await boot();
    await page.click('[data-go="quick"]');
    ok('an old seat save loads with guests', (await nm(2)) === 'Player 3' && (await nm(1)) === 'Bot Blue');
    ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

    await browser.close();
    pass.forEach(p => console.log('OK   ' + p));
    fail.forEach(f => console.log('FAIL ' + f));
    console.log(fail.length ? `PLAYERS FAIL — ${fail.length} of ${pass.length + fail.length}` : `PLAYERS PASS — ${pass.length} checks`);
    process.exit(fail.length ? 1 : 0);
})();
