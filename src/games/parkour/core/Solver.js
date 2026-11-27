// ============================================================
// SOLVER — proves a course can be run, using the real step().
//
// Best-first search over short input bursts ("macros": run/stand × no jump,
// a hop, a medium jump or a full jump × 8 or 20 frames). Every edge is real
// simulation, so any route found is a route a player can run: the solver is
// SOUND. It isn't COMPLETE (pixel-perfect tricks can be missed), which is
// the design bar: a course needs a route these macros can find.
// States are keyed by World.hashState and deduplicated. Deaths are pruned.
//
//   search(w, reached, target, opts) → { found, tape, frames, states, capped, w }
//   route(level, targets, opts)      → chained searches: start → each target in turn
//   replay(level, tape)              → { won, frames, hash, deaths, coins, w }
//
//   Tape = [[bits, count], ...]   bits: l=1 r=2 u=4 d=8 j=16
// ============================================================
import { compile, step, snapshot, restore, hashState, portalHere, NO_INPUT } from './World.js';
import { P, TILE, SOLID_TILES, BOUNCE, TOYS } from './Rules.js';
const BOUNCE_G = P.G;

const B = { l: 1, r: 2, u: 4, d: 8, j: 16 };
export const toInput = bits => ({ l: !!(bits & B.l), r: !!(bits & B.r), u: !!(bits & B.u), d: !!(bits & B.d), j: !!(bits & B.j) });
const dirBits = d => (d < 0 ? B.l : d > 0 ? B.r : 0);

// A macro: `n` frames of one input, then (if you're in the air) keep steering
// until you land, catch a swing, climb into a cannon or splash into water.
// Mid-air states are never stored, so the search doesn't drown in arcs over pits.
const MACROS = [];
for (const n of [8, 20]) for (const d of [-1, 0, 1]) for (const jf of [0, 3, 9, 99]) for (const d2 of d === 0 ? [0, -1, 1] : [d, 0]) {
    MACROS.push({ n, bits: f => dirBits(d) | (f < jf ? B.j : 0), air: dirBits(d2) | (jf === 99 ? B.j : 0) });
}
MACROS.push({ n: 40, bits: () => 0, air: 0 }, { n: 120, bits: () => 0, air: 0 });    // waiting (for a train, a beat)
// Inside a bubble only steering and popping matter: a smaller set (drift ◀ / still / ▶, or pop and steer the fall).
const BUBBLE_MACROS = [];
for (const n of [8, 20]) for (const d of [-1, 0, 1]) BUBBLE_MACROS.push({ n, bits: () => dirBits(d), air: dirBits(d) });
for (const d of [-1, 0, 1]) for (const d2 of [-1, 0, 1]) BUBBLE_MACROS.push({ n: 2, bits: f => (f === 0 ? B.j : 0) | dirBits(d), air: dirBits(d2) });
// The sticky hand fires on a second JUMP in the air: jump (or step off), let go of JUMP, press it again
// a moment later (only courses with hooks get these).
const HOOK_MACROS = [];
for (const d of [-1, 0, 1]) for (const [j1, t2] of [[16, 20], [16, 28], [20, 36], [6, 12], [0, 8], [0, 16], [0, 26]]) {
    HOOK_MACROS.push({ n: t2 + 2, bits: f => dirBits(d) | (f < j1 || f >= t2 ? B.j : 0), air: dirBits(d) });
}
// Ladders: climb up or down (only courses with ladders get these).
const LADDER_MACROS = [];
for (const n of [8, 20]) for (const v of [B.u, B.d]) LADDER_MACROS.push({ n, bits: () => v, air: 0 });
for (const d of [-1, 0, 1]) MACROS.push({ n: 45, bits: () => dirBits(d) | B.j, air: dirBits(d) | B.j });
const AIR_MAX = 120;
// Settled = a place to decide from: standing, holding on, inside something, sliding down velcro, flying a plane, or a pogo bounce.
const settled = p => p.grounded || p.rope || p.cannon || p.wet || p.climb || p.bubble || p.plane || p.bounced || (p.wall && p.vy * p.g > 0);

