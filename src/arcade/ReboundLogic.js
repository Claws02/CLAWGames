// ============================================================
// REBOUND — the physics and the levels. No DOM (Rebound.js is the screen), so
// qa/rebound.mjs can prove every level can be cleared within its par.
//
// A tank 1 wide and 1.5 tall. A pearl is flicked (an angle and a power) and
// rolls, slowing down, bouncing off the walls, the round bumpers and the
// blocks. Every clam it touches pops. The next flick starts where it stopped.
// Clear every clam; par is the fewest flicks a search found.
//
// The deeper worlds add:
//   MOVING REEFS   bumpers and blocks that slide back and forth while the
//                  pearl rolls (they wait while you aim): read where they'll be
//   PORTALS        a pair of whirlpools: in one, out of the other, same speed
//                  and direction
//   CORAL          walls that crack on the first hit and break on the second
//   URCHINS        touch one and the pearl goes back to where that flick
//                  started (clams it already popped stay popped)
//   SWITCH & GATES a switch clam opens every gate in the tank, for good
//
// Fixed steps, no randomness: the same flick from the same spot always ends
// the same way, on every phone and in the probe.
// ============================================================
export const W = 1, H = 1.5;
export const R = 0.03;            // the pearl
export const CLAM_R = 0.036;
export const MAX_V = 2.6;         // a full-power flick
export const FRICTION = 0.9;      // speed lost per second, as a fraction (exponential)
export const STOP_V = 0.04;
export const DT = 1 / 120;
export const PORTAL_R = 0.05, URCHIN_R = 0.04, SWITCH_R = 0.04;
const WALL_E = 0.9, BUMP_E = 0.95;

