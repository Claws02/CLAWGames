// ============================================================
// MATCH LAB — how good is each game as a match? (claw-core minigames/PLAN.md)
//
// Plays real matches through the arcade with no human at the table and records,
// per game: does it finish, how long it takes, who wins, how close it was, and
// any page errors; for games on claw-core's Match.js, rounds and lead changes.
// Lengths are GAME time (frame time capped at 0.1 s, as the games count it),
// and the manager's wall-clock watchdog is pushed back so a slow software-GL
// page doesn't turn long matches into draws. Two table setups:
//
//   duel  both seats are bots (the games that only drive seat 2 leave seat 1
//         standing still, which shows up as "seat 1 never wins")
//   idle  seat 1 is a human who never touches the screen: the bot must win,
//         and the game must still end on its own
//
// QA_SPEED (default 1) runs the page clock that many times fast (performance.now,
// rAF time, timers). Leave it at 1 for real numbers: reaction games read event
// timestamps the clock can't scale (High Noon draws every match at 3×), and
// games cap dt at 0.1 s. Throughput comes from QA_PAGES parallel pages instead.
//
// usage: (static server on :8140 serving the repo root)
//   node qa/matchlab.js [games|all] [runs=3] [mode=duel|idle|both] [tier=medium]
//   QA_PAGES=3 QA_SPEED=3 node qa/matchlab.js all 3 both
// writes qa/matchlab-<stamp>.json and prints a scorecard
// ============================================================
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const SPEED = +(process.env.QA_SPEED || 1);
const PAGES = +(process.env.QA_PAGES || 3);
const [gamesArg = 'all', runsS = '3', modeArg = 'both', tier = 'medium'] = process.argv.slice(2);
const RUNS = +runsS;
const MODES = modeArg === 'both' ? ['duel', 'idle'] : [modeArg];
// No clock on a move by design; with nobody tapping, seat 1 never moves.
const NEEDS_A_HUMAN = new Set(['penalty', 'memorymatch', 'fourinarow']);

// Runs in the page before any script: everything that tells time runs SPEED× fast.
const CLOCK = speed => {
    const S = speed, p0 = performance.now(), d0 = Date.now();
    const pnow = performance.now.bind(performance), dnow = Date.now;
    performance.now = () => p0 + (pnow() - p0) * S;
    Date.now = () => d0 + (dnow() - d0) * S;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(() => cb(performance.now()));
    const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
    window.setTimeout = (fn, ms, ...a) => st(fn, (ms || 0) / S, ...a);
    window.setInterval = (fn, ms, ...a) => si(fn, (ms || 0) / S, ...a);
    window.__qaSpeed = S;
    // Game time as the games count it: frame time capped at 0.1 s. On a slow
    // (software-GL) page this runs behind the wall clock, so lengths are in it.
    window.__qaGame = { t: 0, frames: 0 };
    let last = null;
    const tick = now => { if (last != null) { window.__qaGame.t += Math.min(0.1, (now - last) / 1000); window.__qaGame.frames++; } last = now; raf(tick); };
    raf(tick);
};

