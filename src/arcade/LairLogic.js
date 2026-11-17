// ============================================================
// OLD INK'S LAIR — the rules. Puzzle planets under Tiny Planet's Trick Hut.
// No DOM, no three.js (LairScreen.js draws it).
//
// THE STORY. Old Ink, a giant octopus, has stolen the Tide Pearl that kept the
// planet's tides gentle. Without it the sea runs in rip currents. Each chamber
// of his lair is a small planet with the way to the pearl shut by one puzzle.
// His gulls keep watch.
//
// WHAT A CRAB HAS. It walks, it jumps, and it carries up to three COCONUTS.
// There are exactly three in a chamber. A coconut is thrown the way the crab
// faces (hold to throw further) and picked up again by walking into it.
//   · land on one from above and it BOUNCES you twice as high as a jump
//   · it FLOATS, and a current carries it
//   · it is a WEIGHT: on a plate it holds a gate open; in a vent it plugs it
//   · it is a SHOT: one that hits a bullseye opens its gate, and stays stuck there
// A coconut doing a job that it can't be walked to is gone for good; one that
// is lost on the urchins washes up under the palm again.
//
// WHAT IS IN THE WAY.
//   rip current   doesn't hurt: it carries the crab, and anything floating, one way
//   urchins       Old Ink's fence: touch them and you are back at the last flag
//   cliffs        walls too tall for any jump or bounce
//   vents         bubbles. Vents share their pressure: only the first unplugged
//                 one blows, and one that blows under a crab lifts it high
//   a gull        circles, then dives where you stand. Caught, it steals a coconut
//                 (with none to steal it pecks you back to the flag). Jump on it,
//                 or hit it with a coconut, and it is stunned and drops what it
//                 took. Landing on a gull bounces you like a coconut does.
//
// Every place is a unit vector; `at(d, lon)` is d ground units from the top of
// the planet (where the pearl is), round at lon degrees.
//
//   create(chamber)               a fresh go
//   step(s, dt, { x, y })         advance; the stick is screen-relative. → events
//   jump(s) / throwNut(s, charge) charge 0..1; needs a coconut in the claws
//   aim(s, charge)                where a throw from here would come down, and its path
//   blowing(s)                    the vent that is blowing now
// ============================================================
import { dot, cross, norm, mix, angle, tangent, toward, walk } from './PlanetLogic.js';

export const R = 6.5, SPEED = 4.2, G = 18;
export const JUMP_V = 6.84, BOUNCE_V = 9.67;             // apex 1.3 and 2.6 above where you left
export const CARRY = 3, PICK_R = 0.6, PICK_AGE = 0.8;    // coconuts carried; how near picks one up; how soon after a throw
export const NUT_R = 0.6, NUT_TOP = 0.45, ROCK_H = 0.45;      // ROCK_H: how high a stepping rock stands, so a crab on one is that high
export const TRICK_R = 0.85, TRICK_GAP = 1.1, HIT_R = 0.8, GOAL_R = 0.9, CHECK_R = 1;
export const COYOTE_S = 0.1, JUMP_BUFFER = 0.15, WADE = 0.35, RESPAWN_S = 1.4;
export const THROW = { range0: 1.6, range1: 7, t0: 0.55, t1: 1.0, up: 0.75, ahead: 0.45 };
// OLD INK. He sits on the pearl behind the inner fence and fights from there, in three rounds. He slams the ground where the crab stands
// (a ring shows where, then it lands: move, or jump it), over and over, with a breather now and then. His eight arms sway round him: a
// coconut that hits an arm stuns it, and two arms stunned (any two) make him DIZZY for a while: only then does a coconut at his head
// hurt him. Hit him three times. Coconut piles keep turning up round the chamber (the claws still hold only three).
export const BOSS = { arms: 8, armDeg: 10, armH: 1.8, armFor: 7, rest: 2.4, hits: 3, arena: 2.9, headR: 2.0, h0: 0.35, h1: 3.4, wind: [1.15, 0.95, 0.8], slams: [3, 4, 5], hitR: 1.0, wake: 0.9, recover: 0.5, dizzy: 5.5, hurt: 1.3, piles: 4, pileAt: 2.4, pileEvery: 1.4 };
export const GULL = { speed: 1.5, see: 7, rise: 0.8, circle: 1.4, dive: 0.55, high: 5, ground: 2.8, stun: 3.2, flee: 3, cool: 2.2, hit: 0.8, top: 0.55 };