// A level: start, clams [x, y], bumpers [x, y, r], blocks [x, y, w, h], par (flicks), and optionally
//   movers  [{ bumper: [x, y, r] | block: [x, y, w, h], dx, dy, period }]  sliding (x, y) ± (dx, dy)
//   portals [[ax, ay, bx, by]]   coral [[x, y, w, h]]   urchins [[x, y]]   switch [x, y]   gates [[x, y, w, h]]
// Every par is the fewest flicks solve() found (qa/rebound.mjs checks it still can).
const L = (name, world, o) => ({ name, world, bumpers: [], blocks: [], ...o });
export const WORLDS = ['Lagoon', 'Reef', 'Wreck', 'Abyss'];
export const LEVELS = [
    // ---- World 1: Lagoon ----
    L('First Flick', 0, { start: [0.5, 1.3], clams: [[0.5, 0.35]], par: 1 }),
    L('In a Row', 0, { start: [0.5, 1.3], clams: [[0.5, 0.9], [0.5, 0.55], [0.5, 0.2]], par: 1 }),
    L('Bank Shot', 0, { start: [0.5, 1.3], clams: [[0.5, 0.3]], blocks: [[0.25, 0.7, 0.5, 0.06]], par: 1 }),
    L('Four Corners', 0, { start: [0.5, 0.75], clams: [[0.1, 0.1], [0.9, 0.1], [0.1, 1.4], [0.9, 1.4]], par: 3 }),
    L('Pinball', 0, { start: [0.5, 1.35], clams: [[0.2, 0.25], [0.8, 0.25], [0.5, 0.55], [0.15, 0.9], [0.85, 0.9]], bumpers: [[0.35, 0.55, 0.06], [0.65, 0.55, 0.06], [0.5, 0.3, 0.06], [0.5, 0.95, 0.07]], par: 2 }),
    L('Zig-Zag', 0, { start: [0.15, 1.35], clams: [[0.85, 1.05], [0.15, 0.75], [0.85, 0.45], [0.15, 0.15]], blocks: [[0, 0.92, 0.65, 0.05], [0.35, 0.62, 0.65, 0.05], [0, 0.32, 0.65, 0.05]], par: 2 }),
    L('Ring Road', 0, { start: [0.5, 1.35], clams: [[0.5, 0.42], [0.72, 0.6], [0.72, 0.9], [0.5, 1.08], [0.28, 0.9], [0.28, 0.6]], bumpers: [[0.5, 0.75, 0.12]], par: 2 }),
    L('The Vault', 0, { start: [0.5, 1.35], clams: [[0.5, 0.28], [0.15, 1.0], [0.85, 1.0]], bumpers: [[0.25, 0.75, 0.05], [0.75, 0.75, 0.05]], blocks: [[0.25, 0.12, 0.08, 0.36], [0.67, 0.12, 0.08, 0.36], [0.25, 0.12, 0.17, 0.05], [0.58, 0.12, 0.17, 0.05]], par: 2 }),
    // ---- World 2: Reef — moving reefs and portals ----
    L('Drifting Reef', 1, { start: [0.5, 1.35], clams: [[0.5, 0.25], [0.2, 0.6], [0.8, 0.6]], movers: [{ bumper: [0.5, 0.85, 0.09], dx: 0.32, dy: 0, period: 2.4 }], par: 1 }),
    L('Sliding Doors', 1, { start: [0.5, 1.35], clams: [[0.3, 0.25], [0.7, 0.25], [0.5, 0.45]], movers: [{ block: [-0.05, 0.8, 0.5, 0.05], dx: 0.2, dy: 0, period: 3 }, { block: [0.55, 0.8, 0.5, 0.05], dx: -0.2, dy: 0, period: 3 }], par: 2 }),
    L('Whirlpool', 1, { start: [0.5, 1.35], clams: [[0.15, 0.15], [0.85, 0.15], [0.5, 0.2]], blocks: [[0, 0.7, 1, 0.06]], portals: [[0.5, 1.0, 0.5, 0.45]], par: 2 }),
    L('Round Trip', 1, { start: [0.85, 1.35], clams: [[0.15, 0.9], [0.5, 0.6], [0.15, 0.2], [0.5, 0.15]], blocks: [[0, 0.75, 0.75, 0.05], [0.25, 0.4, 0.75, 0.05]], portals: [[0.12, 1.3, 0.88, 0.12]], par: 3 }),
    L('Conveyor', 1, { start: [0.5, 1.35], clams: [[0.15, 0.2], [0.5, 0.15], [0.85, 0.2], [0.85, 1.0]], movers: [{ bumper: [0.25, 0.75, 0.06], dx: 0.15, dy: 0, period: 1.6 }, { bumper: [0.5, 0.6, 0.06], dx: -0.2, dy: 0, period: 2.2 }, { bumper: [0.75, 0.45, 0.06], dx: 0.15, dy: 0, period: 1.8 }], par: 2 }),
    L('Pinwheel', 1, { start: [0.5, 1.35], clams: [[0.1, 0.1], [0.9, 0.1], [0.1, 1.0], [0.9, 1.0], [0.3, 0.4]], bumpers: [[0.2, 0.7, 0.06], [0.8, 0.7, 0.06]], movers: [{ block: [0.47, 0.3, 0.06, 0.3], dx: 0, dy: 0.25, period: 2.5 }], par: 3 }),
    L('Twin Tides', 1, { start: [0.5, 1.35], clams: [[0.2, 0.25], [0.5, 0.3], [0.8, 0.4], [0.5, 0.9]], blocks: [[0, 0.55, 0.4, 0.05], [0.6, 0.55, 0.4, 0.05]], movers: [{ bumper: [0.5, 0.57, 0.06], dx: 0.12, dy: 0, period: 2 }], portals: [[0.08, 1.0, 0.92, 0.2]], par: 2 }),
    L('Reef Rumble', 1, { start: [0.5, 1.35], clams: [[0.15, 0.4], [0.85, 0.4], [0.5, 0.2], [0.2, 1.1], [0.8, 0.75], [0.5, 1.0]], bumpers: [[0.5, 0.75, 0.07]], movers: [{ bumper: [0.3, 0.45, 0.05], dx: 0.15, dy: 0.1, period: 2.6 }, { bumper: [0.7, 1.0, 0.05], dx: -0.15, dy: 0.1, period: 2.2 }], portals: [[0.1, 0.1, 0.9, 1.4]], par: 2 }),
    // ---- World 3: Wreck — coral, urchins, switch & gates ----
    L('Brittle', 2, { start: [0.5, 1.35], clams: [[0.5, 0.3], [0.2, 0.45], [0.8, 0.45]], coral: [[0, 0.7, 1, 0.05]], par: 2 }),
    L('Coral Cage', 2, { start: [0.5, 1.35], clams: [[0.5, 0.42], [0.15, 0.2], [0.85, 0.8]], coral: [[0.3, 0.25, 0.4, 0.05], [0.3, 0.55, 0.4, 0.05], [0.3, 0.25, 0.05, 0.35], [0.65, 0.25, 0.05, 0.35]], par: 2 }),
    L('Prickly', 2, { start: [0.5, 1.35], clams: [[0.5, 0.3], [0.1, 0.3], [0.9, 0.3]], urchins: [[0.2, 0.75], [0.4, 0.75], [0.6, 0.75], [0.8, 0.75]], par: 2 }),
    L('Urchin Alley', 2, { start: [0.15, 1.35], clams: [[0.15, 0.1], [0.8, 0.15], [0.6, 1.3], [0.85, 0.85]], blocks: [[0.3, 0.3, 0.05, 1.2]], urchins: [[0.08, 1.0], [0.22, 0.65], [0.08, 0.35], [0.6, 0.9], [0.75, 0.5]], par: 3 }),
    L('The Switch', 2, { start: [0.5, 1.35], clams: [[0.5, 0.3], [0.85, 0.9]], gates: [[0.3, 0.12, 0.4, 0.05], [0.3, 0.45, 0.4, 0.05], [0.3, 0.12, 0.05, 0.38], [0.65, 0.12, 0.05, 0.38]], switch: [0.12, 0.9], par: 2 }),
    L('Locked Hold', 2, { start: [0.5, 1.35], clams: [[0.82, 0.15], [0.3, 0.4]], coral: [[0, 1.0, 0.4, 0.05]], switch: [0.15, 0.85], gates: [[0.6, 0, 0.05, 0.35], [0.6, 0.3, 0.4, 0.05]], par: 2 }),
    L('Shipwreck', 2, { start: [0.5, 1.35], clams: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.45], [0.15, 1.1], [0.85, 1.1]], blocks: [[0.45, 0.2, 0.1, 0.15]], coral: [[0.2, 0.6, 0.6, 0.05]], urchins: [[0.1, 0.6], [0.9, 0.6], [0.5, 0.95]], par: 3 }),
    L("Captain's Cabin", 2, { start: [0.5, 1.35], clams: [[0.4, 0.3], [0.6, 0.3], [0.12, 0.5]], gates: [[0.25, 0.15, 0.5, 0.05], [0.25, 0.15, 0.05, 0.35], [0.7, 0.15, 0.05, 0.35], [0.25, 0.45, 0.5, 0.05]], switch: [0.88, 1.0], urchins: [[0.75, 1.0], [0.88, 0.85]], coral: [[0, 0.75, 0.35, 0.05]], par: 1 }),
    // ---- World 4: Abyss — everything at once ----
    L('Deep Current', 3, { start: [0.5, 1.35], clams: [[0.25, 0.3], [0.75, 0.3], [0.5, 0.15], [0.3, 1.0], [0.7, 1.0]], blocks: [[0, 0.7, 0.42, 0.05], [0.58, 0.7, 0.42, 0.05]], bumpers: [[0.5, 0.4, 0.07]], portals: [[0.1, 1.2, 0.9, 0.15], [0.9, 1.2, 0.1, 0.15]], par: 2 }),
    L('Lantern Fish', 3, { start: [0.5, 1.35], clams: [[0.2, 0.25], [0.8, 0.25], [0.5, 0.3], [0.15, 1.15], [0.85, 1.15]], movers: [{ bumper: [0.5, 0.6, 0.06], dx: 0.35, dy: 0, period: 2.8 }, { bumper: [0.5, 0.95, 0.06], dx: -0.35, dy: 0, period: 2 }], urchins: [[0.15, 0.78], [0.85, 0.78], [0.5, 0.78]], par: 2 }),
    L('Trench', 3, { start: [0.15, 1.35], clams: [[0.15, 0.6], [0.5, 0.5], [0.5, 1.1], [0.85, 0.3], [0.85, 0.9]], blocks: [[0.3, 0.25, 0.05, 1.25], [0.65, 0, 0.05, 1.25]], portals: [[0.15, 0.1, 0.85, 1.35]], par: 2 }),
    L('Pressure', 3, { start: [0.5, 1.35], clams: [[0.5, 0.2], [0.15, 0.6], [0.85, 0.6], [0.5, 1.0]], coral: [[0.2, 0.8, 0.6, 0.05], [0.2, 0.4, 0.6, 0.05]], movers: [{ block: [0.4, 0.6, 0.2, 0.05], dx: 0.3, dy: 0, period: 2.4 }], par: 2 }),
    L('Ink Cloud', 3, { start: [0.5, 1.35], clams: [[0.2, 0.2], [0.5, 0.3], [0.8, 0.2], [0.5, 0.9]], gates: [[0, 0.5, 1, 0.05]], blocks: [[0.75, 0.55, 0.05, 0.5], [0.75, 1.05, 0.25, 0.05]], switch: [0.9, 0.8], portals: [[0.15, 1.2, 0.9, 0.65]], par: 3 }),
    L("Kraken's Arms", 3, { start: [0.5, 1.35], clams: [[0.5, 0.15], [0.2, 0.25], [0.8, 0.55], [0.2, 0.85], [0.75, 1.2]], movers: [{ block: [0.05, 0.4, 0.35, 0.05], dx: 0.15, dy: 0, period: 2.2 }, { block: [0.6, 0.7, 0.35, 0.05], dx: -0.15, dy: 0, period: 2.6 }, { block: [0.05, 1.0, 0.35, 0.05], dx: 0.15, dy: 0, period: 3 }], urchins: [[0.9, 0.4], [0.1, 0.7], [0.9, 1.0]], par: 2 }),
    L('Leviathan', 3, { start: [0.5, 1.35], clams: [[0.5, 0.3], [0.2, 0.25], [0.88, 0.13], [0.15, 0.95], [0.85, 0.95], [0.5, 0.85]], coral: [[0.35, 0.95, 0.3, 0.05]], urchins: [[0.1, 0.5], [0.9, 0.5]], movers: [{ bumper: [0.5, 0.6, 0.07], dx: 0.2, dy: 0.05, period: 2.4 }], portals: [[0.08, 1.35, 0.92, 0.08]], switch: [0.5, 1.12], gates: [[0.75, 0.2, 0.25, 0.05], [0.75, 0, 0.05, 0.25]], par: 3 }),
    L('The Abyss', 3, { start: [0.5, 1.4], clams: [[0.5, 0.17], [0.2, 0.25], [0.8, 0.55], [0.15, 0.85], [0.85, 0.85], [0.5, 1.15]], portals: [[0.1, 0.1, 0.9, 1.25]], movers: [{ bumper: [0.5, 0.5, 0.06], dx: 0.3, dy: 0, period: 2 }, { block: [0.3, 0.9, 0.4, 0.05], dx: 0.25, dy: 0, period: 3.2 }], coral: [[0, 0.7, 0.3, 0.05], [0.7, 0.7, 0.3, 0.05]], urchins: [[0.5, 0.7], [0.15, 1.1], [0.85, 0.3]], switch: [0.12, 0.4], gates: [[0.38, 0.05, 0.24, 0.05], [0.38, 0.05, 0.05, 0.25], [0.57, 0.05, 0.05, 0.25], [0.38, 0.25, 0.24, 0.05]], par: 3 }),
];

