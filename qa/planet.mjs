// Tiny Planet rules, no browser.
// usage: node qa/planet.mjs
import * as P from '../src/arcade/PlanetLogic.js';

let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const run = (s, secs, stick = { x: 0, y: 0 }, dt = 1 / 60) => { const ev = []; for (let t = 0; t < secs && !s.over; t += dt) ev.push(...P.step(s, dt, stick)); return ev; };
const unit = v => Math.abs(Math.hypot(...v) - 1) < 1e-6;
// A bare island: no shells, rocks or course to trip over.
const bare = (seed, up) => { const s = P.create({ rnd: seeded(seed), up }); s.items = []; s.course = null; s.spawnT = 1e9; s.rockT = 1e9; return s; };
const side = (s, from, units) => P.walk(from, P.tangent(from, [1, 0, 0]), units / s.R);
const pilot = (s, secs) => { const all = []; for (let i = 0; i < 60 * secs && !s.over; i++) { const a = P.autopilot(s); if (a.build) P.build(s, a.build, all); if (a.act) P.act(s, all); if (a.jump) P.jump(s); all.push(...P.step(s, 1 / 60, a)); } return all; };

// 1. the walk: on the sphere, screen-relative, and all the way round
{ const s = bare(1);
  const p0 = s.crab.p.slice(), lap = (2 * Math.PI * s.R) / P.speedOf(s);
  run(s, lap / 4, { x: 0, y: 1 });
  ok(unit(s.crab.p) && unit(s.crab.f) && Math.abs(P.dot(s.crab.p, s.crab.f)) < 1e-6 && Math.abs(P.angle(p0, s.crab.p) - Math.PI / 2) < 0.03, `the crab walks the sphere: a quarter lap forward is a quarter turn (${(P.angle(p0, s.crab.p) * 180 / Math.PI).toFixed(1)}°)`);
  run(s, lap * 3 / 4, { x: 0, y: 1 });
  ok(P.angle(p0, s.crab.p) < 0.05, 'a whole lap forward comes back to where it began');
  const q = s.crab.p.slice(); run(s, 1, { x: 1, y: 0 });
  ok(Math.abs(P.dot(P.toward(q, s.crab.p), P.cross(s.crab.f, q)) - 1) < 0.05, 'stick right walks to the right of the screen'); }

// 2. picking up: shells and gold by walking over them; a rock waits for the button
{ const s = bare(2), r = P.cross(s.crab.f, s.crab.p);
  s.items = [{ id: 90, kind: 'shell', p: P.walk(s.crab.p, r, 2 / s.R) }, { id: 91, kind: 'gold', p: P.walk(s.crab.p, r, 3.5 / s.R) }, { id: 92, kind: 'rock', p: P.walk(s.crab.p, r, 2.8 / s.R) }];
  const a = s.shells; const ev = run(s, 1.2, { x: 1, y: 0 });
  ok(s.shells === a + 1 + P.GOLD && ev.filter(e => e.type === 'pick').length === 2 && s.items.length === 1 && s.items[0].kind === 'rock', `walking over a shell and a golden shell: +1 and +${P.GOLD}; the rock stays where it is`); }

// 3. building: cost, spacing, what's locked; palms grow and fruit; homes bring shells
{ const s = bare(3); s.shells = 3;
  ok(P.canBuild(s, 'palm').why === 'cost' && !P.build(s, 'palm'), 'a palm needs 4 shells');
  ok(P.costOf(s, 'hut').shells === P.COST.hut.shells + P.STEP.hut.shells && P.bigFor(5) === 1 && P.bigFor(10) === 2 && P.bigFor(7) === 0, 'each home makes the next one dearer; the big stars come every fifth night, one more each time');
  s.shells = 99; s.nuts = 99;
  ok(P.canBuild(s, 'tower').why === 'locked' && P.canBuild(s, 'market').why === 'locked', 'in a camp, towers and markets are still locked');
  s.shells = 30; s.nuts = 9;
  const palm = P.build(s, 'palm');
  ok(palm && s.shells === 26 && P.canBuild(s, 'hut').why === 'space', 'a palm goes up where the crab stands; nothing else fits on the same spot');
  run(s, P.SPACE / P.speedOf(s) + 0.3, { x: 1, y: 0 });
  const hut = P.build(s, 'hut');
  ok(hut && s.shells === 26 - 11 && s.nuts === 9 - 4 && P.pop(s) === 2, 'a few steps on, a second home: 11 shells and 4 coconuts, and there are 2 crabs');
  const sh = s.shells; const ev = run(s, 20); s.pt = 0; ev.push(...run(s, 20));
  const nuts = ev.filter(e => e.type === 'nut').length, gifts = ev.filter(e => e.type === 'gift').length;
  ok(ev.some(e => e.type === 'grown') && nuts === P.NUTS_OUT && gifts === 4 && s.shells === sh + gifts, `in 40 s the palm grows and drops ${nuts} coconuts (it waits while ${P.NUTS_OUT} lie there); two homes bring ${gifts} shells`); }

