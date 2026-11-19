// World 1 of Old Ink's Lair: the three teaching chambers, each played through by a player that uses only the stick, the jump button
// and the throw, and the things each one must teach (and must not let you skip).  node qa/lair-world1.mjs
import { K, P, at, TOP, DT, stickTo, run, go, hop, face, gather, chargeFor, solve, fight } from './lair-solve.mjs';
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
  ok(note.green && note.banked, '   from the painted spot, a coconut thrown at the pink bumper glances down the chute into the bullseye: the green fence round the mesa drops');
  ok(K.STREAM.rings.some(w => w.look === 'glass') && K.STREAM.bars.filter(b => b.kind === 'chute').every(b => b.look === 'glass') && K.STREAM.signs.some(s => s.kind === 'bank'), '   the bullseye sits behind glass (you see it, but can\'t throw straight at it), and a picture sign at the spot shows the bounce');
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
{ const q = K.create(YARD); q.crab.nuts = 1; const tg = YARD.targets[0]; q.crab.p = at(17.4, 22).slice(); face(q, tg.p); K.throwNut(q, chargeFor(q, tg.p, 1.1)); run(q, 1.5); const was = !!q.open.net;
  go(q, tg.p, [], 0.3, 6); const e = run(q, 0.3);
  ok(was && !q.open.net && q.crab.nuts === 1, '   (any chamber) walk into a bullseye and you take its coconut back: its gate shuts again'); }