// ---- state ----------------------------------------------------------------------------
/** A fresh state for a level: the pearl at the start, no clams popped. */
export const begin = lv => ({
    x: lv.start[0], y: lv.start[1], vx: 0, vy: 0, fx: lv.start[0], fy: lv.start[1],
    popped: lv.clams.map(() => false), flicks: 0, t: 0,
    coral: (lv.coral || []).map(() => 2), open: false, warp: -1, stung: 0,
});
export const cleared = s => s.popped.every(Boolean);
export const moving = s => Math.hypot(s.vx, s.vy) > STOP_V;
export const copy = s => ({ ...s, popped: s.popped.slice(), coral: s.coral.slice() });

/** Flick: angle in radians (0 = right, -π/2 = up), power 0..1. */
export function flick(s, angle, power) {
    const v = Math.max(0.05, Math.min(1, power)) * MAX_V;
    s.vx = Math.cos(angle) * v; s.vy = Math.sin(angle) * v;
    s.fx = s.x; s.fy = s.y;
    s.flicks++;
}

/** Where a moving reef is at time t. */
export function moverAt(m, t) {
    const k = Math.sin((t / m.period) * Math.PI * 2);
    if (m.bumper) { const [x, y, r] = m.bumper; return { bumper: [x + m.dx * k, y + m.dy * k, r] }; }
    const [x, y, w, h] = m.block; return { block: [x + m.dx * k, y + m.dy * k, w, h] };
}

