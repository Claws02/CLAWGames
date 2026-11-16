// Tiny Planet rules, no browser.
// usage: node qa/planet.mjs
import * as P from '../src/arcade/PlanetLogic.js';

let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const run = (s, secs, stick = { x: 0, y: 0 }, dt = 1 / 60) => { const ev = []; for (let t = 0; t < secs && !s.over; t += dt) ev.push(...P.step(s, dt, stick)); return ev; };
const unit = v => Math.abs(Math.hypot(...v) - 1) < 1e-6;

// 1. the walk: on the sphere, screen-relative, and all the way round
{ const s = P.create({ rnd: seeded(1) }); s.items = [];
  const p0 = s.crab.p.slice(), lap = (2 * Math.PI * s.R) / P.speedOf(s);
  run(s, lap / 4, { x: 0, y: 1 });
  ok(unit(s.crab.p) && unit(s.crab.f) && Math.abs(P.dot(s.crab.p, s.crab.f)) < 1e-6 && Math.abs(P.angle(p0, s.crab.p) - Math.PI / 2) < 0.03, `the crab walks the sphere: a quarter lap forward is a quarter turn (${(P.angle(p0, s.crab.p) * 180 / Math.PI).toFixed(1)}°), forward stays on the ground`);
  run(s, lap * 3 / 4, { x: 0, y: 1 });
  ok(P.angle(p0, s.crab.p) < 0.05, 'a whole lap forward comes back to where it began');
  const q = s.crab.p.slice(); run(s, 1, { x: 1, y: 0 });
  ok(Math.abs(P.dot(P.toward(q, s.crab.p), P.cross(s.crab.f, q)) - 1) < 0.05, 'stick right walks to the right of the screen'); }

// 2. picking up
{ const s = P.create({ rnd: seeded(2) }); s.items = [{ id: 90, kind: 'shell', p: P.walk(s.crab.p, P.cross(s.crab.f, s.crab.p), 2 / s.R) }, { id: 91, kind: 'gold', p: P.walk(s.crab.p, P.cross(s.crab.f, s.crab.p), 3.5 / s.R) }];
  const a = s.shells; s.spawnT = 99; const ev = run(s, 1.2, { x: 1, y: 0 });
  ok(s.shells === a + 1 + P.GOLD && ev.filter(e => e.type === 'pick').length === 2, `walking over a shell and a golden shell: +1 and +${P.GOLD}`); }

// 3. building: cost, spacing, palms grow and fruit, huts bring shells
{ const s = P.create({ rnd: seeded(3) }); s.items = []; s.shells = 3;
  ok(P.canBuild(s, 'palm').why === 'cost' && !P.build(s, 'palm'), 'a palm needs 4 shells');
  ok(P.costOf(s, 'hut').shells === P.COST.hut.shells + P.STEP.hut.shells && P.costOf(s, 'tower').shells === P.COST.tower.shells && P.bigFor(5) === 1 && P.bigFor(10) === 2 && P.bigFor(7) === 0, 'each hut makes the next one dearer; the big stars come every fifth night, one more each time');
  s.shells = 30; s.nuts = 9;
  const palm = P.build(s, 'palm');
  ok(palm && s.shells === 26 && P.canBuild(s, 'hut').why === 'space', 'a palm goes up where the crab stands; nothing else fits on the same spot');
  run(s, P.SPACE / P.speedOf(s) + 0.3, { x: 1, y: 0 });
  const hut = P.build(s, 'hut');
  ok(hut && s.shells === 26 - 11 && s.nuts === 9 - 4 && P.pop(s) === 2, 'a few steps on, a second hut: 11 shells and 4 coconuts, and the village is 2');
  s.spawnT = 1e9; const sh = s.shells; const ev = run(s, 20); s.pt = 0; ev.push(...run(s, 20));
  const nuts = ev.filter(e => e.type === 'nut').length, gifts = ev.filter(e => e.type === 'gift').length;
  ok(ev.some(e => e.type === 'grown') && nuts === P.NUTS_OUT && gifts === 4 && s.shells === sh + gifts, `in 40 s the palm grows and drops ${nuts} coconuts (it waits while ${P.NUTS_OUT} lie there); two huts bring ${gifts} shells`); }

