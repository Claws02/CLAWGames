// ============================================================
// WORLD — compile a course, step it one fixed frame, snapshot it.
//
// Pure: no DOM, no Math.random, no clocks, no Math.sin/cos (only + − × ÷ and
// sqrt, which every engine rounds the same way). The game, the solver, the
// ghost replay and the QA probe all run THIS step(), so a route the checker
// proves is a route the player can run.
//
//   compile(level)          → world { L (static), s (state) }
//   step(world, input)      → events[]   (one frame, DT seconds)
//   snapshot(s) / restore(w, snap) / hashState(w)
//
// input = { l, r, u, d, j }  booleans.
// Coordinates: tiles, x right, y DOWN (row 0 is the top of the map).
// Gravity can flip (flip zones): p.g = +1 falls down, −1 falls up. "Grounded"
// means standing on whatever gravity pulls you toward.
// ============================================================
import { DT, P, BOUNCE, SLIP, SWING, GRAV, TOYS, TILE, SOLID_TILES, TICK_TILES } from './Rules.js';

const EPS = 1e-6;
export const NO_INPUT = Object.freeze({ l: false, r: false, u: false, d: false, j: false });
const TYPES = ['spring', 'cannon', 'fan', 'magnet', 'rope', 'mover', 'seesaw', 'lowg', 'flip', 'coin', 'flag', 'portal', 'sign', 'bumper', 'bubble', 'train', 'plane', 'pogo', 'rack', 'button', 'gate'];
/** Things you ride on top of: toy cars, elevators, trains. */
const isRide = d => !!d && (d.type === 'mover' || d.type === 'train');

// ── Compile ─────────────────────────────────────────────────────────────────
export function compile(level) {
    const map = level.map;
    const H = map.length, W = map[0].length;
    const grid = map.map(row => row.split(''));
    let start = null;
    const goals = [], crumbles = [], ticks = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (c === TILE.START) { start = { x, y }; grid[y][x] = TILE.EMPTY; }
        if (c === TILE.GOAL) goals.push({ x, y });
        if (c === TILE.CRUMBLE) crumbles.push(y * W + x);
        if (TICK_TILES.has(c)) ticks.push(y * W + x);
    }
    const dev = {};
    for (const t of TYPES) dev[t] = [];
    const byId = {};
    (level.devices || []).forEach((d, i) => {
        const id = d.id || `${d.type}${i}`;
        const o = { ...d, id };
        (dev[o.type] ||= []).push(o);
        byId[id] = o;
    });
    // Jack-in-the-boxes are solid blocks you land on.
    const owned = new Map();
    for (const sp of dev.spring) owned.set(sp.y * W + sp.x, sp);
    // Toy trains loop along a path: precompute its segments; they ride like any mover.
    for (const tr of dev.train) {
        const pts = tr.path, seg = [];
        let len = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy);
            seg.push({ x: a[0], y: a[1], dx, dy, len: l });
            len += l;
        }
        tr._seg = seg; tr._len = len || 1;
        tr.x = pts[0][0]; tr.y = pts[0][1];
        tr.period = Math.max(2, Math.round(tr._len / (tr.speed * DT)));
        dev.mover.push(tr);
    }
    // Where each ride goes (the solver keys its phase only near here).
    for (const m of dev.mover) {
        const xs = m.path ? m.path.map(q => q[0]) : [m.x, m.to[0]], ys = m.path ? m.path.map(q => q[1]) : [m.y, m.to[1]];
        m._box = { x0: Math.min(...xs), x1: Math.max(...xs) + m.w, y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    // Toy-castle gates: which cells each one fills.
    const gateCell = dev.gate.length ? new Map() : null;
    for (const g of dev.gate) for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) gateCell.set(y * W + x, g);
    // Tick-tock blocks: the beat, and the cells near enough to one that its phase matters.
    const tick = Math.max(2, Math.round(level.tick?.period || TOYS.TICK));
    const nearTick = ticks.length ? new Uint8Array(W * H) : null;
    for (const k of ticks) {
        const tx = k % W, ty = (k - tx) / W;
        for (let y = Math.max(0, ty - 6); y <= Math.min(H - 1, ty + 6); y++) for (let x = Math.max(0, tx - 8); x <= Math.min(W - 1, tx + 8); x++) nearTick[y * W + x] = 1;
    }
    // The loop length of everything that moves on its own (movers, sweeping cannons):
    // the solver keys states by the phase within it.
    let cycle = 1;
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    for (const d of [...dev.mover, ...dev.cannon.filter(c => c.aim.length > 1), ...(ticks.length ? [{ period: tick }] : [])]) {
        const per = Math.max(1, Math.round(d.period || 1));
        cycle = (cycle * per) / gcd(cycle, per);
        if (cycle > 100000) cycle = 100000;
    }
    const L = { level, W, H, grid, start, goals, crumbles, ticks, tick, nearTick, gateCell, dev, byId, owned, cycle, hub: level.kind === 'hub' };
    const w = { L, s: null };
    w.s = initialState(L);
    return w;
}

function initialState(L) {
    const seesaw = {};
    for (const sw of L.dev.seesaw) seesaw[sw.id] = { m: sw.tilt || 0, pm: sw.tilt || 0, w: 0 };
    return {
        t: 0, p: spawnPlayer(L, L.start.x, L.start.y, 1),
        crumble: {}, seesaw, fired: {}, blown: {}, planes: {}, gates: {},
        coins: 0, check: -1, checkG: 1, checkPogo: false,
        won: false, deaths: 0,
    };
}

function spawnPlayer(L, tx, ty, g) {
    return {
        x: tx + (1 - P.W) / 2, y: g > 0 ? ty + 1 - P.H : ty, vx: 0, vy: 0, g,
        grounded: true, ground: 'tile', gtile: TILE.SOLID, climb: false,
        coy: 0, buf: 0, prevJ: false, jumping: false,
        rope: null, ropeR: 0, cannon: null, cf: 0, regrab: 0, wet: false, lowg: false, bubble: null, bt: 0,
        wall: 0, wallSide: 0, wallT: 0, kick: 0, plane: null, fanV: 0, pogo: false, bounced: false,
        peak: g > 0 ? ty + 1 : -ty,      // the highest point since you left the ground (along gravity)
    };
}

