// Physics checks for Playroom Parkour's engine: each mechanic does what it says.
//   node src/games/parkour/tests/physics.test.mjs
import { compile, step, NO_INPUT, hashState, coinCount, moverPos, solidAt, ridePos } from '../core/World.js';
import { P, GRAV, SLIP, SWING, BOUNCE, TOYS } from '../core/Rules.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); c ? pass++ : fail++; };
const I = (o = {}) => ({ ...NO_INPUT, ...o });
const run = (w, inp, n) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...step(w, typeof inp === 'function' ? inp(i) : inp)); return ev; };
const lvl = (map, devices = []) => ({ id: 't', map, devices });
const feet = w => w.s.p.y + P.H;
/** Highest the feet get (smallest y) over n frames. */
const peak = (w, inp, n) => { let best = feet(w); for (let i = 0; i < n; i++) { step(w, typeof inp === 'function' ? inp(i) : inp); best = Math.min(best, feet(w)); } return best; };

const FLOOR = [
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#S..........................G#',
    '##############################',
];

// 1. Run and jump
{
    const w = compile(lvl(FLOOR)); run(w, NO_INPUT, 5);
    const ground = feet(w);
    const top = peak(w, i => I({ j: i < 40 }), 60);
    ok(Math.abs(ground - top - P.JUMP_V ** 2 / (2 * P.G)) < 0.15, `a full jump rises about 2.6 tiles (${(ground - top).toFixed(2)})`);
    const w2 = compile(lvl(FLOOR)); run(w2, NO_INPUT, 5);
    const hop = ground - peak(w2, i => I({ j: i < 3 }), 60);
    ok(hop < 1.2, `a tap is a short hop (${hop.toFixed(2)})`);
    const w3 = compile(lvl(FLOOR)); run(w3, I({ r: true }), 60);
    ok(Math.abs(w3.s.p.vx - P.RUN) < 0.01, `running reaches ${P.RUN} tiles/s`);
}

// 2. Sponges bounce higher the faster you land, and higher still with JUMP held
{
    const map = FLOOR.map((r, y) => (y === 10 ? '#####TTTTT####################' : r));
    const drop = (fromRow, hold) => {
        const w = compile(lvl(map.map((r, y) => (y === 9 ? r.replace('S', '.') : r)).map((r, y) => (y === fromRow ? r.slice(0, 7) + 'S' + r.slice(8) : r))));
        let firstBounce = null;
        for (let i = 0; i < 200 && firstBounce === null; i++) { const ev = step(w, I({ j: hold })); const b = ev.find(e => e.type === 'bounce'); if (b) firstBounce = b.v; }
        return firstBounce;
    };
    const low = drop(8, false), high = drop(2, false), held = drop(2, true);
    ok(low >= BOUNCE.MIN && high > low + 2, `a sponge throws you back harder from higher up (${low.toFixed(1)} → ${high.toFixed(1)})`);
    ok(held > high + 1, `holding JUMP as you land adds a kick (${high.toFixed(1)} → ${held.toFixed(1)})`);
}

// 3. Jack-in-the-box
{
    const map = FLOOR.map((r, y) => (y === 9 ? '#S...........................G' + '' : r)).map(r => r.slice(0, 30));
    const w = compile(lvl(map, [{ type: 'spring', id: 'jb', x: 4, y: 9 }]));
    const ground = feet(w);
    let fired = false;
    const top = peak(w, i => { return I({ r: i < 30, j: i > 8 && i < 14 }); }, 120);
    for (let i = 0; i < 1; i++) fired = !!w.s.fired.jb;
    ok(fired && ground - top > 6, `a jack-in-the-box throws you about 7 tiles up (${(ground - top).toFixed(1)})`);
}

// 4. Toy cannon
{
    const w = compile(lvl(FLOOR, [{ type: 'cannon', id: 'c', x: 3, y: 9, aim: [[1, -1]] }]));
    let ev = run(w, I({ r: true }), 20);
    ok(ev.some(e => e.type === 'cannon_in') && w.s.p.cannon === 'c', 'walking into a cannon climbs in');
    run(w, NO_INPUT, 20);
    ev = run(w, i => I({ j: i === 0 }), 2);
    ok(ev.some(e => e.type === 'cannon_fire') && w.s.p.vx > 10 && w.s.p.vy < -10, `JUMP fires it along its aim (${w.s.p.vx.toFixed(1)}, ${w.s.p.vy.toFixed(1)})`);
}

// 5. Ice: you slide
{
    const ice = FLOOR.map((r, y) => (y === 10 ? '#IIIIIIIIIIIIIIIIIIIIIIIIIIII#' : r));
    const slide = map => { const w = compile(lvl(map)); run(w, I({ r: true }), 60); const x0 = w.s.p.x; run(w, NO_INPUT, 90); return w.s.p.x - x0; };
    const a = slide(FLOOR), b = slide(ice);
    ok(b > a + 3, `letting go on ice slides much farther (${a.toFixed(2)} vs ${b.toFixed(2)} tiles)`);
}

