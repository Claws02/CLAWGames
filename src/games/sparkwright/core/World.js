// ============================================================
// WORLD — compile a level, step it one fixed frame, snapshot it.
//
// Pure: no DOM, no THREE, no Math.random, no clocks. The game, the
// solver, the ghost replay and the arcade probe all run THIS step(), so a
// route the checker proves is a route the player can run.
//
//   compile(level)              → world { L (static), s (state) }
//   step(world, input)          → events[]   (one frame, DT seconds)
//   snapshot(s) / restore(w, snap)
//   hashState(world)            quantised key for the solver
//   readouts(world)             device maths for the HUD (Devices.js lines)
//
// input = { l, r, u, d, j, act }   booleans; act = null | {install:partId} | {remove:true}
// Coordinates: tiles, x right, y DOWN (row 0 is the top of the map).
// ============================================================
import { DT, P, SI, TILE, FUSE_RESET_FRAMES, LIFT_RETURN_V } from './Rules.js';
import { springLaunch, liftDrive, seriesCircuit } from './Devices.js';

const EPS = 1e-6;
export const NO_INPUT = Object.freeze({ l: false, r: false, u: false, d: false, j: false, act: null });

// ── Compile ─────────────────────────────────────────────────────────────────
export function compile(level) {
    const map = level.map;
    const H = map.length, W = map[0].length;
    const grid = map.map(row => row.split(''));
    let start = null, goals = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (c === TILE.START) { start = { x, y }; grid[y][x] = TILE.EMPTY; }
        if (c === TILE.GOAL) goals.push({ x, y });
    }
    const dev = { socket: [], spring: [], lift: [], circuit: [], door: [], bridge: [] };
    const byId = {};
    for (const d of level.devices || []) { (dev[d.type] ||= []).push(d); byId[d.id] = d; }
    const parts = {};
    for (const p of level.parts || []) parts[p.id] = p;

    // Tiles owned by a device: springs (always solid), doors and bridges (switchable).
    const owned = new Map();
    const key = (x, y) => y * W + x;
    for (const s of dev.spring) for (let i = 0; i < (s.w || 1); i++) owned.set(key(s.x + i, s.y), s);
    for (const d of dev.door) for (let i = 0; i < (d.h || 1); i++) owned.set(key(d.x, d.y + i), d);
    for (const b of dev.bridge) for (let i = 0; i < (b.w || 1); i++) owned.set(key(b.x + i, b.y), b);
    const socketAt = new Map();
    for (const s of dev.socket) socketAt.set(key(s.x, s.y), s);

    // Which circuits drive each door/bridge.
    const drivenBy = {};
    for (const c of dev.circuit) for (const id of c.drives || []) (drivenBy[id] ||= []).push(c.id);

    const L = { level, W, H, grid, start, goals, dev, byId, parts, owned, socketAt, drivenBy, key };
    const s = initialState(L);
    return { L, s };
}

function initialState(L) {
    const sockets = {};
    for (const so of L.dev.socket) sockets[so.id] = so.preset ?? null;
    const used = new Set(Object.values(sockets).filter(Boolean));
    const inv = Object.keys(L.parts).filter(id => !used.has(id)).sort();
    const lifts = {};
    for (const l of L.dev.lift) lifts[l.id] = l.yBottom;
    const open = {};
    for (const d of [...L.dev.door, ...L.dev.bridge]) open[d.id] = false;
    const s = {
        t: 0, p: spawnPlayer(L), sockets, inv, lifts, fuse: {}, open, powered: {},
        won: false, deaths: 0, locked: false,
    };
    return s;
}

function spawnPlayer(L) {
    return {
        x: L.start.x + (1 - P.W) / 2, y: L.start.y + 1 - P.H, vx: 0, vy: 0,
        grounded: true, ground: 'tile', climb: false, coy: 0, buf: 0, prevJ: false, jumping: false,
    };
}

// ── Queries ─────────────────────────────────────────────────────────────────
function tileAt(L, x, y) {
    if (x < 0 || x >= L.W || y < 0) return TILE.SOLID;   // side walls + ceiling are solid
    if (y >= L.H) return TILE.EMPTY;                      // below the map = falling out
    return L.grid[y][x];
}

/** Is tile (x,y) solid right now (map + devices)? */
export function solidAt(w, x, y) {
    const { L, s } = w;
    const t = tileAt(L, x, y);
    if (t === TILE.SOLID) return true;
    if (y < 0 || y >= L.H || x < 0 || x >= L.W) return false;
    const d = L.owned.get(L.key(x, y));
    if (!d) return false;
    if (d.type === 'spring') return true;
    if (d.type === 'door') return !s.open[d.id];
    if (d.type === 'bridge') return s.open[d.id];
    return false;
}

