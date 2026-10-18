// ============================================================
// PINBALL BALANCE LAB — whole 120 s games simulated faster than real time in
// the browser: an idle table (never flips) against the bot at each skill, N
// games each. Prints mean and spread of scores and drains, and how often the
// bot beat the idle table. The skill dial must matter (MINIGAME_STANDARD §5).
//
// usage: (static server on :8140)  node qa/pinball-lab.mjs [games=12]
// ============================================================
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const N = +(process.argv[2] || 12);
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8140/index.html');
await page.waitForFunction(() => !!window.__claw);
const out = await page.evaluate(async N => {
    const P = await import('/src/games/Pinball.js');
    const lab = P._qa().lab;
    const res = {};
    for (const skill of [null, 0.25, 0.55, 0.85]) {
        const rows = [];
        for (let g = 0; g < N; g++) {
            const ts = [lab.fresh(0), lab.fresh(1)];
            lab.setTables(ts); lab.setSkill(skill ?? 0.55);
            for (let i = 0; i < P.GAME_TIME * 60; i++) {
                if (skill !== null) lab.bot(ts[1]);
                ts.forEach(t => lab.update(t, 1 / 60));
            }
            rows.push({ idle: ts[0].score, bot: ts[1].score, dIdle: ts[0].drains, dBot: ts[1].drains, esc: ts[0].escapes + ts[1].escapes,
                        mb: ts[1].jackpots, ms: ts[1].missionsDone });
        }
        res[skill ?? 'idle-vs-idle'] = rows;
    }
    lab.setTables(null);
    return res;
}, N);
const mean = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
for (const [k, rows] of Object.entries(out)) {
    const wins = rows.filter(r => r.bot > r.idle).length;
    console.log(`${String(k).padEnd(13)} idle ${mean(rows.map(r => r.idle)).toLocaleString().padStart(8)} (${mean(rows.map(r => r.dIdle))} drains)  ` +
        `other ${mean(rows.map(r => r.bot)).toLocaleString().padStart(8)} (${mean(rows.map(r => r.dBot))} drains)  ` +
        `beats idle ${wins}/${rows.length}  jackpots ${mean(rows.map(r => r.mb))} missions ${mean(rows.map(r => r.ms))}  escapes ${rows.reduce((a, r) => a + r.esc, 0)}`);
}
await browser.close();