// 6. Conveyor belts carry you
{
    const belt = FLOOR.map((r, y) => (y === 10 ? '#>>>>>>>>>>>>>>>>>>>>>>>>>>>>#' : r));
    const w = compile(lvl(belt)); run(w, NO_INPUT, 60);
    ok(Math.abs(w.s.p.vx - SLIP.CONVEYOR) < 0.01, `standing still on a belt moves you at ${SLIP.CONVEYOR} tiles/s`);
    const back = FLOOR.map((r, y) => (y === 10 ? '#<<<<<<<<<<<<<<<<<<<<<<<<<<<<#' : r));
    const w2 = compile(lvl(back)); run(w2, I({ r: true }), 60);
    ok(Math.abs(w2.s.p.vx - (P.RUN - SLIP.CONVEYOR)) < 0.01, `running against a belt is slower (${w2.s.p.vx.toFixed(2)})`);
}

// 7. Fans push, magnets pull
{
    const w = compile(lvl(FLOOR, [{ type: 'fan', x: 1, y: 2, w: 4, h: 8, ax: 0, ay: -70 }]));
    const ground = feet(w); run(w, NO_INPUT, 60);
    ok(ground - feet(w) > 3, `an updraft fan lifts you (${(ground - feet(w)).toFixed(1)} tiles)`);
    const w2 = compile(lvl(FLOOR, [{ type: 'magnet', x: 9, y: 9.5, r: 9, pull: 40 }]));
    run(w2, NO_INPUT, 30);
    ok(w2.s.p.x > 3, `a magnet pulls you toward it (x ${w2.s.p.x.toFixed(1)})`);
}

// 8. Yo-yo swings
{
    const map = [
        '##############################',
        '#............................#',
        '#............................#',
        '#............................#',
        '#............................#',
        '#............................#',
        '#S...........................#',
        '###..........................#',
        '#............................#',
        '#...........................G#',
        '#^^^^^^^^^^^^^^^^^^^^^^^^^^###',
    ];
    const w = compile(lvl(map, [{ type: 'rope', id: 'yo', x: 5, y: 2, len: 5 }]));
    const ev = run(w, I({ r: true }), 40);
    ok(ev.some(e => e.type === 'grab') && w.s.p.rope === 'yo', 'running off a ledge into a yo-yo string grabs it');
    run(w, I({ r: true }), 50);
    const d = Math.hypot(w.s.p.x + P.W / 2 - 5, w.s.p.y + P.H / 2 - 2);
    ok(Math.abs(d - w.s.p.ropeR) < 0.01, `swinging keeps you on the string (${d.toFixed(2)} = ${w.s.p.ropeR.toFixed(2)})`);
    // Let go on the forward swing: the speed carries you.
    for (let i = 0; i < 200 && !(w.s.p.vx > 3 && w.s.p.vy < 0); i++) step(w, I({ r: true }));
    const vx = w.s.p.vx;
    const ev2 = run(w, i => I({ j: i === 0 }), 1);
    ok(ev2.some(e => e.type === 'letgo') && !w.s.p.rope && w.s.p.vx > 3, `JUMP lets go and you fly on (vx ${vx.toFixed(1)})`);
}

// 9. Toy cars carry you
{
    const map = FLOOR.map((r, y) => (y === 10 ? '#####.........................' : y === 9 ? '#....S.......................G' : r)).map(r => r.slice(0, 30));
    const car = { type: 'mover', id: 'car', x: 5, y: 10, w: 2, to: [20, 10], period: 240 };
    const w = compile(lvl(map, [car]));
    run(w, NO_INPUT, 80);
    const mp = moverPos(car, w.s.t);
    ok(w.s.p.grounded && w.s.p.ground === 'car' && Math.abs(w.s.p.x + P.W / 2 - (mp.x + 1)) < 1.2, `standing on a toy car rides it (x ${w.s.p.x.toFixed(1)}, car ${mp.x.toFixed(1)})`);
}

// 10. ABC blocks wobble, fall, come back
{
    const map = FLOOR.map((r, y) => (y === 10 ? '#CCC##########################' : r));
    const w = compile(lvl(map));
    const ev = run(w, NO_INPUT, SWING.CRUMBLE_SHAKE + 40);
    ok(ev.some(e => e.type === 'wobble') && ev.some(e => e.type === 'death' && e.why === 'fell'), 'standing on ABC blocks: they wobble, fall, and so do you');
    const w2 = compile(lvl(map));
    run(w2, NO_INPUT, 2); run(w2, I({ r: true }), 30);
    run(w2, NO_INPUT, SWING.CRUMBLE_SHAKE + SWING.CRUMBLE_BACK + 10);
    ok(Object.keys(w2.s.crumble).length === 0, 'they come back a little later');
}