// 4. the city: bigger homes, the steps from camp to capital, what each opens
{ const s = bare(4); s.shells = 999; s.nuts = 999; const hut = s.builds[0];
  const home = (lvl, k) => s.builds.push({ id: 700 + k, kind: 'hut', p: side(s, [0, -1, 0], k * 0.3), hp: 3, lvl, age: 99, t: 99, shake: 0, charges: 0 });
  s.crab.p = side(s, hut.p, 1.2);
  const x = P.context(s);
  ok(x && x.kind === 'bigger' && x.ok && x.cost.shells === P.BIGGER[1].shells, 'next to a home the action button offers to make it bigger');
  const ev = []; P.act(s, ev);
  ok(hut.lvl === 2 && P.pop(s) === 2 && P.context(s) === null && s.shells === 999 - P.BIGGER[1].shells, 'it now holds 2 crabs; a third needs a TOWN');
  const R0 = s.R; home(1, 1); home(1, 2);
  s.crab.p = side(s, hut.p, 4); P.build(s, 'hut', ev);
  const t = ev.find(e => e.type === 'town');
  ok(P.pop(s) === 5 && t && t.name === 'VILLAGE' && s.town === 1 && s.R > R0 && P.canBuild(s, 'tower').why !== 'locked' && P.nextTown(s).pop === 10, `the fifth crab makes a VILLAGE: the planet grows (${R0} → ${s.R.toFixed(2)}) and bubble towers open`);
  home(3, 3); home(2, 4); s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 1.1); P.build(s, 'palm', ev); s.crab.p = side(s, hut.p, 1.2);
  const c3 = P.context(s);
  ok(P.pop(s) === 10 && s.town === 2 && P.maxLvl(s) === 3 && c3?.kind === 'bigger' && c3.cost.shells === P.BIGGER[2].shells + P.BIGGER_STEP.shells, '10 crabs make a TOWN: homes can now hold 3 (each big home makes the next dearer)');
  for (let k = 5; k < 9; k++) home(3, k);
  s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 1.5); P.build(s, 'palm', ev);
  ok(P.pop(s) === 22 && s.town === 3 && P.canBuild(s, 'market').why !== 'locked', '22 crabs make a CITY, and markets open');
  for (let k = 9; k < 19; k++) home(3, k);
  s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 1.9); P.build(s, 'palm', ev);
  Object.assign(s.stats, { walked: 9, palms: 1, huts: 1, caught: 1 });
  ok(P.pop(s) === 52 && s.town === 5 && P.nextTown(s) === null && s.R <= P.R_MAX && P.chargesOf(s) === P.TOWER_CHARGES + 2 && /CAPITAL/.test(P.goal(s).text) && ev.filter(e => e.type === 'town').length === 5, `52 crabs: a METROPOLIS (stronger bubbles) and then the CRAB CAPITAL, planet ${s.R.toFixed(1)} (never past ${P.R_MAX})`); }