async function playOne(page, type, mode, budgetS) {
    await page.evaluate(({ type, mode, tier }) => {
        const c = window.__claw;
        c.seats.count = 2;
        c.seats.tier = tier;
        c.seats.bots = mode === 'duel' ? [true, true, true, true] : [false, true, true, true];
        window.__ml = { start: null, end: null, winner: undefined, standings: null };
        c.show('grid');
        c.play(type, (w, s) => { window.__ml.end = performance.now(); window.__ml.winner = w; window.__ml.standings = s; });
    }, { type, mode, tier });
    const t0 = Date.now();
    let r;
    while ((Date.now() - t0) / 1000 < budgetS) {
        r = await page.evaluate(() => {
            for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2']) {
                const b = document.getElementById(id);
                if (b && b.offsetParent) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            }
            document.querySelectorAll('.mg-sc-btn').forEach(b => b.offsetParent && b.click());
            const m = window.__ml, g = window.__qaGame;
            if (m.start == null && window.__claw.state.mgActive && window.__claw.state.gameState === 'MINIGAME') {
                m.start = performance.now(); m.g0 = g.t; m.f0 = g.frames;
                // The manager's backstop runs on the wall clock; a slow page would hit it mid-match.
                import('/src/claw-core/minigames/MinigameManager.js').then(M => M.extendWatchdog(15 * 60 * 1000));
            }
            if (m.end != null && m.g1 == null) { m.g1 = g.t; m.f1 = g.frames; }
            return { winner: m.winner, standings: m.standings, start: m.start, end: m.end, g0: m.g0, g1: m.g1, f0: m.f0, f1: m.f1, log: window.__mgMatch || null };
        });
        if (r.winner !== undefined) break;
        await page.waitForTimeout(250);
    }
    const done = r && r.winner !== undefined;
    if (!done) {
        await page.evaluate(async () => {
            const M = await import('/src/claw-core/minigames/MinigameManager.js');
            try { M.forceEndMinigame(); } catch (e) {}
            try { M.endMinigame(-1); } catch (e) {}
        });
        await page.waitForTimeout(800);
    }
    // Game time (capped frame time), and frames per wall second.
    const ok = done && r.start != null && r.g1 != null;
    const secs = ok ? r.g1 - r.g0 : null;
    const fps = ok ? (r.f1 - r.f0) / ((r.end - r.start) / 1000) : null;
    const log = r && r.log && r.log.type === type ? r.log : null;
    return { done, winner: done ? r.winner : null, standings: done ? r.standings : null, secs, fps, log };
}