// ── Shapes over time (pure functions of the frame) ─────────────────────────
const smooth = u => u * u * (3 - 2 * u);
/** A mover's top-left at frame t: smooth shuttle between (x, y) and `to`. */
export function moverPos(m, t) {
    if (m.path) {
        // A train: constant speed around its loop.
        let d = ((((t + (m.phase || 0)) * m.speed * DT) % m._len) + m._len) % m._len;
        for (const g of m._seg) {
            if (d <= g.len) { const u = g.len ? d / g.len : 0; return { x: g.x + g.dx * u, y: g.y + g.dy * u }; }
            d -= g.len;
        }
        return { x: m._seg[0].x, y: m._seg[0].y };
    }
    const per = Math.max(2, m.period);
    const ph = (((t + (m.phase || 0)) % per) + per) % per;
    const u = smooth(ph < per / 2 ? ph / (per / 2) : 2 - ph / (per / 2));
    return { x: m.x + (m.to[0] - m.x) * u, y: m.y + (m.to[1] - m.y) * u };
}
/** A cannon's aim at frame t, as a unit vector (sweeping cannons swing between two aims). */
export function cannonAim(c, t) {
    let ax = c.aim[0][0], ay = c.aim[0][1];
    if (c.aim.length > 1) {
        const per = Math.max(2, c.period || 120);
        const ph = (((t + (c.phase || 0)) % per) + per) % per;
        const u = smooth(ph < per / 2 ? ph / (per / 2) : 2 - ph / (per / 2));
        ax += (c.aim[1][0] - ax) * u; ay += (c.aim[1][1] - ay) * u;
    }
    const n = Math.sqrt(ax * ax + ay * ay) || 1;
    return { x: ax / n, y: ay / n };
}
/** A seesaw's surface height at x (its pivot top is at y; slope m, y down). */
export const seesawY = (sw, m, x) => sw.y + m * (x - sw.x);

// ── Queries ─────────────────────────────────────────────────────────────────
export function tileAt(L, x, y) {
    if (x < 0 || x >= L.W || y < 0) return TILE.SOLID;   // side walls + the top are solid
    if (y >= L.H) return TILE.EMPTY;                      // below the map = falling out
    return L.grid[y][x];
}
/** Is a tick-tock block of this colour solid at frame t? Red the first half of each beat, blue the second. */
export const tickOn = (L, tile, t) => ((t % L.tick) < L.tick / 2) === (tile === TILE.TICK_RED);
/** Is tile (x, y) solid right now (map, fallen ABC blocks, jack-in-the-boxes, tick-tock blocks on their beat)? */
export function solidAt(w, x, y) {
    const t = tileAt(w.L, x, y);
    if (w.L.gateCell && x >= 0 && x < w.L.W && y >= 0 && y < w.L.H) {
        // A closed gate is a wall (and, like a tick-tock block, lets you out if it shuts around you).
        const k = y * w.L.W + x, g = w.L.gateCell.get(k);
        if (g && !(w.s.gates[g.id] > 0)) return !w.ghost?.has(k);
    }
    if (t === TILE.CRUMBLE) return (w.s.crumble[y * w.L.W + x]?.st || 0) < 2;
    // A tick-tock block that comes on around you lets you out first (w.ghost: the ones you were inside at the start of the frame).
    if (t === TILE.TICK_RED || t === TILE.TICK_BLUE) return tickOn(w.L, t, w.s.t) && !w.ghost?.has(y * w.L.W + x);
    if (SOLID_TILES.has(t)) return true;
    return w.L.owned.has(y * w.L.W + x);
}
const isWaterTile = (L, x, y) => tileAt(L, x, y) === TILE.WATER;
const isLadder = (L, x, y) => tileAt(L, x, y) === TILE.LADDER;
const overlaps = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
const playerOver = (p, x, y, w = 1, h = 1) => overlaps(p.x, p.y, P.W, P.H, x, y, w, h);
const inRect = (px, py, d) => px >= d.x && px < d.x + d.w && py >= d.y && py < d.y + d.h;

/** The door (portal) the hero is standing at, or null. Hub only. */
export function portalHere(w) {
    for (const pt of w.L.dev.portal) if (playerOver(w.s.p, pt.x + 0.2, pt.y, 0.6, 1)) return pt;
    return null;
}
/** Put the hero on tile (tx, ty), standing: back at the door of the course just played. */
export function spawnAt(w, tx, ty) {
    Object.assign(w.s.p, spawnPlayer(w.L, tx, ty, 1));
}
/** Coins taken so far, as a count. */
export const coinCount = s => { let n = 0; for (let b = s.coins; b; b >>= 1) n += b & 1; return n; };

// ── Devices, once per frame ─────────────────────────────────────────────────
function updateCrumbles(w) {
    const { s } = w;
    for (const k in s.crumble) {
        const c = s.crumble[k];
        if (c.st === 1 && --c.f <= 0) { c.st = 2; c.f = SWING.CRUMBLE_BACK; }
        else if (c.st === 2 && --c.f <= 0) {
            const x = k % w.L.W, y = (k - x) / w.L.W;
            if (playerOver(s.p, x, y)) c.f = 1;          // never reappear inside the hero
            else delete s.crumble[k];
        }
    }
}

function updateBubbles(w) {
    const { s } = w;
    for (const k in s.blown) if (--s.blown[k] <= 0) delete s.blown[k];
    for (const k in s.planes) if (s.p.plane !== k && --s.planes[k] <= 0) delete s.planes[k];
    for (const k in s.gates) if (--s.gates[k] <= 0) delete s.gates[k];
}

/** Which side (−1 left, +1 right, 0 none) a velcro wall touches the hero on. */
function velcroSide(w, p, prefer) {
    const { L } = w;
    let left = false, right = false;
    const xl = Math.floor(p.x - 0.05), xr = Math.floor(p.x + P.W + 0.05);
    for (let ty = Math.floor(p.y + 0.1); ty <= Math.floor(p.y + P.H - 0.1); ty++) {
        if (tileAt(L, xl, ty) === TILE.VELCRO) left = true;
        if (tileAt(L, xr, ty) === TILE.VELCRO) right = true;
    }
    if (left && right) return prefer || -1;
    return left ? -1 : right ? 1 : 0;
}

/** The tick-tock blocks the hero overlaps right now: they stay open for them until they're out. */
function ghostTicks(w) {
    const { L, s } = w;
    const p = s.p, g = new Set();
    for (let ty = Math.floor(p.y + EPS); ty <= Math.floor(p.y + P.H - EPS); ty++) for (let tx = Math.floor(p.x + EPS); tx <= Math.floor(p.x + P.W - EPS); tx++) {
        if (TICK_TILES.has(tileAt(L, tx, ty)) || L.gateCell?.has(ty * L.W + tx)) g.add(ty * L.W + tx);
    }
    w.ghost = g;
}