// 5. jump, and catching: a catch, a perfect catch, a hit, a mend, the end
{ const s = bare(5);
  ok(P.jump(s) && s.crab.air === P.JUMP_S && !P.jump(s), 'jump: up in the air, and no second jump until it lands');
  const ev = run(s, P.JUMP_S + 0.05);
  ok(ev.some(e => e.type === 'landed') && s.crab.air === 0, `it lands after ${P.JUMP_S} s`); }
{ const s = bare(5); s.phase = 'night'; s.pt = 0; s.due = []; const sh = s.shells;
  s.stars = [{ id: 1, p: s.crab.p.slice(), t: 0, T: 1, r: P.STAR_R, big: false }];
  let ev = run(s, 1.1);
  ok(ev.some(e => e.type === 'catch' && !e.perfect) && s.shells === sh + P.STAR_PAY && s.stats.caught === 1, `the crab under a star catches it: +${P.STAR_PAY} shells`);
  s.stars = [{ id: 2, p: s.crab.p.slice(), t: 0, T: 1, r: P.STAR_R, big: false }];
  ev = run(s, 0.7); P.jump(s); ev.push(...run(s, 0.5));
  ok(ev.some(e => e.type === 'catch' && e.perfect && e.pay === P.STAR_PAY * 2) && s.stats.perfect === 1, 'in the air as it lands: a PERFECT catch, worth double'); }
{ const s = bare(6); s.phase = 'night'; s.pt = 0; s.due = [];
  const hut = s.builds[0];
  s.stars = [{ id: 1, p: hut.p.slice(), t: 0, T: 1, r: P.STAR_R, big: false }];
  let ev = run(s, 1.1);
  ok(ev.some(e => e.type === 'impact') && hut.hp === P.HP.hut - 1 && !s.over && P.context(s) === null, 'a star on the home cracks it (the crab is too far to catch it, or to mend it from here)');
  s.crab.p = side(s, hut.p, 1); s.shells = 5;
  ok(P.context(s).kind === 'mend' && P.act(s).type === 'mend' && hut.hp === P.HP.hut && s.shells === 5 - P.REPAIR, `next to it, the action button mends it for ${P.REPAIR} shells`);
  s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 3); hut.hp = 1;
  s.stars = [{ id: 2, p: hut.p.slice(), t: 0, T: 0.5, r: P.STAR_R, big: false }];
  ev = run(s, 0.6);
  ok(s.over && ev.some(e => e.type === 'over') && P.step(s, 1).length === 0, 'the last home gone: the city is lost, and nothing more happens'); }

// 6. towers, dawn, markets, the big one
{ const s = bare(7); s.shells = 60; s.nuts = 30; s.town = 1;
  const hut = s.builds[0]; s.crab.p = side(s, hut.p, 2);
  const tw = P.build(s, 'tower'); s.crab.p = P.walk(hut.p, P.tangent(hut.p, [1, 0, 0]), 2);
  s.phase = 'night'; s.pt = 0; s.due = [];
  for (let k = 0; k < 4; k++) { s.stars = [{ id: 9 + k, p: hut.p.slice(), t: 0, T: 0.2, r: P.STAR_R, big: false }]; run(s, 0.3); }
  ok(tw.charges === 0 && hut.hp === P.HP.hut - 1, `a bubble tower soaks up ${P.TOWER_CHARGES} stars a night; the fourth gets through`);
  s.stars = []; s.pt = P.NIGHT_S; let ev = run(s, 0.1);
  ok(s.day === 2 && s.phase === 'day' && tw.charges === P.TOWER_CHARGES && ev.some(e => e.type === 'dawn' && e.gift === 1), 'dawn: day 2, the tower is charged again, and each crab brings a shell');
  s.builds.push({ id: 800, kind: 'market', p: [0, -1, 0], hp: 2, lvl: 1, age: 99, t: 99, shake: 0, charges: 0 }); hut.lvl = 3; s.builds.push({ id: 801, kind: 'hut', p: [0, 0, 1], hp: 3, lvl: 3, age: 99, t: 99, shake: 0, charges: 0 });
  s.phase = 'night'; s.pt = P.NIGHT_S; ev = run(s, 0.1);
  ok(ev.some(e => e.type === 'dawn' && e.gift === 8 && e.market === 2), 'a market adds a shell for every three crabs at dawn (6 crabs: 6 + 2)'); }
{ const s = bare(8); s.phase = 'night'; s.pt = 0; s.due = []; s.shells = 5;
  s.stars = [{ id: 1, p: s.crab.p.slice(), t: 0, T: 0.5, r: P.BIG_R, big: true }];
  const ev = run(s, 0.6);
  ok(ev.some(e => e.type === 'impact' && e.big && e.ouch === 3) && s.shells === 2 && s.stats.caught === 0, 'the big one can\'t be caught: it knocks 3 shells out of the crab'); }

