// ============================================================
// ORBIT PUTT — the physics and the levels. No DOM (Orbit.js is the screen,
// via AimScreen), so qa/aimgames.mjs proves every par.
//
// Pull back and fling the ball. Planets pull it towards them (more the closer
// and the bigger), white dwarfs push it away, and it bounces off planets,
// asteroid rocks and the force field at the edge. A black hole swallows it and
// sends it back to where that shot started. Space has a little drag, so every shot comes to
// rest; the next one starts there. Drop it into the wormhole: it only catches
// a ball that's going slowly, so a fast one skims over, but its lip pulls a
// near miss in. Par is the fewest shots a thumb can count on (see SEARCH).
// ============================================================
export const W = 1, H = 1.5, DT = 1 / 120;
export const R = 0.025, GOAL_R = 0.06, CAPTURE_V = 0.8;   // too fast and it skims over the wormhole
export const LIP_R = 0.15, LIP_G = 0.9;                    // the wormhole's lip: a gentle pull that curls a near miss in
const G = 0.08, SOFT = 0.004, DRAG = 0.38, STOP = 0.05, MAX_V = 2.1, EDGE_E = 0.8, PLANET_E = 0.6;

// planets: [x, y, r, mass] (negative mass: a white dwarf that pushes); rocks: [x, y, w, h]; holes: [x, y, r]
// Par: the fewest shots a thumb can count on. The search only takes a shot if
// it also works aimed 1.7° either side and 3% softer or harder, so a par is
// never a lucky one-in-a-hundred line. qa/aimgames.mjs proves every one.
export const SEARCH = { angles: 90, powers: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], beam: 6, robust: { da: 0.03, dp: 0.03 } };
const L = (name, world, o) => ({ name, world, planets: [], rocks: [], holes: [], ...o });
export const WORLDS = ['🌍 Inner Orbit', '🌌 Deep Space'];
export const LEVELS = [
    L('Lift Off', 0, { start: [0.5, 1.3], goal: [0.5, 0.2], par: 1, hint: '🌍 Pull back and let go. Drop into the wormhole slowly: fast balls skim over it.' }),
    L('Slingshot', 0, { start: [0.5, 1.3], goal: [0.5, 0.2], planets: [[0.5, 0.75, 0.08, 1.0]], par: 2 }),
    L('Around the Rock', 0, { start: [0.5, 1.3], goal: [0.5, 0.3], planets: [[0.85, 0.75, 0.05, 0.8]], rocks: [[0.12, 0.7, 0.76, 0.05]], par: 2, hint: '🪨 Asteroid rocks are solid: bounce off them, or curve round.' }),
    L('Binary', 0, { start: [0.5, 1.3], goal: [0.5, 0.2], planets: [[0.35, 0.7, 0.06, 0.9], [0.65, 0.7, 0.06, 0.9]], par: 2 }),
    L('Push Back', 0, { start: [0.5, 1.3], goal: [0.5, 0.25], planets: [[0.5, 0.6, 0.05, -1.2]], par: 1, hint: '⚪ White dwarfs push your ball away.' }),
    L('Black Hole', 0, { start: [0.5, 1.3], goal: [0.5, 0.25], planets: [[0.25, 0.6, 0.05, 0.7]], holes: [[0.5, 0.75, 0.05]], par: 1, hint: '🕳️ A black hole sends your ball back to where that shot started.' }),
    L('Corner Pocket', 1, { start: [0.8, 1.35], goal: [0.1, 0.1], planets: [[0.45, 0.55, 0.07, 1.0], [0.7, 0.95, 0.06, 0.9]], rocks: [[0, 0.2, 0.25, 0.04], [0.25, 0, 0.04, 0.12]], par: 2 }),
    L('Asteroid Belt', 1, { start: [0.5, 1.3], goal: [0.5, 0.15], planets: [[0.15, 0.7, 0.03, 0.3], [0.32, 0.7, 0.03, 0.3], [0.5, 0.7, 0.03, 0.3], [0.68, 0.7, 0.03, 0.3], [0.85, 0.7, 0.03, 0.3]], holes: [[0.25, 0.35, 0.04], [0.75, 0.35, 0.04]], par: 2 }),
    L('Gravity Well', 1, { start: [0.5, 0.2], goal: [0.5, 1.35], planets: [[0.5, 0.75, 0.12, 2.2]], holes: [[0.25, 1.2, 0.04], [0.75, 1.2, 0.04]], par: 2 }),
    L('The Maze', 1, { start: [0.85, 1.35], goal: [0.15, 0.2], planets: [[0.8, 0.7, 0.05, 0.8]], rocks: [[0, 0.5, 0.7, 0.04], [0.3, 0.95, 0.7, 0.04]], par: 2 }),
    L('Push and Pull', 1, { start: [0.2, 1.3], goal: [0.85, 0.15], planets: [[0.3, 0.5, 0.08, 1.4], [0.7, 0.8, 0.05, -1.4]], holes: [[0.55, 0.45, 0.04]], par: 2 }),
    L('Event Horizon', 1, { start: [0.5, 1.35], goal: [0.5, 0.1], planets: [[0.25, 0.45, 0.06, 1.0], [0.75, 0.6, 0.06, 1.0], [0.5, 0.95, 0.07, 1.3]], rocks: [[0.3, 0.2, 0.15, 0.04], [0.55, 0.2, 0.15, 0.04]], holes: [[0.15, 0.25, 0.04], [0.85, 0.25, 0.04]], par: 2 }),
];