// 11. Seesaw tips toward your weight
{
    const map = FLOOR.map((r, y) => (y === 10 ? '#..........................###' : r));
    const w = compile(lvl(map.map((r, y) => (y === 9 ? '#............................#' : y === 5 ? '#.........S..................#' : r)), [{ type: 'seesaw', id: 'ss', x: 12, y: 8, half: 4 }]));
    run(w, NO_INPUT, 60);
    ok(w.s.p.ground === 'ss' && w.s.seesaw.ss.m < -0.4, `standing left of the pivot tips the left end down (slope ${w.s.seesaw.ss.m.toFixed(2)})`);
    let most = -1;
    for (let i = 0; i < 80 && w.s.p.ground === 'ss' || i < 5; i++) { step(w, I({ r: true })); most = Math.max(most, w.s.seesaw.ss.m); }
    ok(most > 0.1, `walk across and it tips the other way (slope ${most.toFixed(2)} as you reach the end)`);
}

// 12. Balloon zone: floaty and higher
{
    const w = compile(lvl(FLOOR, [{ type: 'lowg', x: 1, y: 1, w: 10, h: 9 }]));
    run(w, NO_INPUT, 5);
    const ground = feet(w);
    let air = 0, top = ground;
    for (let i = 0; i < 300; i++) { step(w, I({ j: i < 120 })); top = Math.min(top, feet(w)); if (!w.s.p.grounded) air++; else if (air) break; }
    ok(ground - top > 3, `a jump in the balloon zone goes higher (${(ground - top).toFixed(1)} tiles)`);
    ok(air > 70, `and hangs in the air longer (${(air / 60).toFixed(2)} s vs ${(2 * P.JUMP_V / P.G).toFixed(2)} s)`);
}

// 13. Flip zones: fall up, stand on the ceiling, flip back
{
    const w = compile(lvl(FLOOR, [{ type: 'flip', x: 4, y: 8, w: 1, h: 2, dir: 'up' }, { type: 'flip', x: 12, y: 1, w: 1, h: 2, dir: 'down' }]));
    const ev = run(w, I({ r: true }), 30);
    ok(ev.some(e => e.type === 'flip') && w.s.p.g === -1, 'running through an up-arrow flips gravity');
    run(w, NO_INPUT, 60);
    ok(w.s.p.grounded && w.s.p.y < 1.1, `you land on the ceiling (y ${w.s.p.y.toFixed(2)})`);
    run(w, I({ r: true }), 90);
    run(w, NO_INPUT, 60);
    ok(w.s.p.g === 1 && w.s.p.grounded && feet(w) > 9.9, 'a down-arrow puts you back on the floor');
}

// 14. Fish tank: sink slowly, swim up, leap out
{
    const map = [
        '##############################',
        '#............................#',
        '#............................#',
        '#.S..........................#',
        '#####~~~~~~~~~~~#############',
        '#####~~~~~~~~~~~#............#',
        '#####~~~~~~~~~~~#............#',
        '#####~~~~~~~~~~~#............#',
        '#####~~~~~~~~~~~#...........G#',
        '##############################',
    ].map(r => (r.length < 30 ? r + '#' : r));
    const w = compile(lvl(map));
    const ev = run(w, I({ r: true }), 40);
    ok(ev.some(e => e.type === 'splash'), 'you splash into the tank');
    run(w, NO_INPUT, 60);
    ok(w.s.p.vy <= GRAV.WATER_FALL + 0.01 && w.s.p.vy > 0, `and sink slowly (${w.s.p.vy.toFixed(2)} tiles/s)`);
    const y0 = w.s.p.y;
    run(w, i => I({ j: i % 20 === 0 }), 40);
    ok(w.s.p.y < y0, 'JUMP in water swims up');
    let leapt = false;
    for (let i = 0; i < 200 && !leapt; i++) leapt = step(w, I({ j: i % 12 === 0 })).some(e => e.type === 'leap');
    ok(leapt && w.s.p.vy < -10, 'with your head out, JUMP leaps out of the water');
}

// 15. Coins, checkpoints, a fall puts you back at the flag
{
    const map = FLOOR.map((r, y) => (y === 10 ? '#########.....################' : r));
    const w = compile(lvl(map, [{ type: 'coin', x: 4, y: 9 }, { type: 'flag', x: 6, y: 9 }]));
    run(w, I({ r: true }), 70);
    ok(coinCount(w.s) === 1 && w.s.check === 0, 'running over a coin and a flag takes both');
    for (let i = 0; i < 200 && !w.s.deaths; i++) step(w, I({ r: true }));
    ok(w.s.deaths === 1 && Math.abs(w.s.p.x - 6.15) < 0.01, `falling in a pit puts you back at the flag (x ${w.s.p.x.toFixed(2)})`);
}

