// Coconut Trials rules (the puzzle planets inside Tiny Planet), no browser.
// usage: node qa/trick.mjs
import * as K from '../src/arcade/TrickLogic.js';
import * as P from '../src/arcade/PlanetLogic.js';

let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const { at } = K, TOP = [0, 1, 0];
const lv = id => K.LEVELS.find(l => l.id === id);
const plain = (extra = {}) => ({ id: 't', par: 9, start: at(10, 0), flag: TOP, shell: at(9, 170), ...extra });
const run = (s, secs, stick = { x: 0, y: 0 }) => { const ev = []; for (let t = 0; t < secs; t += 1 / 60) ev.push(...K.step(s, 1 / 60, stick)); return ev; };
const apex = (s, secs = 2.5) => { let m = 0; for (let t = 0; t < secs; t += 1 / 60) { K.step(s, 1 / 60); m = Math.max(m, s.crab.h); } return m; };

// 1. jump, and a throw: a tap is short and high, a full hold is far
{ const s = K.create(plain());
  ok(K.jump(s) && !K.jump(s), 'jump: up, and no second jump in the air');
  const top = apex(s);
  ok(Math.abs(top - 1.3) < 0.08 && !s.crab.air, `a jump tops out at ${top.toFixed(2)} and lands`);
  const a = K.aim(s, 0), b = K.aim(s, 1), da = K.dist(a.p, s.crab.p), db = K.dist(b.p, s.crab.p);
  ok(Math.abs(da - (K.THROW.range0 + K.THROW.ahead)) < 0.25 && Math.abs(db - (K.THROW.range1 + K.THROW.ahead)) < 0.25 && s.throws === 0 && !s.nuts.length, `aim shows where a throw would land: a tap ${da.toFixed(1)} ahead, a full hold ${db.toFixed(1)} (and throws nothing)`);
  const n = K.throwNut(s, 0.5), ev = run(s, 1.5);
  ok(n.state === 'land' && ev.some(e => e.type === 'thud') && s.throws === 1 && Math.abs(K.dist(n.p, s.crab.p) - (K.THROW.range0 + (K.THROW.range1 - K.THROW.range0) * 0.5 + K.THROW.ahead)) < 0.25, 'a thrown coconut flies the way the crab faces and comes to rest'); }

// 2. the stepping stone: land on a coconut and it bounces you twice as high
{ const s = K.create(plain());
  K.throwNut(s, 0.1); run(s, 1.2);
  const nut = s.nuts[0]; K.jump(s);
  let top = 0, bounced = false; for (let i = 0; i < 200; i++) { const ev = K.step(s, 1 / 60, { x: 0, y: 1 }); if (ev.some(e => e.type === 'bounce')) bounced = true; top = Math.max(top, s.crab.h); if (bounced && !s.crab.air) break; }
  ok(bounced && Math.abs(top - (K.NUT_TOP + 2.6)) < 0.12 && nut.state === 'land', `jumping onto a coconut bounces the crab to ${top.toFixed(2)} (a jump is 1.3)`);
  s.crab.p = nut.p.slice(); const ev = run(s, 0.3);
  ok(!ev.some(e => e.type === 'bounce') && !s.crab.air, 'walking into one does nothing: it has to be landed on'); }

// 3. walls: a low one is jumped, a tall one needs the bounce, a gate is no wall once open
{ const L = plain({ rings: [{ r: 8, h: 0.8 }, { r: 5, h: 2 }, { r: 2.5, h: 9, gate: 'g' }] }), s = K.create(L);
  run(s, 2, { x: 0, y: 1 });
  ok(Math.abs(K.dist(s.crab.p, TOP) - 8) < 0.1, 'a low wall stops a walking crab');
  s.crab.p = at(9.4, 0); K.jump(s); run(s, 1, { x: 0, y: 1 });
  ok(K.dist(s.crab.p, TOP) < 8 && K.dist(s.crab.p, TOP) > 5, 'a jump clears it');
  s.crab.p = at(6.4, 0); K.jump(s); run(s, 1.2, { x: 0, y: 1 });
  ok(K.dist(s.crab.p, TOP) > 5, 'a jump does not clear the tall wall');
  s.crab.p = at(7.8, 0); s.crab.face = P.toward(s.crab.p, TOP); K.throwNut(s, 0.05); run(s, 1.2); K.jump(s); run(s, 2.2, { x: 0, y: 1 });
  ok(K.dist(s.crab.p, TOP) < 5 && K.dist(s.crab.p, TOP) >= 2.5 - 0.01, 'a bounce off a coconut does; the gate beyond it still stands');
  s.open.g = true; run(s, 2, { x: 0, y: 1 });
  ok(s.won, 'with the gate open the way to the flag is clear'); }

// 4. water sends you back; a coconut floats, and bounces you across
{ const L = plain({ start: at(11, 0), moats: [{ r0: 4, r1: 8.8 }] }), s = K.create(L);
  const ev = run(s, 0.62, { x: 0, y: 1 });
  ok(ev.some(e => e.type === 'splash') && s.falls === 1 && K.dist(s.crab.p, L.start) < 1.6, 'walking into the water: back to the start');
  s.crab.p = at(9.6, 0); K.jump(s); const ev2 = run(s, 1.2, { x: 0, y: 1 });
  ok(ev2.some(e => e.type === 'splash'), 'it is too wide to jump');
  const r = K.run(L, lv('raft').answer.slice(0, 5));
  ok(r.ev.some(e => e.type === 'plop') && r.ev.some(e => e.type === 'bounce') && !r.s.falls && K.dist(r.s.crab.p, TOP) < 4, 'a coconut thrown in floats, and bouncing on it carries the crab over'); }

