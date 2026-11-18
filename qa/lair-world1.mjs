// World 1 of Old Ink's Lair: the three teaching chambers, each played through by a player that uses only the stick, the jump button
// and the throw, and the things each one must teach (and must not let you skip).  node qa/lair-world1.mjs
import { K, P, at, TOP, DT, stickTo, run, go, hop, face, gather, chargeFor, solve } from './lair-solve.mjs';
const { BEACH, STREAM, YARD, CHAMBERS } = K;
let fails = 0;
const ok = (c, msg) => { if (msg) console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const has = (ev, t) => ev.some(e => e.type === t);
// over a wall with a coconut: stand `back` from it facing in, drop one at its foot, jump on it, steer in
const bounceIn = (s, wallR, lon, ev = []) => {
  go(s, at(wallR + 1.9, lon), ev, 0.15, 10); face(s, TOP); K.throwNut(s, 0.05); ev.push(...run(s, 1));
  const n = s.nuts.filter(x => x.state === 'rest').sort((a, b) => K.dist(a.p, s.crab.p) - K.dist(b.p, s.crab.p))[0];
  hop(s, n.p, ev); for (let i = 0; i < 120 && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, TOP)));
  return ev;
};

// ── 1. Coconut Beach: the sandcastle fort ───────────────────────────────────
const logNear = (s, lon, ahead = 0) => s.logs.map((l, i) => ({ i, lon: K.lonOf(l.p) + BEACH.logs[i].speed * ahead })).sort((a, b) => Math.abs(((a.lon - lon + 540) % 360) - 180) - Math.abs(((b.lon - lon + 540) % 360) - 180))[0];
const dAng = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// wait at the moat's edge for a log, and jump onto it as it comes
const ontoLog = (s, ev) => {
  for (let i = 0; i < 30 / DT; i++) { const l = logNear(s, K.lonOf(s.crab.p), 0.7); if (dAng(l.lon, K.lonOf(s.crab.p)) < 3) break; ev.push(...K.step(s, DT)); }
  const l = logNear(s, K.lonOf(s.crab.p), 0.7); K.jump(s);
  for (let i = 0; i < 200 && s.crab.air; i++) { const q = s.logs[l.i].p; ev.push(...K.step(s, DT, stickTo(s, q, Math.min(1, K.dist(s.crab.p, q) / 0.4)))); }
  return l.i;
};
const beach = (opt = {}) => {
  const s = K.create(BEACH), ev = [], note = {};
  gather(s, ev); note.got = s.crab.nuts;
  // 1. break the cracked wall: throw, pick up, throw again
  for (let k = 0; k < 4 && !(s.dmg.crack >= 2); k++) {
    go(s, at(16.8, 0), ev); face(s, TOP); K.throwNut(s, chargeFor(s, at(14.5, 0))); ev.push(...run(s, 1.5));
    if (!(s.dmg.crack >= 2)) gather2(s, ev);
  }
  note.broke = s.dmg.crack >= 2; gather2(s, ev); note.n1 = s.crab.nuts;
  if (opt.stopAtMoat) return { s, ev, note };
  // 2. across the moat on a log
  go(s, at(14.25, 0), ev, 0.12, 6); const li = ontoLog(s, ev); note.onLog = !s.falls && Math.abs(s.crab.h - 0.35) < 0.05;
  for (let i = 0; i < 2 / DT; i++) ev.push(...K.step(s, DT));
  K.jump(s); const lon = K.lonOf(s.crab.p); for (let i = 0; i < 200 && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, at(9.4, lon + 6))));
  note.crossed = K.dist(s.crab.p, TOP) < 10 && !s.falls;
  if (opt.stopAtBank) return { s, ev, note };
  // 3. the block to the wall, onto it, onto the wall, into the court
  const b = s.blocks[0]; const bl = K.lonOf(b.p);
  go(s, at(9.9, K.lonOf(s.crab.p)), ev, 0.15, 3); for (let k = 1; k <= 8; k++) go(s, at(9.9, K.lonOf(s.crab.p) + (((bl + 14 - K.lonOf(s.crab.p) + 540) % 360) - 180) / (9 - k)), ev, 0.2, 3); go(s, at(9.95, bl), ev, 0.12, 4);
  for (let i = 0; i < 4 / DT; i++) ev.push(...K.step(s, DT, stickTo(s, TOP)));
  note.blockAt = K.dist(b.p, TOP);
  go(s, at(K.dist(b.p, TOP) + 1.25, K.lonOf(b.p)), ev, 0.12, 4); hop(s, b.p, ev); note.onBlock = Math.abs(s.crab.h - 1) < 0.05;
  hop(s, at(8, K.lonOf(b.p)), ev); note.onWall = Math.abs(s.crab.h - 2) < 0.05;
  go(s, at(7.2, K.lonOf(s.crab.p)), ev, 0.2, 3); for (let i = 0; i < 60 && s.crab.air; i++) ev.push(...K.step(s, DT));
  note.inCourt = K.dist(s.crab.p, TOP) < 8 && s.crab.h < 0.05; note.inN = s.crab.nuts;
  // 4. the plate, then the bullseye inside the red gate, then run in through the blue one
  const pl = BEACH.plates[0], tg = BEACH.targets[0];
  go(s, at(6.6, 40), ev); face(s, pl.p); K.throwNut(s, chargeFor(s, pl.p)); ev.push(...run(s, 1.2)); note.red = !!s.held.red;
  go(s, at(4.3, -40), ev); face(s, tg.p); K.throwNut(s, chargeFor(s, tg.p, 1.1)); ev.push(...run(s, 0.8)); note.blue = !!s.open.blue;
  go(s, TOP, ev, 0.3, 6);
  return { s, ev, note };
};
function gather2(s, ev) { for (let k = 0; k < 6 && s.crab.nuts < K.CARRY; k++) { const n = s.nuts.filter(x => x.state === 'rest' && K.dist(x.p, TOP) > 14.6).sort((a, b) => K.dist(a.p, s.crab.p) - K.dist(b.p, s.crab.p))[0]; if (!n) break; go(s, n.p, ev, 0.3, 8); } }
{ const { s, ev, note } = beach();
  ok(note.got === 3, '1. COCONUT BEACH: walk into the coconuts under the palm: three in the claws');
  ok(note.broke && has(ev, 'crack') && has(ev, 'break') && note.n1 === 3, '   two throws break the cracked sandcastle wall, and the coconuts fall back where you can pick them up');
  ok(note.onLog && note.crossed, '   wait for a log, jump on, ride it, jump off: across the deep moat');
  ok(note.blockAt < 8.8 && note.onBlock && note.onWall && note.inCourt && note.inN === 3, `   push the sand block to the court wall (it stops there, ${note.blockAt.toFixed(1)}), jump on it, onto the wall, down into the court with all three`);
  ok(note.red && note.blue && s.won && s.falls === 0, `   a coconut on the plate drops the red gate, one in the bullseye the blue one: the pearl (${s.t.toFixed(0)} s, no falls)`);
  // the pieces, each doing what it says
  { const a = K.create(BEACH); a.crab.p = at(16.2, 0).slice(); for (let i = 0; i < 90; i++) K.step(a, DT, stickTo(a, TOP));
    ok(K.dist(a.crab.p, TOP) > 15, '   the cracked wall stands until it is broken'); }
  { const a = K.create(BEACH); a.crab.nuts = 1; a.crab.p = at(16.8, 0).slice(); face(a, TOP); K.throwNut(a, chargeFor(a, at(14.5, 0))); const e = run(a, 1.5);
    ok(has(e, 'crack') && !has(e, 'break') && a.dmg.crack === 1, '   one hit cracks it, the second breaks it'); }
  { const a = K.create(BEACH); a.crab.nuts = 2; a.crab.p = at(15.9, 90).slice(); const e = run(a, 2, stickTo(a, TOP)); for (let i = 0; i < 120; i++) e.push(...K.step(a, DT, stickTo(a, TOP)));
    ok(has(e, 'vine-full') && K.dist(a.crab.p, TOP) > 15.3, '   the vines: with coconuts in the claws you can\'t climb (and it says so)');
    const b = K.create(BEACH); b.crab.p = at(15.9, 90).slice(); const e2 = []; for (let i = 0; i < 3 / DT && b.crab.h < 2.9; i++) e2.push(...K.step(b, DT, stickTo(b, TOP)));
    for (let i = 0; i < 0.4 / DT; i++) e2.push(...K.step(b, DT, stickTo(b, TOP, 0.3)));
    ok(has(e2, 'climb') && Math.abs(b.crab.h - 3) < 0.05 && Math.abs(K.dist(b.crab.p, TOP) - 15) < 0.5, '   with empty claws the crab climbs the vines and stands on top of the wall');
    go(b, at(15, 130), e2, 0.2, 6); ok(e2.some(x => x.type === 'gold') && b.gold.includes(1) && Math.abs(b.crab.h - 3) < 0.05, '   and walks along the top to a golden shell'); }
  { const a = K.create(BEACH); a.crab.p = at(14.3, 30).slice(); a.dmg.crack = 2; const e = run(a, 1.5, stickTo(a, TOP));
    ok(has(e, 'sink') && a.falls === 1, '   walking into the moat: deep water, back to the flag'); }
  { const a = K.create(BEACH); a.dmg.crack = 2; a.crab.nuts = 1; a.crab.p = at(14.6, 20).slice(); face(a, TOP); K.throwNut(a, 0.3); const e = run(a, 4);
    ok(has(e, 'lost') && has(e, 'washed'), '   a coconut thrown in the moat sinks, and washes up under the palm'); }
  { const { s: a } = beach({ stopAtBank: true }); let top = 0; go(a, at(8.9, 100)); K.jump(a); for (let i = 0; i < 90; i++) { K.step(a, DT, stickTo(a, TOP)); top = Math.max(top, a.crab.h); }
    ok(K.dist(a.crab.p, TOP) > 8.3, `   from the ground a jump (${top.toFixed(1)}) doesn't get onto the 2-high court wall: the block (or a coconut bounce) does`); }
  { const a = K.create(BEACH); a.open.red = true; a.crab.p = at(6.2, 180).slice(); go(a, at(9.4, 180), [], 0.3, 4);
    ok(K.dist(a.crab.p, TOP) > 8, '   a slide at the back of the court lets you out (never stuck inside)'); }
  { const a = K.create(BEACH); a.held.red = true; a.crab.nuts = 1; const tg = BEACH.targets[0]; a.crab.p = at(4.3, -40).slice(); face(a, tg.p); K.throwNut(a, chargeFor(a, tg.p, 1.1)); run(a, 0.8);
    const opened = !!a.open.blue; const e = run(a, 6.5); const n = a.nuts.find(x => x.state === 'rest');
    ok(opened && !a.open.blue && has(e, 'timeout') && n, '   the blue gate stays down for six seconds, then shuts, and the bullseye drops the coconut'); }
  { // the bug Caleb hit: standing on the plate, a coconut thrown in through the open red gate, then stepping off
    const a = K.create(BEACH); a.crab.nuts = 1; a.crab.p = BEACH.plates[0].p.slice(); run(a, 0.1); face(a, TOP); K.throwNut(a, 0.3); run(a, 1.2);
    go(a, at(6.5, 60), [], 0.2, 3); const e = run(a, 0.5); const n = a.nuts.find(x => x.state === 'rest');
    ok(n && K.dist(n.p, TOP) > 3.2 && has(e, 'nudge'), `   a coconut left inside a gate that shuts rolls out to its foot (${n ? K.dist(n.p, TOP).toFixed(1) : '?'} from the pearl): never lost`); }
  { const a = K.create(BEACH); a.crab.nuts = 1; a.crab.p = at(17.7 + 1.3, -42).slice(); face(a, BEACH.palm); K.throwNut(a, 0.0); run(a, 1.2); const n = a.nuts.find(x => x.state === 'rest' && K.dist(x.p, BEACH.palm) < 1.2 && K.dist(x.p, a.crab.p) < 2.5);
    let got = false; if (n) { go(a, P.walk(n.p, P.toward(BEACH.palm, n.p), 0.9 / K.R), [], 0.1, 3); const e = hop(a, n.p); for (let i = 0; i < 90 && a.crab.air; i++) e.push(...K.step(a, DT, stickTo(a, BEACH.palm, 0.6))); got = a.gold.includes(0); }
    const b = K.create(BEACH); b.crab.p = at(17.7 + 0.3, -42).slice(); K.jump(b); run(b, 1);
    ok(got && !b.gold.includes(0), '   the golden shell over the palm: a bounce on a coconut reaches it, a jump doesn\'t'); } }

