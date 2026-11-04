// Lighthouse Beams and Treasure Dig rules, no browser.
// usage: node qa/lighthouse.mjs [puzzles per level, default 40]
import { generate, countSolutions, check, rays, LEVELS, ROCK, BOAT, SEA } from '../src/arcade/LighthouseLogic.js';
import { bury, reading, steps, stars, N, CHESTS } from '../src/arcade/TreasureDig.js';
import { rng, dailySeed } from '../src/arcade/SoloStats.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const COUNT = +(process.argv[2] || 40);

// ---- Lighthouse Beams ----
ok(JSON.stringify(rays(3, [SEA, ROCK, SEA, SEA, SEA, SEA, BOAT, SEA, SEA], 3).sort()) === JSON.stringify([0, 4, 5, 6].sort()), 'rays stop at rocks and pass over boats');
for (const [level, L] of Object.entries(LEVELS)) {
    let unique = 0, valid = 0, maxMs = 0, boats = 0;
    for (let i = 0; i < COUNT; i++) {
        const t = Date.now();
        const p = generate(level, rng(5000 + i * 7 + L.n));
        maxMs = Math.max(maxMs, Date.now() - t);
        if (countSolutions(p.n, p.grid, 3) === 1) unique++;
        if (check(p.n, p.grid, p.solution).solved && p.solution.every(k => p.grid[k] === SEA)) valid++;
        boats += p.grid.filter(v => v === BOAT).length;
    }
    ok(unique === COUNT, `${level} (${L.n}×${L.n}): ${unique}/${COUNT} puzzles have exactly one answer`);
    ok(valid === COUNT, `${level}: the hidden answer obeys every rule in all ${COUNT}`);
    console.log(`     ${level}: ${L.lights} lighthouses, ${(boats / COUNT).toFixed(1)} boats on average; slowest to make ${maxMs} ms`);
    ok(maxMs < 2000, `${level}: every puzzle made in under 2 s`);
}
const p = generate('easy', rng(1));
const c0 = check(p.n, p.grid, []);
ok(!c0.solved && c0.unlit.length === p.grid.filter(v => v === BOAT).length, 'an empty board: every boat unlit, not solved');
const sea = p.grid.findIndex((v, k) => v === SEA && !p.solution.includes(k) && rays(p.n, p.grid, k).some(j => p.solution.includes(j)));
if (sea >= 0) ok(check(p.n, p.grid, [...p.solution, sea]).clash.size > 0, 'a lighthouse in another\'s beam is a clash');
const daily = [generate('medium', rng(dailySeed('lighthouse', '2026-11-04'))), generate('medium', rng(dailySeed('lighthouse', '2026-11-04')))];
ok(JSON.stringify(daily[0]) === JSON.stringify(daily[1]), 'the daily puzzle is the same from the same date (every phone gets it)');
ok(JSON.stringify(generate('medium', rng(dailySeed('lighthouse', '2026-11-05')))) !== JSON.stringify(daily[0]), 'and a different one the next day');

// ---- Treasure Dig ----
const ch = bury(rng(3));
ok(ch.length === CHESTS && new Set(ch).size === CHESTS && ch.every(k => k >= 0 && k < N * N), `bury: ${CHESTS} chests on distinct squares`);
ok(steps(0, N * N - 1) === 2 * (N - 1), 'steps: corner to corner is up/down plus left/right');
const k = [...Array(N * N).keys()].find(i => !ch.includes(i));
ok(reading(k, ch, []) === Math.min(...ch.map(c => steps(k, c))), 'a hole reads the steps to the nearest chest');
const nearest = ch.reduce((a, c) => (steps(k, c) < steps(k, a) ? c : a), ch[0]);
ok(reading(k, ch, [nearest]) >= reading(k, ch, []), 'once that chest is found, the hole re-counts to the rest');
ok(reading(k, ch, ch) === null, 'and reads nothing when all are found');
ok(stars(8) === 3 && stars(12) === 2 && stars(30) === 1, 'stars: ≤10 three, ≤15 two, else one');
ok(JSON.stringify(bury(rng(dailySeed('treasure', '2026-11-04')))) === JSON.stringify(bury(rng(dailySeed('treasure', '2026-11-04')))), 'the daily beach is the same from the same date');

if (fails) { console.log(`LIGHTHOUSE FAIL — ${fails}`); process.exit(1); }
console.log('LIGHTHOUSE PASS');