function boxHitsSolid(w, p) {
    for (let ty = Math.floor(p.y + EPS); ty <= Math.floor(p.y + P.H - EPS); ty++) for (let tx = Math.floor(p.x + EPS); tx <= Math.floor(p.x + P.W - EPS); tx++) if (solidAt(w, tx, ty)) return true;
    return false;
}

function updateSeesaws(w) {
    const { L, s } = w;
    const p = s.p;
    for (const sw of L.dev.seesaw) {
        const st = s.seesaw[sw.id];
        st.pm = st.m;
        const riding = p.grounded && p.ground === sw.id;
        const cx = p.x + P.W / 2;
        const acc = riding ? SWING.SEESAW_PUSH * (cx - sw.x) : -SWING.SEESAW_RETURN * (st.m - (sw.tilt || 0));
        st.w += (acc - SWING.SEESAW_DAMP * st.w) * DT;
        st.m += st.w * DT;
        if (st.m > SWING.SEESAW_MAX) { st.m = SWING.SEESAW_MAX; st.w = Math.min(0, st.w); }
        if (st.m < -SWING.SEESAW_MAX) { st.m = -SWING.SEESAW_MAX; st.w = Math.max(0, st.w); }
    }
}

// ── The hero ────────────────────────────────────────────────────────────────
function respawn(w, ev, why) {
    const { L, s } = w;
    const f = s.check >= 0 ? L.dev.flag[s.check] : null;
    s.p = f ? spawnPlayer(L, f.x, f.y, s.checkG) : spawnPlayer(L, L.start.x, L.start.y, 1);
    if (f) s.p.pogo = s.checkPogo;                    // back at the flag with the pogo stick if you had it there
    s.deaths++;
    ev.push({ type: 'death', why });
}

/** What the hero is in: balloon zone, water, fans and magnets pushing. */
function envAt(w) {
    const { L, s } = w;
    const p = s.p;
    const cx = p.x + P.W / 2, cy = p.y + P.H / 2;
    let lowg = false;
    for (const z of L.dev.lowg) if (inRect(cx, cy, z)) { lowg = true; break; }
    const water = isWaterTile(L, Math.floor(cx), Math.floor(cy));
    return { lowg, water, cx, cy };
}

/**
 * Fans and magnets. In the air they push your speed directly; on the ground
 * they set a drift (like a belt) that you can run against. Returns the drift.
 */
function pushes(w, p, cx, cy, ground) {
    const { L } = w;
    let drift = 0;
    const capX = (ax, cap) => {
        if (ground) { drift += ax * 0.12; return; }
        p.vx += ax * DT;
        if (ax > 0 && p.vx > cap) p.vx = Math.max(cap, p.vx - ax * DT);
        if (ax < 0 && p.vx < -cap) p.vx = Math.min(-cap, p.vx - ax * DT);
    };
    for (const f of L.dev.fan) {
        if (!inRect(cx, cy, f)) continue;
        capX(f.ax, SLIP.FAN_MAX);
        const ay = f.ay * DT;
        p.vy += ay;
        if (ay > 0 && p.vy > SLIP.FAN_MAX) p.vy = Math.max(SLIP.FAN_MAX, p.vy - ay);
        if (ay < 0 && p.vy < -SLIP.FAN_MAX) p.vy = Math.min(-SLIP.FAN_MAX, p.vy - ay);
    }
    for (const m of L.dev.magnet) {
        const dx = m.x - cx, dy = m.y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= m.r || d < 0.05) continue;
        const nx = dx / d, ny = dy / d;
        if (ground) drift += m.pull * nx * 0.12;
        else p.vx += m.pull * nx * DT;
        p.vy += m.pull * ny * DT;
        const toward = p.vx * nx + p.vy * ny;
        if (toward > SLIP.MAGNET_MAX) { p.vx -= (toward - SLIP.MAGNET_MAX) * nx; p.vy -= (toward - SLIP.MAGNET_MAX) * ny; }
    }
    return Math.max(-SLIP.FAN_MAX, Math.min(SLIP.FAN_MAX, drift));
}

const approach = (v, target, a) => (v < target ? Math.min(target, v + a) : Math.max(target, v - a));

function inCannon(w, input, jEdge, ev) {
    const { L, s } = w;
    const p = s.p, c = L.byId[p.cannon];
    p.x = c.x + 0.5 - P.W / 2; p.y = c.y + 0.5 - P.H / 2; p.vx = 0; p.vy = 0;
    p.cf++;
    if (jEdge && p.cf >= 4) p.buf = BOUNCE.CANNON_HOLD;        // a press while loading fires when ready
    if (p.cf >= BOUNCE.CANNON_HOLD && (jEdge || p.buf > 0)) {
        const a = cannonAim(c, s.t);
        const v = BOUNCE.CANNON_V * (c.power || 1);
        p.vx = a.x * v; p.vy = a.y * v;
        p.x += a.x * 0.6; p.y += a.y * 0.6;
        p.cannon = null; p.regrab = 20; p.jumping = false; p.buf = 0; p.grounded = false; p.coy = 0;
        s.fired[c.id] = s.t;
        ev.push({ type: 'cannon_fire', id: c.id });
    }
}

function onRope(w, input, jEdge, ev) {
    const { L, s } = w;
    const p = s.p, R = L.byId[p.rope];
    const dir = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    const prev = { x: p.x, y: p.y };
    p.vy += P.G * p.g * DT;
    p.vx += dir * SWING.PUMP * DT;
    p.vx *= 1 - SWING.DAMP * DT; p.vy *= 1 - SWING.DAMP * DT;
    let cx = p.x + P.W / 2 + p.vx * DT, cy = p.y + P.H / 2 + p.vy * DT;
    const dx = cx - R.x, dy = cy - R.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const nx = dx / d, ny = dy / d;
    cx = R.x + nx * p.ropeR; cy = R.y + ny * p.ropeR;
    const vr = p.vx * nx + p.vy * ny;
    p.vx -= vr * nx; p.vy -= vr * ny;
    p.x = cx - P.W / 2; p.y = cy - P.H / 2;
    // A swing that would put the hero inside a wall stops there and lets go.
    const x0 = Math.floor(p.x + EPS), x1 = Math.floor(p.x + P.W - EPS), y0 = Math.floor(p.y + EPS), y1 = Math.floor(p.y + P.H - EPS);
    let hit = false;
    for (let ty = y0; ty <= y1 && !hit; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(w, tx, ty)) { hit = true; break; }
    if (hit) { p.x = prev.x; p.y = prev.y; p.vx = 0; p.vy = 0; p.rope = null; p.regrab = SWING.REGRAB; ev.push({ type: 'letgo', id: R.id }); return; }
    if (jEdge) {
        p.rope = null; p.vy -= p.g * SWING.LET_GO_UP; p.regrab = SWING.REGRAB; p.jumping = false; p.buf = 0;
        ev.push({ type: 'letgo', id: R.id });
    }
}

