// ============================================================
// SEA SNOOKER — the physics and the racks. No DOM (Snooker.js is the screen,
// via AimScreen), so qa/aimgames.mjs proves every par.
//
// A table with six pockets. Pull back and flick the white pearl: it knocks
// the numbered clams about (they bounce off each other and the cushions) and
// slows to a stop. Pot the clams in number order: one potted out of turn is
// put back on its spot after the shot. Pot the pearl and it's put back too,
// at a cost of one extra shot. Par is the fewest shots a search finds.
// ============================================================
export const W = 1, H = 1.5, DT = 1 / 120;
export const R = 0.032, POCKET_R = 0.062;
export const POCKETS = [[0, 0], [1, 0], [0, 0.75], [1, 0.75], [0, 1.5], [1, 1.5]];
const FRICTION = 0.85, CUSHION_E = 0.82, BALL_E = 0.96, STOP = 0.03, MAX_V = 3.0, CUE = [0.5, 1.2];
export const SEARCH = { angles: 48, powers: [0.4, 0.65, 0.9, 1], beam: 6 };
export const COLORS = ['#ffffff', '#facc15', '#3b82f6', '#ef4444', '#a855f7', '#f97316', '#22c55e'];

const L = (name, world, clams, par = 0, hint) => ({ name, world, clams, par, hint });
export const WORLDS = ['🎱 Rock Pool', '🌊 Deep Table'];
export const LEVELS = [
    L('First Pot', 0, [[0.5, 0.4]], 2, '🎱 Flick the white pearl into the clams. Pot them in number order.'),
    L('Corner Shot', 0, [[0.8, 0.22]], 2),
    L('Side Pocket', 0, [[0.14, 0.75]], 1),
    L('One, Two', 0, [[0.3, 0.5], [0.7, 0.4]], 2),
    L('In the Way', 0, [[0.5, 0.3], [0.5, 0.62]], 2, '🔢 Pot a clam out of turn and it comes back to its spot.'),
    L('Little Triangle', 1, [[0.5, 0.35], [0.45, 0.27], [0.55, 0.27]], 3),
    L('Line Up', 1, [[0.5, 0.62], [0.5, 0.46], [0.5, 0.3]], 3),
    L('Four Corners', 1, [[0.13, 0.13], [0.87, 0.13], [0.13, 1.37], [0.87, 1.37]], 5),
    L('Crowd', 1, [[0.5, 0.45], [0.43, 0.38], [0.57, 0.38], [0.36, 0.31], [0.64, 0.31]], 5),
    L('Grand Rack', 1, [[0.5, 0.42], [0.44, 0.35], [0.56, 0.35], [0.38, 0.28], [0.5, 0.28], [0.62, 0.28]], 6),
];

export const begin = lv => ({
    balls: [{ num: 0, x: CUE[0], y: CUE[1], vx: 0, vy: 0, in: false, sx: CUE[0], sy: CUE[1] },
        ...lv.clams.map(([x, y], i) => ({ num: i + 1, x, y, vx: 0, vy: 0, in: false, sx: x, sy: y }))],
    n: 0, fouls: 0, potted: [],
});
export const copy = s => ({ ...s, balls: s.balls.map(b => ({ ...b })), potted: s.potted.slice() });
export const moving = s => s.balls.some(b => !b.in && (b.vx || b.vy));
export const cleared = s => s.balls.every(b => b.num === 0 || b.in);
export const shots = s => s.n + s.fouls;
const cue = s => s.balls[0];
export const origin = (lv, s) => [cue(s).x, cue(s).y];
export const where = s => [cue(s).x, cue(s).y];
const next = s => s.balls.filter(b => b.num && !b.in).sort((a, b) => a.num - b.num)[0];
export function score(lv, s) {
    const potted = s.balls.filter(b => b.num && b.in).length, t = next(s), c = cue(s);
    return potted * 10 - (t ? Math.hypot(t.x - c.x, t.y - c.y) : 0);
}

export function shot(lv, s, angle, power) {
    const v = Math.max(0.05, Math.min(1, power)) * MAX_V, c = cue(s);
    c.vx = Math.cos(angle) * v; c.vy = Math.sin(angle) * v; s.n++; s.potted = [];
}

export function step(lv, s) {
    const ev = { potted: [], clack: false, cushion: false };
    const live = s.balls.filter(b => !b.in);
    for (const b of live) {
        if (!b.vx && !b.vy) continue;
        b.x += b.vx * DT; b.y += b.vy * DT;
        const f = Math.exp(-FRICTION * DT); b.vx *= f; b.vy *= f;
        if (Math.hypot(b.vx, b.vy) < STOP) b.vx = b.vy = 0;
    }
    // ball against ball (equal masses)
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= 2 * R || d === 0) continue;
        const nx = dx / d, ny = dy / d, push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) { const k = rel * (1 + BALL_E) / 2; a.vx -= k * nx; a.vy -= k * ny; b.vx += k * nx; b.vy += k * ny; ev.clack = true; }
    }
    for (const b of live) {
        // pockets first (a ball heading into a corner shouldn't bounce out)
        if (POCKETS.some(([px, py]) => Math.hypot(b.x - px, b.y - py) < POCKET_R)) { b.in = true; b.vx = b.vy = 0; s.potted.push(b.num); ev.potted.push(b.num); continue; }
        if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) * CUSHION_E; ev.cushion = true; }
        if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx) * CUSHION_E; ev.cushion = true; }
        if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) * CUSHION_E; ev.cushion = true; }
        if (b.y > H - R) { b.y = H - R; b.vy = -Math.abs(b.vy) * CUSHION_E; ev.cushion = true; }
    }
    if (!moving(s)) _endShot(s, ev);
    return ev;
}

// After a shot: clams potted out of turn go back, a potted pearl comes back (a foul).
function _endShot(s, ev) {
    if (!s.potted.length) return;
    const was = s.balls.filter(b => b.num && (!b.in || s.potted.includes(b.num))).sort((a, b) => a.num - b.num);
    // In turn: the lowest left before this shot, then the next, and so on.
    let ok = 0;
    for (const b of was) { if (s.potted.includes(b.num) && b.num === was[ok].num) ok++; else break; }
    const fine = new Set(was.slice(0, ok).map(b => b.num));
    for (const b of s.balls) {
        if (!b.in || !s.potted.includes(b.num) || fine.has(b.num)) continue;
        if (b.num === 0) s.fouls++;
        _respot(s, b);
        ev.respot = (ev.respot || 0) + 1;
    }
    s.potted = [];
}
function _respot(s, b) {
    let x = b.sx, y = b.sy;
    for (let k = 0; k < 20 && s.balls.some(o => o !== b && !o.in && Math.hypot(o.x - x, o.y - y) < 2 * R + 0.002); k++) y += 2 * R + 0.004;
    b.in = false; b.x = x; b.y = Math.min(H - R, y); b.vx = b.vy = 0;
}

export function settle(lv, s, maxSteps = 120 * 20) {
    for (let i = 0; i < maxSteps && moving(s); i++) step(lv, s);
    if (moving(s)) { s.balls.forEach(b => { b.vx = b.vy = 0; }); _endShot(s, {}); }
    return s;
}