// 17. Pinball bumpers knock you away from their middle
{
    // Run into a bumper sitting on the floor: thrown back the way you came, and up.
    const w = compile(lvl(FLOOR, [{ type: 'bumper', id: 'pb', x: 8, y: 9.4, r: 0.6 }]));
    let hit = null;
    for (let i = 0; i < 120 && !hit; i++) hit = step(w, I({ r: true })).find(e => e.type === 'bump');
    ok(!!hit && w.s.p.vx < -8 && w.s.p.vy < 0, `running into a bumper knocks you back and up (vx ${w.s.p.vx.toFixed(1)}, vy ${w.s.p.vy.toFixed(1)})`);
    // Drop onto one from above: straight back up, about 3 tiles.
    const map = FLOOR.map((r, y) => (y === 9 ? r.replace('S', '.') : y === 2 ? '#......S.....................#' : r));
    const w2 = compile(lvl(map, [{ type: 'bumper', id: 'pb', x: 7.5, y: 8.5, r: 0.6 }]));
    let up = null;
    for (let i = 0; i < 200 && up === null; i++) if (step(w2, NO_INPUT).some(e => e.type === 'bump')) up = w2.s.p.vy;
    const top = peak(w2, NO_INPUT, 60);
    ok(up !== null && up < -TOYS.BUMP_V * 0.9 && 8.5 - top > 2.2, `landing on a bumper bounces you straight up (${up?.toFixed(1)} tiles/s, ${(8.5 - top).toFixed(1)} tiles)`);
    const w3 = compile(lvl(FLOOR, [{ type: 'bumper', id: 'pb', x: 8, y: 9.4, r: 0.6, power: 1.5 }]));
    let hit3 = null;
    for (let i = 0; i < 120 && !hit3; i++) hit3 = step(w3, I({ r: true })).find(e => e.type === 'bump');
    ok(Math.hypot(w3.s.p.vx, w3.s.p.vy) > TOYS.BUMP_V * 1.4, 'a stronger bumper (power) knocks harder');
}

// 18. Bubbles float you up; steer, JUMP pops; touching a wall pops; the wand blows a new one
{
    const map = FLOOR.map((r, y) => (y === 9 ? '#S...........................#' : r));
    const w = compile(lvl(map, [{ type: 'bubble', id: 'bb', x: 6, y: 7.6 }]));
    let inside = false;
    for (let i = 0; i < 120 && !inside; i++) { step(w, I({ r: true, j: i >= 20 && i < 45 })); inside = !!w.s.p.bubble; }
    ok(inside, 'jumping into a bubble puts you inside it');
    const empty = !!w.s.blown.bb;
    const y0 = w.s.p.y;
    run(w, NO_INPUT, 60);
    ok(w.s.p.bubble && y0 - w.s.p.y > TOYS.BUBBLE_RISE * 0.7, `it floats you up (${(y0 - w.s.p.y).toFixed(2)} tiles in a second)`);
    const x0 = w.s.p.x;
    run(w, I({ l: true }), 30);
    ok(w.s.p.x < x0 - 0.8, '◀ ▶ steer it');
    const evs = run(w, i => I({ j: i === 2 }), 4);
    ok(!w.s.p.bubble && evs.some(e => e.type === 'pop') && w.s.p.vy < -10, 'JUMP pops it with a jump');
    ok(empty, 'the wand is empty for a moment…');
    run(w, NO_INPUT, TOYS.BUBBLE_BACK);
    ok(!w.s.blown.bb, '…then blows a new bubble');
    // Floated into the ceiling: pops by itself.
    const w2 = compile(lvl(map, [{ type: 'bubble', id: 'bb', x: 6, y: 7.6 }]));
    let popped = null;
    for (let i = 0; i < 600 && !popped; i++) popped = step(w2, I({ r: i < 30, j: i >= 20 && i < 45 && !w2.s.p.bubble })).find(e => e.type === 'pop');
    ok(popped?.why === 'wall', `floating into the ceiling pops it (${popped?.why})`);
    // A fan blows a bubble sideways.
    const w3 = compile(lvl(map, [{ type: 'bubble', id: 'bb', x: 6, y: 7.6 }, { type: 'fan', x: 1, y: 1, w: 28, h: 8, ax: 30, ay: 0 }]));
    for (let i = 0; i < 120 && !w3.s.p.bubble; i++) step(w3, I({ r: true, j: i >= 20 && i < 45 }));
    const bx = w3.s.p.x; run(w3, NO_INPUT, 40);
    ok(w3.s.p.bubble && w3.s.p.x > bx + 2, `a fan blows a bubble along (${(w3.s.p.x - bx).toFixed(1)} tiles)`);
}

// 19. Toy trains loop along their track and carry you
{
    const tr = { type: 'train', id: 'tt', w: 3, speed: 4, path: [[4, 9], [20, 9], [20, 3], [4, 3]] };
    const w = compile(lvl(FLOOR.map((r, y) => (y === 9 ? '#S...........................G' : r)).map(r => r.slice(0, 30)), [tr]));
    const t = w.L.byId.tt;
    const loopFrames = t.period;
    const a = moverPos(t, 0), b = moverPos(t, loopFrames), mid = moverPos(t, Math.round(loopFrames * (16 / 44)));
    ok(Math.abs(a.x - b.x) < 0.1 && Math.abs(a.y - b.y) < 0.1, `a train comes back round to where it started (loop ${loopFrames} frames)`);
    ok(Math.abs(mid.x - 20) < 0.2 && Math.abs(mid.y - 9) < 0.2, 'it runs the track at a steady speed');
    // Stand on it as it goes up the side: it lifts you.
    const map = FLOOR.map((r, y) => (y === 9 ? '#............................#' : y === 8 ? '#.....S......................#' : r));
    const w2 = compile(lvl(map, [{ type: 'train', id: 'tt', w: 3, speed: 4, path: [[5, 9], [12, 9], [12, 3], [5, 3]] }]));
    run(w2, NO_INPUT, 30);
    const rode = w2.s.p.grounded && w2.s.p.ground === 'tt';
    run(w2, NO_INPUT, 160);
    ok(rode && w2.s.p.ground === 'tt' && w2.s.p.y < 5, `riding a train carries you along and up its track (y ${w2.s.p.y.toFixed(1)})`);
}