function inBubble(w, input, jEdge, ev) {
    const { L, s } = w;
    const p = s.p, b = L.byId[p.bubble];
    const dir = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    p.bt++;
    const pop = (vy, why) => {
        p.bubble = null; p.vy = vy; p.grounded = false; p.coy = 0; p.jumping = false; p.buf = 0; p.regrab = 12;
        p.peak = p.g > 0 ? p.y + P.H : -p.y;
        ev.push({ type: 'pop', id: b.id, why });
    };
    if (jEdge && p.bt > 4) return pop(-p.g * P.JUMP_V * TOYS.BUBBLE_POP, 'jump');
    if (p.bt >= TOYS.BUBBLE_LIFE) return pop(0, 'time');
    // It drifts where you steer, floats against gravity, and fans blow it about.
    let tx = dir * TOYS.BUBBLE_STEER, ty = -p.g * (b.rise ?? TOYS.BUBBLE_RISE);
    const cx = p.x + P.W / 2, cy = p.y + P.H / 2;
    for (const f of L.dev.fan) if (inRect(cx, cy, f)) { tx += f.ax * 0.25; ty += f.ay * 0.25; }
    p.vx = approach(p.vx, Math.max(-SLIP.FAN_MAX, Math.min(SLIP.FAN_MAX, tx)), TOYS.BUBBLE_EASE * DT);
    p.vy = approach(p.vy, Math.max(-SLIP.FAN_MAX, Math.min(SLIP.FAN_MAX, ty)), TOYS.BUBBLE_EASE * DT);
    const ox = p.x, oy = p.y;
    p.x += p.vx * DT; p.y += p.vy * DT;
    if (boxHitsSolid(w, p)) { p.x = ox; p.y = oy; p.vx = 0; pop(0, 'wall'); }       // touch anything: pop
}

/**
 * Riding a paper plane: it flies on by itself. Hold JUMP to pull up (it slows
 * down as it climbs), let go and it glides down (speeding up again). Too slow
 * and it stalls. ◀/▶ the way it flies dives; the other way lets go. Fans
 * blow it about. Touching anything ends the flight (you hop off onto it).
 */
function onPlane(w, input, jEdge, ev) {
    const { L, s } = w;
    const p = s.p, pl = L.byId[p.plane], g = p.g;
    const drop = why => {
        p.plane = null; s.planes[pl.id] = TOYS.PLANE_BACK; p.regrab = 12;
        p.grounded = false; p.coy = 0; p.jumping = false; p.buf = 0;
        p.peak = g > 0 ? p.y + P.H : -p.y;
        ev.push({ type: 'unplane', id: pl.id, why });
    };
    if (pl.dir > 0 ? input.l : input.r) { p.vy = Math.min(p.vy, 0) - g * 3; return drop('off'); }
    let sp = Math.abs(p.vx);
    const dive = pl.dir > 0 ? input.r : input.l;
    if (input.j) p.vy = Math.max(-TOYS.PLANE_CLIMB, (p.vy * g - TOYS.PLANE_LIFT * DT)) * g;
    else p.vy = approach(p.vy * g, dive ? TOYS.PLANE_DIVE : TOYS.PLANE_SINK, TOYS.PLANE_SETTLE * (dive ? 2 : 1) * DT) * g;
    // Fans carry the plane: an updraft lifts it (without costing it speed), a tailwind speeds it along.
    const cx = p.x + P.W / 2, cy = p.y + P.H / 2;
    let carryV = 0;
    for (const f of L.dev.fan) if (inRect(cx, cy, f)) { carryV += f.lift ?? f.ay * TOYS.PLANE_FAN; sp += f.ax * pl.dir * TOYS.PLANE_FAN * DT; }
    p.fanV = approach(p.fanV || 0, carryV, 20 * DT);
    sp += (TOYS.PLANE_TRADE * p.vy * g - TOYS.PLANE_LOSS) * DT;
    if (sp < TOYS.PLANE_MIN) p.vy += g * P.G * 0.6 * DT;           // stalled: it drops
    sp = Math.max(0, Math.min(TOYS.PLANE_MAX, sp));
    p.vx = pl.dir * sp;
    const ox = p.x, oy = p.y;
    p.x += p.vx * DT;
    if (boxHitsSolid(w, p)) { p.x = ox; p.vx = 0; return drop('crash'); }
    p.y += (p.vy + p.fanV) * DT;
    if (boxHitsSolid(w, p)) { p.y = oy; p.vy = 0; p.fanV = 0; return drop('land'); }
}

function ladderMove(w, input, jEdge, dir) {
    const { L, s } = w;
    const p = s.p;
    const cx = Math.floor(p.x + P.W / 2);
    let onLadder = false;
    for (let ty = Math.floor(p.y + EPS); ty <= Math.floor(p.y + P.H - EPS); ty++) if (isLadder(L, cx, ty)) onLadder = true;
    const ladderBelow = isLadder(L, cx, Math.floor(p.y + P.H + EPS));
    if (!p.climb && p.g > 0 && ((input.u && onLadder) || (input.d && p.grounded && ladderBelow))) {
        p.climb = true; p.vx = 0; p.vy = 0; p.jumping = false;
        p.x = cx + (1 - P.W) / 2;
        if (input.d && !onLadder) p.y += 0.05;
    }
    if (!p.climb) return;
    if (jEdge) { p.climb = false; p.vy = -P.JUMP_V * P.LADDER_JUMP; p.vx = dir * P.RUN; p.jumping = true; p.buf = 0; }
    else if (!onLadder && !(input.d && ladderBelow)) p.climb = false;
    else if (dir !== 0 && !input.u && !input.d) { p.climb = false; p.vx = dir * P.RUN * 0.6; }
    else { p.vx = 0; p.vy = ((input.d ? 1 : 0) - (input.u ? 1 : 0)) * P.CLIMB; }
}

