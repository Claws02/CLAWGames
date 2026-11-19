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
import * as LG from './LakeGrid.js';

export const R = 6.5, SPEED = 4.2, G = 18, TRAVEL_S = 2.2;      // TRAVEL_S: how long a flight between the planet and its moon takes
/** Gravity where the crab is: a moon can have less (`gravity: 0.5`), so jumps go higher and coconuts fly further. */
const gOf = s => G * ((s.lv && s.lv.gravity) || 1);
export const JUMP_V = 6.84, BOUNCE_V = 9.67;             // apex 1.3 and 2.6 above where you left
export const CARRY = 3, PICK_R = 0.6, PICK_AGE = 0.8;    // coconuts carried; how near picks one up; how soon after a throw
export const NUT_R = 0.6, NUT_TOP = 0.45, ROCK_H = 0.45;      // ROCK_H: how high a stepping rock stands, so a crab on one is that high
export const TRICK_R = 0.85, TRICK_GAP = 1.1, HIT_R = 0.8, GOAL_R = 0.9, CHECK_R = 1;
export const PAD_NUT_V = 12.5, PAD_CRAB_V = 10, PAD_H = 0.25;   // a jelly pad: how hard it throws a coconut (and a crab) up, and how high it stands
export const CRUMBLE_S = 0.8, TILE_BACK_S = 4, SLIDE_V = 6;
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
//       · the bank shot: a painted spot, a pink bumper in a deep pool, a bullseye in an alcove that faces only the bumper
//       · a ramp up to the mesa; the green fence round the mesa (the bullseye holds it open)
//       · a pillar (9 high) with a plate on top, a coconut hanging over it from the mesa's palm
//   the mesa (7.5 high), the pearl inside the gold fence (the plate holds it open)               0 – 4.6
// THE ANSWER. Throw a coconut onto the jelly pad: it bounces up onto the shelf and into vent A, so B blows. Ride B over the river
// onto the terrace. From the painted spot, bank a coconut off the pink bumper into the bullseye: the green fence drops. Up the
// ramp to the mesa; put a coconut on the pillar's plate (lob one, or knock the hanging one down onto it): the gold fence drops.
// The bank shot: stand on the painted spot (SPOT), throw at the pink bumper (BUMP) standing in a deep pool, and it glances off into
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
    hints: ['Vent A is up on the rock shelf, too high to throw to. The jelly pad in front has an arrow: whatever lands on it is thrown that way.', 'With A plugged, vent B blows: ride it over the river and steer onto the terrace.', 'The bank shot: stand on the painted spot, and throw at the pink bumper in the pool. It bounces the coconut into the bullseye (follow the green dots). The aim turns green when it will hit.', 'Up on the mesa, the plate is on top of the pillar. Lob a coconut onto it, or knock the hanging coconut down.', 'Golden shells: on the post by the beach (bounce on the jelly), in the cage (hit the bullseye on the log), over the river (steer through it riding vent B).'],
    ground: [[4.6, 'stone'], [9.6, 'grass'], [10, 'sand'], [12.5, 'sea'], [99, 'sand']],
    checks: [at(18.4, 0), at(8.6, 0)], zones: { 1: [4.7, 9.5] },
    ledges: [
        { r0: 0, r1: 4.6, h: 7.5, kind: 'mesa' }, { r0: 4.6, r1: 9.6, h: 3.8, kind: 'terrace' },
        { r0: 4.6, r1: 6.4, only: [180, 7], h: 7.5, h1: 3.8, kind: 'ramp' },
        { r0: 13.5, r1: 15.1, only: [60, 8], h: 3, kind: 'shelf' },
    ],
    rings: [
        { r: 4.4, h: 20, gate: 'green', kind: 'gate' }, { r: 1.8, h: 20, gate: 'gold', kind: 'gate' },       // (the green fence runs round the whole mesa)
        { c: ALCOVE, r: 0.9, h: 7, gap: [lonOf(BUMP, ALCOVE), 26], kind: 'cove', look: 'glass' },      // (glass: you see the bullseye, but can't throw through)
        { c: at(16, -100), r: 0.9, h: 9, gate: 'cage', kind: 'gate' },
    ],
    bars: [{ a: BUMP_A, b: BUMP_B, h: 7, kind: 'bumper' }, ...CHUTE.map(([a, b]) => ({ a, b, h: 7, kind: 'chute', look: 'glass' }))],
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
    signs: [{ p: walk(SPOT, tangent(SPOT, toward(SPOT, BUMP)), -1.3 / R), kind: 'bank', look: walk(SPOT, tangent(SPOT, toward(SPOT, BUMP)), -4 / R) }, { p: at(17.4, 40), kind: 'vent', look: at(18.4, 0) }],
};

// 3. THE GULL'S ROOST: Old Ink paid his gull with the pearl, and it keeps it in its nest on a sea stack behind an old fishing village.
//   the beach (start, the palm, Old Ink's note)                                        d > 13
//       · a fishing hut with a bullseye on it: it raises the village's net gate         13
//   the lower boardwalk, on stilts (1 high), fishing huts (a golden shell on a roof)     8.6 – 12.8   (a ramp up from the beach)
//   the upper deck (3.2 high: out of a jump's reach): the gull walks it, a stolen coconut in its beak            4.6 – 8.6
//       · the heavy plate: only the gull is heavy enough. It lowers the drawbridge (and it stays down 8 s after the gull flies off)
//       · the crow's-nest mast (a golden shell on top)
//   the moat: deep water (in it: back to the flag)                                        2.6 – 4.6
//   the drawbridge, from the deck up to the roost, at lon 0
//   the roost (5 high): the nest of stolen coconuts and the pearl, in a fence a coconut on the plate drops      0 – 2.6
// THE ANSWER. A coconut into the hut's bullseye: the net gate rises. Up the ramp. The gull won't dive while it holds its stolen coconut:
// hit it with a coconut (from the boardwalk) and it drops it on the deck. Now it dives at you: step aside as it comes down by the deck,
// and jump on its back: up onto the deck (a coconut to bounce on works too, but stays behind). Pick up the dropped coconut. Stand on the
// heavy plate till the gull dives, step aside: it lands on the plate and the drawbridge comes down. Across, up to the roost: a coconut
// on the nest's plate drops the fence: the pearl.
export const YARD = {
    id: 'yard', name: 'THE GULL\'S ROOST', world: 1, fast: 90, pay: 15, start: at(18.4, 0), goal: TOP, palm: at(17.7, -42), bank: 13,
    story: 'Old Ink paid his gull with the pearl. It keeps it in its nest up on the sea stack, past the old fishing village.',
    hints: ['A coconut in the bullseye on the fishing hut raises the net gate.', 'The gull won\'t dive while it has a stolen coconut in its beak. Hit it with one: it drops it.', 'When it dives, step aside, then jump on its back as it lands: it bounces you up onto the deck.', 'The heavy plate is too heavy for a crab. Stand on it, and step off as the gull dives: it lands on the plate and the drawbridge comes down.', 'Golden shells: on a hut roof (bounce on a coconut), up the crow\'s-nest mast (bounce on the gull), and round the back of the roost.'],
    ground: [[2.6, 'rock'], [4.6, 'sea'], [12.8, 'sea'], [99, 'sand']],
    checks: [at(18.4, 0), at(6.4, 30)], zones: { 1: [4.7, 8.5] },
    ledges: [
        { r0: 0, r1: 2.6, h: 5, kind: 'stack' },
        { r0: 4.6, r1: 8.6, h: 3.2, kind: 'boardwalk' }, { r0: 8.6, r1: 12.8, h: 1, kind: 'boardwalk' },
        { r0: 12.8, r1: 14.4, only: [0, 7], h: 1, h1: 0, kind: 'boardwalkRamp' },
        { r0: 2.1, r1: 4.8, only: [0, 5], h: 5, h1: 3.2, gate: 'bridge', kind: 'bridge' },
    ],
    rings: [{ r: 13.0, h: 9, gate: 'net', kind: 'gate' }, { r: 1.4, h: 9, gate: 'nest', kind: 'gate' }],
    currents: [{ r0: 2.6, r1: 4.6, only: [0, 180], speed: 0.8, deep: true }],
    posts: [{ p: at(10.8, -60), r: 0.75, h: 2.6, kind: 'hut' }, { p: at(10.6, 70), r: 0.75, h: 2.6, kind: 'hut' }, { p: at(14.2, 30), r: 0.7, h: 1.6, kind: 'hut' }, { p: at(7.8, 180), r: 0.32, h: 5.2, kind: 'mast' }],
    plates: [{ p: at(6.0, 16), r: 0.9, gate: 'bridge', heavy: true, secs: 8 }, { p: at(2.0, 70), r: 0.5, gate: 'nest' }],
    targets: [{ p: walk(at(14.2, 30), tangent(at(14.2, 30), at(18.4, 0)), 0.85 / R), gate: 'net' }],
    gull: { ring: 6.6, from: 90, zone: [4.7, 12.7], loot: 1 },
    nest: true,
    gold: [{ p: at(10.8, -60), h: 2.6 }, { p: at(7.8, 180), h: 5.2 }, { p: at(2.0, 200), h: 5 }],
    signs: [{ p: at(17.4, -16), kind: 'note', look: at(18.6, 0) }, { p: at(16.0, 46), kind: 'bullseye', look: at(18.4, 0) },
        { p: at(11.6, 18), kind: 'stun', look: at(13.6, 0) }, { p: at(9.1, -14), kind: 'gullback', look: at(11, 0) },
        { p: at(6.4, 30), kind: 'heavy', look: at(7.4, 0) }, { p: at(2.1, 30), kind: 'nest', look: at(2.6, 0) }],
};