// Push the pearl out of a circle and bounce it off.
function _bounceCircle(s, cx, cy, cr, e) {
    const dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy), min = cr + R;
    if (d >= min || d === 0) return false;
    const nx = dx / d, ny = dy / d;
    s.x = cx + nx * min; s.y = cy + ny * min;
    const vn = s.vx * nx + s.vy * ny;
    if (vn < 0) { s.vx -= (1 + e) * vn * nx; s.vy -= (1 + e) * vn * ny; return true; }
    return false;
}
// Bounce off a box. Returns true when the pearl was heading into it (a real hit).
function _bounceBox(s, bx, by, bw, bh) {
    const px = Math.max(bx, Math.min(s.x, bx + bw)), py = Math.max(by, Math.min(s.y, by + bh));
    let dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy);
    if (d >= R) return false;
    let nx, ny;
    if (d > 1e-9) { nx = dx / d; ny = dy / d; }
    else {   // the centre got inside: out along the shortest way
        const l = s.x - bx, r = bx + bw - s.x, t = s.y - by, b = by + bh - s.y, m = Math.min(l, r, t, b);
        [nx, ny] = m === l ? [-1, 0] : m === r ? [1, 0] : m === t ? [0, -1] : [0, 1];
        d = 0;
    }
    s.x += nx * (R - d); s.y += ny * (R - d);
    const vn = s.vx * nx + s.vy * ny;
    if (vn < 0) { s.vx -= (1 + WALL_E) * vn * nx; s.vy -= (1 + WALL_E) * vn * ny; return true; }
    return false;
}