function movePlayer(w, input, ev, carry) {
    const { L, s } = w;
    const p = s.p;
    const dir = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    const jEdge = input.j && !p.prevJ;
    p.prevJ = input.j;
    if (jEdge) p.buf = P.BUFFER;
    else if (p.buf > 0) p.buf--;
    if (p.regrab > 0) p.regrab--;
    if (p.kick > 0) p.kick--;
    p.bounced = false;

    if (p.cannon) return inCannon(w, input, jEdge, ev);
    if (p.rope) return onRope(w, input, jEdge, ev);
    if (p.bubble) return inBubble(w, input, jEdge, ev);
    if (p.plane) return onPlane(w, input, jEdge, ev);

    const g = p.g;
    // Riding a toy car: it carries you.
    if (carry) { p.x += carry.dx; p.y += carry.dy; }

    const env = envAt(w);
    if (env.water !== p.wet) { p.wet = env.water; ev.push({ type: env.water ? 'splash' : 'unsplash' }); }
    if (env.water && p.pogo) { p.pogo = false; ev.push({ type: 'pogo_off', why: 'water' }); }
    p.lowg = env.lowg;
    ladderMove(w, input, jEdge, dir);

    if (!p.climb) {
        // Fans and magnets first: in the air they push, on the ground they drift you.
        const drift = pushes(w, p, env.cx, env.cy, p.grounded);
        // ── Across ──
        const run = P.RUN * (env.water ? GRAV.WATER_RUN : 1);
        if (p.grounded) {
            const gt = p.gtile;
            const belt = gt === TILE.BELT_L ? -SLIP.CONVEYOR : gt === TILE.BELT_R ? SLIP.CONVEYOR : 0;
            const ice = gt === TILE.ICE;
            const a = dir !== 0 ? (ice ? SLIP.ICE_ACC : P.ACC_GROUND) : (ice ? SLIP.ICE_FRICTION : P.FRICTION);
            p.vx = approach(p.vx, dir * run + belt + drift, a * DT);
        } else if (dir !== 0 && Math.sign(p.vx) === dir && Math.abs(p.vx) > run) {
            p.vx -= dir * Math.min(Math.abs(p.vx) - run, P.AIR_DRAG * DT);      // a launch keeps its speed
        } else if (dir !== 0) {
            p.vx = approach(p.vx, dir * run, P.ACC_AIR * (p.kick > 0 ? 0.25 : 1) * DT);   // just off a velcro wall: gentle steering
        } else if (Math.abs(p.vx) > run) {
            p.vx = approach(p.vx, 0, P.AIR_DRAG * DT);
        } else if (p.kick <= 0) {
            p.vx = approach(p.vx, 0, P.ACC_AIR * 0.25 * DT);
        }

        // ── Up and down ──
        let G = P.G, maxFall = P.MAX_FALL, jumpV = P.JUMP_V;
        if (env.lowg) { G *= GRAV.LOW; maxFall = GRAV.LOW_FALL; jumpV *= GRAV.LOW_JUMP; }
        if (env.water) { G *= GRAV.WATER; maxFall = GRAV.WATER_FALL; }
        p.vy += G * g * DT;
        if (g > 0) p.vy = Math.min(maxFall, p.vy); else p.vy = Math.max(-maxFall, p.vy);

        // Velcro walls: touching one in the air you slide down it slowly; JUMP kicks you off it.
        const side = !p.grounded && !env.water ? velcroSide(w, p, dir) : 0;
        p.wall = side;
        if (side) { p.wallSide = side; p.wallT = TOYS.WALL_COYOTE; } else if (p.wallT > 0) p.wallT--;
        if (side && p.vy * g > TOYS.WALL_SLIDE) p.vy = g * TOYS.WALL_SLIDE;

        if (env.water) {
            if (jEdge) {
                // Head above the surface → leap out; under it → a swim stroke.
                const headRow = Math.floor(g > 0 ? p.y + 0.25 : p.y + P.H - 0.25);
                const out = !isWaterTile(L, Math.floor(env.cx), headRow);
                p.vy = -g * (out ? GRAV.LEAP : GRAV.SWIM);
                p.grounded = false; p.coy = 0; p.buf = 0; p.jumping = out;
                ev.push({ type: out ? 'leap' : 'swim' });
            }
        } else if (p.buf > 0 && (p.grounded || p.coy > 0)) {
            p.vy = -g * jumpV;
            const dev = L.byId[p.ground];
            if (isRide(dev) && carry) { p.vx += carry.dx / DT; if (carry.dy * g < 0) p.vy += carry.dy / DT; }   // jump off a car: keep its speed (and its lift)
            if (dev && dev.type === 'seesaw') {
                const st = s.seesaw[dev.id];
                const vs = st.w * (p.x + P.W / 2 - dev.x);                       // the plank's speed under you
                if (vs < 0) p.vy += vs;                                         // a rising end throws you higher
            }
            p.grounded = false; p.coy = 0; p.buf = 0; p.jumping = true;
            ev.push({ type: 'jump' });
        } else if (p.buf > 0 && !p.grounded && p.wallT > 0) {
            p.vy = -g * TOYS.WALL_JUMP_V; p.vx = -p.wallSide * TOYS.WALL_KICK;
            p.kick = TOYS.WALL_STEER; p.jumping = true; p.buf = 0; p.wallT = 0; p.wall = 0;
            ev.push({ type: 'walljump', side: p.wallSide });
        }
        if (p.jumping && !input.j && p.vy * -g > P.JUMP_CUT) p.vy = -g * P.JUMP_CUT;
        if (p.vy * g >= 0) p.jumping = false;
    }

    // ── Move across, stop at walls ──
    p.x += p.vx * DT;
    {
        const y0 = Math.floor(p.y + EPS), y1 = Math.floor(p.y + P.H - EPS);
        if (p.vx > 0) {
            const tx = Math.floor(p.x + P.W - EPS);
            for (let ty = y0; ty <= y1; ty++) if (solidAt(w, tx, ty)) { p.x = tx - P.W; p.vx = 0; break; }
        } else if (p.vx < 0) {
            const tx = Math.floor(p.x + EPS);
            for (let ty = y0; ty <= y1; ty++) if (solidAt(w, tx, ty)) { p.x = tx + 1; p.vx = 0; break; }
        }
    }

    // ── Move up/down, land ──
    const prevY = p.y;
    p.y += p.vy * DT;
    const wasGrounded = p.grounded, wasGround = p.ground;
    p.grounded = false;
    let impact = 0;
    const x0 = Math.floor(p.x + EPS), x1 = Math.floor(p.x + P.W - EPS);
    const cxT = Math.floor(p.x + P.W / 2);
    const pickTile = ty => {   // the tile you're standing on: the one under your middle if it's solid
        const kind = tx => (L.owned.has(ty * L.W + tx) ? 'spring' : tileAt(L, tx, ty));
        if (solidAt(w, cxT, ty)) return kind(cxT);
        for (let tx = x0; tx <= x1; tx++) if (solidAt(w, tx, ty)) return kind(tx);
        return TILE.SOLID;
    };
    if (p.vy > 0) {
        const bottom = p.y + P.H, prevBottom = prevY + P.H;
        const ty = Math.floor(bottom);
        let land = null;
        for (let tx = x0; tx <= x1; tx++) {
            const t = tileAt(L, tx, ty);
            const oneway = g > 0 && (t === TILE.ONEWAY || (t === TILE.LADDER && !isLadder(L, tx, ty - 1) && !p.climb && !input.d));
            if (solidAt(w, tx, ty) || (oneway && prevBottom <= ty + EPS)) {
                if (!land || ty < land.y) land = { y: ty, ground: 'tile' };
            }
            // On a pogo stick, spikes are something to bounce on (off their tips).
            const tip = ty + TOYS.POGO_TIP;
            if (p.pogo && g > 0 && t === TILE.SPIKES && prevBottom <= tip + EPS && bottom >= tip && (!land || tip < land.y)) land = { y: tip, ground: 'tile', tip: true };
        }
        if (g > 0) {
            for (const m of L.dev.mover) {
                const mp = moverPos(m, s.t);
                const riding = wasGrounded && wasGround === m.id;
                const prevTop = moverPos(m, s.t - 1).y;      // where its top was a frame ago
                if (p.x < mp.x + m.w && p.x + P.W > mp.x && (riding || prevBottom <= prevTop + EPS) && bottom >= mp.y) {
                    if (!land || mp.y <= land.y) land = { y: mp.y, ground: m.id };
                }
            }
            for (const sw of L.dev.seesaw) {
                const st = s.seesaw[sw.id];
                const cx = p.x + P.W / 2;
                if (cx < sw.x - sw.half || cx > sw.x + sw.half) continue;
                const surf = seesawY(sw, st.m, cx), prevSurf = seesawY(sw, st.pm, cx);
                const riding = wasGrounded && wasGround === sw.id;
                if ((riding || prevBottom <= prevSurf + 0.05) && bottom >= surf - (riding ? 0.3 : 0)) {
                    if (!land || surf <= land.y) land = { y: surf, ground: sw.id };
                }
            }
        }
        if (land) {
            p.y = land.y - P.H; impact = p.vy; p.vy = 0;
            if (g > 0) {
                p.grounded = true; p.ground = land.ground; p.climb = false;
                p.gtile = land.tip ? TILE.SPIKES : land.ground === 'tile' ? pickTile(land.y) : TILE.SOLID;
            } else p.jumping = false;
        } else if (g > 0 && wasGrounded && L.byId[wasGround]?.type === 'seesaw') {
            // Walking off a tilting ruler downhill: stay on it if it's right under you.
            const sw = L.byId[wasGround], cx = p.x + P.W / 2;
            if (cx >= sw.x - sw.half && cx <= sw.x + sw.half) { p.y = seesawY(sw, s.seesaw[sw.id].m, cx) - P.H; p.vy = 0; p.grounded = true; p.ground = sw.id; }
        }
    } else if (p.vy < 0) {
        const ty = Math.floor(p.y);
        for (let tx = x0; tx <= x1; tx++) if (solidAt(w, tx, ty)) {
            p.y = ty + 1; impact = p.vy; p.vy = 0;
            if (g < 0) { p.grounded = true; p.ground = 'tile'; p.gtile = pickTile(ty); }
            else p.jumping = false;
            break;
        }
    }
    if (p.climb) p.grounded = false;
    if (p.grounded) p.coy = P.COYOTE;
    else if (wasGrounded && !p.climb && p.vy * g >= 0) p.coy = P.COYOTE - 1;
    else if (p.coy > 0) p.coy--;
    if (p.grounded && !wasGrounded) ev.push({ type: 'land', v: Math.abs(impact) });
    // How far you've fallen: feet height along gravity, from the highest point.
    const along = g > 0 ? p.y + P.H : -p.y;
    const fell = Math.max(0, along - p.peak);
    if (!p.grounded) { p.peak = Math.min(p.peak, along); return; }
    p.peak = along;
    // ── What you landed on ──
    if (p.gtile === TILE.SPONGE) {
        // A sponge gives back most of the speed of the fall (from its height, so the fall-speed cap doesn't blunt it).
        const vin = Math.sqrt(2 * P.G * fell);
        const v = Math.max(BOUNCE.MIN, Math.min(BOUNCE.MAX, vin * BOUNCE.KEEP + (input.j ? BOUNCE.HELD : 0)));
        p.vy = -g * v; p.grounded = false; p.coy = 0; p.jumping = false; p.buf = 0;
        ev.push({ type: 'bounce', v });
        return;
    }
    if (L.owned.size) {
        const ty = g > 0 ? Math.floor(p.y + P.H + EPS) : Math.floor(p.y - EPS);
        for (let tx = x0; tx <= x1; tx++) {
            const sp = L.owned.get(ty * L.W + tx);
            if (!sp || p.ground !== 'tile') continue;
            const v = BOUNCE.SPRING_V * (sp.power || 1);
            p.vy = -g * v; p.vx = (sp.dx || 0) * (sp.kick || 8);
            p.grounded = false; p.coy = 0; p.jumping = false; p.buf = 0;
            s.fired[sp.id] = s.t;
            ev.push({ type: 'spring', id: sp.id });
            return;
        }
    }
    // A pogo stick bounces you off whatever you land on: from the height you fell, more with JUMP held.
    if (p.pogo) {
        const vin = Math.sqrt(2 * P.G * fell);
        const v = Math.max(TOYS.POGO_MIN, Math.min(TOYS.POGO_MAX, vin * TOYS.POGO_KEEP + (input.j ? TOYS.POGO_HELD : 0)));
        p.vy = -g * v; p.grounded = false; p.coy = 0; p.jumping = false; p.buf = 0; p.bounced = true;
        ev.push({ type: 'pogo', v });
        return;
    }
    // ABC blocks start to wobble under you.
    if (L.crumbles.length) {
        const ty = g > 0 ? Math.floor(p.y + P.H + EPS) : Math.floor(p.y - EPS);
        for (let tx = x0; tx <= x1; tx++) {
            if (tileAt(L, tx, ty) !== TILE.CRUMBLE) continue;
            const k = ty * L.W + tx;
            if (!s.crumble[k]) { s.crumble[k] = { st: 1, f: SWING.CRUMBLE_SHAKE }; ev.push({ type: 'wobble', k }); }
        }
    }
}