// 20. Tick-tock blocks come and go with the beat
{
    const map = FLOOR.map((r, y) => (y === 10 ? '#####RRRR####BBBB#############' : r));
    const w = compile(lvl(map));
    const half = w.L.tick / 2;
    ok(solidAt(w, 6, 10) && !solidAt(w, 14, 10), 'red blocks are solid on the first half of the beat, blue ones aren\'t');
    run(w, NO_INPUT, half);
    ok(!solidAt(w, 6, 10) && solidAt(w, 14, 10), '…and the other way round on the second half');
    // Standing on red when it goes: you fall.
    const map2 = FLOOR.map((r, y) => (y === 10 ? '#RRRRRR#######################' : r));
    const w2 = compile(lvl(map2));
    run(w2, NO_INPUT, 20);
    const stood = w2.s.p.grounded;
    run(w2, NO_INPUT, half);
    ok(stood && !w2.s.p.grounded && w2.s.p.vy > 0, 'standing on a red block when the beat turns: you drop');
    // A block that comes on around you lets you out instead of trapping you.
    const map3 = FLOOR.map((r, y) => (y === 9 ? '#S..BB.......................G' : r)).map(r => r.slice(0, 30));
    const w3 = compile(lvl(map3));
    run(w3, I({ r: true }), 30);                  // inside the (off) blue blocks…
    run(w3, I({ r: true }), half);                // …as they come on: walk out the far side
    ok(w3.s.p.x > 8, `a tick-tock block that comes on around you lets you walk out (x ${w3.s.p.x.toFixed(1)})`);
}

// 21. Velcro walls: slide down slowly, jump off, climb a shaft by kicking from wall to wall
{
    const shaft = (row1, row9, wall = 'W') => [
        '##############################',
        row1,
        ...Array.from({ length: 7 }, () => '#..........W....W............#'),
        row9,
        '##############################',
    ].map(r => r.split('W').join(wall));
    // Fall beside a velcro wall: you stick and slide slowly.
    const w = compile(lvl(shaft('#..........WS...W............#', '#..........W....W...........G#')));
    let maxSlide = 0, slid = 0;
    for (let i = 0; i < 90; i++) { step(w, I({ l: true })); if (w.s.p.wall) { slid++; maxSlide = Math.max(maxSlide, w.s.p.vy); } }
    ok(slid > 20 && maxSlide <= TOYS.WALL_SLIDE + 1e-9, `touching velcro in the air you slide down it slowly (${slid} frames, ≤ ${maxSlide.toFixed(2)} tiles/s)`);
    // Jump off it: up and away.
    const w2 = compile(lvl(shaft('#..........WS...W............#', '#..........W....W...........G#')));
    for (let i = 0; i < 40; i++) step(w2, I({ l: true }));
    const evs = run(w2, i => I({ j: i < 10 }), 2);
    ok(evs.some(e => e.type === 'walljump') && w2.s.p.vx > 5 && w2.s.p.vy < -10, `JUMP on a velcro wall kicks you up and away (vx ${w2.s.p.vx.toFixed(1)}, vy ${w2.s.p.vy.toFixed(1)})`);
    // A plain wall doesn't do any of that.
    const w3 = compile(lvl(shaft('#..........WS...W............#', '#..........W....W...........G#', '#')));
    let stuck = 0;
    for (let i = 0; i < 40; i++) { step(w3, I({ l: true })); if (w3.s.p.wall) stuck++; }
    ok(stuck === 0 && w3.s.p.vy > TOYS.WALL_SLIDE, 'a plain wall is just a wall (no sliding)');
    // Climb the shaft: kick from wall to wall, higher each time.
    const w4 = compile(lvl(shaft('#..........W....W............#', '#..........W.S..W...........G#')));
    let best = w4.s.p.y, side = 1, kicks = 0, last = -99, prevJ = false;
    for (let i = 0; i < 400; i++) {
        const p = w4.s.p;
        // Hold JUMP through each jump (a tap is a short hop); press it again when you touch the next wall.
        const j = i < 15 || i - last < 14 || (p.wall !== 0 && !prevJ);
        prevJ = j;
        const evs2 = step(w4, I({ r: side > 0, l: side < 0, j }));
        const kick = evs2.find(e => e.type === 'walljump'); if (kick) { side = -kick.side; kicks++; last = i; }
        best = Math.min(best, w4.s.p.y);
    }
    ok(best < 3.5, `wall-jumping from wall to wall climbs the shaft (${kicks} kicks, up to y ${best.toFixed(1)})`);
}

