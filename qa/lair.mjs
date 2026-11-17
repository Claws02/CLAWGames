// Old Ink's Lair, chamber 1 (The Drowned Stair): the rules, the answer, and a search
// that the other ways are shut. No browser.
// usage: node qa/lair.mjs

import { K, P, at, TOP, L, DT, A, B, R1, BANK, beach, lobbed, stickTo, run, go, hop, face, gather, chargeFor, solve } from './lair-solve.mjs';

let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };

// ── the rules, one at a time ────────────────────────────────────────────────
{ const s = K.create(L), n0 = K.count(s);
  ok(n0.loose === 3 && n0.held === 0 && s.nuts.every(n => K.dist(n.p, L.palm) < 1.2) && !K.throwNut(s, 0.5), 'three coconuts lie under the palm; with none in its claws the crab can\'t throw');
  const ev = gather(s);
  ok(s.crab.nuts === 3 && ev.filter(e => e.type === 'pick').length === 3 && K.count(s).loose === 0, 'walking into them picks them up: three carried');
  face(s, at(BANK + 4, 100)); const n = K.throwNut(s, 0.2); run(s, 1.2);
  ok(n && s.crab.nuts === 2 && n.state === 'rest' && K.count(s).loose === 1, 'a throw takes one from the claws and leaves it lying where it lands');
  go(s, n.p, [], 0.3);
  ok(s.crab.nuts === 3 && !s.nuts.includes(n), 'and walking to it picks it up again'); }
{ const s = K.create(L); s.crab.p = at(BANK - 0.2, -60).slice(); s.crab.f = P.toward(s.crab.p, TOP); let ev = [];
  for (let i = 0; i < 12 / DT && !s.falls; i++) { ev.push(...K.step(s, DT, { x: 0, y: 0 })); if (i === 30) var inWater = !!K.currentAt(s, s.crab.p); }
  ok(inWater && ev.some(e => e.type === 'ouch') && s.falls === 1 && K.dist(s.crab.p, L.start) < 2 && K.lonOf(s.crab.p) !== undefined, 'standing in the rip current: it doesn\'t hurt, but it carries the crab down onto the urchins, and back to the start');
  const s2 = K.create(L); s2.crab.p = at(12, -60).slice(); run(s2, 0.4);
  ok(K.lonOf(s2.crab.p) > -60 + 12, `the current runs east at ${L.currents[0].speed} a second, faster than a crab can wade against it (${(K.SPEED * K.WADE).toFixed(1)})`);
  const s3 = K.create(L); s3.crab.p = R1.p.slice(); const p0 = s3.crab.p.slice(); run(s3, 1);
  ok(K.dist(s3.crab.p, p0) < 0.01, 'a rock in the channel is somewhere to stand: the current doesn\'t take a crab on one');
  const s4 = K.create(L); s4.crab.p = A.p.slice(); run(s4, 1.5);
  ok(K.dist(s4.crab.p, A.p) < 0.2 && !K.currentAt(s4, A.p), 'and the cove is still water: a crab that gets in stays there until it chooses to leave'); }
{ const s = K.create(L); ok(K.blowing(s).id === 'A', 'vent A is open, so A is the one that blows');
  s.crab.p = B.p.slice(); const ev = run(s, 1.5);
  ok(!ev.some(e => e.type === 'lift') && s.crab.h === K.ROCK_H && ev.filter(e => e.type === 'calm').length === 1 && ev.find(e => e.type === 'calm').blowing.id === 'A', 'standing on vent B does nothing while A blows, and it says so (once): the vent is calm and A is the one blowing');
  s.plug.A = 99; ok(K.blowing(s).id === 'B', 'plug A and B blows');
  const ev2 = run(s, 1.4); const top = s.crab.h;
  ok(ev2.some(e => e.type === 'lift') && top > 8.5, `and it lifts a crab standing on it ${top.toFixed(1)} high: over the ${L.rings[0].h} cliff`); }

// ── the answer, played through ──────────────────────────────────────────────
{ const { s, ev, note } = solve(), n = K.count(s), has = t => ev.some(e => e.type === t);
  ok(note.plugged && has('plop') && has('plug'), `1. a coconut dropped in the far side of the current upstream is carried into the cove and plugs vent A (${note.t1.toFixed(0)} s in)`);
  ok(note.onB && has('lift') && note.shelf, '2. across the stepping rocks to vent B, and up over the cliff onto the shelf, with the two coconuts that are left');
  ok(has('gull-dive') && has('stomp') && note.over, '3. the gull dives, the crab steps aside and jumps on its back: bounced over the tall step, both coconuts still in its claws');
  ok(has('press') && has('target') && s.won && s.falls === 0 && n.working === 2 && n.held === 0, `4. one coconut on the plate, one in the bullseye, both gates open: the pearl, in ${s.t.toFixed(0)} s without a fall`);
  const again = solve(); ok(again.s.t === s.t && again.s.won, 'played again it goes exactly the same way (nothing in the chamber is left to chance)'); }