(async () => {
    const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({
        ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
    });
    const mkPage = async () => {
        const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
        page.__errs = [];
        page.on('pageerror', e => page.__errs.push('PAGEERROR ' + e.message));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.__errs.push('CONSOLE ' + m.text()); });
        await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
        await page.addInitScript(CLOCK, SPEED);
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__claw, null, { timeout: 30000 });
        return page;
    };
    const first = await mkPage();
    const meta = await first.evaluate(async () => {
        const R = await import('/src/claw-core/config/MinigameRegistry.js');
        const C = await import('/src/arcade/Catalog.js');
        return { eligible: C.eligible(2), watchdog: R.MG_WATCHDOG_MS };
    });
    const games = gamesArg === 'all' ? meta.eligible : gamesArg.split(',');
    // Real seconds a run may take: the game's own watchdog (or 120 s), sped up, plus the cards.
    const budgetFor = t => Math.max(120, (meta.watchdog[t] || 0) / 1000) / SPEED + 25;

    const jobs = [];
    for (const g of games) for (const mode of MODES) for (let i = 0; i < RUNS; i++) jobs.push({ g, mode });
    const pages = [first];
    for (let i = 1; i < PAGES; i++) pages.push(await mkPage());
    const runs = [];
    let next = 0;
    await Promise.all(pages.map(async page => {
        while (next < jobs.length) {
            const job = jobs[next++];
            const before = page.__errs.length;
            const t = Date.now();
            let res;
            try { res = await playOne(page, job.g, job.mode, budgetFor(job.g)); }
            catch (e) { res = { done: false, winner: null, secs: null, crash: String(e).slice(0, 120) }; }
            const errs = [...new Set(page.__errs.slice(before))];
            runs.push({ ...job, ...res, errs, real: (Date.now() - t) / 1000 });
            process.stdout.write(`${res.done ? '.' : 'x'}`);
            await page.waitForTimeout(300);
        }
    }));
    console.log('');
    await browser.close();

    // ---- scorecard -------------------------------------------------------
    const card = [];
    for (const g of games) {
        const row = { game: g };
        for (const mode of MODES) {
            const rs = runs.filter(r => r.g === g && r.mode === mode);
            const fin = rs.filter(r => r.done);
            const secs = fin.map(r => r.secs).filter(s => s != null);
            const wins = [0, 0, 0];   // seat 1, seat 2, draw
            fin.forEach(r => wins[r.winner === 0 ? 0 : r.winner === 1 ? 1 : 2]++);
            // Closeness: |a-b| / max(a,b) of the reported standings, when the game reports them.
            const margins = fin.filter(r => Array.isArray(r.standings) && r.standings.length >= 2)
                .map(r => { const [a, b] = r.standings; const m = Math.max(Math.abs(a), Math.abs(b)); return m ? Math.abs(a - b) / m : 0; });
            // Rounds and lead changes, for games on Match.js.
            const logs = fin.map(r => r.log).filter(Boolean);
            const leadChanges = logs.map(l => { let lead = -1, ch = 0; for (const rd of l.rounds) { const b = Math.max(...rd.wins), t = rd.wins.filter(w => w === b).length === 1 ? rd.wins.indexOf(b) : -1; if (t >= 0 && lead >= 0 && t !== lead) ch++; if (t >= 0) lead = t; } return ch; });
            const fpsL = fin.map(r => r.fps).filter(f => f != null);
            row[mode] = {
                n: rs.length, done: fin.length,
                fps: fpsL.length ? +Math.min(...fpsL).toFixed(0) : null,
                rounds: logs.length ? +(logs.reduce((a, l) => a + l.rounds.length, 0) / logs.length).toFixed(1) : null,
                leadChanges: logs.length ? +(leadChanges.reduce((a, b) => a + b, 0) / logs.length).toFixed(1) : null,
                secs: secs.length ? +(secs.reduce((a, b) => a + b, 0) / secs.length).toFixed(0) : null,
                secsMax: secs.length ? +Math.max(...secs).toFixed(0) : null,
                wins, margin: margins.length ? +(margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(2) : null,
                errs: [...new Set(rs.flatMap(r => r.errs))].slice(0, 3),
            };
        }
        // Flags a person should look at.
        const f = [];
        const d = row.duel, i = row.idle;
        if (NEEDS_A_HUMAN.has(g)) f.push('needs-human');
        if (d && d.done < d.n && !NEEDS_A_HUMAN.has(g)) f.push('duel-unfinished');
        if (i && i.done < i.n && !NEEDS_A_HUMAN.has(g)) f.push('idle-unfinished');
        if (i && i.done && i.wins[0] > 0) f.push('idle-human-won');
        if (d && d.done >= 2 && d.wins[0] === 0 && d.wins[2] === 0) f.push('seat1-no-ai?');
        if (d && d.secs != null && d.secs < 30) f.push('short');
        if (d && d.secs != null && d.secs > 150) f.push('long');
        if ((d && d.errs.length) || (i && i.errs.length)) f.push('errors');
        if ((d && d.fps != null && d.fps < 8) || (i && i.fps != null && i.fps < 8)) f.push('low-fps');
        row.flags = f;
        card.push(row);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    fs.writeFileSync(path.join(__dirname, `matchlab-${stamp}.json`), JSON.stringify({ speed: SPEED, tier, runs, card }, null, 2));
    const fmt = m => !m ? '' : `${m.done}/${m.n} ${m.secs ?? '-'}s(max ${m.secsMax ?? '-'}) W${m.wins.join('-')}${m.margin != null ? ' mg' + m.margin : ''}${m.rounds != null ? ` r${m.rounds} lc${m.leadChanges}` : ''} ${m.fps ?? "-"}fps `;
    console.log(`game            ${MODES.map(m => m.padEnd(32)).join('')}flags`);
    for (const r of card) console.log(r.game.padEnd(16) + MODES.map(m => fmt(r[m]).padEnd(32)).join('') + r.flags.join(' '));
    const errRows = card.filter(r => r.flags.includes('errors'));
    errRows.forEach(r => MODES.forEach(m => r[m]?.errs.forEach(e => console.log(`  ${r.game}/${m}: ${e.slice(0, 160)}`))));
})();