function isLadder(L, x, y) { return tileAt(L, x, y) === TILE.LADDER; }
const overlaps = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
const playerOver = (p, x, y, w = 1, h = 1) => overlaps(p.x, p.y, P.W, P.H, x, y, w, h);

/** The socket the player is standing in, or null. */
export function socketHere(w) {
    const { L, s } = w;
    for (const so of L.dev.socket) if (playerOver(s.p, so.x, so.y)) return so;
    return null;
}

// ── Devices, once per frame ─────────────────────────────────────────────────
function updateCircuits(w, ev) {
    const { L, s } = w;
    for (const c of L.dev.circuit) {
        if (s.fuse[c.id] > 0) { s.fuse[c.id]--; s.powered[c.id] = false; continue; }
        const r = evalCircuit(w, c);
        if (r.state === 'blown') {
            // The fuse blows: every part in this loop pops out back to the tray,
            // and the fuse resets after FUSE_RESET_FRAMES. Visible, never a softlock.
            for (const id of circuitSockets(c)) if (s.sockets[id]) { s.inv.push(s.sockets[id]); s.sockets[id] = null; }
            s.inv.sort();
            s.fuse[c.id] = FUSE_RESET_FRAMES;
            s.powered[c.id] = false;
            ev.push({ type: 'fuse', id: c.id, I: r.I });
        } else {
            const was = !!s.powered[c.id];
            s.powered[c.id] = r.state === 'on';
            if (s.powered[c.id] !== was) ev.push({ type: s.powered[c.id] ? 'power_on' : 'power_off', id: c.id });
        }
    }
    // Doors/bridges follow their circuits, but never appear inside the player.
    for (const d of [...L.dev.door, ...L.dev.bridge]) {
        const on = (L.drivenBy[d.id] || []).some(id => s.powered[id]);
        const wantSolid = d.type === 'door' ? !on : on;
        const isSolid = d.type === 'door' ? !s.open[d.id] : s.open[d.id];
        if (wantSolid && !isSolid && devOverlapsPlayer(d, s.p)) continue;   // wait until clear
        s.open[d.id] = on;   // door: open when powered · bridge: solid when powered
    }
}

function devOverlapsPlayer(d, p) {
    if (d.type === 'door') return playerOver(p, d.x, d.y, 1, d.h || 1);
    return playerOver(p, d.x, d.y, d.w || 1, 1);
}

export function circuitSockets(c) { return [...(c.battery ? [c.battery] : []), ...(c.sockets || [])]; }

export function evalCircuit(w, c) {
    const { L, s } = w;
    const V = c.volts ?? (c.battery ? L.parts[s.sockets[c.battery]]?.volts : undefined);
    const rs = (c.sockets || []).map(id => (s.sockets[id] ? L.parts[s.sockets[id]].ohms : null));
    return seriesCircuit(V ?? null, c.loadR, rs, c.iMin, c.iMax);
}

export function evalLift(w, l) {
    const { L, s } = w;
    const gear = s.sockets[l.socket] ? L.parts[s.sockets[l.socket]] : null;
    if (!gear) return null;
    return liftDrive(gear, l.motor, l.drumR, l.massKg + SI.HERO_KG);
}

export function evalSpring(w, sp) {
    const { L, s } = w;
    const part = s.sockets[sp.socket] ? L.parts[s.sockets[sp.socket]] : null;
    if (!part) return null;
    return springLaunch(part.k, sp.compress, SI.HERO_KG);
}

function updateLifts(w, ev) {
    const { L, s } = w;
    const p = s.p;
    for (const l of L.dev.lift) {
        const y = s.lifts[l.id];
        const riding = p.grounded && p.ground === l.id;
        let ny = y;
        if (riding) {
            const d = evalLift(w, l);
            if (d && d.ok) ny = Math.max(l.yTop, y - (d.v / SI.TILE_M) * DT);
            else if (d && !d.ok && s.t % 30 === 0) ev.push({ type: 'stall', id: l.id });
        } else {
            ny = Math.min(l.yBottom, y + LIFT_RETURN_V * DT);
        }
        if (ny !== y) {
            s.lifts[l.id] = ny;
            if (riding) p.y += ny - y;   // carry the rider
        }
    }
}

// ── Player ──────────────────────────────────────────────────────────────────
function respawn(w, ev, why) {
    w.s.p = spawnPlayer(w.L);
    w.s.deaths++;
    ev.push({ type: 'death', why });
}