// 7. the action button: shake a palm, carry a rock, throw it at a star
{ const s = bare(9); s.shells = 20;
  const palm = P.build(s, 'palm'); palm.age = 99; s.crab.p = side(s, palm.p, 1);
  const x = P.context(s), e = P.act(s);
  ok(x.kind === 'shake' && e.type === 'shake' && s.items.some(i => i.kind === 'nut') && P.context(s) === null, 'next to a grown palm: SHAKE drops a coconut at once, then the palm needs a rest');
  run(s, P.SHAKE_CD + 0.1);
  ok(P.context(s)?.kind === 'shake', `after ${P.SHAKE_CD} s it can be shaken again`); }
{ const s = bare(10), far = side(s, s.crab.p, 4);
  s.items = [{ id: 70, kind: 'rock', p: side(s, s.crab.p, 0.8) }];
  ok(P.context(s).kind === 'carry' && P.act(s).type === 'carry' && s.crab.carry === 'rock' && !s.items.length, 'next to a rock: PICK UP, and the crab carries it');
  ok(P.context(s).label === 'DROP' && P.act(s).type === 'drop' && !s.crab.carry && s.items.length === 1, 'with no star about, the button puts it down again');
  s.crab.p = s.items[0].p.slice(); P.act(s);
  s.phase = 'night'; s.pt = 0; s.due = []; const hut = s.builds[0], sh = s.shells;
  s.stars = [{ id: 1, p: hut.p.slice(), t: 0, T: 3, r: P.BIG_R, big: true }, { id: 2, p: far, t: 0, T: 5, r: P.STAR_R, big: false }];
  const lab = P.context(s).label, e = P.act(s);
  ok(lab === 'THROW!' && e.type === 'smash' && e.big && s.stars.length === 1 && s.stars[0].id === 2 && s.shells === sh + 3 && !s.crab.carry && hut.hp === P.HP.hut, 'carrying a rock at night: THROW smashes the star landing soonest, even a big one (+3 shells)'); }

// 8. the boardwalk course: obstacles to time and jump, checkpoints, three tiers
// A player who looks a second ahead: of walking on, jumping, or waiting, it takes the first that doesn't fall.
const ahead = (s, act) => { const t = P.load(P.save(s), () => 0.5), co = t.course, c = t.crab; let k = co.k, fell = false;
  const go = () => { const b = co.pts[Math.min(co.k + 1, co.pts.length - 1)], d = P.toward(c.p, b), r = P.cross(c.f, c.p); return { x: P.dot(d, r), y: P.dot(d, c.f) }; };
  if (act === 'jump') P.jump(t);
  for (let i = 0; i < 54 && !co.done; i++) { const ev = P.step(t, 1 / 60, act === 'wait' && i < 12 ? { x: 0, y: 0 } : go()); if (ev.some(e => e.type === 'fell')) { fell = true; break; } }
  return { fell, gain: co.done ? 99 : co.k - k }; };
const walkCourse = (s, secs = 90) => { const co = s.course, c = s.crab, ev = []; c.p = co.pts[0].slice(); c.air = 0; c.jcd = 0; ev.push(...P.step(s, 1 / 60));
  for (let i = 0; i < 60 * secs && !co.done && co.k >= 0; i++) {
    let act = 'go';
    if (i % 3 === 0) { const g = ahead(s, 'go'); if (g.fell) { const j = ahead(s, 'jump'); act = !j.fell ? 'jump' : 'wait'; } }
    if (act === 'jump') P.jump(s);
    const b = co.pts[co.k + 1], d = P.toward(c.p, b), r = P.cross(c.f, c.p);
    ev.push(...P.step(s, 1 / 60, act === 'wait' ? { x: 0, y: 0 } : { x: P.dot(d, r), y: P.dot(d, c.f) })); }
  return ev; };
