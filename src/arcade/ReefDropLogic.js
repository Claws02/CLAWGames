// ============================================================
// REEF DROP — the physics and the reefs. No DOM (ReefDrop.js is the screen,
// via AimScreen), so qa/aimgames.mjs checks every reef can be won.
//
// A launcher at the top drops a pearl into a reef. Pull back to aim (and to
// set how hard it goes), let go. The pearl falls, bouncing off everything:
//   coral 🪸      pops the moment it's hit; every pop in one shot is worth
//                 more than the last (the chain)
//   oysters 🦪    asleep: the first hit opens one, the second frees its pearl.
//                 Free every oyster to win the reef
//   eels ⚡       hit one and it zaps every piece near it (they pop too, and
//                 a zapped eel zaps again)
//   rocks 🪨      solid, never pop
//   jellyfish 🪼  drift to and fro; springy, and they never pop
//   puffers 🐡    swell on the first hit and burst on the second, popping
//                 everything around them (wider than an eel; they set each other off)
//   chests 💰     pop and make that whole shot score double
//   whirlpools 🌀 in pairs: in one, out of its twin, going the same way
//   bubble lifts 🫧 columns of bubbles that push the pearl back up
//   ghost pieces 👻 any piece can fade in and out on a timer: it's only there to hit while solid
//   anglerfish 🎣 their glowing lure pulls the pearl in; the fish is solid and never pops
//   starfish ⭐   spin and fling the pearl off fast; they never pop
//   golden oysters 🟡 three hits; free one and its pearl comes back to you (a pearl back)
//   currents 🌊  streams that push the pearl sideways as it falls through
//   giant clams 🐚 open and shut on a timer: shut, the pearl bounces off and what's inside is safe
// Every piece sits clear above Shelly (reef() squeezes a reef up if not).
// Some pieces move: coral wheels turn, some rows slide. The reef keeps moving
// while you aim (the screen runs the clock), so a drop is timed as well as aimed.
//
// Shelly the hermit crab scuttles along the sea floor. A pearl that lands in
// her shell comes back to you, and that shot scores ×3. A chain of 20 or more
// in one shot earns a pearl too. 10 pearls a reef; stars by how many are left.
// ============================================================
export const W = 1, H = 1.5, DT = 1 / 120;
export const R = 0.022, PEG_R = 0.026, LAUNCH = [0.5, 0.06], FLOOR_Y = 1.42, PEARLS = 10, ZAP_R = 0.16, BIG_CHAIN = 20;
export const CRAB_W = 0.17, CRAB_Y = 1.42, CATCH_X = 3, JELLY_E = 1.05;
export const CLEAR_Y = 1.2;                 // nothing lower than this: Shelly's shell (and her hop) stays clear
export const BOMB_R = 0.24, WHIRL_R = 0.045, LIFT = 6.5, LIFT_MAX = 1.6, LIFT_SECS = 1.2;   // lifts push for this long in all, a drop
export const ANGLER_R = 0.034, ANGLER_E = 0.7, STAR_E = 1.3, CURRENT_MAX = 1.4, CLAM_R = 0.075, CLAM_E = 0.6;
const _goal = k => k === 'o' || k === 'g';   // the pieces you have to free to win
const GRAV = 3.0, PEG_E = 0.72, WALL_E = 0.8, MAX_V = 2.4;
export const SEARCH = { angles: 60, powers: [0.3, 0.6, 1], angleFrom: 0.05, angleTo: Math.PI - 0.05 };

// ---- moving things: all a function of the reef clock s.t --------------------------
const TAU = Math.PI * 2;
/** Where Shelly is (the middle of her shell). */
export const crabX = (lv, t) => { const c = lv.crab || {}; return 0.5 + (c.a ?? 0.34) * Math.sin(TAU * t / (c.period ?? 3.4) + (c.ph ?? 0)); };
/** Where a piece is: wheels turn, slides slide, the rest stay put. */
/** A ghost piece is only there (to hit, or to be zapped) while solid: blink [period, phase]. */
export const solid = (p, t) => !p.blink || Math.sin((2 * Math.PI * t) / p.blink[0] + (p.blink[1] || 0)) > -0.15;
/** An anglerfish's pull at the pearl: [ax, ay]. a = [x, y, reach, strength]. */
export function lure(a, x, y) { const dx = a[0] - x, dy = a[1] - y, d = Math.hypot(dx, dy); if (d > a[2] || d < 1e-6) return [0, 0]; const k = a[3] * (1 - d / a[2]) / d; return [dx * k, dy * k]; }
/** A giant clam is shut while its timer says so: [x, y, period, phase]. */
export const shut = (c, t) => Math.sin((2 * Math.PI * t) / c[2] + (c[3] || 0)) > 0.3;   // open a little more than shut
/** Is the piece inside a shut clam (safe) at time t? */
export const guarded = (lv, x, y, t) => (lv.clams || []).some(c => shut(c, t) && Math.hypot(x - c[0], y - c[1]) < CLAM_R);
export function pegAt(p, t) {
    if (p.orbit) { const [cx, cy, r, a0, w] = p.orbit; return [cx + Math.cos(a0 + w * t) * r, cy + Math.sin(a0 + w * t) * r]; }
    if (p.slide) { const [dx, period, ph = 0] = p.slide; return [p.x + dx * Math.sin(TAU * t / period + ph), p.y]; }
    return [p.x, p.y];
}
/** Where a jellyfish is: [x, y, r]. */
export const jellyAt = (j, t) => [j[0] + j[3] * Math.sin(TAU * t / j[4] + (j[5] || 0)), j[1] + Math.sin(TAU * t / (j[4] * 0.7)) * 0.015, j[2]];