// ── 3. The Gull's Roost ────────────────────────────────────────────────────────────
// ── Chamber 3: The Gull's Roost ─────────────────────────────────────────────
const roost = (log = () => {}) => {
  const Y = YARD, s = K.create(Y), ev = [], note = {}, has = t => ev.some(e => e.type === t);
  for (let k = 0; k < 6 && s.crab.nuts < 3; k++) { const n = s.nuts.find(x => x.state === 'rest' && K.dist(x.p, Y.palm) < 2); if (!n) break; go(s, n.p, ev, 0.3); }
  note.got = s.crab.nuts;
  // 1. the hut's bullseye: the net gate
  const tg = Y.targets[0]; go(s, at(17.4, 22), ev, 0.2); face(s, tg.p); K.throwNut(s, chargeFor(s, tg.p, 1.1)); ev.push(...run(s, 1.5)); note.net = !!s.open.net;
  // 2. up the ramp onto the lower boardwalk, by the deck's edge
  go(s, at(14.6, 0), ev, 0.2, 8); go(s, at(10.4, 0), ev, 0.15, 10); note.board = Math.abs(s.crab.h - 1) < 0.05;      // (a lob from back here clears the deck's edge)
  log('board', note, s.crab.nuts, s.gull.state, s.gull.loot);
  // 3. hit the gull (its stolen coconut drops): search throws on copies of the game for one that stuns it
  for (let tries = 0; tries < 40 && s.gull.loot; tries++) {
    let best = null;
    for (let da = -40; da <= 40 && !best; da += 4) for (let ch = 0.3; ch <= 1.001 && !best; ch += 0.05) {
      const q = structuredClone(s); q.crab.face = P.tangent(q.crab.p, P.walk(q.gull.p, P.tangent(q.gull.p, P.cross(TOP, q.gull.p)), 0)); 
      const f0 = P.toward(q.crab.p, q.gull.p), rt = P.cross(f0, q.crab.p), a = da * Math.PI / 180; q.crab.face = P.norm(P.mix(f0, rt, Math.cos(a), Math.sin(a)));
      K.throwNut(q, ch); const e = run(q, 1.6); if (e.some(x => x.type === 'stun' && x.by === 'nut')) best = { da, ch };
    }
    if (best) { const f0 = P.toward(s.crab.p, s.gull.p), rt = P.cross(f0, s.crab.p), a = best.da * Math.PI / 180; s.crab.face = P.norm(P.mix(f0, rt, Math.cos(a), Math.sin(a))); K.throwNut(s, best.ch); ev.push(...run(s, 1.6)); }
    else ev.push(...run(s, 0.3));
  }
  note.stunned = has('stun') && !s.gull.loot; note.dropped = s.nuts.some(n => n.state === 'rest' && K.dist(n.p, TOP) < 8.6 && n.h > 2);
  log('stun', note, s.crab.nuts);
  // 4. wait for the dive; step aside; jump on its back as it lands; bounce up onto the deck
  go(s, at(9.3, K.lonOf(s.crab.p)), ev, 0.15, 6); const spot = s.crab.p.slice();
  for (let i = 0; i < 25 / DT && s.gull.state !== 'dive'; i++) ev.push(...K.step(s, DT, stickTo(s, spot, Math.min(1, K.dist(s.crab.p, spot) / 0.4))));
  const aside = at(K.dist(s.crab.p, TOP) + 0.2, K.lonOf(s.crab.p) + 14);
  for (let i = 0; i < 2 / DT && s.gull.state === 'dive'; i++) ev.push(...K.step(s, DT, stickTo(s, aside)));
  log('dive done', s.gull.state, K.dist(s.crab.p, s.gull.p).toFixed(2), s.crab.nuts);
  if (s.gull.state === 'ground') { const gp = s.gull.p.slice(); hop(s, gp, ev); for (let i = 0; i < 3 / DT && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, at(7.6, K.lonOf(gp))))); }
  note.deck = Math.abs(s.crab.h - 3.2) < 0.05 && K.dist(s.crab.p, TOP) < 8.6; note.stomp = has('stomp');
  log('deck', note, s.crab.nuts);
  // 5. the dropped coconut
  const dn = s.nuts.find(n => n.state === 'rest' && K.dist(n.p, TOP) < 8.6 && n.h > 2); if (dn) go(s, dn.p, ev, 0.3, 12);
  note.nuts = s.crab.nuts;
  // 6. the heavy plate: stand on it till the gull dives, step off toward the bridge; it lands on the plate; across
  const pl = Y.plates[0]; go(s, pl.p, ev, 0.2, 12);
  for (let i = 0; i < 30 / DT && s.gull.state !== 'dive'; i++) ev.push(...K.step(s, DT, stickTo(s, pl.p, Math.min(1, K.dist(s.crab.p, pl.p) / 0.3))));
  for (let i = 0; i < 2 / DT && s.gull.state === 'dive'; i++) ev.push(...K.step(s, DT, stickTo(s, at(5.4, 2))));
  note.heavy = !!s.held.bridge; log('heavy', note, s.gull.state);
  go(s, at(4.9, 0), ev, 0.15, 6); go(s, at(2.3, 0), ev, 0.15, 6); note.roost = Math.abs(s.crab.h - 5) < 0.05;
  // 7. a coconut onto the nest's plate; the pearl
  const np = Y.plates[1]; go(s, at(2.2, 0), ev, 0.15, 6); face(s, np.p); K.throwNut(s, chargeFor(s, np.p)); ev.push(...run(s, 1.5)); note.nest = !!s.held.nest;
  go(s, TOP, ev, 0.3, 8);
  return { s, ev, note };
};
{ const { s, ev, note } = roost();
  ok(note.net && note.board, "3. THE GULL'S ROOST: a coconut into the fishing hut's bullseye raises the net gate; up the ramp onto the boardwalk");
  ok(note.stunned && note.dropped, '   the gull holds a stolen coconut (and won\'t dive while it does): hit it with one and it drops it on the deck');
  ok(note.deck && note.stomp, '   it dives; step aside, jump on its back as it lands: bounced up onto the deck');
  ok(note.heavy && note.roost, '   stand on the heavy plate till it dives, step off: it lands on the plate, the drawbridge comes down; across to the roost');
  ok(note.nest && s.won && s.falls === 0, `   a coconut on the nest's plate drops the fence: the pearl (${s.t.toFixed(0)} s, no falls)`);
  { const q = K.create(YARD); q.open.net = true; q.crab.p = YARD.plates[0].p.slice(); q.crab.h = 3.2; q.cp = 1; q.gull.state = 'stun'; q.gull.t = -99; q.gull.p = at(6.6, 200); run(q, 1);
    const q2 = K.create(YARD); q2.nuts.push({ id: 99, p: YARD.plates[0].p.slice(), d: [1, 0, 0], v: 0, h: 3.2, vh: 0, state: 'rest', age: 9, still: 0 }); q2.gull.state = 'stun'; q2.gull.t = -99; q2.gull.p = at(6.6, 200); run(q2, 1);
    ok(!q.held.bridge && !q2.held.bridge, '   the heavy plate: a crab, or a coconut, is too light for it'); }
  { const q = K.create(YARD); q.gull.state = 'ground'; q.gull.t = 0; q.gull.h = 0; q.gull.p = YARD.plates[0].p.slice(); q.crab.p = at(2.2, 0); q.crab.h = 5; q.crab.f = P.tangent(q.crab.p, TOP); run(q, 0.2); const down = !!q.held.bridge && K.floorAt(q, at(3.5, 0)) > 3;
    run(q, 2.9); const after = !q.held.bridge && !!q.open.bridge; run(q, 8.5);
    ok(down && after && !q.open.bridge && K.floorAt(q, at(3.5, 0)) < 0.1, '   the gull on it holds the drawbridge down; it stays down 8 s after the gull flies off, then rises'); }
  { const q = K.create(YARD); q.open.net = true; q.crab.p = at(10.4, 40); q.crab.h = 1; q.cp = 1; q.gull.cool = 0; const e = run(q, 10);
    ok(!e.some(x => x.type === 'gull-dive') && q.gull.loot, '   while the gull holds its stolen coconut, it never dives'); }
  { const q = K.create(YARD); q.open.net = true; q.gull = null; q.crab.p = at(9.0, 60); q.crab.h = 1; q.crab.f = P.tangent(q.crab.p, TOP); hop(q, at(8.2, 60));
    ok(q.crab.h < 1.1 && K.dist(q.crab.p, TOP) > 8.6, '   the deck (3.2) is too high to jump onto from the boardwalk (1): it takes a bounce'); }
  ok(YARD.signs.length >= 5 && ['note', 'stun', 'gullback', 'heavy', 'nest'].every(k => YARD.signs.some(s => s.kind === k)), '   picture signs: Old Ink\'s note, the bullseye, hitting the gull, bouncing on its back, the heavy plate, the nest'); }

