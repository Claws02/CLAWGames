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
// The pearl ends in one of the tide pools at the bottom; the narrow middle
// one multiplies that shot's score by 5. A chain of 20 or more in one shot
// earns a pearl back. 10 pearls a reef; stars by how many are left.
// ============================================================
export const W = 1, H = 1.5, DT = 1 / 120;
export const R = 0.022, PEG_R = 0.026, LAUNCH = [0.5, 0.06], POOL_Y = 1.42, PEARLS = 10, ZAP_R = 0.16, BIG_CHAIN = 20;
export const POOLS = [[0, 0.42, 1], [0.42, 0.58, 5], [0.58, 1, 1]];
const GRAV = 3.0, PEG_E = 0.72, WALL_E = 0.8, MAX_V = 2.4;
export const SEARCH = { angles: 60, powers: [0.3, 0.6, 1], angleFrom: 0.05, angleTo: Math.PI - 0.05 };

// The reefs, laid out by patterns: c coral, o oyster, e eel, r rock.
const P = [];
const grid = (rows, cols, y0, y1, x0 = 0.12, x1 = 0.88, off = true) => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([x0 + (c + (off && r % 2 ? 0.5 : 0)) * ((x1 - x0) / (cols - (off ? 0.5 : 1))), y0 + r * ((y1 - y0) / (rows - 1))]); return out.filter(([x]) => x <= x1 + 0.001); };
const ring = (cx, cy, rad, n, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(a0 + (i / n) * 6.283) * rad, cy + Math.sin(a0 + (i / n) * 6.283) * rad * 1.1]);
const wave = (y, amp, n, ph = 0) => Array.from({ length: n }, (_, i) => [0.1 + (i / (n - 1)) * 0.8, y + Math.sin(ph + (i / (n - 1)) * 6.283) * amp]);
const diamond = () => { const out = []; for (let r = 0; r < 7; r++) { const n = 8 - Math.abs(3 - r) * 2; for (let c = 0; c < n; c++) out.push([0.5 + (c - (n - 1) / 2) * 0.11, 0.42 + r * 0.12]); } return out; };
// pick: mark some positions as oysters, eels or rocks by index
const reef = (name, world, pts, marks, hint) => {
    const pegs = pts.map(([x, y], i) => ({ x: +x.toFixed(3), y: +y.toFixed(3), kind: marks[i] || 'c' }));
    return { name, world, pegs, hint };
};
const every = (n, k, kind, from = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => i).filter(i => i >= from && (i - from) % k === 0).map(i => [i, kind]));
const at = (list, kind) => Object.fromEntries(list.map(i => [i, kind]));

export const WORLDS = ['🪸 Shallows', '🌊 Kelp Forest'];
export const LEVELS = [
    reef('First Drop', 0, grid(6, 7, 0.45, 1.15), at([10, 17, 24, 31], 'o'), '🦪 Hit each oyster twice: once to open it, once to free its pearl.'),
    reef('Chain Reef', 0, grid(7, 8, 0.4, 1.2), { ...at([12, 27, 42], 'o'), ...at([5, 20, 35, 50], 'o') }),
    reef('Zap!', 0, grid(6, 7, 0.45, 1.15), { ...at([9, 23, 30], 'o'), ...at([16, 37], 'e') }, '⚡ Hit an eel and it zaps everything near it.'),
    reef('Rock Garden', 0, grid(7, 7, 0.4, 1.2), { ...at([8, 22, 36], 'o'), ...at([3, 17, 31, 45], 'r'), ...at([24], 'e') }, '🪨 Rocks are solid and never pop.'),
    reef('Rings', 0, [...ring(0.5, 0.75, 0.3, 16), ...ring(0.5, 0.75, 0.15, 8, 0.4)], { ...at([0, 4, 8, 12], 'o'), ...at([16, 20], 'e') }),
    reef('Waves', 0, [...wave(0.45, 0.08, 9), ...wave(0.7, 0.08, 9, 1.5), ...wave(0.95, 0.08, 9, 3), ...wave(1.2, 0.06, 9, 4.5)], { ...at([4, 13, 22, 31], 'o'), ...at([9, 26], 'e') }),
    reef('Kelp Columns', 1, [...grid(8, 5, 0.38, 1.22, 0.15, 0.85, false)], { ...at([6, 13, 23, 31, 38], 'o'), ...at([2, 17, 27], 'r'), ...at([20], 'e') }),
    reef('Diamond', 1, diamond(), { ...at([0, 6, 12, 18, 24], 'o'), ...at([9, 15], 'e'), ...at([3, 21], 'r') }),
    reef('Two Rings', 1, [...ring(0.3, 0.7, 0.16, 10), ...ring(0.7, 0.95, 0.16, 10, 0.3), ...grid(2, 6, 1.22, 1.3)], { ...at([0, 5, 10, 15], 'o'), ...at([2, 12], 'e'), ...at([22, 25], 'o') }),
    reef('The Wall', 1, grid(9, 8, 0.36, 1.25), { ...at([20, 28, 36, 44, 52], 'o'), ...at([1, 6, 66, 70], 'r'), ...at([33, 58], 'e') }),
    reef('Spiral', 1, Array.from({ length: 36 }, (_, i) => { const a = i * 0.55, r = 0.06 + i * 0.0105; return [0.5 + Math.cos(a) * r, 0.78 + Math.sin(a) * r * 1.15]; }), { ...at([3, 10, 17, 24, 31, 35], 'o'), ...at([14, 28], 'e'), ...at([20], 'r') }),
    reef('Deep Bloom', 1, [...grid(8, 8, 0.36, 1.24), ...ring(0.5, 0.8, 0.12, 6)], { ...every(64, 9, 'o', 4), ...at([16, 40, 66], 'e'), ...at([0, 7, 56, 63], 'r') }),
];