// ---- the reefs, laid out by patterns: c coral, o oyster, e eel, r rock ----------
const grid = (rows, cols, y0, y1, x0 = 0.12, x1 = 0.88, off = true) => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([x0 + (c + (off && r % 2 ? 0.5 : 0)) * ((x1 - x0) / (cols - (off ? 0.5 : 1))), y0 + r * ((y1 - y0) / (rows - 1))]); return out.filter(([x]) => x <= x1 + 0.001); };
const ring = (cx, cy, rad, n, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(a0 + (i / n) * TAU) * rad, cy + Math.sin(a0 + (i / n) * TAU) * rad * 1.1]);
const wave = (y, amp, n, ph = 0) => Array.from({ length: n }, (_, i) => [0.1 + (i / (n - 1)) * 0.8, y + Math.sin(ph + (i / (n - 1)) * TAU) * amp]);
const diamond = () => { const out = []; for (let r = 0; r < 7; r++) { const n = 8 - Math.abs(3 - r) * 2; for (let c = 0; c < n; c++) out.push([0.5 + (c - (n - 1) / 2) * 0.11, 0.42 + r * 0.12]); } return out; };
const at = (list, kind) => Object.fromEntries(list.map(i => [i, kind]));
const every = (n, k, kind, from = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => i).filter(i => i >= from && (i - from) % k === 0).map(i => [i, kind]));
// A turning wheel of n pieces round (cx, cy); speed in radians a second. Returns pieces (with orbit).
const wheel = (cx, cy, rad, n, speed, a0 = 0) => Array.from({ length: n }, (_, i) => ({ orbit: [cx, cy, rad, a0 + (i / n) * TAU, speed] }));
// Pieces in a row that slide together.
const slider = (y, n, dx, period, x0 = 0.18, x1 = 0.82, ph = 0) => Array.from({ length: n }, (_, i) => ({ x: x0 + (i / (n - 1)) * (x1 - x0), y, slide: [dx, period, ph] }));

/**
 * A reef: still pieces from points (marks pick their kind by index), plus
 * moving pieces (each { orbit | slide, kind? }), jellyfish [x, y, r, dx, period, ph?]
 * and how Shelly moves ({ a, period, ph }).
 */
const reef = (name, world, pts, marks, more = {}) => {
    const ghost = more.ghost || {};   // { index: [period, phase] } for still pieces
    const still = pts.map(([x, y], i) => ({ x: +x.toFixed(3), y: +y.toFixed(3), kind: marks[i] || 'c', ...(ghost[i] ? { blink: ghost[i] } : {}) }));
    const moving = (more.movers || []).map(m => ({ x: m.x ?? 0, y: m.y ?? 0, kind: m.kind || 'c', ...(m.orbit ? { orbit: m.orbit } : {}), ...(m.slide ? { slide: m.slide } : {}), ...(m.blink ? { blink: m.blink } : {}) }));
    return _clear({ name, world, pegs: [...still, ...moving], jellies: more.jellies || [], whirls: more.whirls || [], lifts: more.lifts || [], anglers: more.anglers || [], currents: more.currents || [], clams: more.clams || [], crab: more.crab || {}, hint: more.hint });
};
// The lowest anything reaches (a piece's middle; a wheel's bottom; a jelly with its tentacles; a lift's foot).
export function lowest(lv) {
    let m = 0;
    for (const p of lv.pegs) m = Math.max(m, p.orbit ? p.orbit[1] + p.orbit[2] : p.y);
    for (const j of lv.jellies) m = Math.max(m, j[1] + j[2] * 1.6 + 0.015);
    for (const w of lv.whirls) m = Math.max(m, w[1], w[3]);
    for (const l of lv.lifts) m = Math.max(m, l[2]);
    for (const a of lv.anglers || []) m = Math.max(m, a[1] + ANGLER_R);
    for (const c of lv.currents || []) m = Math.max(m, c[3]);
    for (const c of lv.clams || []) m = Math.max(m, c[1] + CLAM_R);
    return m;
}
// Squeeze a reef upwards (keeping its top where it is) so nothing comes down past CLEAR_Y.
function _clear(lv) {
    const low = lowest(lv);
    if (low <= CLEAR_Y) return lv;
    let top = Infinity;
    for (const p of lv.pegs) top = Math.min(top, p.orbit ? p.orbit[1] - p.orbit[2] : p.y);
    const f = (CLEAR_Y - top) / (low - top), Y = y => +(top + (y - top) * f).toFixed(3);
    for (const p of lv.pegs) { if (p.orbit) { p.orbit = [p.orbit[0], Y(p.orbit[1]), +(p.orbit[2] * f).toFixed(3), p.orbit[3], p.orbit[4]]; } else p.y = Y(p.y); }
    lv.jellies = lv.jellies.map(j => [j[0], Y(j[1]), j[2], ...j.slice(3)]);
    lv.whirls = lv.whirls.map(w => [w[0], Y(w[1]), w[2], Y(w[3])]);
    lv.lifts = lv.lifts.map(l => [l[0], Y(l[1]), Y(l[2]), l[3]]);
    lv.anglers = (lv.anglers || []).map(a => [a[0], Y(a[1]), a[2], a[3]]);
    lv.currents = (lv.currents || []).map(c => [c[0], Y(c[1]), c[2], Y(c[3]), c[4]]);
    lv.clams = (lv.clams || []).map(c => [c[0], Y(c[1]), c[2], c[3]]);
    if (lowest(lv) > CLEAR_Y + 1e-6) { const g = CLEAR_Y - lowest(lv); for (const j of lv.jellies) j[1] += g; }   // a jelly's tentacles
    return lv;
}
const kinds = (list, marks) => list.map((m, i) => ({ ...m, kind: marks[i] || 'c' }));

