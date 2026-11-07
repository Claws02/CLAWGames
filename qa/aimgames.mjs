// The aim-and-shoot games and Mirror Lagoon, no browser: the rules, and every
// level within its par (Orbit Putt), every reef won
// with pearls to spare (Reef Drop), every lagoon solvable in its par (Mirror).
// usage: node qa/aimgames.mjs
import { solve, replay } from '../src/arcade/AimSearch.js';
import * as O from '../src/arcade/OrbitLogic.js';
import * as D from '../src/arcade/ReefDropLogic.js';
import * as M from '../src/arcade/MirrorLogic.js';
import * as ML from '../src/arcade/MirrorLevels.js';
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
  ok(!z.pegs[1].alive && !z.pegs[2].alive && z.pegs[3].hp <= 1, 'Reef Drop: an eel zaps the pieces near it');
  // Shelly: a pearl in her shell comes back, and scores ×3; on the sand it's gone
  const still = { pegs: [{ x: 0.5, y: 0.6, kind: 'c' }], crab: { a: 0 } }, far = { ...still, crab: { a: 0.3, ph: Math.PI / 2, period: 1000 } };
  const c1 = D.begin(still); D.shot(still, c1, Math.PI / 2, 0.2); D.settle(still, c1);
  const c2 = D.begin(far); D.shot(far, c2, Math.PI / 2, 0.2); D.settle(far, c2);
  ok(c1.last === 'crab' && c1.left === D.PEARLS && c1.score === 10 * D.CATCH_X && c2.last === 'sand' && c2.left === D.PEARLS - 1 && c2.score === 10,
     `Reef Drop: Shelly catches a pearl: it comes back and scores ×${D.CATCH_X} (${c1.score} vs ${c2.score} on the sand)`);
  // a jellyfish: springy, never pops
  const jl = { pegs: [], jellies: [[0.5, 0.7, 0.05, 0, 3]] }, j = D.begin(jl); D.shot(jl, j, Math.PI / 2, 0.2);
  let boing = false, up = false; for (let i = 0; i < 2400 && j.flying; i++) { const ev = D.step(jl, j); if (ev.jelly) boing = true; if (boing && j.vy < 0) up = true; }
  ok(boing && up && jl.jellies.length === 1, 'Reef Drop: a jellyfish bounces the pearl back up and stays');
  // moving pieces move with the reef clock, and the clock runs while you aim (not mid-drop)
  const wl = D.LEVELS.find(l => l.name === 'Turning Wheel'), ws = D.begin(wl), wp = ws.pegs.find(p => p.orbit);
  const a0 = D.pegAt(wp, ws.t); D.idle(wl, ws, 0.5); const a1 = D.pegAt(wp, ws.t);
  D.shot(wl, ws, 1, 0.5); const t0 = ws.t; D.idle(wl, ws, 1);
  ok(Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) > 0.05 && ws.t === t0, `Reef Drop: a wheel turns while you aim (moved ${Math.hypot(a1[0] - a0[0], a1[1] - a0[1]).toFixed(2)}), the clock holds mid-drop`);
  // a puffer swells on the first hit and bursts on the second, popping what's around it (wider than an eel)
  const pf = { pegs: [{ x: 0.5, y: 0.6, kind: 'p' }, { x: 0.5 + D.ZAP_R + 0.03, y: 0.6, kind: 'c' }, { x: 0.5 - 0.2, y: 0.62, kind: 'o' }] };
  const p1 = D.begin(pf); D.shot(pf, p1, Math.PI / 2, 0.2); let puffed = false; for (let i = 0; i < 2400 && p1.flying && !puffed; i++) puffed = D.step(pf, p1).puffed.length > 0;
  const p2 = D.begin(pf); p2.pegs[0].hp = 1; D.shot(pf, p2, Math.PI / 2, 0.2); let burst = 0; for (let i = 0; i < 2400 && p2.flying; i++) burst += D.step(pf, p2).burst.length;
  ok(puffed && p1.pegs[0].alive && burst === 1 && !p2.pegs[1].alive && p2.pegs[2].hp === 1, `Reef Drop: a puffer swells, then bursts, popping coral ${(D.ZAP_R + 0.03).toFixed(2)} away (past an eel's reach) and cracking an oyster`);
  // a treasure chest doubles the shot
  const ch = { pegs: [{ x: 0.5, y: 0.6, kind: 't' }, { x: 0.5, y: 0.9, kind: 'c' }], crab: { a: 0.3, ph: Math.PI / 2, period: 1000 } };
  const c3 = D.begin(ch); D.shot(ch, c3, Math.PI / 2, 0.2); D.settle(ch, c3);
  ok(c3.double && c3.score === (50 + 20) * 2, `Reef Drop: a treasure chest makes the shot score double (${c3.score})`);
  // a whirlpool: in one, out of its twin
  const wh = { pegs: [], whirls: [[0.5, 0.4, 0.2, 0.9]], crab: { a: 0 } };
  const w1 = D.begin(wh); D.shot(wh, w1, Math.PI / 2, 0.2); let warped = false, at = null; for (let i = 0; i < 2400 && w1.flying; i++) { const ev = D.step(wh, w1); if (ev.warped && !warped) { warped = true; at = [w1.x, w1.y]; } }
  ok(warped && Math.hypot(at[0] - 0.2, at[1] - 0.9) < 0.1, `Reef Drop: a whirlpool sends the pearl out of its twin (at ${at ? at.map(v => v.toFixed(2)).join(', ') : '—'})`);
  // a bubble lift pushes the pearl back up
  const lf = { pegs: [], lifts: [[0.5, 0.3, 1.1, 0.1]] }, l1 = D.begin(lf); D.shot(lf, l1, Math.PI / 2, 0.2);
  let rose = false; for (let i = 0; i < 2400 && l1.flying; i++) { D.step(lf, l1); if (l1.y > 0.6 && l1.vy < -0.3) rose = true; }
  ok(rose && !l1.flying, 'Reef Drop: a bubble lift pushes the pearl back up (and lets it go in the end)');
  // a pearl resting on something sinks through to the sand: none is ever stuck
  const cup = { pegs: [{ x: 0.47, y: 0.8, kind: 'r' }, { x: 0.53, y: 0.8, kind: 'r' }] }, cu = D.begin(cup); D.shot(cup, cu, Math.PI / 2, 0.05);
  cu.x = 0.5; cu.y = 0.75; cu.vx = 0; cu.vy = 0; let n = 0; for (; n < 120 * 10 && cu.flying; n++) D.step(cup, cu);
  ok(!cu.flying && n < 120 * 3, `Reef Drop: a pearl sitting between two rocks sinks through after a second (${(n / 120).toFixed(1)}s)`);
  // a ghost piece: there to hit while solid, passed straight through while not
  const gh = per => ({ pegs: [{ x: 0.5, y: 0.6, kind: 'c', blink: per }], crab: { a: 0.3, ph: Math.PI / 2, period: 1000 } });
  const on = gh([1000, Math.PI / 2]), off = gh([1000, -Math.PI / 2]);
  const g1 = D.begin(on), g2 = D.begin(off); D.shot(on, g1, Math.PI / 2, 0.2); D.settle(on, g1); D.shot(off, g2, Math.PI / 2, 0.2); D.settle(off, g2);
  ok(!g1.pegs[0].alive && g2.pegs[0].alive && D.solid(on.pegs[0], 0) && !D.solid(off.pegs[0], 0), 'Reef Drop: a ghost piece pops while solid; while faded the pearl goes straight through');
  // an anglerfish pulls the pearl towards its lure
  const an = { pegs: [], anglers: [[0.75, 0.8, 0.4, 4]], crab: { a: 0 } }, af = D.begin(an);
  D.shot(an, af, Math.PI / 2, 0.2);
  let pulled = 0; for (let i = 0; i < 2400 && af.flying; i++) { D.step(an, af); pulled = Math.max(pulled, af.x); }
  const base = D.begin({ pegs: [], crab: { a: 0 } }); D.shot({ pegs: [] }, base, Math.PI / 2, 0.2); let bx = 0; for (let i = 0; i < 2400 && base.flying; i++) { D.step({ pegs: [] }, base); bx = Math.max(bx, base.x); }
  ok(pulled > bx + 0.03 && D.lure(an.anglers[0], 0.75, 0.8)[0] === 0 && D.lure(an.anglers[0], 0.1, 0.1)[0] === 0, `Reef Drop: an anglerfish pulls a straight drop off course (out to x ${pulled.toFixed(2)}, against ${bx.toFixed(2)} without it), only within its reach`);
  // a starfish flings the pearl off faster than coral and never pops
  const sf = k => ({ pegs: [{ x: 0.5, y: 0.6, kind: k }], crab: { a: 0.3, ph: Math.PI / 2, period: 1000 } });
  const s1 = D.begin(sf('s')), s2 = D.begin(sf('r')); D.shot(sf('s'), s1, Math.PI / 2, 0.2); D.shot(sf('r'), s2, Math.PI / 2, 0.2);
  let up1 = 0, up2 = 0; for (let i = 0; i < 2400 && s1.flying; i++) { D.step(sf('s'), s1); up1 = Math.min(up1, s1.vy); } for (let i = 0; i < 2400 && s2.flying; i++) { D.step(sf('r'), s2); up2 = Math.min(up2, s2.vy); }
  ok(s1.pegs[0].alive && -up1 > -up2 * 1.4, `Reef Drop: a starfish flings the pearl back up faster than a rock (${(-up1).toFixed(2)} vs ${(-up2).toFixed(2)}) and stays`);
  // a golden oyster: three hits, and its pearl comes back
  const go = { pegs: [{ x: 0.5, y: 0.6, kind: 'g' }], crab: { a: 0.3, ph: Math.PI / 2, period: 1000 } }, g3 = D.begin(go);
  // (a straight drop bounces on it again and again: count its hits as they happen)
  const hits = []; let paid = false; D.shot(go, g3, Math.PI / 2, 0.2);
  for (let i = 0; i < 2400 && g3.flying && !paid; i++) { const ev = D.step(go, g3); if (ev.opened.length) hits.push(g3.pegs[0].hp); if (ev.golden.length) { hits.push(0); paid = true; } }
  ok(hits.join() === '2,1,0' && D.cleared(g3) && g3.left === D.PEARLS - 1 + 1, `Reef Drop: a golden oyster takes three hits (${hits.join(' → ')}), counts towards clearing, and pays a pearl back`);
  // a current pushes the pearl sideways
  const cu2 = { pegs: [], currents: [[0, 0.5, 1, 0.8, 3]], crab: { a: 0 } }, cc = D.begin(cu2); D.shot(cu2, cc, Math.PI / 2, 0.2);
  let drift = 0; for (let i = 0; i < 2400 && cc.flying; i++) { D.step(cu2, cc); drift = Math.max(drift, cc.x); }
  ok(drift > 0.56, `Reef Drop: a current pushes a straight drop sideways (to x ${drift.toFixed(2)})`);
  // a giant clam: shut, the pearl bounces off and the oyster inside is safe; open, it can be hit
  const cl = ph => ({ pegs: [{ x: 0.5, y: 0.7, kind: 'c' }], clams: [[0.5, 0.7, 1000, ph]], crab: { a: 0.3, ph: Math.PI / 2, period: 1000 } });
  const shutL = cl(Math.PI / 2), openL = cl(-Math.PI / 2), k1 = D.begin(shutL), k2 = D.begin(openL);
  D.shot(shutL, k1, Math.PI / 2, 0.2); let bonk = false; for (let i = 0; i < 2400 && k1.flying; i++) bonk = D.step(shutL, k1).clam || bonk;
  D.shot(openL, k2, Math.PI / 2, 0.2); D.settle(openL, k2);
  ok(bonk && k1.pegs[0].alive && !k2.pegs[0].alive, 'Reef Drop: a shut clam bounces the pearl off and keeps what\'s inside safe; open, it can be hit');
  // ---- the newer pieces (worlds 10–13) ----
  const away = { a: 0.3, ph: Math.PI / 2, period: 1000 };   // Shelly off to the side
  const drop = (lv, f) => { const st = D.begin(lv); D.shot(lv, st, Math.PI / 2, 0.2); const evs = []; for (let i = 0; i < 4000 && st.flying; i++) { const ev = D.step(lv, st); evs.push(ev); if (f) f(st, ev); } return { st, evs }; };
  // a sea urchin: the pearl is lost on it at once, keeping what it earned; urchins never pop, not even in a zap
  const ur = { pegs: [{ x: 0.5, y: 0.5, kind: 'c' }, { x: 0.5, y: 0.75, kind: 'u' }], crab: { a: 0 } };
  const u1 = drop(ur), spikedAt = u1.evs.findIndex(e => e.landed === 'urchin');
  ok(spikedAt >= 0 && u1.st.last === 'urchin' && u1.st.left === D.PEARLS - 1 && u1.st.score === 10 && u1.st.pegs[1].alive && u1.st.y < 0.8,
     `Reef Drop: a sea urchin takes the pearl on the spot (at y ${u1.st.y.toFixed(2)}, Shelly right below can't catch it), it keeps its ${u1.st.score} points, and the urchin stays`);
  const uz = { pegs: [{ x: 0.5, y: 0.6, kind: 'e' }, { x: 0.58, y: 0.62, kind: 'u' }], crab: away }, u2 = drop(uz);
  ok(!u2.st.pegs[0].alive && u2.st.pegs[1].alive, 'Reef Drop: an eel\'s zap leaves a sea urchin alone');
  // a sponge: soaks up the bounce, never pops
  const bounceUp = k => { let up = 0; drop({ pegs: [{ x: 0.5, y: 0.6, kind: k }], crab: away }, st => { up = Math.min(up, st.vy); }); return -up; };
  const upSponge = bounceUp('d'), upRock = bounceUp('r');
  ok(upSponge < upRock * 0.25, `Reef Drop: a sponge soaks up the bounce (back up at ${upSponge.toFixed(2)} against ${upRock.toFixed(2)} off a rock)`);
  // a sea mine: pops, and blows up what's near, freeing an unhit oyster outright
  const mn = { pegs: [{ x: 0.5, y: 0.6, kind: 'm' }, { x: 0.5 + D.MINE_R - 0.03, y: 0.6, kind: 'o' }, { x: 0.38, y: 0.66, kind: 'm' }, { x: 0.25, y: 0.7, kind: 'c' }], crab: away };
  const m1 = drop(mn), blasts = m1.evs.reduce((a, e) => a + e.mines.length, 0);
  ok(!m1.st.pegs[1].alive && blasts === 2 && !m1.st.pegs[3].alive, `Reef Drop: a sea mine frees an unhit oyster outright and sets off the next mine (${blasts} blasts)`);
  // an anemone: one pearl becomes two, and the drop ends only when both are down
  const an2 = { pegs: [{ x: 0.5, y: 0.5, kind: 'a' }, { x: 0.3, y: 0.9, kind: 'c' }, { x: 0.7, y: 0.9, kind: 'c' }], crab: away };
  let most = 0; const a2 = drop(an2, st => { most = Math.max(most, D.pearls(st).length); });
  const downs = a2.evs.filter(e => e.landed).length, dones = a2.evs.filter(e => e.done).length;
  ok(most === 2 && downs === 2 && dones === 1 && !a2.st.pegs[0].alive && !a2.st.flying && a2.st.left === D.PEARLS - 1,
     `Reef Drop: an anemone splits the pearl in two (${most} in the air, ${downs} came down, the drop ended once)`);
  const a3 = D.copy(D.begin(an2)); a3.extra.push({ x: 1 }); const a4 = D.copy(a3); a4.extra[0].x = 2;
  ok(a3.extra[0].x === 1, 'Reef Drop: copying a reef copies its split pearls too');
  // a barnacle: its oysters can't be hurt until it pops
  const bn = hit => ({ pegs: [{ x: 0.5, y: 0.6, kind: 'o', lock: 1 }, { x: hit ? 0.5 : 0.9, y: hit ? 0.45 : 0.3, kind: 'b', key: 1 }], crab: away });
  const b1 = drop(bn(false)), b2 = drop(bn(true));
  ok(b1.st.pegs[0].hp === 2 && b1.evs.some(e => e.sealed.length) && D.locked(b1.st, b1.st.pegs[0]) && !b2.st.pegs[1].alive && b2.st.pegs[0].hp < 2 && !D.locked(b2.st, b2.st.pegs[0]),
     'Reef Drop: a barnacle locks its oyster (hits bounce off); pop the barnacle and the oyster can be hit');
  const bz = { pegs: [{ x: 0.5, y: 0.6, kind: 'e' }, { x: 0.58, y: 0.62, kind: 'o', lock: 2 }, { x: 0.1, y: 0.2, kind: 'b', key: 2 }], crab: away }, b3 = drop(bz);
  ok(b3.st.pegs[1].hp === 2, 'Reef Drop: a locked oyster is safe from zaps too');
  // kelp: the pearl drifts through slowly
  const slowest = lv => { let t = 0; const r = drop(lv, () => { t++; }); return t; };
  const tK = slowest({ pegs: [], kelp: [[0.3, 0.4, 0.7, 0.9]], crab: away }), tN = slowest({ pegs: [], crab: away });
  ok(tK > tN * 1.5, `Reef Drop: kelp slows the pearl down (${(tK / 120).toFixed(1)}s to the sand, ${(tN / 120).toFixed(1)}s without)`);
  // a magnet shell: tugs the pearl sideways while it's level with it
  let mx = 0; drop({ pegs: [], magnets: [[0.8, 0.7, 0.4, 9]], crab: away }, st => { mx = Math.max(mx, st.x); });
  ok(mx > 0.56 && D.tug([0.8, 0.7, 0.4, 9], 0.5, 0.2) === 0, `Reef Drop: a magnet shell tugs a straight drop sideways (to x ${mx.toFixed(2)}), only when level with it`);
  // a flip portal: gravity turns upside down for a moment, then comes back
  let rose2 = false, flipped = false; const fp = drop({ pegs: [], flips: [[0.5, 0.6]], crab: away }, (st, ev) => { if (ev.flipped) flipped = true; if (flipped && st.vy < -0.2) rose2 = true; });
  ok(flipped && rose2 && !fp.st.flying, 'Reef Drop: a flip portal sends the pearl floating back up for a moment (and it comes down in the end)'); }

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
    // and no drop gets stuck (random drops at random moments land within 20 s)
    let worst = 0; const r = (k => () => (k = (k * 16807) % 2147483647) / 2147483647)(i + 9);
    for (let k = 0; k < 40; k++) { const t = D.begin(lv); D.idle(lv, t, r() * 6); D.shot(lv, t, 0.05 + r() * 3.04, r()); let n = 0; while (t.flying && n < 120 * 30) { D.step(lv, t); n++; } worst = Math.max(worst, n / 120); }
    ok(D.cleared(s) && s.left >= 5 && D.lowest(lv) <= D.CLEAR_Y + 1e-9 && worst < 20, `Reef Drop ${i + 1}. ${lv.name}: won with ${s.left} pearls left (★★★ needs 5); clear above Shelly (lowest ${D.lowest(lv).toFixed(2)}); longest drop ${worst.toFixed(1)}s`);
}
// ---- Mirror Lagoon: the rules ----
{ const [S, F, B, V] = [0, 1, 2, 3];   // ╱ — ╲ │
  const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
  ok(eq(M.bounce(S, 1, 0), [0, -1]) && eq(M.bounce(B, 1, 0), [0, 1]) && eq(M.bounce(F, 1, 0), [1, 0]) && eq(M.bounce(F, 0, 1), [0, -1]) && eq(M.bounce(V, 1, 0), [-1, 0]) && eq(M.bounce(V, 0, 1), [0, 1]),
     'Mirror: ╱ and ╲ turn the beam; a flat mirror lets it slide along, and bounces it back square on');
  // a 3×1 strip: red from the left, a lantern at the end
  const strip = (o = {}) => ({ w: 3, h: 1, sources: [{ x: -1, y: 0, d: 'r', c: 'r' }], rocks: [], glass: [], lanterns: [{ k: 2, c: 'r' }], fixed: {}, mirrors: {}, ...o });
  ok(M.trace(strip(), {}).solved, 'Mirror: a beam lights a lantern of its colour');
  ok(!M.trace(strip({ rocks: [1] }), {}).solved, 'Mirror: a rock stops it');
  ok(M.trace(strip({ glass: [{ k: 1, c: 'r' }] }), {}).solved && !M.trace(strip({ glass: [{ k: 1, c: 'b' }] }), {}).solved, 'Mirror: glass lets its own colour through and stops the other');
  ok(!M.trace(strip({ lanterns: [{ k: 2, c: 'b' }] }), {}).solved && !M.trace(strip({ lanterns: [{ k: 2, c: 'p' }] }), {}).solved, 'Mirror: a red beam doesn\'t light a blue or purple lantern');
  const two = strip({ sources: [{ x: -1, y: 0, d: 'r', c: 'r' }, { x: 3, y: 0, d: 'l', c: 'b' }], lanterns: [{ k: 1, c: 'p' }] });
  ok(M.trace(two, {}).solved, 'Mirror: red and blue together light a purple lantern');
  const bolt = strip({ fixed: { 1: V } });
  ok(!M.trace(bolt, {}).solved && M.par(bolt, {}) === Infinity, 'Mirror: a bolted mirror can\'t be turned out of the way');
  const turnIt = strip({ mirrors: { 1: V } });
  ok(M.par(turnIt, { 1: V }) === 2 && M.turns(V, F) === 2 && M.turns(V, S) === 1, `Mirror: a mirror square across the beam takes two taps (via ╱) to lie along it (par ${M.par(turnIt, { 1: V })})`); }
// ---- Mirror Lagoon: every level ----
for (const [i, lv] of ML.LEVELS.entries()) {
    const good = M.trace(lv, lv.solution).solved && !M.trace(lv, lv.mirrors).solved && M.par(lv, lv.mirrors) === lv.par;
    const pars = lv.par >= M.recipe(i).minPar;
    ok(good && pars, `Mirror Lagoon ${i + 1}: ${lv.w}×${lv.h}, ${Object.keys(lv.mirrors).length} mirrors (+${Object.keys(lv.fixed).length} bolted), ${lv.lanterns.length} lanterns, ${lv.sources.length} lighthouse${lv.sources.length > 1 ? 's' : ''}, par ${lv.par} (re-proved)`);
}

if (fails) { console.log(`AIM GAMES FAIL — ${fails}`); process.exit(1); }
console.log('AIM GAMES PASS');