// ── World 2: the coral caves ────────────────────────────────────────────────
// Old Ink fled deeper with the pearl. Each chamber teaches one new thing (holes through the planet, a moon, the tide), then he waits.

// 5. SINKHOLE REEF: holes straight through the planet. The beach is the far side of the planet from the pearl, so the pearl is
// right under your feet: a hole goes down here and comes up over there, still going the same way (a coconut keeps flying).
//   the beach: the start, the palm                                    d > 7
//       · the big sinkhole, under a crystal lid (the bullseye opens it): it comes up inside the reef wall, by the pearl
//       · a blowhole (a grate: coconuts only) that comes up inside the reef wall, flying on toward the lid's bullseye
//       · a blowhole that comes up in a walled pit, on its plate
//   the reef wall, all the way round (nothing climbs it)               6.8
//   inside: the lid's bullseye, the pit with a low wall (its plate holds the gold fence), a sinkhole back out, the gold fence and the pearl
// THE ANSWER. Throw a coconut into the blowhole from its painted spot: it shoots up inside the reef wall into the bullseye, and the
// lid opens. Jump in the big sinkhole: out you come by the pearl. Lob a coconut over the pit's low wall onto its plate (or, from the
// beach, throw one into the pit's blowhole: it comes up on the plate): the gold fence drops.
const PIR = Math.PI * R, anti = (d, lon) => at(PIR - d, lon + 180);
const PITC = at(4.2, 90), H_MAIN = at(16.8, 0), H_THROW = at(15.4, 60), LIDT = at(6.0, -120), THROWSPOT = at(18.4, 60);
export const SINK = {
    id: 'sink', name: 'SINKHOLE REEF', world: 2, theme: 'reef', fast: 90, pay: 25, start: at(18.6, -20), goal: TOP, palm: at(17.4, -60), bank: 7,
    story: 'Old Ink fled deep into the coral caves. Here the pearl is right under your feet: through the planet.',
    hints: ['A sinkhole goes straight through the planet and comes up on the far side, by the pearl. This one is shut by a crystal lid.', 'Blowholes (the grates) only take coconuts. A coconut thrown in comes out of the far side still flying the same way.', 'Stand on the painted spot and throw into the blowhole: it flies up into the bullseye on the far side. The aim turns green when it will.', 'The plate in the walled pit holds the gold fence open: lob a coconut over the pit\'s low wall (the aim turns green), or throw one into the other blowhole on the beach: it comes up right on the plate.', 'Golden shells: over the far end of the sinkhole (jump in from up high and you fly out higher), on the coral post (bounce off the jelly), and over the pit\'s blowhole.'],
    ground: [[1.8, 'dais'], [6.8, 'stone'], [99, 'sand']],
    checks: [at(18.6, -20), at(3.4, 175)], zones: { 1: [1.9, 6.7] },
    rings: [
        { r: 6.8, h: 20, kind: 'coral' }, { c: PITC, r: 1.0, h: 1.6, kind: 'coralLow' }, { r: 1.8, h: 20, gate: 'gold', kind: 'gate' },
    ],
    holes: [
        { p: H_MAIN, r: 0.75, lid: 'lid' },
        { p: H_THROW, r: 0.8, nutOnly: true },
        { p: anti(4.2, 90), r: 0.8, nutOnly: true },
        { p: at(5.6, 10), r: 0.7 },            // (a way back out to the beach, so nobody is ever stuck inside)
    ],
    ledges: [{ r0: 15.3, r1: 16.0, only: [0, 7], h: 2, kind: 'coralShelf' }],
    posts: [{ p: at(12.5, -100), r: 0.5, h: 3 }],
    pads: [{ p: at(13.5, -100), r: 0.7 }],
    plates: [{ p: PITC, r: 0.6, gate: 'gold' }],
    targets: [{ p: LIDT, gate: 'lid', tall: 1.0 }],
    spots: [{ p: THROWSPOT, via: H_THROW, gate: 'lid' }],
    drains: [{ p: PITC, r: 0.9, to: PITC }, { p: TOP, r: 6.8, to: THROWSPOT, unless: 'lid' }],
    gold: [{ p: anti(16.8, 0), h: 2.8 }, { p: at(12.5, -100), h: 3 }, { p: anti(4.2, 90), h: 2.2 }],
};

// 6. MOON POOL: a little moon, and a launch pad to it. Gates are shared between the two worlds, and the moon's gravity is half
// the planet's (you jump twice as high; coconuts fly further).
//   the planet: the start, the palm, the launch pad; the pearl inside the gold fence, inside a ring of coral          (d > 7)
//   the moon: a landing place, the pad home; a crater with a 2.2 rim (nothing a crab clears on the planet, an easy hop here)
//       inside the crater: the plate that holds the gold fence on the planet
// THE ANSWER. Pick up the coconuts and step on the launch pad. On the moon, hop over the crater's rim and put a coconut on the plate:
// the gold fence back on the planet drops. Take the pad home; the pearl.
const MOON = {
    id: 'moon-of-pool', name: 'THE MOON', theme: 'moon', gravity: 0.5, goal: null, face: TOP, bank: 99, arriveCp: 0,
    checks: [at(17.4, 20)],
    rings: [{ r: 6, h: 2.2, kind: 'crater' }],
    launch: [{ p: at(16.2, -30), r: 0.85, to: 'home', land: at(15.2, 30) }],
    plates: [{ p: at(3.4, 0), r: 0.9, gate: 'gold' }],
    posts: [{ p: at(10.5, 120), r: 0.6, h: 4.6 }],
    gold: [{ p: at(10.5, 120), h: 4.6 }, { p: at(6, 200), h: 4.2 }],
};
export const MOONPOOL = {
    id: 'pool', name: 'MOON POOL', world: 2, theme: 'reef', fast: 75, pay: 25, start: at(18.4, 0), goal: TOP, palm: at(17.6, -40), bank: 7, arriveCp: 1,
    story: 'A little moon hangs over this reef. A launch pad flies you there, and what you do up there changes things down here.',
    hints: ['Step on the launch pad to fly to the moon. Whatever is in your claws comes too.', 'The moon\'s gravity is weak: you jump twice as high there.', 'Inside the moon\'s crater, a coconut on the plate holds the gold fence open, back on the planet.', 'Take the pad on the moon to come home. A coconut thrown onto a launch pad flies over on its own.', 'Golden shells: on the moon\'s pillar (bounce on a coconut up there), floating over the far rim of the crater (a moon jump), and on the coral post here (bounce off the jelly).'],
    ground: [[1.8, 'dais'], [5, 'stone'], [99, 'sand']],
    checks: [at(18.4, 0), at(15.2, 30)],
    rings: [{ r: 5, h: 20, gap: [180, 12], kind: 'coral' }, { r: 1.8, h: 20, gate: 'gold', kind: 'gate', remote: 'moon' }],
    launch: [{ p: at(15.4, 0), r: 0.85, to: 'moon', land: at(17.4, 20) }],
    posts: [{ p: at(13.2, 110), r: 0.5, h: 3 }],
    pads: [{ p: at(14.2, 110), r: 0.7 }],
    gold: [{ p: at(13.2, 110), h: 3 }],
    moon: MOON,
};

