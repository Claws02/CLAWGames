// ============================================================
// COCONUT TRIALS — the rules. Puzzle planets inside Tiny Planet, entered by
// walking into the Trick Hut. No DOM, no three.js (TrickScreen.js draws it).
//
// Each trial is a small planet with a flag to reach and things in the way.
// The crab walks and jumps as it does at home, and throws coconuts the way it
// is facing (hold the button longer to throw further). A coconut is four tools:
//
//   a STEPPING STONE   land on one from above and it bounces you much higher
//                      than a jump: over a tall wall, or on across the water
//   a RAFT             one that lands in water floats, and still bounces you
//   a WEIGHT           one that lands on a pressure plate holds it down
//   a SHOT             one that hits a bullseye in flight opens its gate; it
//                      bounces off any wall taller than it is flying (bank shots)
//
// and the TRICK SHOT: meet a coconut that is still in the air while you are in
// the air above it, and it bounces you the same way, from wherever you are.
//
// The level is built round its flag: ring walls and moats are circles at a
// ground distance from a centre (usually the flag); `bars` are straight walls
// between two places. Water sends you back to the start; nothing else hurts.
//
// Stars: ⭐ reach the flag · ⭐ in `par` throws or fewer · ⭐ with the golden shell.
//
//   create(level)                 a fresh go at it
//   step(s, dt, { x, y })         advance; the stick is screen-relative. → events
//   jump(s) / throwNut(s, charge) charge 0..1
//   aim(s, charge)                where a throw from here would come down
//   stars(s)                      [finished, par, shell] once won
//   run(level, script)            play a list of moves (the probes; the levels' own answers)
// ============================================================
import { dot, cross, norm, mix, angle, tangent, toward, walk } from './PlanetLogic.js';

export const R = 5, SPEED = 4.2, G = 18;
export const JUMP_V = 6.84, BOUNCE_V = 9.67;            // apex 1.3 and 2.6 above where you left
export const NUT_R = 0.6, NUT_TOP = 0.45, NUT_MAX = 5;   // a landed coconut: how near counts as on it, how high it stands
export const TRICK_R = 0.85, TRICK_GAP = 1.1;            // the trick shot: how near, and how far above the coconut
export const HIT_R = 0.8, FLAG_R = 0.75, SHELL_R = 0.8;
export const THROW = { range0: 1.6, range1: 7, t0: 0.55, t1: 1.0, up: 0.75, ahead: 0.45 };

/** A place from degrees: lat 90 is the top of the planet (where the flag usually is). */
export const ll = (lat, lon = 0) => { const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180; return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]; };
const TOP = [0, 1, 0];
/** A place `d` ground units from the top, round at `lon` degrees. */
export const at = (d, lon = 0) => ll(90 - (d / R) * (180 / Math.PI), lon);
export const dist = (a, b) => angle(a, b) * R;

// The bank shot's wall: across the water from the bullseye's open side, square to it.
const BANK_A = walk(at(3.5, 0), tangent(at(3.5, 0), [1, 0, 0]), -1.3 / R), BANK_B = walk(at(3.5, 0), tangent(at(3.5, 0), [1, 0, 0]), 1.3 / R);

