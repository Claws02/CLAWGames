// ============================================================
// CRAB CANNON — the physics and the levels. No DOM (Cannon.js is the screen,
// via AimScreen), so qa/aimgames.mjs proves every par.
//
// A cannon on the beach fires a crab: pull back from anywhere to aim, let go
// to fire (the crab always leaves from the cannon). It flies under gravity and
// the level's wind, rings every bell it touches, bounces off clouds (with a
// little extra spring) and off islands and towers. A shot ends when the crab
// lands on the sand, settles on an island, or flies off the side. Ring every
// bell; par is the fewest shots a search with thumb-sized aim finds.
// ============================================================
export const W = 1, H = 1.5, DT = 1 / 120;
export const R = 0.028, BELL_R = 0.035, GROUND = 1.42, CANNON = [0.1, 1.36];
const GRAV = 4.2, MAX_V = 3.4, CLOUD_E = 1.12, ROCK_E = 0.45, WALL_E = 0.6, STOP = 0.12;
export const SEARCH = { angles: 40, powers: [0.45, 0.65, 0.82, 1], beam: 6, angleFrom: -Math.PI, angleTo: 0 };

// bells [x, y]; clouds [x, y, r]; islands [x, y, w, h]; wind: sideways push (+ right)
const L = (name, world, o) => ({ name, world, wind: 0, clouds: [], islands: [], ...o });
export const WORLDS = ['☀️ Sunny Isles', '⛈️ Stormy Seas'];
export const LEVELS = [
    L('First Ring', 0, { bells: [[0.6, 0.9]], par: 1, hint: '🦀 Pull back and let go to fire. Ring every bell.' }),
    L('High Bell', 0, { bells: [[0.5, 0.3]], par: 1 }),
    L('Two Bells', 0, { bells: [[0.4, 0.8], [0.8, 0.5]], par: 1 }),
    L('Bouncy Cloud', 0, { bells: [[0.85, 0.22]], clouds: [[0.5, 0.75, 0.07]], islands: [[0.62, 0.32, 0.36, 0.04]], par: 1, hint: '☁️ Clouds are bouncy: they send the crab off with a little extra spring.' }),
    L('Breeze', 0, { wind: 0.6, bells: [[0.3, 0.4], [0.7, 0.6]], par: 2, hint: '🌬️ The wind pushes the crab sideways all the way.' }),
    L('Headwind', 0, { wind: -0.8, bells: [[0.85, 0.5]], par: 1 }),
    L('Island Hop', 1, { bells: [[0.4, 0.94], [0.7, 0.64], [0.9, 0.3]], islands: [[0.3, 1.0, 0.2, 0.04], [0.6, 0.7, 0.2, 0.04]], par: 1 }),
    L('Cloud Bank', 1, { bells: [[0.5, 0.15], [0.9, 0.6]], clouds: [[0.35, 0.5, 0.06], [0.65, 0.35, 0.06]], par: 1 }),
    L('Gale', 1, { wind: 1.1, bells: [[0.25, 0.35], [0.55, 0.75], [0.15, 0.95]], islands: [[0.45, 0.8, 0.2, 0.04]], par: 2 }),
    L('Bell Tower', 1, { bells: [[0.78, 0.42], [0.78, 1.2], [0.4, 0.3]], islands: [[0.6, 0.48, 0.05, 0.9], [0.65, 0.48, 0.2, 0.04]], par: 1 }),
    L('Storm Front', 1, { wind: -0.6, bells: [[0.3, 0.2], [0.6, 0.45], [0.9, 0.8], [0.5, 1.1]], clouds: [[0.75, 0.3, 0.06], [0.3, 0.7, 0.06]], par: 2 }),
    L('Lighthouse Bells', 1, { wind: 0.4, bells: [[0.2, 0.25], [0.5, 0.1], [0.85, 0.25], [0.85, 0.9], [0.45, 0.7]], clouds: [[0.65, 0.55, 0.06]], islands: [[0.35, 0.78, 0.22, 0.04], [0.72, 0.95, 0.25, 0.04]], par: 2 }),
];

export const begin = lv => ({ x: CANNON[0], y: CANNON[1], vx: 0, vy: 0, flying: false, n: 0, rung: lv.bells.map(() => false), t: 0, trail: [] });
export const copy = s => ({ ...s, rung: s.rung.slice(), trail: [] });
export const moving = s => s.flying;
export const cleared = s => s.rung.every(Boolean);
export const shots = s => s.n;
export const origin = () => CANNON;
export const where = s => [s.rung.filter(Boolean).length, 0];
export const score = (lv, s) => s.rung.filter(Boolean).length;

export function shot(lv, s, angle, power) {
    const v = Math.max(0.1, Math.min(1, power)) * MAX_V;
    s.x = CANNON[0]; s.y = CANNON[1]; s.vx = Math.cos(angle) * v; s.vy = Math.sin(angle) * v; s.flying = true; s.n++; s.t = 0;
}

const _land = s => { s.flying = false; s.vx = s.vy = 0; };

export function step(lv, s) {
    const ev = { rung: [], cloud: false, landed: false, bump: false };
    if (!s.flying) return ev;
    s.t += DT;
    s.vx += lv.wind * DT; s.vy += GRAV * DT;
    s.x += s.vx * DT; s.y += s.vy * DT;
    if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx) * WALL_E; }
    if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx) * WALL_E; }
    for (const [cx, cy, cr] of lv.clouds) {
        const dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy), min = cr + R;
        if (d < min && d > 0) {
            const nx = dx / d, ny = dy / d; s.x = cx + nx * min; s.y = cy + ny * min;
            const vn = s.vx * nx + s.vy * ny;
            if (vn < 0) { s.vx -= (1 + CLOUD_E) * vn * nx; s.vy -= (1 + CLOUD_E) * vn * ny; ev.cloud = true; }
        }
    }
    for (const [bx, by, bw, bh] of lv.islands) {
        const px = Math.max(bx, Math.min(s.x, bx + bw)), py = Math.max(by, Math.min(s.y, by + bh)), dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy);
        if (d < R) {
            let nx, ny;
            if (d > 1e-9) { nx = dx / d; ny = dy / d; } else { const l = s.x - bx, r = bx + bw - s.x, t = s.y - by, b = by + bh - s.y, m = Math.min(l, r, t, b); [nx, ny] = m === l ? [-1, 0] : m === r ? [1, 0] : m === t ? [0, -1] : [0, 1]; }
            s.x += nx * (R - d); s.y += ny * (R - d);
            const vn = s.vx * nx + s.vy * ny;
            if (vn < 0) { s.vx -= (1 + ROCK_E) * vn * nx; s.vy -= (1 + ROCK_E) * vn * ny; s.vx *= 0.8; ev.bump = true; }
            // Resting on top of an island: the shot's over.
            if (ny < -0.7 && Math.hypot(s.vx, s.vy) < STOP * 4) { _land(s); ev.landed = true; }
        }
    }
    lv.bells.forEach(([bx, by], i) => { if (!s.rung[i] && Math.hypot(s.x - bx, s.y - by) < BELL_R + R) { s.rung[i] = true; ev.rung.push(i); } });
    if (s.y > GROUND - R) { s.y = GROUND - R; _land(s); ev.landed = true; }
    if (s.t > 8 || s.y < -1.5) { _land(s); ev.landed = true; }
    return ev;
}

export function settle(lv, s, maxSteps = 120 * 10) {
    for (let i = 0; i < maxSteps && s.flying; i++) step(lv, s);
    s.flying = false;
    return s;
}
