// ============================================================
// CAPTURE CLIPS — records a short loop of real play for every game card:
// party games with bots on both seats, solo games driven by a script that
// plays them properly. Each becomes assets/clips/<id>.mp4 (square, silent,
// H.264 so iPhones play it inline) and assets/clips/<id>.jpg (its poster),
// and src/arcade/Clips.js lists which games have one.
//
// usage: (static server on :8140)   node scripts/capture-clips.js [id,id,…]
// needs ffmpeg on the PATH.
// ============================================================
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'assets', 'clips'), TMP = path.join(require('os').tmpdir(), 'claw-clips');
const SIZE = 320, SECS = 3.6, FPS = 20, VW = 412, VH = 892;

// ---- solo games: how to get each one moving (runs in the page; `wait` is a sleep) ----
// Each returns once the interesting bit has started; recording goes on from there.
const SOLO = {
    shelf: { open: 'shelf', sel: '#sg-body canvas', play: async () => { const M = await import('/src/arcade/PrizeShelf.js'); for (let i = 0; i < 2; i++) { try { M.dropClaw(); } catch (e) {} await wait(1600); } } },
    critter: { open: 'critter', sel: '#scr-critter .cs-board, #scr-critter [class*=board]', play: async () => {
        const M = await import('/src/arcade/CritterSquare.js'); M.start('easy'); await wait(300);
        const d = M._debug(), sol = d.p.solution || d.p.sol;
        for (let k = 0; k < sol.length; k++) if (d.grid[k] == null || d.grid[k] < 0 || d.grid[k] === 0 && !d.p.given?.includes(k)) { M.pick(k); await wait(120); M.place(sol[k]); await wait(220); }
    } },
    rebound: { open: 'rebound', sel: '#rb-cv', play: async () => {
        const R = await import('/src/arcade/Rebound.js'), L = await import('/src/arcade/ReboundLogic.js'); R.play(12); await wait(500);
        const r = L.solve(L.LEVELS[12], { maxDepth: L.LEVELS[12].par, angles: 72, powers: [0.4, 0.7, 1], beam: 4 });
        for (const [a, p] of r ? r.path : [[-1.4, 0.8]]) { R.shoot(a, p); await wait(200); while (R._debug().moving) await wait(80); await wait(250); }
    } },
    orbit: { open: 'orbit', sel: '#ag-cv', play: async () => {
        const G = await import('/src/arcade/Orbit.js'), L = await import('/src/arcade/OrbitLogic.js'), A = await import('/src/arcade/AimSearch.js'); G.play(11); await wait(500);
        const r = A.solve(L, L.LEVELS[11], { maxDepth: L.LEVELS[11].par, ...L.SEARCH });
        for (const [a, p] of r.path) { G.shoot(a, p); await wait(150); while (G._debug().moving) await wait(80); await wait(300); }
    } },
    reefdrop: { open: 'reefdrop', sel: '#ag-cv', play: async () => {
        const G = await import('/src/arcade/ReefDrop.js'), L = await import('/src/arcade/ReefDropLogic.js'); G.play(16); await wait(400);
        for (let n = 0; n < 3; n++) {
            const s = G._debug().state, lv = L.LEVELS[16]; let best = null;
            for (let a = 0; a < 40; a++) for (const pw of [0.3, 0.6, 1]) { const c = L.copy(s), ang = 0.05 + (a / 40) * (Math.PI - 0.1); L.shot(lv, c, ang, pw); L.settle(lv, c); const sc = L.score(lv, c); if (!best || sc > best.sc) best = { sc, ang, pw }; }
            G.shoot(best.ang, best.pw); await wait(150); while (G._debug().moving) await wait(80); await wait(200);
        }
    } },
    mirror: { open: 'mirror', sel: '#ml-board', play: async () => {
        const M = await import('/src/arcade/Mirror.js'); M.play(14); await wait(500);
        const d = M._debug();
        for (const k of Object.keys(d.lv.solution)) for (let n = (d.lv.solution[k] - d.mirrors[k] + 4) % 4; n > 0; n--) { M.turn(+k); await wait(260); }
    } },
    icefloe: { open: 'icefloe', sel: '#if-board', play: async () => {
        const I = await import('/src/arcade/IceFloe.js'), G = await import('/src/arcade/IceFloeLogic.js'); I.start('medium'); await wait(400);
        const d = I._debug(); for (const dir of G.route(d.p, d.p.grid, d.p.start, d.p.fish)) { I.move(dir); await wait(520); }
    } },
    paths: { open: 'paths', sel: '#pp-board', play: async () => {
        const M = await import('/src/arcade/Paths.js'); M.start('medium'); await wait(400);
        for (const path of M._debug().p.solution) { M.begin(path[0]); for (const k of path.slice(1)) { await wait(60); M.extend(k); } M.end(); await wait(150); }
    } },
    treasure: { open: 'treasure', sel: '.td-beach', play: async () => {
        const T = await import('/src/arcade/TreasureDig.js'); const d = T._debug();
        const others = [...Array(49).keys()].filter(k => !d.chests.includes(k));
        for (const k of [others[24], others[8], others[30]]) { T.dig(k); await wait(420); }
        for (const k of d.chests) { T.dig(k); await wait(520); }
    } },
    lighthouse: { open: 'lighthouse', sel: '#lh-board', play: async () => {
        const M = await import('/src/arcade/Lighthouse.js'); M.start('medium'); await wait(400);
        for (const k of M._debug().p.solution) { M.toggle(k); await wait(380); }
    } },
    coral: { open: 'coral', sel: '#sg-body canvas', play: async () => {
        const C = await import('/src/arcade/Coral.js'); for (let i = 0; i < 14; i++) { C.dropHere(1.2 + ((i * 2.3) % 4.6)); await wait(330); }
    } },
    kite: { open: 'kite', sel: '#kt-cv', play: async () => {
        document.querySelector('#btn-kt-go').click(); const K = await import('/src/arcade/Kite.js');
        for (let i = 0; i < 70; i++) { const d = K._debug(); if (d.over) break; if (d.y > 0.42) K.tug(); if (i === 20 || i === 40) K._place('ring', -0.02); await wait(90); }
    } },
    pearl: { open: 'pearl', sel: '#pd-cv', play: async () => {
        document.querySelector('#btn-pd-go').click(); const M = await import('/src/arcade/PearlDiver.js');
        const cv = document.querySelector('#pd-cv'), r = cv.getBoundingClientRect(), at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true };
        for (let i = 0; i < 6; i++) { cv.dispatchEvent(new PointerEvent('pointerdown', at)); if (i === 1 || i === 3) M._place('pearl', 0.04); await wait(520); window.dispatchEvent(new PointerEvent('pointerup', at)); await wait(420); }
    } },
};

