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
import * as Data from './ReefDropLevels.js';

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

// ---- the reefs: data, made by scripts/reef-levels.mjs (see docs/REEF_LEVELS.md) ----
export const WORLDS = Data.WORLDS;
export const LEVELS = Data.LEVELS;

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