// ── 2. Bubble Stream: the river valley on three levels ──────────────────────
// the throw (an aim turned by `a` degrees from facing `at`, and a charge) that the simulation says does `want`; the state is copied
const clone = s => ({ ...s, crab: { ...s.crab }, nuts: s.nuts.map(n => ({ ...n })), boss: s.boss ? { ...s.boss } : null, gull: null, back: [], open: { ...s.open }, held: { ...s.held }, plug: { ...s.plug }, dmg: { ...s.dmg }, stuckIn: { ...s.stuckIn }, gold: [...s.gold], blocks: s.blocks.map(b => ({ ...b })) });
const turnTo = (s, p, a) => { face(s, p); const c = s.crab, side = P.cross(c.p, c.face), r = a * Math.PI / 180; c.face = P.tangent(c.p, P.mix(c.face, side, Math.cos(r), Math.sin(r))); };
const aimFor = (s, p, want, { a0 = -30, a1 = 30, da = 2, secs = 3 } = {}) => {
  for (let ch = 0; ch <= 1.001; ch += 0.05) for (let a = a0; a <= a1; a += da) { const q = clone(s); turnTo(q, p, a); if (!K.throwNut(q, ch)) return null; const e = run(q, secs); if (want(q, e)) return { a, ch }; }
  return null;
};
const throwAim = (s, p, f, ev, secs = 2.5) => { turnTo(s, p, f.a); K.throwNut(s, f.ch); ev.push(...run(s, secs)); };
const SA = () => STREAM.vents[0], SB = () => STREAM.vents[1];
const SPOT = () => STREAM.spots[0], BANKP = () => STREAM.spots[0].via, PILLARP = () => STREAM.plates[0].p, COVEP = () => STREAM.targets[0].p, LANE_INP = () => STREAM.spots[0].p;
// walk round the terrace at distance d from the pearl to longitude lon, in steps (never straight across the mesa)
const ringTo = (s, d, lon, ev = []) => { go(s, at(d, K.lonOf(s.crab.p)), ev, 0.2, 4); for (let k = 0; k < 40; k++) { const dl = ((lon - K.lonOf(s.crab.p) + 540) % 360) - 180; if (Math.abs(dl) < 2) break; go(s, at(d, K.lonOf(s.crab.p) + Math.sign(dl) * Math.min(12, Math.abs(dl))), ev, 0.25, 4); } return ev; };
const stream = (opt = {}) => {
  const s = K.create(STREAM), ev = [], note = {};
  gather(s, ev);
  // 1. off the jelly pad onto the shelf and into vent A
  note.b0 = K.blowing(s).id;
  go(s, at(18.0, 50), ev, 0.12, 10); const fA = aimFor(s, SA().p, q => !!q.plug.A, { a0: -10, a1: 10 }); if (fA) throwAim(s, SA().p, fA, ev);
  note.plug = !!s.plug.A; note.viaPad = ev.some(e => e.type === 'pad'); note.b1 = K.blowing(s) && K.blowing(s).id;
  if (opt.stopAtB) return { s, ev, note };
  // 2. vent B over the river onto the terrace
  go(s, SB().p, ev, 0.2, 10);
  for (let i = 0; i < 4 / DT && s.crab.h < SB().lift - 0.2; i++) ev.push(...K.step(s, DT));
  for (let i = 0; i < 4 / DT && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, at(8.4, 0))));
  note.terrace = Math.abs(s.crab.h - 3.8) < 0.05 && !s.falls; note.tN = s.crab.nuts;
  if (opt.stopAtTerrace) return { s, ev, note };
  // 3. the bank shot from the open end of the lane
  ringTo(s, 8.6, K.lonOf(SPOT().p), ev); go(s, SPOT().p, ev, 0.1, 6);
  const fB = aimFor(s, BANKP(), q => !!q.open.green, { a0: -12, a1: 12, da: 1, secs: 2.5 });
  if (fB) throwAim(s, BANKP(), fB, ev); note.green = !!s.open.green; note.banked = (() => { const ti = ev.findIndex(e => e.type === 'target'), bi = ev.slice(0, ti).map(e => e.type).lastIndexOf('bank'); return ti >= 0 && bi >= 0; })();
  if (opt.stopAtGreen) return { s, ev, note };
  // 4. up the ramp to the mesa, and the pillar's plate (knock the hanging coconut down onto it)
  ringTo(s, 8.8, 0, ev); ringTo(s, 8.8, -100, ev); ringTo(s, 8.8, 180, ev); go(s, at(6.6, 180), ev, 0.15, 6); go(s, at(5.4, 180), ev, 0.15, 6); go(s, at(3.6, 180), ev, 0.2, 6);
  note.mesa = Math.abs(s.crab.h - 7.5) < 0.05;
  ringTo(s, 2.6, -100, ev);
  let fP = aimFor(s, PILLARP(), (q, e) => !!q.held.gold && e.some(x => x.type === 'knock'), { a0: -12, a1: 12, da: 2, secs: 3 });
  if (fP) throwAim(s, PILLARP(), fP, ev, 3); note.gold = !!s.held.gold; note.knock = ev.some(e => e.type === 'knock');
  go(s, TOP, ev, 0.3, 8);
  return { s, ev, note };
};
{ const { s, ev, note } = stream();
  ok(note.b0 === 'A' && note.plug && note.viaPad && note.b1 === 'B', '2. BUBBLE STREAM: a coconut off the jelly pad bounces up onto the shelf and plugs vent A; now vent B blows');
  ok(note.terrace && note.tN === 2, '   vent B lifts the crab over the deep river; steering, it lands on the terrace (3.8 up) with two coconuts');
  ok(note.green && note.banked, '   from the painted spot, a coconut thrown at the yellow bumper glances down the chute into the bullseye: the green fence round the mesa drops');
  ok(note.mesa, '   up the ramp onto the mesa (7.5 up)');
  ok(note.gold && note.knock, '   a coconut knocks the hanging one loose; it drops onto the pillar\'s plate and the gold fence drops');
  ok(s.won && s.falls === 0, `   the pearl (${s.t.toFixed(0)} s, no falls)`);
  // each piece does what it says, and nothing skips it
  { let direct = 0, any = 0; for (let d = 16.8; d <= 19; d += 0.55) for (let lon = 50; lon <= 70; lon += 4) for (let ch = 0; ch <= 1; ch += 0.1) { const q = K.create(STREAM); q.crab.p = at(d, lon).slice(); q.crab.nuts = 1; face(q, SA().p); K.throwNut(q, ch); const e = run(q, 3); if (q.plug.A) { any++; if (!e.some(x => x.type === 'pad')) direct++; } }
    ok(any > 0 && direct === 0, `   vent A is too high to throw to: of the throws from the beach that plug it (${any}), every one bounced off the jelly pad`); }
  { const q = K.create(STREAM); q.crab.p = STREAM.pads[1].p.slice(); let top = 0; const e = []; for (let i = 0; i < 90; i++) { e.push(...K.step(q, DT)); top = Math.max(top, q.crab.h); }
    ok(e.some(x => x.type === 'pad') && top > 2.6 && top < 3.4, `   a crab on the jelly pad bounces (${top.toFixed(1)} up): high enough for the post (3), not for the terrace (3.8)`);
    const r = K.create(STREAM); r.crab.p = at(17.4, 110).slice(); r.crab.f = P.tangent(r.crab.p, TOP); const e2 = []; go(r, STREAM.pads[1].p, e2, 0.15, 3); for (let i = 0; i < 120; i++) e2.push(...K.step(r, DT, r.crab.vh < 0 && r.crab.h > 2.2 ? stickTo(r, STREAM.posts[1].p, 0.8) : { x: 0, y: 0 }));
    ok(r.gold.includes(0) && Math.abs(r.crab.h - 3) < 0.05, '   bounce on it and steer onto the post: a golden shell'); }
  { const q = K.create(STREAM); q.crab.p = SB().p.slice(); const e = run(q, 2); ok(!e.some(x => x.type === 'lift') && e.some(x => x.type === 'calm'), '   vent B is calm while A blows (and says so)'); }
  { const q = K.create(STREAM); q.crab.p = at(12.7, 30).slice(); const e = run(q, 1.5, stickTo(q, TOP)); ok(e.some(x => x.type === 'sink'), '   the river is deep: wading in, back to the flag'); }
  { const { s: q } = stream({ stopAtTerrace: true }); q.crab.nuts = 1; go(q, at(6.8, 0), [], 0.15, 6); face(q, TOP); K.throwNut(q, 0.02); run(q, 1); const n = q.nuts.filter(x => x.state === 'rest').sort((a, b) => K.dist(a.p, q.crab.p) - K.dist(b.p, q.crab.p))[0];
    let top = 0; if (n) { go(q, P.walk(n.p, P.toward(TOP, n.p), 0.9 / K.R), [], 0.1, 3); hop(q, n.p); for (let i = 0; i < 120 && q.crab.air; i++) { K.step(q, DT, stickTo(q, TOP)); top = Math.max(top, q.crab.h); } }
    ok(n && K.floorAt(q, q.crab.p) < 4 && top < 7.5, `   from the terrace a bounce on a coconut (${top.toFixed(1)} up) doesn't get onto the mesa (7.5): the ramp is the way`); }
  { const { s: q } = stream({ stopAtTerrace: true }); ringTo(q, 8.8, 180); go(q, at(6.6, 180), [], 0.15, 6); go(q, at(3.6, 180), [], 0.15, 6);
    ok(K.dist(q.crab.p, TOP) > 4.3 && !q.won, '   the green fence runs round the whole mesa: up the ramp, it stops the crab at the top until the bullseye holds it open'); }
  { // nothing gets into the bullseye except off the bumper: every throw from anywhere on the terrace
    let direct = 0, hits = 0; for (let d = 4.8; d <= 9.4; d += 0.6) for (let lon = 40; lon <= 150; lon += 7) { const p0 = at(d, lon); if (STREAM.pools.some(x => K.dist(p0, x.p) < x.r + 0.1)) continue;
      for (let a = -20; a <= 20; a += 8) for (let ch = 0; ch <= 1; ch += 0.2) { const q = K.create(STREAM); q.cp = 1; q.crab.p = p0.slice(); q.crab.h = 3.8; q.crab.nuts = 1; turnTo(q, COVEP(), a); K.throwNut(q, ch); const e = run(q, 2.5); const ti = e.findIndex(x => x.type === 'target'); if (ti >= 0) { hits++; if (!e.slice(0, ti).some(x => x.type === 'bank')) direct++; } } }
    ok(direct === 0, `   thrown straight at the bullseye from anywhere on the terrace, nothing gets in (${hits} that did came off the bumper first)`);
    let fromSpot = 0, tries = 0; for (let a = -10; a <= 10; a += 1) for (let ch = 0.3; ch <= 1; ch += 0.05) { tries++; const q = K.create(STREAM); q.cp = 1; q.crab.p = SPOT().p.slice(); q.crab.h = 3.8; q.crab.nuts = 1; turnTo(q, BANKP(), a); K.throwNut(q, ch); run(q, 2.5); if (q.open.green) fromSpot++; }
    ok(fromSpot >= 15, `   from the painted spot, aimed at the bumper: ${fromSpot} of ${tries} throws land it (the aim turns green on those)`);
    const q = K.create(STREAM); q.cp = 1; q.crab.p = SPOT().p.slice(); q.crab.h = 3.8; turnTo(q, BANKP(), 0); let green = 0; for (let ch = 0.3; ch <= 1; ch += 0.05) if (K.aim(q, ch).hit) green++;
    ok(green > 0, `   the aim preview knows when a throw will end in the bullseye (${green} charges straight at the bumper)`); }
  { const q = K.create(STREAM); q.cp = 1; q.crab.p = at(8.6, 100).slice(); q.crab.h = 3.8; const e = run(q, 1.5, stickTo(q, STREAM.pools[1].p)); ok(e.some(x => x.type === 'sink'), '   the pool round the bumper and the bullseye is deep: in it, back to the flag'); }
  { const q = K.create(STREAM); q.cp = 1; q.crab.p = at(5.0, 40).slice(); q.crab.h = 3.8; for (const [p0, h0] of [[STREAM.pools[0].p, 4.5], [P.walk(COVEP(), P.toward(COVEP(), BANKP()).map(x => -x), 0.84 / K.R), 4.0]]) q.nuts.push({ id: 900 + q.nuts.length, p: p0.slice(), d: P.tangent(p0, TOP), v: 0.05, h: h0, vh: 0, state: 'fly', age: 9, still: 0 }); run(q, 2);
    const back = q.nuts.filter(x => x.id >= 900); ok(back.length === 2 && back.every(x => x.state === 'rest' && K.dist(x.p, LANE_INP()) < 0.5), '   a coconut that falls in the pool or behind the bullseye washes back up at the painted spot (never out of reach)'); }
  { let fromTerr = 0; for (let d = 5.6; d <= 9.4; d += 0.6) for (let lon = -100; lon <= -20; lon += 10) for (let ch = 0; ch <= 1; ch += 0.1) { if (K.dist(at(d, lon), PILLARP()) < 0.8) continue; const q = K.create(STREAM); q.cp = 1; q.crab.p = at(d, lon).slice(); q.crab.h = 3.8; q.crab.nuts = 1; face(q, PILLARP()); K.throwNut(q, ch); run(q, 3); if (q.held.gold) fromTerr++; }
    ok(fromTerr === 0, '   from the terrace nothing reaches the pillar\'s plate: it\'s a job for the mesa'); }
  { const q = K.create(STREAM); q.cp = 1; q.open.green = true; q.crab.p = at(2.2, 0).slice(); q.crab.h = 7.5; q.crab.nuts = 1; face(q, TOP); K.throwNut(q, 0.02); run(q, 1); const n = q.nuts.find(x => x.state === 'rest' && K.dist(x.p, TOP) > 1.8);
    let top = 0; if (n) { go(q, P.walk(n.p, P.toward(TOP, n.p), 0.9 / K.R), [], 0.1, 3); hop(q, n.p); for (let i = 0; i < 120 && q.crab.air; i++) { K.step(q, DT, stickTo(q, TOP)); top = Math.max(top, q.crab.h); } }
    ok(!q.won && K.dist(q.crab.p, TOP) > 1.8, `   the gold fence can't be bounced over (${top.toFixed(1)} up)`); }
  { const q = K.create(STREAM); q.crab.nuts = 3; let opened = false; for (let i = 0; i < 40 / DT && !opened; i++) { const tg = K.targetAt(q, STREAM.targets[1]); if (i % 30 === 0 && q.crab.nuts > 0) { q.crab.p = at(13.6, K.lonOf(tg.p) - 8).slice(); const f = aimFor(q, tg.p, x => !!x.open.cage, { a0: -16, a1: 16, da: 4, secs: 2 }); if (f) { throwAim(q, tg.p, f, [], 0.1); } } K.step(q, DT); opened = !!q.open.cage; }
    const before = K.lonOf(K.targetAt(q, STREAM.targets[1]).p); run(q, 2); const after = K.lonOf(K.targetAt(q, STREAM.targets[1]).p);
    ok(opened && Math.abs(after - before) > 10, '   the bullseye riding a log can be hit (time it); the coconut rides on with it and the cage stays open');
    go(q, at(16.6, -100), [], 0.2, 20); go(q, at(16, -100), [], 0.2, 4); ok(q.gold.includes(1), '   inside the cage: a golden shell'); }
  { const q = K.create(STREAM); const e = []; q.plug.A = 99; q.crab.p = SB().p.slice(); for (let i = 0; i < 4 / DT && q.crab.h < SB().lift - 0.2; i++) e.push(...K.step(q, DT)); for (let i = 0; i < 4 / DT && q.crab.air; i++) e.push(...K.step(q, DT, stickTo(q, at(11.6, 6))));
    ok(q.gold.includes(2), '   riding vent B, steer through the golden shell over the river'); } }