export const WORLDS = ['🪸 Shallows', '🌊 Kelp Forest', '🪼 Jelly Drift', '🌀 Grotto', '🏰 Sunken City', '🌙 Moonlit Lagoon', '🌋 Abyssal Vents', '⭐ Starfish Shoals', '🌊 Riptide Reef'];
export const LEVELS = [
    // ---- Shallows: learn the pieces; Shelly strolls ----
    reef('First Drop', 0, grid(6, 7, 0.45, 1.15), at([10, 17, 24, 31], 'o'), { crab: { period: 4.2 }, hint: '🦪 Hit each oyster twice to free it. 🦀 Land a pearl in Shelly\'s shell to get it back!' }),
    reef('Chain Reef', 0, grid(7, 8, 0.4, 1.2), { ...at([12, 27, 42], 'o'), ...at([5, 20, 35, 50], 'o') }, { crab: { period: 4 } }),
    reef('Zap!', 0, grid(6, 7, 0.45, 1.15), { ...at([9, 23, 30], 'o'), ...at([16, 37], 'e') }, { hint: '⚡ Hit an eel and it zaps everything near it.' }),
    reef('Rock Garden', 0, grid(7, 7, 0.4, 1.2), { ...at([8, 22, 36], 'o'), ...at([3, 17, 31, 45], 'r'), ...at([24], 'e') }, { hint: '🪨 Rocks are solid and never pop.' }),
    reef('Rings', 0, [...ring(0.5, 0.75, 0.3, 16), ...ring(0.5, 0.75, 0.15, 8, 0.4)], { ...at([0, 4, 8, 12], 'o'), ...at([16, 20], 'e') }),
    reef('First Jelly', 0, [...wave(0.45, 0.08, 9), ...wave(0.95, 0.08, 9, 3), ...wave(1.2, 0.06, 9, 4.5)], { ...at([4, 13, 22], 'o'), ...at([9, 26], 'e') },
        { jellies: [[0.5, 0.72, 0.05, 0.3, 3.2]], hint: '🪼 Jellyfish drift to and fro. They\'re springy and never pop.' }),
    // ---- Kelp Forest: things start to move ----
    reef('Kelp Columns', 1, [...grid(8, 5, 0.38, 1.22, 0.15, 0.85, false)], { ...at([6, 13, 23, 31, 38], 'o'), ...at([2, 17, 27], 'r'), ...at([20], 'e') }, { crab: { period: 3.2 } }),
    reef('Turning Wheel', 1, grid(3, 7, 1.0, 1.25), { ...at([3, 17], 'o') },
        { movers: kinds(wheel(0.5, 0.62, 0.2, 10, 0.9), at([0, 5], 'o')), hint: '🎡 Coral wheels turn. Time your drop!' }),
    reef('Diamond', 1, diamond(), { ...at([0, 6, 12, 18, 24], 'o'), ...at([9, 15], 'e'), ...at([3, 21], 'r') }, { jellies: [[0.5, 0.28, 0.045, 0.32, 2.6]] }),
    reef('Sliding Rows', 1, grid(2, 7, 1.12, 1.26), { ...at([2, 10], 'o') },
        { movers: [...kinds(slider(0.5, 6, 0.1, 2.4), at([1, 4], 'o')), ...kinds(slider(0.75, 6, -0.1, 2.4), at([2], 'o'), ), ...kinds(slider(0.95, 6, 0.1, 3), at([0, 5], 'e'))], hint: '↔️ Some rows slide back and forth.' }),
    reef('Spiral', 1, Array.from({ length: 36 }, (_, i) => { const a = i * 0.55, r = 0.06 + i * 0.0105; return [0.5 + Math.cos(a) * r, 0.78 + Math.sin(a) * r * 1.15]; }), { ...at([3, 10, 17, 24, 31, 35], 'o'), ...at([14, 28], 'e'), ...at([20], 'r') }, { crab: { period: 2.8 } }),
    reef('Deep Bloom', 1, [...grid(8, 8, 0.36, 1.24), ...ring(0.5, 0.8, 0.12, 6)], { ...every(64, 9, 'o', 4), ...at([16, 40, 66], 'e'), ...at([0, 7, 56, 63], 'r') }, { jellies: [[0.25, 0.3, 0.04, 0.12, 2.2], [0.75, 0.3, 0.04, -0.12, 2.2]] }),
    // ---- Jelly Drift: everything moves ----
    reef('Jelly Bloom', 2, grid(4, 7, 0.95, 1.28), { ...at([3, 10, 17, 24], 'o'), ...at([13], 'e') },
        { jellies: [[0.3, 0.45, 0.05, 0.18, 2.8], [0.7, 0.6, 0.05, -0.18, 3.4], [0.5, 0.78, 0.045, 0.3, 2.2]], crab: { period: 3 } }),
    reef('Twin Wheels', 2, grid(2, 7, 1.15, 1.28), { ...at([3], 'o') },
        { movers: [...kinds(wheel(0.3, 0.6, 0.15, 8, 1.1), at([0, 4], 'o')), ...kinds(wheel(0.7, 0.6, 0.15, 8, -1.1), at([2, 6], 'o')), ...kinds(wheel(0.5, 0.92, 0.12, 6, 0.7), at([3], 'e'))] }),
    reef('Conveyor Reef', 2, [[0.15, 1.2], [0.5, 1.22], [0.85, 1.2]], { 1: 'o' },
        { movers: [...kinds(slider(0.42, 7, 0.12, 2, 0.12, 0.88), at([3], 'o')), ...kinds(slider(0.62, 7, -0.12, 2.6, 0.12, 0.88), at([1, 5], 'o')), ...kinds(slider(0.82, 7, 0.12, 2, 0.12, 0.88), at([3], 'e')), ...kinds(slider(1.02, 7, -0.12, 3.2, 0.12, 0.88), at([0, 6], 'o'))], crab: { period: 2.6 } }),
    reef('Ferris Reef', 2, ring(0.5, 1.12, 0.32, 12, 0.26), { 3: 'o', 9: 'o' },
        { movers: [...kinds(wheel(0.5, 0.62, 0.26, 14, 0.6), at([0, 7], 'o')), ...kinds(wheel(0.5, 0.62, 0.12, 6, -1.2), at([0, 3], 'e'))], jellies: [[0.5, 0.25, 0.04, 0.3, 3]] }),
    reef('Rush Hour', 2, grid(2, 7, 1.18, 1.3), { ...at([1, 5], 'o') },
        { movers: [...kinds(slider(0.45, 5, 0.15, 1.8, 0.2, 0.8), at([2], 'o')), ...kinds(wheel(0.5, 0.82, 0.18, 9, 1.0), at([0, 3, 6], 'o')), ...kinds(slider(1.05, 5, -0.15, 1.8, 0.2, 0.8), at([0, 4], 'e'))],
          jellies: [[0.2, 0.65, 0.04, 0.1, 2.4], [0.8, 0.65, 0.04, -0.1, 2.4]], crab: { period: 2.4, a: 0.36 } }),
    reef('The Deep Dance', 2, [...ring(0.5, 0.75, 0.38, 14)], { 0: 'o', 7: 'o', 3: 'r', 10: 'r' },
        { movers: [...kinds(wheel(0.5, 0.75, 0.24, 10, 0.8), at([0, 5], 'o')), ...kinds(wheel(0.5, 0.75, 0.1, 4, -1.6), at([0, 2], 'e'))], jellies: [[0.5, 0.3, 0.045, 0.32, 2.6], [0.5, 1.22, 0.045, -0.32, 3.1]], crab: { period: 2.2, a: 0.38 } }),
    // ---- Grotto: one new piece at a time, then together ----
    reef('Whirlpool Hop', 3, [...grid(3, 7, 0.42, 0.62), ...grid(3, 7, 0.95, 1.15)], { ...at([3, 10, 17], 'o'), ...at([24, 31, 38], 'o'), ...at([21, 27], 'r') },
        { whirls: [[0.15, 0.8, 0.85, 0.8]], hint: '🌀 Whirlpools come in pairs: drop into one and pop out of its twin.' }),
    reef('Puffer Patch', 3, grid(6, 7, 0.45, 1.15), { ...at([5, 12, 30, 37], 'o'), ...at([16, 23], 'p') },
        { hint: '🐡 Puffers swell on the first hit and burst on the second, popping everything around them!' }),
    reef('Bubble Elevator', 3, [...wave(0.4, 0.05, 8), ...grid(3, 6, 0.82, 1.12, 0.26, 0.9)], { ...at([2, 5], 'o'), ...at([10, 15, 20], 'o') },
        { lifts: [[0.12, 0.3, 1.2, 0.1]], hint: '🫧 Bubble lifts push your pearl back up for more bounces.' }),
    reef('Treasure Trove', 3, ring(0.5, 0.78, 0.33, 18), { ...at([0, 6, 12], 'o'), ...at([3, 15], 'e') },
        { movers: kinds(wheel(0.5, 0.78, 0.13, 6, 0.8), { 0: 't', 3: 'o' }), hint: '💰 Hit a treasure chest and that whole shot scores double.' }),
    reef('Twin Currents', 3, [...grid(2, 7, 0.4, 0.52), ...grid(4, 5, 0.78, 1.15, 0.22, 0.78)], { ...at([3, 10], 'o'), ...at([16, 23], 'o'), ...at([19], 'p'), ...at([14, 27], 'p') },
        { whirls: [[0.1, 0.68, 0.9, 1.05], [0.9, 0.68, 0.1, 1.05]], jellies: [[0.5, 0.66, 0.04, 0.25, 2.6]] }),
    reef('Grotto Gauntlet', 3, [...grid(2, 6, 0.45, 0.58, 0.25, 0.85), ...ring(0.5, 0.98, 0.17, 10)], { ...at([2, 7], 'o'), ...at([11, 16, 21], 'o'), ...at([14, 19], 'p'), 9: 't' },
        { movers: kinds(slider(0.75, 5, 0.12, 2.4, 0.22, 0.78), { 2: 'e' }), whirls: [[0.08, 0.4, 0.92, 0.9]], lifts: [[0.92, 0.2, 0.6, 0.08]], crab: { period: 3 } }),
    // ---- Sunken City: everything at once ----
    reef('Bubble Bounce', 4, [...grid(2, 8, 0.4, 0.5), ...grid(2, 8, 1.02, 1.14)], { ...at([2, 5, 9, 13], 'o'), ...at([18, 21, 26, 29], 'o') },
        { movers: kinds(slider(0.75, 6, 0.14, 2.2, 0.2, 0.8), at([1, 4], 'o')), lifts: [[0.08, 0.3, 1.18, 0.09], [0.92, 0.3, 1.18, 0.09]], crab: { period: 2.8 } }),
    reef('Puffer Chain', 4, [...wave(0.45, 0.06, 9), ...wave(0.7, 0.06, 9, 2), ...wave(0.95, 0.06, 9, 4), ...wave(1.15, 0.04, 9, 1)], { ...at([0, 8, 13, 22, 27, 35], 'o'), ...at([4, 11, 20, 29], 'p'), 31: 't' },
        { hint: '🐡 One burst sets off the next: line them up!' }),
    reef('Portal Maze', 4, [[0.33, 0.5], [0.67, 0.5], [0.33, 0.62], [0.67, 0.62], [0.33, 0.74], [0.67, 0.74], ...grid(2, 7, 0.95, 1.1)], { 0: 'r', 1: 'r', 2: 'r', 3: 'r', 4: 'r', 5: 'r', ...at([7, 10, 13, 16], 'o') },
        { movers: kinds([{ x: 0.5, y: 0.6 }, { x: 0.5, y: 0.7 }], { 0: 'o', 1: 'o' }).map(m => ({ ...m, slide: [0.08, 2.6] })), whirls: [[0.12, 0.4, 0.5, 0.86], [0.88, 0.4, 0.15, 0.86]] }),
    reef('Chest Carousel', 4, ring(0.5, 0.72, 0.36, 16), { ...at([2, 10], 'o'), ...at([6, 14], 'p') },
        { movers: [...kinds(wheel(0.5, 0.72, 0.22, 10, 1.0), { 0: 't', 2: 'o', 5: 't', 7: 'o' }), ...kinds(wheel(0.5, 0.72, 0.1, 4, -1.6), { 0: 'o', 2: 'e' })], crab: { period: 2.6, a: 0.36 } }),
    reef('The Vault', 4, [...ring(0.5, 0.85, 0.2, 14), ...grid(2, 7, 0.42, 0.54)], { ...at([0, 1, 2, 5, 9, 10, 11, 12, 13], 'r'), 3: 'c', 4: 'c', ...at([6, 8], 'p'), ...at([15, 18, 21], 'o') },
        { movers: kinds([{ x: 0.5, y: 0.85 }, { x: 0.43, y: 0.92 }, { x: 0.57, y: 0.92 }], { 0: 'o', 1: 'o', 2: 'o' }).map(m => ({ ...m, slide: [0.03, 1.8] })), whirls: [[0.1, 0.6, 0.5, 0.78]], lifts: [[0.9, 0.62, 1.15, 0.08]], hint: '🔐 The vault\'s door is a whirlpool. Or bust it open with a puffer.' }),
    reef('Kraken\'s Lair', 4, [...grid(2, 7, 0.42, 0.54), [0.5, 1.12]], { ...at([3, 10], 'o'), ...at([1, 5], 'p'), 14: 't' },
        { movers: [...kinds(wheel(0.3, 0.82, 0.14, 7, 1.2), { 0: 'o', 3: 'p' }), ...kinds(wheel(0.7, 0.82, 0.14, 7, -1.2), { 0: 'o', 4: 'e' }), ...kinds(slider(1.05, 5, 0.15, 2, 0.2, 0.8), { 0: 'o', 4: 'o' })],
          jellies: [[0.5, 0.66, 0.04, 0.3, 2.4]], whirls: [[0.08, 0.66, 0.92, 0.66]], lifts: [[0.5, 0.95, 1.18, 0.06]], crab: { period: 2.2, a: 0.38 } }),
    // ---- Moonlit Lagoon: ghost pieces fade in and out ----
    reef('Moonrise', 5, grid(6, 7, 0.45, 1.15), { ...at([10, 17, 24, 31], 'o') },
        { ghost: { ...Object.fromEntries([...Array(7).keys()].map(k => [7 + k, [2.4, 0]])), ...Object.fromEntries([...Array(7).keys()].map(k => [21 + k, [2.4, Math.PI]])) }, hint: '👻 Ghost pieces fade in and out. Your pearl only hits them while they\'re solid.' }),
    reef('Phase Shift', 5, [...grid(2, 7, 0.42, 0.54), ...grid(3, 6, 0.85, 1.12, 0.2, 0.84)], { ...at([15, 18, 21, 24, 27], 'o') },
        { ghost: { 15: [2, 0], 18: [2, 2.1], 21: [2, 4.2], 24: [2, 1], 27: [2, 3.1] }, jellies: [[0.5, 0.7, 0.04, 0.25, 2.8]] }),
    reef('Ghost Wheel', 5, grid(2, 7, 1.05, 1.17), { ...at([3, 10], 'o') },
        { movers: kinds(wheel(0.5, 0.68, 0.24, 12, 0.7), { 0: 'o', 4: 'o', 8: 'o' }).map((m, k) => (k % 2 ? { ...m, blink: [1.8, k] } : m)), crab: { period: 3.2 } }),
    reef('Night Lights', 5, [...wave(0.45, 0.06, 9), ...wave(0.75, 0.06, 9, 2), ...wave(1.05, 0.05, 9, 4)], { ...at([2, 6, 11, 15, 20, 24], 'o'), ...at([4, 13, 22], 'p') },
        { ghost: { 4: [2.6, 0], 13: [2.6, 2], 22: [2.6, 4], 0: [1.6, 0], 8: [1.6, 0], 18: [1.6, 3], 26: [1.6, 3] } }),
    reef('Tidal Clock', 5, grid(2, 7, 1.02, 1.14), { ...at([2, 11], 'o'), 6: 't' },
        { movers: [...kinds(slider(0.45, 6, 0.12, 2.2, 0.18, 0.82), { 1: 'o', 4: 'o' }).map(m => ({ ...m, blink: [2.2, 0] })), ...kinds(slider(0.72, 6, -0.12, 2.2, 0.18, 0.82), { 2: 'o', 3: 'e' }).map(m => ({ ...m, blink: [2.2, Math.PI] }))],
          whirls: [[0.08, 0.3, 0.92, 0.9]] }),
    reef('Midnight Maze', 5, [[0.3, 0.45], [0.3, 0.55], [0.3, 0.65], [0.7, 0.55], [0.7, 0.65], [0.7, 0.75], [0.5, 0.8], [0.4, 0.95], [0.6, 0.95], ...grid(2, 7, 1.05, 1.17)],
        { 0: 'r', 1: 'r', 2: 'r', 3: 'r', 4: 'r', 5: 'r', 6: 'o', 7: 'o', 8: 'o', ...at([9, 13, 16], 'o'), 11: 'p', 18: 't' },
        { ghost: { 1: [2.4, 0], 4: [2.4, Math.PI], 7: [1.8, 0], 8: [1.8, Math.PI] }, lifts: [[0.92, 0.35, 1.0, 0.08]], jellies: [[0.5, 0.42, 0.04, 0.18, 2.4]], crab: { period: 2.8 } }),
    // ---- Abyssal Vents: anglerfish pull the pearl in ----
    reef('The Lure', 6, [...grid(2, 7, 0.42, 0.54), ...ring(0.5, 0.92, 0.2, 12)], { ...at([2, 5, 9], 'o'), ...at([14, 18, 22], 'o') },
        { anglers: [[0.5, 0.92, 0.3, 4]], hint: '🎣 An anglerfish\'s glowing lure pulls your pearl towards it. Use it to curve your shots!' }),
    reef('Two Anglers', 6, grid(6, 7, 0.45, 1.12), { ...at([0, 6, 21, 27, 35, 41], 'o') },
        { anglers: [[0.12, 0.78, 0.32, 3.5], [0.88, 0.78, 0.32, 3.5]] }),
    reef('Angler\'s Den', 6, ring(0.5, 0.8, 0.3, 16), { ...at([0, 4, 8, 12], 'o'), ...at([2, 10], 't'), ...at([6, 14], 'p') },
        { anglers: [[0.5, 0.8, 0.26, 4.5]], movers: kinds(wheel(0.5, 0.8, 0.14, 6, 1.2), { 0: 'o', 3: 'o' }) }),
    reef('Deep Pull', 6, [...grid(2, 6, 0.42, 0.54, 0.2, 0.8), ...grid(2, 6, 1.0, 1.12, 0.2, 0.8)], { ...at([1, 4, 7, 10], 'o'), ...at([13, 16, 19, 22], 'o') },
        { anglers: [[0.25, 0.8, 0.25, 4], [0.75, 0.8, 0.25, 4]], whirls: [[0.06, 0.5, 0.94, 0.5]], jellies: [[0.5, 0.78, 0.04, 0.15, 2.2]] }),
    reef('Puffer Trap', 6, [...ring(0.3, 0.8, 0.13, 8), ...ring(0.7, 0.8, 0.13, 8), ...grid(2, 7, 0.42, 0.54)], { ...at([0, 4], 'p'), ...at([8, 12], 'p'), ...at([2, 6, 10, 14], 'o'), ...at([18, 22], 'o'), 19: 't' },
        { anglers: [[0.3, 0.8, 0.22, 4], [0.7, 0.8, 0.22, 4]], crab: { period: 2.6 } }),
    reef('Leviathan Deep', 6, [...grid(2, 7, 0.42, 0.54), [0.5, 1.15]], { ...at([3, 10], 'o'), ...at([0, 6], 'p'), 14: 't' },
        { movers: [...kinds(wheel(0.28, 0.85, 0.15, 7, 1.1), { 0: 'o', 3: 'p' }).map((m, k) => (k % 2 ? { ...m, blink: [2, k] } : m)), ...kinds(wheel(0.72, 0.85, 0.15, 7, -1.1), { 0: 'o', 4: 'e' }).map((m, k) => (k % 2 ? { ...m, blink: [2, k + 1] } : m))],
          anglers: [[0.5, 0.72, 0.28, 3.5]], jellies: [[0.5, 1.02, 0.04, 0.3, 2.6]], lifts: [[0.06, 0.6, 1.15, 0.07], [0.94, 0.6, 1.15, 0.07]], crab: { period: 2.2, a: 0.38 } }),
    // ---- Starfish Shoals: starfish fling, golden oysters pay a pearl back ----
    reef('Starfish Springs', 7, grid(6, 7, 0.45, 1.15), { ...at([10, 17, 24, 31], 'o'), ...at([0, 6, 35, 41, 20], 's') },
        { hint: '⭐ Starfish never pop, and they fling your pearl off fast!' }),
    reef('Golden Find', 7, [...ring(0.5, 0.8, 0.28, 14), [0.5, 0.8], ...grid(2, 7, 0.42, 0.54)], { 14: 'g', ...at([0, 7], 'o'), ...at([3, 10], 's'), ...at([17, 20], 'o') },
        { hint: '🟡 A golden oyster takes three hits, and its pearl comes back to you.' }),
    reef('Pinball Shoal', 7, [[0.2, 0.5], [0.8, 0.5], [0.5, 0.62], [0.3, 0.78], [0.7, 0.78], [0.5, 0.95], [0.15, 1.05], [0.85, 1.05], ...grid(2, 6, 0.4, 0.48, 0.22, 0.78), ...grid(2, 7, 1.08, 1.18)],
        { 0: 's', 1: 's', 2: 's', 3: 's', 4: 's', 5: 's', 6: 's', 7: 's', ...at([9, 12, 15, 18], 'o'), ...at([21, 25, 29], 'o') }, { crab: { period: 3 } }),
    reef('Starry Wheel', 7, grid(2, 7, 1.05, 1.17), { ...at([2, 11], 'o') },
        { movers: [...kinds(wheel(0.5, 0.7, 0.25, 12, 0.8), { 0: 'g', 2: 's', 4: 'o', 6: 's', 8: 'o', 10: 's' }), ...kinds(wheel(0.5, 0.7, 0.11, 5, -1.4), { 0: 'o', 2: 's' })] }),
    reef('Gold Rush', 7, [...wave(0.45, 0.06, 9), ...wave(0.72, 0.06, 9, 2), ...wave(0.98, 0.05, 9, 4)], { 4: 'g', 22: 'g', ...at([0, 8, 18, 26], 's'), ...at([11, 15], 'p'), ...at([2, 6, 20, 24], 'o') },
        { jellies: [[0.5, 1.15, 0.04, 0.3, 2.6]] }),
    reef('Shoal Showdown', 7, [...grid(2, 7, 0.42, 0.54), [0.5, 0.82]], { ...at([3, 10], 'o'), 14: 'g', ...at([0, 6], 's'), 12: 't' },
        { movers: [...kinds(slider(0.68, 5, 0.14, 2.2, 0.2, 0.8), { 0: 's', 2: 'o', 4: 's' }), ...kinds(slider(0.98, 5, -0.14, 2.2, 0.2, 0.8), { 1: 'p', 3: 'o' })], lifts: [[0.06, 0.5, 1.15, 0.07]], crab: { period: 2.6 } }),
    // ---- Riptide Reef: currents push, giant clams open and shut ----
    reef('Riptide', 8, [...grid(2, 7, 0.4, 0.5), ...grid(3, 7, 0.95, 1.15)], { ...at([2, 5, 9, 12], 'o'), ...at([16, 19, 24, 31], 'o') },
        { currents: [[0, 0.6, 1, 0.68, 2.2], [0, 0.78, 1, 0.86, -2.2]], hint: '🌊 Currents push your pearl sideways as it falls through.' }),
    reef('Clam Cove', 8, [[0.25, 0.75], [0.5, 0.75], [0.75, 0.75], ...grid(2, 7, 0.42, 0.54), ...grid(2, 7, 1.05, 1.17)], { 0: 'o', 1: 'o', 2: 'o', ...at([5, 12], 'o') },
        { clams: [[0.25, 0.75, 3, 0], [0.5, 0.75, 3, 2.1], [0.75, 0.75, 3, 4.2]], hint: '🐚 Giant clams open and shut. Hit the oyster inside while its clam is open!' }),
    reef('Crosscurrent', 8, grid(5, 6, 0.48, 1.12, 0.2, 0.84), { ...at([2, 9, 14, 21, 26], 'o'), ...at([6, 17], 's') },
        { currents: [[0, 0.62, 0.5, 0.7, 2.4], [0.5, 0.62, 1, 0.7, -2.4], [0, 0.92, 1, 0.98, 1.8]], whirls: [[0.06, 0.4, 0.94, 1.0]] }),
    reef('Pearl Divers', 8, [[0.3, 0.7], [0.7, 0.7], [0.5, 0.95], ...ring(0.5, 0.82, 0.38, 14)], { 0: 'g', 1: 'o', 2: 'o', ...at([3, 10], 's'), ...at([6, 13], 'o'), 8: 'p' },
        { clams: [[0.3, 0.7, 2.6, 0], [0.7, 0.7, 2.6, Math.PI], [0.5, 0.95, 3.2, 1.6]], jellies: [[0.5, 0.45, 0.04, 0.3, 2.8]] }),
    reef('Undertow', 8, [...grid(2, 7, 0.42, 0.54), ...grid(2, 7, 1.02, 1.14)], { ...at([3, 10], 'o'), ...at([16, 23], 'o'), 19: 'g' },
        { currents: [[0, 0.62, 1, 0.7, -2], [0, 0.86, 1, 0.94, 2]], anglers: [[0.5, 0.78, 0.25, 3.5]], ghost: { 15: [2, 0], 17: [2, 2], 21: [2, 4], 26: [2, 1] } }),
    reef('Riptide Finale', 8, [[0.5, 0.75], ...grid(2, 7, 0.42, 0.54), [0.2, 1.1], [0.8, 1.1]], { 0: 'g', ...at([3, 10], 'o'), ...at([1, 13], 's'), 15: 'o', 16: 'o' },
        { clams: [[0.5, 0.75, 2.4, 0], [0.2, 1.1, 3, 1], [0.8, 1.1, 3, 4]],
          movers: [...kinds(wheel(0.5, 0.75, 0.2, 8, 0.9), { 0: 's', 2: 'p', 4: 's', 6: 't' })],
          currents: [[0, 0.95, 1, 1.0, 2]], lifts: [[0.06, 0.6, 1.0, 0.07], [0.94, 0.6, 1.0, 0.07]], crab: { period: 2.4, a: 0.36 } }),
];

