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

// ── 2. Bubble Stream ────────────────────────────────────────────────────────
const stream = () => {
  const s = K.create(STREAM), ev = [], note = {};
  gather(s, ev);
  const A = STREAM.vents[0], B = STREAM.vents[1];
  note.blowing0 = K.blowing(s).id;
  go(s, at(15.6, 55), ev); face(s, A.p); K.throwNut(s, chargeFor(s, A.p)); ev.push(...run(s, 1.2)); note.plug = !!s.plug.A; note.blowing1 = K.blowing(s).id;
  go(s, at(12.9, 0), ev); hop(s, at(10.2, -4), ev); note.crossed = K.dist(s.crab.p, TOP) < 11 && !s.falls;
  go(s, B.p, ev, 0.2, 3);
  for (let i = 0; i < 4 / DT && s.crab.h < B.lift - 0.2; i++) ev.push(...K.step(s, DT));
  let top = 0; for (let i = 0; i < 3 / DT && s.crab.air; i++) { ev.push(...K.step(s, DT, stickTo(s, at(7.4, 0)))); top = Math.max(top, s.crab.h); }
  note.top = top; note.up = K.dist(s.crab.p, TOP) < 9.2; note.upN = s.crab.nuts;
  const pl = STREAM.plates[0]; go(s, at(5.9, 30), ev); face(s, pl.p); K.throwNut(s, chargeFor(s, pl.p)); ev.push(...run(s, 1.2)); note.plate = !!s.held.plate;
  go(s, TOP, ev, 0.3, 8);
  return { s, ev, note };
};
{ const { s, ev, note } = stream();
  ok(note.blowing0 === 'A' && note.plug && note.blowing1 === 'B', '2. BUBBLE STREAM: vent A blows first; a coconut thrown into it plugs it, and then vent B blows');
  ok(note.crossed, '   a jump crosses the stream');
  ok(note.up && note.top > 8.5 && note.top < 9.6 && note.upN === 2, `   vent B lifts the crab ${note.top.toFixed(1)} high, over the 8.5 cliff, steering; up there with two coconuts`);
  ok(note.plate && s.won && s.falls === 0, `   a coconut on the plate: the pearl (${s.t.toFixed(0)} s, no falls)`);
  // what it must teach
  const a = K.create(STREAM); a.crab.p = STREAM.vents[1].p.slice(); const e1 = run(a, 2);
  ok(!has(e1, 'lift') && has(e1, 'calm'), '   standing on B while A blows: nothing, and it says only one vent blows');
  const b = K.create(STREAM); b.crab.p = at(12.9, 0).slice(); const lon0 = K.lonOf(b.crab.p); for (let i = 0; i < 3 / DT && K.dist(b.crab.p, TOP) > 11; i++) K.step(b, DT, stickTo(b, at(10, K.lonOf(b.crab.p))));
  ok(K.dist(b.crab.p, TOP) < 11.2 && K.lonOf(b.crab.p) - lon0 > 10 && !b.falls, `   wading across, the stream carries the crab downstream (${(K.lonOf(b.crab.p) - lon0).toFixed(0)}°), but there's time to get over`);
  const c = K.create(STREAM); c.crab.p = at(11.8, 40).slice(); const e2 = run(c, 12);
  ok(has(e2, 'ouch') && c.falls === 1, '   standing still in it, the stream carries the crab onto the urchins: back to the flag');
  const d = K.create(STREAM); d.crab.nuts = 1; d.crab.p = at(13.9, 20).slice(); face(d, TOP); K.throwNut(d, 0.05); const e3 = run(d, 14);
  ok(has(e3, 'plop') && has(e3, 'lost') && has(e3, 'washed'), '   a coconut that falls in floats away onto the urchins, and washes up under the palm again');
  const f = K.create(STREAM); f.crab.p = at(12.8, -60).slice(); go(f, at(10, -60), [], 0.3, 4); go(f, at(10, 0), [], 0.3, 6);
  ok(K.dist(f.crab.p, at(10, 0)) > 2, '   the dams stop a walk round the end of the stream'); }

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