// A binary heap of [priority, node index].
function heap() {
    const a = [];
    return {
        get size() { return a.length; },
        push(pr, v) {
            a.push([pr, v]);
            let i = a.length - 1;
            while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
        },
        pop() {
            const top = a[0], last = a.pop();
            if (a.length) {
                a[0] = last;
                let i = 0;
                for (;;) {
                    const l = 2 * i + 1, r = l + 1;
                    let m = i;
                    if (l < a.length && a[l][0] < a[m][0]) m = l;
                    if (r < a.length && a[r][0] < a[m][0]) m = r;
                    if (m === i) break;
                    [a[i], a[m]] = [a[m], a[i]]; i = m;
                }
            }
            return top[1];
        },
    };
}

const centre = s => ({ x: s.p.x + P.W / 2, y: s.p.y + P.H / 2 });

/**
 * How far every open cell is from the target, walking through open cells
 * (gravity ignored), with launchers as shortcuts: a cannon, a jack-in-the-box
 * or a swing is as close as the best cell it can throw you to. A far better
 * guide than a straight line: climbing a wall, or climbing into a cannon,
 * counts as getting closer.
 */
export function navField(L, target) {
    const { W, H, grid } = L;
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !SOLID_TILES.has(grid[y][x]) && grid[y][x] !== TILE.SPIKES && grid[y][x] !== TILE.SPIKES_DOWN && grid[y][x] !== TILE.FISH && !L.owned.has(y * W + x);
    const d = new Float32Array(W * H).fill(Infinity);
    const tx = Math.max(0, Math.min(W - 1, Math.floor(target.x))), ty = Math.max(0, Math.min(H - 1, Math.floor(target.y)));
    // Cells each launcher can throw you through (a rough ballistic trace).
    const launchers = [];
    const trace = (x0, y0, vx, vy, g = BOUNCE_G) => {
        const cells = new Set();
        let x = x0, y = y0;
        for (let i = 0; i < 90; i++) {
            x += vx / 30; y += vy / 30; vy += g / 30;
            const cx = Math.floor(x), cy = Math.floor(y);
            if (!open(cx, cy)) break;
            cells.add(cy * W + cx);
        }
        return cells;
    };
    for (const c of L.dev.cannon) {
        const cells = new Set(), v = BOUNCE.CANNON_V * (c.power || 1);
        const aims = c.aim.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map(u => [c.aim[0][0] + (c.aim[1][0] - c.aim[0][0]) * u, c.aim[0][1] + (c.aim[1][1] - c.aim[0][1]) * u]) : c.aim;
        for (const [ax, ay] of aims) { const n = Math.hypot(ax, ay) || 1; for (const k of trace(c.x + 0.5, c.y + 0.5, (ax / n) * v, (ay / n) * v)) cells.add(k); }
        launchers.push({ at: [c.y * W + c.x], cells });
    }
    for (const sp of L.dev.spring) {
        const v = BOUNCE.SPRING_V * (sp.power || 1);
        launchers.push({ at: [(sp.y - 1) * W + sp.x], cells: trace(sp.x + 0.5, sp.y - 0.5, (sp.dx || 0) * (sp.kick || 8), -v) });
    }
    for (const R of L.dev.rope) {
        const cells = new Set(), at = [];
        for (let y = Math.floor(R.y); y <= Math.ceil(R.y + R.len) + 1; y++) for (let x = Math.floor(R.x - R.len - 1); x <= Math.ceil(R.x + R.len + 1); x++) {
            if (!open(x, y)) continue;
            const dd = Math.hypot(x + 0.5 - R.x, y + 0.5 - R.y);
            if (dd <= R.len + 1.5 && y + 0.5 >= R.y) cells.add(y * W + x);
            if (Math.abs(x + 0.5 - R.x) < 1 && y + 0.5 > R.y + R.len * 0.4) at.push(y * W + x);
        }
        // Letting go flies on a bit past the swing.
        for (const k of [...cells]) { const x = k % W, y = (k - x) / W; for (const nx of [x - 2, x - 1, x + 1, x + 2]) if (open(nx, y)) cells.add(y * W + nx); }
        launchers.push({ at, cells });
    }
    for (const b of L.dev.bumper) {
        // Popped up: off its left side, its top, or its right side.
        const cells = new Set(), at = [], pw = b.power || 1;
        for (const sd of [-1, 0, 1]) for (const k of trace(b.x + sd * (b.r + 0.4), b.y - b.r - 0.5, sd * TOYS.BUMP_SIDE * pw, -TOYS.BUMP_V * pw)) cells.add(k);
        for (let y = Math.floor(b.y - b.r - 1); y <= Math.floor(b.y + b.r + 1); y++) for (let x = Math.floor(b.x - b.r - 1); x <= Math.floor(b.x + b.r + 1); x++) if (open(x, y)) at.push(y * W + x);
        launchers.push({ at, cells });
    }
    for (const b of L.dev.bubble) {
        // Floats you up, drifting as far sideways as you steer: a cone above it.
        const cells = new Set(), bx = Math.floor(b.x), by = Math.floor(b.y);
        let lo = bx, hi = bx;
        for (let y = by; y >= Math.max(0, by - 40); y--) {
            let any = false;
            for (let x = lo; x <= hi; x++) if (open(x, y)) { cells.add(y * W + x); any = true; }
            if (!any) break;
            lo = Math.max(0, lo - 1); hi = Math.min(W - 1, hi + 1);
        }
        launchers.push({ at: [by * W + bx], cells });
    }
    for (const pl of L.dev.plane) {
        // A paper plane glides a long way down (and can climb a little): a wedge in front of it.
        const cells = new Set();
        for (let i = 1; i < 60; i++) {
            const x = Math.floor(pl.x + pl.dir * i);
            if (x < 0 || x >= W) break;
            const lo = Math.floor(pl.y - 2 - i * 0.05), hi = Math.floor(pl.y + i * 0.35);
            for (let y = lo; y <= hi; y++) if (open(x, y)) cells.add(y * W + x);
        }
        launchers.push({ at: [Math.floor(pl.y - 0.5) * W + Math.floor(pl.x)], cells });
    }
    for (const h of L.dev.hook) {
        // The sticky hand: from anywhere in range below it you can swing on it (or be pulled up to it).
        const cells = new Set(), at = [], R = TOYS.HAND_RANGE;
        for (let y = Math.floor(h.y - 2); y <= Math.ceil(h.y + R); y++) for (let x = Math.floor(h.x - R - 2); x <= Math.ceil(h.x + R + 2); x++) {
            if (!open(x, y)) continue;
            const dd = Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y);
            if (dd <= R && y + 0.5 >= h.y - 0.5) at.push(y * W + x);
            if (dd <= R + 2) cells.add(y * W + x);
        }
        for (let y = Math.floor(h.y - 3); y <= Math.floor(h.y); y++) for (let x = Math.floor(h.x - 2); x <= Math.floor(h.x + 2); x++) if (open(x, y)) cells.add(y * W + x);
        launchers.push({ at, cells });
    }
    for (const b of L.dev.warp) {
        // A warp box: standing on it is as good as standing on its twin.
        const to = L.byId[b.to];
        if (!to) continue;
        const tg = to.g || 1, cells = new Set();
        for (let k = 1; k <= 3; k++) { const y = to.y - tg * k; if (open(to.x, y)) cells.add(y * W + to.x); }
        const ay = b.y - (b.g || 1);
        if (open(b.x, ay)) launchers.push({ at: [ay * W + b.x], cells });
    }
    let seeds = [[ty * W + tx, 0]];
    for (let pass = 0; pass < 6 && seeds.length; pass++) {
        // Spread distances out from the seeds (a BFS that only ever lowers a cell).
        const q = [];
        for (const [k, v] of seeds) if (v < d[k]) { d[k] = v; q.push(k); }
        for (let i = 0; i < q.length; i++) {
            const k = q[i], x = k % W, y = (k - x) / W;
            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
                if (!open(nx, ny) || d[ny * W + nx] <= d[k] + 1) continue;
                d[ny * W + nx] = d[k] + 1;
                q.push(ny * W + nx);
            }
        }
        // A launcher is as close as the best cell it reaches (+ a little for the ride).
        seeds = [];
        for (const ln of launchers) {
            let best = Infinity;
            for (const k of ln.cells) best = Math.min(best, d[k]);
            for (const a of ln.at) if (best + 2 < d[a]) seeds.push([a, best + 2]);
        }
    }
    return d;
}