const _pegs = lv => lv.pegs.map(p => ({ ...p, hp: p.kind === 'g' ? 3 : p.kind === 'o' || p.kind === 'p' ? 2 : 1, alive: true }));
export const begin = lv => ({ x: LAUNCH[0], y: LAUNCH[1], vx: 0, vy: 0, flying: false, used: 0, left: PEARLS, score: 0, chain: 0, shot: 0, pegs: _pegs(lv), t: 0, caught: 0, bonus: 0, last: '', double: false, warpT: -9, still: 0, sink: false, lifted: 0 });
export const copy = s => ({ ...s, pegs: s.pegs.map(p => ({ ...p })) });
export const moving = s => s.flying;
export const cleared = s => s.pegs.every(p => !_goal(p.kind) || !p.alive);
export const failed = (lv, s) => !s.flying && !cleared(s) && s.left <= 0;
export const shots = s => s.used;
export const origin = () => LAUNCH;
export const where = s => [s.pegs.filter(p => _goal(p.kind) && p.alive).length, s.pegs.filter(p => p.alive).length / 100];
export const score = (lv, s) => -s.pegs.reduce((a, p) => a + (_goal(p.kind) && p.alive ? p.hp * 10 : 0), 0) + s.pegs.filter(p => !p.alive).length * 0.1 + s.left * 4;
export const starsFor = (lv, s) => (s.left >= 5 ? 3 : s.left >= 2 ? 2 : 1);