const _pegs = lv => lv.pegs.map(p => ({ ...p, hp: p.kind === 'o' ? 2 : 1, alive: true }));
export const begin = lv => ({ x: LAUNCH[0], y: LAUNCH[1], vx: 0, vy: 0, flying: false, used: 0, left: PEARLS, score: 0, chain: 0, shot: 0, pegs: _pegs(lv), lastPool: -1, bonus: 0 });
export const copy = s => ({ ...s, pegs: s.pegs.map(p => ({ ...p })) });
export const moving = s => s.flying;
export const cleared = s => s.pegs.every(p => p.kind !== 'o' || !p.alive);
export const failed = (lv, s) => !s.flying && !cleared(s) && s.left <= 0;
export const shots = s => s.used;
export const origin = () => LAUNCH;
export const where = s => [s.pegs.filter(p => p.kind === 'o' && p.alive).length, s.pegs.filter(p => p.alive).length / 100];
export const score = (lv, s) => -s.pegs.reduce((a, p) => a + (p.kind === 'o' && p.alive ? p.hp * 10 : 0), 0) + s.pegs.filter(p => !p.alive).length * 0.1;
export const starsFor = (lv, s) => (s.left >= 5 ? 3 : s.left >= 2 ? 2 : 1);

export function shot(lv, s, angle, power) {
    if (s.flying || s.left <= 0) return;
    const a = Math.max(SEARCH.angleFrom, Math.min(SEARCH.angleTo, angle < 0 ? angle + Math.PI * 2 > Math.PI ? (angle < -Math.PI / 2 ? Math.PI - 0.05 : 0.05) : angle : angle));
    const v = (0.35 + 0.65 * Math.max(0, Math.min(1, power))) * MAX_V;
    s.x = LAUNCH[0]; s.y = LAUNCH[1]; s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v;
    s.flying = true; s.used++; s.left--; s.chain = 0; s.shot = 0;
}

function _pop(s, p, ev) {
    if (!p.alive || p.kind === 'r') return;
    p.hp--;
    if (p.kind === 'o' && p.hp > 0) { ev.opened.push(p); return; }
    p.alive = false;
    s.chain++;
    s.shot += (p.kind === 'o' ? 100 : 10) * s.chain;
    ev.popped.push(p);
    if (p.kind === 'e') {   // zap everything near it (oysters lose a hit each)
        ev.zapped.push(p);
        for (const q of s.pegs) if (q.alive && q !== p && Math.hypot(q.x - p.x, q.y - p.y) < ZAP_R) _pop(s, q, ev);
    }
}

export function step(lv, s) {
    const ev = { popped: [], opened: [], zapped: [], pool: -1, bonus: false };
    if (!s.flying) return ev;
    for (let k = 0; k < 2; k++) {
        s.vy += GRAV * DT / 2;
        s.x += s.vx * DT / 2; s.y += s.vy * DT / 2;
        if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx) * WALL_E; }
        if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx) * WALL_E; }
        if (s.y < R) { s.y = R; s.vy = Math.abs(s.vy) * WALL_E; }
        for (const p of s.pegs) {
            if (!p.alive) continue;
            const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy), min = PEG_R + R;
            if (d >= min || d === 0) continue;
            const nx = dx / d, ny = dy / d;
            s.x = p.x + nx * min; s.y = p.y + ny * min;
            const vn = s.vx * nx + s.vy * ny;
            if (vn < 0) { s.vx -= (1 + PEG_E) * vn * nx; s.vy -= (1 + PEG_E) * vn * ny; _pop(s, p, ev); }
        }
    }
    if (s.y > POOL_Y) {
        const pi = POOLS.findIndex(([a, b]) => s.x >= a && s.x < b);
        s.lastPool = pi; ev.pool = pi;
        s.score += s.shot * POOLS[pi][2];
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