function grabs(w, ev) {
    const { L, s } = w;
    const p = s.p;
    if (p.rope || p.cannon || p.bubble || p.plane || p.regrab > 0) return;
    const cx = p.x + P.W / 2, cy = p.y + P.H / 2;
    for (const pl of L.dev.plane) {
        // A paper plane on its stand: touch it and you're riding it.
        if (s.planes[pl.id] || !playerOver(p, pl.x - 1, pl.y - 0.5, 2, 0.8)) continue;
        p.plane = pl.id; s.planes[pl.id] = TOYS.PLANE_BACK;
        p.x = pl.x - P.W / 2; p.y = pl.y - P.H;
        p.vx = pl.dir * TOYS.PLANE_CRUISE; p.vy = 0;
        p.grounded = false; p.coy = 0; p.jumping = false; p.climb = false; p.buf = 0; p.wall = 0; p.wallT = 0;
        ev.push({ type: 'plane', id: pl.id });
        return;
    }
    for (const b of L.dev.bubble) {
        if (s.blown[b.id]) continue;
        const dx = cx - b.x, dy = cy - b.y;
        if (dx * dx + dy * dy > TOYS.BUBBLE_GRAB * TOYS.BUBBLE_GRAB) continue;
        p.bubble = b.id; p.bt = 0;
        p.x = b.x - P.W / 2; p.y = b.y - P.H / 2;
        p.vx *= 0.3; p.vy = 0; p.grounded = false; p.coy = 0; p.jumping = false; p.climb = false; p.buf = 0;
        s.blown[b.id] = TOYS.BUBBLE_BACK;
        ev.push({ type: 'bubble', id: b.id });
        return;
    }
    if (!p.grounded) {
        for (const R of L.dev.rope) {
            if (Math.abs(cx - R.x) > SWING.GRAB) continue;
            if (cy < R.y + R.len * 0.4 || cy > R.y + R.len + SWING.GRAB) continue;
            const dx = cx - R.x, dy = cy - R.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            p.rope = R.id; p.ropeR = Math.max(1, Math.min(R.len, d));
            const nx = dx / d, ny = dy / d;
            const vr = p.vx * nx + p.vy * ny;
            p.vx -= vr * nx; p.vy -= vr * ny;
            p.jumping = false; p.climb = false;
            ev.push({ type: 'grab', id: R.id });
            return;
        }
    }
    for (const c of L.dev.cannon) {
        if (playerOver(p, c.x + 0.15, c.y + 0.15, 0.7, 0.7)) {
            p.cannon = c.id; p.cf = 0; p.vx = 0; p.vy = 0; p.grounded = false; p.jumping = false; p.buf = 0;
            ev.push({ type: 'cannon_in', id: c.id });
            return;
        }
    }
}