// 7. LOW TIDE: a lagoon that floods and drains on a clock.
//   the beach (dry: the tide never reaches it): the start, the palm                      d > 15
//   the lagoon: sand for 9 s, then the tide comes in (4 s), 2.4 deep for 7 s, and goes out (4 s)     4.4 – 15
//       · rafts: they sit on the sand when the tide is out and float up with it
//       · the lighthouse rock (2.8 high) with a plate on top: no throw from the sand reaches it; from a raft at high tide one does
//       · the golden shells: one on the sand far out (only there at low tide), one on the tall rock (jump from a raft at high tide)
//   the mesa (4 high): too high from the sand, a jump from a raft at high tide; the pearl inside the gold fence (the plate holds it)
// THE ANSWER. At low tide, walk out to a raft by the mesa with the coconuts. The tide comes in and lifts it. At high tide, lob a coconut
// onto the lighthouse rock's plate (the gold fence drops), and jump from the raft onto the mesa: the pearl.
export const TIDE = {
    id: 'tide', name: 'LOW TIDE', world: 2, theme: 'reef', fast: 90, pay: 25, start: at(18.4, 0), goal: TOP, palm: at(17.6, -40), bank: 7,
    story: 'Here the sea comes and goes, and the beach floats on it: your island rises with the tide. What the water covers, it carries off.',
    hints: ['The lagoon floods and drains on a clock. Caught on the sand when the water comes in, you\'re swept back to your flag.', 'Rafts sit on the sand at low tide and float up with the water. Stand on one and let the tide lift you.', 'The plate is on top of the lighthouse rock, too high to throw to from the sand. From a raft at high tide, it isn\'t.', 'The mesa is too high to jump onto from the sand. From a raft at high tide, it isn\'t.', 'Golden shells: on the sand far out (it\'s under water at high tide: be quick), on the tall rock (a jump from a raft at high tide), and on the coral post out on the sand (the jelly, at low tide).'],
    ground: [[1.8, 'dais'], [4.4, 'stone'], [15, 'rock'], [99, 'sand']],
    checks: [at(18.4, 0)],
    tide: { r0: 4.4, r1: 15, high: 2.4, out: 9, rise: 4, in: 7, fall: 4 },
    ledges: [{ r0: 0, r1: 4.4, h: 4, kind: 'mesa' }, { r0: 15, r1: 21, h: 0.3, kind: 'beachShelf', ride: true }],
    rings: [{ r: 1.8, h: 20, gate: 'gold', kind: 'gate' }],
    posts: [{ p: at(6.2, 85), r: 0.8, h: 2.8, kind: 'lighthouse' }, { p: at(11, -110), r: 0.6, h: 3.6 }, { p: at(12.6, 125), r: 0.5, h: 3 }],
    pads: [{ p: at(13.6, 125), r: 0.7 }],
    rafts: [{ p: at(5.4, 20), r: 0.9 }, { p: at(10.6, 50), r: 0.9 }, { p: at(10.4, -95), r: 0.9 }],
    plates: [{ p: at(6.2, 85), r: 0.75, gate: 'gold' }],
    gold: [{ p: at(13.6, 160), h: 0 }, { p: at(11, -110), h: 3.6 }, { p: at(12.6, 125), h: 3 }],
};

// 8. INK'S DEEP: Old Ink's second lair, World 2's boss. Two timed hazards on the way, then a harder fight.
//   the beach: the start, the palm                                                    d > 15
//   the chasm (4.5 wide, bottomless): five crumbling tiles across it at lon 0          10.5 – 15
//   the steam corridor: between two coral walls, in at lon 0, out at lon 180; steam jets along it, each warning then firing
//   the arena: Old Ink on the pearl; he wakes as you come in. Four hits, faster slams, and steam jets round the arena while he's up
// THE ANSWER. Cross the tiles without stopping. Wait out each jet's burst and dash past (either way round the corridor). In the arena,
// dodge the slam and the jets, throw at his head in the moment after each slam (piles of coconuts keep coming), four times; the pearl.
const CORR = (lon, d = 9) => at(d, lon);
export const DEEP = {
    id: 'deep', name: "INK'S DEEP", world: 2, theme: 'deep', boss: { hits: 4, speed: 0.8, arena: 5.5 }, fast: 150, pay: 50, start: at(18.4, 0), goal: TOP, palm: at(17.6, -40), bank: 7,
    story: 'Old Ink is down here with the pearl. The way in crumbles under you, and the deep breathes steam.',
    hints: ['The tiles over the chasm crack the moment you step on them and fall away a moment later. Don\'t stop.', 'Each steam jet bubbles before it fires. Wait for the burst, then dash past.', 'Old Ink slams where you stand: step out of the red ring or jump. Just after a slam, his head is open: throw!', 'Four hits this time, and he slams faster. Watch the jets round the arena while he\'s up.', 'Golden shells: by the inner wall of the corridor, on the side tile in the chasm, and over the arena (a bounce on a coconut).'],
    ground: [[1.8, 'dais'], [7.3, 'stone'], [10.5, 'rock'], [15, 'sea'], [99, 'sand']],
    checks: [at(18.4, 0), at(9.0, 0), at(7.0, 180)], zones: { 1: [7.4, 10.4] },
    chasm: { r0: 10.5, r1: 15 },
    crumbles: [14.45, 13.55, 12.65, 11.75, 10.95].map(d => ({ p: at(d, 0), r: 0.6 })).concat([{ p: at(12.9, 25), r: 0.62 }]),
    rings: [{ r: 10.6, h: 20, gap: [0, 8], kind: 'coral' }, { r: 7.3, h: 20, gap: [180, 9], kind: 'coral' }],
    jets: [...[25, 50, 75, 100, 125, 150].map((lon, i) => ({ p: CORR(lon), r: 0.8, period: 3, on: 1.0, phase: i * 0.9 })), ...[-25, -50, -75, -100, -125, -150].map((lon, i) => ({ p: CORR(lon), r: 0.8, period: 2.6, on: 1.0, phase: i * 0.7 })),
        ...[0, 60, 120, 180, 240, 300].map((lon, i) => ({ p: at(4.6, lon), r: 0.75, period: 3.4, on: 0.9, phase: i * 0.55, boss: true }))],
    gold: [{ p: CORR(90, 8.0), h: 0 }, { p: at(12.9, 25), h: 0 }, { p: at(3.4, 90), h: 2.6 }],
};

// ── World 3: the volcano ────────────────────────────────────────────────────
// Old Ink's ally, the Hermit King, keeps the pearl in his volcano. Sliding obsidian, heavy stones, cannons, and lava that rises.

// 9. OBSIDIAN SLIDE: the volcano's crater, and down its side a lake of glassy obsidian, in three steps, over the lava.
// On the obsidian you can't walk (or jump): you slide in a straight line until something stops you. Its rules are in LakeGrid.js.
//
//   the rim (start, the palm)                        top, level with the lake's top step               d > 15.5
//   the lake: 9 rows x 9 columns, row 0 by the pearl  three steps down: rows 6-8, 3-5, 0-2              7 – 15
//       · a block on the top step: push it and it slides on, down the steps, to wherever it stops
//       · a ramp: the one way back up a step (slide at it)
//       · cracked glass: stop on it once and it cracks; twice and it breaks (lava)
//       · the yellow plate: a coconut resting on it opens the gate on the bridge
//   the bridge (off the bottom step at column 4) to the pearl                                          5 – 6.5
//
// The way (proven by a search in qa, 15 moves): in at column 5, bump the block; push it: down the steps it goes, to stop by the
// bridge. Round and down to the cracked cell under the plate (by the ramp), throw a coconut onto the plate, then round to the block
// and up the bridge.
const LAKE = { rows: 9, cols: 9, r0: 7, dd: 1, lon0: -40, dl: 10, exit: 4, levels: [0, 0, 0, 1, 1, 1, 2, 2, 2], hs: [0.3, 1.2, 2.1], lava: { r0: 5.2, r1: 15.5 },
    pillars: [[0, 5], [0, 2], [0, 1], [2, 4], [8, 4], [3, 6], [2, 0], [3, 0], [8, 7], [5, 3], [4, 1], [6, 7], [3, 3], [5, 1], [6, 0], [1, 6]],
    blocks: [[7, 5]], cracks: [[3, 2], [7, 3], [6, 8]], ramps: [[3, 1], [6, 6]], plates: [[1, 2]], nuts: [[4, 2]] };      // (the ramp at 6,6 is the way back up to the rim from the middle step)