// ── World 2, chamber 5: Sinkhole Reef ───────────────────────────────────────
const { SINK } = K;
const sink = () => {
  const s = K.create(SINK), ev = [], note = {};
  gather(s, ev); note.got = s.crab.nuts;
  // 1. from the painted spot, a coconut into the blowhole: it comes up inside the reef wall into the bullseye, and the lid opens
  go(s, SINK.spots[0].p, ev, 0.1, 12); const fL = aimFor(s, SINK.holes[1].p, q => !!q.open.lid, { a0: -12, a1: 12, da: 2 }); if (fL) throwAim(s, SINK.holes[1].p, fL, ev, 3);
  note.lid = !!s.open.lid; note.through = ev.some(e => e.type === 'hole' && e.nut);
  // 2. a coconut into the pit's blowhole: it comes up on the plate, and the gold fence drops
  const ph = SINK.holes[2].p; go(s, at(K.dist(ph, TOP) + 2.4, K.lonOf(ph)), ev, 0.15, 12); const fP = aimFor(s, ph, q => !!q.held.gold, { a0: -10, a1: 10, da: 2 }); if (fP) throwAim(s, ph, fP, ev, 3);
  note.gold = !!s.held.gold;
  // 3. into the big sinkhole: out by the pearl
  go(s, at(18.0, 0), ev, 0.2, 10); go(s, SINK.holes[0].p, ev, 0.2, 4); for (let i = 0; i < 90 && s.crab.air; i++) ev.push(...K.step(s, DT));
  note.inside = K.dist(s.crab.p, TOP) < 6.8;
  go(s, TOP, ev, 0.3, 8);
  return { s, ev, note };
};
{ const { s, ev, note } = sink();
  ok(note.got === 3, '5. SINKHOLE REEF: three coconuts from the palm');
  ok(note.lid && note.through, '   from the painted spot, a coconut thrown into the blowhole comes up on the far side of the planet still flying, into the bullseye: the lid opens');
  ok(note.gold, '   a coconut into the pit\'s blowhole comes up in the walled pit on its plate: the gold fence drops');
  ok(note.inside && s.won && s.falls === 0, `   into the big sinkhole: out by the pearl (${s.t.toFixed(0)} s, no falls)`);
  { const q = K.create(SINK); q.crab.p = at(18.0, 0).slice(); for (let i = 0; i < 120; i++) K.step(q, DT, stickTo(q, at(15, 0))); ok(K.dist(q.crab.p, TOP) > 7, '   with the lid shut the crab walks over the big sinkhole'); }
  { // inside the reef wall: lob a coconut over the pit's low wall onto its plate (the aim turns green for it)
    const q = K.create(SINK); q.open.lid = 99; q.cp = 1; const pit = SINK.plates[0].p; q.crab.p = P.walk(pit, P.toward(pit, TOP), 2.2 / K.R); q.crab.nuts = 1;
    const f = aimFor(q, pit, x => !!x.held.gold, { a0: -10, a1: 10, da: 2 }); let green = false;
    if (f) { turnTo(q, pit, f.a); green = K.aim(q, f.ch).hit; K.throwNut(q, f.ch); run(q, 2.5); }
    ok(q.held.gold && green, '   from inside the reef wall a coconut lobbed over the pit\'s low wall lands on its plate (and the aim turns green for that throw): the gold fence drops');
    const r = K.create(SINK); r.open.lid = 99; r.cp = 1; r.crab.p = P.walk(pit, P.toward(pit, TOP), 1.4 / K.R); K.jump(r); for (let i = 0; i < 90; i++) K.step(r, DT, stickTo(r, pit));
    ok(!r.held.gold && K.dist(r.crab.p, pit) > 0.9, '   a crab can\'t just jump into the pit (its wall is 1.6, a jump goes 1.3)'); }
  { const q = K.create(SINK); q.crab.p = at(SINK.spots[0].p ? 18.0 : 18, 60).slice(); for (let i = 0; i < 120; i++) K.step(q, DT, stickTo(q, SINK.holes[1].p)); ok(K.dist(q.crab.p, TOP) > 7, '   a blowhole is a grate: the crab walks over it, only coconuts go down'); }
  { let spot = 0, tries = 0; for (let a = -10; a <= 10; a += 2) for (let ch = 0; ch <= 0.6; ch += 0.05) { tries++; const q = K.create(SINK); q.crab.p = SINK.spots[0].p.slice(); q.crab.nuts = 1; turnTo(q, SINK.holes[1].p, a); K.throwNut(q, ch); run(q, 3); if (q.open.lid) spot++; }
    ok(spot >= tries * 0.15, `   from the spot, ${spot} of ${tries} throws at the blowhole open the lid (the aim turns green on them)`); }
  { const q = K.create(SINK); q.crab.nuts = 1; q.crab.p = at(8.0, 0).slice(); face(q, TOP); for (const ch of [0.3, 0.6]) { q.crab.nuts = 1; K.throwNut(q, ch); run(q, 3); }
    ok(q.nuts.filter(n => n.state === 'rest').every(n => K.dist(n.p, TOP) > 6.8), '   a coconut that ends up inside the reef wall while the lid is shut washes back out to the spot (never out of reach)'); }
  { const q = K.create(SINK); q.open.lid = 99; q.crab.p = at(5.0, 10).slice(); const e = run(q, 1.5, stickTo(q, SINK.holes[3].p)); ok(e.some(x => x.type === 'hole') && K.dist(q.crab.p, TOP) > 7, '   inside, a sinkhole leads back out to the beach (never stuck inside)'); }
  { const q = K.create(SINK); q.open.lid = 99; q.crab.p = at(15.65, 0).slice(); q.crab.h = 2; q.crab.f = P.tangent(q.crab.p, at(20, 0)); q.crab.face = q.crab.f; K.jump(q); const e = []; for (let i = 0; i < 120; i++) e.push(...K.step(q, DT, q.crab.holeCd > 0 ? { x: 0, y: 0 } : stickTo(q, SINK.holes[0].p, 0.7)));
    ok(e.some(x => x.type === 'hole') && q.gold.includes(0), '   jump into the sinkhole from the coral shelf and you fly out high on the far side: a golden shell'); } }