/**
 * Pinball bumpers: touch one and it pops you up and away from its middle:
 * off its left side you fly up-left, off its right side up-right, land on top
 * and you go straight up. Hit it from underneath and it knocks you down.
 */
function bumpers(w, ev) {
    const { L, s } = w;
    const p = s.p;
    if (p.cannon || !L.dev.bumper.length) return;
    const cx = p.x + P.W / 2, cy = p.y + P.H / 2;
    for (const b of L.dev.bumper) {
        const dx = cx - b.x, dy = cy - b.y;
        const d = Math.sqrt(dx * dx + dy * dy), reach = b.r + TOYS.BUMP_REACH;
        if (d >= reach) continue;
        if (b.id in s.fired && s.t - s.fired[b.id] < TOYS.BUMP_COOL) continue;
        const pw = b.power || 1;
        const side = Math.abs(dx) < b.r * 0.75 ? 0 : Math.sign(dx);   // on top: straight up (keeping half your run)
        const under = dy * p.g > reach * 0.6;                  // your middle well past its middle, along gravity
        if (p.bubble) { ev.push({ type: 'pop', id: p.bubble, why: 'bump' }); p.bubble = null; p.regrab = 12; }
        if (p.rope) { p.rope = null; p.regrab = SWING.REGRAB; }
        p.vx = side ? side * TOYS.BUMP_SIDE * pw : p.vx * 0.5;
        p.vy = under ? p.g * TOYS.BUMP_DOWN * pw : -p.g * TOYS.BUMP_V * pw;
        p.grounded = false; p.coy = 0; p.jumping = false; p.buf = 0; p.climb = false;
        p.peak = p.g > 0 ? p.y + P.H : -p.y;
        s.fired[b.id] = s.t;
        ev.push({ type: 'bump', id: b.id });
        return;
    }
}

function zones(w, ev) {
    const { L, s } = w;
    const p = s.p;
    const cx = p.x + P.W / 2, cy = p.y + P.H / 2;
    for (const f of L.dev.flip) {
        if (!inRect(cx, cy, f)) continue;
        const want = f.dir === 'up' ? -1 : 1;
        if (p.g !== want) { p.g = want; p.grounded = false; p.coy = 0; p.jumping = false; p.climb = false; ev.push({ type: 'flip', dir: f.dir }); }
    }
    L.dev.coin.forEach((c, i) => {
        if (s.coins & (1 << i)) return;
        if (playerOver(p, c.x + 0.2, c.y + 0.2, 0.6, 0.6)) { s.coins |= 1 << i; ev.push({ type: 'coin', i }); }
    });
    L.dev.flag.forEach((f, i) => {
        if (s.check === i) return;
        if (playerOver(p, f.x + 0.2, f.y, 0.6, 1)) { s.check = i; s.checkG = p.g; s.checkPogo = p.pogo; ev.push({ type: 'flag', i }); }
    });
    for (const pg of L.dev.pogo) if (!p.pogo && !p.plane && playerOver(p, pg.x + 0.15, pg.y, 0.7, 1)) { p.pogo = true; ev.push({ type: 'pogo_on', id: pg.id }); }
    for (const rk of L.dev.rack) if (p.pogo && playerOver(p, rk.x + 0.15, rk.y, 0.7, 1)) { p.pogo = false; ev.push({ type: 'pogo_off', why: 'rack' }); }
    for (const b of L.dev.button) {
        // Standing on a button holds its gate open (and keeps it open a while after you step off).
        if (!playerOver(p, b.x + 0.1, b.y + 0.6, 0.8, 0.4)) continue;
        if (!(s.gates[b.gate] > 0)) ev.push({ type: 'click', id: b.id, gate: b.gate });
        s.gates[b.gate] = b.time || TOYS.GATE_TIME;
    }
}

function hazards(w, ev) {
    const { L, s } = w;
    const p = s.p;
    if (p.y > L.H + 1 || p.y < -3) return respawn(w, ev, 'fell');
    const x0 = Math.floor(p.x), x1 = Math.floor(p.x + P.W), y0 = Math.floor(p.y), y1 = Math.floor(p.y + P.H);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(L, tx, ty);
        if (t === TILE.SPIKES && playerOver(p, tx + 0.1, ty + 0.5, 0.8, 0.5)) return respawn(w, ev, 'spikes');
        if (t === TILE.SPIKES_DOWN && playerOver(p, tx + 0.1, ty, 0.8, 0.5)) return respawn(w, ev, 'spikes');
    }
}