const RIM_H = LAKE.hs[2];
// The lake's steps as ledges (a ramp cell slopes from the step below up to its own), the rim, and the bridge.
function _lakeLedges(z) {
    const out = [], lonOf = c => z.lon0 + c * z.dl;
    for (let r = 0; r < z.rows; r++) {
        const d0 = z.r0 + (r - 0.5) * z.dd, d1 = z.r0 + (r + 0.5) * z.dd, h = lakeH(z, r), ramp = c => (z.ramps || []).some(([a, b]) => a === r && b === c);
        let c = 0;
        while (c < z.cols) {
            if (ramp(c)) { out.push({ r0: d0, r1: d1, only: [lonOf(c), z.dl / 2], h: lakeH(z, r - 1), h1: h, kind: 'obsidian' }); c++; continue; }
            let e = c; while (e + 1 < z.cols && !ramp(e + 1)) e++;
            out.push({ r0: d0, r1: d1, only: [(lonOf(c) + lonOf(e)) / 2, ((e - c + 1) * z.dl) / 2], h, kind: 'obsidian' }); c = e + 1;
        }
    }
    out.push({ r0: z.r0 + (z.rows - 0.5) * z.dd, r1: 20.3, h: RIM_H, kind: 'basalt' });
    out.push({ r0: 5.0, r1: z.r0 - 0.5 * z.dd, only: [lonOf(z.exit), z.dl / 2 - 0.5], h: 0.06, h1: z.hs[0], kind: 'obsidian' });
    return out;
}
export const SLIDE = {
    id: 'slide', name: 'OBSIDIAN SLIDE', world: 3, theme: 'volcano', fast: 90, pay: 25, start: at(17, 10), goal: TOP, palm: at(17.8, 95), bank: 7,
    story: 'The Hermit King keeps the pearl down in his crater. The way down is a lake of glassy obsidian, in steps: once you slide, you can\'t stop.',
    hints: ['On the obsidian you slide in a straight line until something stops you, and you can\'t jump. Push the stick to pick which way.', 'Slide into the block, then push it: it slides too, down the steps, until something stops it. Watch where it ends up.', 'The gate on the bridge needs a coconut on the yellow plate. On the obsidian a throw goes two cells, then slides: hold THROW and push the stick to turn first.', 'Cracked glass takes one stop. The ramp is the only way back up a step. Stuck? Slide off into the lava: the lake sets back as it was.'],
    ground: [[1.8, 'dais'], [5.2, 'stone'], [15.5, 'lava'], [99, 'sand']],
    checks: [at(17, 10)],
    lake: LAKE,
    ledges: _lakeLedges(LAKE),
    posts: LAKE.pillars.map(([r, c]) => ({ p: lakeAt(LAKE, r, c), r: 0.34, h: lakeH(LAKE, r) + 1.5, kind: 'obsidian' })),      // (too tall to jump onto from the rim)
    gold: [[0, 8], [7, 1], [4, 8]].map(([r, c]) => ({ p: lakeAt(LAKE, r, c), h: lakeH(LAKE, r) })),
    // Picture signs, each by the first place its rule matters (on the rim, or on a basalt rock in the lava beside the lake).
    signs: [{ p: at(16.3, 32), kind: 'slide', look: at(18.2, 10) }, { p: at(16.3, -14), kind: 'push', look: at(18.2, 10) },
        { p: lakeAt(LAKE, 3.5, -1.5), kind: 'crack', look: lakeAt(LAKE, 4, 4), rock: true }, { p: lakeAt(LAKE, 5.5, 9.5), kind: 'ramp', look: lakeAt(LAKE, 4, 4), rock: true },
        { p: lakeAt(LAKE, 1, -1.5), kind: 'plate', look: lakeAt(LAKE, 2, 4), rock: true }, { p: lakeAt(LAKE, 7.6, 10.4), kind: 'lava', look: lakeAt(LAKE, 6, 4), rock: true }],
};

export const CHAMBERS = [BEACH, STREAM, YARD, STAIR, SINK, MOONPOOL, TIDE, DEEP, SLIDE];
/** While testing, every chamber is open. (Turn it off to make each chamber open when the one before it is cleared.) */
export const ALL_OPEN = true;

// ── A go at a chamber ───────────────────────────────────────────────────────
export function create(lv) {
    const s = { lv, lv0: lv, w: 0, travel: null, t: 0, id: 1, won: false, falls: 0, cp: 0, throws: 0, calm: null, open: {}, held: {}, plug: {}, nuts: [], back: [], dmg: {}, gold: [], stuckIn: {},
        blocks: (lv.blocks || []).map(b => ({ h: 1, r: 0.55, ...b, p: b.p.slice() })), logs: _logsAt(lv, 0), lake: lv.lake ? LG.fresh(lv.lake) : null,
        crab: { p: lv.start.slice(), f: tangent(lv.start, lv.goal), face: tangent(lv.start, lv.goal), h: 0, vh: 0, moving: false, air: false, coy: COYOTE_S, jbuf: 0, nuts: 0, lifted: false },
        boss: lv.boss ? { hp: (lv.boss.hits || BOSS.hits), state: 'sleep', t: 0, n: 0, round: 0, tx: null, pile: 0, rest: false, touchCd: 0 } : null,
        gull: lv.gull ? { p: at(lv.gull.ring, lv.gull.from), h: 0, b: 0, state: 'walk', t: 0, cool: 1, loot: lv.gull.loot || 0, tx: null, from: null } : null };
    s.crab.h = floorAt(s, lv.start);
    if (lv.palm) for (let i = 0; i < CARRY; i++) _palmNut(s, i);
    if (lv.lake) _lakeNuts(s);
    for (const hg of lv.hangs || []) s.nuts.push({ id: s.id++, p: hg.p.slice(), d: tangent(hg.p, [1, 0, 0]), v: 0, h: hg.h, vh: 0, state: 'hang', age: 9, still: 0 });
    return s;
}
function _palmNut(s, i = s.id) { const n = { id: s.id++, w: 0, p: around((s.lv0 || s.lv).palm, 0.95, 200 + (i % 3) * 60), d: [0, 0, 0], v: 0, h: 0, vh: 0, state: 'rest', age: 9, still: 0 }; n.d = tangent(n.p, [1, 0, 0]); if (s.lv === (s.lv0 || s.lv)) n.h = floorAt(s, n.p); s.nuts.push(n); return n; }
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
    for (const l of s.lv.ledges || []) { const d = dist(p, l.c || TOP); if (l.gate && !(s.open && (s.open[l.gate] || (s.held && s.held[l.gate])))) continue; if (d >= l.r0 && d < l.r1 && covers(l, p)) f = Math.max(f, (l.h1 == null ? l.h : l.h + (l.h1 - l.h) * (d - l.r0) / (l.r1 - l.r0)) + (l.ride ? s.tideW || 0 : 0)); }     // (ride: an island that floats up and down with the tide)
    for (const k of s.lv.posts || []) if (dist(p, k.p) < k.r) f = Math.max(f, k.h);
    for (const k of s.lv.pads || []) if (dist(p, k.p) < k.r) f = Math.max(f, PAD_H);
    for (const w of s.lv.rings || []) if (w.top && up(s, w) && Math.abs(dist(p, w.c || TOP) - w.r) < TOP_W && covers(w, p)) f = Math.max(f, w.h);
    for (const b of s.blocks || []) if (dist(p, b.p) < b.r) f = Math.max(f, b.h);
    for (const l of s.logs || []) if (dist(p, l.p) < l.r) f = Math.max(f, l.h);
    if (s.lake) { const z = s.lv.lake || s.lv0.lake; if (z) for (const [r, c] of s.lake.blocks) if (dist(p, lakeAt(z, r, c)) < 0.42) f = Math.max(f, lakeH(z, r) + 0.8); }
    for (const k of s.lv.rafts || []) if (dist(p, k.p) < k.r) f = Math.max(f, (s.tideW || 0) + 0.3);
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
/** The far end of a hole: the point straight through the planet (or hole.to). */
export const holeExit = h => h.to || h.p.map(x => -x);
const _holeAt = (s, p, nut) => (s.lv.holes || []).find(h => dist(p, h.p) < h.r && (nut || !h.nutOnly) && !(h.lid && up(s, { gate: h.lid })));
/** The tide: how high the water stands in a lagoon at time t (it starts low, and is high half a period later). */
export function tideAt(lv, t) {           // out for `out` s, comes in over `rise` s, stays in for `in` s, goes out over `fall` s; and again
    const z = lv.tide; if (!z) return 0;
    const P = z.out + z.rise + z.in + z.fall, ph = ((t % P) + P) % P, ease = k => k * k * (3 - 2 * k);
    return z.high * (ph < z.out ? 0 : ph < z.out + z.rise ? ease((ph - z.out) / z.rise) : ph < z.out + z.rise + z.in ? 1 : ease(1 - (ph - z.out - z.rise - z.in) / z.fall));
}
/** Which way the tide is going, and how long until it changes: { name: 'out' | 'coming in' | 'in' | 'going out', left } (seconds). */
export function tidePhase(lv, t) {
    const z = lv.tide; if (!z) return null;
    const P = z.out + z.rise + z.in + z.fall, ph = ((t % P) + P) % P, ends = [['out', z.out], ['coming in', z.out + z.rise], ['in', z.out + z.rise + z.in], ['going out', P]];
    const [name, end] = ends.find(([, e]) => ph < e); return { name, left: end - ph };
}
/** Is p in the lagoon the tide comes into? */
export const inTide = (lv, p) => { const z = lv.tide; if (!z) return false; const d = dist(p, z.c || TOP); return d > z.r0 && d < z.r1 && covers(z, p); };
/** A steam jet: bubbling (a warning) for JET_WARN s, then firing for `on` s, every `period` s. → 'quiet' | 'warn' | 'fire' */
export const JET_WARN = 0.8;
export function jetState(s, j) {
    if (j.boss && !(s.boss && s.boss.state !== 'sleep' && s.boss.state !== 'down')) return 'quiet';
    const ph = (((s.t + (j.phase || 0)) % j.period) + j.period) % j.period;
    return ph > j.period - j.on ? 'fire' : ph > j.period - j.on - JET_WARN ? 'warn' : 'quiet';
}
/** The obsidian lake (a grid of cells, row 0 by the pearl; its rules are in LakeGrid.js): where cell (r, c) is, which cell a place is on. */
export function lakeAt(z, r, c) { return at(z.r0 + r * z.dd, z.lon0 + c * z.dl); }
/** Is the lake's gate held open (a coconut resting on its plate)? */
/** The lake's grid rules (LakeGrid.js), for the screen's previews. */
export const Lake = LG;
export const lakeGateOpen = s => !!(s.lv.lake && s.lake && LG.gateOpen(s.lv.lake, s.lake));
/** How high cell row r stands (rows step down toward the crater in levels). */
export function lakeH(z, r) { return z.hs[z.levels[Math.max(0, Math.min(z.rows - 1, r))]]; }
const _lakeCell = (z, p) => ({ r: Math.round((dist(p, TOP) - z.r0) / z.dd), c: Math.round((lonOf(p) - z.lon0) / z.dl) });
/** Is p on the lake (anywhere over its cells)? */
export const onLake = (z, p) => { const d = dist(p, TOP), lon = lonOf(p); return d > z.r0 - z.dd / 2 && d < z.r0 + (z.rows - 0.5) * z.dd && lon > z.lon0 - z.dl / 2 && lon < z.lon0 + (z.cols - 0.5) * z.dl; };
// The four ways at a place on the lake: toward the pearl (row - 1), away, east (col + 1), west.
const _lakeDirs = p => { const n = toward(p, TOP), e = tangent(p, cross(TOP, p)); return [[-1, 0, n], [1, 0, n.map(x => -x)], [0, 1, e], [0, -1, e.map(x => -x)]]; };
const _lakeWay = (p, d) => _lakeDirs(p).map(([dr, dc, v]) => [dr, dc, dot(d, v), v]).sort((a, b) => b[2] - a[2])[0];
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
    if (s.lv.lake && (c.lake || c.slide)) { (s.pend || (s.pend = [])).push({ type: 'lake-nojump' }); c.jbuf = 0; return false; }     // (no jumping on the obsidian: your claws can't grip it)
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
    if (c.lake && s.lv.lake) {
        const z = s.lv.lake, [dr, dc] = _lakeWay(c.p, c.face), lr = c.lake[0] + 2 * dr, lc = c.lake[1] + 2 * dc;
        const n = { id: s.id++, p: c.p.slice(), d: tangent(c.p, c.face), v: 0, h: c.h + THROW.up, vh: 0, w: s.w || 0, state: 'slide', age: 0, used: false, still: 0 };
        s.nuts.push(n); c.nuts--; s.throws++;
        const out = lr < 0 || lr >= z.rows || lc < 0 || lc >= z.cols || LG.pillarAt(z, lr, lc) || LG.blockAt(s.lake, lr, lc) || LG.holeAt(z, s.lake, lr, lc);
        if (out) { n.lpts = [c.p.slice(), lr >= z.rows ? at(z.r0 + (z.rows - 0.3) * z.dd, z.lon0 + lc * z.dl) : lakeAt(z, lr, lc)]; n.li = 1; n.lend = null; n.arc = 1; }
        else _nutSlide(s, n, lr, lc, dr, dc, c.p.slice());
        n.li = 1; return n;
    }
    const { T, v } = _throwOf(charge), h0 = c.h + THROW.up;
    const hand = walk(c.p, c.face, THROW.ahead / R), from = _blocked(s, c.p, hand, h0, true) ? c.p.slice() : hand;
    const n = { id: s.id++, p: from, d: tangent(from, c.face), v, h: h0, vh: (gOf(s) * T) / 2 - (h0 - (c.air ? floorAt(s, c.p) : c.h)) / T, w: s.w || 0, state: 'fly', age: 0, used: false, still: 0 };
    s.nuts.push(n); c.nuts--; s.throws++;
    return n;
}
/** Where a throw from here would come down: { p, path, bank, wet } (it flies, banks and lands; then the water has it). */
export function aim(s, charge = 0) {
    if (s.crab.lake && s.lv.lake) {
        const z = s.lv.lake, ls = LG.clone(s.lake), [dr, dc] = _lakeWay(s.crab.p, s.crab.face), r = s.crab.lake[0], c = s.crab.lake[1], t = LG.throwNut(z, ls, r, c, dr, dc);
        const cells = t.path.length ? t.path : [[r + 2 * dr, c + 2 * dc]], path = cells.map(([a, b]) => { const p = lakeAt(z, a, b); return [p, a >= 0 && a < z.rows ? lakeH(z, a) : 0]; });
        return { p: path[path.length - 1][0], path, bank: null, wet: false, hit: !!(t.end && LG.plateAt(z, ...t.end)), lake: true, lost: t.lost };
    }
    const t = { ...s, nuts: [], back: [], open: { ...s.open }, held: { ...s.held }, plug: { ...s.plug }, dmg: { ...s.dmg }, stuckIn: { ...s.stuckIn }, gold: [...s.gold], crab: { ...s.crab, nuts: 1 }, gull: null, boss: null, throws: 0, id: 1 };
    const n = throwNut(t, charge), path = []; let bank = null, sent = null;
    for (let i = 0; i < 240 && n.state === 'fly'; i++) { const ev = []; _nut(t, n, 1 / 60, ev); if (!bank && ev.some(e => e.type === 'bank')) bank = [n.p, n.h]; const nl = ev.find(e => e.type === 'nut-launch'); if (nl) sent = nl.p; if (i % 3 === 0) path.push([n.p, n.h]); }
    const onPlate = n.state === 'rest' && (t.lv.plates || []).some(pl => dist(n.p, pl.p) < pl.r && Math.abs(n.h - floorAt(t, pl.p)) < 0.3);
    return { p: sent || n.p, path, bank, wet: n.state === 'float', hit: n.state === 'stuck' || n.state === 'plug' || !!sent || onPlate };      // (sent: it lands on a launch pad and flies off)     // (hit: it would end in a bullseye)
}