// ── World 2, chamber 6: Moon Pool ───────────────────────────────────────────
const { MOONPOOL } = K;
const moonPool = () => {
  const s = K.create(MOONPOOL), ev = [], note = {};
  gather(s, ev);
  for (let i = 0; i < 12 / DT && !s.travel; i++) ev.push(...K.step(s, DT, stickTo(s, MOONPOOL.launch[0].p))); note.launched = ev.some(e => e.type === 'launch'); ev.push(...run(s, K.TRAVEL_S + 0.3));
  note.moon = s.w === 1 && s.crab.nuts === 3;
  go(s, at(6.8, 10), ev, 0.2, 10); K.jump(s); let top = 0; for (let i = 0; i < 200 && s.crab.air; i++) { ev.push(...K.step(s, DT, stickTo(s, at(4.6, 5)))); top = Math.max(top, s.crab.h); }
  note.hop = top; note.inCrater = K.dist(s.crab.p, TOP) < 6;
  const pl = MOONPOOL.moon.plates[0]; go(s, at(5.2, 0), ev, 0.2, 5); face(s, pl.p); K.throwNut(s, chargeFor(s, pl.p)); ev.push(...run(s, 2)); note.gold = !!s.held.gold;
  K.jump(s); for (let i = 0; i < 200 && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, at(8, 0))));
  for (let i = 0; i < 12 / DT && !s.travel; i++) ev.push(...K.step(s, DT, stickTo(s, MOONPOOL.moon.launch[0].p))); ev.push(...run(s, K.TRAVEL_S + 0.3)); note.home = s.w === 0 && !!s.held.gold;
  go(s, at(6, 180), ev, 0.3, 12); go(s, TOP, ev, 0.3, 8);
  return { s, ev, note };
};
{ const { s, ev, note } = moonPool();
  ok(note.launched && note.moon, '6. MOON POOL: step on the launch pad and fly to the moon, coconuts and all');
  ok(note.inCrater && note.hop > 2.2, `   the moon's gravity is half: a jump goes ${note.hop.toFixed(1)} up, over the crater's 2.2 rim`);
  ok(note.gold, '   a coconut on the plate in the crater holds the gold fence open, back on the planet (gates are shared between the worlds)');
  ok(note.home && s.won && s.falls === 0, `   the pad on the moon flies you home; the pearl (${s.t.toFixed(0)} s, no falls)`);
  { const q = K.create(MOONPOOL); q.crab.p = at(6, 180).slice(); for (let i = 0; i < 200; i++) K.step(q, DT, stickTo(q, TOP)); ok(!q.won && K.dist(q.crab.p, TOP) > 1.7, '   before that the gold fence is shut'); }
  { const q = K.create(MOONPOOL); q.crab.p = at(8, 0).slice(); let top = 0; K.jump(q); for (let i = 0; i < 90; i++) { K.step(q, DT); top = Math.max(top, q.crab.h); } ok(top < 1.4, `   on the planet the same jump only goes ${top.toFixed(1)} up`); }
  { const q = K.create(MOONPOOL); q.crab.nuts = 1; q.crab.p = at(17.2, 0).slice(); face(q, MOONPOOL.launch[0].p); K.throwNut(q, chargeFor(q, MOONPOOL.launch[0].p)); const e = run(q, 2);
    ok(e.some(x => x.type === 'nut-launch') && q.nuts.some(n => n.w === 1), '   a coconut thrown onto the launch pad flies to the moon on its own'); }
  { const q = K.create(MOONPOOL); q.w = 1; q.lv = MOONPOOL.moon; q.crab.p = P.walk(at(10.5, 120), P.toward(at(10.5, 120), TOP), 2.5 / K.R); q.crab.nuts = 1; face(q, MOONPOOL.moon.posts[0].p); K.throwNut(q, 0.02); run(q, 1.2); const n = q.nuts.find(x => x.state === 'rest' && x.w === 1);
    let got = false; if (n) { go(q, P.walk(n.p, P.toward(MOONPOOL.moon.posts[0].p, n.p), 0.9 / K.R), [], 0.1, 3); hop(q, n.p); for (let i = 0; i < 200 && q.crab.air; i++) K.step(q, DT, q.crab.vh < 0 && q.crab.h > 3.6 ? stickTo(q, MOONPOOL.moon.posts[0].p, 0.8) : { x: 0, y: 0 }); got = q.gold.includes(100); }
    ok(got, '   on the moon a bounce on a coconut reaches the top of the 4.6 pillar: a golden shell'); } }

