// Physics checks for Playroom Parkour's engine: each mechanic does what it says.
//   node src/games/parkour/tests/physics.test.mjs
import { compile, step, NO_INPUT, hashState, coinCount, moverPos } from '../core/World.js';
import { P, GRAV, SLIP, SWING, BOUNCE } from '../core/Rules.js';

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

// 16. The same inputs give the same frames
{
    const tape = i => I({ r: i % 50 < 35, j: i % 40 < 12, l: i % 97 > 80 });
    const devs = [{ type: 'mover', id: 'm', x: 10, y: 6, w: 2, to: [16, 4], period: 200 }, { type: 'seesaw', id: 's', x: 20, y: 8, half: 3 }, { type: 'fan', x: 14, y: 2, w: 3, h: 7, ax: 20, ay: -50 }];
    const a = compile(lvl(FLOOR, devs)), b = compile(lvl(FLOOR, devs));
    run(a, tape, 900); run(b, tape, 900);
    ok(hashState(a) === hashState(b) && a.s.p.x === b.s.p.x && a.s.p.y === b.s.p.y, 'replaying the same inputs lands in exactly the same place');
}

console.log(`\n${pass} passed${fail ? `, ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