// The lake: returns true when it has the crab this step (so no walking). See LakeGrid.js for the rules; this moves the crab along them.
function _lakeStep(s, dt, stick, ev) {
    const z = s.lv.lake, c = s.crab, G = s.lake, canPick = c.nuts < CARRY;
    const go = (m, dir) => {           // start a slide (or push) the grid has worked out
        if (m.kind === 'push') { ev.push({ type: 'lake-push', ...m.block }); if (m.block.lost) ev.push({ type: 'lake-sink', p: lakeAt(z, ...m.block.path[m.block.path.length - 1]) }); return; }
        if (m.kind === 'none') { if (!c.bumped) { c.bumped = true; ev.push({ type: 'lake-bump' }); } return; }
        c.lakeHold = true;
        c.slide = { pts: m.path.map(([r, cc]) => r >= z.rows ? at(z.r0 + (z.rows - 0.3) * z.dd, z.lon0 + cc * z.dl) : lakeAt(z, r, cc)), i: 0, ...m }; c.lake = null;
        if (dir) c.face = tangent(c.p, dir); ev.push({ type: 'lake-go' });
    };
    if (c.slide) {          // sliding: on to the next cell, and the next, to where the grid said it ends
        const sl = c.slide, tp = sl.pts[sl.i], step = (SLIDE_V * dt) / R, left = tp ? angle(c.p, tp) : 0;
        if (tp && left > step) c.p = walk(c.p, toward(c.p, tp), step); else if (tp) { c.p = tp.slice(); sl.i++; }
        c.f = tangent(c.p, c.f); c.face = tangent(c.p, c.face); c.moving = true; c.air = false; c.vh = 0;
        const f = floorAt(s, c.p); c.h = f < c.h ? Math.max(f, c.h - 7 * dt) : Math.min(f, c.h + 5 * dt);
        if (sl.i < sl.pts.length) return true;
        c.slide = null; c.bumped = false;
        if (sl.out === 'stop') {
            c.lake = sl.end.slice(); c.p = lakeAt(z, ...c.lake); c.h = floorAt(s, c.p); ev.push({ type: 'lake-stop', r: c.lake[0], c: c.lake[1] });
            if (sl.cracked) ev.push({ type: 'lake-crack', r: sl.cracked[0], c: sl.cracked[1] });
            if (sl.picked) { const n = s.nuts.find(x => x.lake && x.lake[0] === sl.picked[0] && x.lake[1] === sl.picked[1]); if (n) { s.nuts.splice(s.nuts.indexOf(n), 1); c.nuts++; ev.push({ type: 'pick', nut: n }); } }
        } else if (sl.out === 'win') { c.lake = null; ev.push({ type: 'lake-off', win: true }); }
        else if (sl.out === 'rim') { c.lake = null; _lakeReset(s, ev); ev.push({ type: 'lake-off' }); }
        else { if (sl.broke) ev.push({ type: 'lake-break', r: sl.broke[0], c: sl.broke[1] }); _reset(s, ev, 'burn'); }
        return true;
    }
    if (c.lake) {           // stopped on a cell: the stick picks one of four ways (winding up a throw, it only turns you)
        c.p = lakeAt(z, ...c.lake); c.h = floorAt(s, c.p);
        const mag2 = stick.x * stick.x + stick.y * stick.y;
        if (mag2 > 0.12) {         // (a third of the way out is a push; let it back under a fifth to choose again)
            const right = cross(c.f, c.p), dir = norm(mix(right, c.f, stick.x, stick.y)), [dr, dc, , v] = _lakeWay(c.p, dir);
            c.face = tangent(c.p, v);
            if (!c.aiming && !c.lakeHold) { c.lakeHold = true; go(LG.move(z, G, c.lake[0], c.lake[1], dr, dc, canPick), v); }      // (one push of the stick, one move: let go to choose again)
        } else if (mag2 < 0.04) { c.bumped = false; c.lakeHold = false; }
        return true;
    }
    // Onto the lake from the rim (walking, or coming down from a jump): you're off, sliding on the way you were going.
    if (onLake(z, c.p)) {
        const cell = _lakeCell(z, c.p), r = Math.max(0, Math.min(z.rows - 1, cell.r));
        let cc = Math.max(0, Math.min(z.cols - 1, cell.c));
        if (LG.pillarAt(z, r, cc) || LG.blockAt(G, r, cc)) {         // (beside a pillar at the edge: you come on in the free cell next to it)
            const fx = (lonOf(c.p) - z.lon0) / z.dl - cc, alt = [cc + (fx >= 0 ? 1 : -1), cc + (fx >= 0 ? -1 : 1)].find(x => x >= 0 && x < z.cols && !LG.pillarAt(z, r, x) && !LG.blockAt(G, r, x));
            if (alt == null) { c.p = at(z.r0 + (z.rows - 0.5) * z.dd + 0.2, lonOf(c.p)); return false; }
            cc = alt;
        }
        const [dr, dc, , v] = _lakeWay(c.p, c.face);
        const m = r === z.rows - 1 && dr === -1 ? LG.enter(z, G, cc, canPick) : LG.drop(z, G, r, cc, dr, dc, canPick);
        c.p = r === z.rows - 1 && dr === -1 ? at(z.r0 + (z.rows - 0.5) * z.dd, z.lon0 + cc * z.dl) : lakeAt(z, r, cc);
        if (m.end && m.end[0] >= z.rows) { c.p = at(z.r0 + (z.rows - 0.5) * z.dd + 0.2, lonOf(c.p)); return false; }      // (a pillar right at the edge: no way on here)
        go({ kind: 'slide', ...m, path: m.path.length ? m.path : [[r, cc]] }, v); ev.push({ type: 'lake-on' }); return true;
    }
    return false;
}
// The lake goes back as it was: blocks home, cracks healed; coconuts lying on it melt away (and turn up under the palm again).
function _lakeReset(s, ev) {
    const z = s.lv.lake; if (!z) return;
    const dirty = s.lake.blocks.join(';') !== (z.blocks || []).join(';') || Object.values(s.lake.cracks).some(x => x) || s.lake.nuts.length;
    for (const n of s.nuts.filter(x => x.lake || (x.state === 'slide' && x.lpts))) { if (n.home) s.nuts.splice(s.nuts.indexOf(n), 1); else _lose(s, n, ev, 'burn'); }
    s.lake = LG.fresh(z); _lakeNuts(s);
    if (dirty) ev.push({ type: 'lake-reset' });
}
// The coconuts that lie on the lake at the start (and again whenever it sets back).
function _lakeNuts(s) { const z = s.lv.lake; for (const [r, c] of z.nuts || []) { const p = lakeAt(z, r, c); s.nuts.push({ id: s.id++, w: 0, p, d: tangent(p, [1, 0, 0]), v: 0, h: lakeH(z, r), vh: 0, state: 'rest', lake: [r, c], home: true, age: 9, still: 0 }); } }
// A coconut on the lake slides too: from cell (r, c), the way (dr, dc), along the grid.
function _nutSlide(s, n, r, c, dr, dc, from) {
    const z = s.lv.lake, sl = LG.slide(z, s.lake, r, c, dr, dc, 'nut'), cells = [[r, c], ...sl.path];
    n.state = 'slide'; n.lpts = (from ? [from] : []).concat(cells.map(([a, b]) => lakeAt(z, a, b))); n.li = 0; n.lend = sl.end; n.v = 0; n.vh = 0; n.arc = from ? 1 : 0;
    if (sl.end) s.lake.nuts.push(sl.end);
}

