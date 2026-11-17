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

// ── 1. Coconut Beach ────────────────────────────────────────────────────────
const beach = () => {
  const s = K.create(BEACH), ev = [], note = {};
  gather(s, ev); note.got = s.crab.nuts;
  go(s, at(14.6, 5), ev); hop(s, at(13.2, 5), ev); note.over = K.dist(s.crab.p, TOP) < 14;
  const tg = BEACH.targets[0]; face(s, tg.p); K.throwNut(s, chargeFor(s, tg.p, 1.1)); ev.push(...run(s, 1.2)); note.eye = !!s.open.eye;
  bounceIn(s, 7, 0, ev); note.inside = K.dist(s.crab.p, TOP) < 7; note.inN = s.crab.nuts;
  const pl = BEACH.plates[0]; go(s, at(5.8, 30), ev); face(s, pl.p); K.throwNut(s, chargeFor(s, pl.p)); ev.push(...run(s, 1.2)); note.plate = !!s.held.plate;
  go(s, TOP, ev, 0.3, 8);
  return { s, ev, note };
};
{ const { s, ev, note } = beach();
  ok(note.got === 3, '1. COCONUT BEACH: walk into the coconuts under the palm: three in the claws');
  ok(note.over, '   a jump clears the low wall (1 high; a jump goes 1.3)');
  ok(note.eye && has(ev, 'target'), '   a throw into the bullseye opens the crystal gate');
  ok(note.inside && note.inN === 1 && has(ev, 'bounce'), '   a coconut dropped at the tall step and jumped on bounces the crab over it, in with the last coconut');
  ok(note.plate && s.won && s.falls === 0, `   a coconut on the plate opens the last gate: the pearl (${s.t.toFixed(0)} s, no falls)`);
  // what it must teach
  const a = K.create(BEACH); a.crab.p = at(14.6, 5).slice(); let top = 0; K.jump(a); for (let i = 0; i < 60; i++) { K.step(a, DT, stickTo(a, TOP)); top = Math.max(top, a.crab.h); }
  const b = K.create(BEACH); b.crab.p = at(14.6, 5).slice(); for (let i = 0; i < 120; i++) K.step(b, DT, stickTo(b, TOP));
  ok(K.dist(b.crab.p, TOP) > 14 && K.dist(a.crab.p, TOP) < 14, '   the low wall can only be jumped (walking into it stops you)');
  const c = K.create(BEACH); c.open.eye = true; c.crab.p = at(8.4, 0).slice(); top = 0; K.jump(c); for (let i = 0; i < 90; i++) { K.step(c, DT, stickTo(c, TOP)); top = Math.max(top, c.crab.h); }
  ok(K.dist(c.crab.p, TOP) > 7, `   a plain jump (${top.toFixed(1)}) doesn't clear the tall step (2)`);
  const d = K.create(BEACH); d.open.eye = true; d.crab.nuts = 3; d.crab.p = at(9, 0).slice(); let over = 0;
  for (const ch of [0.2, 0.4, 0.6, 0.8, 1]) { d.crab.nuts = 1; face(d, TOP); K.throwNut(d, ch); run(d, 1.5); }
  ok(d.nuts.every(n => K.dist(n.p, TOP) > 7), '   no coconut can be thrown over the tall step: they bounce off it (so none can end up inside where you can\'t get them)');
  const e = beach().s; ok(e.won, ''); const f = K.create(BEACH); f.open.eye = true; f.crab.p = at(5.5, 60).slice(); f.crab.h = 0; for (let i = 0; i < 120; i++) K.step(f, DT, stickTo(f, TOP));
  ok(!f.won && K.dist(f.crab.p, TOP) > 3, '   standing on the plate holds the gate only while you stand there: you can\'t get through');
  const g = K.create(BEACH); g.open.eye = true; g.crab.p = at(6.2, 180).slice(); go(g, at(8.5, 180), [], 0.3, 4);
  ok(K.dist(g.crab.p, TOP) > 7, '   a slide at the back of the step lets you out again (never stuck inside)'); }

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