const quiet = s => { s.items = []; s.spawnT = 1e9; s.rockT = 1e9; s.builds.forEach(b => { b.t = 1e9; }); return s; };
{ const s = quiet(P.create({ rnd: seeded(11) })), co = s.course;
  ok(co && co.tier === 1 && co.pts.length === 6 && co.segs.filter(k => k === 'gap').length === 1 && co.segs.filter(k => k === 'low').length === 1 && co.segs[0] === 'plank' && co.segs[4] === 'plank' && co.pts.every(unit) && co.pts.every(q => s.builds.every(b => P.dist(s, b.p, q) >= P.SPACE)),
    `a new city's first boardwalk is an EASY one: ${co.segs.join(' · ')}, clear of the buildings`);
  s.crab.p = co.pts[0].slice(); s.shells = 50; ok(P.canBuild(s, 'palm').why === 'space', 'nothing can be built on the planks');
  // straight along it, never jumping: down at the first obstacle that needs a jump, and back at the start
  const sh = s.shells, gapAt = co.segs.indexOf('gap'), ev = []; s.crab.p = co.pts[0].slice(); ev.push(...P.step(s, 1 / 60));
  co.t = (1 - co.off[co.segs.indexOf('low')] + P.SWEEP.low + 0.02) * P.SWEEP.period;      // (the low bar has just passed)
  for (let i = 0; i < 60 * 3 && !ev.some(e => e.type === 'fell'); i++) { const b = co.pts[co.k + 1], d = P.toward(s.crab.p, b), r = P.cross(s.crab.f, s.crab.p); ev.push(...P.step(s, 1 / 60, { x: P.dot(d, r), y: P.dot(d, s.crab.f) })); }
  const f = ev.find(e => e.type === 'fell');
  ok(f && f.why === 'gap' && f.at === 0 && co.k === 0 && P.dist(s, s.crab.p, co.pts[0]) < 0.01 && !s.over && s.shells === sh + gapAt, `walked without jumping: into the gap, and straight back to the start of the planks (${gapAt} coin(s) kept, nothing lost)`);
  const d = P.toward(co.pts[0], co.pts[1]), sideways = P.cross(co.pts[0], d), r = P.cross(s.crab.f, s.crab.p), ev2 = run(s, 0.5, { x: P.dot(sideways, r), y: P.dot(sideways, s.crab.f) });
  ok(ev2.some(e => e.type === 'fell' && e.why === 'side') && co.k === -1 && P.dist(s, s.crab.p, co.pts[0]) > 0.6, 'stepping off the side just puts the crab on the ground: a course can always be left');
  const sh2 = s.shells, ev3 = walkCourse(s);
  ok(co.done && ev3.some(e => e.type === 'chest' && e.prize === co.prize && e.dust === 0) && s.shells === sh2 + ev3.filter(e => e.type === 'coin').length + co.prize && s.stats.courses === 1, `jumping the gap and the bar: the rest of the coins and the chest (+${co.prize} shells)`);
  s.phase = 'night'; s.pt = P.NIGHT_S; s.due = []; s.stars = []; P.step(s, 0.01);
  ok(s.course && s.course.id !== co.id && !s.course.done, 'at dawn a new course is laid somewhere else'); }
