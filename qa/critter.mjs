// Critter Square rules: Latin squares, one solution per puzzle, the checker.
// usage: node qa/critter.mjs [puzzles per level, default 40]
import { latinSquare, generate, countSolutions, conflicts, solved, LEVELS } from '../src/arcade/CritterLogic.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const N = +(process.argv[2] || 40);

// A seeded random, so a failure can be replayed.
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const latin = (n, g) => [...Array(n).keys()].every(i => new Set(g.slice(i * n, i * n + n)).size === n && new Set([...Array(n).keys()].map(r => g[r * n + i])).size === n);

for (const n of [4, 5, 6]) ok(latin(n, latinSquare(n, rng(n))), `latinSquare(${n}) holds each critter once per row and column`);

for (const [level, L] of Object.entries(LEVELS)) {
    let unique = 0, fit = 0, sumGiven = 0, maxMs = 0;
    for (let i = 0; i < N; i++) {
        const t = Date.now();
        const p = generate(level, rng(1000 * L.n + i));
        maxMs = Math.max(maxMs, Date.now() - t);
        if (countSolutions(p.n, p.givens, p.fences, 3) === 1) unique++;
        if (latin(p.n, p.solution) && p.givens.every((v, k) => v < 0 || v === p.solution[k]) && p.fences.every(f => (f.big === 'a') === (p.solution[f.a] > p.solution[f.b]))) fit++;
        sumGiven += p.givens.filter(v => v >= 0).length;
    }
    ok(unique === N, `${level} (${L.n}×${L.n}): ${unique}/${N} puzzles have exactly one solution`);
    ok(fit === N, `${level}: givens and fences agree with the solution in all ${N}`);
    console.log(`     ${level}: ${(sumGiven / N).toFixed(1)} of ${L.n * L.n} squares given on average; slowest to make ${maxMs} ms`);
    ok(maxMs < 1500, `${level}: every puzzle made in under 1.5 s`);
}

// The checker.
const p = generate('easy', rng(7));
ok(conflicts(p.n, p.solution, p.fences).size === 0 && solved(p.n, p.solution, p.fences), 'the solution has no conflicts and counts as solved');
const g = p.solution.slice(); g[0] = g[1];
ok(conflicts(p.n, g, p.fences).has(0) && conflicts(p.n, g, p.fences).has(1), 'a repeat in a row is flagged on both squares');
ok(!solved(p.n, g, p.fences), 'and is not solved');
const e = p.solution.slice(); e[5] = -1;
ok(!solved(p.n, e, p.fences) && conflicts(p.n, e, p.fences).size === 0, 'an empty square: not solved, but nothing wrong yet');
const f = { a: 0, b: 1, big: 'a' };
ok(conflicts(2, [0, 1, 1, 0], [f]).size === 2 && conflicts(2, [1, 0, 0, 1], [f]).size === 0, 'a fence the wrong way is flagged, the right way is fine');
ok(countSolutions(2, [-1, -1, -1, -1], [], 5) === 2 && countSolutions(2, [0, 0, -1, -1], [], 5) === 0, 'countSolutions: 2 for an empty 2×2, 0 for a broken one');

if (fails) { console.log(`CRITTER FAIL — ${fails}`); process.exit(1); }
console.log('CRITTER PASS');