// 4. night: stars fall; a catch, a hit, a tower's bubble, the big one
{ const s = P.create({ rnd: seeded(4) }); s.items = []; s.spawnT = 1e9;
  const ev = run(s, P.DAY_S + 0.1);
  ok(s.phase === 'night' && ev.some(e => e.type === 'night' && e.stars === P.starsFor(1) && e.big === 0), `after ${P.DAY_S} s night falls with ${P.starsFor(1)} stars on the way`); }
{ const s = P.create({ rnd: seeded(5) }); s.items = []; s.phase = 'night'; s.pt = 0; s.due = []; const sh = s.shells;
  s.stars = [{ id: 1, p: s.crab.p.slice(), t: 0, T: 1, r: P.STAR_R, big: false }];
  const ev = run(s, 1.1);
  ok(ev.some(e => e.type === 'catch') && s.shells === sh + P.STAR_PAY && s.stats.caught === 1 && P.pop(s) === 1, `the crab under a star catches it: +${P.STAR_PAY} shells, nothing hurt`); }
{ const s = P.create({ rnd: seeded(6) }); s.items = []; s.phase = 'night'; s.pt = 0; s.due = [];
  const hut = s.builds[0];
  s.stars = [{ id: 1, p: hut.p.slice(), t: 0, T: 1, r: P.STAR_R, big: false }];
  let ev = run(s, 1.1);
  ok(ev.some(e => e.type === 'impact') && hut.hp === P.HP.hut - 1 && !s.over && P.repairable(s) === null, 'a star on the hut cracks it (the crab is too far to catch it, or to mend it from here)');
  s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 1 / s.R); s.shells = 5;
  ok(P.repair(s) === hut && hut.hp === P.HP.hut && s.shells === 5 - P.REPAIR, `next to it, ${P.REPAIR} shells mend it`);
  s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 3); hut.hp = 1;
  s.stars = [{ id: 2, p: hut.p.slice(), t: 0, T: 0.5, r: P.STAR_R, big: false }];
  ev = run(s, 0.6);
  ok(s.over && ev.some(e => e.type === 'over') && P.step(s, 1).length === 0, 'the last hut gone: the island is lost, and nothing more happens'); }
{ const s = P.create({ rnd: seeded(7) }); s.items = []; s.shells = 40; s.nuts = 20;
  const hut = s.builds[0]; s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 2 / s.R);
  const tw = P.build(s, 'tower'); s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 2);
  s.phase = 'night'; s.pt = 0; s.due = [];
  for (let k = 0; k < 4; k++) { s.stars = [{ id: 9 + k, p: hut.p.slice(), t: 0, T: 0.2, r: P.STAR_R, big: false }]; run(s, 0.3); }
  ok(tw.charges === 0 && hut.hp === P.HP.hut - 1, `a bubble tower soaks up ${P.TOWER_CHARGES} stars a night; the fourth gets through`);
  s.stars = []; s.pt = P.NIGHT_S; const ev = run(s, 0.1);
  ok(s.day === 2 && s.phase === 'day' && tw.charges === P.TOWER_CHARGES && ev.some(e => e.type === 'dawn' && e.gift === 1), 'dawn: day 2, the tower is charged again, and each villager brings a shell'); }
{ const s = P.create({ rnd: seeded(8) }); s.items = []; s.phase = 'night'; s.pt = 0; s.due = []; s.shells = 5;
  s.stars = [{ id: 1, p: s.crab.p.slice(), t: 0, T: 0.5, r: P.BIG_R, big: true }];
  const ev = run(s, 0.6);
  ok(ev.some(e => e.type === 'impact' && e.big && e.ouch === 3) && s.shells === 2 && s.stats.caught === 0, 'the big one can\'t be caught: it knocks 3 shells out of the crab'); }

// 5. the planet grows every third dawn, and everything keeps its place
{ const s = P.create({ rnd: seeded(9) }); const hut = s.builds[0], p = hut.p.slice(), d0 = P.dist(s, hut.p, s.crab.p); const Rs = [];
  for (let d = 1; d <= 7; d++) { s.phase = 'night'; s.pt = P.NIGHT_S; s.due = []; s.stars = []; P.step(s, 0.01); Rs.push(+s.R.toFixed(2)); }
  ok(Rs[0] === P.R0 && Rs[2] > Rs[1] && Rs[5] > Rs[4] && Rs[3] === Rs[2] && P.angle(p, hut.p) === 0 && P.dist(s, hut.p, s.crab.p) > d0, `the planet grows at dawn on days 4 and 7 (${Rs.join(', ')}); the hut keeps its place and the walk to it is longer`); }

// 6. upgrades change what they say
{ const a = P.create({ rnd: seeded(1) }), b = P.create({ rnd: seeded(1), up: { speed: 5, start: 2, sturdy: 3, reach: 5, green: 5 } });
  ok(P.speedOf(b) > P.speedOf(a) * 1.29 && b.shells === a.shells + 6 && b.builds[0].hp === a.builds[0].hp + 3 && P.reachOf(b) === 1.4, 'the workshop: quicker claws, a head start, sturdier huts, a longer reach');
  ok(P.upgradeCost(0) === 10 && P.upgradeCost(5) === null && P.UPGRADES.every(u => u.max <= 5), 'upgrade levels cost 10, 20, 35, 55, 80 stardust'); }

// 7. the same seed plays the same island
{ const play = () => { const s = P.create({ rnd: seeded(77) }); for (let i = 0; i < 60 * 200 && !s.over; i++) { const a = P.autopilot(s); if (a.build) P.build(s, a.build); if (a.repair) P.repair(s); P.step(s, 1 / 60, a); } return `${s.day}/${s.shells}/${s.builds.length}/${s.stats.caught}`; };
  ok(play() === play(), `the same seed gives the same island (${play()})`); }

// 8. how long a sensible player lasts: a real game, not a wall and not for ever
{ const days = up => { const out = []; for (let seed = 1; seed <= 12; seed++) { const s = P.create({ rnd: seeded(seed * 7919), up });
      for (let i = 0; i < 60 * 60 * 40 && !s.over; i++) { const a = P.autopilot(s); if (a.build) P.build(s, a.build); if (a.repair) P.repair(s); P.step(s, 1 / 60, a); }
      out.push(s.over ? s.day : 99); } return out.sort((a, b) => a - b); };
  const base = days({}), maxed = days({ speed: 5, start: 5, green: 5, reach: 5, sturdy: 3, lucky: 5 });
  const med = a => a[Math.floor(a.length / 2)];
  console.log(`     no upgrades: ${base.join(' ')}\n     all upgrades: ${maxed.join(' ')}`);
  ok(base[0] >= 3 && med(base) >= 6 && med(base) <= 25, `with no upgrades the autopilot lasts ${base[0]} to ${base[base.length - 1]} days (middle ${med(base)})`);
  ok(med(maxed) > med(base) && maxed[maxed.length - 1] < 99, `with every upgrade it lasts longer (middle ${med(maxed)}), and still ends`); }

console.log(fails ? `\nPLANET FAIL (${fails})` : '\nPLANET PASS');
process.exit(fails ? 1 : 0);