// ── the other ways are shut ─────────────────────────────────────────────────
{ // every throw a crab could make from the near bank: which end up plugging A?
  let all = 0, plugs = 0, direct = 0; const from = [], landed = [];
  for (let lon = -110; lon <= 100; lon += 7) for (const d of [13.5, 14.6]) for (let aLon = lon - 60; aLon <= lon + 60; aLon += 10) for (const aD of [9.4, 10.6, 11.8]) for (let ch = 0; ch <= 1; ch += 0.2) {
    const s = K.create(L); s.crab.nuts = 1; s.crab.p = at(d, lon).slice(); face(s, at(aD, aLon)); const n = K.throwNut(s, ch); let wet = false, land = null;
    for (let i = 0; i < 14 / DT && s.nuts.includes(n) && n.state !== 'plug' && n.state !== 'rest'; i++) { K.step(s, DT); if (n.state === 'float' && !wet) { wet = true; land = [K.dist(n.p, TOP), K.lonOf(n.p)]; } }
    all++; if (n.state === 'plug') { plugs++; if (!wet) direct++; from.push(lon); landed.push(land); } }
  const maxLon = Math.max(...landed.map(l => l[1])), maxD = Math.max(...landed.map(l => l[0]));
  ok(plugs > 20 && direct === 0, `of ${all} throws from all along the near bank, ${plugs} plug vent A, every one of them carried there by the water; none lands in it`);
  ok(maxLon < 70 && maxD < 13.4, `the ones that work all landed upstream of the cove (east of ${maxLon.toFixed(0)}° none do) and on the far side of the current (none further out than ${maxD.toFixed(1)}; the bank is at 13.2)`);
  // straight at the vent from across the channel: the cove's wall
  let across = 0, tries = 0;
  for (let lon = 62; lon <= 96; lon += 2) for (const d of [13.4, 14, 15]) for (let ch = 0.1; ch <= 1; ch += 0.1) { const s = K.create(L); s.crab.nuts = 1; s.crab.p = at(d, lon).slice(); face(s, A.p); const n = K.throwNut(s, ch); for (let i = 0; i < 10 / DT && s.nuts.includes(n) && n.state !== 'plug' && n.state !== 'rest'; i++) K.step(s, DT); tries++; if (n.state === 'plug') across++; }
  ok(across === 0, `thrown straight at the vent from across the water, level with it or below (${tries} throws): never. They hit the cove's wall or go down to the urchins, and wash up under the palm again`); }
{ const s = K.create(L); s.nuts.pop(); s.crab.nuts = 1; s.crab.p = at(13.6, 85).slice(); face(s, at(11, 85)); K.throwNut(s, 0.3); const ev = run(s, 8), n = K.count(s);
  ok(ev.some(e => e.type === 'lost' && e.why === 'urchin') && ev.some(e => e.type === 'washed') && n.loose === 3 && n.held + n.loose + n.working + n.gull + n.back === 3 && s.nuts.filter(x => K.dist(x.p, L.palm) < 1.3).length === 3, 'a coconut the urchins get isn\'t gone: it washes up under the palm (there are always three)'); }
{ // wading: from anywhere on the bank, walking at vent B's rock, with a jump or without
  let onB = 0, tries = 0;
  for (let lon = -112; lon <= 100; lon += 4) for (const jumpAt of [-1, 0.2, 0.5, 0.9, 1.4]) for (const aimLon of [-40, -20, 0, 10, 20, 30, 40]) {
    const aim = at(10.5, aimLon), s = K.create(L); s.crab.p = at(BANK + 0.1, lon).slice(); tries++;
    for (let i = 0; i < 9 / DT && !s.falls; i++) { if (Math.abs(i * DT - jumpAt) < DT / 2) K.jump(s); K.step(s, DT, stickTo(s, aim)); if (!s.crab.air && K.dist(s.crab.p, B.p) < B.r) { onB++; break; } } }
  ok(onB === 0, `wading or jumping in from the bank and making for vent B's rock (${tries} tries): never reached. The stepping rocks are the way`); }
{ // up the cliff without the vent: the best a crab can do is a bounce, then a trick shot off each coconut it has left
  const s = K.create(L); s.crab.nuts = 3; s.crab.p = at(11.0, 20).slice(); let top = 0;
  face(s, B.p); K.throwNut(s, 0); run(s, 1); K.jump(s);
  for (let i = 0; i < 6 / DT; i++) { const c = s.crab; if (c.air && c.vh < 1 && c.vh > -1 && c.nuts) { c.face = P.toward(c.p, B.p); const n = K.throwNut(s, 0); n.h = c.h - 0.3; n.vh = 0; n.age = 1; } K.step(s, DT, stickTo(s, B.p, 0.2)); top = Math.max(top, c.h); }
  ok(top > 3 && top < L.rings[0].h, `without the vent, even a bounce and a trick shot off every coconut (handed to it at the perfect moment) reaches ${top.toFixed(1)}: the cliff is ${L.rings[0].h}`); }
{ // the shelf: what gets a crab over the step
  const up0 = solve({ stopAtShelf: true }).s; let top = 0; go(up0, at(6.4, 40)); K.jump(up0); for (let i = 0; i < 90; i++) { K.step(up0, DT, stickTo(up0, TOP)); top = Math.max(top, up0.crab.h); }
  ok(K.dist(up0.crab.p, TOP) > 5.6, `on the shelf a jump (${top.toFixed(1)}) doesn't clear the step (${L.rings[3].h})`);
  const s = solve({ stopAtShelf: true }).s; go(s, at(7.4, 40)); face(s, TOP); K.throwNut(s, 0.05); run(s, 1); hop(s, s.nuts.find(n => n.state === 'rest').p); for (let i = 0; i < 120 && s.crab.air; i++) K.step(s, DT, stickTo(s, TOP));
  const inside = K.dist(s.crab.p, TOP) < 5.6;
  ok(inside && s.crab.nuts === 1 && K.count(s).loose === 1, 'a coconut for a stepping stone does: but it stays outside, and the crab is in with one');
  // with one coconut: stand on the plate, shoot the bullseye, run for the gate
  const pl = L.plates[0], tg = L.targets[0];
  go(s, at(4.4, 20)); go(s, at(4.4, -55)); face(s, tg.p); K.throwNut(s, chargeFor(s, tg.p, 1.1)); run(s, 1.2);
  go(s, at(4.4, 20)); go(s, pl.p, [], 0.2); const heldOn = !!s.held.plate, eye = !!s.open.eye;
  go(s, TOP, [], 0.3, 6);
  ok(eye && heldOn && !s.won && !s.held.plate && K.dist(s.crab.p, TOP) >= 1.8 - 0.05, 'the bullseye opens its gate for good, but the plate\'s gate shuts the moment the crab steps off: one coconut inside is not enough');
  // a plain jump doesn't take it back out over the step (with no coconut lying about)
  const s5 = solve({ stopAtShelf: true }).s; s5.nuts = s5.nuts.filter(n => n.state === 'plug'); go(s5, at(4.9, 40)); s5.crab.p = at(5.0, 40).slice(); s5.crab.f = P.toward(s5.crab.p, at(8, 40)); K.jump(s5); for (let i = 0; i < 90; i++) K.step(s5, DT, stickTo(s5, at(8, 40)));
  ok(K.dist(s5.crab.p, TOP) < 5.6, 'a plain jump from inside does not clear the step outward either');
  // the shelf is never a dead end, but the step always costs a coconut: out over the one left at its foot, in again, and the crab is never inside with more than one
  const s6 = solve({ stopAtShelf: true }).s, crossed = []; s6.gull = null;
  const crossIn = () => { go(s6, at(7.4, 40)); face(s6, TOP); K.throwNut(s6, 0.05); run(s6, 1); hop(s6, s6.nuts.find(n => n.state === 'rest' && K.dist(n.p, TOP) > 5).p); for (let i = 0; i < 120 && s6.crab.air; i++) K.step(s6, DT, stickTo(s6, TOP)); crossed.push([K.dist(s6.crab.p, TOP) < 5.6, s6.crab.nuts]); };
  const outAgain = () => { go(s6, at(5.1, 40)); face(s6, at(8, 40)); K.jump(s6); for (let i = 0; i < 90; i++) K.step(s6, DT, stickTo(s6, at(8, 40))); const n = s6.nuts.find(x => x.state === 'rest' && K.dist(x.p, TOP) > 5); if (n) go(s6, n.p, [], 0.3, 4); };
  crossIn(); const first = K.dist(s6.crab.p, TOP) < 5.6; outAgain(); const out = K.dist(s6.crab.p, TOP) > 5.6 && s6.crab.nuts === 2; crossIn();
  ok(first && out && crossed.length === 2 && crossed.every(([ins, n]) => ins && n === 1), 'the shelf is never a dead end: a coconut left at the step\'s foot bounces a crab back out, and picks up again. But over the step it is in with one coconut every time, never two'); }
{ // the gull
  const s = solve({ stopAtShelf: true }).s; go(s, at(7.2, 26)); const before = s.crab.nuts; let ev = [];
  for (let i = 0; i < 20 / DT && !ev.some(e => e.type === 'steal'); i++) ev.push(...K.step(s, DT));
  ok(ev.some(e => e.type === 'gull-up') && ev.some(e => e.type === 'gull-dive') && s.crab.nuts === before - 1 && s.gull.loot === 1 && K.count(s).gull === 1, 'stand still on the shelf and the gull circles, dives and steals a coconut');
  // hit it with the other one
  let hit = false; for (let k = 0; k < 6 && !hit; k++) { face(s, s.gull.p); const d = K.dist(s.crab.p, s.gull.p); if (d < 6.5 && d > 1.2) { const lead = P.walk(s.gull.p, P.tangent(s.gull.p, P.cross(TOP, s.gull.p)), 0); face(s, lead); K.throwNut(s, Math.max(0, Math.min(1, (d - 2) / 5.4))); const e2 = run(s, 1.1); hit = e2.some(e => e.type === 'stun'); ev.push(...e2); if (!hit) { const n = s.nuts.find(x => x.state === 'rest' && K.dist(x.p, TOP) < 9.2 && K.dist(x.p, TOP) > 5.6); if (n) go(s, n.p, [], 0.3, 6); } } else go(s, P.walk(s.crab.p, P.toward(s.crab.p, s.gull.p), (d - 3) / K.R), [], 0.3, 3); }
  ok(hit && s.gull.loot === 0 && K.count(s).loose >= 1, 'hit with a coconut, it is stunned and drops the one it took');
  const s2 = solve({ stopAtShelf: true }).s; s2.crab.nuts = 0; s2.nuts = s2.nuts.filter(n => n.state === 'plug'); go(s2, at(7.2, 26)); const e3 = run(s2, 12);
  ok(e3.some(e => e.type === 'peck') && s2.falls === 1 && s2.cp === 1 && K.dist(s2.crab.p, TOP) < 9.2, 'with nothing to steal it pecks the crab back to the shelf\'s flag (not down to the beach)'); }
{ // never stuck: the slide
  const s = solve({ stopAtShelf: true }).s; go(s, at(8.4, 100)); go(s, at(8.4, 180)); go(s, at(10.5, 180), [], 0.3, 5);
  ok(K.dist(s.crab.p, TOP) > 9.2, 'a slide at the back of the shelf goes down to the beach again (and only down), so nothing up there is a dead end'); }