export const ll = (lat, lon = 0) => { const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180; return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]; };
export const TOP = [0, 1, 0];
export const at = (d, lon = 0) => ll(90 - (d / R) * (180 / Math.PI), lon);
export const dist = (a, b) => angle(a, b) * R;
/** Degrees round c of place p (0 along +z's foot, growing the way `at`'s lon does). */
export const lonOf = (p, c = TOP) => { const e1 = tangent(c, [0, 0, 1]), e2 = cross(c, e1), t = tangent(c, p); return (Math.atan2(dot(t, e2), dot(t, e1)) * 180) / Math.PI; };
const dAng = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
/** The place r from c, round at deg. */
export const around = (c, r, deg) => { const e1 = tangent(c, [0, 0, 1]), e2 = cross(c, e1), a = (deg * Math.PI) / 180; return walk(c, mix(e1, e2, Math.cos(a), Math.sin(a)), r / R); };
/** Does an arc-shaped thing (`gap: [deg, half]` cut out, or `only: [deg, half]` kept) cover place p? */
export const covers = (o, p) => { const a = lonOf(p, o.c || TOP); return o.only ? dAng(a, o.only[0]) < o.only[1] : o.gap ? dAng(a, o.gap[0]) > o.gap[1] : true; };

// ── Chamber 1: THE DROWNED STAIR ────────────────────────────────────────────
//
//   the beach (start, the palm and its three coconuts)                      d > 13.2
//   the rip channel, running east to the urchin reef                        9.2 – 13.2
//       · stepping rocks out to vent B's rock, under the cliff
//       · vent A in a cove on the far wall, further down the current
//   the cliff                                                               9.2
//   the shelf, where the gull walks                                         5.6 – 9.2
//   the tall step                                                           5.6
//   the plate (holds the inner gate) and the bullseye (opens the outer one) inside it
//   the two gates, and the pearl                                            3 · 1.8 · 0
//
// THE ANSWER. (1) A coconut dropped into the far side of the current upstream of
// the cove is carried into it and plugs vent A; a throw straight at A hits the
// cove's wall. (2) Now B blows: across the rocks, onto B, up over the cliff, with
// the two coconuts that are left. (3) Three jobs up there and two coconuts: so
// the step is climbed off the gull, and the coconuts go on the plate and into
// the bullseye.
const A = at(10.05, 70), B = at(9.95, 30), SHELF = at(7.9, 26), BANK = 15.4;
export const STAIR = {
    id: 'stair', name: 'THE DROWNED STAIR', start: at(18.4, 0), goal: TOP, palm: at(17.7, -42), bank: BANK,
    story: 'Old Ink has the Tide Pearl. His lair starts here: a rip current, a cliff, and a gull on watch. Three coconuts are all you have.',
    hints: ['Vent A is bubbling in its cove. Only one vent blows at a time.', 'A coconut floats. The current goes past the cove.', 'Drop one in the water above the cove, on the far side of the current.', 'Up on the shelf there are three jobs and only two coconuts. What else bounces?', 'Old Ink slams where you stand: a red ring fills, then it lands. Step out or jump. His arms sway round him: hit any two with coconuts and he goes dizzy. Then three coconuts on his head win. More piles keep turning up.', 'With Old Ink down, a coconut on the plate opens the fence round the pearl.'],
    checks: [at(18.4, 0), SHELF], zones: { 1: [5.7, 9.1] },          // (anywhere on the shelf counts as reaching its flag)
    rings: [
        { r: 9.2, h: 8.5, gap: [180, 9], kind: 'cliff' }, { r: 9.2, h: 8.5, only: [180, 9], way: 'out', kind: 'slide' },   // the cliff, and a slide back down
        { c: A, r: 1.25, h: 9, gap: [lonOf(at(10.25, 58), A), 52], kind: 'cove' },
        { r: 5.6, h: 2, kind: 'step' }, { r: 3, h: 9, gate: 'eye', kind: 'gate' }, { r: 1.8, h: 9, gate: 'plate', kind: 'gate' },
    ],
    // The spring rocks: the current starts here, at a dam of boulders across the channel. (Without them a crab could walk the dry
    // ledge to the foot of the cliff and be carried straight onto vent B's rock.)
    bars: [{ a: at(BANK, -115), b: at(9.2, -115), h: 9, kind: 'dam' }],
    currents: [{ r0: 9.2, r1: BANK, only: [0, 115], speed: 6.5 }],
    eddies: [{ p: at(10.5, 56), r: 2.5, to: A, speed: 5 }],
    urchins: [at(14.6, 108), at(13.4, 108), at(12.2, 108), at(11.0, 108), at(9.8, 108)].map(p => ({ p, r: 0.75 })),
    // Two rocks in a straight line across the current: a crab swept off the first is carried past the second, so only a jump gets
    // across. (Rocks set one downstream of another would let the current deliver a crab from one to the next.)
    rocks: [{ p: at(13.15, 30), r: 0.75 }, { p: B, r: 1.0 }],
    vents: [{ id: 'A', p: A, r: 0.85, float: true }, { id: 'B', p: B, r: 0.8, lift: 7.4 }],
    plates: [{ p: at(4.3, 100), r: 0.9, gate: 'plate' }],
    targets: [{ p: at(4.2, -100), gate: 'eye' }],
    gull: { ring: 7.5, from: 60 },
    boss: true,
};
export const CHAMBERS = [STAIR];

