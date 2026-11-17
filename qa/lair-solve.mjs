// The player that solves The Drowned Stair: the moves a person would make (walk, jump, throw,
// wait for the gull), played on a LairLogic state. Shared by qa/lair.mjs (to prove the answer and
// that the other ways are shut) and qa/planet.js (to play the answer on screen).
import * as K from '../src/arcade/LairLogic.js';
import * as P from '../src/arcade/PlanetLogic.js';
export { K, P };
export const { at, TOP, STAIR: L } = K; export const DT = 1 / 60;
export const A = L.vents[0], B = L.vents[1], [R1] = L.rocks, BANK = L.bank;
export const beach = (lon, d = BANK + 0.45) => at(d, lon);        // a place on the near bank
export const lobbed = (s, p, land) => { s.crab.p = p.slice(); face(s, land); const n = K.throwNut(s, chargeFor(s, land)); return n; };
export const stickTo = (s, p, mag = 1) => { const c = s.crab, d = P.toward(c.p, p), r = P.cross(c.f, c.p); return { x: P.dot(d, r) * mag, y: P.dot(d, c.f) * mag }; };
export const run = (s, secs, stick = { x: 0, y: 0 }) => { const ev = []; for (let t = 0; t < secs; t += DT) ev.push(...K.step(s, DT, stick)); return ev; };
// the moves a player makes
export const go = (s, p, ev = [], near = 0.15, secs = 20) => { for (let i = 0; i < secs / DT && !s.won && K.dist(s.crab.p, p) > near; i++) ev.push(...K.step(s, DT, stickTo(s, p))); return ev; };
export const hop = (s, p, ev = []) => { K.jump(s); for (let i = 0; i < 200 && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, p, Math.min(1, K.dist(s.crab.p, p) / 0.5)))); return ev; };
export const face = (s, p) => { s.crab.face = P.toward(s.crab.p, p); };
export const gather = (s, ev = []) => { for (let k = 0; k < 6 && s.crab.nuts < K.CARRY; k++) { const n = s.nuts.find(x => x.state === 'rest' && K.dist(x.p, L.palm) < 2); if (!n) break; go(s, n.p, ev, 0.3); } return ev; };
// the charge that makes a throw from here pass a place (a bullseye) or land on one (a plate)
export const chargeFor = (s, p, high = 0) => { let best = 0, bd = 9; for (let ch = 0; ch <= 1.001; ch += 0.02) { const a = K.aim(s, ch); const d = high ? Math.min(...a.path.map(q => Math.hypot(K.dist(q[0], p), q[1] - high))) : K.dist(a.p, p); if (d < bd) { bd = d; best = ch; } } return best; };

export const solve = (opt = {}) => {
  const s = opt.s || K.create(L), ev = [], note = {};
  if (opt.from !== 'shelf') {
  gather(s, ev);
  // 1. the far side of the current, upstream of the cove: the water does the rest
  go(s, beach(-20), ev); face(s, at(10.8, -20)); K.throwNut(s, chargeFor(s, at(10.8, -20)));
  for (let i = 0; i < 12 / DT && !s.plug.A; i++) ev.push(...K.step(s, DT));
  note.plugged = !!s.plug.A; note.t1 = s.t;
  // 2. across the rocks to vent B, and up
  go(s, beach(30, BANK + 0.1), ev); hop(s, R1.p, ev); hop(s, B.p, ev);
  note.onB = K.dist(s.crab.p, B.p) < B.r + 0.4 && !s.falls;
  go(s, B.p, ev, 0.2, 2);
  for (let i = 0; i < 4 / DT && s.crab.h < B.lift - 0.2; i++) ev.push(...K.step(s, DT));
  for (let i = 0; i < 3 / DT && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, at(7.6, 26))));
  note.shelf = K.dist(s.crab.p, TOP) < 9.2 && s.crab.nuts === 2; note.t2 = s.t;
  }                                     // (opt.from === 'shelf': carry on from here)
  if (opt.stopAtShelf) return { s, ev, note };
  // 3. the step: stand by it, let the gull come down, step aside, and jump on its back
  const spot = at(6.25, 26);
  for (let n = 0; n < 4 && K.dist(s.crab.p, TOP) > 5.6 && !s.won; n++) {
    go(s, spot, ev, 0.2, 6);
    for (let i = 0; i < 14 / DT && s.gull.state !== 'dive'; i++) ev.push(...K.step(s, DT, K.dist(s.crab.p, spot) > 0.25 ? stickTo(s, spot) : { x: 0, y: 0 }));
    const aside = at(6.3, 26 + 16);
    for (let i = 0; i < 2 / DT && s.gull.state === 'dive'; i++) ev.push(...K.step(s, DT, stickTo(s, aside)));
    if (s.gull.state !== 'ground') continue;
    K.jump(s);
    for (let i = 0; i < 2 / DT && s.crab.air; i++) { const hit = ev.length; ev.push(...K.step(s, DT, stickTo(s, s.gull.state === 'stun' ? at(4.6, 26) : s.gull.p, s.gull.state === 'stun' ? 1 : Math.min(1, K.dist(s.crab.p, s.gull.p) / 0.5)))); }
  }
  note.over = K.dist(s.crab.p, TOP) < 5.6 && s.crab.nuts === 2; note.t3 = s.t;
  if (opt.stopInside) return { s, ev, note };
  // 4. one coconut on the plate, one into the bullseye, and through both gates to the pearl
  const pl = L.plates[0], tg = L.targets[0];
  go(s, at(4.4, 70), ev); face(s, pl.p); K.throwNut(s, chargeFor(s, pl.p)); ev.push(...run(s, 1.2));
  go(s, at(4.4, 20), ev); go(s, at(4.4, -55), ev); face(s, tg.p); K.throwNut(s, chargeFor(s, tg.p, 1.1)); ev.push(...run(s, 1.2));
  if (opt.stopAtBoss) return { s, ev, note };
  // 5. Old Ink: dodge his slams, pick up the piles, and throw at his head when he is dizzy; then a coconut on the plate and the pearl
  go(s, at(2.5, -100), ev, 0.2, 8); fight(s, ev, note);
  while (s.crab.nuts < 1) { const n = s.nuts.find(x => x.state === 'rest'); if (!n) break; go(s, n.p, ev, 0.3, 10); }
  go(s, at(3.7, -100), ev, 0.2, 8); go(s, at(4.4, -60), ev, 0.2, 10); go(s, at(4.4, 20), ev, 0.2, 20); go(s, at(4.4, 70), ev, 0.2, 20); face(s, pl.p); K.throwNut(s, chargeFor(s, pl.p)); ev.push(...run(s, 1.5));
  go(s, at(4.4, -10), ev, 0.2, 20); go(s, at(4.4, -60), ev, 0.2, 10); go(s, at(3.4, -100), ev, 0.2, 10); go(s, at(2.5, -100), ev, 0.2, 5); go(s, at(2.5, -150), ev, 0.2, 10); go(s, TOP, ev, 0.3, 12);
  return { s, ev, note };
};