// each obstacle on its own
{ const mk = (kinds, checks = []) => { const s = quiet(P.create({ rnd: seeded(31) })); P._newCourse(s, 1); const co = s.course; co.segs = kinds; co.checks = checks; co.off = kinds.map(() => 0);
    let p = co.pts[0], d = P.toward(co.pts[0], co.pts[1]); co.pts = [p]; for (let i = 0; i < kinds.length; i++) { p = P.walk(p, d, P.COURSE_STEP / s.R); d = P.tangent(p, d); co.pts.push(p); }
    s.builds = s.builds.filter(b => co.pts.every(q => P.dist(s, b.p, q) > 2)); if (!P.pop(s)) s.builds.push({ id: 999, kind: 'hut', p: P.norm(co.pts[0].map(v => -v)), hp: 3, lvl: 1, age: 99, t: 1e9, shake: 0, charges: 0 });
    s.crab.p = co.pts[0].slice(); s.crab.f = d; P.step(s, 1 / 60); return s; };
  const fwd = (s, secs, jumpAt = -1) => { const ev = []; for (let t = 0; t < secs; t += 1 / 60) { if (jumpAt >= 0 && Math.abs(t - jumpAt) < 1 / 120) P.jump(s); const co = s.course, b = co.pts[Math.min(Math.max(co.k, 0) + 1, co.pts.length - 1)], d = P.toward(s.crab.p, b), r = P.cross(s.crab.f, s.crab.p); ev.push(...P.step(s, 1 / 60, { x: P.dot(d, r), y: P.dot(d, s.crab.f) })); } return ev; };
  const T = P.SWEEP.period, leg = P.COURSE_STEP / P.SPEED;      // leg: seconds to walk one stretch
  // start the clock so the bar on stretch 1 begins its pass `lead` seconds after the crab steps onto that stretch
  const bar = (s, kind, lead) => { s.course.t = T - leg - lead + (lead > leg + T * P.SWEEP[kind] ? T : 0); return s; };
  { const ev = fwd(bar(mk(['plank', 'low', 'plank']), 'low', 0.05), leg * 3);
    ok(ev.some(e => e.type === 'fell' && e.why === 'sweep'), 'a low bar sweeping across knocks a walking crab off');
    const s2 = bar(mk(['plank', 'low', 'plank']), 'low', 0.05), ev2 = fwd(s2, leg * 3, leg);
    ok(!ev2.some(e => e.type === 'fell') && (s2.course.done || s2.course.k >= 2), 'jumped, it passes underneath');
    const s3 = mk(['plank', 'low', 'plank']); s3.course.t = T * (P.SWEEP.low + 0.03) - leg; const ev3 = fwd(s3, leg * 3);
    ok(!ev3.some(e => e.type === 'fell') && (s3.course.done || s3.course.k >= 2), 'or walk through once it has gone by'); }
  { const ev = fwd(bar(mk(['plank', 'tall', 'plank']), 'tall', 0.05), leg * 3, leg);
    ok(ev.some(e => e.type === 'fell' && e.why === 'sweep'), 'a tall log can\'t be jumped');
    const s2 = mk(['plank', 'tall', 'plank']); s2.course.t = T * (P.SWEEP.tall + 0.03) - leg; const ev2 = fwd(s2, leg * 3);
    ok(!ev2.some(e => e.type === 'fell') && (s2.course.done || s2.course.k >= 2), 'so it has to be timed: through just after it passes'); }
  { const s = mk(['plank', 'crumble', 'plank']); const ev = fwd(s, leg * 2.6);
    ok(ev.some(e => e.type === 'crack') && !ev.some(e => e.type === 'fell') && (s.course.done || s.course.k >= 2) && P.crumbled(s.course, 1), 'a crumbling bridge holds if you keep moving (and has gone when you look back)');
    const s2 = mk(['plank', 'crumble', 'plank']); fwd(s2, leg * 1.5); const ev2 = run(s2, P.CRUMBLE_S + 0.3);
    ok(ev2.some(e => e.type === 'fell' && e.why === 'crumble'), `stop on it for ${P.CRUMBLE_S} s and it drops away under you`);
    run(s2, P.CRUMBLE_BACK + 0.2); ok(!P.crumbled(s2.course, 1), 'it grows back for another try'); }
  { const s = mk(['plank', 'spring', 'void', 'void', 'void', 'plank']); const ev = fwd(s, leg * 6.5);
    ok(ev.some(e => e.type === 'spring') && !ev.some(e => e.type === 'fell') && (s.course.done || s.course.k >= 5), `a spring throws the crab ${P.SPRING_AIR} s through the air, over three planks' worth of nothing`);
    const s2 = mk(['plank', 'plank', 'void', 'void', 'void', 'plank']); const ev2 = fwd(s2, leg * 6.5, leg * 2.1);
    ok(ev2.some(e => e.type === 'fell' && e.why === 'gap'), 'which a jump alone can\'t clear'); }
  { const s = mk(['plank', 'plank', 'gap', 'plank'], [2]); const ev = fwd(s, leg * 3.2); const f = ev.find(e => e.type === 'fell');
    ok(ev.some(e => e.type === 'check') && s.course.cp === 2 && f && f.at === 2 && P.dist(s, s.crab.p, s.course.pts[2]) < 0.9, 'past a checkpoint flag, a fall puts the crab back at the flag, not the start'); }
  { const s = mk(['plank', 'plank']); P.jump(s); run(s, P.JUMP_S - 0.1); const early = P.jump(s); const ev = run(s, 0.2);
    ok(!early && ev.some(e => e.type === 'rejump') && s.crab.air > 0, 'jump pressed a moment before landing is remembered: the crab jumps again as it lands'); } }
