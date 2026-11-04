// Ice Floe and Rock Pool Paths rules, no browser.
// usage: node qa/icefloe.mjs [puzzles per level, default 60]
import { generate, slide, distances, par, route, stars, LEVELS, ROCK, SNOW, ICE } from '../src/arcade/IceFloeLogic.js';
import { rng } from '../src/arcade/SoloStats.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const COUNT = +(process.argv[2] || 60);

// ---- Ice Floe ----
const lv = { w: 4, h: 3 };
const g = [ICE, ICE, ROCK, ICE,  ICE, SNOW, ICE, ICE,  ICE, ICE, ICE, ICE];
ok(slide(lv, g, 0, 'right') === 1, 'a slide stops in front of a rock');
ok(slide(lv, g, 4, 'right') === 5, 'and dead on snow');
ok(slide(lv, g, 8, 'right') === 11 && slide(lv, g, 11, 'up') === 3, 'and at the edge');
ok(slide(lv, g, 0, 'up') === 0, 'into a wall: no move');
for (const [level, L] of Object.entries(LEVELS)) {
    let good = 0, routes = 0, maxMs = 0, sum = 0;
    for (let i = 0; i < COUNT; i++) {
        const t = Date.now();
        const p = generate(level, rng(900 + i * 13 + L.w));
        maxMs = Math.max(maxMs, Date.now() - t);
        const d = par(p, p.grid, p.start, p.fish);
        if (d === p.par && d >= L.par[0] && d <= L.par[1] && p.grid[p.fish] !== ROCK && p.fish !== p.start) good++;
        // the route really ends on the fish, in par slides
        const r = route(p, p.grid, p.start, p.fish);
        let k = p.start; r.forEach(dir => { k = slide(p, p.grid, k, dir); });
        if (k === p.fish && r.length === p.par) routes++;
        sum += p.par;
    }
    ok(good === COUNT, `${level} (${L.w}×${L.h}): ${good}/${COUNT} floes have their par in ${L.par[0]}–${L.par[1]} slides`);
    ok(routes === COUNT, `${level}: the shortest route really stops on the fish in par, all ${COUNT}`);
    console.log(`     ${level}: par ${(sum / COUNT).toFixed(1)} on average; slowest to make ${maxMs} ms`);
}
ok(stars(5, 5) === 3 && stars(7, 5) === 2 && stars(8, 5) === 1, 'stars: par ★★★, par+2 ★★, more ★');
ok(JSON.stringify(generate('medium', rng(42))) === JSON.stringify(generate('medium', rng(42))), 'the same seed, the same floe (the daily)');

// ---- Rock Pool Paths ----
const P = await import('../src/arcade/PathsLogic.js');
for (const [level, L] of Object.entries(P.LEVELS)) {
    let good = 0, maxMs = 0, pairs = 0;
    for (let i = 0; i < COUNT; i++) {
        const t = Date.now();
        const p = P.generate(level, rng(300 + i * 7 + L.n));
        maxMs = Math.max(maxMs, Date.now() - t);
        // the hidden solution obeys the rules: every square used, each pair joined, no crossing
        const c = P.check(p.n, p.ends, p.solution);
        const far = p.ends.every(([a, b]) => Math.abs(Math.floor(a / p.n) - Math.floor(b / p.n)) + Math.abs(a % p.n - b % p.n) >= 2);
        if (c.solved && far && p.ends.length >= L.pairs[0] && p.ends.length <= L.pairs[1]) good++;
        pairs += p.ends.length;
    }
    ok(good === COUNT, `${level} (${L.n}×${L.n}): ${good}/${COUNT} pools are solvable, every pair at least 2 apart`);
    console.log(`     ${level}: ${(pairs / COUNT).toFixed(1)} pairs on average; slowest to make ${maxMs} ms`);
}
const p = P.generate('easy', rng(5));
ok(!P.check(p.n, p.ends, p.ends.map(e => [e[0]])).solved, 'paths not drawn: not solved');
const broken = p.solution.map(s => s.slice()); broken[0] = broken[0].slice(0, -1);
ok(!P.check(p.n, p.ends, broken).solved, 'a path stopping short: not solved');
const cross = p.solution.map(s => s.slice()); cross[1] = [...cross[1], cross[0][1]];
ok(!P.check(p.n, p.ends, cross).solved, 'two paths on one square: not solved');

if (fails) { console.log(`ICE FLOE FAIL — ${fails}`); process.exit(1); }
console.log('ICE FLOE + PATHS PASS');