// ── A go at a chamber ───────────────────────────────────────────────────────
export function create(lv) {
    const s = { lv, t: 0, id: 1, won: false, falls: 0, cp: 0, throws: 0, calm: null, open: {}, held: {}, plug: {}, nuts: [], back: [],
        crab: { p: lv.start.slice(), f: tangent(lv.start, lv.goal), face: tangent(lv.start, lv.goal), h: 0, vh: 0, moving: false, air: false, coy: COYOTE_S, jbuf: 0, nuts: 0, lifted: false },
        boss: lv.boss ? { hp: BOSS.hits, state: 'sleep', t: 0, n: 0, round: 0, tx: null, pile: 0, arms: Array(BOSS.arms).fill(0), stunned: 0, rest: false } : null,
        gull: lv.gull ? { p: at(lv.gull.ring, lv.gull.from), h: 0, state: 'walk', t: 0, cool: 1, loot: 0, tx: null, from: null } : null };
    for (let i = 0; i < CARRY; i++) _palmNut(s, i);
    return s;
}
function _palmNut(s, i = s.id) { const n = { id: s.id++, p: around(s.lv.palm, 0.95, 200 + (i % 3) * 60), d: [0, 0, 0], v: 0, h: 0, vh: 0, state: 'rest', age: 9, still: 0 }; n.d = tangent(n.p, [1, 0, 0]); s.nuts.push(n); return n; }
/** Coconuts in the claws, lying about (rest / float / fly), doing a job (plug / stuck), with the gull, on their way back. */
export const count = s => ({ held: s.crab.nuts, loose: s.nuts.filter(n => n.state === 'rest' || n.state === 'float' || n.state === 'fly').length, working: s.nuts.filter(n => n.state === 'plug' || n.state === 'stuck').length, gull: s.gull ? s.gull.loot : 0, back: s.back.length });
/** Where Old Ink's arm i lies round him now (degrees): they sway. */
export const armLon = (s, i) => (i * 360) / BOSS.arms + 14 * Math.sin(s.t * 0.8 + i * 1.7);
export const up = (s, w) => (w.gate === 'plate' && s.boss && s.boss.state !== 'down') || !w.gate || !(s.open[w.gate] || s.held[w.gate]);   // (the pearl's own fence stays up while Old Ink is on it)
/** The vent that is blowing: the first that isn't plugged. */
export const blowing = s => (s.lv.vents || []).find(v => !s.plug[v.id]) || null;
export const rockUnder = (s, p) => (s.lv.rocks || []).find(k => dist(k.p, p) < k.r) || null;
/** The current at place p: { d (a tangent), speed } or null. Rocks stand clear of it. */
export function currentAt(s, p) {
    if ((s.lv.rings || []).some(w => w.kind === 'cove' && dist(p, w.c) < w.r)) return null;      // still water inside the cove
    const dTop = dist(p, TOP);
    const cu = (s.lv.currents || []).find(c => dTop > c.r0 && dTop < c.r1 && covers(c, p));
    if (!cu) return null;
    return { d: tangent(p, cross(TOP, p)), speed: cu.speed };            // east: the way lon grows
}
export const urchinAt = (s, p, pad = 0) => (s.lv.urchins || []).find(u => dist(u.p, p) < u.r + pad) || null;
/** How high the ground is at place p: the top of a rock, or the sea floor. */
export const floorAt = (s, p) => (rockUnder(s, p) ? ROCK_H : 0);
export const nutUnder = (s, p) => s.nuts.find(n => (n.state === 'rest' || n.state === 'float') && dist(n.p, p) < NUT_R) || null;