// every tier, on many planets, can be finished by a player who looks ahead; harder ones pay stardust
{ for (const tier of [1, 2, 3]) { let done = 0, n = 0, secs = 0, falls = 0, shape = '';
    for (let seed = 1; seed <= 14; seed++) { const s = quiet(P.create({ rnd: seeded(seed * 131) })); s.town = tier; s.R = P.R0 * P.GROW ** tier; if (!P._newCourse(s, tier)) continue;
      n++; shape = s.course.segs.join(' '); const t0 = s.t, ev = walkCourse(s); falls += ev.filter(e => e.type === 'fell').length; if (s.course.done) { done++; secs += s.t - t0; if (s.stats.dust !== P.TIERS[tier].dust) done = -99; } }
    ok(n >= 12 && done === n, `${P.TIERS[tier].icon} ${P.TIERS[tier].name}: ${done}/${n} planets' courses finished (about ${(secs / n).toFixed(0)} s each, ${falls} falls in all), paying ${4 + 5 * tier + 2 * tier} shells${P.TIERS[tier].dust ? ` and ${P.TIERS[tier].dust} stardust` : ''}`);
    if (tier === 3) ok(/spring void void void/.test(shape) && /crumble (gap|low)/.test(shape) && /tall/.test(shape), `   the fiendish one: ${shape}`); }
  const tiers = d => { const c = [0, 0, 0, 0]; for (let seed = 1; seed <= 60; seed++) { const s = P.create({ rnd: seeded(seed * 17) }); s.day = 5; s.town = d; P._newCourse(s); if (s.course) c[s.course.tier]++; } return c.slice(1).join('/'); };
  ok(/^\d+\/0\/0$/.test(tiers(0)) && /^\d+\/[1-9]\d*\/0$/.test(tiers(1)) && /^\d+\/\d+\/[1-9]\d*$/.test(tiers(3)), `a camp gets easy ones, a village tricky ones too, a town all three (easy/tricky/fiendish: ${tiers(0)}, ${tiers(1)}, ${tiers(3)})`); }
// towers fit beside buildings
{ const s = bare(41); s.town = 1; s.shells = 99; s.nuts = 99; const hut = s.builds[0];
  s.crab.p = side(s, hut.p, 1.1);
  ok(P.canBuild(s, 'palm').why === 'space' && P.canBuild(s, 'tower').ok && !!P.build(s, 'tower'), `a tower fits ${1.1} from a home, where nothing else would`);
  s.crab.p = side(s, hut.p, 1.7); ok(P.canBuild(s, 'tower').why === 'space', 'but not on top of another tower');
  s.crab.p = side(s, hut.p, 2.3); ok(!!P.build(s, 'hut'), 'and a home can go right beside a tower'); }

// 9. the tracker: the first steps one at a time, then the next size of city
{ const s = bare(13), lines = [P.goal(s).text];
  const say = () => lines.push(P.goal(s).text);
  s.stats.walked = 5; s.shells = 2; say(); s.shells = 4; say(); s.stats.palms = 1; say(); s.nuts = 4; say(); s.shells = 12; say(); s.stats.huts = 1; s.phase = 'night'; say(); s.stats.caught = 1; say();
  ok(/DRAG/.test(lines[0]) && /SHELLS 🐚 2\/4/.test(lines[1]) && /PLANT A PALM/.test(lines[2]) && /COCONUTS 🥥 0\/4/.test(lines[3]) && /SAVE SHELLS.*4\/11/.test(lines[4]) && /BUILD A HOME/.test(lines[5]) && /CATCH THE STAR/.test(lines[6]) && /VILLAGE: 1\/5 CRABS/.test(lines[7]) && !P.goal(s).tut,
    `the tracker: ${lines.join(' → ')}`); }