// Lava: anywhere low in the lava band (the lake, the rim and the bridge stand above it).
function _lava(s, ev) {
    const z = s.lv.lake, c = s.crab; if (!z || !z.lava || c.air || c.slide || c.lake) return false;
    const d = dist(c.p, TOP); if (d > z.lava.r0 && d < z.lava.r1 && floorAt(s, c.p) < 0.05 && c.h < 0.1) { _reset(s, ev, 'burn'); return true; }
    return false;
}
function _lose(s, n, ev, why) { s.nuts.splice(s.nuts.indexOf(n), 1); s.back.push(RESPAWN_S); ev.push({ type: 'lost', nut: n, p: n.p, why }); }
function _nut(s, n, dt, ev) {
    n.age += dt;
    if (n.state === 'slide') {           // across the obsidian, cell by cell (the first leg, out of the claws, is a little arc)
        const tp = n.lpts[n.li], step = ((n.arc && n.li === 1 ? SLIDE_V * 1.3 : SLIDE_V) * dt) / R;
        if (tp && angle(n.p, tp) > step) { const a0 = n.li === 1 && n.arc ? angle(n.lpts[0], tp) : 0; n.p = walk(n.p, toward(n.p, tp), step); n.h = floorAt(s, n.p) + (a0 ? 1.2 * Math.sin(Math.PI * (1 - angle(n.p, tp) / a0)) : 0); return; }
        if (tp) { n.p = tp.slice(); n.li++; n.h = floorAt(s, n.p); if (n.li < n.lpts.length) return; }
        if (n.lend) { n.state = 'rest'; n.lake = n.lend.slice(); n.h = floorAt(s, n.p); ev.push({ type: 'thud', nut: n, p: n.p }); if (LG.plateAt(s.lv.lake, ...n.lake) && LG.gateOpen(s.lv.lake, s.lake)) ev.push({ type: 'lake-plate', p: n.p }); }
        else _lose(s, n, ev, 'burn');
        return;
    }
    if (n.lake) return;
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
        n.vh -= gOf(s) * dt; n.h += n.vh * dt;
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
        if (g && g.state !== 'stun' && Math.hypot(dist(n.p, g.p), n.h - (g.h + (g.b || 0) + 0.4)) < GULL.hit + 0.1) { _stun(s, ev, 'nut'); n.vh = Math.min(n.vh, -2); n.v *= 0.3; }
        const fl = floorAt(s, n.p);
        const hole = n.vh < 0 && n.h <= floorAt(s, n.p) + 0.05 && !n.holeCd && _holeAt(s, n.p, true);
        if (hole) {
            const out = holeExit(hole); n.d = tangent(out, n.d.map(x => -x)); n.p = out.slice(); n.h = floorAt(s, out) + 0.1; n.vh = Math.max(4, -n.vh); n.holeCd = 0.4;
            ev.push({ type: 'hole', nut: n, hole, p: hole.p, out }); return;
        }
        if (n.holeCd) n.holeCd = Math.max(0, n.holeCd - dt);
        const pad = n.vh < 0 && (s.lv.pads || []).find(k => dist(n.p, k.p) < k.r);
        if (pad && n.h <= PAD_H + 0.05) {
            n.h = PAD_H;
            if (pad.to) {          // an aimed pad (a launch pad): whatever lands on it is thrown onto pad.to, whatever way it came in
                const Tf = 1.0, dh = floorAt(s, pad.to) - PAD_H; n.d = toward(n.p, pad.to); n.v = dist(n.p, pad.to) / Tf; n.vh = (dh + 0.5 * gOf(s) * Tf * Tf) / Tf;
            } else { n.vh = PAD_NUT_V; n.v *= 0.8; }
            ev.push({ type: 'pad', nut: n, p: n.p }); return;
        }
        if (n.h <= fl && s.lv.lake) {         // down on the obsidian: it slides on the way it was going; down in the lava: gone
            const z = s.lv.lake, d0 = dist(n.p, TOP);
            if (onLake(z, n.p)) { const cell = _lakeCell(z, n.p), r = Math.max(0, Math.min(z.rows - 1, cell.r)), cc = Math.max(0, Math.min(z.cols - 1, cell.c)), [dr, dc] = _lakeWay(n.p, n.d);
                if (LG.pillarAt(z, r, cc) || LG.blockAt(s.lake, r, cc) || LG.holeAt(z, s.lake, r, cc)) return _lose(s, n, ev, 'burn');
                _nutSlide(s, n, r, cc, dr, dc); return; }
            if (z.lava && d0 > z.lava.r0 && d0 < z.lava.r1 && fl < 0.05) return _lose(s, n, ev, 'burn');
        }
        if (n.h <= fl) {
            n.h = fl;
            if (s.boss && dist(n.p, TOP) < 1.95) n.p = at(BOSS.pileAt, lonOf(n.p));       // (never left inside the fence, out of reach)
            const dr = (s.lv.drains || []).find(x => dist(n.p, x.p) < x.r && !(x.unless && (s.open[x.unless] || s.held[x.unless]))) || (s.lv.pools || []).find(x => dist(n.p, x.p) < x.r); if (dr) { n.p = dr.to.slice(); n.h = floorAt(s, n.p); }     // (a place no crab can reach: it rolls out to where one can)
            const ur = urchinAt(s, n.p); if (ur && !ur.nutSafe) return _lose(s, n, ev, 'urchin');
            const lpn = (s.lv.launch || []).find(k => dist(n.p, k.p) < k.r + 0.3); if (lpn) { n.w = lpn.to === 'moon' ? 1 : 0; n.p = around(lpn.land, 0.9, n.id * 47); n.h = 0; n.state = 'rest'; n.age = 9; ev.push({ type: 'nut-launch', nut: n, p: lpn.p, to: lpn.to }); return; }
            if (s.lv.chasm) { const dd = dist(n.p, s.lv.chasm.c || TOP), tileUp = (s.lv.crumbles || []).some((tl, i) => !(s.tiles && s.tiles[i].down > 0) && dist(n.p, tl.p) < tl.r); if (dd > s.lv.chasm.r0 && dd < s.lv.chasm.r1 && !tileUp) return _lose(s, n, ev, 'chasm'); }
            const cw = fl < 0.05 && currentAt(s, n.p); if (cw && cw.deep) return _lose(s, n, ev, 'sink');      // (deep water: it sinks, and washes up under the palm)
            const dv = (s.lv.vents || []).find(x => x.drop && !s.plug[x.id] && dist(x.p, n.p) < x.r + 0.2 && Math.abs(fl - floorAt(s, x.p)) < 0.4);
            if (dv) { n.state = 'plug'; n.p = dv.p.slice(); n.h = 0; s.plug[dv.id] = n.id; ev.push({ type: 'plug', vent: dv, nut: n, now: blowing(s) }); return; }
            n.state = currentAt(s, n.p) && !rockUnder(s, n.p) ? 'float' : 'rest';
            ev.push({ type: n.state === 'float' ? 'plop' : 'thud', nut: n, p: n.p });
        }
        return;
    }
    if (s.lv.tide && (n.state === 'rest' || n.state === 'float') && inTide(s.lv, n.p)) {
        const W = s.tideW || 0, fl = floorAt(s, n.p);
        if (W > fl + 0.15) { if (n.state !== 'float') { n.state = 'float'; ev.push({ type: 'afloat', nut: n }); } n.h = W; n.tide = true; return; }
        if (n.state === 'float' && n.tide) { n.state = 'rest'; n.h = fl; n.tide = false; return; }
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
    c.slide = null; c.lake = null;
    if (s.lv.lake) _lakeReset(s, ev);
    Object.assign(c, { p: at0.slice(), f: tangent(at0, s.lv.goal), face: tangent(at0, s.lv.goal), h: floorAt(s, at0), vh: 0, air: false, coy: COYOTE_S, jbuf: 0, lifted: false });
    s.falls++;
    ev.push({ type: why, at: s.cp });
}