// 22. Paper planes: ride, glide down, pull up (and slow down), stall, let go, hop off when you touch something
{
    const map = [...FLOOR.slice(0, 1), ...Array.from({ length: 6 }, () => FLOOR[1]), ...FLOOR.slice(1)].map((r, y) => (y === 15 ? '#............................#' : y === 9 ? '##########...................#' : y === 8 ? '#.......S....................#' : r));
    const pl = { type: 'plane', id: 'pp', x: 11, y: 9, dir: 1 };
    const w = compile(lvl(map, [pl]));
    let boarded = false;
    for (let i = 0; i < 80 && !boarded; i++) boarded = step(w, I({ r: true })).some(e => e.type === 'plane');
    ok(boarded && w.s.p.plane === 'pp' && Math.abs(w.s.p.vx - TOYS.PLANE_CRUISE) < 0.01, 'walking into a paper plane: you ride it off at its speed');
    const y0 = w.s.p.y; run(w, NO_INPUT, 40);
    ok(w.s.p.plane && w.s.p.y > y0 && w.s.p.vy <= TOYS.PLANE_SINK + 1e-9 && w.s.p.vx > TOYS.PLANE_CRUISE, `left alone it glides down gently and speeds up (sink ${w.s.p.vy.toFixed(2)}, speed ${w.s.p.vx.toFixed(2)})`);
    const y1 = w.s.p.y, v1 = w.s.p.vx; run(w, I({ j: true }), 24);
    ok(w.s.p.y < y1 && w.s.p.vx < v1 - 1, `hold JUMP: it pulls up and slows down (${(y1 - w.s.p.y).toFixed(2)} tiles up, speed ${v1.toFixed(1)} → ${w.s.p.vx.toFixed(1)})`);
    let stalled = false;
    for (let i = 0; i < 200 && w.s.p.plane; i++) { step(w, I({ j: true })); if (w.s.p.vx < TOYS.PLANE_MIN && w.s.p.vy > 0) stalled = true; }
    ok(stalled, 'keep pulling up and it runs out of speed and stalls');
    const w2 = compile(lvl(map, [pl]));
    for (let i = 0; i < 80 && !w2.s.p.plane; i++) step(w2, I({ r: true }));
    run(w2, NO_INPUT, 10);
    const ev2 = run(w2, I({ l: true }), 1);
    ok(!w2.s.p.plane && ev2.some(e => e.type === 'unplane' && e.why === 'off'), '◀ (away from where it flies) lets go');
    // ▶ (the way it flies) dives; an updraft lifts it.
    const wd = compile(lvl(map, [pl])), wg = compile(lvl(map, [pl]));
    for (const ww of [wd, wg]) for (let i = 0; i < 80 && !ww.s.p.plane; i++) step(ww, I({ r: true }));
    run(wd, I({ r: true }), 30); run(wg, NO_INPUT, 30);
    ok(wd.s.p.y > wg.s.p.y + 0.5, `holding ▶ dives (${(wd.s.p.y - wg.s.p.y).toFixed(2)} tiles lower than gliding)`);
    const wf = compile(lvl(map, [pl, { type: 'fan', x: 12, y: 2, w: 10, h: 12, ax: 0, ay: -60 }]));
    for (let i = 0; i < 80 && !wf.s.p.plane; i++) step(wf, I({ r: true }));
    const fy = wf.s.p.y; run(wf, NO_INPUT, 45);
    ok(wf.s.p.plane && wf.s.p.y < fy - 1, `an updraft lifts a paper plane (${(fy - wf.s.p.y).toFixed(2)} tiles up)`);
    const w3 = compile(lvl(map, [pl]));
    for (let i = 0; i < 80 && !w3.s.p.plane; i++) step(w3, I({ r: true }));
    let ended = null;
    for (let i = 0; i < 600 && !ended; i++) ended = step(w3, NO_INPUT).find(e => e.type === 'unplane');
    ok(ended && (ended.why === 'land' || ended.why === 'crash') && !!w3.s.planes.pp, `gliding into the floor ends the flight (${ended?.why}); the plane goes back to its stand`);
    run(w3, NO_INPUT, TOYS.PLANE_BACK + 2);
    ok(!w3.s.planes.pp, '…and is there again a moment later');
}

