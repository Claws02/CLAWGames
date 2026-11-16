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
export const SPRING_V = 12, COYOTE_S = 0.1, JUMP_BUFFER = 0.15;      // a spring's hop tops out at 4
export const PAD_SINK_S = 0.7, PAD_BACK_S = 2.5, ARM_W = 0.32, CHECK_R = 0.9;
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
//
// The skill courses add things to time and jump (no coconut needed):
// pads:     { p, r, crumble?, to?, period?, ph? }  an island in the water. crumble: it sinks a moment
//           after you land; to/period: a raft, sliding from p to `to` and back, carrying you
// sweepers: { c, len, h, period, ph? }  an arm turning round a post: h under 1.2 can be jumped
// springs:  { p, r }                a pad that throws you high and far
// checks:   [place, …]              flags: a fall puts you back at the last one touched
// walls take `beat: { period, open, ph? }`: a gate that stands shut except for `open` of every period
// route:    the way through, for the look-ahead player (autoplay): places, or { pad: i }
// tier:     1–3, how hard: stars and first clears pay that many times more. `clean: true` makes the
//           second star "no falls" instead of par throws
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

// Water all the way round between r0 and r1, but for a causeway `half` degrees either side of `lon`.
const moatBut = (r0, r1, lon, half) => (Math.abs(lon) > 179 ? [{ r0, r1, from: -180 + half, to: 180 - half }] : [{ r0, r1, from: -180, to: lon - half }, { r0, r1, from: lon + half, to: 180 }]);
// The skill courses: nothing to throw, everything to time. Each meets its obstacles one at a
// time, with ground to stand on and watch from before each, and a flag after every hard part.
{ const A1 = at(7.1, 0), A2 = at(4.3, 90);
  LEVELS.push({ id: 'alley', name: 'SWEEPER ALLEY', tier: 1, clean: true, par: 0, start: at(11.5, 0), flag: TOP, shell: at(7.4, 180),
    hint: 'Arms turn on their posts. JUMP the low red ones as they come round; the tall purple one can only be timed.',
    moats: [...moatBut(8, 9.8, 0, 16), ...moatBut(5.1, 6.7, 90, 18), ...moatBut(2.4, 3.6, -160, 28)],
    sweepers: [{ c: at(8.9, 0), len: 1.6, h: 0.9, period: 2.6 }, { c: at(5.9, 90), len: 1.7, h: 9, period: 3.2, ph: 0.3 }, { c: at(3, -160), len: 1.5, h: 0.9, period: 1.7, ph: 0.5 }],
    checks: [A1, A2],
    route: [at(10.3, 0), A1, at(7.5, 45), at(7.3, 90), A2, at(4.3, 130), at(4.3, 170), at(4.2, -160), at(1.8, -160)],
    shellRoute: [at(10.3, 0), A1, at(7.5, 45), at(7.3, 90), at(7.4, 135), at(7.4, 180), at(7.4, 135), at(7.3, 90), A2, at(4.3, 130), at(4.3, 170), at(4.2, -160), at(1.8, -160)] }); }
{ LEVELS.push({ id: 'ferry', name: 'THE FERRY', tier: 2, clean: true, par: 0, start: at(11.5, 0), flag: TOP, shell: at(6.5, 140),
    hint: 'Step onto the raft as it docks and ride it over. An arm sweeps the crossing: JUMP it. The stepping stones sink: don\'t stop on them.',
    moats: [{ r0: 4, r1: 9 }],
    pads: [{ p: at(8.25, 0), to: at(4.75, 0), r: 0.95, period: 6.4 }, { p: at(8.2, 140), r: 0.78, crumble: true }, { p: at(6.5, 140), r: 0.78, crumble: true }, { p: at(4.8, 140), r: 0.78, crumble: true }],
    sweepers: [{ c: at(6.5, 16), len: 1.75, h: 0.9, period: 2.4 }],
    route: [at(9.5, 0), { pad: 0 }, at(3.4, 0)],
    shellRoute: [at(9.6, 140), { pad: 1 }, { pad: 2 }, { pad: 3 }, at(3.4, 140)] }); }
{ const B1 = at(7.9, 0);
  LEVELS.push({ id: 'beat', name: 'GATE BEAT', tier: 2, clean: true, par: 0, start: at(11.5, 0), flag: TOP, shell: at(8, 150),
    hint: 'The gates open and shut on a beat: go as one opens. The spring throws you over the water, THROUGH the far gate, so time your run-up.',
    rings: [{ r: 9, h: 9, beat: { period: 3, open: 0.42 } }, { r: 4.8, h: 9, beat: { period: 2.6, open: 0.45, ph: 0.2 } }, { r: 2.1, h: 0.8 }],
    moats: [{ r0: 3, r1: 6.6 }],
    springs: [{ p: at(7.1, 0), r: 0.55 }],
    checks: [B1],
    route: [at(9.7, 0), B1, at(2.6, 0)],
    shellRoute: [at(9.7, 0), B1, at(8, 60), at(8, 110), at(8, 150), at(8, 110), at(8, 60), B1, at(2.6, 0)] }); }
{ const C1 = at(7.5, 0), C2 = at(3.95, 0);
  LEVELS.push({ id: 'gauntlet', name: 'THE GAUNTLET', tier: 3, clean: true, par: 0, start: at(11.5, 0), flag: TOP, shell: at(5.7, 180),
    hint: 'Everything at once. Watch each part from its flag before you go: a fast arm, sinking stones with an arm across them, a gate on a beat and a tall log.',
    moats: [...moatBut(8.4, 10, 0, 16), { r0: 4.6, r1: 6.9 }],
    pads: [{ p: at(6.25, 0), r: 0.72, crumble: true }, { p: at(5.2, 0), r: 0.72, crumble: true }, { p: at(5.7, 180), r: 0.85 }],
    sweepers: [{ c: at(9.2, 0), len: 1.6, h: 0.9, period: 1.8 }, { c: at(5.72, 15), len: 1.55, h: 0.9, period: 2.5, ph: 0.4 }, { c: at(1.9, 40), len: 1.5, h: 9, period: 2.8 }],
    rings: [{ r: 3, h: 9, beat: { period: 2.4, open: 0.42 } }],
    checks: [C1, C2],
    route: [at(10.6, 0), C1, at(7.05, 0), { pad: 0 }, { pad: 1 }, C2, at(3.3, 0), at(2.6, 0)],
    shellRoute: [at(10.6, 0), C1, at(7.4, 60), at(7.4, 120), at(7.2, 180), { pad: 2 }, at(4.2, 180), at(4.2, 90), C2, at(3.3, 0), at(2.6, 0)] }); }