// ── The trials ──────────────────────────────────────────────────────────────
// rings:   { r, h, gate?, c?, from?, to? }  a circular wall r from `c` (default the top), h high;
//          from/to (degrees round c, 0 = away from +z's foot) leave the rest of the circle open
// moats:   { r0, r1 }            water between r0 and r1 from `c`
// bars:    { a, b, h, gate? }    a straight wall from place a to place b
// plates:  { p, r, gate }        held down by the crab or a coconut: opens its gate while held
// targets: { p, gate }           a bullseye: a coconut that hits it opens its gate for good
// answer:  the moves that finish it within par with the shell (the probe plays them)
export const LEVELS = [
    { id: 'hop', name: 'HOP AND THROW', par: 1, start: at(11, 0), flag: TOP, shell: at(8.2, 62),
        hint: 'JUMP the low wall. Then face the 🎯 and THROW a coconut at it to open the gate.',
        rings: [{ r: 8.6, h: 0.8 }, { r: 3, h: 9, gate: 'a' }],
        targets: [{ p: at(5.2, -40), gate: 'a' }],
        answer: [['go', at(9.3, 0)], ['jumpTo', at(7.6, 20)], ['go', at(8.2, 62)], ['go', at(6.6, -22)], ['face', at(5.2, -40)], ['throw', 0.12], ['wait', 1], ['go', TOP]] },
    { id: 'stone', name: 'STEPPING STONE', par: 1, start: at(10, 0), flag: TOP, shell: at(2.4, 80),
        hint: 'Too tall to jump. THROW a coconut down by the wall, then JUMP onto it: it bounces you over.',
        rings: [{ r: 4, h: 2 }],
        answer: [['go', at(7.6, 0)], ['face', at(3, 60)], ['throw', 0.1], ['wait', 1], ['jumpTo', at(3, 60)], ['go', at(2.4, 80)], ['go', TOP]] },
    { id: 'raft', name: 'COCONUT RAFT', par: 1, start: at(11.5, 0), flag: TOP, shell: at(2, 120),
        hint: 'Too wide to jump. A coconut FLOATS: throw one into the water and bounce across on it.',
        moats: [{ r0: 4, r1: 8.8 }],
        answer: [['go', at(9.6, 0)], ['face', TOP], ['throw', 0.25], ['wait', 1.2], ['jumpTo', at(3, 0), 0.4], ['go', at(2, 120)], ['go', TOP]] },
    { id: 'weight', name: 'HEAVY NUT', par: 1, start: at(11, 0), flag: TOP, shell: at(9.5, 150),
        hint: 'The plate opens the gate only while something is on it. Leave a coconut there.',
        rings: [{ r: 3.2, h: 9, gate: 'a' }],
        plates: [{ p: at(7.5, 50), r: 0.9, gate: 'a' }],
        answer: [['go', at(9.5, 150)], ['go', at(9.6, 38)], ['face', at(7.5, 50)], ['throw', 0.16], ['wait', 1.2], ['go', TOP]] },
    { id: 'bank', name: 'BANK SHOT', par: 1, start: at(11, 180), flag: TOP, shell: at(8.8, -120),
        hint: 'The 🎯 is walled in, open only on the far side, over the water. Bounce a coconut in off the wall behind it.',
        rings: [{ r: 2.6, h: 9, gate: 'a' }, { c: at(5.2, 0), r: 1.25, h: 9, from: -158, to: 158 }],
        moats: [{ r0: 2.6, r1: 4.4, from: -50, to: 50 }],
        bars: [{ a: BANK_A, b: BANK_B, h: 9 }],
        targets: [{ p: at(5.2, 0), gate: 'a' }],
        answer: [['go', at(8.8, -120)], ['go', at(8, 120)], ['go', at(6.5, 60)], ['go', at(4.6, 24)], ['face', at(2.8, 4)], ['throw', 0.5], ['wait', 1.6], ['go', at(6, 70)], ['go', at(5, 110)], ['go', TOP]] },
    { id: 'trick', name: 'TRICK SHOT', par: 1, start: at(10.5, 0), flag: TOP, shell: at(1.8, 90),
        hint: 'Too tall even for a bounce off the ground. TAP a short throw, then JUMP into the coconut while it is still in the air.',
        rings: [{ r: 4, h: 3.1 }],
        answer: [['go', at(6.5, 0)], ['face', TOP], ['throw', 0], ['wait', 0.1], ['jumpTo', at(2, 0), 0.3], ['go', at(1.8, 90)], ['go', TOP]] },
];

// ── A go at a trial ─────────────────────────────────────────────────────────
export function create(lv) {
    return { lv, t: 0, id: 1, won: false, throws: 0, shell: !lv.shell, falls: 0, open: {}, held: {}, nuts: [],
        crab: { p: lv.start.slice(), f: tangent(lv.start, lv.flag), face: tangent(lv.start, lv.flag), h: 0, vh: 0, moving: false, air: false } };
}
const c0 = o => o.c || TOP;
/** Is this wall standing (not a gate that is open)? */
export const up = (s, w) => !w.gate || !(s.open[w.gate] || s.held[w.gate]);
const lonOf = (p, c) => { const e1 = tangent(c, [0, 0, 1]), e2 = cross(c, e1), t = tangent(c, p); return (Math.atan2(dot(t, e2), dot(t, e1)) * 180) / Math.PI; };
const inArc = (o, p) => o.from == null || (() => { const a = lonOf(p, c0(o)); return a >= o.from && a <= o.to; })();
/** Is place p in the water? */
export const wet = (s, p) => (s.lv.moats || []).some(m => { const d = dist(p, c0(m)); return d > m.r0 && d < m.r1 && inArc(m, p); });
/** The landed or floating coconut under place p, or null. */
export const nutUnder = (s, p) => s.nuts.find(n => n.state !== 'fly' && dist(n.p, p) < NUT_R) || null;