// ── what a person does with a thumb: held stick and jump button, no teleports ───
{ // standing on top of the rocks
  const s = K.create(L); s.crab.p = beach(30, BANK + 0.1).slice(); s.crab.f = P.toward(s.crab.p, R1.p); const ev = [];
  K.jump(s); for (let i = 0; i < 120 && (s.crab.air || !i); i++) ev.push(...K.step(s, DT, stickTo(s, R1.p, Math.min(1, K.dist(s.crab.p, R1.p) / 0.5))));
  const land = ev.find(e => e.type === 'land');
  ok(land && land.onRock && !s.falls && Math.abs(s.crab.h - K.ROCK_H) < 1e-6 && K.dist(s.crab.p, R1.p) < R1.r, `a jump from the bank lands ON the first rock: the crab stands ${K.ROCK_H} high on top of it, not down on the sea floor`);
  const p0 = s.crab.p.slice(); run(s, 2);
  ok(K.dist(s.crab.p, p0) < 0.01 && s.crab.h === K.ROCK_H && !s.falls, 'and stays there: the current doesn\'t take a crab off a rock');
  // walking off the far edge: it falls, and then the water has it
  const off = K.create(L); off.crab.p = R1.p.slice(); off.crab.h = K.ROCK_H; off.crab.f = P.toward(R1.p, at(10, 60)); const ev2 = []; let air = false;
  for (let i = 0; i < 60; i++) { ev2.push(...K.step(off, DT, { x: 0, y: 1 })); air = air || off.crab.air; }
  ok(air && off.crab.h < K.ROCK_H && K.dist(off.crab.p, R1.p) > R1.r, 'walking off the edge of a rock: the crab drops to the water, and is carried');
  // a gap between rocks can't be walked across (the fall off a rock is too short to glide over it), but can be jumped
  const gapWalk = (from, to, jumpAt) => { const w = K.create(L); w.crab.p = from.p.slice(); w.crab.h = K.ROCK_H; w.crab.f = P.toward(from.p, to.p); let ended = null;
    for (let i = 0; i < 4 / DT && !w.falls; i++) { if (jumpAt != null && Math.abs(i * DT - jumpAt) < DT / 2) K.jump(w); K.step(w, DT, stickTo(w, to.p)); if (!w.crab.air && K.dist(w.crab.p, to.p) < to.r) { ended = 'on'; break; } } return ended; };
  ok(!gapWalk(R1, B, null), 'walking from the first rock toward vent B\'s without jumping never gets there: the fall off the rock is too short to glide across, and the current carries a crab past');
  ok(gapWalk(R1, B, 0.05) === 'on', 'jumping at the edge does'); }
{ // the vent, with a person steering: jump from the rock onto B, hold the stick at the shelf, and the crab goes up and over the cliff
  const trip = (plan, plug) => {
    const s = K.create(L); if (plug) s.plug.A = 99; s.nuts = [];
    s.crab.p = R1.p.slice(); s.crab.h = K.ROCK_H; s.crab.f = P.toward(R1.p, B.p); K.jump(s);
    let maxH = 0, landedB = false, lifted = false; const ev = [], toShelf = at(7.6, 30), t0 = s.t;
    for (let i = 0; i < 7 / DT; i++) {
      const st = plan === 'always' ? stickTo(s, toShelf) : plan === 'late' ? (s.crab.h > L.rings[0].h + 0.3 || !s.crab.lifted && !s.crab.air ? stickTo(s, toShelf) : { x: 0, y: 1 }) : (landedB || lifted ? { x: 0, y: 0 } : { x: 0, y: 1 });
      const e = K.step(s, DT, st); ev.push(...e); maxH = Math.max(maxH, s.crab.h);
      if (e.some(x => x.type === 'land' && x.onRock)) landedB = K.dist(s.crab.p, B.p) < B.r + 0.1;
      if (e.some(x => x.type === 'lift')) lifted = true;
      if (i > 60 && !s.crab.air && s.t - t0 > 0.5) break;
    }
    return { s, ev, maxH, lifted, landedB, over: K.dist(s.crab.p, TOP) < 9.2 };
  };
  for (const [name, plan] of [['the stick held at the shelf the whole time', 'always'], ['forward in the air, at the shelf once it is up', 'late']]) {
    const r = trip(plan, true);
    ok(r.lifted && r.maxH > L.rings[0].h && r.over && !r.s.falls, `the lift with a person steering (${name}): up ${r.maxH.toFixed(1)}, over the ${L.rings[0].h} cliff, down on the shelf`); }
  const still = trip('none', true);
  ok(still.lifted && still.maxH > L.rings[0].h && !still.over, 'letting go of the stick on B: it goes straight up and comes straight down again on the rock; the lift alone doesn\'t carry a crab over, the stick does');
  const dead = trip('always', false);
  ok(!dead.lifted && dead.maxH < 2 && !dead.over, 'with vent A still open B never lifts the crab, however it steers'); }
{ // the dam: the dry ledge west of the current can't be walked along to the cliff foot
  const s = K.create(L); s.crab.p = at(9.5, -150).slice(); s.crab.f = P.toward(s.crab.p, at(9.5, -100)); let lonMax = -999;
  for (let i = 0; i < 12 / DT; i++) { K.step(s, DT, stickTo(s, at(9.5, 60))); lonMax = Math.max(lonMax, K.lonOf(s.crab.p)); }
  ok(lonMax < -114 && !s.falls, `walking east along the dry ledge at the cliff's foot stops at the dam of spring rocks (as far as ${lonMax.toFixed(0)}°, the dam is at -115°): no free ride onto vent B's rock`); }

console.log(fails ? `\nLAIR FAIL (${fails})` : '\nLAIR PASS');
process.exit(fails ? 1 : 0);
