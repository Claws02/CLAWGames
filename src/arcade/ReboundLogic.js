// ============================================================
// REBOUND — the physics and the levels. No DOM (Rebound.js is the screen), so
// qa/rebound.mjs can prove every level can be cleared within its par.
//
// A tank 1 wide and 1.5 tall. A pearl is flicked (an angle and a power) and
// rolls, slowing down, bouncing off the walls, the round bumpers and the
// blocks. Every clam it touches pops. The next flick starts where it stopped.
// Clear every clam; par is the fewest flicks a search found.
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
const WALL_E = 0.9, BUMP_E = 0.95;

// Each level: start, clams [x, y], bumpers [x, y, r], blocks [x, y, w, h], par (flicks).
// Every par is the fewest flicks solve() found (qa/rebound.mjs checks it still can).
export const LEVELS = [
    { name: 'First Flick',  start: [0.5, 1.3], clams: [[0.5, 0.35]], bumpers: [], blocks: [], par: 1 },
    { name: 'In a Row',     start: [0.5, 1.3], clams: [[0.5, 0.9], [0.5, 0.55], [0.5, 0.2]], bumpers: [], blocks: [], par: 1 },
    { name: 'Bank Shot',    start: [0.5, 1.3], clams: [[0.5, 0.3]], bumpers: [], blocks: [[0.25, 0.7, 0.5, 0.06]], par: 1 },
    { name: 'Four Corners', start: [0.5, 0.75], clams: [[0.1, 0.1], [0.9, 0.1], [0.1, 1.4], [0.9, 1.4]], bumpers: [], blocks: [], par: 3 },
    { name: 'Pinball',      start: [0.5, 1.35], clams: [[0.2, 0.25], [0.8, 0.25], [0.5, 0.55], [0.15, 0.9], [0.85, 0.9]], bumpers: [[0.35, 0.55, 0.06], [0.65, 0.55, 0.06], [0.5, 0.3, 0.06], [0.5, 0.95, 0.07]], blocks: [], par: 2 },
    { name: 'Zig-Zag',      start: [0.15, 1.35], clams: [[0.85, 1.05], [0.15, 0.75], [0.85, 0.45], [0.15, 0.15]], bumpers: [], blocks: [[0, 0.92, 0.65, 0.05], [0.35, 0.62, 0.65, 0.05], [0, 0.32, 0.65, 0.05]], par: 2 },
    { name: 'Ring Road',    start: [0.5, 1.35], clams: [[0.5, 0.42], [0.72, 0.6], [0.72, 0.9], [0.5, 1.08], [0.28, 0.9], [0.28, 0.6]], bumpers: [[0.5, 0.75, 0.12]], blocks: [], par: 2 },
    { name: 'The Vault',    start: [0.5, 1.35], clams: [[0.5, 0.28], [0.15, 1.0], [0.85, 1.0]], bumpers: [[0.25, 0.75, 0.05], [0.75, 0.75, 0.05]], blocks: [[0.25, 0.12, 0.08, 0.36], [0.67, 0.12, 0.08, 0.36], [0.25, 0.12, 0.17, 0.05], [0.58, 0.12, 0.17, 0.05]], par: 2 },
];

/** A fresh state for a level: the pearl at the start, no clams popped. */
export const begin = lv => ({ x: lv.start[0], y: lv.start[1], vx: 0, vy: 0, popped: lv.clams.map(() => false), flicks: 0 });
export const cleared = s => s.popped.every(Boolean);
export const moving = s => Math.hypot(s.vx, s.vy) > STOP_V;

/** Flick: angle in radians (0 = right, -π/2 = up), power 0..1. */
export function flick(s, angle, power) {
    const v = Math.max(0.05, Math.min(1, power)) * MAX_V;
    s.vx = Math.cos(angle) * v; s.vy = Math.sin(angle) * v;
    s.flicks++;
}

// Push the pearl out of a circle and bounce it off.
function _bounceCircle(s, cx, cy, cr, e) {
    const dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy), min = cr + R;
    if (d >= min || d === 0) return false;
    const nx = dx / d, ny = dy / d;
    s.x = cx + nx * min; s.y = cy + ny * min;
    const vn = s.vx * nx + s.vy * ny;
    if (vn < 0) { s.vx -= (1 + e) * vn * nx; s.vy -= (1 + e) * vn * ny; }
    return true;
}
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
    if (vn < 0) { s.vx -= (1 + WALL_E) * vn * nx; s.vy -= (1 + WALL_E) * vn * ny; }
    return true;
}

/** One fixed step. Returns the clams popped in it (indices). */
export function step(lv, s) {
    const popped = [];
    if (!moving(s)) { s.vx = s.vy = 0; return popped; }
    // Two half-steps: a fast pearl never tunnels through a thin block.
    for (let k = 0; k < 2; k++) {
        s.x += s.vx * DT / 2; s.y += s.vy * DT / 2;
        if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx) * WALL_E; }
        if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx) * WALL_E; }
        if (s.y < R) { s.y = R; s.vy = Math.abs(s.vy) * WALL_E; }
        if (s.y > H - R) { s.y = H - R; s.vy = -Math.abs(s.vy) * WALL_E; }
        for (const [bx, by, br] of lv.bumpers) _bounceCircle(s, bx, by, br, BUMP_E);
        for (const [bx, by, bw, bh] of lv.blocks) _bounceBox(s, bx, by, bw, bh);
        lv.clams.forEach(([cx, cy], i) => {
            if (!s.popped[i] && Math.hypot(s.x - cx, s.y - cy) < R + CLAM_R) { s.popped[i] = true; popped.push(i); }
        });
    }
    const f = Math.exp(-FRICTION * DT);
    s.vx *= f; s.vy *= f;
    return popped;
}

/** Roll until the pearl stops (or a safety cap). */
export function settle(lv, s, maxSteps = 120 * 20) {
    for (let i = 0; i < maxSteps && moving(s); i++) step(lv, s);
    s.vx = s.vy = 0;
    return s;
}

const _copy = s => ({ ...s, popped: s.popped.slice() });

/**
 * The fewest flicks a search finds to clear the level (up to maxDepth), and
 * the flicks themselves. A beam search over a grid of angles and powers.
 */
export function solve(lv, { maxDepth = 4, angles = 120, powers = [0.3, 0.5, 0.7, 0.9, 1], beam = 8 } = {}) {
    let frontier = [{ s: begin(lv), path: [] }];
    for (let depth = 1; depth <= maxDepth; depth++) {
        const next = [];
        for (const node of frontier) {
            for (let a = 0; a < angles; a++) for (const p of powers) {
                const s = _copy(node.s), ang = (a / angles) * Math.PI * 2;
                flick(s, ang, p); settle(lv, s);
                const path = [...node.path, [ang, p]];
                if (cleared(s)) return { flicks: depth, path };
                next.push({ s, path, n: s.popped.filter(Boolean).length });
            }
        }
        // Keep the states that popped the most (spread out, so the beam isn't one spot many times).
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