// Does the step from a to b cross a wall that stands taller than h? → { n } (the wall's
// normal in the ground, at b) or null.
function _blocked(s, a, b, h) {
    for (const w of s.lv.rings || []) {
        if (!up(s, w) || h >= w.h) continue;
        const c = c0(w), d0 = dist(a, c) - w.r, d1 = dist(b, c) - w.r;
        if ((d0 * d1 < 0 || (d0 === 0 && d1 !== 0)) && inArc(w, b)) return { n: toward(b, c), w };
    }
    for (const w of s.lv.bars || []) {
        if (!up(s, w) || h >= w.h) continue;
        const n = norm(cross(w.a, w.b)), s0 = dot(a, n), s1 = dot(b, n);
        if (s0 * s1 >= 0) continue;
        const q = norm(mix(a, b, Math.abs(s1), Math.abs(s0)));       // where the step meets the wall's circle
        if (dot(cross(w.a, q), n) > 0 && dot(cross(q, w.b), n) > 0) return { n: tangent(b, n), w };
    }
    return null;
}

export function jump(s) {
    const c = s.crab;
    if (s.won || c.air) return false;
    c.vh = JUMP_V; c.air = true;
    return true;
}
const _throwOf = charge => { const k = Math.max(0, Math.min(1, charge)), T = THROW.t0 + (THROW.t1 - THROW.t0) * k; return { T, v: (THROW.range0 + (THROW.range1 - THROW.range0) * k) / T }; };
/** Throw a coconut the way the crab faces. charge 0 (a tap: short and high) .. 1 (far). */
export function throwNut(s, charge = 0) {
    const c = s.crab;
    if (s.won) return null;
    const { T, v } = _throwOf(charge), h0 = c.h + THROW.up;
    // up and down again to the ground in T seconds from h0
    // (from the claws, a little ahead; but never from the far side of a wall it is standing against)
    const hand = walk(c.p, c.face, THROW.ahead / R), from = _blocked(s, c.p, hand, h0) ? c.p.slice() : hand;
    const n = { id: s.id++, p: from, d: tangent(from, c.face), v, h: h0, vh: (G * T) / 2 - h0 / T, state: 'fly', age: 0, used: false };
    s.nuts.push(n); s.throws++;
    while (s.nuts.length > NUT_MAX) s.nuts.shift();
    return n;
}
/** Where a throw from here would come down: { p, path: [[place, height], …] } (walls and all). */
export function aim(s, charge = 0) {
    const t = { ...s, nuts: [], open: { ...s.open }, held: { ...s.held }, crab: { ...s.crab }, throws: 0, id: 1 };
    const n = throwNut(t, charge), path = [];
    for (let i = 0; i < 240 && n.state === 'fly'; i++) { _nut(t, n, 1 / 60, []); if (i % 4 === 0) path.push([n.p, n.h]); }
    return { p: n.p, path };
}

function _nut(s, n, dt, ev) {
    n.age += dt;
    if (n.state !== 'fly') return;
    const q = walk(n.p, n.d, (n.v * dt) / R), hit = _blocked(s, n.p, q, n.h);
    if (hit) { const k = dot(n.d, tangent(n.p, hit.n)); n.d = tangent(n.p, mix(n.d, tangent(n.p, hit.n), 1, -2 * k)); n.v *= 0.85; ev.push({ type: 'bank', nut: n, p: n.p }); }
    else { n.d = tangent(q, n.d); n.p = q; }
    n.vh -= G * dt; n.h += n.vh * dt;
    for (const tg of s.lv.targets || []) {
        if (s.open[tg.gate] || Math.hypot(dist(n.p, tg.p), n.h - 1.1) > HIT_R) continue;
        s.open[tg.gate] = true; ev.push({ type: 'target', target: tg, nut: n });
    }
    if (n.h <= 0) { n.h = 0; n.state = wet(s, n.p) ? 'float' : 'land'; ev.push({ type: n.state === 'float' ? 'plop' : 'thud', nut: n, p: n.p }); }
}

function _reset(s, ev) {
    const c = s.crab, lv = s.lv;
    Object.assign(c, { p: lv.start.slice(), f: tangent(lv.start, lv.flag), face: tangent(lv.start, lv.flag), h: 0, vh: 0, air: false });
    s.falls++;
    ev.push({ type: 'splash' });
}