/** The reef keeps moving between drops (the screen calls this while you aim). */
export function idle(lv, s, dt) { if (!s.flying) s.t += dt; }

export function shot(lv, s, angle, power) {
    if (s.flying || s.left <= 0) return;
    const a = Math.max(SEARCH.angleFrom, Math.min(SEARCH.angleTo, angle < 0 ? angle + Math.PI * 2 > Math.PI ? (angle < -Math.PI / 2 ? Math.PI - 0.05 : 0.05) : angle : angle));
    const v = (0.35 + 0.65 * Math.max(0, Math.min(1, power))) * MAX_V;
    s.x = LAUNCH[0]; s.y = LAUNCH[1]; s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v;
    s.flying = true; s.used++; s.left--; s.chain = 0; s.shot = 0; s.last = ''; s.double = false; s.still = 0; s.sink = false; s.lifted = 0;
}

function _pop(s, p, ev) {
    if (!p.alive || p.kind === 'r' || p.kind === 's') return;
    p.hp--;
    if ((p.kind === 'o' || p.kind === 'g') && p.hp > 0) { ev.opened.push(p); return; }
    if (p.kind === 'p' && p.hp > 0) { ev.puffed.push(p); return; }
    p.alive = false;
    s.chain++;
    const pts = (p.kind === 'g' ? 300 : p.kind === 'o' ? 100 : p.kind === 't' ? 50 : p.kind === 'p' ? 30 : 10) * s.chain;
    if (p.kind === 'g') { s.left++; ev.golden.push(p); }   // a golden pearl: one back
    if (p.kind === 't' && !s.double) { s.double = true; ev.chest.push(p); }
    s.shot += pts;
    ev.popped.push(p); ev.points.push(pts);
    if (p.kind === 'p') {   // burst: everything around it (oysters and puffers lose a hit each)
        ev.burst.push(p);
        const [px, py] = pegAt(p, s.t);
        for (const q of s.pegs) if (q.alive && q !== p && solid(q, s.t)) { const [qx, qy] = pegAt(q, s.t); if (Math.hypot(qx - px, qy - py) < BOMB_R && !guarded(s.lv || {}, qx, qy, s.t)) _pop(s, q, ev); }
    }
    if (p.kind === 'e') {   // zap everything near it (oysters lose a hit each)
        ev.zapped.push(p);
        const [px, py] = pegAt(p, s.t);
        for (const q of s.pegs) if (q.alive && q !== p && solid(q, s.t)) { const [qx, qy] = pegAt(q, s.t); if (Math.hypot(qx - px, qy - py) < ZAP_R && !guarded(s.lv || {}, qx, qy, s.t)) _pop(s, q, ev); }
    }
}