function act(w, input, ev) {
    const { L, s } = w;
    const so = socketHere(w);
    if (!so || !input.act) return;
    if (input.act.remove) {
        if (s.sockets[so.id] && !so.fixed) { s.inv.push(s.sockets[so.id]); s.inv.sort(); s.sockets[so.id] = null; ev.push({ type: 'remove', id: so.id }); }
        return;
    }
    const pid = input.act.install;
    const part = L.parts[pid];
    if (!part || so.fixed || part.kind !== so.accepts || !s.inv.includes(pid)) return;
    if (s.sockets[so.id]) s.inv.push(s.sockets[so.id]);
    s.inv = s.inv.filter(id => id !== pid).sort();
    s.sockets[so.id] = pid;
    ev.push({ type: 'install', id: so.id, part: pid });
}

function movePlayer(w, input, ev) {
    const { L, s } = w;
    const p = s.p;
    const dir = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    const jEdge = input.j && !p.prevJ;
    p.prevJ = input.j;
    if (jEdge) p.buf = P.BUFFER;
    else if (p.buf > 0) p.buf--;

    // Ladders: the column under the player's centre.
    const cx = Math.floor(p.x + P.W / 2);
    const onLadder = (() => { for (let ty = Math.floor(p.y + EPS); ty <= Math.floor(p.y + P.H - EPS); ty++) if (isLadder(L, cx, ty)) return true; return false; })();
    const ladderBelow = isLadder(L, cx, Math.floor(p.y + P.H + EPS));
    if (!p.climb && ((input.u && onLadder) || (input.d && p.grounded && ladderBelow))) {
        p.climb = true; p.vx = 0; p.vy = 0; p.jumping = false;
        p.x = cx + (1 - P.W) / 2;
        if (input.d && !onLadder) p.y += 0.05;
    }
    if (p.climb) {
        if (jEdge) {
            p.climb = false; p.vy = -P.JUMP_V * P.LADDER_JUMP; p.vx = dir * P.RUN; p.jumping = true; p.buf = 0;
        } else if (!onLadder && !(input.d && ladderBelow)) {
            p.climb = false;
        } else if (dir !== 0 && !input.u && !input.d) {
            p.climb = false; p.vx = dir * P.RUN * 0.6;
        } else {
            p.vx = 0;
            p.vy = ((input.d ? 1 : 0) - (input.u ? 1 : 0)) * P.CLIMB;
        }
    }

    if (!p.climb) {
        // Horizontal: accelerate toward target, friction when no input.
        const target = dir * P.RUN;
        const acc = dir !== 0 ? (p.grounded ? P.ACC_GROUND : P.ACC_AIR) : (p.grounded ? P.FRICTION : P.ACC_AIR * 0.25);
        if (p.vx < target) p.vx = Math.min(target, p.vx + acc * DT);
        else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * DT);
        // Gravity.
        p.vy = Math.min(P.MAX_FALL, p.vy + P.G * DT);
        // Jump (buffered, with coyote time).
        if (p.buf > 0 && (p.grounded || p.coy > 0)) {
            p.vy = -P.JUMP_V; p.grounded = false; p.coy = 0; p.buf = 0; p.jumping = true;
            ev.push({ type: 'jump' });
        }
        if (p.jumping && !input.j && p.vy < -P.JUMP_CUT) p.vy = -P.JUMP_CUT;
        if (p.vy >= 0) p.jumping = false;
    }

    // ── X ──
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

    // ── Y ──
    const prevBottom = p.y + P.H;
    p.y += p.vy * DT;
    const wasGrounded = p.grounded;
    p.grounded = false;
    const x0 = Math.floor(p.x + EPS), x1 = Math.floor(p.x + P.W - EPS);
    if (p.vy > 0) {
        const bottom = p.y + P.H;
        let land = null;   // highest surface we cross
        const ty = Math.floor(bottom);
        for (let tx = x0; tx <= x1; tx++) {
            const t = tileAt(L, tx, ty);
            const solid = solidAt(w, tx, ty);
            const oneway = t === TILE.ONEWAY ||
                (t === TILE.LADDER && !isLadder(L, tx, ty - 1) && !p.climb && !input.d);
            if (solid || (oneway && prevBottom <= ty + EPS)) {
                if (!land || ty < land.y) {
                    const d = L.owned.get(L.key(tx, ty));
                    land = { y: ty, ground: d && d.type === 'spring' ? 'spring:' + d.id : 'tile' };
                }
            }
        }
        for (const l of L.dev.lift) {
            const surf = s.lifts[l.id];
            if (p.x < l.x + l.w && p.x + P.W > l.x && prevBottom <= surf + EPS && bottom >= surf) {
                if (!land || surf <= land.y) land = { y: surf, ground: l.id };   // a lift wins a tie with its shaft floor
            }
        }
        if (land) {
            p.y = land.y - P.H; p.vy = 0; p.grounded = true; p.ground = land.ground; p.climb = false;
        }
    } else if (p.vy < 0) {
        const ty = Math.floor(p.y);
        for (let tx = x0; tx <= x1; tx++) if (solidAt(w, tx, ty)) { p.y = ty + 1; p.vy = 0; p.jumping = false; break; }
    }
    if (p.climb) p.grounded = false;
    if (p.grounded) p.coy = P.COYOTE;
    else if (wasGrounded && !p.climb && p.vy >= 0) p.coy = P.COYOTE - 1;
    else if (p.coy > 0) p.coy--;
    if (p.grounded && !wasGrounded) ev.push({ type: 'land' });

    // Spring pads launch whoever lands on them.
    if (p.grounded && p.ground.startsWith('spring:')) {
        const sp = L.byId[p.ground.slice(7)];
        const r = evalSpring(w, sp);
        if (r) {
            p.vy = -Math.sqrt(2 * P.G * (r.h / SI.TILE_M));
            p.grounded = false; p.coy = 0; p.jumping = false;
            ev.push({ type: 'spring', id: sp.id, h: r.h });
        }
    }
}