// 23. Pogo sticks: bounce everywhere, higher with JUMP held, safe on spikes, put down at a rack or in water
{
    const map = FLOOR.map((r, y) => (y === 10 ? '#########^^^^^^^^#############' : r));
    const w = compile(lvl(map, [{ type: 'pogo', id: 'pg', x: 3, y: 9 }, { type: 'rack', id: 'rk', x: 22, y: 9 }]));
    let got = false;
    for (let i = 0; i < 40 && !got; i++) got = step(w, I({ r: true })).some(e => e.type === 'pogo_on');
    ok(got && w.s.p.pogo, 'touching the pogo stand gives you the pogo stick');
    const bounces = [];
    for (let i = 0; i < 240; i++) { const e = step(w, I({ j: true })).find(x => x.type === 'pogo'); if (e) bounces.push(e.v); }
    ok(bounces.length >= 3 && bounces[bounces.length - 1] > bounces[0] + 4, `every landing bounces, higher and higher with JUMP held (${bounces.map(v => v.toFixed(0)).join(' → ')})`);
    const w2 = compile(lvl(map, [{ type: 'pogo', id: 'pg', x: 3, y: 9 }, { type: 'rack', id: 'rk', x: 22, y: 9 }]));
    let tips = 0;
    for (let i = 0; i < 700 && w2.s.p.x < 21.5; i++) { const ev = step(w2, I({ r: true })); if (ev.some(e => e.type === 'pogo') && w2.s.p.gtile === '^') tips++; }
    ok(w2.s.deaths === 0 && tips > 0, `on a pogo stick you bounce across the spikes (${tips} bounces on spike tips, no ouch)`);
    for (let i = 0; i < 200 && w2.s.p.pogo; i++) step(w2, I({ r: true }));
    ok(!w2.s.p.pogo, 'the rack takes the pogo stick back');
    const w3 = compile(lvl(map, []));
    run(w3, I({ r: true }), 200);
    ok(w3.s.deaths > 0, 'without one, spikes are still spikes');
}

// 24. Buttons and gates: the gate is a wall until you stand on its button; it closes again after a while
{
    const map = FLOOR.map((r, y) => (y === 9 ? '#..S.........................G' : r)).map(r => r.slice(0, 30));
    const devs = time => [{ type: 'button', id: 'bt', x: 1, y: 9, gate: 'g1', time }, { type: 'gate', id: 'g1', x: 14, y: 6, w: 1, h: 4 }];
    const w = compile(lvl(map, devs(180)));
    ok(solidAt(w, 14, 8), 'a closed gate is a wall');
    let clicked = false;
    for (let i = 0; i < 60 && !clicked; i++) clicked = step(w, I({ l: true })).some(e => e.type === 'click');
    ok(clicked && !solidAt(w, 14, 8), 'standing on its button opens it');
    run(w, I({ r: true }), 150);
    ok(w.s.p.x > 15, `run through while it's open (x ${w.s.p.x.toFixed(1)})`);
    run(w, NO_INPUT, 200);
    ok(solidAt(w, 14, 8), 'it closes again after its time');
    const w2 = compile(lvl(map, devs(60)));
    for (let i = 0; i < 60 && !w2.s.gates.g1; i++) step(w2, I({ l: true }));
    run(w2, I({ r: true }), 200);
    ok(w2.s.p.x < 14, `too slow: the gate shuts in front of you (x ${w2.s.p.x.toFixed(1)})`);
}

// 25. The sticky hand: a second JUMP in the air fires it at a hook in range; swing; a pull hook reels you up
{
    const big = [...FLOOR.slice(0, 1), ...Array.from({ length: 6 }, () => FLOOR[1]), ...FLOOR.slice(1)];
    const w = compile(lvl(big, [{ type: 'hook', id: 'hk', x: 5, y: 11 }]));
    let fired = null;
    for (let i = 0; i < 60 && !fired; i++) fired = step(w, I({ r: true, j: i < 8 || i >= 14 })).find(e => e.type === 'hand');
    ok(!!fired && w.s.p.rope === 'hk', 'JUMP again in the air: the sticky hand catches the hook');
    let swung = false;
    for (let i = 0; i < 40; i++) { step(w, I({ r: true, j: true })); if (w.s.p.x > 5.5) swung = true; }
    ok(swung && w.s.p.rope === 'hk', 'you swing on it like a yo-yo');
    run(w, I({ j: false }), 1);
    const ev = run(w, I({ j: true }), 1);
    ok(!w.s.p.rope && ev.some(e => e.type === 'letgo'), 'JUMP lets go');
    // Out of range: nothing to catch.
    const w2 = compile(lvl(big, [{ type: 'hook', id: 'hk', x: 25, y: 3 }]));
    let none = true;
    for (let i = 0; i < 40; i++) if (step(w2, I({ j: i < 8 || i >= 14 })).some(e => e.type === 'hand')) none = false;
    ok(none, 'a hook out of range: the second JUMP does nothing');
    // A pull hook reels you in, then JUMP hops you up off it.
    const w3 = compile(lvl(big, [{ type: 'hook', id: 'ph', x: 5, y: 10, pull: true }]));
    for (let i = 0; i < 30 && !w3.s.p.rope; i++) step(w3, I({ j: i < 8 || i >= 14 }));
    run(w3, NO_INPUT, 30);
    const d = Math.hypot(w3.s.p.x + P.W / 2 - 5, w3.s.p.y + P.H / 2 - 10);
    ok(w3.s.p.rope === 'ph' && d < TOYS.HAND_NEAR + 0.05, `a pull hook reels you right up to it (${d.toFixed(2)} tiles away)`);
    const y0 = w3.s.p.y; run(w3, i => I({ j: i === 0 }), 1); const top = peak(w3, NO_INPUT, 40);
    ok(!w3.s.p.rope && y0 + P.H - top > 1.2, `JUMP hops you up off it (${(y0 + P.H - top).toFixed(2)} tiles)`);
}