function checkGoal(w, ev) {
    const { L, s } = w;
    for (const g of L.goals) if (playerOver(s.p, g.x + 0.25, g.y + 0.1, 0.5, 0.8)) { s.won = true; ev.push({ type: 'win' }); return; }
}

// ── Step ────────────────────────────────────────────────────────────────────
export function step(w, input = NO_INPUT) {
    const { L, s } = w;
    const ev = [];
    if (s.won) return ev;
    s.t++;
    if (L.ticks.length || L.gateCell) ghostTicks(w);
    updateCrumbles(w);
    updateSeesaws(w);
    updateBubbles(w);
    let carry = null;
    const p = s.p;
    if (p.grounded && isRide(L.byId[p.ground])) {
        const m = L.byId[p.ground], a = moverPos(m, s.t - 1), b = moverPos(m, s.t);
        carry = { dx: b.x - a.x, dy: b.y - a.y };
    }
    movePlayer(w, input, ev, carry);
    grabs(w, ev);
    bumpers(w, ev);
    zones(w, ev);
    hazards(w, ev);
    if (!L.hub) checkGoal(w, ev);
    return ev;
}

// ── Snapshots and the solver's key ─────────────────────────────────────────
export function snapshot(s) {
    const crumble = {};
    for (const k in s.crumble) crumble[k] = { st: s.crumble[k].st, f: s.crumble[k].f };
    const seesaw = {};
    for (const k in s.seesaw) seesaw[k] = { ...s.seesaw[k] };
    return { ...s, p: { ...s.p }, crumble, seesaw, fired: { ...s.fired }, blown: { ...s.blown }, planes: { ...s.planes }, gates: { ...s.gates } };
}
export function restore(w, snap) { w.s = snapshot(snap); }

/** The moment matters only near things that move on its own (toy cars, swinging cannons): their phases, as a key. */
function timedKey(L, s, p) {
    let k = '';
    const ph = (d, per) => Math.floor(((((s.t + (d.phase || 0)) % per) + per) % per) / 6);
    if (p.cannon) { const c = L.byId[p.cannon]; return c.aim.length > 1 ? `,t${ph(c, c.period)}` : ''; }
    for (const m of L.dev.mover) {
        // Standing near a car's track (waiting for it, riding it) or right beside the car itself.
        const b = m._box, at = moverPos(m, s.t);
        const beside = p.x > at.x - 3 && p.x < at.x + m.w + 3 && p.y > at.y - 4 && p.y < at.y + 3;
        const nearTrack = p.grounded && p.x > b.x0 - 4 && p.x < b.x1 + 4 && (!m.path || (p.y > b.y0 - 6 && p.y < b.y1 + 4));
        // Riding it or right beside it: its phase to 6 frames. Just waiting somewhere near its track: coarser
        // (a sixteenth of its loop), or every spot on a long ledge × every moment is a separate state.
        if (p.ground === m.id || beside) k += `,${m.id}${ph(m, m.period)}`;
        else if (nearTrack) k += `,${m.id}~${Math.floor(((((s.t + (m.phase || 0)) % m.period) + m.period) % m.period) / Math.max(6, Math.round(m.period / 16)))}`;
    }
    for (const c of L.dev.cannon) if (c.aim.length > 1 && Math.abs(p.x - c.x) < 3 && Math.abs(p.y - c.y) < 3) k += `,${c.id}${ph(c, c.period)}`;
    if (L.nearTick) {
        const cx = Math.floor(p.x + P.W / 2), cy = Math.floor(p.y + P.H / 2);
        if (cx >= 0 && cy >= 0 && cx < L.W && cy < L.H && L.nearTick[cy * L.W + cx]) k += `,k${Math.floor((s.t % L.tick) / 6)}`;
    }
    return k;
}

/** A coarse key for a state: two states with the same key play out (nearly) the same. */
export function hashState(w, withCoins = false) {
    const { L, s } = w;
    const p = s.p;
    // In a bubble you drift slowly and your height follows from how long you've been in: a coarser key.
    let k = p.bubble ? `${Math.round(p.x * 3)},${Math.round(p.y * 3)},${Math.round(p.vx)},b` :
        `${Math.round(p.x * 6)},${Math.round(p.y * 6)},${Math.round(p.vx)},${Math.round(p.vy / 2)},${p.grounded ? 1 : 0}${p.g},${p.climb ? 1 : 0}`;
    if (p.rope) k += `,r${p.rope}`;
    if (p.cannon) k += `,c${p.cannon}:${Math.min(p.cf, 13)}`;
    if (p.bubble) k += `,b${p.bubble}:${Math.floor(p.bt / 40)}`;
    if (p.plane) k += `,p${p.plane}:${Math.round(p.fanV / 2)}`;
    if (p.pogo) k += ',P';
    if (p.wall || p.kick > 0) k += `,w${p.wall}${p.kick > 0 ? 'k' : ''}`;
    for (const id in s.planes) { const d = L.byId[id]; if (id !== p.plane && Math.abs(d.x - p.x) < 8 && Math.abs(d.y - p.y) < 8) k += `,q${id}`; }
    for (const id in s.gates) {
        // An open gate matters (and how long it has left) while you're anywhere near it.
        const gt = L.byId[id];
        if (gt && Math.abs(gt.x - p.x) < 24 && Math.abs(gt.y - p.y) < 14) k += `,g${id}:${Math.floor(s.gates[id] / 12)}`;
    }
    for (const b in s.blown) { const d = L.byId[b]; if (Math.abs(d.x - p.x) < 6 && Math.abs(d.y - p.y) < 6) k += `,o${b}`; }
    if (L.cycle > 1) k += timedKey(L, s, p);
    for (const c in s.crumble) {
        // Fallen blocks matter while you're near them; behind you, they just come back.
        const x = c % L.W, y = (c - x) / L.W;
        if (Math.abs(x + 0.5 - (p.x + P.W / 2)) < 6 && Math.abs(y - p.y) < 6) k += `,${c}:${s.crumble[c].st}`;
    }
    for (const sw of L.dev.seesaw) {
        // A ruler's tilt matters while you're on it or about to be; away from it, it just settles back.
        if (Math.abs(p.x + P.W / 2 - sw.x) > sw.half + 2 || p.y + P.H > sw.y + sw.half * SWING.SEESAW_MAX + 0.5) continue;
        const st = s.seesaw[sw.id];
        k += `,${sw.id}:${Math.round(st.m * 10)}:${Math.round(st.w * 2)}`;
    }
    if (withCoins) k += `,$${s.coins}`;
    return k;
}