// ── A go at a trial ─────────────────────────────────────────────────────────
export function create(lv) {
    return { lv, t: 0, id: 1, won: false, throws: 0, shell: !lv.shell, falls: 0, open: {}, held: {}, nuts: [], cp: -1, pads: (lv.pads || []).map(() => ({ t: null })),
        crab: { p: lv.start.slice(), f: tangent(lv.start, lv.flag), face: tangent(lv.start, lv.flag), h: 0, vh: 0, moving: false, air: false, coy: COYOTE_S, jbuf: 0 } };
}
const c0 = o => o.c || TOP;
/** Is this wall standing (not a gate that is open)? */
export const up = (s, w) => (w.beat ? !beatOpen(s, w) : !w.gate || !(s.open[w.gate] || s.held[w.gate]));
/** A gate on a beat: is it open now? */
export const beatOpen = (s, w) => ((s.t / w.beat.period + (w.beat.ph || 0)) % 1) < w.beat.open;
/** Where pad i is now (rafts slide, easing at each end). */
export function padAt(s, i, time = s.t) {
    const pd = s.lv.pads[i];
    if (!pd.to) return pd.p;
    const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * (time / pd.period + (pd.ph || 0)));
    return norm(mix(pd.p, pd.to, 1 - k, k));
}
/** Has pad i sunk (a crumbling one, after it was stood on)? */
export const padGone = (s, i) => s.pads[i].t != null && s.pads[i].t > PAD_SINK_S;
/** The pad under place p (not a sunk one), or -1. */
export const padUnder = (s, p) => (s.lv.pads || []).findIndex((pd, i) => !padGone(s, i) && dist(padAt(s, i), p) < pd.r);
/** Which way sweeper w's arm points now (a tangent at its post). */
export function armDir(s, w) { const e1 = tangent(w.c, [0, 0, 1]), e2 = cross(w.c, e1), a = 2 * Math.PI * (s.t / w.period + (w.ph || 0)); return mix(e1, e2, Math.cos(a), Math.sin(a)); }
/** Is the crab in the way of a sweeper's arm? */
export function swept(s, w, p = s.crab.p, h = s.crab.h) {
    const d = dist(p, w.c);
    if (h >= w.h || d > w.len || d < 0.3) return false;
    return dot(toward(w.c, p), armDir(s, w)) > Math.cos(Math.asin(Math.min(1, ARM_W / d)) + 0.06);
}
const lonOf = (p, c) => { const e1 = tangent(c, [0, 0, 1]), e2 = cross(c, e1), t = tangent(c, p); return (Math.atan2(dot(t, e2), dot(t, e1)) * 180) / Math.PI; };
const inArc = (o, p) => o.from == null || (() => { const a = lonOf(p, c0(o)); return a >= o.from && a <= o.to; })();
/** Is place p in the water? */
export const wet = (s, p) => (s.lv.moats || []).some(m => { const d = dist(p, c0(m)); return d > m.r0 && d < m.r1 && inArc(m, p); }) && (s.pads ? padUnder(s, p) < 0 : true);
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
    if (s.won) return false;
    // (pressed a moment early: remembered, and it jumps as it lands)
    if (c.air) { c.jbuf = JUMP_BUFFER; return false; }
    c.vh = JUMP_V; c.air = true; c.jbuf = 0; c.coy = 0;
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