// ── The gull ────────────────────────────────────────────────────────────────
function _stun(s, ev, by) {
    const g = s.gull;
    if (g.loot) { const n = { id: s.id++, p: g.p.slice(), d: tangent(g.p, [1, 0, 0]), v: 0, h: floorAt(s, g.p), vh: 0, state: 'rest', age: 0.4, still: 0 }; s.nuts.push(n); g.loot = 0; ev.push({ type: 'drop', nut: n }); }
    g.state = 'stun'; g.t = 0; g.h = 0;
    ev.push({ type: 'stun', by });
}
function _gull(s, dt, ev) {
    const g = s.gull, c = s.crab, lv = s.lv.gull;
    g.t += dt; g.cool = Math.max(0, g.cool - dt);
    const dc = dist(g.p, c.p), cTop = dist(c.p, TOP), zone = lv.zone || [5.7, 9.1], onShelf = cTop < zone[1] && cTop > zone[0];
    if (g.state === 'walk' || g.state === 'flee' || g.state === 'ground' || g.state === 'stun') g.b = floorAt(s, g.p);
    if (g.state === 'walk' || g.state === 'flee') {
        // round the shelf (fleeing: away from the crab, twice as fast)
        const away = g.state === 'flee' && dot(tangent(g.p, cross(TOP, g.p)), toward(g.p, c.p)) > 0 ? -1 : 1;
        g.p = walk(g.p, tangent(g.p, cross(TOP, g.p)), (away * GULL.speed * (g.state === 'flee' ? 2 : 1) * dt) / R);
        { const dd = dist(g.p, TOP), back = Math.sign(lv.ring - dd) * Math.min(Math.abs(lv.ring - dd), 3 * dt); g.p = at(dd + back, lonOf(g.p)); }
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
            g.b = floorAt(s, g.p);
            if (g.state === 'dive' && dist(c.p, g.p) < GULL.hit && c.h - g.b < 0.6) {
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
    if (s.pend) { ev.push(...s.pend); s.pend = null; }
    s.t += dt;
    c.jbuf = Math.max(0, c.jbuf - dt);
    for (let i = s.back.length - 1; i >= 0; i--) { s.back[i] -= dt; if (s.back[i] <= 0) { s.back.splice(i, 1); ev.push({ type: 'washed', nut: _palmNut(s) }); } }
    // In flight between the planet and its moon: nothing else happens until it lands.
    if (s.travel) {
        s.travel.t -= dt;
        if (s.travel.t <= 0) {
            const tr = s.travel; s.travel = null; s.w = tr.to === 'moon' ? 1 : 0; s.lv = s.w ? s.lv0.moon : s.lv0;
            Object.assign(c, { p: tr.land.slice(), h: floorAt(s, tr.land), vh: 0, air: false, coy: COYOTE_S, jbuf: 0, lifted: false, holeCd: 0.5 });
            c.f = tangent(c.p, s.lv.goal || s.lv.face || TOP); c.face = c.f; s.cp = s.lv.arriveCp != null ? s.lv.arriveCp : 0;
            s.arriving = 1.5; ev.push({ type: 'arrive', w: s.w });      // (arriving: the screen shows the crab coming down out of the sky)
        }
        return ev;
    }

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
    // The obsidian lake: on it there's no walking, only sliding, in a straight line, until a pillar stops you.
    if (lv.lake && (c.slide || c.lake || !c.air) && _lakeStep(s, dt, stick, ev)) { _lava(s, ev); return ev; }
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
    for (const n of s.nuts.slice()) if ((n.w || 0) === (s.w || 0)) _nut(s, n, dt, ev);

    // The ground under the crab: walk up onto a rock, or off its edge and fall.
    if (!c.climb) c.climbing = false;
    if (!c.air && !c.climb && (lv.pads || []).some(k => dist(c.p, k.p) < k.r)) { c.h = PAD_H; c.air = true; c.vh = PAD_CRAB_V; ev.push({ type: 'pad', p: c.p }); }      // (a jelly pad throws a crab up as soon as it steps on)
    if (!c.air && !c.climb) {
        const f = floorAt(s, c.p);
        if (c.h < f && f - c.h <= STEP_UP) c.h = f; else if (c.h > f + 0.08) { c.air = true; c.vh = 0; } else if (c.h > f) c.h = f;
        if (!c.air) c.coy = COYOTE_S;
    } else c.coy = Math.max(0, c.coy - dt);

    // A vent that is blowing lifts a crab standing in it, high.
    const v = blowing(s);
    if (v && v.lift && dist(c.p, v.p) < v.r && c.h < v.lift && c.h > floorAt(s, v.p) - 0.3) {
        if (!c.lifted) { c.lifted = true; ev.push({ type: 'lift', vent: v }); }
        c.air = true; c.vh = 8; c.h += 8 * dt;
    } else if (c.air) {
        const was = c.h;
        c.vh -= gOf(s) * dt; c.h += c.vh * dt;
        const g = s.gull;
        const fly = s.nuts.find(n => n.state === 'fly' && !n.used && n.age > 0.2 && dist(n.p, c.p) < TRICK_R && c.h >= n.h - 0.15 && c.h - n.h < TRICK_GAP);
        if (fly) { fly.used = true; fly.vh = -5; c.vh = BOUNCE_V; ev.push({ type: 'trick', nut: fly, h: c.h }); }
        else if (c.vh < 0 && g && g.state !== 'rise' && g.state !== 'circle' && g.h < 3 && dist(g.p, c.p) < GULL.hit + 0.1 && was >= g.h + (g.b || 0) + GULL.top && c.h <= g.h + (g.b || 0) + GULL.top + 0.05) {
            c.h = g.h + (g.b || 0) + GULL.top; c.vh = BOUNCE_V; ev.push({ type: 'stomp' }); _stun(s, ev, 'stomp');
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
    // A launch pad: step on, and fly to the moon (or home). What's in the claws goes too.
    if (!c.air && !c.holeCd) { const lp = (lv.launch || []).find(k => dist(c.p, k.p) < k.r && c.h <= floorAt(s, k.p) + 0.1);
        if (lp) { s.travel = { t: TRAVEL_S, to: lp.to, land: lp.land, from: lp.p }; ev.push({ type: 'launch', to: lp.to, p: lp.p }); return ev; } }
    // Holes: into one, out of its far end, facing on, popped up (the faster it fell in, the higher it comes out).
    c.holeCd = Math.max(0, (c.holeCd || 0) - dt);
    if (c.holeCd <= 0 && c.h <= floorAt(s, c.p) + 0.05) { const hole = _holeAt(s, c.p, false);
        if (hole) { const out = holeExit(hole), fwd = c.face.map(x => -x); c.p = out.slice(); c.face = tangent(out, fwd); c.f = tangent(out, c.f.map(x => -x)); c.h = floorAt(s, out); c.vh = Math.max(6, c.fallV || 0); c.air = true; c.holeCd = 0.9; ev.push({ type: 'hole', crab: true, hole, p: hole.p, out }); } }
    c.fallV = c.air && c.vh < 0 ? -c.vh : 0;
    if (lv.lake && _lava(s, ev)) return ev;
    // The tide: up and down on its clock. Caught standing below the water in the lagoon, the crab is swept back to its flag.
    if (lv.tide) {
        const was = s.tideW || 0; s.tideW = tideAt(lv, s.t);
        for (const n of s.nuts) if (n.state === 'rest' && !inTide(lv, n.p)) n.h = floorAt(s, n.p);
        if ((s.tideW > was) !== (s.tideRise || false)) { s.tideRise = s.tideW > was; ev.push({ type: s.tideRise ? 'tide-in' : 'tide-out' }); }
        if (!c.air && inTide(lv, c.p) && c.h < s.tideW - 0.35) { _reset(s, ev, 'swept'); return ev; }
    }
    // Steam jets: firing, they scald a crab standing in them back to its flag.
    for (const j of lv.jets || []) if (jetState(s, j) === 'fire' && dist(c.p, j.p) < j.r && c.h < floorAt(s, j.p) + 1.4) { _reset(s, ev, 'scald'); return ev; }
    // Crumbling tiles over a chasm: one starts to crack when stepped on, falls away CRUMBLE_S later, and is back TILE_BACK_S after that.
    if (lv.chasm) {
        s.tiles = s.tiles || (lv.crumbles || []).map(() => ({ k: -1, down: 0 }));
        (lv.crumbles || []).forEach((tl, i) => { const st = s.tiles[i];
            if (st.down > 0) { st.down -= dt; if (st.down <= 0) { st.down = 0; st.k = -1; ev.push({ type: 'tile-back', i }); } return; }
            if (st.k < 0 && !c.air && dist(c.p, tl.p) < tl.r) { st.k = 0; ev.push({ type: 'tile-crack', i }); }
            if (st.k >= 0) { st.k += dt; if (st.k >= CRUMBLE_S) { st.down = TILE_BACK_S; st.k = -1; ev.push({ type: 'tile-fall', i, p: tl.p }); } } });
        const d = dist(c.p, lv.chasm.c || TOP), onTile = (lv.crumbles || []).some((tl, i) => s.tiles[i].down <= 0 && dist(c.p, tl.p) < tl.r);
        if (!c.air && d > lv.chasm.r0 && d < lv.chasm.r1 && !onTile) { _reset(s, ev, 'fall'); return ev; }
    }
    // Urchins; deep water.
    if (c.h < 0.7 && urchinAt(s, c.p, 0.15)) { _reset(s, ev, 'ouch'); return ev; }
    if (!c.air && (lv.pools || []).some(q => dist(c.p, q.p) < q.r) && c.h < floorAt(s, c.p) + 0.05) { _reset(s, ev, 'sink'); return ev; }      // (a deep pool)
    if (!c.air && c.h < 0.05) { const dw = currentAt(s, c.p); if (dw && dw.deep) { _reset(s, ev, 'sink'); return ev; } }
    // Golden shells: touch one (at its height) to take it.
    (lv.gold || []).forEach((g, j) => { const i = (s.w ? 100 : 0) + j; if (!s.gold.includes(i) && dist(c.p, g.p) < 0.75 && Math.abs(c.h - (g.h || 0)) < 0.9) { s.gold.push(i); ev.push({ type: 'gold', i, p: g.p, h: g.h || 0 }); } });
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
        const n = s.nuts.find(x => (x.w || 0) === (s.w || 0) && (x.state === 'rest' || x.state === 'float') && !x.lake && x.age > PICK_AGE && dist(x.p, c.p) < PICK_R);
        if (n) { s.nuts.splice(s.nuts.indexOf(n), 1); c.nuts++; ev.push({ type: 'pick', nut: n }); }
    }
    if (s.gull) _gull(s, dt, ev);
    if (s.boss) _boss(s, dt, ev);
    if (s.won) return ev;

    // Plates: held down by the crab on the ground, or a coconut at rest.
    for (const pl of lv.plates || []) {
        const ph = floorAt(s, pl.p), g0 = s.gull, on = pl.heavy ? !!(g0 && (g0.state === 'ground' || g0.state === 'stun') && g0.h < 0.1 && dist(g0.p, pl.p) < pl.r)
            : (!c.air && dist(c.p, pl.p) < pl.r && Math.abs(c.h - ph) < 0.3) || s.nuts.some(n => (n.w || 0) === (s.w || 0) && n.state === 'rest' && dist(n.p, pl.p) < pl.r && Math.abs(n.h - ph) < 0.3);
        const gs = gatesOf(pl);
        if (on !== !!s.held[gs[0]]) { for (const g of gs) { s.held[g] = on; if (!on && pl.secs) s.open[g] = pl.secs; } ev.push({ type: on ? 'press' : 'release', plate: pl, heavy: !!pl.heavy, secs: pl.secs || 0 }); }
        if (on && pl.secs && !pl.heavy) for (const g of gs) delete s.open[g];
    }
    (lv.checks || []).forEach((p, i) => { const z = lv.zones && lv.zones[i], dT = dist(c.p, TOP); if (i > s.cp && !c.air && (dist(c.p, p) < CHECK_R || (z && dT > z[0] && dT < z[1]))) { s.cp = i; ev.push({ type: 'check', i, p }); } });
    if (!c.air && lv.goal && dist(c.p, lv.goal) < GOAL_R && (!s.boss || s.boss.state === 'down')) { s.won = true; ev.push({ type: 'won', t: s.t, falls: s.falls }); }
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
    const bc = typeof s.lv.boss === 'object' ? s.lv.boss : {}, arena = bc.arena || BOSS.arena;
    if (b.state === 'sleep') { if (dist(c.p, TOP) < arena) { b.state = 'idle'; b.t = 0; ev.push({ type: 'ink-wake' }); _pile(s, ev, BOSS.piles); } return; }
    b.t += dt; const r = Math.min(2, b.round);
    // touching him is a hit, the same as a slam
    b.touchCd = Math.max(0, b.touchCd - dt);
    if (b.touchCd <= 0 && dist(c.p, TOP) < BOSS.touch && c.h < 1.2) { b.touchCd = 1; c.p = at(2.6, lonOf(c.p)); c.f = tangent(c.p, c.f); c.face = tangent(c.p, c.face); c.vh = 5; c.air = true; s.falls++; ev.push({ type: 'ink-ouch', touch: true }); }
    // coconuts keep coming: when two or fewer are lying about, a fresh pile
    const loose = s.nuts.filter(n => n.state === 'rest' || n.state === 'float').length;
    if (loose < 2 && dist(c.p, TOP) < arena + 0.5) { b.spawn = (b.spawn || 0) + dt; if (b.spawn >= BOSS.pileEvery) { b.spawn = 0; _pile(s, ev, BOSS.piles - loose); } } else b.spawn = 0;
    if (b.state === 'idle') { if (b.t >= (b.rest ? BOSS.rest : BOSS.wake)) { b.rest = false; b.state = 'wind'; b.t = 0; b.tx = c.p.slice(); ev.push({ type: 'ink-wind' }); } }
    else if (b.state === 'wind') {
        const dur = BOSS.wind[r] * (bc.speed || 1);
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
