// Coral Merge (free-fall physics) rules, no browser.
// usage: node qa/coral.mjs
import { create, drop, step, bodies, canDrop, clampX, points, KINDS, RADII, TANK_W, TANK_H, LINE_Y, BUBBLE, TOP } from '../src/arcade/CoralPhysics.js';
import { rng } from '../src/arcade/SoloStats.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const run = (g, secs) => { const ev = []; for (let t = 0; t < secs; t += 1 / 30) ev.push(...step(g, 1 / 30)); return ev; };
const kinds = g => bodies(g).map(b => b.getUserData().kind).sort();
const queue = (g, list) => { g.next = list[0]; g.after = list[1] ?? 0; };   // set what drops next

// A creature falls and comes to rest on the floor, inside the tank
let g = create(rng(1));
queue(g, [0, 3]);
drop(g, 3.5); run(g, 2);
const b0 = bodies(g)[0], p0 = b0.getPosition();
ok(Math.abs(p0.y - (TANK_H - RADII[0])) < 0.05 && p0.x > 0 && p0.x < TANK_W, `a shell falls and rests on the floor (y ${p0.y.toFixed(2)})`);
// Two of a kind touching merge into the next kind up
queue(g, [0, 1]);
drop(g, 3.5);
const ev = run(g, 2);
ok(JSON.stringify(kinds(g)) === '[1]' && ev.some(e => e.type === 'merge' && e.kind === 1), `two shells meet: one snail (${kinds(g).map(k => KINDS[k]).join('')})`);
ok(g.score === points(1), `and it scores ${points(1)} (${g.score})`);
// Different kinds don't merge
queue(g, [3, 0]);
drop(g, 3.5); run(g, 2);
ok(JSON.stringify(kinds(g)) === '[1,3]', `a crab on a snail: no merge (${kinds(g).map(k => KINDS[k]).join('')})`);
// A chain: shell + shell make a snail that lands on a snail: a shrimp, as a combo
g = create(rng(2));
queue(g, [1, 0]); drop(g, 3.5); run(g, 1.5);
queue(g, [0, 0]); drop(g, 3.5); run(g, 0.6); queue(g, [0, 0]); drop(g, 3.5);
const ev2 = run(g, 3);
const m = ev2.filter(e => e.type === 'merge');
ok(kinds(g).includes(2) && m.some(e => e.combo >= 2), `shells → snail → shrimp: a chain, combo ×${Math.max(...m.map(e => e.combo))}`);
// Two of the top kind burst
g = create(rng(3));
queue(g, [TOP, TOP]); drop(g, 2); run(g, 1.5); queue(g, [TOP, 0]); drop(g, 4.5);
const ev3 = run(g, 3);
ok(ev3.some(e => e.type === 'treasure') && !kinds(g).includes(TOP), 'two treasures: a burst, both gone, big bonus');
// Drops wait for the cooldown, and stay between the walls
g = create(rng(4));
ok(drop(g, 3) && !canDrop(g) && drop(g, 3) === null, 'a second drop straight away waits for the cooldown');
ok(clampX(g, -5, 9) >= RADII[9] && clampX(g, 99, 9) <= TANK_W - RADII[9], 'drops are kept between the walls');
// A bubble pops after landing and lifts its neighbours
g = create(rng(5));
for (let i = 0; i < 5; i++) { queue(g, [3, 3]); drop(g, 0.8 + i * 1.35); run(g, 0.5); }
run(g, 2);
const before = bodies(g).map(b => b.getPosition().y);
queue(g, [BUBBLE, 0]); drop(g, 3.5);
const ev4 = run(g, 1.6);
const pop = ev4.find(e => e.type === 'pop');
ok(pop && pop.lifted > 0 && !bodies(g).some(b => b.getUserData().kind === BUBBLE), `a bubble lands, pops and lifts ${pop ? pop.lifted : 0} creatures`);
// Over the line for two seconds ends it
g = create(rng(6));
let n = 0;
while (!g.over && n < 400) { if (canDrop(g)) { queue(g, [n % 2 ? 4 : 3, 0]); drop(g, 3.5); } run(g, 0.25); n++; }
ok(g.over, `piling up over the line ends the game (after ${g.drops} drops)`);
// The same seed and drops make the same game
const play = () => { const x = create(rng(9)); for (let i = 0; i < 25; i++) { drop(x, 1 + (i * 1.7) % 5); run(x, 0.6); } return JSON.stringify({ s: x.score, k: kinds(x), p: bodies(x).map(b => b.getPosition().x.toFixed(3)) }); };
ok(play() === play(), 'the same seed and the same drops make the same game');

if (fails) { console.log(`CORAL FAIL — ${fails}`); process.exit(1); }
console.log('CORAL PASS');