// Back to the last flag touched (or the start).
function _reset(s, ev, why = 'splash') {
    const c = s.crab, lv = s.lv, at = s.cp >= 0 ? lv.checks[s.cp] : lv.start;
    Object.assign(c, { p: at.slice(), f: tangent(at, lv.flag), face: tangent(at, lv.flag), h: 0, vh: 0, air: false, coy: 0, jbuf: 0 });
    s.pads.forEach(pd => { pd.t = null; });
    s.falls++;
    ev.push({ type: why, at: s.cp });
}

/** Advance by dt. The stick: x right, y forward (up the screen), each −1..1. → events. */
export function step(s, dt, stick = { x: 0, y: 0 }) {
    const ev = [], c = s.crab;
    if (s.won) return ev;
    // Rafts move, carrying a crab that stands on one; crumbling pads count down.
    const on0 = !c.air ? padUnder(s, c.p) : -1, was0 = on0 >= 0 ? padAt(s, on0) : null;
    s.t += dt;
    if (on0 >= 0) { const now = padAt(s, on0); if (s.lv.pads[on0].to) { c.p = norm(mix(c.p, mix(now, was0, 1, -1), 1, 1)); c.f = tangent(c.p, c.f); c.face = tangent(c.p, c.face); } if (s.lv.pads[on0].crumble && s.pads[on0].t == null) { s.pads[on0].t = 0; ev.push({ type: 'crack', pad: on0 }); } }
    s.pads.forEach((pd, i) => { if (pd.t != null) { const g = padGone(s, i); pd.t += dt; if (!g && padGone(s, i)) ev.push({ type: 'sink', pad: i }); if (pd.t > PAD_SINK_S + PAD_BACK_S) pd.t = null; } });
    c.jbuf = Math.max(0, c.jbuf - dt);
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
            else if (c.h <= 0) { c.h = 0; c.vh = 0; c.air = false; ev.push({ type: 'land' }); if (c.jbuf > 0 && !wet(s, c.p)) jump(s); }
        }
    }
    // Over water with nothing underfoot: a blink of grace to jump (coyote time), then the splash.
    if (!c.air) {
        if (!wet(s, c.p)) c.coy = COYOTE_S;
        else { c.coy -= dt; if (c.coy <= 0) { _reset(s, ev); return ev; } }
        const sp = (s.lv.springs || []).find(x => dist(c.p, x.p) < x.r);
        if (sp) { c.vh = SPRING_V; c.air = true; ev.push({ type: 'spring', spring: sp }); }
    }
    // A sweeper's arm, unless the crab is above it.
    const arm = (s.lv.sweepers || []).find(w => swept(s, w));
    if (arm) { _reset(s, ev, 'bonk'); return ev; }
    // Flags.
    (s.lv.checks || []).forEach((p, i) => { if (i > s.cp && !c.air && dist(c.p, p) < CHECK_R) { s.cp = i; ev.push({ type: 'check', i, p }); } });

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
export const stars = s => [s.won, s.won && (s.lv.clean ? s.falls === 0 : s.throws <= s.lv.par), s.won && s.shell && !!s.lv.shell];

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