// Does the step from a to b cross a wall standing taller than h? → { n } (its normal in the ground at b).
function _blocked(s, a, b, h) {
    for (const w of s.lv.rings || []) {
        if (!up(s, w) || h >= w.h) continue;
        const c = w.c || TOP, d0 = dist(a, c) - w.r, d1 = dist(b, c) - w.r;
        if (!(d0 * d1 < 0 || (d0 === 0 && d1 !== 0)) || !covers(w, b)) continue;
        if (w.way === 'out' && d1 > d0) continue;                         // a slide: out only
        return { n: toward(b, c), w };
    }
    for (const w of s.lv.bars || []) {
        if (!up(s, w) || h >= w.h) continue;
        const n = norm(cross(w.a, w.b)), s0 = dot(a, n), s1 = dot(b, n);
        if (s0 * s1 >= 0) continue;
        const q = norm(mix(a, b, Math.abs(s1), Math.abs(s0)));
        if (dot(cross(w.a, q), n) > 0 && dot(cross(q, w.b), n) > 0) return { n: tangent(b, n), w };
    }
    return null;
}

export function jump(s) {
    const c = s.crab;
    if (s.won) return false;
    // (a blink of grace after walking off an edge, so a jump off the side of a rock still counts)
    if (c.air && !(c.coy > 0 && c.vh <= 0 && !c.lifted)) { c.jbuf = JUMP_BUFFER; return false; }
    c.vh = JUMP_V; c.air = true; c.jbuf = 0; c.coy = 0;
    return true;
}
const _throwOf = charge => { const k = Math.max(0, Math.min(1, charge)), T = THROW.t0 + (THROW.t1 - THROW.t0) * k; return { T, v: (THROW.range0 + (THROW.range1 - THROW.range0) * k) / T }; };
/** Throw a coconut the way the crab faces: needs one in the claws. charge 0 (a tap) .. 1 (far). */
export function throwNut(s, charge = 0) {
    const c = s.crab;
    if (s.won || c.nuts < 1) return null;
    const { T, v } = _throwOf(charge), h0 = c.h + THROW.up;
    const hand = walk(c.p, c.face, THROW.ahead / R), from = _blocked(s, c.p, hand, h0) ? c.p.slice() : hand;
    const n = { id: s.id++, p: from, d: tangent(from, c.face), v, h: h0, vh: (G * T) / 2 - h0 / T, state: 'fly', age: 0, used: false, still: 0 };
    s.nuts.push(n); c.nuts--; s.throws++;
    return n;
}
/** Where a throw from here would come down: { p, path, bank, wet } (it flies, banks and lands; then the water has it). */
export function aim(s, charge = 0) {
    const t = { ...s, nuts: [], back: [], open: { ...s.open }, held: { ...s.held }, plug: { ...s.plug }, crab: { ...s.crab, nuts: 1 }, gull: null, boss: null, throws: 0, id: 1 };
    const n = throwNut(t, charge), path = []; let bank = null;
    for (let i = 0; i < 240 && n.state === 'fly'; i++) { const ev = []; _nut(t, n, 1 / 60, ev); if (!bank && ev.some(e => e.type === 'bank')) bank = [n.p, n.h]; if (i % 3 === 0) path.push([n.p, n.h]); }
    return { p: n.p, path, bank, wet: n.state === 'float' };
}

