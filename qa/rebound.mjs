// Rebound physics and levels, no browser: every level can be cleared within its par.
// usage: node qa/rebound.mjs
import { LEVELS, begin, flick, settle, step, solve, cleared, stars, W, H, R } from '../src/arcade/ReboundLogic.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

// The pearl stays in the tank, slows down and stops.
const lv0 = LEVELS[0];
const s = begin(lv0); flick(s, -1.2, 1); settle(lv0, s);
ok(s.x >= R && s.x <= W - R && s.y >= R && s.y <= H - R && s.vx === 0 && s.vy === 0, `a full-power flick stays in the tank and stops (at ${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
// Deterministic: the same flick ends in the same place.
const a = begin(LEVELS[4]), b = begin(LEVELS[4]);
flick(a, -1.7, 0.8); flick(b, -1.7, 0.8); settle(LEVELS[4], a); settle(LEVELS[4], b);
ok(a.x === b.x && a.y === b.y && JSON.stringify(a.popped) === JSON.stringify(b.popped), 'the same flick always ends the same way');
// Straight up on level 1 pops its clam.
const s1 = begin(lv0); flick(s1, -Math.PI / 2, 0.8); settle(lv0, s1);
ok(cleared(s1), 'First Flick: straight up pops the clam');
// A block stops a pearl going through it.
const bank = LEVELS[2], s2 = begin(bank); flick(s2, -Math.PI / 2, 1);
let through = false;
for (let i = 0; i < 2400; i++) { step(bank, s2); const [bx, by, bw, bh] = bank.blocks[0]; if (s2.x > bx && s2.x < bx + bw && s2.y > by && s2.y < by + bh) through = true; }
ok(!through, 'Bank Shot: a full-power flick straight at the block never passes through it');
ok(stars(2, 2) === 3 && stars(4, 2) === 2 && stars(5, 2) === 1, 'stars: par ★★★, par+2 ★★, more ★');

// Every level clears within its par.
for (const lv of LEVELS) {
    const r = solve(lv, { maxDepth: lv.par });
    ok(!!r && r.flicks <= lv.par, `${lv.name}: cleared in ${r ? r.flicks : '—'} flick(s), par ${lv.par}`);
    if (r) {   // and replaying the flicks really does it
        const t = begin(lv);
        r.path.forEach(([ang, p]) => { flick(t, ang, p); settle(lv, t); });
        ok(cleared(t), `   replaying those flicks clears it`);
    }
}

if (fails) { console.log(`REBOUND FAIL — ${fails}`); process.exit(1); }
console.log('REBOUND PASS');