/** Advance by dt. The stick: x right, y forward (up the screen), each −1..1. → events. */
export function step(s, dt, stick = { x: 0, y: 0 }) {
    const ev = [], c = s.crab;
    if (s.won) return ev;
    s.t += dt;
    // Walk (in the air too), unless a wall taller than the crab is high stands in the way.
    const m = Math.min(1, Math.hypot(stick.x, stick.y));
    c.moving = m > 0.12;
    if (c.moving) {
        const right = cross(c.f, c.p), d = norm(mix(right, c.f, stick.x, stick.y));
        const q = walk(c.p, d, (SPEED * m * dt) / R);
        c.face = tangent(c.p, d);
        if (!_blocked(s, c.p, q, c.h)) { c.p = q; c.f = tangent(q, c.f); c.face = tangent(q, d); }
    }
    for (const n of s.nuts) _nut(s, n, dt, ev);

    // Up and down.
    if (c.air) {
        const was = c.h;
        c.vh -= G * dt; c.h += c.vh * dt;
        // The trick shot: a coconut still in the air, under the crab's feet.
        const fly = s.nuts.find(n => n.state === 'fly' && !n.used && n.age > 0.2 && dist(n.p, c.p) < TRICK_R && c.h >= n.h - 0.15 && c.h - n.h < TRICK_GAP);
        if (fly) { fly.used = true; fly.vh = -5; c.vh = BOUNCE_V; ev.push({ type: 'trick', nut: fly, h: c.h }); }
        else if (c.vh < 0) {
            const n = nutUnder(s, c.p);
            if (n && was >= NUT_TOP && c.h <= NUT_TOP) { c.h = NUT_TOP; c.vh = BOUNCE_V; ev.push({ type: 'bounce', nut: n }); }
            else if (c.h <= 0) { c.h = 0; c.vh = 0; c.air = false; ev.push({ type: 'land' }); }
        }
    }
    if (!c.air && wet(s, c.p)) { _reset(s, ev); return ev; }

    // Plates: the crab on the ground, or a coconut at rest.
    for (const pl of s.lv.plates || []) {
        const on = (!c.air && dist(c.p, pl.p) < pl.r) || s.nuts.some(n => n.state === 'land' && dist(n.p, pl.p) < pl.r);
        if (on !== !!s.held[pl.gate]) { s.held[pl.gate] = on; ev.push({ type: on ? 'press' : 'release', plate: pl }); }
    }
    if (!s.shell && dist(c.p, s.lv.shell) < SHELL_R && c.h < 1) { s.shell = true; ev.push({ type: 'shell' }); }
    if (!c.air && dist(c.p, s.lv.flag) < FLAG_R) { s.won = true; ev.push({ type: 'won', stars: stars(s) }); }
    return ev;
}

/** [reached the flag, within par, with the shell]. */
export const stars = s => [s.won, s.won && s.throws <= s.lv.par, s.won && s.shell && !!s.lv.shell];

// ── Playing a list of moves (the probes, and each trial's own answer) ───────
//   ['go', place]            walk there
//   ['jumpTo', place, run?]  walk toward it, jumping after `run` units (default at once), until landed past it or stopped
//   ['face', place]          turn to it
//   ['throw', charge]        ['wait', secs]        ['jump']
export function run(lv, script, { dt = 1 / 60, limit = 60, s = create(lv) } = {}) {
    const all = [], c = s.crab;
    const stick = p => { const d = toward(c.p, p), r = cross(c.f, c.p); return { x: dot(d, r), y: dot(d, c.f) }; };
    const tick = st => { all.push(...step(s, dt, st)); };
    for (const [op, a, b] of script) {
        if (s.won || s.t > limit) break;
        if (op === 'go') { for (let i = 0; i < 60 * 20 && !s.won && dist(c.p, a) > 0.12; i++) { const p0 = c.p; tick(stick(a)); if (dist(p0, c.p) < 1e-5 && !c.air) break; } }
        else if (op === 'jumpTo') {
            const from = c.p.slice(); let jumped = false;
            for (let i = 0; i < 60 * 12 && !s.won; i++) {
                if (!jumped && dist(from, c.p) >= (b || 0)) { jump(s); jumped = true; }
                tick(stick(a));
                if (jumped && !c.air) break;
                if (dist(c.p, a) < 0.12 && !c.air) break;
            }
        } else if (op === 'face') { c.face = toward(c.p, a); }
        else if (op === 'throw') throwNut(s, a);
        else if (op === 'jump') jump(s);
        else if (op === 'wait') for (let i = 0; i < a / dt; i++) tick({ x: 0, y: 0 });
    }
    return { s, ev: all };
}