// 10. upgrades, a save, and the same seed
{ const a = P.create({ rnd: seeded(1) }), b = P.create({ rnd: seeded(1), up: { speed: 5, start: 2, sturdy: 3, reach: 5, green: 5 } });
  ok(P.speedOf(b) > P.speedOf(a) * 1.29 && b.shells === a.shells + 6 && b.builds[0].hp === a.builds[0].hp + 3 && P.reachOf(b) === 1.4, 'the workshop: quicker claws, a head start, sturdier homes, a longer reach');
  ok(P.upgradeCost(0) === 10 && P.upgradeCost(5) === null && P.UPGRADES.every(u => u.max <= 5), 'upgrade levels cost 10, 20, 35, 55, 80 stardust'); }
{ const s = P.create({ rnd: seeded(21) }); pilot(s, 75);
  const o = P.save(s), json = JSON.stringify(o), t = P.load(JSON.parse(json), seeded(5)), u = P.load(JSON.parse(json), seeded(5));
  pilot(t, 30); pilot(u, 30);
  ok(!('rnd' in o) && t.day >= s.day && JSON.stringify(P.save(t)) === JSON.stringify(P.save(u)) && P.pop(t) >= 1, `a run saves as plain data (${json.length} bytes, day ${s.day}, ${P.pop(s)} crabs) and plays on from there`); }
{ const play = () => { const s = P.create({ rnd: seeded(77) }); pilot(s, 200); return `${s.day}/${s.shells}/${s.builds.length}/${s.stats.caught}/${P.pop(s)}`; };
  ok(play() === play(), `the same seed gives the same island (${play()})`); }

// 11. how a sensible player gets on: a real game, not a wall and not for ever
{ const go = up => { const out = []; for (let seed = 1; seed <= 12; seed++) { const s = P.create({ rnd: seeded(seed * 7919), up }); pilot(s, 60 * 45); out.push({ day: s.over ? s.day : 99, peak: s.stats.peak, town: s.town }); } return out; };
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const base = go({}), maxed = go({ speed: 5, start: 5, green: 5, reach: 5, sturdy: 3, lucky: 5 });
  const line = r => `days ${r.map(x => x.day).join(' ')} · biggest city ${r.map(x => x.peak).join(' ')}`;
  console.log(`     no upgrades:  ${line(base)}\n     all upgrades: ${line(maxed)}`);
  const bd = med(base.map(x => x.day)), bp = med(base.map(x => x.peak)), mp = med(maxed.map(x => x.peak));
  ok(Math.min(...base.map(x => x.day)) >= 4 && bd >= 8 && bd <= 30 && Math.max(...base.map(x => x.day)) < 99, `with no upgrades the autopilot lasts ${bd} days in the middle, and always ends`);
  ok(bp >= 10 && bp < 50, `and its city reaches ${bp} crabs in the middle: a TOWN at least, the CAPITAL still to be earned`);
  ok(mp > bp && Math.max(...maxed.map(x => x.day)) < 99, `with every upgrade the city is bigger (${mp}), and still ends`); }

{ // homes and markets pay: a bigger home pays more, a market pays most
  const pay = kind => { const s = P.create(); s.phase = 'day'; s.shells = 0; const b = { id: 999, kind, p: s.crab.p.slice(), hp: 9, lvl: kind === 'hut' ? 3 : 1, age: 99, t: 0.01, shake: 0, charges: 0 }; s.builds = [b]; P.step(s, 0.05); return s.shells; };
  ok(pay('hut') === 3 && pay('market') === P.MARKET_PAY, `a size-3 home pays 3 shells at once, a market ${P.MARKET_PAY}: the town is where shells come from`); }

console.log(fails ? `\nPLANET FAIL (${fails})` : '\nPLANET PASS');
process.exit(fails ? 1 : 0);