async function record(browser, id, kind) {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: true, recordVideo: { dir: TMP, size: { width: VW, height: VH } } });
    const p = await ctx.newPage();
    const t0 = Date.now();
    await p.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('claw.solo', JSON.stringify({ tokens: 9 })); } catch (e) {} });
    await p.goto(BASE); await p.waitForFunction(() => !!window.__claw);
    let start = 0, box = null;
    if (kind === 'party') {
        await p.evaluate(type => { const c = window.__claw; c.seats.count = 2; c.seats.bots = [true, true, true, true]; c.show('grid'); c.play(type); }, id);
        for (let i = 0; i < 120; i++) {
            const on = await p.evaluate(() => {
                for (const b of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-0']) { const e = document.getElementById(b); if (e && e.offsetParent) e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
                return window.__claw.state.mgActive;
            });
            if (on) break;
            await p.waitForTimeout(150);
        }
        await p.waitForTimeout(2500);   // past the countdown, into the action
        start = (Date.now() - t0) / 1000;
        await p.waitForTimeout((SECS + 0.6) * 1000);
        box = [0, (VH - VW) / 2, VW, VW];   // the middle of the table
    } else {
        const S = SOLO[id];
        await p.click('[data-go="solo"]'); await p.waitForSelector('#scr-solo:not([hidden])');
        await p.click(`#solo-list [data-game="${S.open}"]`); await p.waitForTimeout(600);
        await p.evaluate(() => { window.wait = ms => new Promise(r => setTimeout(r, ms)); });
        const run = p.evaluate(`(${S.play.toString()})()`).catch(e => console.log('   (drive)', id, e.message.slice(0, 120)));
        await p.waitForTimeout(250);
        start = (Date.now() - t0) / 1000;
        box = await p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, S.sel);
        await Promise.race([run, p.waitForTimeout((SECS + 0.8) * 1000)]);
        await p.waitForTimeout(Math.max(0, (SECS + 0.6) * 1000 - ((Date.now() - t0) / 1000 - start) * 1000));
        if (box) { const s = Math.min(box[2], box[3]); box = [box[0] + (box[2] - s) / 2, box[1] + (box[3] - s) / 2, s, s]; }
        else box = [0, (VH - VW) / 2, VW, VW];
    }
    const vid = await p.video().path();
    await ctx.close();
    // crop the square, trim, scale, encode: H.264 baseline-ish, no sound, starts fast
    const [x, y, w] = box.map(v => Math.max(0, Math.round(v)));
    const crop = `crop=${Math.min(w, VW - x)}:${Math.min(w, VH - y)}:${x}:${y},scale=${SIZE}:${SIZE}:flags=lanczos,fps=${FPS}`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(start), '-t', String(SECS), '-i', vid, '-vf', crop, '-an', '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', path.join(OUT, `${id}.mp4`)]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(start + SECS * 0.6), '-i', vid, '-frames:v', '1', '-vf', crop.replace(`,fps=${FPS}`, ''), '-q:v', '6', path.join(OUT, `${id}.jpg`)]);
    fs.unlinkSync(vid);
    return fs.statSync(path.join(OUT, `${id}.mp4`)).size;
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
    const probe = await browser.newPage(); await probe.goto(BASE); await probe.waitForFunction(() => !!window.__claw);
    const party = await probe.evaluate(async () => (await import('/src/arcade/Catalog.js')).allTypes(false));
    await probe.close();
    const only = process.argv[2] ? process.argv[2].split(',') : null;
    const jobs = [...Object.keys(SOLO).map(id => [id, 'solo']), ...party.map(id => [id, 'party'])].filter(([id]) => !only || only.includes(id));
    for (const [id, kind] of jobs) {
        try { const b = await record(browser, id, kind); console.log(`ok   ${id.padEnd(13)} ${kind}  ${Math.round(b / 1024)} KB`); }
        catch (e) { console.log(`FAIL ${id} ${e.message.slice(0, 160)}`); }
    }
    await browser.close();
    const have = fs.readdirSync(OUT).filter(f => f.endsWith('.mp4')).map(f => f.slice(0, -4)).sort();
    fs.writeFileSync(path.join(ROOT, 'src', 'arcade', 'Clips.js'), `// ============================================================
// CLIPS — which games have a gameplay clip (assets/clips/<id>.mp4 and .jpg).
// Made by scripts/capture-clips.js; don't edit by hand.
// ============================================================
export const HAVE = new Set(${JSON.stringify(have)});
export const clip = id => (HAVE.has(id) ? { video: \`assets/clips/\${id}.mp4\`, poster: \`assets/clips/\${id}.jpg\` } : null);
`);
    console.log(`${have.length} clips; wrote src/arcade/Clips.js`);
})();