/** A throw (an aim, a charge) that the simulation says will do `want` (an event type); null if none does. The state is copied, never touched. */
export const findThrow = (s, want) => {
  const c = s.crab;
  for (let a = -30; a <= 30; a += 6) for (let ch = 0; ch <= 1.001; ch += 0.1) {
    const q = { ...s, crab: { ...s.crab }, nuts: s.nuts.map(n => ({ ...n })), boss: { ...s.boss, arms: [...s.boss.arms] }, gull: null, back: [], open: { ...s.open }, held: { ...s.held }, plug: { ...s.plug } }; face(q, TOP); const f = q.crab.face, side = P.cross(q.crab.p, f), r = a * Math.PI / 180;
    q.crab.face = P.tangent(q.crab.p, P.mix(f, side, Math.cos(r), Math.sin(r)));
    if (!K.throwNut(q, ch)) continue;
    for (let k = 0; k < 70; k++) if (K.step(q, DT).some(e => e.type === want)) return { a, ch };
  }
  return null;
};
/** A player who beats Old Ink: keeps off the slam ring, gathers the piles, stuns two arms with coconuts, then throws at his head while he is dizzy. */
export const fight = (s, ev = [], note = {}, secs = 300) => {
  const b = s.boss; note.slams = 0; note.dizzy = 0; note.arms = 0; note.fightT0 = s.t; let wait = 0;
  for (let i = 0; i < secs / DT && b.state !== 'down' && !s.won; i++) {
    const c = s.crab; let stick = { x: 0, y: 0 }; wait -= DT;
    if (b.state === 'wind' && K.dist(c.p, b.tx) < 1.6) {
      const side = ((K.lonOf(c.p) - K.lonOf(b.tx) + 540) % 360) - 180 >= 0 ? 1 : -1;
      stick = stickTo(s, at(2.4, K.lonOf(c.p) + side * 25));
    } else if (c.nuts > 0 && !c.air && (b.state === 'dizzy' || (b.state !== 'hurt' && wait <= 0))) {
      const want = b.state === 'dizzy' ? 'ink-hit' : 'ink-arm', f = findThrow(s, want);
      if (f) { face(s, TOP); const side = P.cross(c.p, c.face), r = f.a * Math.PI / 180; c.face = P.tangent(c.p, P.mix(c.face, side, Math.cos(r), Math.sin(r))); K.throwNut(s, f.ch); note.threw = (note.threw || 0) + 1; }
      else { wait = 0.15; stick = stickTo(s, at(2.45, K.lonOf(c.p) + 8)); }
    } else if (b.state !== 'dizzy' && c.nuts < K.CARRY && !c.air) {
      const n = s.nuts.filter(x => x.state === 'rest').sort((x, y) => K.dist(x.p, c.p) - K.dist(y.p, c.p))[0];
      if (n && (b.state !== 'wind' || K.dist(n.p, b.tx) > 1.6)) stick = stickTo(s, n.p);
    }
    for (const e of K.step(s, DT, stick)) { ev.push(e); if (e.type === 'ink-slam') note.slams++; if (e.type === 'ink-dizzy') note.dizzy++; if (e.type === 'ink-arm') note.arms++; }
  }
  note.fightT = s.t - note.fightT0; return note;
};
