// Make Rebound's daily tanks: random tanks (ReboundLogic.randomTank) that the
// solver clears in 2 or 3 flicks, each with that par. Too slow to do on a
// phone every day, so it's done here once and shipped as src/arcade/ReboundDaily.js.
// The day picks one (Rebound.dailyTank), cycling through the list.
//
// usage: node scripts/rebound-dailies.mjs [count, default 200]
import { writeFileSync } from 'fs';
import { randomTank, solve } from '../src/arcade/ReboundLogic.js';
import { rng, hash } from '../src/arcade/SoloStats.js';

const COUNT = +(process.argv[2] || 200);
const round = v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);
const tanks = [];
const t0 = Date.now();
for (let seed = 0; tanks.length < COUNT; seed++) {
    const lv = round(randomTank(rng(hash(`rebound-daily:${seed}`))));
    if (lv.clams.length < 4) continue;
    const r = solve(lv, { maxDepth: 3, angles: 96, powers: [0.35, 0.6, 0.85, 1], beam: 6 });
    if (!r || r.flicks < 2) continue;
    lv.par = r.flicks;
    lv.seed = seed;
    tanks.push(lv);
    if (tanks.length % 20 === 0) console.log(`${tanks.length} tanks (${((Date.now() - t0) / 1000).toFixed(0)} s, seed ${seed})`);
}
const out = `// ============================================================
// REBOUND DAILY TANKS — made by scripts/rebound-dailies.mjs: random tanks the
// solver clears in 2 or 3 flicks, with that par. The day picks one
// (Rebound.dailyTank), so every phone plays the same tank. Don't edit by hand.
// ============================================================
export const TANKS = ${JSON.stringify(tanks)};
`;
writeFileSync(new URL('../src/arcade/ReboundDaily.js', import.meta.url), out);
console.log(`wrote ${tanks.length} tanks, ${out.length} bytes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