function hazards(w, ev) {
    const { L, s } = w;
    const p = s.p;
    if (p.y > L.H + 1) return respawn(w, ev, 'fell');
    const x0 = Math.floor(p.x), x1 = Math.floor(p.x + P.W), y0 = Math.floor(p.y), y1 = Math.floor(p.y + P.H);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(L, tx, ty);
        if (t === TILE.SPIKES && playerOver(p, tx + 0.1, ty + 0.5, 0.8, 0.5)) return respawn(w, ev, 'spikes');
        if (t === TILE.SPIKES_DOWN && playerOver(p, tx + 0.1, ty, 0.8, 0.5)) return respawn(w, ev, 'spikes');
    }
}

function checkGoal(w, ev) {
    const { L, s } = w;
    if (!s.p.grounded) return;
    for (const g of L.goals) if (playerOver(s.p, g.x + 0.25, g.y, 0.5, 1)) { s.won = true; ev.push({ type: 'win' }); return; }
}

// ── Step ────────────────────────────────────────────────────────────────────
export function step(w, input = NO_INPUT) {
    const ev = [];
    const s = w.s;
    if (s.won) return ev;
    s.t++;
    act(w, input, ev);
    updateCircuits(w, ev);
    updateLifts(w, ev);
    movePlayer(w, input, ev);
    hazards(w, ev);
    checkGoal(w, ev);
    return ev;
}

// ── Snapshot / hash ─────────────────────────────────────────────────────────
export function snapshot(s) {
    return {
        t: s.t, p: { ...s.p }, sockets: { ...s.sockets }, inv: s.inv.slice(), lifts: { ...s.lifts },
        fuse: { ...s.fuse }, open: { ...s.open }, powered: { ...s.powered },
        won: s.won, deaths: s.deaths, locked: s.locked,
    };
}
export function restore(w, snap) { w.s = snapshot(snap); }

/** Quantised state key. Two states with the same key are treated as the same by the solver. */
export function hashState(w) {
    const { s } = w, p = s.p;
    let k = `${Math.round(p.x * 4)},${Math.round(p.y * 4)},${Math.round(p.vx)},${Math.round(p.vy)},${p.grounded ? 1 : 0}${p.climb ? 1 : 0}`;
    for (const id in s.sockets) k += '|' + (s.sockets[id] || '-');
    for (const id in s.lifts) k += '|' + Math.round(s.lifts[id] * 2);
    for (const id in s.fuse) k += '|f' + (s.fuse[id] > 0 ? 1 : 0);
    for (const id in s.open) k += s.open[id] ? '1' : '0';
    return k;
}

/** Everything the HUD shows about the devices, as text lines from Devices.js. */
export function readouts(w) {
    const { L, s } = w;
    const out = [];
    for (const sp of L.dev.spring) out.push({ id: sp.id, kind: 'spring', socket: sp.socket, r: evalSpring(w, sp) });
    for (const l of L.dev.lift) out.push({ id: l.id, kind: 'lift', socket: l.socket, r: evalLift(w, l) });
    for (const c of L.dev.circuit) out.push({ id: c.id, kind: 'circuit', sockets: circuitSockets(c), r: evalCircuit(w, c), blown: s.fuse[c.id] > 0 });
    return out;
}