export const begin = lv => ({ x: lv.start[0], y: lv.start[1], vx: 0, vy: 0, n: 0, rest: true, still: 0, home: false, fx: lv.start[0], fy: lv.start[1], lost: 0, trail: [] });
export const copy = s => ({ ...s, trail: [] });
export const moving = s => !s.rest;
export const cleared = s => s.home;
export const shots = s => s.n;
export const origin = (lv, s) => [s.x, s.y];
export const where = s => [s.x, s.y];
export const score = (lv, s) => -Math.hypot(s.x - lv.goal[0], s.y - lv.goal[1]);

export function shot(lv, s, angle, power) {
    const v = Math.max(0.05, Math.min(1, power)) * MAX_V;
    s.vx = Math.cos(angle) * v; s.vy = Math.sin(angle) * v; s.n++; s.rest = false; s.still = 0; s.fx = s.x; s.fy = s.y;
}

export function step(lv, s) {
    const ev = { bounced: false, home: false, lost: false };
    if (s.rest) return ev;
    let ax = 0, ay = 0;
    for (const [px, py, , m] of lv.planets) {
        const dx = px - s.x, dy = py - s.y, d2 = dx * dx + dy * dy + SOFT;
        const k = (G * m) / (d2 * Math.sqrt(d2));
        ax += dx * k; ay += dy * k;
    }
    { const dx = lv.goal[0] - s.x, dy = lv.goal[1] - s.y, d = Math.hypot(dx, dy);
      if (d < LIP_R && d > 1e-6) { const k = LIP_G * (1 - d / LIP_R) / d; ax += dx * k; ay += dy * k; } }
    s.vx += ax * DT; s.vy += ay * DT;
    const f = Math.exp(-DRAG * DT); s.vx *= f; s.vy *= f;
    s.x += s.vx * DT; s.y += s.vy * DT;
    if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx) * EDGE_E; ev.bounced = true; }
    if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx) * EDGE_E; ev.bounced = true; }
    if (s.y < R) { s.y = R; s.vy = Math.abs(s.vy) * EDGE_E; ev.bounced = true; }
    if (s.y > H - R) { s.y = H - R; s.vy = -Math.abs(s.vy) * EDGE_E; ev.bounced = true; }
    for (const [px, py, pr] of lv.planets) {
        const dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy), min = pr + R;
        if (d < min && d > 0) {
            const nx = dx / d, ny = dy / d; s.x = px + nx * min; s.y = py + ny * min;
            const vn = s.vx * nx + s.vy * ny;
            if (vn < 0) { s.vx -= (1 + PLANET_E) * vn * nx; s.vy -= (1 + PLANET_E) * vn * ny; s.vx *= 0.9; s.vy *= 0.9; ev.bounced = true; }
        }
    }
    for (const [bx, by, bw, bh] of lv.rocks) {
        const px = Math.max(bx, Math.min(s.x, bx + bw)), py = Math.max(by, Math.min(s.y, by + bh)), dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy);
        if (d < R) {
            let nx, ny;
            if (d > 1e-9) { nx = dx / d; ny = dy / d; } else { const l = s.x - bx, r = bx + bw - s.x, t = s.y - by, b = by + bh - s.y, m = Math.min(l, r, t, b); [nx, ny] = m === l ? [-1, 0] : m === r ? [1, 0] : m === t ? [0, -1] : [0, 1]; }
            s.x += nx * (R - d); s.y += ny * (R - d);
            const vn = s.vx * nx + s.vy * ny;
            if (vn < 0) { s.vx -= (1 + EDGE_E) * vn * nx; s.vy -= (1 + EDGE_E) * vn * ny; ev.bounced = true; }
        }
    }
    for (const [hx, hy, hr] of lv.holes) {
        if (Math.hypot(s.x - hx, s.y - hy) < hr + R * 0.5) { s.x = s.fx; s.y = s.fy; s.vx = s.vy = 0; s.rest = true; s.lost++; ev.lost = true; return ev; }
    }
    if (Math.hypot(s.x - lv.goal[0], s.y - lv.goal[1]) < GOAL_R && Math.hypot(s.vx, s.vy) < CAPTURE_V) { s.home = true; s.rest = true; s.x = lv.goal[0]; s.y = lv.goal[1]; s.vx = s.vy = 0; ev.home = true; return ev; }
    // Slow for a quarter of a second: at rest (even if a planet is still tugging at it).
    if (Math.hypot(s.vx, s.vy) < STOP) { if (++s.still > 30) { s.rest = true; s.vx = s.vy = 0; } } else s.still = 0;
    return ev;
}

export function settle(lv, s, maxSteps = 120 * 25) {
    for (let i = 0; i < maxSteps && !s.rest; i++) step(lv, s);
    s.rest = true; s.vx = s.vy = 0;
    return s;
}