// 26. Rubber duck boats: ride them over the water, they rock on the waves, wobbly ones sink if you stay
{
    const map = FLOOR.map((r, y) => (y >= 7 && y <= 9 ? '#####' + '~'.repeat(20) + '#####' : y === 4 ? '#....S.......................#' : r));
    const dk = { type: 'duck', id: 'dk', x: 5, y: 6.8, w: 2, to: [20, 6.8], period: 480 };
    const w = compile(lvl(map, [dk]));
    run(w, NO_INPUT, 30);
    ok(w.s.p.grounded && w.s.p.ground === 'dk', 'you can stand on a rubber duck');
    const ys = []; run(w, i => { ys.push(ridePos(w, w.L.byId.dk, w.s.t).y); return NO_INPUT; }, 120);
    ok(Math.max(...ys) - Math.min(...ys) > TOYS.DUCK_BOB, `it rocks on the waves (${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} tiles)`);
    run(w, NO_INPUT, 100);
    ok(w.s.p.ground === 'dk' && w.s.p.x > 8 && !w.s.p.wet, `it carries you across the water, dry (x ${w.s.p.x.toFixed(1)})`);
    const w2 = compile(lvl(map, [{ ...dk, sink: true }]));
    let dunked = false;
    let deepest = 0;
    for (let i = 0; i < 300 && !dunked; i++) { step(w2, NO_INPUT); dunked = w2.s.p.wet; deepest = Math.max(deepest, w2.s.sink.dk || 0); }
    ok(dunked && deepest > 0.5, `stay on a wobbly duck and it sinks under you (${deepest.toFixed(2)} tiles down)`);
    const w3 = compile(lvl(map, [{ ...dk, sink: true }]));
    run(w3, NO_INPUT, 60);
    const sunk = w3.s.sink.dk;
    run(w3, i => I({ j: i < 10 }), 30);
    run(w3, NO_INPUT, 60);
    ok(sunk > 0 && !(w3.s.sink.dk >= sunk), `…hop off and it bobs back up (${sunk.toFixed(2)} → ${(w3.s.sink.dk || 0).toFixed(2)})`);
}

// 27. Warp toy boxes: land on one, pop out of its twin (even upside down, on the ceiling)
{
    const map = FLOOR.map((r, y) => (y === 9 ? '#S.......................#...G' : r)).map(r => r.slice(0, 30));
    const w = compile(lvl(map, [{ type: 'warp', id: 'wa', x: 4, y: 9, to: 'wb' }, { type: 'warp', id: 'wb', x: 27, y: 9, to: 'wa' }]));
    ok(solidAt(w, 4, 9), 'a warp box is a box you can stand on');
    let warped = null;
    for (let i = 0; i < 60 && !warped; i++) warped = step(w, I({ r: i < 12, j: i < 10 })).find(e => e.type === 'warp');
    ok(!!warped && Math.abs(w.s.p.x + P.W / 2 - 27.5) < 0.1 && w.s.p.vy < -5, `land on it and you pop out of its twin (x ${(w.s.p.x + P.W / 2).toFixed(1)})`);
    let again = false;
    for (let i = 0; i < 40; i++) if (step(w, NO_INPUT).some(e => e.type === 'warp')) again = true;
    ok(!again, "landing back on the twin straight away doesn't send you back");
    const w2 = compile(lvl(map, [{ type: 'warp', id: 'wa', x: 4, y: 9, to: 'wc' }, { type: 'warp', id: 'wc', x: 15, y: 1, to: 'wa', g: -1 }]));
    let flipped = false;
    for (let i = 0; i < 60 && !flipped; i++) flipped = step(w2, I({ r: i < 12, j: i < 10 })).some(e => e.type === 'warp');
    run(w2, NO_INPUT, 40);
    ok(flipped && w2.s.p.g === -1 && w2.s.p.grounded, 'a twin on the ceiling: you come out upside down, standing on the ceiling');
}

// 16. The same inputs give the same frames
{
    const tape = i => I({ r: i % 50 < 35, j: i % 40 < 12, l: i % 97 > 80 });
    const devs = [{ type: 'mover', id: 'm', x: 10, y: 6, w: 2, to: [16, 4], period: 200 }, { type: 'seesaw', id: 's', x: 20, y: 8, half: 3 }, { type: 'fan', x: 14, y: 2, w: 3, h: 7, ax: 20, ay: -50 },
        { type: 'bumper', id: 'pb', x: 24, y: 7, r: 0.6 }, { type: 'bubble', id: 'bb', x: 6, y: 6 }, { type: 'train', id: 'tt', w: 2, speed: 3, path: [[3, 4], [12, 4], [12, 2]] }];
    const map = FLOOR.map((r, y) => (y === 10 ? '#####RRR####BBB###############' : r));
    const a = compile(lvl(map, devs)), b = compile(lvl(map, devs));
    run(a, tape, 900); run(b, tape, 900);
    ok(hashState(a) === hashState(b) && a.s.p.x === b.s.p.x && a.s.p.y === b.s.p.y, 'replaying the same inputs lands in exactly the same place');
}

console.log(`\n${pass} passed${fail ? `, ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