// 5. a plate is held by the crab or by a coconut; a bullseye opens its gate for good
{ const L = plain({ plates: [{ p: at(8, 0), r: 0.9, gate: 'g' }], targets: [{ p: at(5.5, 40), gate: 'h' }], rings: [{ r: 3, h: 9, gate: 'g' }] }), s = K.create(L);
  let ev = run(s, 0.6, { x: 0, y: 1 });
  ok(ev.some(e => e.type === 'press') && s.held.g && !K.up(s, L.rings[0]), 'standing on the plate opens its gate');
  ev = run(s, 0.8, { x: 0, y: 1 });
  ok(ev.some(e => e.type === 'release') && !s.held.g && K.up(s, L.rings[0]), 'walking off closes it again');
  s.crab.p = at(10, 0); s.crab.face = P.toward(s.crab.p, at(8, 0)); K.throwNut(s, 0.03); run(s, 1.2); run(s, 1, { x: 1, y: 0 });
  ok(s.held.g && K.dist(s.crab.p, at(8, 0)) > 1.5, 'a coconut left on it holds it open while the crab goes elsewhere');
  s.crab.p = at(7.2, 30); s.crab.face = P.toward(s.crab.p, at(5.5, 40)); K.throwNut(s, 0.16); ev = run(s, 1.2);
  ok(ev.some(e => e.type === 'target') && s.open.h, 'a coconut that hits the bullseye in flight opens its gate for good'); }

// 6. bank shots: a coconut bounces off a wall taller than it is flying, and flies over a lower one
{ const L = plain({ rings: [{ r: 6, h: 9 }] }), s = K.create(L);
  s.crab.p = at(8, 0); s.crab.face = P.toward(s.crab.p, TOP); const n = K.throwNut(s, 0.6); const ev = run(s, 1.5);
  ok(ev.some(e => e.type === 'bank') && K.dist(n.p, TOP) > 6 && n.state === 'land', 'thrown at a tall wall, a coconut bounces back off it');
  const L2 = plain({ rings: [{ r: 6, h: 0.8 }] }), s2 = K.create(L2); s2.crab.p = at(8, 0); s2.crab.face = P.toward(s2.crab.p, TOP); const m = K.throwNut(s2, 0.6); const ev2 = run(s2, 1.5);
  ok(!ev2.some(e => e.type === 'bank') && K.dist(m.p, TOP) < 6, 'and lobbed over a low one');
  const s3 = K.create(L); s3.crab.p = at(6.15, 0); s3.crab.face = P.toward(s3.crab.p, TOP); const q = K.throwNut(s3, 0.5); run(s3, 1.5);
  ok(K.dist(q.p, TOP) > 6, 'standing against a wall, a throw never starts on its far side'); }

// 7. the trick shot: a coconut still in the air, under the crab, bounces it from where it is
{ const r = K.run(lv('trick'), lv('trick').answer.slice(0, 5)), e = r.ev.find(x => x.type === 'trick');
  ok(e && e.h > 0.5 && !r.ev.some(x => x.type === 'bounce') && K.dist(r.s.crab.p, TOP) < 4, `a tap, then a jump into the coconut: bounced in mid-air from ${e ? e.h.toFixed(2) : '?'} up, and over the 3.1 wall`); }

// 8. every trial: its own answer finishes it with all three stars; without a coconut it can't be done
{ for (const L of K.LEVELS) {
    const r = K.run(L, L.answer), st = K.stars(r.s);
    ok(r.s.won && st.every(Boolean) && r.s.throws <= L.par && !r.s.falls, `${L.name}: solved in ${r.s.throws} throw(s) and ${r.s.t.toFixed(1)} s, ⭐⭐⭐`);
    // walking and jumping at the flag from every side, no coconuts
    let cheats = 0;
    for (let lon = -180; lon < 180; lon += 15) for (const d0 of [null, 11, 9.5, 8, 6.5, 5]) for (const runUp of [0, 0.5, 1, 1.6]) {
      const s = K.create(L), script = d0 == null ? [['go', TOP]] : [['go', at(d0, lon)], ['jumpTo', TOP, runUp], ['jumpTo', TOP, runUp], ['go', TOP]];
      if (K.run(L, script, { s, limit: 40 }).s.won) cheats++; }
    ok(cheats === 0, `   and it can't be finished by walking and jumping alone`); }
  ok(K.LEVELS.length === 6 && new Set(K.LEVELS.map(l => l.id)).size === 6 && K.LEVELS.every(l => l.hint && l.name && l.shell), 'six trials, each with a name, a hint and a golden shell'); }

// 9. stars, and the same moves give the same result
{ const L = lv('hop'), a = K.run(L, L.answer), b = K.run(L, L.answer);
  ok(JSON.stringify(a.s.crab) === JSON.stringify(b.s.crab) && a.s.t === b.s.t, 'the same moves always play out the same');
  const noShell = K.run(L, L.answer.filter(m => !(m[0] === 'go' && K.dist(m[1], L.shell) < 0.01)));
  const extra = K.run(L, [['throw', 0], ['throw', 0], ...L.answer]);
  ok(K.stars(noShell.s).join() === 'true,true,false' && K.stars(extra.s).join() === 'true,false,true', 'stars: one for the flag, one for par, one for the shell'); }

console.log(fails ? `\nTRICK FAIL (${fails})` : '\nTRICK PASS');
process.exit(fails ? 1 : 0);