function _lose(s, n, ev, why) { s.nuts.splice(s.nuts.indexOf(n), 1); s.back.push(RESPAWN_S); ev.push({ type: 'lost', nut: n, p: n.p, why }); }
function _nut(s, n, dt, ev) {
    n.age += dt;
    if (n.state === 'fly') {
        const q = walk(n.p, n.d, (n.v * dt) / R), bs = s.boss;
        if (bs && !n.blocked && bs.state !== 'sleep' && bs.state !== 'down' && dist(q, TOP) < BOSS.headR && n.h > BOSS.h0 && n.h < BOSS.h1) {
            if (bs.state === 'dizzy') {                           // a coconut on the head, while he is dizzy
                s.nuts.splice(s.nuts.indexOf(n), 1); bs.hp--; bs.round++; bs.t = 0; bs.n = 0; bs.state = bs.hp > 0 ? 'hurt' : 'down';
                ev.push({ type: 'ink-hit', hp: bs.hp, p: q, h: n.h }); if (bs.hp <= 0) ev.push({ type: 'ink-down' }); return;
            }
            // awake: a coconut that finds an arm stuns it (two arms, any two, and he goes dizzy)
            const lq = lonOf(q), ai = n.h < BOSS.armH ? Array.from({ length: BOSS.arms }, (_, i) => i).find(i => dAng(lq, armLon(s, i)) < BOSS.armDeg) : undefined;
            if (ai !== undefined && bs.arms[ai] <= 0) {
                s.nuts.splice(s.nuts.indexOf(n), 1); bs.arms[ai] = BOSS.armFor; bs.stunned++;
                ev.push({ type: 'ink-arm', arm: ai, p: q, count: bs.stunned });
                if (bs.stunned >= 2) { bs.state = 'dizzy'; bs.t = 0; bs.n = 0; bs.stunned = 0; bs.arms.fill(0); ev.push({ type: 'ink-dizzy' }); }
                return;
            }
            n.blocked = true; n.d = tangent(n.p, toward(TOP, n.p)).map(x => -x); n.v *= 0.3; n.vh = Math.min(n.vh, -1); ev.push({ type: 'ink-block', p: n.p, nut: n });
        }
        const hit = _blocked(s, n.p, q, n.h);
        if (hit) { const k = dot(n.d, tangent(n.p, hit.n)); n.d = tangent(n.p, mix(n.d, tangent(n.p, hit.n), 1, -2 * k)); n.v *= 0.85; ev.push({ type: 'bank', nut: n, p: n.p }); }
        else { n.d = tangent(q, n.d); n.p = q; }
        n.vh -= G * dt; n.h += n.vh * dt;
        for (const tg of s.lv.targets || []) {
            if (s.open[tg.gate] || Math.hypot(dist(n.p, tg.p), n.h - 1.1) > HIT_R) continue;
            s.open[tg.gate] = true; n.state = 'stuck'; n.p = tg.p.slice(); n.h = 1.1; ev.push({ type: 'target', target: tg, nut: n }); return;
        }
        const g = s.gull;
        if (g && g.state !== 'stun' && Math.hypot(dist(n.p, g.p), n.h - (g.h + 0.4)) < GULL.hit + 0.1) { _stun(s, ev, 'nut'); n.vh = Math.min(n.vh, -2); n.v *= 0.3; }
        const fl = floorAt(s, n.p);
        if (n.h <= fl) {
            n.h = fl;
            if (s.boss && dist(n.p, TOP) < 1.95) n.p = at(BOSS.pileAt, lonOf(n.p));       // (never left inside the fence, out of reach)
            if (urchinAt(s, n.p)) return _lose(s, n, ev, 'urchin');
            n.state = currentAt(s, n.p) && !rockUnder(s, n.p) ? 'float' : 'rest';
            ev.push({ type: n.state === 'float' ? 'plop' : 'thud', nut: n, p: n.p });
        }
        return;
    }
    if (n.state !== 'float') return;
    // Afloat: the eddy by a cove takes it in; otherwise the current has it.
    const ed = (s.lv.eddies || []).find(e => dist(e.p, n.p) < e.r), cu = currentAt(s, n.p);
    const d = ed ? toward(n.p, ed.to) : cu ? cu.d : null, sp = ed ? ed.speed : cu ? cu.speed : 0;
    if (!d) { n.state = 'rest'; return; }
    const q = walk(n.p, d, (sp * dt) / R);
    if (_blocked(s, n.p, q, 0)) n.still += dt; else { n.p = q; n.still = 0; }
    const v = (s.lv.vents || []).find(x => x.float && !s.plug[x.id] && dist(x.p, n.p) < x.r + 0.15);   // (only the cove's vent takes a floating coconut)
    if (v) { n.state = 'plug'; n.p = v.p.slice(); s.plug[v.id] = n.id; ev.push({ type: 'plug', vent: v, nut: n, now: blowing(s) }); return; }
    if (urchinAt(s, n.p)) return _lose(s, n, ev, 'urchin');
    if (n.still > 1.5) _lose(s, n, ev, 'wedged');                         // (jammed against a wall where nothing can reach it)
}

function _reset(s, ev, why) {
    const c = s.crab, at0 = s.lv.checks[s.cp];
    Object.assign(c, { p: at0.slice(), f: tangent(at0, s.lv.goal), face: tangent(at0, s.lv.goal), h: 0, vh: 0, air: false, coy: COYOTE_S, jbuf: 0, lifted: false });
    s.falls++;
    ev.push({ type: why, at: s.cp });
}