/**
 * Search from the world's current state until reached(w) is true.
 * target {x, y} steers the search (straight-line distance); opts.maxStates caps it.
 */
export function search(w0, reached, target, opts = {}) {
    const maxStates = opts.maxStates ?? 120000;
    const timeW = opts.timeWeight ?? 1.5;            // tiles of distance worth one second of play
    const w = { L: w0.L, s: snapshot(w0.s) };
    const nodes = [{ snap: snapshot(w.s), parent: -1, tape: null, frames: 0 }];
    const seen = new Set([hashState(w, true)]);
    const open = heap();
    const field = opts.field || null, L = w.L;
    if (L._ladders === undefined) L._ladders = L.grid.some(r => r.includes(TILE.LADDER));
    const macros = [...MACROS, ...(L._ladders ? LADDER_MACROS : []), ...(L.dev.hook.length ? HOOK_MACROS : [])];
    const h = s => {
        const c = centre(s);
        const e = Math.sqrt((c.x - target.x) ** 2 + (c.y - target.y) ** 2);
        if (!field) return e;
        const x = Math.floor(c.x), y = Math.floor(c.y);
        const f = x >= 0 && y >= 0 && x < L.W && y < L.H ? field[y * L.W + x] : Infinity;
        return f === Infinity ? e + 40 : f + 0.1 * e;
    };
    open.push(h(w.s), 0);
    let capped = false, best = { d: h(w.s), at: centre(w.s) };
    while (open.size) {
        const ni = open.pop();
        const node = nodes[ni];
        if (opts.trace) opts.trace(node.snap, node.frames);
        for (const mac of (node.snap.p.bubble ? BUBBLE_MACROS : macros)) {
            restore(w, node.snap);
            const deaths = w.s.deaths;
            const tape = [];
            let hit = false;
            const was = { rope: w.s.p.rope, cannon: w.s.p.cannon, bubble: w.s.p.bubble, plane: w.s.p.plane };
            const push = bits => { step(w, toInput(bits)); const last = tape[tape.length - 1]; if (last && last[0] === bits) last[1]++; else tape.push([bits, 1]); };
            for (let f = 0; f < mac.n; f++) {
                push(mac.bits(f));
                if (w.s.deaths !== deaths) break;
                if (reached(w)) { hit = true; break; }
                const p = w.s.p;
                if ((p.rope && p.rope !== was.rope) || (p.cannon && p.cannon !== was.cannon) || (p.bubble && p.bubble !== was.bubble) || (p.plane && p.plane !== was.plane)) break;   // caught something: a new place to decide from
            }
            for (let f = 0; !hit && w.s.deaths === deaths && !settled(w.s.p) && f < AIR_MAX; f++) {
                push(mac.air);
                if (reached(w)) hit = true;
            }
            if (w.s.deaths !== deaths) {
                if (opts.deathEscapes) return { found: true, died: true, states: nodes.length, capped, w };   // the traps check: back to a flag is a way out
                continue;
            }
            // A coin or flag reached mid-air only counts if some way of steering lands you safely:
            // the next search starts from here, and a jump into the spikes is no place to start.
            if (hit && !w.s.won && !settled(w.s.p) && !survivable(w)) continue;
            const frames = node.frames + tape.reduce((a, t) => a + t[1], 0);
            if (hit) {
                nodes.push({ snap: null, parent: ni, tape, frames });
                return finish(nodes, nodes.length - 1, w, capped);
            }
            const k = hashState(w, true);
            if (seen.has(k)) continue;
            if (nodes.length >= maxStates) { capped = true; continue; }
            seen.add(k);
            const d = h(w.s);
            if (d < best.d) best = { d, at: centre(w.s) };
            nodes.push({ snap: snapshot(w.s), parent: ni, tape, frames });
            open.push(h(w.s) + timeW * (frames / 60), nodes.length - 1);
        }
        if (capped && open.size === 0) break;
    }
    return { found: false, states: nodes.length, capped, best };
}

