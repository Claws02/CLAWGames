// World 3 of Old Ink's Lair (the volcano), chambers 10–12: each played through by a player that uses only the stick, the jump button
// and the throw, and the shortcuts each one must shut.  node qa/lair-world3.mjs
import { K, P, at, TOP, DT, stickTo, run, go, hop, face, gather, chargeFor, findThrow, throwFor } from './lair-solve.mjs';
const { STONES, CANNONS, KING, CHAMBERS } = K;
let fails = 0;
const ok = (c, msg) => { if (msg) console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const has = (ev, t) => ev.some(e => e.type === t);
// walk a list of places in turn
const via = (s, pts, ev = [], near = 0.25) => { for (const p of pts) go(s, p, ev, near, 20); return ev; };
const throwAt = (s, p, f, ev) => { face(s, p); const side = P.cross(s.crab.p, s.crab.face), r = f.a * Math.PI / 180; s.crab.face = P.tangent(s.crab.p, P.mix(s.crab.face, side, Math.cos(r), Math.sin(r))); K.throwNut(s, f.ch); ev.push(...run(s, 3)); };
const settle = (s, ev = []) => { for (let i = 0; i < 200 && s.crab.air; i++) ev.push(...K.step(s, DT)); return ev; };
// across the lava river at lon on a cooled rock at distance dRock (both ways)
const cross = (s, lon, dRock, inward, ev) => {
  const [a, b] = inward ? [15.55, 9.85] : [9.85, 15.55];
  go(s, at(a, lon), ev, 0.12, 12); hop(s, at(dRock, lon), ev); settle(s, ev);
  go(s, at(dRock + (inward ? -0.65 : 0.65), lon), ev, 0.1, 4); hop(s, at(b + (inward ? -0.6 : 0.6), lon), ev); settle(s, ev);
  return ev;
};

// ── 10. Heavy Stone ─────────────────────────────────────────────────────────
export const stones = () => {
  const s = K.create(STONES), ev = [], note = {}, L = 40;
  go(s, STONES.stones[0].p, ev, 0.2, 10); note.picked = s.crab.stone === 0;
  go(s, at(15.6, L), ev, 0.12, 10); face(s, TOP); K.throwNut(s, 1); ev.push(...run(s, 1.2));
  note.cooled = has(ev, 'cool') && s.cooled.length === 1; note.rock = s.cooled[0] ? K.dist(s.cooled[0].p, TOP) : 0;
  ev.push(...run(s, 2.2)); note.back = s.stones[0].state === 'rest';
  go(s, STONES.stones[0].p, ev, 0.2, 10); note.picked2 = s.crab.stone === 0;
  cross(s, L, note.rock, true, ev); note.over = K.dist(s.crab.p, TOP) < 10 && s.crab.stone === 0 && !s.falls;
  const pl = STONES.plates[0]; go(s, at(7.9, 125), ev, 0.15, 12); face(s, pl.p); K.throwNut(s, chargeFor(s, pl.p)); ev.push(...run(s, 1.5));
  note.heavy = !!s.held.heavy;
  cross(s, L, note.rock, false, ev); note.backOut = K.dist(s.crab.p, TOP) > 15.4 && !s.falls;
  gather(s, ev); note.nuts = s.crab.nuts;
  cross(s, L, note.rock, true, ev); note.over2 = K.dist(s.crab.p, TOP) < 10 && s.crab.nuts === 3 && !s.falls;
  via(s, [at(8.6, 0), at(8.4, -110)], ev, 0.15); const f = throwFor(s, STONES.targets[0].p, 'target'); if (f) throwAt(s, STONES.targets[0].p, f, ev);
  note.eye = !!s.open.eye;
  go(s, at(8.2, -75), ev, 0.3, 6); go(s, TOP, ev, 0.3, 15); note.won = s.won; note.t = s.t; note.falls = s.falls;
  return { s, ev, note };
};
{ const { note } = stones();
  ok(note.picked, '10. HEAVY STONE: walking into a stone with empty claws picks it up (both claws)');
  ok(note.cooled && note.rock > 11 && note.rock < 14.5, `    lobbed into the lava river, it cools into a stepping rock (${note.rock.toFixed(1)} from the pearl)`);
  ok(note.back && note.picked2, '    and a fresh stone rolls out of the quarry');
  ok(note.over, '    rock-hopping over the river with a stone in the claws');
  ok(note.heavy, '    the stone on the iron plate holds the outer fence');
  ok(note.backOut && note.nuts === 3 && note.over2, '    back out over the rock for the coconuts, and in again with all three');
  ok(note.eye, '    a coconut into the bullseye on its post in the lava pool opens the inner fence');
  ok(note.won && note.falls === 0, `    the pearl (${note.t.toFixed(0)} s, no falls)`);
  const a = stones(), b = stones(); ok(a.note.t === b.note.t && a.s.crab.p.join() === b.s.crab.p.join(), '    played twice, it goes the same way (nothing random)');
}
{ // shortcuts
  let over = 0; for (let lon = 0; lon < 360; lon += 20) for (const st of [0.6, 1]) { const q = K.create(STONES); q.crab.p = at(15.5, lon); q.crab.f = P.tangent(q.crab.p, TOP); hop(q, at(9, lon)); settle(q); run(q, 0.3); if (!q.falls && K.dist(q.crab.p, TOP) < 10.2) over++; }
  ok(over === 0, '   a jump from the bank never clears the lava river (all round)');
  let bounced = 0; for (let lon = 0; lon < 360; lon += 30) { const q = K.create(STONES); q.crab.p = at(16.6, lon); q.crab.f = P.tangent(q.crab.p, TOP); q.crab.nuts = 1; face(q, TOP); K.throwNut(q, 0); run(q, 1); const n = q.nuts.find(x => x.state === 'rest' && K.dist(x.p, TOP) > 15); if (!n) continue; q.crab.p = at(16.9, lon); hop(q, n.p); for (let i = 0; i < 200 && q.crab.air; i++) K.step(q, DT, stickTo(q, TOP)); run(q, 0.3); if (!q.falls && K.dist(q.crab.p, TOP) < 10.2) bounced++; }
  ok(bounced === 0, '   bouncing on a coconut at the bank doesn\'t clear it either (it\'s 5.4 wide)');
  { const q = K.create(STONES), pl = STONES.plates[0]; q.crab.p = pl.p.slice(); run(q, 0.5); const byCrab = !!q.held.heavy; q.crab.p = at(8, 125); q.nuts.push({ id: 99, p: pl.p.slice(), d: P.tangent(pl.p, [1, 0, 0]), v: 0, h: 0, vh: 0, state: 'rest', age: 9, still: 0 }); run(q, 0.5); ok(!byCrab && !q.held.heavy, '   the iron plate doesn\'t feel a crab or a coconut'); }
  { const q = K.create(STONES); q.crab.nuts = 1; q.crab.p = STONES.stones[0].p.slice(); const e = run(q, 0.4); ok(q.crab.stone < 0 && has(e, 'stone-full'), '   with a coconut in the claws you can\'t pick a stone up (and it says so)'); }
  { const q = K.create(STONES); q.crab.p = STONES.stones[0].p.slice(); run(q, 0.3); const n = q.nuts.find(x => x.state === 'rest'); q.crab.p = n.p.slice(); run(q, 1); ok(q.crab.stone === 0 && q.crab.nuts === 0, '   with a stone in the claws you can\'t pick coconuts up'); }
  { const q = K.create(STONES); q.crab.p = at(12.5, 90); q.crab.h = 0; const e = run(q, 0.3); ok(has(e, 'burn') && q.falls === 1, '   the lava burns: back to the flag'); }
  { const q = K.create(STONES); q.crab.p = at(15.6, 200); q.crab.f = P.tangent(q.crab.p, TOP); go(q, STONES.stones[1].p, [], 0.2, 10); const e = []; go(q, at(15.6, 60), e, 0.12, 10); face(q, at(14, 60)); K.throwNut(q, 0); e.push(...run(q, 1)); const nearBank = q.cooled.length && K.dist(q.cooled[0].p, TOP) > 14; ok(nearBank, '   a short lob cools a rock right by the bank (and the quarry keeps rolling out stones, so a wasted one is never a soft-lock)'); }
  { let hit = 0, tries = 0; for (let d = 16; d <= 19; d += 1) for (let lon = -150; lon <= -70; lon += 10) for (let ch = 0; ch <= 1; ch += 0.1) { const q = K.create(STONES); q.crab.p = at(d, lon); q.crab.nuts = 1; face(q, STONES.targets[0].p); K.throwNut(q, ch); run(q, 2.5); tries++; if (q.open.eye) hit++; }
    ok(hit === 0, `   no throw from the beach reaches the bullseye over the river (${tries} tried)`); }
}

// ── 11. Cannon Ridge ────────────────────────────────────────────────────────
const GUN = CANNONS.cannons[0];
const cannons = () => {
  const s = K.create(CANNONS), ev = [], note = {};
  gather(s, ev); note.nuts = s.crab.nuts;
  go(s, GUN.crank, ev, 0.2, 10); note.aim1 = s.aim[0]; go(s, at(17.4, -12), ev, 0.2, 5);
  go(s, at(17.45, 0), ev, 0.1, 6); const f1 = throwFor(s, GUN.p, 'target', 260); note.f1 = !!f1; if (f1) throwAt(s, GUN.p, f1, ev);
  note.fired = has(ev, 'cannon'); note.bridge = !!s.open.bridge;
  go(s, GUN.crank, ev, 0.2, 10); note.aim2 = s.aim[0]; go(s, at(17.4, -12), ev, 0.2, 5);
  go(s, at(17.45, 0), ev, 0.1, 6); const f2 = throwFor(s, GUN.p, 'press', 260); if (f2) throwAt(s, GUN.p, f2, ev);
  note.plate = !!s.held.plate;
  via(s, [at(14.6, 40), at(14.6, 100), at(14.6, 150), at(13.8, 180), at(6, 180)], ev, 0.3); go(s, TOP, ev, 0.3, 15);
  note.won = s.won; note.t = s.t; note.falls = s.falls;
  return { s, ev, note };
};
{ const { note } = cannons();
  ok(note.aim1 === 1, '11. CANNON RIDGE: walking into the wheel turns the cannon to its next aim (the pillar)');
  ok(note.fired && note.bridge, '    a coconut dropped in the barrel is fired at the bullseye on the pillar: the causeway comes down');
  ok(note.aim2 === 2 && note.plate, '    the wheel again, onto the stack: the next coconut lands on its plate and the fence opens');
  ok(note.won && note.falls === 0, `    over the causeway to the pearl (${note.t.toFixed(0)} s, no falls)`);
}
{ let eye = 0, plate = 0, n = 0;
  for (let d = 13.3; d <= 18; d += 0.7) for (let lon = -110; lon <= 110; lon += 10) for (let ch = 0; ch <= 1.001; ch += 0.1) for (const tg of ['eye', 'plate']) {
    const q = K.create(CANNONS); q.cannonsOff = true; q.crab.p = at(d, lon); q.crab.nuts = 1; face(q, tg === 'eye' ? CANNONS.targets[0].p : CANNONS.plates[0].p); const nn = K.throwNut(q, ch); if (K.dist(q.crab.p, GUN.p) < 3) continue;
    const e = run(q, 2.5); if (has(e, 'cannon')) continue; n++; if (q.open.bridge) eye++; if (q.held.plate) plate++; }
  ok(eye === 0 && plate === 0, `   no throw from the rim (without the cannon) reaches the pillar's bullseye or lands on the stack's plate (${n} tried)`);
  let fromBridge = 0; for (let d = 4.2; d <= 13; d += 0.8) for (let ch = 0; ch <= 1.001; ch += 0.1) for (let a = -90; a <= 90; a += 30) { const q = K.create(CANNONS); q.open.bridge = true; q.crab.p = at(d, 180 + a / 10); q.crab.h = 0.4; q.crab.nuts = 1; face(q, CANNONS.plates[0].p); K.throwNut(q, ch); run(q, 2.5); if (q.held.plate) fromBridge++; }
  ok(fromBridge === 0, '   nor from the causeway, once it is down');
  { const q = K.create(CANNONS); q.crab.p = at(9, 180); q.crab.h = 0; const e = run(q, 0.3); ok(has(e, 'burn'), '   the causeway is only there while the bullseye holds (before: lava)'); }
  { const q = K.create(CANNONS), seen = []; for (let k = 0; k < 4; k++) { q.crab.p = GUN.crank.slice(); run(q, 0.1); seen.push(q.aim[0]); q.crab.p = at(17.5, -30); run(q, 0.1); } ok(seen.join() === '1,2,0,1', `   the wheel turns the cannon round its aims in order, once per visit (${seen.join(' → ')})`); }
}

// ── 12. The Hermit King ─────────────────────────────────────────────────────
const inBand = (s, p) => { const d = K.dist(p, TOP); return d > KING.tide.r0 - 0.2 && d < KING.tide.r1 + 0.15; };
const lavaSoon = s => { const ph = K.tidePhase(KING, K.tideClock(s)); return ph.name !== 'out' || ph.left < 2.2; };
// Old Ink's fighter (qa/lair-solve.mjs), and minds the rising lava: when it's coming, into the middle ring.
const kingFight = (s, ev, note, secs) => {
  const b = s.boss; note.hits = 0; note.slams = 0; let wait = 0;
  for (let i = 0; i < secs / DT && b.state !== 'down' && !s.won; i++) {
    const c = s.crab; let stick = { x: 0, y: 0 }; wait -= DT; const dC = K.dist(c.p, TOP);
    if (dC < 2.05) stick = stickTo(s, at(2.7, K.lonOf(c.p)));
    else if (dC > 3.05 && (lavaSoon(s) || b.state === 'sleep')) stick = stickTo(s, at(2.6, K.lonOf(c.p)));
    else if (b.state === 'wind' && K.dist(c.p, b.tx) < 1.6) { const side = ((K.lonOf(c.p) - K.lonOf(b.tx) + 540) % 360) - 180 >= 0 ? 1 : -1; stick = stickTo(s, at(2.5, K.lonOf(c.p) + side * 25)); }
    else if (c.nuts > 0 && !c.air && b.state !== 'hurt' && wait <= 0) {
      const f = findThrow(s, 'ink-hit');
      if (f) { face(s, TOP); const side = P.cross(c.p, c.face), r = f.a * Math.PI / 180; c.face = P.tangent(c.p, P.mix(c.face, side, Math.cos(r), Math.sin(r))); K.throwNut(s, f.ch); }
      else { wait = 0.15; stick = stickTo(s, at(2.5, K.lonOf(c.p) + 8)); }
    } else if (c.nuts < K.CARRY && !c.air) {
      const n = s.nuts.filter(x => x.state === 'rest' && !(lavaSoon(s) && inBand(s, x.p))).sort((x, y) => K.dist(x.p, c.p) - K.dist(y.p, c.p))[0];
      if (n && (b.state !== 'wind' || K.dist(n.p, b.tx) > 1.6)) stick = stickTo(s, n.p);
    }
    for (const e of K.step(s, DT, stick)) { ev.push(e); if (e.type === 'ink-slam') note.slams++; if (e.type === 'ink-hit') note.hits++; }
  }
  return note;
};
const KGUN = KING.cannons[0];
const king = () => {
  const s = K.create(KING), ev = [], note = {}, L = 30;
  go(s, KING.stones[0].p, ev, 0.2, 10); go(s, at(15.6, L), ev, 0.12, 10); face(s, TOP); K.throwNut(s, 1); ev.push(...run(s, 1.2));
  const dRock = s.cooled[0] ? K.dist(s.cooled[0].p, TOP) : 0; note.cooled = !!s.cooled.length;
  gather(s, ev); note.nuts = s.crab.nuts; cross(s, L, dRock, true, ev); note.over = K.dist(s.crab.p, TOP) < 10 && s.crab.nuts === 3;
  go(s, KGUN.crank, ev, 0.2, 10); note.aim = s.aim[0]; go(s, at(9.6, 15), ev, 0.2, 5);
  const back = at(10.2 - 0.6, 25); go(s, at(K.dist(KGUN.p, TOP) + 2.05, 25), ev, 0.1, 6); const f = throwFor(s, KGUN.p, 'target', 260); if (f) throwAt(s, KGUN.p, f, ev);
  note.arena = !!s.open.arena;
  for (let i = 0; i < 20 / DT && lavaSoon(s); i++) ev.push(...K.step(s, DT));
  go(s, at(6.5, 0), ev, 0.3, 6); go(s, at(2.6, 0), ev, 0.25, 6);
  const f0 = s.falls; kingFight(s, ev, note, 400); note.down = s.boss.state === 'down'; note.fightFalls = s.falls - f0;
  go(s, TOP, ev, 0.3, 10); note.won = s.won; note.t = s.t; note.burns = ev.filter(e => e.type === 'burn').length;
  return { s, ev, note };
};
{ const { note } = king();
  ok(note.cooled && note.over, '12. THE HERMIT KING: a stone cooled in the river, and over it with all three coconuts');
  ok(note.aim === 1 && note.arena, '    the cannon turned onto the pillar: the bullseye opens the arena');
  ok(note.down && note.hits === 4, `    four hits on his head, each just after a slam (${note.slams} slams, ${note.fightFalls} knocks/burns)`);
  ok(note.won, `    the pearl (${note.t.toFixed(0)} s)`);
}
{ const calm = K.create(KING); calm.open.arena = true; calm.crab.p = at(4.0, 90); for (let i = 0; i < 16 / DT; i++) { calm.crab.p = at(6.5, 0); K.step(calm, DT); }
  const asleep = (calm.tideW || 0) === 0;
  // (awake, but never slamming: a stand-in for the fight, so only the lava acts)
  const awake = q => { q.boss.state = 'idle'; q.boss.t = -999; q.boss.wakeAt = q.t; };
  const q = K.create(KING); awake(q); let burned = false, safe = true;
  for (let i = 0; i < 16 / DT; i++) { q.boss.t = -999; q.nuts = []; if (!q.crab.air) q.crab.p = at(4.0, 90); const e = K.step(q, DT); if (has(e, 'burn')) { burned = true; break; } }
  const q2 = K.create(KING); awake(q2); q2.crab.p = at(4.5, 45); q2.crab.h = 1.4; for (let i = 0; i < 16 / DT; i++) { q2.boss.t = -999; q2.nuts = []; const e = K.step(q2, DT); if (has(e, 'burn')) safe = false; }
  ok(asleep && burned && safe, '   while he\'s up the lava rises round the edge of the arena and burns (not on a basalt stump); asleep, it stays down'); }
{ const q = K.create(KING); q.crab.nuts = 1; q.crab.p = at(8.8, 140); let hit = 0; for (let d = 6; d <= 10; d += 0.5) for (let lon = -120; lon <= 0; lon += 10) for (let ch = 0; ch <= 1; ch += 0.1) { const r = K.create(KING); r.crab.p = at(d, lon); r.crab.nuts = 1; face(r, KING.targets[0].p); K.throwNut(r, ch); const e = run(r, 2.5); if (!has(e, 'cannon') && r.open.arena) hit++; }
  ok(hit === 0, '   no throw reaches the arena\'s bullseye on its pillar (only the cannon)'); }

{ const order = CHAMBERS.map(c => c.id).slice(8, 12).join();
  ok(order === 'slide,stones,cannons,king' && KING.boss.kind === 'hermit', 'World 3 is: Obsidian Slide, Heavy Stone, Cannon Ridge, then the Hermit King'); }
console.log(fails ? `\nWORLD 3 FAIL (${fails})` : '\nWORLD 3 PASS');
process.exit(fails ? 1 : 0);