// ── The gull ────────────────────────────────────────────────────────────────
function _stun(s, ev, by) {
    const g = s.gull;
    if (g.loot) { const n = { id: s.id++, p: g.p.slice(), d: tangent(g.p, [1, 0, 0]), v: 0, h: 0, vh: 0, state: 'rest', age: 0.4, still: 0 }; s.nuts.push(n); g.loot = 0; ev.push({ type: 'drop', nut: n }); }
    g.state = 'stun'; g.t = 0; g.h = 0;
    ev.push({ type: 'stun', by });
}
function _gull(s, dt, ev) {
    const g = s.gull, c = s.crab, lv = s.lv.gull;
    g.t += dt; g.cool = Math.max(0, g.cool - dt);
    const dc = dist(g.p, c.p), cTop = dist(c.p, TOP), onShelf = cTop < 9.1 && cTop > 5.7;
    if (g.state === 'walk' || g.state === 'flee') {
        // round the shelf (fleeing: away from the crab, twice as fast)
        const away = g.state === 'flee' && dot(tangent(g.p, cross(TOP, g.p)), toward(g.p, c.p)) > 0 ? -1 : 1;
        g.p = walk(g.p, tangent(g.p, cross(TOP, g.p)), (away * GULL.speed * (g.state === 'flee' ? 2 : 1) * dt) / R);
        g.p = at(lv.ring, lonOf(g.p));
        if (g.state === 'flee' && g.t > GULL.flee) { g.state = 'walk'; g.t = 0; g.cool = GULL.cool; }
        else if (g.state === 'walk' && !g.loot && g.cool <= 0 && onShelf && dc < GULL.see) { g.state = 'rise'; g.t = 0; ev.push({ type: 'gull-up' }); }
    } else if (g.state === 'rise') {
        g.h = GULL.high * Math.min(1, g.t / GULL.rise);
        if (g.t >= GULL.rise) { g.state = 'circle'; g.t = 0; }
    } else if (g.state === 'circle') {
        // over the crab, its shadow on the ground
        const k = Math.min(1, (7 * dt) / Math.max(0.01, dc)); g.p = norm(mix(g.p, c.p, 1 - k, k));
        if (!onShelf && g.t > 0.3) { g.state = 'land'; g.t = 0; g.tx = at(lv.ring, lonOf(g.p)); g.from = g.p.slice(); }
        else if (g.t >= GULL.circle) { g.state = 'dive'; g.t = 0; g.tx = c.p.slice(); g.from = g.p.slice(); ev.push({ type: 'gull-dive', p: g.tx }); }
    } else if (g.state === 'dive' || g.state === 'land') {
        const k = Math.min(1, g.t / GULL.dive); g.p = norm(mix(g.from, g.tx, 1 - k, k)); g.h = GULL.high * (1 - k);
        if (k >= 1) {
            g.h = 0;
            if (g.state === 'dive' && dist(c.p, g.p) < GULL.hit && c.h < 0.6) {
                if (c.nuts > 0) { c.nuts--; g.loot = 1; g.state = 'flee'; g.t = 0; ev.push({ type: 'steal' }); }
                else { g.state = 'ground'; g.t = 0; _reset(s, ev, 'peck'); }
            } else { g.state = g.state === 'land' ? 'walk' : 'ground'; g.t = 0; g.cool = GULL.cool; if (g.state === 'ground') ev.push({ type: 'gull-miss' }); }
        }
    } else if (g.state === 'ground') { if (g.t > GULL.ground) { g.state = 'walk'; g.t = 0; g.cool = GULL.cool; g.p = g.p.slice(); } }
    else if (g.state === 'stun') { if (g.t > GULL.stun) { g.state = 'walk'; g.t = 0; g.cool = GULL.cool; } }
}

