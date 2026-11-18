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
export const PAD_NUT_V = 12.5, PAD_CRAB_V = 10, PAD_H = 0.25;   // a jelly pad: how hard it throws a coconut (and a crab) up, and how high it stands
export const STEP_UP = 0.6, CLIMB_V = 2.2, TOP_W = 0.45, PUSH_K = 0.6;   // a ledge the crab walks up; how fast it climbs a vine; how wide a wall top is; how fast a block goes
export const COYOTE_S = 0.1, JUMP_BUFFER = 0.15, WADE = 0.35, RESPAWN_S = 1.4;
export const THROW = { range0: 1.6, range1: 7, t0: 0.55, t1: 1.0, up: 0.75, ahead: 0.45 };
// OLD INK. He sits on the pearl behind the inner fence and fights from there, in three rounds (one per coconut that lands on him). He slams the
// ground where the crab stands (a ring shows where, then it lands: move, or jump it), over and over, with a breather now and then. For
// BOSS.recover seconds after a slam lands his arm is stuck in the ground and his head is OPEN: a coconut on it then hurts him (three hits
// end him); any other time another arm swats it away; he is shaken for a moment after each, and the next round is faster. Touching him, or being
// under a slam, knocks the crab back to the edge and counts as a fall. The pearl can't be taken while he is up. Coconut piles keep
// turning up round the chamber (the claws still hold only three).
export const BOSS = { arms: 8, rest: 2.4, hits: 3, arena: 2.9, headR: 2.0, h0: 0.35, h1: 3.4, wind: [1.15, 0.95, 0.8], slams: [3, 4, 5], hitR: 1.0, touch: 1.45, wake: 0.9, recover: 1.5, hurt: 1.3, piles: 4, pileAt: 2.4, pileEvery: 1.4 };
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
    id: 'stair', name: 'THE DROWNED STAIR', world: 1, pay: 40, start: at(18.4, 0), goal: TOP, palm: at(17.7, -42), bank: BANK,
    story: 'Old Ink has the Tide Pearl. His lair starts here: a rip current, a cliff, and a gull on watch. Three coconuts are all you have.',
    hints: ['Vent A is bubbling in its cove. Only one vent blows at a time.', 'A coconut floats. The current goes past the cove.', 'Drop one in the water above the cove, on the far side of the current.', 'Up on the shelf there are three jobs and only two coconuts. What else bounces?', 'Old Ink slams where you stand: a red ring fills, then it lands. Step out or jump. For a moment after a slam his arm is stuck and his head is open: that is when a coconut hurts him (any other time an arm swats it away). Three hits win. Touching him hurts. More piles keep turning up.', 'The plate holds the pearl\'s fence open while a coconut is on it. Only Old Ink down lets you take the pearl.'],
    checks: [at(18.4, 0), SHELF], zones: { 1: [5.7, 9.1] },          // (anywhere on the shelf counts as reaching its flag)
    rings: [
        { r: 9.2, h: 8.5, gap: [180, 9], kind: 'cliff' }, { r: 9.2, h: 8.5, only: [180, 9], way: 'out', kind: 'slide', earn: 1 },   // the cliff, and a slide back down (both ways once the shelf's flag is yours)
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

// ── World 1: learning the claws ─────────────────────────────────────────────
// Three short chambers, each teaching one thing, and then the Drowned Stair puts them all together and ends with Old Ink.

// 1. COCONUT BEACH: a sandcastle fort on a little island.
//   the beach: the start, the palm (a golden shell over it)            d > 15
//   the outer sandcastle wall (3 high, you can stand on top)          15
//       · a cracked section at lon 0: two coconuts break it
//       · vines at lon 90: climb with empty claws (a golden shell along the top)
//   a strip of sand inside it                                         14 – 15
//   the moat: deep water (in it: back to the flag), three logs drift round      10 – 14   (a golden shell over it)
//   the inner bank, and a sand block                                  8 – 10
//   the court wall (2 high, you can stand on top; a slide out at the back)      8
//   the court: a plate holds the red gate                             3.2 – 8
//   the keep: a bullseye inside the red gate opens the blue one for 6 s          2.7 · 2.2
// THE ANSWER. Pick up the coconuts. Two throws break the cracked wall (they fall back to you). Ride a log across the moat. Push the
// sand block to the court wall, jump on it, jump onto the wall, and down into the court. A coconut on the plate drops the red gate;
// a coconut into the bullseye inside drops the blue one for six seconds: run in, take the pearl.
export const BEACH = {
    id: 'beach', name: 'COCONUT BEACH', world: 1, fast: 75, pay: 15, start: at(18.4, 0), goal: TOP, palm: at(17.7, -42), bank: 14,
    story: 'Old Ink has the Tide Pearl, deep in his lair. First, his sandcastle fort: break in, cross the moat, climb the walls.',
    hints: ['Walk into the coconuts to pick them up. Hold 🥥 and let go to throw. The cracked wall breaks after two hits.', 'The moat is deep: ride the logs across (wait for one, then jump).', 'Push the sand block against the court wall, jump on it, and jump again onto the wall.', 'A coconut on the plate drops the red gate. The bullseye inside it drops the blue one, but only for six seconds.', 'Golden shells: one over the palm (bounce on a coconut), one on top of the outer wall (the vines, with empty claws), one over the moat (jump from a log).'],
    ground: [[1.8, 'dais'], [2.2, 'stone'], [3.2, 'stone'], [8, 'grass'], [10, 'grass'], [14, 'sea'], [99, 'sand']],
    checks: [at(18.4, 0), at(9.2, 0)], zones: { 1: [8.1, 9.9] },
    rings: [
        { r: 15, h: 3, top: true, gap: [0, 14], vine: [90, 6], kind: 'castle' },
        { r: 15, h: 3, only: [0, 14], hp: 2, id: 'crack', kind: 'crack' },
        { r: 8, h: 2, top: true, gap: [180, 8], kind: 'castle' }, { r: 8, h: 2, only: [180, 8], way: 'out', kind: 'slide', show: 2 },
        { r: 3.2, h: 9, gate: 'red', kind: 'gate' }, { r: 2.2, h: 9, gate: 'blue', kind: 'gate' },
    ],
    currents: [{ r0: 10, r1: 14, only: [0, 180], speed: 1.6, deep: true }],
    logs: [0, 120, 240].map(lon0 => ({ orbit: 12, lon0, speed: 16, h: 0.35, r: 0.95 })),
    blocks: [{ p: at(9.2, 40) }],
    plates: [{ p: at(5.4, 60), r: 0.9, gate: 'red' }],
    targets: [{ p: at(2.7, -60), gate: 'blue', secs: 6 }],
    gold: [{ p: at(17.7, -42), h: 2.8 }, { p: at(15, 130), h: 3 }, { p: at(12, 200), h: 1.3 }],
};

// 2. BUBBLE STREAM: a river valley on three levels.
//   the beach (start, the palm)                                   d > 12.5
//       · a rock shelf (3 high) with vent A on it, a jelly pad in front   13.6 – 15, lon 60
//       · vent B by the river (the lift)                           13.3, lon 0
//       · a stone post with a golden shell on top, a jelly pad by it; a crystal cage with another (opened by the log's bullseye)
//   the river: deep, all the way round; logs drift on it (one carries a bullseye)            10 – 12.5
//   the middle terrace (3.8 high)                                  4.6 – 9.6
//       · the bank shot: a painted spot, a yellow bumper in a deep pool, a bullseye in an alcove that faces only the bumper
//       · a ramp up to the mesa; the green fence round the mesa (the bullseye holds it open)
//       · a pillar (9 high) with a plate on top, a coconut hanging over it from the mesa's palm
//   the mesa (7.5 high), the pearl inside the gold fence (the plate holds it open)               0 – 4.6
// THE ANSWER. Throw a coconut onto the jelly pad: it bounces up onto the shelf and into vent A, so B blows. Ride B over the river
// onto the terrace. From the painted spot, bank a coconut off the yellow bumper into the bullseye: the green fence drops. Up the
// ramp to the mesa; put a coconut on the pillar's plate (lob one, or knock the hanging one down onto it): the gold fence drops.
// The bank shot: stand on the painted spot (SPOT), throw at the yellow bumper (BUMP) standing in a deep pool, and it glances off into
// the bullseye in its alcove (ALCOVE), which faces only the bumper. The bumper is set at the angle that sends a coconut from the spot
// to the bullseye; a coconut that falls in the pool washes back up at the spot.
const SPOT = at(8.0, 82), BUMP = at(5.5, 94), ALCOVE = at(8.3, 106), PILLAR = at(5.3, -60);
const _bis = norm(mix(toward(BUMP, SPOT), toward(BUMP, ALCOVE), 1, 1)), _wd = tangent(BUMP, cross(BUMP, _bis));
const BUMP_A = walk(BUMP, _wd, 1.4 / R), BUMP_B = walk(BUMP, _wd, -1.4 / R), POOL = norm(mix(BUMP, ALCOVE, 0.5, 0.5));
// a chute (two walls) from the alcove toward the bumper: only a coconut coming off the bumper's face can run down it to the bullseye
const _ax = toward(ALCOVE, BUMP), _px = tangent(ALCOVE, cross(ALCOVE, _ax)), _len = dist(ALCOVE, BUMP);
const _cw = (k, off) => walk(walk(ALCOVE, _ax, k / R), _px, off / R);
const CHUTE = [[_cw(0.55, 0.5), _cw(_len - 0.4, 0.5)], [_cw(0.55, -0.5), _cw(_len - 0.4, -0.5)]];
export const STREAM = {
    id: 'stream', name: 'BUBBLE STREAM', world: 1, fast: 120, pay: 20, start: at(18.4, 0), goal: TOP, palm: at(17.7, -42), bank: 12.5,
    story: 'A river valley on three levels. Vents to ride, a bank shot to make, and a pearl up on the mesa.',
    hints: ['Vent A is up on the rock shelf, too high to throw to. The jelly pad in front has an arrow: whatever lands on it is thrown that way.', 'With A plugged, vent B blows: ride it over the river and steer onto the terrace.', 'The bank shot: stand on the painted spot, and throw at the yellow bumper in the pool. It bounces the coconut into the bullseye (follow the green dots). The aim turns green when it will hit.', 'Up on the mesa, the plate is on top of the pillar. Lob a coconut onto it, or knock the hanging coconut down.', 'Golden shells: on the post by the beach (bounce on the jelly), in the cage (hit the bullseye on the log), over the river (steer through it riding vent B).'],
    ground: [[4.6, 'stone'], [9.6, 'grass'], [10, 'sand'], [12.5, 'sea'], [99, 'sand']],
    checks: [at(18.4, 0), at(8.6, 0)], zones: { 1: [4.7, 9.5] },
    ledges: [
        { r0: 0, r1: 4.6, h: 7.5, kind: 'mesa' }, { r0: 4.6, r1: 9.6, h: 3.8, kind: 'terrace' },
        { r0: 4.6, r1: 6.4, only: [180, 7], h: 7.5, h1: 3.8, kind: 'ramp' },
        { r0: 13.5, r1: 15.1, only: [60, 8], h: 3, kind: 'shelf' },
    ],
    rings: [
        { r: 4.4, h: 20, gate: 'green', kind: 'gate' }, { r: 1.8, h: 20, gate: 'gold', kind: 'gate' },       // (the green fence runs round the whole mesa)
        { c: ALCOVE, r: 0.9, h: 7, gap: [lonOf(BUMP, ALCOVE), 26], kind: 'cove' },
        { c: at(16, -100), r: 0.9, h: 9, gate: 'cage', kind: 'gate' },
    ],
    bars: [{ a: BUMP_A, b: BUMP_B, h: 7, kind: 'bumper' }, ...CHUTE.map(([a, b]) => ({ a, b, h: 7, kind: 'chute' }))],
    posts: [{ p: PILLAR, r: 0.55, h: 9 }, { p: at(16.6, 110), r: 0.5, h: 3 }],
    pads: [{ p: at(16.5, 60), r: 1.0, to: at(14.3, 60) }, { p: at(17.6, 110), r: 0.7 }],
    pools: [{ p: POOL, r: dist(BUMP, ALCOVE) / 2 + 0.6, to: SPOT }, { p: ALCOVE, r: 1.9, to: SPOT }, { p: BUMP, r: 1.5, to: SPOT }],
    drains: [{ p: ALCOVE, r: 0.9, to: SPOT }],
    spots: [{ p: SPOT, via: BUMP, to: ALCOVE, gate: 'green' }],
    currents: [{ r0: 10, r1: 12.5, only: [0, 180], speed: 1.6, deep: true }],
    logs: [0, 120, 240].map(lon0 => ({ orbit: 11.25, lon0, speed: 14, h: 0.35, r: 0.95 })),
    vents: [{ id: 'A', p: at(14.3, 60), r: 1.0, drop: true }, { id: 'B', p: at(13.3, 0), r: 0.8, lift: 3.2 }],
    plates: [{ p: PILLAR, r: 0.5, gate: 'gold' }],
    targets: [{ p: ALCOVE, gate: 'green', tall: 1.4 }, { p: at(11.25, 0), log: 0, gate: 'cage' }],
    hangs: [{ p: PILLAR, h: 9.9 }],
    gold: [{ p: at(16.6, 110), h: 3 }, { p: at(16, -100), h: 0 }, { p: at(11.6, 6), h: 4.4 }],
};

// 3. GULL YARD: Old Ink's gull.
//   the beach                                                  d > 9.2
//   the yard gate (crystal), opened by a bullseye on the beach  9.2   (the bullseye at 10.6, lon 30)
//   the yard, where the gull walks                              5.6 – 9.2
//   the tall step (no coconut over it; a slide out at the back) 5.6
//   inside: the plate (inner gate) and the bullseye (outer gate), the pearl      4.3 · 3 · 1.8
// THE ANSWER. One coconut into the beach bullseye: two left. In the yard the gull dives: step aside, and jump on its back as it lands
// (or hit it with a coconut and it drops what it stole). Its back bounces you over the step with both coconuts: one on the plate, one
// into the bullseye. (Over the step on a coconut you are in with one, and that's not enough.)
export const YARD = {
    id: 'yard', name: 'GULL YARD', world: 1, fast: 60, pay: 15, start: at(18.4, 0), goal: TOP, palm: at(17.7, -42), bank: 9.2,
    story: 'Old Ink\'s gull keeps watch. It steals coconuts. But a gull has a back, and backs bounce.',
    hints: ['A coconut in the bullseye on the beach opens the yard.', 'The gull circles, then dives where you stand: its shadow and a red ring show where. Move!', 'Jump on the gull as it lands, or hit it with a coconut: it is stunned and drops anything it stole.', 'Inside the step are two jobs. Over the step on a coconut, you are in with only one. What else bounces?'],
    ground: [[1.8, 'dais'], [5.6, 'stone'], [9.2, 'grass'], [99, 'sand']],
    checks: [at(18.4, 0), at(7.9, 0)], zones: { 1: [5.7, 9.1] },
    rings: [
        { r: 9.2, h: 9, gate: 'yard', kind: 'gate' },
        { r: 5.6, h: 2, nutH: 9, gap: [180, 9], kind: 'step' }, { r: 5.6, h: 2, nutH: 9, only: [180, 9], way: 'out', kind: 'slide', show: 2 },
        { r: 3, h: 9, gate: 'eye', kind: 'gate' }, { r: 1.8, h: 9, gate: 'plate', kind: 'gate' },
    ],
    plates: [{ p: at(4.3, 100), r: 0.9, gate: 'plate' }],
    targets: [{ p: at(10.6, 30), gate: 'yard' }, { p: at(4.2, -100), gate: 'eye' }],
    gull: { ring: 7.5, from: 60 },
};

export const CHAMBERS = [BEACH, STREAM, YARD, STAIR];
/** While testing, every chamber is open. (Turn it off to make each chamber open when the one before it is cleared.) */
export const ALL_OPEN = true;

// ── A go at a chamber ───────────────────────────────────────────────────────
export function create(lv) {
    const s = { lv, t: 0, id: 1, won: false, falls: 0, cp: 0, throws: 0, calm: null, open: {}, held: {}, plug: {}, nuts: [], back: [], dmg: {}, gold: [], stuckIn: {},
        blocks: (lv.blocks || []).map(b => ({ h: 1, r: 0.55, ...b, p: b.p.slice() })), logs: _logsAt(lv, 0),
        crab: { p: lv.start.slice(), f: tangent(lv.start, lv.goal), face: tangent(lv.start, lv.goal), h: 0, vh: 0, moving: false, air: false, coy: COYOTE_S, jbuf: 0, nuts: 0, lifted: false },
        boss: lv.boss ? { hp: BOSS.hits, state: 'sleep', t: 0, n: 0, round: 0, tx: null, pile: 0, rest: false, touchCd: 0 } : null,
        gull: lv.gull ? { p: at(lv.gull.ring, lv.gull.from), h: 0, state: 'walk', t: 0, cool: 1, loot: 0, tx: null, from: null } : null };
    for (let i = 0; i < CARRY; i++) _palmNut(s, i);
    for (const hg of lv.hangs || []) s.nuts.push({ id: s.id++, p: hg.p.slice(), d: tangent(hg.p, [1, 0, 0]), v: 0, h: hg.h, vh: 0, state: 'hang', age: 9, still: 0 });
    return s;
}
function _palmNut(s, i = s.id) { const n = { id: s.id++, p: around(s.lv.palm, 0.95, 200 + (i % 3) * 60), d: [0, 0, 0], v: 0, h: 0, vh: 0, state: 'rest', age: 9, still: 0 }; n.d = tangent(n.p, [1, 0, 0]); s.nuts.push(n); return n; }
/** Coconuts in the claws, lying about (rest / float / fly), doing a job (plug / stuck), with the gull, on their way back. */
export const count = s => ({ held: s.crab.nuts, loose: s.nuts.filter(n => n.state === 'rest' || n.state === 'float' || n.state === 'fly').length, working: s.nuts.filter(n => n.state === 'plug' || n.state === 'stuck').length, gull: s.gull ? s.gull.loot : 0, back: s.back.length });
/** Where Old Ink's arm i lies round him now (degrees): they sway. */
export const armLon = (s, i) => (i * 360) / BOSS.arms + 14 * Math.sin(s.t * 0.8 + i * 1.7);
/** Is wall w standing? (a broken wall isn't; a gate is down while its switch holds it; an `inv` gate is the other way round) */
export const up = (s, w) => {
    if (w.hp && (s.dmg[w.id] || 0) >= w.hp) return false;
    if (!w.gate) return true;
    const on = !!(s.open[w.gate] || s.held[w.gate]);
    return w.inv ? on : !on;
};
const gatesOf = x => [].concat(x.gate || []);
/** The vent that is blowing: the first that isn't plugged. */
export const blowing = s => (s.lv.vents || []).find(v => !s.plug[v.id]) || null;
export const rockUnder = (s, p) => (s.lv.rocks || []).find(k => dist(k.p, p) < k.r) || null;
/** The current at place p: { d (a tangent), speed } or null. Rocks stand clear of it. */
export function currentAt(s, p) {
    if ((s.lv.rings || []).some(w => w.kind === 'cove' && dist(p, w.c) < w.r)) return null;      // still water inside the cove
    const dTop = dist(p, TOP);
    const cu = (s.lv.currents || []).find(c => dTop > c.r0 && dTop < c.r1 && covers(c, p));
    if (!cu) return null;
    return { d: tangent(p, cross(TOP, p)), speed: cu.speed, deep: !!cu.deep };            // east: the way lon grows
}
export const urchinAt = (s, p, pad = 0) => (s.lv.urchins || []).find(u => dist(u.p, p) < u.r + pad) || null;
/** How high the ground is at place p: the top of a rock, or the sea floor. */
export function floorAt(s, p) {
    let f = rockUnder(s, p) ? ROCK_H : 0;
    for (const l of s.lv.ledges || []) { const d = dist(p, l.c || TOP); if (d >= l.r0 && d < l.r1 && covers(l, p)) f = Math.max(f, l.h1 == null ? l.h : l.h + (l.h1 - l.h) * (d - l.r0) / (l.r1 - l.r0)); }
    for (const k of s.lv.posts || []) if (dist(p, k.p) < k.r) f = Math.max(f, k.h);
    for (const k of s.lv.pads || []) if (dist(p, k.p) < k.r) f = Math.max(f, PAD_H);
    for (const w of s.lv.rings || []) if (w.top && up(s, w) && Math.abs(dist(p, w.c || TOP) - w.r) < TOP_W && covers(w, p)) f = Math.max(f, w.h);
    for (const b of s.blocks || []) if (dist(p, b.p) < b.r) f = Math.max(f, b.h);
    for (const l of s.logs || []) if (dist(p, l.p) < l.r) f = Math.max(f, l.h);
    return f;
}
/** Which way is downhill from p (a tangent; zero on the flat): the floor's slope, felt round about. For bouncing off the side of a ledge or a post. */
function _floorN(s, p, h) {
    let x = [0, 0, 0];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, e1 = tangent(p, [0, 0, 1]), e2 = cross(p, e1), d = norm(mix(e1, e2, Math.cos(a), Math.sin(a))); if (floorAt(s, walk(p, d, 0.25 / R)) > h) x = mix(x, d, 1, -1); }
    return dot(x, x) > 1e-9 ? tangent(p, x) : null;
}
/** Where a bullseye is now (one can ride a log), and how high its face is. */
export const targetAt = (s, tg) => { const p = tg.log != null ? s.logs[tg.log].p : tg.p; return { p, h: floorAt(s, p) + (tg.h || 1.1) }; };
/** Where the floating logs are at time t. */
const _logsAt = (lv, t) => (lv.logs || []).map(l => ({ p: at(l.orbit, l.lon0 + l.speed * t), h: l.h || 0.35, r: l.r || 0.9 }));
export const nutUnder = (s, p) => s.nuts.find(n => (n.state === 'rest' || n.state === 'float') && dist(n.p, p) < NUT_R) || null;