const AIR_TRIES = [0, B.l, B.r, B.j, B.l | B.j, B.r | B.j];
/** Can you get from this mid-air moment to somewhere settled without dying? */
function survivable(w) {
    const snap = snapshot(w.s), probe = { L: w.L, s: null };
    for (const bits of AIR_TRIES) {
        restore(probe, snap);
        const d0 = probe.s.deaths;
        for (let f = 0; f < AIR_MAX * 2 && probe.s.deaths === d0 && !settled(probe.s.p); f++) step(probe, toInput(bits));
        if (probe.s.deaths === d0) return true;
    }
    return false;
}

function finish(nodes, gi, w, capped) {
    const chain = [];
    for (let i = gi; i > 0; i = nodes[i].parent) chain.push(nodes[i].tape);
    chain.reverse();
    const tape = [];
    for (const t of chain) for (const seg of t) {
        const last = tape[tape.length - 1];
        if (last && last[0] === seg[0]) last[1] += seg[1]; else tape.push(seg.slice());
    }
    return { found: true, tape, frames: nodes[gi].frames, states: nodes.length, capped, w };
}

/** Target helpers. */
export const goalTarget = L => ({ at: { x: L.goals[0].x + 0.5, y: L.goals[0].y + 0.5 }, reached: w => w.s.won, name: 'the goal' });
export const coinTarget = (L, i) => ({ at: { x: L.dev.coin[i].x + 0.5, y: L.dev.coin[i].y + 0.5 }, reached: w => !!(w.s.coins & (1 << i)), name: `coin ${i + 1}` });
export const flagTarget = (L, i) => ({ at: { x: L.dev.flag[i].x + 0.5, y: L.dev.flag[i].y + 0.5 }, reached: w => w.s.check === i, name: `flag ${L.dev.flag[i].id || i + 1}` });
export const portalTarget = (L, pt) => ({ at: { x: pt.x + 0.5, y: pt.y + 0.5 }, reached: w => portalHere(w)?.id === pt.id && w.s.p.grounded, name: `door ${pt.to}` });