/** Advance by dt. The stick: x right, y forward (up the screen), each −1..1. → events. */
export function step(s, dt, stick = { x: 0, y: 0 }) {
    const ev = [], c = s.crab, lv = s.lv;
    if (s.won) return ev;
    s.t += dt;
    c.jbuf = Math.max(0, c.jbuf - dt);
    for (let i = s.back.length - 1; i >= 0; i--) { s.back[i] -= dt; if (s.back[i] <= 0) { s.back.splice(i, 1); ev.push({ type: 'washed', nut: _palmNut(s) }); } }

    // Walk (in the air too). In a current the crab wades slowly and is carried along.
    const cu = !c.air && !rockUnder(s, c.p) ? currentAt(s, c.p) : null;
    const m = Math.min(1, Math.hypot(stick.x, stick.y));
    c.moving = m > 0.12;
    const move = q => { if (!_blocked(s, c.p, q, c.h)) { c.p = q; c.f = tangent(q, c.f); c.face = tangent(q, c.face); return true; } return false; };
    if (c.moving) {
        const right = cross(c.f, c.p), d = norm(mix(right, c.f, stick.x, stick.y));
        c.face = tangent(c.p, d);
        move(walk(c.p, d, (SPEED * (cu ? WADE : 1) * m * dt) / R));
    }
    if (cu) move(walk(c.p, cu.d, (cu.speed * dt) / R));          // (the eddy by the cove is for coconuts: a crab is only ever swept past it)
    c.wet = !!cu;
    for (const n of s.nuts.slice()) _nut(s, n, dt, ev);

    // The ground under the crab: walk up onto a rock, or off its edge and fall.
    if (!c.air) {
        const f = floorAt(s, c.p);
        if (c.h < f && f - c.h <= 0.6) c.h = f; else if (c.h > f + 1e-6) { c.air = true; c.vh = 0; }
        if (!c.air) c.coy = COYOTE_S;
    } else c.coy = Math.max(0, c.coy - dt);

    // A vent that is blowing lifts a crab standing in it, high.
    const v = blowing(s);
    if (v && v.lift && dist(c.p, v.p) < v.r && c.h < v.lift) {
        if (!c.lifted) { c.lifted = true; ev.push({ type: 'lift', vent: v }); }
        c.air = true; c.vh = 8; c.h += 8 * dt;
    } else if (c.air) {
        const was = c.h;
        c.vh -= G * dt; c.h += c.vh * dt;
        const g = s.gull;
        const fly = s.nuts.find(n => n.state === 'fly' && !n.used && n.age > 0.2 && dist(n.p, c.p) < TRICK_R && c.h >= n.h - 0.15 && c.h - n.h < TRICK_GAP);
        if (fly) { fly.used = true; fly.vh = -5; c.vh = BOUNCE_V; ev.push({ type: 'trick', nut: fly, h: c.h }); }
        else if (c.vh < 0 && g && g.state !== 'rise' && g.state !== 'circle' && g.h < 3 && dist(g.p, c.p) < GULL.hit + 0.1 && was >= g.h + GULL.top && c.h <= g.h + GULL.top + 0.05) {
            c.h = g.h + GULL.top; c.vh = BOUNCE_V; ev.push({ type: 'stomp' }); _stun(s, ev, 'stomp');
        } else if (c.vh < 0) {
            const n = nutUnder(s, c.p), nt = n ? floorAt(s, n.p) + NUT_TOP : 0, fl = floorAt(s, c.p);
            if (n && was >= nt && c.h <= nt) { c.h = nt; c.vh = BOUNCE_V; ev.push({ type: 'bounce', nut: n }); }
            else if (c.h <= fl) { c.h = fl; c.vh = 0; c.air = false; c.lifted = false; ev.push({ type: 'land', onRock: fl > 0 }); if (c.jbuf > 0) jump(s); }
        }
    }

    // Standing on a lift vent that is not the one blowing: say so, once.
    const stand = (lv.vents || []).find(x => x.lift && dist(c.p, x.p) < x.r);
    if (stand && stand !== v && !c.air) { if (s.calm !== stand.id) { s.calm = stand.id; ev.push({ type: 'calm', vent: stand, blowing: v }); } } else if (!stand) s.calm = null;
    // Urchins.
    if (c.h < 0.7 && urchinAt(s, c.p, 0.15)) { _reset(s, ev, 'ouch'); return ev; }
    // Picking coconuts up: walk into one that is lying or floating.
    if (!c.air && c.nuts < CARRY) {
        const n = s.nuts.find(x => (x.state === 'rest' || x.state === 'float') && x.age > PICK_AGE && dist(x.p, c.p) < PICK_R);
        if (n) { s.nuts.splice(s.nuts.indexOf(n), 1); c.nuts++; ev.push({ type: 'pick', nut: n }); }
    }
    if (s.gull) _gull(s, dt, ev);
    if (s.boss) _boss(s, dt, ev);
    if (s.won) return ev;

    // Plates: held down by the crab on the ground, or a coconut at rest.
    for (const pl of lv.plates || []) {
        const on = (!c.air && dist(c.p, pl.p) < pl.r) || s.nuts.some(n => n.state === 'rest' && dist(n.p, pl.p) < pl.r);
        if (on !== !!s.held[pl.gate]) { s.held[pl.gate] = on; ev.push({ type: on ? 'press' : 'release', plate: pl }); }
    }
    lv.checks.forEach((p, i) => { const z = lv.zones && lv.zones[i], dT = dist(c.p, TOP); if (i > s.cp && !c.air && (dist(c.p, p) < CHECK_R || (z && dT > z[0] && dT < z[1]))) { s.cp = i; ev.push({ type: 'check', i, p }); } });
    if (!c.air && dist(c.p, lv.goal) < GOAL_R) { s.won = true; ev.push({ type: 'won', t: s.t, falls: s.falls }); }
    return ev;
}