// ── World 2, chamber 7: Low Tide ────────────────────────────────────────────
const { TIDE } = K;
const lowTide = () => {
  const s = K.create(TIDE), ev = [], note = {};
  gather(s, ev);
  go(s, TIDE.rafts[0].p, ev, 0.2, 10); note.onRaft = Math.abs(s.crab.h - 0.3) < 0.05 && !s.falls;
  for (let i = 0; i < 25 / DT && (s.tideW || 0) < TIDE.tide.high - 0.01; i++) ev.push(...K.step(s, DT));
  note.lifted = s.crab.h > 2.6 && !s.falls;
  const pl = TIDE.plates[0]; face(s, pl.p); K.throwNut(s, chargeFor(s, pl.p)); ev.push(...run(s, 1.5)); note.gold = !!s.held.gold;
  K.jump(s); for (let i = 0; i < 200 && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, TOP))); note.mesa = Math.abs(s.crab.h - 4) < 0.05;
  go(s, TOP, ev, 0.3, 6);
  return { s, ev, note };
};
{ const { s, ev, note } = lowTide();
  ok(note.onRaft, '7. LOW TIDE: at low tide, out across the sand onto the raft by the mesa');
  ok(note.lifted && ev.some(e => e.type === 'tide-in'), '   the tide comes in and lifts the raft (and the crab on it)');
  ok(note.gold, '   at high tide, from the raft, a lob reaches the lighthouse rock\'s plate: the gold fence drops');
  ok(note.mesa && s.won && s.falls === 0, `   a jump from the raft onto the mesa: the pearl (${s.t.toFixed(0)} s, no falls)`);
  { const q = K.create(TIDE); q.crab.p = at(12, 30).slice(); const e = run(q, 16); ok(e.some(x => x.type === 'swept') && q.falls >= 1, '   caught on the sand when the tide comes in: swept back to the flag'); }
  { let hit = 0; for (let d = 10; d <= 14.5; d += 0.9) for (let lon = 30; lon <= 90; lon += 10) for (let ch = 0; ch <= 1; ch += 0.1) { const q = K.create(TIDE); q.crab.p = at(d, lon).slice(); q.crab.h = K.floorAt(q, q.crab.p); q.crab.nuts = 1; face(q, TIDE.plates[0].p); K.throwNut(q, ch); run(q, 2); if (q.held.gold) hit++; }
    ok(hit === 0, '   from the sand no throw lands on the lighthouse plate (it\'s 2.8 up)'); }
  { const q = K.create(TIDE); q.crab.p = at(17, 0); q.crab.h = K.floorAt(q, q.crab.p); const e1 = run(q, 16), up = q.crab.h, W = q.tideW, nutUp = q.nuts[0].h; const e2 = run(q, 10);
    ok(up > W + 0.2 && Math.abs(up - (W + 0.3)) < 0.05 && nutUp > W && q.crab.h < 0.35 && !e1.concat(e2).some(x => x.type === 'swept' || x.type === 'land'),
      `   the beach is a floating island: it rises with the tide (to ${up.toFixed(1)} over water at ${W.toFixed(1)}) and back down, the crab and its coconuts with it`); }
  { let hit = 0; for (let lon = 0; lon <= 120; lon += 10) for (const d of [15.1, 16]) for (let ch = 0; ch <= 1.001; ch += 0.1) { const q = K.create(TIDE); q.t = 15; q.tideW = K.tideAt(TIDE, 15); q.crab.p = at(d, lon); q.crab.h = K.floorAt(q, q.crab.p); q.crab.nuts = 1; face(q, TIDE.plates[0].p); K.throwNut(q, ch); run(q, 2.5); if (q.held.gold) hit++; }
    ok(hit === 0, '   from the risen island at high tide no throw reaches the lighthouse plate either: it still takes the raft'); }
  { const q = K.create(TIDE); q.crab.nuts = 1; q.crab.p = at(5.6, 60).slice(); face(q, TOP); K.throwNut(q, 0.02); run(q, 1); const n = q.nuts.find(x => x.state === 'rest');
    let top = 0; if (n) { go(q, P.walk(n.p, P.toward(TOP, n.p), 0.9 / K.R), [], 0.1, 3); hop(q, n.p); for (let i = 0; i < 120 && q.crab.air; i++) { K.step(q, DT, stickTo(q, TOP)); top = Math.max(top, q.crab.h); } }
    ok(K.floorAt(q, q.crab.p) < 4, `   from the sand a bounce on a coconut (${top.toFixed(1)} up) doesn't reach the mesa (4): it takes the raft at high tide`); }
  { const q = K.create(TIDE); q.crab.nuts = 1; q.crab.p = at(9.5, 0).slice(); face(q, at(8, 0)); K.throwNut(q, 0.02); run(q, 1); const n = q.nuts.find(x => x.state === 'rest' && K.dist(x.p, TOP) < 12); q.crab.p = at(17, 0).slice();
    run(q, 13); const up = n && n.state === 'float' && Math.abs(n.h - K.tideAt(TIDE, q.t)) < 0.05; run(q, 12); ok(up && n.state === 'rest', '   a coconut left on the sand floats up with the tide and settles again when it goes out'); }
  { const q = K.create(TIDE); q.crab.p = at(13.2, 160).slice(); for (let i = 0; i < 60; i++) K.step(q, DT, stickTo(q, at(13.6, 160))); ok(q.gold.includes(0), '   the golden shell far out on the sand: there for the taking at low tide'); } }