// Does the step from a to b cross a wall standing taller than h? → { n } (its normal in the ground at b).
function _blocked(s, a, b, h, nut = false) {
    for (const w of s.lv.rings || []) {
        if (!up(s, w) || h >= (nut && w.nutH ? w.nutH : w.h)) continue;          // (nutH: a step a crab can bounce over but no coconut can be thrown over)
        const c = w.c || TOP, d0 = dist(a, c) - w.r, d1 = dist(b, c) - w.r;
        if (!(d0 * d1 < 0 || (d0 === 0 && d1 !== 0)) || !covers(w, b)) continue;
        if (w.way === 'out' && (d1 > d0 || (w.earn != null && s.cp >= w.earn))) continue;   // a slide: out only, until its ladder is earned
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
    const hand = walk(c.p, c.face, THROW.ahead / R), from = _blocked(s, c.p, hand, h0, true) ? c.p.slice() : hand;
    const n = { id: s.id++, p: from, d: tangent(from, c.face), v, h: h0, vh: (G * T) / 2 - (h0 - (c.air ? floorAt(s, c.p) : c.h)) / T, state: 'fly', age: 0, used: false, still: 0 };
    s.nuts.push(n); c.nuts--; s.throws++;
    return n;
}
/** Where a throw from here would come down: { p, path, bank, wet } (it flies, banks and lands; then the water has it). */
export function aim(s, charge = 0) {
    const t = { ...s, nuts: [], back: [], open: { ...s.open }, held: { ...s.held }, plug: { ...s.plug }, dmg: { ...s.dmg }, stuckIn: { ...s.stuckIn }, gold: [...s.gold], crab: { ...s.crab, nuts: 1 }, gull: null, boss: null, throws: 0, id: 1 };
    const n = throwNut(t, charge), path = []; let bank = null;
    for (let i = 0; i < 240 && n.state === 'fly'; i++) { const ev = []; _nut(t, n, 1 / 60, ev); if (!bank && ev.some(e => e.type === 'bank')) bank = [n.p, n.h]; if (i % 3 === 0) path.push([n.p, n.h]); }
    return { p: n.p, path, bank, wet: n.state === 'float', hit: n.state === 'stuck' || n.state === 'plug' };     // (hit: it would end in a bullseye)
}

function _lose(s, n, ev, why) { s.nuts.splice(s.nuts.indexOf(n), 1); s.back.push(RESPAWN_S); ev.push({ type: 'lost', nut: n, p: n.p, why }); }
function _nut(s, n, dt, ev) {
    n.age += dt;
    if (n.state === 'fly') {
        const q = walk(n.p, n.d, (n.v * dt) / R), bs = s.boss;
        if (bs && !n.blocked && bs.state !== 'sleep' && bs.state !== 'down' && dist(q, TOP) < BOSS.headR && n.h > BOSS.h0 && n.h < BOSS.h1) {
            if (bs.state === 'recover') {                         // a coconut on the head, while his arm is stuck after a slam
                s.nuts.splice(s.nuts.indexOf(n), 1); bs.hp--; bs.round++; bs.t = 0; bs.n = 0; bs.state = bs.hp > 0 ? 'hurt' : 'down';
                ev.push({ type: 'ink-hit', hp: bs.hp, p: q, h: n.h }); if (bs.hp <= 0) ev.push({ type: 'ink-down' }); return;
            }
            n.blocked = true; n.d = tangent(n.p, toward(TOP, n.p)).map(x => -x); n.v *= 0.3; n.vh = Math.min(n.vh, -1); ev.push({ type: 'ink-block', p: n.p, nut: n, why: bs.state === 'hurt' ? 'hurt' : 'arm' });
        }
        const hit = _blocked(s, n.p, q, n.h, true);
        if (hit) {
            const k = dot(n.d, tangent(n.p, hit.n)); n.d = tangent(n.p, mix(n.d, tangent(n.p, hit.n), 1, -2 * k)); n.v *= 0.85; ev.push({ type: 'bank', nut: n, p: n.p });
            if (hit.w.hp) { s.dmg[hit.w.id] = (s.dmg[hit.w.id] || 0) + 1; n.v *= 0.3; const left = hit.w.hp - s.dmg[hit.w.id]; ev.push({ type: left > 0 ? 'crack' : 'break', w: hit.w, left, p: n.p }); }
        } else if (floorAt(s, q) > n.h + 0.05) {     // (the side of a ledge, a post, a block or a wall top: it bounces off like a wall)
            const fn = _floorN(s, q, n.h) || n.d.map(x => -x), k = dot(n.d, fn); if (k < 0) n.d = tangent(n.p, mix(n.d, fn, 1, -2 * k)); else n.d = tangent(n.p, n.d.map(x => -x)); n.v *= 0.85; ev.push({ type: 'bank', nut: n, p: n.p });
        }
        else { n.d = tangent(q, n.d); n.p = q; }
        n.vh -= G * dt; n.h += n.vh * dt;
        for (const tg of s.lv.targets || []) {
            const ta = targetAt(s, tg), gs = gatesOf(tg);
            if (gs.every(g => s.open[g]) || (tg.tall ? dist(n.p, ta.p) > HIT_R || Math.abs(n.h - ta.h) > tg.tall : Math.hypot(dist(n.p, ta.p), n.h - ta.h) > HIT_R)) continue;
            for (const g of gs) { s.open[g] = tg.secs || true; s.stuckIn[g] = n.id; }             // (a timed bullseye opens its gate for tg.secs, then drops the coconut)
            n.state = 'stuck'; n.tg = tg; n.p = ta.p.slice(); n.h = ta.h; ev.push({ type: 'target', target: tg, nut: n, secs: tg.secs || 0 }); return;
        }
        for (const hn of s.nuts) if (hn.state === 'hang' && Math.hypot(dist(n.p, hn.p), n.h - hn.h) < 0.7) {    // a hanging coconut, knocked loose: it drops
            hn.state = 'fly'; hn.v = 0.2; hn.vh = 0; hn.d = tangent(hn.p, n.d); hn.age = 0; n.v *= 0.4; n.vh = Math.min(n.vh, -1); ev.push({ type: 'knock', nut: hn, p: hn.p, h: hn.h });
        }
        const g = s.gull;
        if (g && g.state !== 'stun' && Math.hypot(dist(n.p, g.p), n.h - (g.h + 0.4)) < GULL.hit + 0.1) { _stun(s, ev, 'nut'); n.vh = Math.min(n.vh, -2); n.v *= 0.3; }
        const fl = floorAt(s, n.p);
        const pad = n.vh < 0 && (s.lv.pads || []).find(k => dist(n.p, k.p) < k.r);
        if (pad && n.h <= PAD_H + 0.05) {
            n.h = PAD_H;
            if (pad.to) {          // an aimed pad (a launch pad): whatever lands on it is thrown onto pad.to, whatever way it came in
                const Tf = 1.0, dh = floorAt(s, pad.to) - PAD_H; n.d = toward(n.p, pad.to); n.v = dist(n.p, pad.to) / Tf; n.vh = (dh + 0.5 * G * Tf * Tf) / Tf;
            } else { n.vh = PAD_NUT_V; n.v *= 0.8; }
            ev.push({ type: 'pad', nut: n, p: n.p }); return;
        }
        if (n.h <= fl) {
            n.h = fl;
            if (s.boss && dist(n.p, TOP) < 1.95) n.p = at(BOSS.pileAt, lonOf(n.p));       // (never left inside the fence, out of reach)
            const dr = (s.lv.drains || []).find(x => dist(n.p, x.p) < x.r) || (s.lv.pools || []).find(x => dist(n.p, x.p) < x.r); if (dr) { n.p = dr.to.slice(); n.h = floorAt(s, n.p); }     // (a place no crab can reach: it rolls out to where one can)
            const ur = urchinAt(s, n.p); if (ur && !ur.nutSafe) return _lose(s, n, ev, 'urchin');
            const cw = fl < 0.05 && currentAt(s, n.p); if (cw && cw.deep) return _lose(s, n, ev, 'sink');      // (deep water: it sinks, and washes up under the palm)
            const dv = (s.lv.vents || []).find(x => x.drop && !s.plug[x.id] && dist(x.p, n.p) < x.r + 0.2 && Math.abs(fl - floorAt(s, x.p)) < 0.4);
            if (dv) { n.state = 'plug'; n.p = dv.p.slice(); n.h = 0; s.plug[dv.id] = n.id; ev.push({ type: 'plug', vent: dv, nut: n, now: blowing(s) }); return; }
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
    if (_blocked(s, n.p, q, 0, true)) n.still += dt; else { n.p = q; n.still = 0; }
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
    const dc = dist(g.p, c.p), cTop = dist(c.p, TOP), zone = lv.zone || [5.7, 9.1], onShelf = cTop < zone[1] && cTop > zone[0];
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

    // The floating logs drift on; a crab standing on one goes with it.
    if (lv.logs) {
        const was = s.logs, now = _logsAt(lv, s.t);
        const on = !c.air && was.findIndex(l => dist(c.p, l.p) < l.r && Math.abs(c.h - l.h) < 0.06);
        s.logs = now;
        if (on !== false && on >= 0) { const dl = lonOf(now[on].p) - lonOf(was[on].p); c.p = at(dist(c.p, TOP), lonOf(c.p) + dl); c.f = tangent(c.p, c.f); c.face = tangent(c.p, c.face); }
    }
    // Timed gates run down; when one shuts, its bullseye drops the coconut at its foot.
    for (const g of Object.keys(s.open)) if (typeof s.open[g] === 'number') {
        s.open[g] -= dt;
        if (s.open[g] <= 0) { delete s.open[g]; const n = s.nuts.find(x => x.id === s.stuckIn[g]); if (n) { n.state = 'rest'; n.h = floorAt(s, n.p); n.age = 9; } ev.push({ type: 'timeout', gate: g }); }
    }
    // Walk (in the air too). In a current the crab wades slowly and is carried along.
    c.climb = false;
    const cu = !c.air && floorAt(s, c.p) < 0.05 ? currentAt(s, c.p) : null;
    const m = Math.min(1, Math.hypot(stick.x, stick.y));
    c.moving = m > 0.12;
    const move = (q, walking) => {
        const w = _blocked(s, c.p, q, c.h), fq = floorAt(s, q);
        if (!w && fq - c.h <= STEP_UP) { c.p = q; c.f = tangent(q, c.f); c.face = tangent(q, c.face); return true; }
        if (!walking) return false;
        // a vine on the wall: climb it, with empty claws
        const wall = w ? w.w : fq - c.h > STEP_UP ? (lv.rings || []).find(r => r.top && up(s, r) && Math.abs(dist(q, r.c || TOP) - r.r) < TOP_W && covers(r, q)) : null;
        if (wall && wall.vine && covers({ c: wall.c, only: wall.vine }, q)) {
            if (c.nuts > 0) { if (!s.vineSaid) { s.vineSaid = true; ev.push({ type: 'vine-full' }); } return false; }
            if (!c.climbing) ev.push({ type: 'climb' });
            c.climb = c.climbing = true; c.air = false; c.vh = 0; c.h = Math.min(wall.h + 0.02, c.h + CLIMB_V * dt); return false;
        }
        // a block: push it along, if there's room where it would go
        const b = !w && !c.air && s.blocks.find(x => dist(q, x.p) < x.r && x.h - c.h > STEP_UP);
        if (b) {
            const nb = walk(b.p, tangent(b.p, toward(c.p, q)), angle(c.p, q) * PUSH_K);
            const bh = b.h; b.h = 0; const flat = floorAt(s, nb) <= floorAt(s, b.p) + 0.01; b.h = bh;
            const free = flat && !_blocked(s, b.p, nb, 0) && !s.blocks.some(x => x !== b && dist(x.p, nb) < x.r + b.r) && !currentAt(s, nb);
            if (free) { b.p = nb; if (!s.pushSaid) { s.pushSaid = true; ev.push({ type: 'push', block: b }); } }
        }
        return false;
    };
    if (c.moving) {
        const right = cross(c.f, c.p), d = norm(mix(right, c.f, stick.x, stick.y));
        c.face = tangent(c.p, d);
        move(walk(c.p, d, (SPEED * (cu ? WADE : 1) * m * dt) / R), true);
    }
    if (cu) move(walk(c.p, cu.d, (cu.speed * dt) / R));          // (the eddy by the cove is for coconuts: a crab is only ever swept past it)
    c.wet = !!cu;
    for (const n of s.nuts.slice()) _nut(s, n, dt, ev);

    // The ground under the crab: walk up onto a rock, or off its edge and fall.
    if (!c.climb) c.climbing = false;
    if (!c.air && !c.climb && (lv.pads || []).some(k => dist(c.p, k.p) < k.r)) { c.h = PAD_H; c.air = true; c.vh = PAD_CRAB_V; ev.push({ type: 'pad', p: c.p }); }      // (a jelly pad throws a crab up as soon as it steps on)
    if (!c.air && !c.climb) {
        const f = floorAt(s, c.p);
        if (c.h < f && f - c.h <= STEP_UP) c.h = f; else if (c.h > f + 1e-6) { c.air = true; c.vh = 0; }
        if (!c.air) c.coy = COYOTE_S;
    } else c.coy = Math.max(0, c.coy - dt);

    // A vent that is blowing lifts a crab standing in it, high.
    const v = blowing(s);
    if (v && v.lift && dist(c.p, v.p) < v.r && c.h < v.lift && c.h > floorAt(s, v.p) - 0.3) {
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
            else if (c.h <= fl && (s.lv.pads || []).some(k => dist(c.p, k.p) < k.r)) { c.h = fl; c.vh = PAD_CRAB_V; ev.push({ type: 'pad', p: c.p }); }
            else if (c.h <= fl) { c.h = fl; c.vh = 0; c.air = false; c.lifted = false; ev.push({ type: 'land', onRock: fl > 0 }); if (c.jbuf > 0) jump(s); }
        }
    }

    // Standing on a lift vent that is not the one blowing: say so, once.
    const stand = (lv.vents || []).find(x => x.lift && dist(c.p, x.p) < x.r);
    if (stand && stand !== v && !c.air) { if (s.calm !== stand.id) { s.calm = stand.id; ev.push({ type: 'calm', vent: stand, blowing: v }); } } else if (!stand) s.calm = null;
    // Urchins; deep water.
    if (c.h < 0.7 && urchinAt(s, c.p, 0.15)) { _reset(s, ev, 'ouch'); return ev; }
    if (!c.air && (lv.pools || []).some(q => dist(c.p, q.p) < q.r) && c.h < floorAt(s, c.p) + 0.05) { _reset(s, ev, 'sink'); return ev; }      // (a deep pool)
    if (!c.air && c.h < 0.05) { const dw = currentAt(s, c.p); if (dw && dw.deep) { _reset(s, ev, 'sink'); return ev; } }
    // Golden shells: touch one (at its height) to take it.
    (lv.gold || []).forEach((g, i) => { if (!s.gold.includes(i) && dist(c.p, g.p) < 0.75 && Math.abs(c.h - (g.h || 0)) < 0.9) { s.gold.push(i); ev.push({ type: 'gold', i, p: g.p, h: g.h || 0 }); } });
    // A coconut lying inside a shut gate the crab is outside of is out of reach: it rolls out to the gate's foot.
    for (const n of s.nuts) if (n.state === 'rest') for (const w of lv.rings || []) {
        if (!w.gate || !up(s, w)) continue;
        const c0 = w.c || TOP;
        if (dist(n.p, c0) < w.r && dist(c.p, c0) > w.r && covers(w, n.p)) { n.p = around(c0, w.r + 0.7, lonOf(n.p, c0)); n.h = floorAt(s, n.p); ev.push({ type: 'nudge', nut: n }); }
    }
    for (const n of s.nuts) if (n.state === 'stuck' && n.tg && n.tg.log != null) { const ta = targetAt(s, n.tg); n.p = ta.p.slice(); n.h = ta.h; }
    // Taking a coconut back out of a bullseye: walk into it. Its gate shuts again.
    if (c.nuts < CARRY) {
        const n = s.nuts.find(x => x.state === 'stuck' && x.tg && dist(x.p, c.p) < 0.7 && c.h > x.h - 1.6 && c.h < x.h + 0.6);
        if (n) { for (const g of gatesOf(n.tg)) if (s.stuckIn[g] === n.id) { delete s.open[g]; delete s.stuckIn[g]; } s.nuts.splice(s.nuts.indexOf(n), 1); c.nuts++; ev.push({ type: 'unstick', nut: n, target: n.tg }); }
    }
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
        const ph = floorAt(s, pl.p), on = (!c.air && dist(c.p, pl.p) < pl.r && Math.abs(c.h - ph) < 0.3) || s.nuts.some(n => n.state === 'rest' && dist(n.p, pl.p) < pl.r && Math.abs(n.h - ph) < 0.3);
        const gs = gatesOf(pl);
        if (on !== !!s.held[gs[0]]) { for (const g of gs) s.held[g] = on; ev.push({ type: on ? 'press' : 'release', plate: pl }); }
    }
    lv.checks.forEach((p, i) => { const z = lv.zones && lv.zones[i], dT = dist(c.p, TOP); if (i > s.cp && !c.air && (dist(c.p, p) < CHECK_R || (z && dT > z[0] && dT < z[1]))) { s.cp = i; ev.push({ type: 'check', i, p }); } });
    if (!c.air && dist(c.p, lv.goal) < GOAL_R && (!s.boss || s.boss.state === 'down')) { s.won = true; ev.push({ type: 'won', t: s.t, falls: s.falls }); }
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
    // touching him is a hit, the same as a slam
    b.touchCd = Math.max(0, b.touchCd - dt);
    if (b.touchCd <= 0 && dist(c.p, TOP) < BOSS.touch && c.h < 1.2) { b.touchCd = 1; c.p = at(2.6, lonOf(c.p)); c.f = tangent(c.p, c.f); c.face = tangent(c.p, c.face); c.vh = 5; c.air = true; s.falls++; ev.push({ type: 'ink-ouch', touch: true }); }
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
    }
    else if (b.state === 'hurt') { if (b.t >= BOSS.hurt) { b.state = 'idle'; b.t = 0; b.n = 0; _pile(s, ev, Math.max(0, BOSS.piles - s.nuts.filter(n => n.state === 'rest').length)); } }
}

/** Turn the camera (and so what 'up the screen' means) round the crab by a radians. */
export function turnView(s, a) {
    const c = s.crab;
    c.f = tangent(c.p, mix(c.f, cross(c.p, c.f), Math.cos(a), Math.sin(a)));
}
