// The aim-and-shoot games and Mirror Lagoon, no browser: the rules, and every
// level within its par (Orbit Putt), every reef won
// with pearls to spare (Reef Drop), every lagoon solvable in its par (Mirror).
// usage: node qa/aimgames.mjs
import { solve, replay } from '../src/arcade/AimSearch.js';
import * as O from '../src/arcade/OrbitLogic.js';
import * as D from '../src/arcade/ReefDropLogic.js';
import * as M from '../src/arcade/MirrorLogic.js';
import { rng, hash } from '../src/arcade/SoloStats.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const UP = -Math.PI / 2;

// ---- Orbit Putt ----
{ const lv = { start: [0.5, 1.3], goal: [0.5, 0.6], planets: [], rocks: [], holes: [] };
  const fast = O.begin(lv); O.shot(lv, fast, UP, 1); let over = false; for (let i = 0; i < 400 && !fast.home; i++) { O.step(lv, fast); if (fast.y < 0.55) over = true; }
  ok(over, 'Orbit: a fast ball skims over the wormhole');
  const slow = O.begin(lv); O.shot(lv, slow, UP, 0.42); O.settle(lv, slow);
  ok(slow.home, 'Orbit: a gentle one drops in');
  const hl = { ...lv, holes: [[0.5, 0.9, 0.05]] }, h = O.begin(hl); O.shot(hl, h, UP, 1); O.settle(hl, h);
  ok(h.lost === 1 && h.x === 0.5 && h.y === 1.3, 'Orbit: a black hole sends the ball back to where the shot started');
  const pl = { ...lv, goal: [0.05, 0.05], planets: [[0.3, 0.9, 0.05, 1.5]] }, p = O.begin(pl); O.shot(pl, p, UP, 0.6); O.settle(pl, p);
  ok(p.x < 0.5, `Orbit: a planet bends the path towards it (ended at x ${p.x.toFixed(2)})`); }
// ---- Reef Drop ----
{ const lv = { pegs: [{ x: 0.5, y: 0.5, kind: 'o' }, { x: 0.5, y: 0.9, kind: 'e' }, { x: 0.55, y: 0.95, kind: 'c' }, { x: 0.45, y: 0.95, kind: 'o' }] };
  const s = D.begin(lv); D.shot(lv, s, Math.PI / 2, 0.2);
  let opened = false; for (let i = 0; i < 2400 && s.flying && !opened; i++) opened = D.step(lv, s).opened.length > 0;
  ok(opened && s.pegs[0].alive && s.pegs[0].hp === 1, 'Reef Drop: the first hit opens an oyster (it stays)');
  const z = D.begin(lv); z.pegs[0].alive = false; D.shot(lv, z, Math.PI / 2, 0.2); D.settle(lv, z);
  ok(!z.pegs[1].alive && !z.pegs[2].alive && z.pegs[3].hp <= 1, 'Reef Drop: an eel zaps the pieces near it'); }

// ---- every level ----
for (const [name, G] of [['Orbit Putt', O]]) {
    for (const [i, lv] of G.LEVELS.entries()) {
        const r = solve(G, lv, { maxDepth: lv.par, ...G.SEARCH });
        ok(!!r && r.shots <= lv.par && replay(G, lv, r.path), `${name} ${i + 1}. ${lv.name}: cleared in ${r ? r.shots : '—'} (par ${lv.par}), replayed`);
    }
}
for (const [i, lv] of D.LEVELS.entries()) {
    const s = D.begin(lv);
    while (!D.cleared(s) && s.left > 0) {
        let best = null;
        for (let a = 0; a < 60; a++) for (const pw of [0.3, 0.6, 1]) { const c = D.copy(s), ang = 0.05 + (a / 60) * (Math.PI - 0.1); D.shot(lv, c, ang, pw); D.settle(lv, c); const sc = D.score(lv, c); if (!best || sc > best.sc) best = { sc, ang, pw }; }
        D.shot(lv, s, best.ang, best.pw); D.settle(lv, s);
    }
    ok(D.cleared(s) && s.left >= 5, `Reef Drop ${i + 1}. ${lv.name}: won with ${s.left} pearls left (★★★ needs 5)`);
}
for (let i = 0; i < M.LEVEL_COUNT; i++) {
    const a = M.generate(i, rng(hash(`mirror:${i}`))), b = M.generate(i, rng(hash(`mirror:${i}`)));
    const good = M.trace(a, a.solution).solved && !M.trace(a, a.mirrors).solved && M.par(a, a.mirrors) === a.par && JSON.stringify(a) === JSON.stringify(b) && a.par <= Object.keys(a.mirrors).length;
    ok(good, `Mirror Lagoon ${i + 1}: ${a.w}×${a.h}, ${Object.keys(a.mirrors).length} mirrors, ${a.lanterns.length} lanterns, par ${a.par}`);
}

if (fails) { console.log(`AIM GAMES FAIL — ${fails}`); process.exit(1); }
console.log('AIM GAMES PASS');