// ── World 2, chamber 8: Ink's Deep (the boss) ────────────────────────────────
const { DEEP } = K;
const jetAt = (s, j, ahead) => K.jetState({ ...s, t: s.t + ahead }, j);
// walk to p, but never into a jet's reach unless it will stay quiet while we pass
const dashTo = (s, p, ev = [], secs = 20) => {
  for (let i = 0; i < secs / DT && K.dist(s.crab.p, p) > 0.2; i++) {
    const nx = P.walk(s.crab.p, P.toward(s.crab.p, p), 0.6 / K.R);
    const risky = (DEEP.jets || []).some(j => K.dist(nx, j.p) < j.r + 0.25 && [0, 0.15, 0.3, 0.45, 0.6].some(a => jetAt(s, j, a) !== 'quiet'));
    const inJet = (DEEP.jets || []).some(j => K.dist(s.crab.p, j.p) < j.r + 0.1);
    ev.push(...K.step(s, DT, risky && !inJet ? { x: 0, y: 0 } : stickTo(s, p)));
  }
  return ev;
};
const deep = () => {
  const s = K.create(DEEP), ev = [], note = {};
  gather(s, ev);
  // 1. across the crumbling tiles without stopping
  go(s, at(15.5, 0), ev, 0.15, 10); for (let i = 0; i < 4 / DT && K.dist(s.crab.p, TOP) > 10.2; i++) ev.push(...K.step(s, DT, stickTo(s, at(9.8, 0))));
  note.crossed = K.dist(s.crab.p, TOP) < 10.5 && !s.falls; note.cracked = ev.some(e => e.type === 'tile-crack');
  // 2. round the steam corridor, timing each jet
  for (let lon = 12; lon <= 180; lon += 12) dashTo(s, at(9.0, lon), ev, 12);
  note.corridor = Math.abs(K.lonOf(s.crab.p)) > 170 && !s.falls;
  // 3. into the arena, and the fight
  go(s, at(6.6, 180), ev, 0.2, 6); go(s, at(4.0, 180), ev, 0.2, 6); go(s, at(2.5, 180), ev, 0.2, 6);
  const f0 = s.falls; fight(s, ev, note, 400); note.down = s.boss.state === 'down'; note.fightFalls = s.falls - f0;
  go(s, TOP, ev, 0.3, 8);
  return { s, ev, note };
};
{ const { s, ev, note } = deep();
  ok(note.cracked && note.crossed, "8. INK'S DEEP: across the chasm on the crumbling tiles, without stopping");
  ok(note.corridor, '   round the steam corridor, waiting out each jet\'s burst and dashing past');
  ok(note.down && s.boss.hp === 0 && ev.filter(e => e.type === 'ink-hit').length === 4, `   Old Ink, four hits this time (${note.slams} slams; ${note.fightFalls} knocked back)`);
  ok(s.won, `   the pearl (${s.t.toFixed(0)} s)`);
  { const q = K.create(DEEP); q.crab.p = DEEP.crumbles[1].p.slice(); const e = run(q, 2); ok(e.some(x => x.type === 'tile-fall') && e.some(x => x.type === 'fall') && q.falls === 1, '   standing still on a tile: it cracks, falls away, and so does the crab (back to the flag)'); }
  { const q = K.create(DEEP); q.crab.p = DEEP.crumbles[1].p.slice(); run(q, 1.5); const e = run(q, K.TILE_BACK_S + 0.5); ok(e.some(x => x.type === 'tile-back'), '   a fallen tile comes back a few seconds later'); }
  { const q = K.create(DEEP); q.crab.p = at(15.3, 90).slice(); K.jump(q); for (let i = 0; i < 90; i++) K.step(q, DT, stickTo(q, at(9, 90))); ok(K.dist(q.crab.p, TOP) > 10.5 || q.falls > 0, '   the chasm is too wide to jump'); }
  { const j = DEEP.jets[0]; const q = K.create(DEEP); q.cp = 1; let warned = false, fired = false, firstFire = -1;
    for (let i = 0; i < 4 / DT; i++) { const st = K.jetState(q, j); if (st === 'warn' && firstFire < 0) warned = true; if (st === 'fire' && firstFire < 0) firstFire = i; if (st === 'fire') fired = true; K.step(q, DT); }
    ok(warned && fired, '   every steam jet bubbles (a warning) before it fires');
    const r = K.create(DEEP); r.cp = 1; for (let i = 0; i < 4 / DT && K.jetState(r, j) !== 'fire'; i++) K.step(r, DT); r.crab.p = j.p.slice(); const e = run(r, 0.1); ok(e.some(x => x.type === 'scald'), '   standing in one as it fires: scalded, back to the flag'); }
  { const q = K.create(DEEP); ok(DEEP.jets.filter(j => j.boss).every(j => K.jetState(q, j) === 'quiet'), '   the jets round the arena are quiet until Old Ink wakes'); } }