// taking a coconut back out of a bullseye: walk into it, and its gate shuts again
{ const q = K.create(YARD); q.crab.nuts = 1; const tg = YARD.targets[0]; q.crab.p = at(11.9, 8).slice(); face(q, tg.p); K.throwNut(q, chargeFor(q, tg.p, 1.1)); run(q, 1.2); const was = !!q.open.yard;
  go(q, tg.p, [], 0.3, 6); const e = run(q, 0.3);
  ok(was && !q.open.yard && q.crab.nuts === 1, '   (any chamber) walk into a bullseye and you take its coconut back: its gate shuts again'); }

// ── 3. Gull Yard ────────────────────────────────────────────────────────────
const yard = () => {
  const s = K.create(YARD), ev = [], note = {};
  gather(s, ev);
  const tg = YARD.targets[0]; go(s, at(11.9, 8), ev); face(s, tg.p); K.throwNut(s, chargeFor(s, tg.p, 1.1)); ev.push(...run(s, 1.2)); note.gate = !!s.open.yard;
  go(s, at(8.4, 0), ev, 0.2, 8); note.inYard = s.cp === 1 && s.crab.nuts === 2;
  const r = solve({ s, from: 'shelf', stopAtBoss: true }); ev.push(...r.ev); note.over = r.note.over;
  go(s, at(2.5, -100), ev, 0.2, 6); go(s, TOP, ev, 0.3, 8);
  return { s, ev, note };
};
{ const { s, ev, note } = yard();
  ok(note.gate && note.inYard, '3. GULL YARD: a coconut into the beach bullseye opens the yard: in with two');
  ok(note.over && has(ev, 'stomp'), '   the gull dives, the crab steps aside and jumps on its back: bounced over the step with both coconuts');
  ok(has(ev, 'press') && has(ev, 'target') && s.won && s.falls === 0, `   one on the plate, one in the bullseye: the pearl (${s.t.toFixed(0)} s, no falls)`);
  // the gull is the answer: over the step on a coconut, the crab is inside with one, and two jobs need two
  const a = K.create(YARD); a.open.yard = true; a.cp = 1; a.gull = null; a.crab.nuts = 2; a.nuts = []; a.crab.p = at(8, 40).slice(); bounceIn(a, 5.6, 40);
  ok(K.dist(a.crab.p, TOP) < 5.6 && a.crab.nuts === 1, '   over the step on a coconut you are in with one coconut: not enough for the plate and the bullseye');
  const b = K.create(YARD); b.open.yard = true; b.cp = 1; b.crab.p = at(7.2, 60).slice(); b.crab.nuts = 1; b.gull.cool = 0; const e = run(b, 12);
  ok(has(e, 'steal') || has(e, 'gull-dive'), '   stand in the yard and the gull comes for you'); }

ok(CHAMBERS.map(c => c.id).join() === 'beach,stream,yard,stair' && CHAMBERS[3].boss && K.ALL_OPEN, 'World 1 is: Coconut Beach, Bubble Stream, Gull Yard, then the Drowned Stair with Old Ink; all open while testing');
console.log(fails ? `\nWORLD 1 FAIL (${fails})` : '\nWORLD 1 PASS');
process.exit(fails ? 1 : 0);