// ── A player that looks ahead (the probes prove the skill courses with it) ──
// It follows the trial's `route`; ten times a second it tries walking on, jumping, or
// waiting, each played a second and a bit into the future on a copy, and takes the
// first that neither splashes nor is bonked. It knows nothing else about the course.
const _copy = s => ({ ...s, crab: { ...s.crab }, nuts: s.nuts.map(n => ({ ...n })), open: { ...s.open }, held: { ...s.held }, pads: s.pads.map(p => ({ ...p })) });
const _target = (s, w) => (w.pad != null ? padAt(s, w.pad) : w);
const _reached = (s, w) => !s.crab.air && (w.pad != null ? padUnder(s, s.crab.p) === w.pad : dist(s.crab.p, w) < (w === s.lv.flag ? FLAG_R : 0.45));
function _toward(s, w) { const c = s.crab, p = _target(s, w); if (dist(c.p, p) < 0.12) return { x: 0, y: 0 }; const d = toward(c.p, p), r = cross(c.f, c.p); return { x: dot(d, r), y: dot(d, c.f) }; }
export function autoplay(lv, { dt = 1 / 60, limit = 120, look = 1.3, s = create(lv), via = lv.route } = {}) {
    const route = [...(via || []), lv.flag], all = []; let i = 0;
    const dead = ev => ev.some(e => e.type === 'splash' || e.type === 'bonk');
    const tryIt = act => {
        const t = _copy(s); let j = i, hold = act === 'wait' ? 0.2 : 0;
        if (act === 'jump') jump(t);
        for (let k = 0; k < look / dt; k++) {
            const w = route[Math.min(j, route.length - 1)];
            const ev = step(t, dt, hold > 0 ? { x: 0, y: 0 } : _toward(t, w)); hold -= dt;
            if (dead(ev)) return -1;        // (DEAD)
            if (t.won) return 99;
            if (j < route.length - 1 && _reached(t, w)) j++;
        }
        return (j - i) * 100 - dist(t.crab.p, _target(t, route[Math.min(j, route.length - 1)]));
    };
    let act = 'go';
    for (let n = 0; n < limit / dt && !s.won; n++) {
        if (i < route.length - 1 && _reached(s, route[i])) i++;
        if (n % 6 === 0) { const g = tryIt('go'), j = s.crab.air ? -1e9 : tryIt('jump'), DEAD = -1; const gd = g === DEAD, jd = j === DEAD || j === -1e9;
            act = gd && jd ? 'wait' : gd ? 'jump' : jd ? 'go' : j > g + 0.6 ? 'jump' : 'go'; if (act === 'jump') jump(s); }
        const before = s.falls, ev = step(s, dt, act === 'wait' ? { x: 0, y: 0 } : _toward(s, route[Math.min(i, route.length - 1)]));
        all.push(...ev);
        if (s.falls > before) { i = 0; while (i < route.length - 1 && s.cp >= 0 && route[i] !== lv.checks[s.cp]) i++; if (s.cp >= 0) i++; }
    }
    return { s, ev: all };
}