// ── World 3, chamber 9: Obsidian Slide ──────────────────────────────────────
const { SLIDE } = K;
const LG = await import('../src/arcade/LakeGrid.js');
const DIRS = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
// a point a cell's step the given way from the crab (the stick pushes toward it)
const lakePt = (s, nm) => { const z = SLIDE.lake, [r, c] = s.crab.lake || [z.rows, 0], [dr, dc] = DIRS[nm]; return K.lakeAt(z, r + dr, c + dc); };
const settle = (s, ev, secs = 6) => { for (let i = 0; i < secs / DT && (s.crab.slide || s.nuts.some(n => n.state === 'slide')); i++) ev.push(...K.step(s, DT)); for (let i = 0; i < 3; i++) ev.push(...K.step(s, DT)); };     // (and let go of the stick)
const slideRun = () => {
  const s = K.create(SLIDE), ev = [], z = SLIDE.lake, plan = LG.solve(z, 0), note = { moves: plan.length, plan: plan.join(' ') };      // (straight on, no coconut from the palm: the lake's own is picked up on the way)
  for (const m of plan) {
    if (Array.isArray(m)) { for (const lon of [z.lon0 + m[1] * z.dl]) go(s, at(17.2, lon), ev, 0.2, 12); go(s, at(z.r0 + (z.rows - 0.4) * z.dd + 0.3, z.lon0 + m[1] * z.dl), ev, 0.12, 12); s.crab.face = P.toward(s.crab.p, TOP); for (let i = 0; i < 2 / DT && !s.crab.slide && !s.crab.lake; i++) ev.push(...K.step(s, DT, stickTo(s, TOP))); settle(s, ev); continue; }
    const [kind, nm] = m.includes(' ') ? m.split(' ') : ['go', m];
    if (kind === 'throw') {         // hold THROW, turn with the stick (it doesn't slide you while winding up), let go
      s.crab.aiming = true; for (let i = 0; i < 8; i++) ev.push(...K.step(s, DT, stickTo(s, lakePt(s, nm))));
      note.aimHit = K.aim(s, 0.5).hit; s.crab.aiming = false; K.throwNut(s, 0.5); settle(s, ev); continue; }
    if (!s.crab.lake) { console.log('   (debug) not on the lake before', m, 'at', K.dist(s.crab.p, TOP).toFixed(2), K.lonOf(s.crab.p).toFixed(1), 'falls', s.falls, 'nuts', s.crab.nuts, ev.slice(-12).map(e => e.type).join(',')); break; }
    const was = s.crab.lake.slice();
    for (let i = 0; i < 3; i++) ev.push(...K.step(s, DT, stickTo(s, lakePt(s, nm))));
    for (let i = 0; i < 10 && !s.crab.slide; i++) ev.push(...K.step(s, DT));          // (let go of the stick)
    settle(s, ev);
    if (process.env.DBG) console.log('   (debug)', m, 'from', was, 'to', s.crab.lake, 'falls', s.falls, 'blocks', JSON.stringify(s.lake.blocks));
    if (kind === 'push' && !(s.crab.lake && s.crab.lake[0] === was[0] && s.crab.lake[1] === was[1])) note.bad = m;
  }
  go(s, at(5.2, z.lon0 + z.exit * z.dl), ev, 0.3, 5); go(s, TOP, ev, 0.3, 6);
  return { s, ev, note };
};
{ const { s, ev, note } = slideRun();
  ok(note.moves === 15 && /push/.test(note.plan) && /throw/.test(note.plan), `9. OBSIDIAN SLIDE: a search over the lake's own rules (LakeGrid.js) finds the shortest way is ${note.moves} moves: ${note.plan}`);
  ok(s.won && s.falls === 0 && note.aimHit && !note.bad && ev.some(e => e.type === 'lake-push') && ev.some(e => e.type === 'lake-crack') && ev.some(e => e.type === 'lake-plate') && ev.some(e => e.type === 'pick'),
    `   played with the stick and the throw button: bump the block, push it down the steps, pick up the coconut lying on the glass, crack the glass once, throw it onto the plate (the aim said so), round, up the bridge; the pearl (${s.t.toFixed(0)} s, no falls)`);
  { const z = SLIDE.lake;
    ok(!LG.solve({ ...z, ramps: [] }, 1), '   without the ramp there is no way: it is the one way back up a step');
    ok(!LG.solve({ ...z, pillars: [...z.pillars, ...z.blocks], blocks: [] }, 1), '   if the block could not be pushed there would be no way: it has to end up by the bridge');
    ok(!LG.solve({ ...z, nuts: [] }, 0) && (LG.solve(z, 0) || []).length === 15, '   with no coconut the gate stays shut; the one lying on the lake (at a cell you stop on) is enough, none needed from the palm');
    const ls = LG.fresh(z); LG.move(z, ls, 4, 2, 1, 0); const ls2 = LG.fresh(z); ls2.cracks['3,2'] = 1; const m2 = LG.move(z, ls2, 4, 2, -1, 0);
    ok(LG.move(z, LG.fresh(z), 2, 1, 1, 0).end + '' === '3,1' && LG.move(z, LG.fresh(z), 2, 2, 1, 0).end + '' === '2,2', '   up a step only at the ramp; anywhere else the step is a wall');
    ok(LG.move(z, LG.fresh(z), 3, 1, 0, 1).cracked + '' === '3,2' && m2.kind === 'slide' && m2.out === 'stop' && !m2.broke, '   stopping on cracked glass cracks it; sliding over it does nothing');
    const ls3 = LG.fresh(z); ls3.cracks['3,2'] = 1; const m3 = LG.move(z, ls3, 3, 1, 0, 1); ok(m3.out === 'lava' && m3.broke + '' === '3,2', '   stopping on it a second time breaks it: lava');
    const ls4 = LG.fresh(z), t4 = LG.throwNut(z, ls4, 3, 2, -1, 0); ok(t4.end + '' === '1,2' && LG.gateOpen(z, ls4), '   a coconut thrown on the obsidian lands two cells out and slides on: onto the plate, and the gate opens');
    const ls5 = LG.fresh(z); ls5.nuts.push([1, 2]); const m5 = LG.move(z, ls5, 4, 2, -1, 0); ok(m5.picked + '' === '1,2' && !LG.gateOpen(z, ls5), '   stop on a coconut and you pick it up (off the plate, the gate shuts)'); }
  { const q = K.create(SLIDE), z = SLIDE.lake; q.crab.lake = [5, 0]; q.crab.p = K.lakeAt(z, 5, 0); q.crab.h = K.lakeH(z, 5); const e = []; for (let i = 0; i < 4; i++) e.push(...K.step(q, DT, stickTo(q, K.lakeAt(z, 5, -1)))); settle(q, e);
    ok(e.some(x => x.type === 'burn') && q.falls === 1 && !q.crab.lake, '   sliding off the side of the lake: into the lava, back to the flag'); }
  { const q = K.create(SLIDE), z = SLIDE.lake; q.crab.lake = [4, 4]; q.crab.p = K.lakeAt(z, 4, 4); const p0 = q.crab.p.slice(); for (let i = 0; i < 60; i++) K.step(q, DT, { x: 0, y: 0 }); ok(K.dist(q.crab.p, p0) < 0.05, '   on the obsidian, without a push, you stay put'); }
  { const q = K.create(SLIDE), z = SLIDE.lake; q.crab.lake = [4, 4]; q.crab.p = K.lakeAt(z, 4, 4); q.crab.h = K.lakeH(z, 4); const e = []; const j = K.jump(q); e.push(...K.step(q, DT)); for (let i = 0; i < 30; i++) e.push(...K.step(q, DT));
    ok(!j && !q.crab.air && e.some(x => x.type === 'lake-nojump') && q.crab.lake, '   no jumping on the obsidian (and it says so)'); }
  { const q = K.create(SLIDE), z = SLIDE.lake, e = []; q.crab.p = at(15.9, 20); q.crab.h = K.floorAt(q, q.crab.p); q.crab.face = P.toward(q.crab.p, TOP); q.crab.f = q.crab.face; K.jump(q);
    for (let i = 0; i < 200 && !q.crab.lake && !q.won && q.falls === 0; i++) e.push(...K.step(q, DT, stickTo(q, TOP)));
    ok(e.some(x => x.type === 'lake-on') && e.some(x => x.type === 'lake-go'), '   jumping onto the lake from the rim: you land sliding, under the same rules'); }
  { const q = K.create(SLIDE), z = SLIDE.lake, e = []; q.crab.lake = [8, 3]; q.crab.p = K.lakeAt(z, 8, 3); q.crab.h = K.lakeH(z, 8); for (let i = 0; i < 4; i++) e.push(...K.step(q, DT, stickTo(q, K.lakeAt(z, 8, 4)))); settle(q, e);
    q.lake.cracks['7,3'] = 1; for (let i = 0; i < 4; i++) e.push(...K.step(q, DT, stickTo(q, K.lakeAt(z, 9, 3)))); settle(q, e);
    ok(!q.crab.lake && K.floorAt(q, q.crab.p) > 1.9 && q.lake.cracks['7,3'] === 0, '   off the near edge, back onto the rim: the lake sets back as it was'); }
  { const q = K.create(SLIDE), z = SLIDE.lake, e = []; for (let i = 0; i < 3 / DT && !q.crab.lake; i++) e.push(...K.step(q, DT, stickTo(q, TOP)));
    ok(q.crab.lake && q.crab.lake + '' === '8,5' && e.some(x => x.type === 'lake-push') === false, '   from the flag, straight ahead onto the lake: you slide in and stop at the block (no pillar in the way at the start)'); }
  { const q = K.create(SLIDE), z = SLIDE.lake, e = []; q.crab.p = at(15.75, -3); q.crab.h = K.floorAt(q, q.crab.p); q.crab.f = P.tangent(q.crab.p, TOP); for (let i = 0; i < 2 / DT && !q.crab.lake && !q.crab.slide; i++) e.push(...K.step(q, DT, stickTo(q, at(14, -3))));
    ok(e.some(x => x.type === 'lake-on') && q.crab.slide && q.crab.slide.path[0][1] !== 4, '   walking on beside a pillar at the edge: you come on in the free cell next to it (not bounced back)'); }
  { const q = K.create(SLIDE), z = SLIDE.lake, e = []; q.crab.lake = [5, 6]; q.crab.p = K.lakeAt(z, 5, 6); q.crab.h = K.lakeH(z, 5); q.lake.cracks['7,3'] = 1; for (let i = 0; i < 4; i++) e.push(...K.step(q, DT, stickTo(q, K.lakeAt(z, 6, 6)))); settle(q, e);
    ok(!q.crab.lake && q.falls === 0 && K.floorAt(q, q.crab.p) > 1.9 && e.some(x => x.type === 'lake-reset'), '   stuck on the middle step? the ramp at the side slides you back up onto the rim, and the lake sets back'); }
  ok(SLIDE.signs.length >= 5 && ['slide', 'push', 'crack', 'plate', 'ramp', 'lava'].every(k => SLIDE.signs.some(s => s.kind === k)), '   a picture sign by each new thing: slide, push, cracked glass, the plate, the ramp, the lava');
  { const q = K.create(SLIDE); q.crab.p = at(12, 90).slice(); q.crab.h = 0; const e = run(q, 0.3); ok(e.some(x => x.type === 'burn'), '   the lava round the lake burns'); } }

{ const SG = await import('../src/arcade/Signs.js'), firsts = CHAMBERS.filter((c, i) => i === 0 || CHAMBERS[i - 1].world !== c.world);
  ok(CHAMBERS.every(c => (c.signs || []).length && c.signs.every(s => SG.SIGN_KINDS.includes(s.kind))) && firsts.every(c => c.signs.some(s => /^story/.test(s.kind) || s.kind === 'note')),
    `every chamber has picture signs (each one drawn), and each world opens with its part of the story in pictures (${firsts.map(c => c.name).join(', ')})`); }
ok(CHAMBERS.map(c => c.id).join() === 'beach,stream,yard,stair,sink,pool,tide,deep,slide' && CHAMBERS[7].boss && CHAMBERS[3].boss && CHAMBERS[4].world === 2 && K.ALL_OPEN, 'World 1 is: Coconut Beach, Bubble Stream, The Gull\'s Roost, then the Drowned Stair with Old Ink; World 2: Sinkhole Reef, Moon Pool, Low Tide, then Ink\'s Deep with Old Ink; all open while testing');
console.log(fails ? `\nWORLD 1 FAIL (${fails})` : '\nWORLD 1 PASS');
process.exit(fails ? 1 : 0);