function _cap(s, max) { const sp = Math.hypot(s.vx, s.vy); if (sp > max) { s.vx *= max / sp; s.vy *= max / sp; } }
function _bounce(s, cx, cy, cr, e) {
    const dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy), min = cr + R;
    if (d >= min || d === 0) return false;
    const nx = dx / d, ny = dy / d;
    s.x = cx + nx * min; s.y = cy + ny * min;
    const vn = s.vx * nx + s.vy * ny;
    if (vn >= 0) return false;
    s.vx -= (1 + e) * vn * nx; s.vy -= (1 + e) * vn * ny;
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > MAX_V * 1.1) { s.vx *= MAX_V * 1.1 / sp; s.vy *= MAX_V * 1.1 / sp; }
    return true;
}

/** One step. Events: popped, points, opened, zapped, jelly (bounced off one), landed: 'crab' | 'sand', bonus. */
export function step(lv, s) {
    const ev = { popped: [], points: [], opened: [], zapped: [], puffed: [], burst: [], chest: [], star: [], golden: [], warped: false, jelly: false, landed: '', bonus: false };
    s.lv = lv;
    if (!s.flying) return ev;
    for (let k = 0; k < 2; k++) {
        s.t += DT / 2;
        s.vy += GRAV * DT / 2;
        s.x += s.vx * DT / 2; s.y += s.vy * DT / 2;
        if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx) * WALL_E; }
        if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx) * WALL_E; }
        if (s.y < R) { s.y = R; s.vy = Math.abs(s.vy) * WALL_E; }
        // resting on something for a second? it sinks through to the sand
        if (Math.hypot(s.vx, s.vy) < 0.15) { s.still += DT / 2; if (s.still > 1) s.sink = true; } else s.still = 0;
        for (const p of s.sink ? [] : s.pegs) {
            if (!p.alive || !solid(p, s.t)) continue;
            if (lv.clams && lv.clams.length) { const [gx, gy] = pegAt(p, s.t); if (guarded(lv, gx, gy, s.t)) continue; }
            const [px, py] = pegAt(p, s.t);
            if (_bounce(s, px, py, PEG_R, p.kind === 's' ? STAR_E : PEG_E)) { if (p.kind === 's') { ev.star.push(p); _cap(s, 2.6); } _pop(s, p, ev); }
        }
        for (const j of lv.jellies || []) { const [jx, jy, jr] = jellyAt(j, s.t); if (_bounce(s, jx, jy, jr, JELLY_E)) ev.jelly = true; }
        for (const c of lv.clams || []) if (shut(c, s.t) && _bounce(s, c[0], c[1], CLAM_R, CLAM_E)) ev.clam = true;
        for (const [x0, y0, x1, y1, ax] of lv.currents || []) {
            if (s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1) { s.vx = Math.max(-CURRENT_MAX, Math.min(CURRENT_MAX, s.vx + ax * DT / 2)); ev.current = true; }
        }
        for (const a of lv.anglers || []) {
            if (!s.sink) { const [ax, ay] = lure(a, s.x, s.y); s.vx += ax * DT / 2; s.vy += ay * DT / 2; }
            if (_bounce(s, a[0], a[1], ANGLER_R, ANGLER_E)) ev.angler = true;
        }
        // a whirlpool: in one, out of its twin (just past it, the same way), then a moment before another
        if (s.t - s.warpT > 0.35) for (const [ax, ay, bx, by] of lv.whirls || []) {
            for (const [ix, iy, ox, oy] of [[ax, ay, bx, by], [bx, by, ax, ay]]) {
                if (Math.hypot(s.x - ix, s.y - iy) < WHIRL_R) {
                    const sp = Math.hypot(s.vx, s.vy) || 1;
                    s.x = ox + (s.vx / sp) * (WHIRL_R + R + 0.005); s.y = oy + (s.vy / sp) * (WHIRL_R + R + 0.005);
                    s.warpT = s.t; ev.warped = true; break;
                }
            }
            if (ev.warped) break;
        }
        // a bubble lift: pushes up while the pearl is in its column
        for (const [lx, top, bottom, w] of lv.lifts || []) {
            if (s.lifted < LIFT_SECS && Math.abs(s.x - lx) < w / 2 && s.y > top && s.y < bottom) { s.vy = Math.max(-LIFT_MAX, s.vy - LIFT * DT / 2); s.lifted += DT / 2; ev.lifted = true; }
        }
    }
    if (s.y > FLOOR_Y) {
        const inShell = Math.abs(s.x - crabX(lv, s.t)) < CRAB_W / 2;
        ev.landed = s.last = inShell ? 'crab' : 'sand';
        s.score += s.shot * (inShell ? CATCH_X : 1) * (s.double ? 2 : 1);
        if (inShell) { s.left++; s.caught++; }
        if (s.chain >= BIG_CHAIN) { s.left++; s.bonus++; ev.bonus = true; }
        s.flying = false; s.vx = s.vy = 0;
    }
    return ev;
}

export function settle(lv, s, maxSteps = 120 * 20) {
    for (let i = 0; i < maxSteps && s.flying; i++) step(lv, s);
    s.flying = false;
    return s;
}
