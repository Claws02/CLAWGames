// Kite Wind flight rules, no browser: every ring can be reached, gulls keep
// clear of rings arriving with them, and a simple pilot flies a long way.
// usage: node qa/kite.mjs
import * as K from '../src/arcade/KiteLogic.js';
import { rng } from '../src/arcade/SoloStats.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const ASPECT = 0.77, DT = 1 / 60;

// The basics
{ const s = K.fresh(); const y0 = s.y; K.tug(s); K.step(s, 0.1, ASPECT, () => 0.5); ok(s.y < y0, 'a tug lifts the kite'); }
{ const s = K.fresh(); for (let i = 0; i < 400 && !s.over; i++) K.step(s, DT, ASPECT, () => 0.5, { noGulls: true }); ok(s.over && /sand/.test(s.why), 'left alone it sinks into the sand'); }
{ const r = K.reach(0.5, 0), r2 = K.reach(1, 0); ok(r.up > 0 && r.down >= 0 && r2.up > r.up && r2.down > r.down, `reach grows with time (0.5s: ↑${r.up.toFixed(2)} ↓${r.down.toFixed(2)}; 1s: ↑${r2.up.toFixed(2)} ↓${r2.down.toFixed(2)})`); }

// Every ring is within reach of the one before, at every speed
{ let worst = 0, n = 0;
  for (let seed = 1; seed <= 40; seed++) {
      const s = K.fresh(), r = rng(seed); s.t = (seed % 4) * 40;   // early and late (fast, gusty) flights
      s.lastRing.t = s.t;
      for (let i = 0; i < 60; i++) {
          const prev = { ...s.lastRing }; s.t += (0.75 + r() * 0.5) / K.mul(s); K.spawn(s, ASPECT, r, 'ring'); n++;
          const tau = (s.t - prev.t) * 0.92, { up, down } = K.reach(tau, s.t), dy = s.lastRing.y - prev.y;
          const over = dy < 0 ? -dy - up : dy - down;
          worst = Math.max(worst, over);
      }
  }
  ok(worst <= K.T.ringR * 0.5 + 1e-9, `${n} rings, each within reach of the last (worst overshoot ${worst.toFixed(3)}, ring slack ${(K.T.ringR * 0.5).toFixed(3)})`); }

// Gulls never sit at the height of a ring arriving at about the same time
{ let bad = 0, gulls = 0;
  for (let seed = 1; seed <= 30; seed++) {
      const s = K.fresh(), r = rng(seed); s.t = 60;
      for (let i = 0; i < 2000; i++) {
          const before = s.things.length; K.step(s, DT, ASPECT, r); s.y = 0.4; s.vy = 0; s.over = false;   // a ghost kite: just watch the spawns
          if (s.things.length > before && s.things.at(-1).kind === 'gull') {
              gulls++; const g = s.things.at(-1), x0 = K.KITE_X * ASPECT, v = K.T.speed * K.mul(s) * ASPECT, tg = (g.x - x0) / (v * 1.35);
              for (const o of s.things) if (o.kind === 'ring' && !o.done && Math.abs((o.x - x0) / v - tg) < 0.8 && Math.abs(o.y - g.y) <= K.T.gullClear) bad++;
          }
      }
  }
  ok(gulls > 50 && bad === 0, `${gulls} gulls, none at the height of a ring arriving with it (${bad})`); }

// A planning pilot, with no gulls, collects every ring in every wind: each
// frame it tries one tap at every moment before the next ring arrives (or
// none) and taps now only if now is best. Re-planning every frame makes the
// taps it needs.
const fly = (s, secs, tapAt) => {   // y after secs with one tap at tapAt (or never), in this wind
    let y = s.y, vy = s.vy, w = s.wind;
    for (let k = 0; k < secs - 1e-9; k += DT) {
        if (tapAt !== null && Math.abs(k - tapAt) < DT / 2) vy = Math.min(vy, 0) - K.T.tug;
        w += (s.windTo - w) * Math.min(1, DT * 1.5); vy = Math.min(K.T.maxFall, vy + (K.T.gravity - w) * DT); y += vy * DT;
        if (y < K.T.top) { y = K.T.top; vy = Math.max(0, vy); }
    }
    return y;
};
{ let rings = 0, missed = 0, crashes = 0;
  for (let seed = 1; seed <= 12; seed++) {
      const s = K.fresh(), r = rng(seed * 7);
      for (let i = 0; i < 60 * 100 && !s.over; i++) {
          const x0 = K.KITE_X * ASPECT, v = K.T.speed * K.mul(s) * ASPECT;
          const next = s.things.filter(o => o.kind === 'ring' && !o.done && o.x > x0 - K.T.ringR * 0.3).sort((a, b) => a.x - b.x)[0];
          const when = Math.min(next ? Math.max(DT, (next.x - x0) / v) : 0.5, 0.9), target = next && (next.x - x0) / v < 0.9 ? next.y : 0.45;
          let best = { e: Math.abs(fly(s, when, null) - target), at: null };
          for (let k = 0; k < when; k += DT * 2) { const e = Math.abs(fly(s, when, k) - target); if (e < best.e - 1e-6) best = { e, at: k }; }
          if (best.at === 0 || fly(s, 0.3, null) > K.T.ground - 0.06) K.tug(s);
          const ev = K.step(s, DT, ASPECT, r, { noGulls: true }); rings += ev.ring; missed += ev.missed;
      }
      if (s.over) crashes++;
  }
  ok(missed <= (rings + missed) * 0.02 && crashes === 0 && rings > 600, `a pilot planning one tap ahead flew 12 × 100 s: caught ${rings} of ${rings + missed} rings (${(100 * rings / (rings + missed)).toFixed(1)}%), ${crashes} crashes`); }

if (fails) { console.log(`KITE FAIL — ${fails}`); process.exit(1); }
console.log('KITE PASS');
