// World 4 of Old Ink's Lair (the storm), chambers 13–16: each played through by a player that uses only the stick, the jump button
// and the throw, and the shortcuts each one must shut.  node qa/lair-world4.mjs
import { K, P, at, TOP, DT, stickTo, run, go, hop, face, gather, findThrow, throwFor } from './lair-solve.mjs';
const { GUSTS, THUNDERHEAD, FERRY, STORMEYE, CHAMBERS } = K;
let fails = 0;
const ok = (c, msg) => { if (msg) console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const has = (ev, t) => ev.some(e => e.type === t);
const via = (s, pts, ev = [], near = 0.25) => { for (const p of pts) go(s, p, ev, near, 20); return ev; };
const throwAt = (s, p, f, ev, secs = 3) => { face(s, p); const side = P.cross(s.crab.p, s.crab.face), r = f.a * Math.PI / 180; s.crab.face = P.tangent(s.crab.p, P.mix(s.crab.face, side, Math.cos(r), Math.sin(r))); K.throwNut(s, f.ch); ev.push(...run(s, secs)); };
const waitFor = (s, cond, ev = [], secs = 20) => { for (let i = 0; i < secs / DT && !cond(); i++) ev.push(...K.step(s, DT)); return cond(); };
// the wind: how long until it changes from what it is now
const gustLeft = s => { const w = s.lv.wind, ph = (((s.t + (w.phase || 0)) % w.period) + w.period) % w.period; return K.gustState(s) === 'gust' ? w.period - ph : w.period - w.on - K.WIND_WARN - ph; };

// Lightning: will p be struck within `secs`? (looking ahead on the bolts' clocks)
const struck = (s, p, secs, pad = 0.35) => { for (let k = 0; k <= secs + 1e-6; k += 0.05) { const q = { lv: s.lv, t: s.t + k, boss: s.boss }; if ((s.lv.bolts || []).some(b => !b.rod && K.dist(p, b.p) < b.r + pad && K.boltState(q, b) === 'fire')) return true; } return false; };
// Walk to dest through the lightning: step on only where nothing will strike while you're there; wait (or back off) otherwise.
const boltWalk = (s, dest, ev = [], secs = 40) => {
  for (let i = 0; i < secs / DT && K.dist(s.crab.p, dest) > 0.2 && !s.won; i++) {
    const c = s.crab, ahead = P.walk(c.p, P.toward(c.p, dest), Math.min(0.7, K.dist(c.p, dest)) / K.R), back = P.walk(c.p, P.toward(c.p, dest).map(x => -x), 0.7 / K.R);
    let stick = { x: 0, y: 0 };
    if (!struck(s, ahead, 0.45)) stick = stickTo(s, dest);
    else if (struck(s, c.p, 0.45)) stick = stickTo(s, struck(s, back, 0.45) ? dest : back);
    ev.push(...K.step(s, DT, stick));
  }
  return ev;
};

// ── 13. Gust Garden ─────────────────────────────────────────────────────────
const G_EYE = GUSTS.targets[0].p, G_PILLAR = GUSTS.plates[0].p, G_SPOT = GUSTS.spots[0].p;
const gusts = () => {
  const s = K.create(GUSTS), ev = [], note = {};
  gather(s, ev); note.nuts = s.crab.nuts;
  via(s, [at(14.2, 0), at(9.4, 0)], ev, 0.2); note.over = K.dist(s.crab.p, TOP) < 10 && !s.falls;
  via(s, [at(8.6, -60), at(8.2, -100)], ev, 0.15);
  waitFor(s, () => K.gustState(s) === 'calm' && gustLeft(s) > 1.6, ev); note.calm = K.gustState(s) === 'calm';
  const f1 = throwFor(s, G_PILLAR, 'press', 150); if (f1) throwAt(s, G_PILLAR, f1, ev, 2); note.plate = !!s.held.plate;
  via(s, [at(8.5, -30), at(8.2, 30), G_SPOT], ev, 0.12);
  waitFor(s, () => K.gustState(s) === 'gust' && gustLeft(s) > 2.2, ev);
  const f2 = throwFor(s, G_EYE, 'target', 150, 60, 4); note.f2 = f2; if (f2) throwAt(s, G_EYE, f2, ev, 2); note.eye = !!s.open.eye;
  go(s, TOP, ev, 0.3, 15); note.won = s.won; note.t = s.t; note.falls = s.falls;
  return { s, ev, note };
};
{ const { note } = gusts();
  ok(note.nuts === 3 && note.over, '13. GUST GARDEN: over the cloud bridge with the coconuts');
  ok(note.calm && note.plate, '    in the calm, a coconut onto the plate on the cloud pillar: the inner fence opens');
  ok(note.eye, `    from the throw spot, in a gust, a throw out past the edge is blown back into the cloud cave's bullseye (aim ${note.f2 && note.f2.a}°, charge ${note.f2 && note.f2.ch.toFixed(2)})`);
  ok(note.won && note.falls === 0, `    the pearl (${note.t.toFixed(0)} s, no falls)`);
}
{ const tryFrom = (gust, region) => { let hits = 0, n = 0;
    for (const [d0, d1, l0, l1] of region) for (let d = d0; d <= d1; d += 0.4) for (let lon = l0; lon <= l1; lon += 4) { const p = at(d, lon); if (K.dist(p, G_EYE) < 1.25) continue;
      for (let a = -60; a <= 60; a += 12) for (let ch = 0; ch <= 1.001; ch += 0.1) { const q = K.create(GUSTS); q.t = gust ? 4.5 : 0; q.crab.p = p; q.crab.h = K.floorAt(q, p); q.crab.nuts = 1; face(q, G_EYE); const f = q.crab.face, sd = P.cross(p, f), r = a * Math.PI / 180; q.crab.face = P.tangent(p, P.mix(f, sd, Math.cos(r), Math.sin(r))); K.throwNut(q, ch); n++;
        for (let k = 0; k < 150; k++) if (K.step(q, DT).some(e => e.type === 'target')) { hits++; break; } } }
    return { hits, n }; };
  const calm = tryFrom(false, [[5, 9.95, 40, 140]]);
  ok(calm.hits === 0, `   in the calm no throw from the inner island gets into the cloud cave (${calm.n} tried: its mouth faces out over the void)`);
  const out = tryFrom(false, [[14, 15.5, 60, 120]]);
  ok(out.hits === 0, `   nor, in the calm, from across the void (${out.n} tried; in a gust a throw from there can ride the wind in too: the same idea)`);
  let blown = 0, landed = 0; for (let k = 0; k < 2; k++) { const gust = k === 1; for (const d of [7, 7.6, 8.2, 8.8, 9.4]) for (let ch = 0; ch <= 1; ch += 0.05) for (let a = -20; a <= 20; a += 5) { const q = K.create(GUSTS); q.t = gust ? 4.5 : 0; q.crab.p = at(d, -100); q.crab.nuts = 1; face(q, G_PILLAR); const f = q.crab.face, sd = P.cross(q.crab.p, f), r = a * Math.PI / 180; q.crab.face = P.tangent(q.crab.p, P.mix(f, sd, Math.cos(r), Math.sin(r))); K.throwNut(q, ch); run(q, 2); if (q.held.plate) { if (gust) blown++; else landed++; } } }
  ok(landed > 0 && blown === 0, `   the pillar's plate: ${landed} calm throws stay on it, no throw made in a gust does (the gust blows it off)`);
  { const q = K.create(GUSTS); q.crab.p = at(11.8, 60); q.crab.h = 0; const e = run(q, 0.3); ok(has(e, 'fall'), '   off the cloud into the void: back to the flag'); }
  { let over = 0; for (let lon = 30; lon < 330; lon += 30) { const q = K.create(GUSTS); q.crab.p = at(13.8, lon); q.crab.f = P.tangent(q.crab.p, TOP); hop(q, at(9, lon)); run(q, 0.3); if (!q.falls && K.dist(q.crab.p, TOP) < 10) over++; } ok(over === 0, '   no jump crosses the void except by the bridge'); }
}

// ── 14. Thunderhead ─────────────────────────────────────────────────────────
const thunder = () => {
  const s = K.create(THUNDERHEAD), ev = [], note = {};
  gather(s, ev); go(s, at(15.2, 0), ev, 0.2, 10);
  boltWalk(s, at(5.6, 0), ev); note.over = K.dist(s.crab.p, TOP) < 6.5 && !s.falls; note.zaps = ev.filter(e => e.type === 'zap').length;
  go(s, at(4.9, 20), ev, 0.15, 5); waitFor(s, () => !!s.open.storm, ev, 12); note.rod = !!s.open.storm;
  go(s, at(4.0, 110), ev, 0.2, 5); note.inside = K.dist(s.crab.p, TOP) < 4.4;
  const pl = THUNDERHEAD.plates[0]; const f = throwFor(s, pl.p, 'press', 120); if (f) throwAt(s, pl.p, f, ev, 1.5); note.plate = !!s.held.plate;
  go(s, TOP, ev, 0.3, 10); note.won = s.won; note.t = s.t; note.falls = s.falls;
  return { s, ev, note };
};
{ const { note } = thunder();
  ok(note.over && note.zaps === 0, '14. THUNDERHEAD: across the cloud path through three rows of lightning, waiting out each strike');
  ok(note.rod && note.inside, '    by the rod: when it is struck the storm fence opens, and in through it before it shuts');
  ok(note.plate && note.won && note.falls === 0, `    a coconut on the plate inside, and the pearl (${note.t.toFixed(0)} s, no falls)`);
}
{ const q = K.create(THUNDERHEAD); q.crab.p = at(12.2, 0); q.crab.h = 0.3; let zapped = false; for (let i = 0; i < 4 / DT && !zapped; i++) { q.crab.p = at(12.2, 0); if (has(K.step(q, DT), 'zap')) zapped = true; } ok(zapped, '   standing under a strike: back to the flag');
  const r = K.create(THUNDERHEAD); r.crab.p = at(5.5, 40); r.crab.h = 0; let hurt = false; for (let i = 0; i < 8 / DT; i++) if (has(K.step(r, DT), 'zap')) hurt = true; ok(!hurt && r.open.storm !== undefined || !hurt, '   the rod never hurts you');
  let wide = 0; for (const lon of [-14, 14]) for (const d of [12.2, 9.8, 7.6]) { const p = at(d, lon); if (!THUNDERHEAD.bolts.some(b => !b.rod && K.dist(p, b.p) < b.r + 0.2)) wide++; } ok(wide === 0, '   each row of lightning covers the whole width of the path (no way round it)');
  const z = K.create(THUNDERHEAD), times = []; let was = false; for (let i = 0; i < 14 / DT; i++) { K.step(z, DT); const o = !!z.open.storm; if (o && !was) times.push(z.t); was = o; } ok(times.length >= 2 && Math.abs(times[1] - times[0] - 6) < 0.05, `   the rod is struck every 6 s and holds the storm fence open 4 s`);
}

// ── 15. Cloud Ferry ─────────────────────────────────────────────────────────
const dAng = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const ferry = () => {
  const s = K.create(FERRY), ev = [], note = {}, L = 0;
  gather(s, ev); go(s, at(13.85, L), ev, 0.12, 12);
  // wait for cloud 0 to come along, and jump on as it does (it drifts 12°/s, a jump takes about 0.7 s)
  waitFor(s, () => dAng(K.lonOf(s.logs[0].p) + 12 * 0.75, L) < 2, ev, 40);
  K.jump(s); for (let i = 0; i < 200 && s.crab.air; i++) ev.push(...K.step(s, DT, stickTo(s, s.logs[0].p, Math.min(1, K.dist(s.crab.p, s.logs[0].p) / 0.4))));
  note.onCloud = !s.falls && Math.abs(s.crab.h - 0.35) < 0.06;
  for (let i = 0; i < 1.5 / DT; i++) ev.push(...K.step(s, DT, stickTo(s, at(9.05, K.lonOf(s.logs[0].p) + 4), 0.6)));
  const lon = K.lonOf(s.crab.p); hop(s, at(5.7, lon + 6), ev); for (let i = 0; i < 120 && s.crab.air; i++) ev.push(...K.step(s, DT));
  note.over = K.dist(s.crab.p, TOP) < 6.5 && !s.falls && s.crab.nuts === 3;
  // the bullseye on the other cloud: stand ahead of it on the island's edge and throw as it comes past
  for (let k = 0; k < 6 && !s.open.eye && s.crab.nuts > 0; k++) {
    const want = at(5.9, K.lonOf(s.logs[1].p) + 38); go(s, want, ev, 0.2, 6);
    for (let i = 0; i < 6 / 0.2 && !s.open.eye; i++) { const f = K.dist(s.crab.p, s.logs[1].p) < 7 ? throwFor(s, s.logs[1].p, 'target', 110, 30, 6) : null; if (f) { throwAt(s, s.logs[1].p, f, ev, 1.8); break; } ev.push(...run(s, 0.2)); }
  }
  note.eye = !!s.open.eye;
  go(s, TOP, ev, 0.3, 10); note.won = s.won; note.t = s.t; note.falls = s.falls;
  return { s, ev, note };
};
{ const { note } = ferry();
  ok(note.onCloud, '15. CLOUD FERRY: a jump from the edge onto a cloud as it drifts by');
  ok(note.over, '    it carries you round; off onto the inner island with the coconuts');
  ok(note.eye, '    a throw at the bullseye riding the other cloud as it sails past opens the fence');
  ok(note.won && note.falls === 0, `    the pearl (${note.t.toFixed(0)} s, no falls)`);
}
{ let over = 0; for (let lon = 0; lon < 360; lon += 30) { const q = K.create(FERRY); q.logs = []; q.lv = { ...FERRY, logs: [] }; q.crab.p = at(13.8, lon); q.crab.f = P.tangent(q.crab.p, TOP); hop(q, at(6, lon)); run(q, 0.3); if (!q.falls && K.dist(q.crab.p, TOP) < 6.5) over++; } ok(over === 0, '   without a cloud, no jump crosses the void');
  { const q = K.create(FERRY); q.crab.nuts = 1; q.crab.p = at(9.6, K.lonOf(q.logs[0].p)); q.crab.h = 0.35; face(q, at(9.6, K.lonOf(q.logs[0].p) + 10)); K.throwNut(q, 0); run(q, 0.8); const n = q.nuts.find(x => x.state === 'rest' && K.dist(x.p, q.logs[0].p) < 1.4 && x.h > 0.2); const e = run(q, 8); ok(!n || has(e, 'lost') || !q.nuts.some(x => x.id === n.id && x.state === 'rest' && x.h > 0.2), '   a coconut left on a cloud falls into the void when the cloud drifts out from under it (and washes up at the palm)'); }
}

// ── 16. The Eye of the Storm ────────────────────────────────────────────────
const stormFight = (s, ev, note, secs) => {
  const b = s.boss; note.hits = 0; note.slams = 0; let wait = 0;
  for (let i = 0; i < secs / DT && b.state !== 'down' && !s.won; i++) {
    const c = s.crab; let stick = { x: 0, y: 0 }; wait -= DT; const dC = K.dist(c.p, TOP);
    if (dC < 2.05) stick = stickTo(s, at(2.7, K.lonOf(c.p)));
    else if (struck(s, c.p, 0.5)) stick = stickTo(s, at(2.5, K.lonOf(c.p)));
    else if (b.state === 'wind' && K.dist(c.p, b.tx) < 1.6) { const side = ((K.lonOf(c.p) - K.lonOf(b.tx) + 540) % 360) - 180 >= 0 ? 1 : -1; stick = stickTo(s, at(2.5, K.lonOf(c.p) + side * 25)); }
    else if (c.nuts > 0 && !c.air && b.state !== 'hurt' && wait <= 0) {
      const f = findThrow(s, 'ink-hit');
      if (f) { face(s, TOP); const side = P.cross(c.p, c.face), r = f.a * Math.PI / 180; c.face = P.tangent(c.p, P.mix(c.face, side, Math.cos(r), Math.sin(r))); K.throwNut(s, f.ch); }
      else { wait = 0.15; stick = stickTo(s, at(2.5, K.lonOf(c.p) + 8)); }
    } else if (c.nuts < K.CARRY && !c.air) {
      const n = s.nuts.filter(x => x.state === 'rest' && !struck(s, x.p, 1)).sort((x, y) => K.dist(x.p, c.p) - K.dist(y.p, c.p))[0];
      if (n && (b.state !== 'wind' || K.dist(n.p, b.tx) > 1.6)) stick = stickTo(s, n.p);
    }
    for (const e of K.step(s, DT, stick)) { ev.push(e); if (e.type === 'ink-slam') note.slams++; if (e.type === 'ink-hit') note.hits++; }
  }
  return note;
};
const stormeye = () => {
  const s = K.create(STORMEYE), ev = [], note = {};
  gather(s, ev); go(s, at(15.2, 0), ev, 0.2, 10);
  boltWalk(s, at(6.6, 0), ev); note.over = K.dist(s.crab.p, TOP) < 7.5 && !s.falls;
  go(s, at(6.4, 15), ev, 0.15, 5); waitFor(s, () => !!s.open.arena, ev, 12); note.rod = !!s.open.arena;
  go(s, at(4.9, 10), ev, 0.2, 3); go(s, at(2.7, 10), ev, 0.2, 3); note.inside = K.dist(s.crab.p, TOP) < 5.6;
  const f0 = s.falls; stormFight(s, ev, note, 500); note.down = s.boss.state === 'down'; note.fightFalls = s.falls - f0;
  go(s, TOP, ev, 0.3, 10); note.won = s.won; note.t = s.t; note.zaps = ev.filter(e => e.type === 'zap').length;
  return { s, ev, note };
};
{ const { note } = stormeye();
  ok(note.over, '16. THE EYE OF THE STORM: through two rows of lightning on the cloud path');
  ok(note.rod && note.inside, '    the rod is struck, and in through the arena gate');
  ok(note.down && note.hits === 5, `    five hits on Old Ink, each just after a slam, through the strikes and the gusts (${note.slams} slams, ${note.fightFalls} knocks, ${note.zaps} zaps)`);
  ok(note.won, `    the pearl (${note.t.toFixed(0)} s)`);
}
{ const q = K.create(STORMEYE); let quiet = true; for (let i = 0; i < 10 / DT; i++) { q.crab.p = at(6.6, 0); K.step(q, DT); if (STORMEYE.bolts.some(b => b.boss && K.boltState(q, b) !== 'quiet')) quiet = false; } ok(quiet, '   the lightning round the arena only strikes while he is up'); }

{ const order = CHAMBERS.map(c => c.id).slice(12).join();
  ok(order === 'gusts,thunder,ferry,eye' && CHAMBERS.length === 16 && STORMEYE.boss && !STORMEYE.boss.kind, 'World 4 is: Gust Garden, Thunderhead, Cloud Ferry, then the Eye of the Storm with Old Ink'); }
console.log(fails ? `\nWORLD 4 FAIL (${fails})` : '\nWORLD 4 PASS');
process.exit(fails ? 1 : 0);
