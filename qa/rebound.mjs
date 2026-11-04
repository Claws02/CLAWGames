// Rebound physics, mechanics and levels, no browser: every level (and a
// sample of the daily tanks) can be cleared within its par.
// usage: node qa/rebound.mjs [daily tanks to re-check, default 12]
import { LEVELS, WORLDS, begin, flick, settle, step, solve, cleared, stars, moverAt, W, H, R } from '../src/arcade/ReboundLogic.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const UP = -Math.PI / 2;

// The pearl stays in the tank, slows down and stops.
const lv0 = LEVELS[0];
const s = begin(lv0); flick(s, -1.2, 1); settle(lv0, s);
ok(s.x >= R && s.x <= W - R && s.y >= R && s.y <= H - R && s.vx === 0 && s.vy === 0, `a full-power flick stays in the tank and stops (at ${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
const a = begin(LEVELS[4]), b = begin(LEVELS[4]);
flick(a, -1.7, 0.8); flick(b, -1.7, 0.8); settle(LEVELS[4], a); settle(LEVELS[4], b);
ok(a.x === b.x && a.y === b.y && JSON.stringify(a.popped) === JSON.stringify(b.popped), 'the same flick always ends the same way');
const s1 = begin(lv0); flick(s1, UP, 0.8); settle(lv0, s1);
ok(cleared(s1), 'First Flick: straight up pops the clam');
const bank = LEVELS[2], s2 = begin(bank); flick(s2, UP, 1);
let through = false;
for (let i = 0; i < 2400; i++) { step(bank, s2); const [bx, by, bw, bh] = bank.blocks[0]; if (s2.x > bx && s2.x < bx + bw && s2.y > by && s2.y < by + bh) through = true; }
ok(!through, 'Bank Shot: a full-power flick straight at the block never passes through it');
ok(stars(2, 2) === 3 && stars(4, 2) === 2 && stars(5, 2) === 1, 'stars: par ★★★, par+2 ★★, more ★');

// The mechanics, each on its own little tank
const tank = o => ({ name: 't', world: 1, start: [0.5, 1.3], clams: [[0.05, 0.05]], bumpers: [], blocks: [], ...o });
{ const lv = tank({ portals: [[0.5, 1.0, 0.2, 0.3]] }), t = begin(lv); flick(t, UP, 0.5);
  let warped = false, minY = 9; for (let i = 0; i < 600 && !warped; i++) { warped = step(lv, t).warped; } for (let i = 0; i < 30; i++) step(lv, t); minY = t.y;
  ok(warped && Math.abs(t.x - 0.2) < 0.03 && minY < 0.3, `portal: in at (0.5, 1.0), out at (0.2, 0.3) still going up (now at ${t.x.toFixed(2)}, ${t.y.toFixed(2)})`); }
{ const lv = tank({ coral: [[0, 0.8, 1, 0.05]] }), t = begin(lv);
  flick(t, UP, 0.6); settle(lv, t); const h1 = t.coral[0];
  flick(t, UP, 0.6); settle(lv, t); const h2 = t.coral[0];
  flick(t, UP, 0.9); let minY = t.y; for (let i = 0; i < 2400 && (t.vx || t.vy || i < 2); i++) { step(lv, t); minY = Math.min(minY, t.y); }
  ok(h1 === 1 && h2 === 0 && minY < 0.8, `coral: cracks on the first hit, breaks on the second, then the pearl goes through (hp ${h1} → ${h2}, reached y ${minY.toFixed(2)})`); }
{ const lv = tank({ urchins: [[0.5, 0.8]], start: [0.5, 1.3] }), t = begin(lv); t.x = 0.5; t.y = 1.3; flick(t, UP, 0.8);
  let stung = false; for (let i = 0; i < 1200 && !stung; i++) stung = step(lv, t).stung;
  ok(stung && t.x === 0.5 && t.y === 1.3 && t.vx === 0, 'urchin: the pearl goes back to where the flick started'); }
{ const lv = tank({ gates: [[0, 0.6, 1, 0.05]], switch: [0.5, 1.0], clams: [[0.5, 0.3]] }), t = begin(lv);
  flick(t, UP, 1); settle(lv, t);
  ok(t.open && cleared(t), 'switch: rolling over it opens the gates, and the pearl gets through to the clam'); }
{ const lv = tank({ gates: [[0, 0.6, 1, 0.05]], clams: [[0.5, 0.3]] }), t = begin(lv);
  flick(t, UP, 1); settle(lv, t);
  ok(!t.open && !cleared(t) && t.y > 0.6, 'and without a switch the gate holds'); }
{ const m = { bumper: [0.5, 0.5, 0.05], dx: 0.3, dy: 0, period: 2 };
  ok(Math.abs(moverAt(m, 0).bumper[0] - 0.5) < 1e-9 && Math.abs(moverAt(m, 0.5).bumper[0] - 0.8) < 1e-9 && Math.abs(moverAt(m, 1.5).bumper[0] - 0.2) < 1e-9, 'moving reef: slides out and back on its period'); }

// The worlds and every level within its par
ok(WORLDS.length === 4 && LEVELS.length === 32 && WORLDS.every((_, w) => LEVELS.filter(l => l.world === w).length === 8), `${LEVELS.length} levels, 8 in each of ${WORLDS.join(', ')}`);
for (const [i, lv] of LEVELS.entries()) {
    const boxes = [...lv.blocks, ...(lv.coral || []), ...(lv.gates || [])];
    const inside = lv.clams.some(([x, y]) => boxes.some(([bx, by, bw, bh]) => x > bx && x < bx + bw && y > by && y < by + bh));
    const r = solve(lv, { maxDepth: lv.par });
    let replay = false;
    if (r) { const t = begin(lv); r.path.forEach(([ang, p]) => { flick(t, ang, p); settle(lv, t); }); replay = cleared(t); }
    ok(!!r && r.flicks <= lv.par && replay && !inside, `${String(i + 1).padStart(2)}. ${lv.name}: cleared in ${r ? r.flicks : '—'} (par ${lv.par}), replayed${inside ? ' — A CLAM IS INSIDE A WALL' : ''}`);
}

// The daily tanks
const { TANKS } = await import('../src/arcade/ReboundDaily.js');
ok(TANKS.length >= 100 && TANKS.every(t => t.par >= 2 && t.par <= 3 && t.clams.length >= 4), `${TANKS.length} daily tanks, each with par 2–3 and at least 4 clams`);
const N = +(process.argv[2] || 12);
let good = 0;
for (let k = 0; k < N; k++) {
    const t = TANKS[Math.floor((k / N) * TANKS.length)];
    const r = solve(t, { maxDepth: t.par, angles: 96, powers: [0.35, 0.6, 0.85, 1], beam: 6 });
    if (r && r.flicks <= t.par) good++;
}
ok(good === N, `${good} of ${N} daily tanks re-solved within their par`);

if (fails) { console.log(`REBOUND FAIL — ${fails}`); process.exit(1); }
console.log('REBOUND PASS');