function _pile(s, ev, n) {
    const c = s.crab, base = lonOf(c.p) + 180;
    for (let i = 0; i < n; i++) {
        let p = at(BOSS.pileAt, base + i * (360 / n) + s.boss.pile * 37); if (dist(p, c.p) < 0.9) p = at(BOSS.pileAt, lonOf(p) + 45);
        const nut = { id: s.id++, p, d: [0, 0, 0], v: 0, h: 0, vh: 0, state: 'rest', age: 9, still: 0 }; nut.d = tangent(p, [1, 0, 0]); s.nuts.push(nut); ev.push({ type: 'pile', nut });
    }
    s.boss.pile++;
}
/** Old Ink: wakes when the crab comes into the chamber, then winds up, slams, and goes dizzy, round after round. */
function _boss(s, dt, ev) {
    const b = s.boss, c = s.crab; if (b.state === 'down') return;
    if (b.state === 'sleep') { if (dist(c.p, TOP) < BOSS.arena) { b.state = 'idle'; b.t = 0; ev.push({ type: 'ink-wake' }); _pile(s, ev, BOSS.piles); } return; }
    b.t += dt; const r = Math.min(2, b.round);
    for (let i = 0; i < BOSS.arms; i++) if (b.arms[i] > 0) { b.arms[i] -= dt; if (b.arms[i] <= 0 && b.state !== 'dizzy') b.stunned = Math.max(0, b.stunned - 1); }
    // coconuts keep coming: when two or fewer are lying about, a fresh pile
    const loose = s.nuts.filter(n => n.state === 'rest' || n.state === 'float').length;
    if (loose < 2 && dist(c.p, TOP) < BOSS.arena + 0.5) { b.spawn = (b.spawn || 0) + dt; if (b.spawn >= BOSS.pileEvery) { b.spawn = 0; _pile(s, ev, BOSS.piles - loose); } } else b.spawn = 0;
    if (b.state === 'idle') { if (b.t >= (b.rest ? BOSS.rest : BOSS.wake)) { b.rest = false; b.state = 'wind'; b.t = 0; b.tx = c.p.slice(); ev.push({ type: 'ink-wind' }); } }
    else if (b.state === 'wind') {
        const dur = BOSS.wind[r];
        if (b.t < dur * 0.55) b.tx = c.p.slice();                         // (follows the crab, then commits)
        if (b.t >= dur) {
            const hitC = dist(c.p, b.tx) < BOSS.hitR && c.h < 0.9;
            ev.push({ type: 'ink-slam', p: b.tx, hit: hitC });
            if (hitC) { c.p = at(2.6, lonOf(c.p)); c.f = tangent(c.p, c.f); c.face = tangent(c.p, c.face); c.vh = 5; c.air = true; s.falls++; ev.push({ type: 'ink-ouch' }); }
            b.state = 'recover'; b.t = 0;
        }
    } else if (b.state === 'recover') {
        if (b.t >= BOSS.recover) { b.n++; b.t = 0; if (b.n >= BOSS.slams[r]) { b.state = 'idle'; b.rest = true; b.n = 0; ev.push({ type: 'ink-rest' }); } else { b.state = 'wind'; b.tx = c.p.slice(); ev.push({ type: 'ink-wind' }); } }
    } else if (b.state === 'dizzy') { if (b.t >= BOSS.dizzy) { b.state = 'idle'; b.t = 0; b.n = 0; b.stunned = 0; ev.push({ type: 'ink-recover' }); } }
    else if (b.state === 'hurt') { if (b.t >= BOSS.hurt) { b.state = 'idle'; b.t = 0; b.n = 0; _pile(s, ev, Math.max(0, BOSS.piles - s.nuts.filter(n => n.state === 'rest').length)); } }
}

/** Turn the camera (and so what 'up the screen' means) round the crab by a radians. */
export function turnView(s, a) {
    const c = s.crab;
    c.f = tangent(c.p, mix(c.f, cross(c.p, c.f), Math.cos(a), Math.sin(a)));
}