/** One fixed step. Returns what happened in it: { popped: [i], cracked: [i], warped, stung, opened }. */
export function step(lv, s) {
    const ev = { popped: [], cracked: [], warped: false, stung: false, opened: false };
    if (!moving(s)) { s.vx = s.vy = 0; return ev; }
    // Two half-steps: a fast pearl never tunnels through a thin block.
    for (let k = 0; k < 2; k++) {
        s.t += DT / 2;
        s.x += s.vx * DT / 2; s.y += s.vy * DT / 2;
        if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx) * WALL_E; }
        if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx) * WALL_E; }
        if (s.y < R) { s.y = R; s.vy = Math.abs(s.vy) * WALL_E; }
        if (s.y > H - R) { s.y = H - R; s.vy = -Math.abs(s.vy) * WALL_E; }
        for (const [bx, by, br] of lv.bumpers) _bounceCircle(s, bx, by, br, BUMP_E);
        for (const [bx, by, bw, bh] of lv.blocks) _bounceBox(s, bx, by, bw, bh);
        for (const m of lv.movers || []) {
            const p = moverAt(m, s.t);
            if (p.bumper) _bounceCircle(s, p.bumper[0], p.bumper[1], p.bumper[2], BUMP_E);
            else _bounceBox(s, ...p.block);
        }
        (lv.coral || []).forEach((c, i) => {
            if (s.coral[i] > 0 && _bounceBox(s, ...c)) { s.coral[i]--; ev.cracked.push(i); }
        });
        if (!s.open) for (const g of lv.gates || []) _bounceBox(s, ...g);
        // Portals: in one, out of the other (not straight back in)
        (lv.portals || []).forEach(([ax, ay, bx, by], i) => {
            const inA = Math.hypot(s.x - ax, s.y - ay) < PORTAL_R * 0.7, inB = Math.hypot(s.x - bx, s.y - by) < PORTAL_R * 0.7;
            if (s.warp === i) { if (Math.hypot(s.x - ax, s.y - ay) > PORTAL_R + R && Math.hypot(s.x - bx, s.y - by) > PORTAL_R + R) s.warp = -1; return; }
            if (inA || inB) { const [tx, ty] = inA ? [bx, by] : [ax, ay]; s.x = tx; s.y = ty; s.warp = i; ev.warped = true; }
        });
        // Urchins: back to where this flick started
        for (const [ux, uy] of lv.urchins || []) {
            if (Math.hypot(s.x - ux, s.y - uy) < URCHIN_R + R) { s.x = s.fx; s.y = s.fy; s.vx = s.vy = 0; s.stung++; ev.stung = true; return ev; }
        }
        if (lv.switch && !s.open && Math.hypot(s.x - lv.switch[0], s.y - lv.switch[1]) < SWITCH_R + R) { s.open = true; ev.opened = true; }
        lv.clams.forEach(([cx, cy], i) => {
            if (!s.popped[i] && Math.hypot(s.x - cx, s.y - cy) < R + CLAM_R) { s.popped[i] = true; ev.popped.push(i); }
        });
    }
    const f = Math.exp(-FRICTION * DT);
    s.vx *= f; s.vy *= f;
    return ev;
}