/**
 * Run the searches one after another from `w` (default: a fresh compile).
 * Returns { found, tape, frames, failedAt?, states }.
 */
export function route(level, targets, opts = {}) {
    let w = opts.from || compile(level);
    const tape = [];
    let frames = 0, states = 0;
    for (const t of targets) {
        if (t.reached(w)) continue;
        const r = search(w, t.reached, t.at, { ...opts, field: navField(w.L, t.at) });
        states += r.states;
        if (!r.found) return { found: false, failedAt: t.name, capped: r.capped, states, tape, frames, best: r.best };
        for (const seg of r.tape) {
            const last = tape[tape.length - 1];
            if (last && last[0] === seg[0]) last[1] += seg[1]; else tape.push(seg.slice());
        }
        frames += r.frames;
        w = r.w;
    }
    return { found: true, tape, frames, states, w };
}

/** Replay a tape on a fresh world (the ghost check, the QA autoplay). */
export function replay(level, tape, opts = {}) {
    const w = opts.from || compile(level);
    let frames = 0;
    for (const [bits, n] of tape) {
        for (let i = 0; i < n; i++) {
            step(w, toInput(bits));
            frames++;
            if (w.s.won) return { won: true, frames, hash: hashState(w, true), deaths: w.s.deaths, coins: w.s.coins, w };
        }
    }
    return { won: w.s.won, frames, hash: hashState(w, true), deaths: w.s.deaths, coins: w.s.coins, w };
}

export { NO_INPUT };