/** Roll until the pearl stops (or a safety cap). */
export function settle(lv, s, maxSteps = 120 * 20) {
    for (let i = 0; i < maxSteps && moving(s); i++) step(lv, s);
    s.vx = s.vy = 0;
    return s;
}

/**
 * The fewest flicks a search finds to clear the level (up to maxDepth), and
 * the flicks themselves. A beam search over a grid of angles and powers.
 */
export function solve(lv, { maxDepth = 4, angles = 120, powers = [0.3, 0.5, 0.7, 0.9, 1], beam = 8 } = {}) {
    let frontier = [{ s: begin(lv), path: [] }];
    const score = s => s.popped.filter(Boolean).length * 10 + (s.open ? 3 : 0) + s.coral.filter(h => h === 0).length * 2;
    for (let depth = 1; depth <= maxDepth; depth++) {
        const next = [];
        for (const node of frontier) {
            for (let a = 0; a < angles; a++) for (const p of powers) {
                const s = copy(node.s), ang = (a / angles) * Math.PI * 2;
                flick(s, ang, p); settle(lv, s);
                const path = [...node.path, [ang, p]];
                if (cleared(s)) return { flicks: depth, path };
                next.push({ s, path, n: score(s) });
            }
        }
        // Keep the states that did the most (spread out, so the beam isn't one spot many times).
        next.sort((a, b) => b.n - a.n);
        frontier = [];
        for (const c of next) {
            if (frontier.length >= beam) break;
            if (frontier.every(f => f.n !== c.n || Math.hypot(f.s.x - c.s.x, f.s.y - c.s.y) > 0.08)) frontier.push(c);
        }
    }
    return null;
}

export const stars = (flicks, par) => (flicks <= par ? 3 : flicks <= par + 2 ? 2 : 1);

// ---- the daily tank -------------------------------------------------------------------------
/**
 * A random tank from a seeded random: clams, bumpers, a block or two, and one
 * of the deeper mechanics. Par is set by scripts/rebound-dailies.mjs, which
 * runs solve() on each one (too slow to do on a phone every day).
 */
export function randomTank(rnd) {
    const clams = [], bumpers = [], blocks = [], free = (x, y, d) => [...clams, ...bumpers].every(([cx, cy]) => Math.hypot(cx - x, cy - y) > d);
    const pick = (y0, y1) => [0.1 + rnd() * 0.8, y0 + rnd() * (y1 - y0)];
    const nB = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < 40 && bumpers.length < nB; i++) { const [x, y] = pick(0.25, 1.05); if (free(x, y, 0.2)) bumpers.push([x, y, 0.045 + rnd() * 0.04]); }
    if (rnd() < 0.7) { const w = 0.25 + rnd() * 0.3; blocks.push([0.05 + rnd() * (0.9 - w), 0.35 + rnd() * 0.6, w, 0.045]); }
    const nC = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < 80 && clams.length < nC; i++) {
        const [x, y] = pick(0.08, 1.15);
        if (free(x, y, 0.13) && blocks.every(([bx, by, bw, bh]) => x < bx - 0.06 || x > bx + bw + 0.06 || y < by - 0.06 || y > by + bh + 0.06)) clams.push([x, y]);
    }
    const lv = { name: 'Daily Tank', world: 4, start: [0.5, 1.36], clams, bumpers, blocks };
    const twist = Math.floor(rnd() * 4);
    if (twist === 0) lv.portals = [[0.1 + rnd() * 0.15, 0.2 + rnd() * 0.9, 0.75 + rnd() * 0.15, 0.2 + rnd() * 0.9]];
    else if (twist === 1) lv.movers = [{ bumper: [0.5, 0.3 + rnd() * 0.6, 0.06], dx: 0.25 + rnd() * 0.1, dy: 0, period: 2 + rnd() * 2 }];
    else if (twist === 2) lv.coral = [[0.05 + rnd() * 0.5, 0.25 + rnd() * 0.7, 0.4, 0.045]];
    return lv;
}
