// ============================================================
// SOLVER — proves a level can be finished, using the real step().
//
// Breadth-first search over "macros" (run, jump, climb, wait, install a
// part). Each macro is a burst of real inputs fed through World.step until
// the hero is settled again; the resulting state is quantised (hashState)
// and deduplicated. Because every edge is real simulation, any route found
// is a route a player can run: the solver is SOUND. It is not COMPLETE —
// pixel-perfect tricks may be missed — so a level must have a route the
// macros can find (that's the design bar, same as golf's bot).
//
//   solve(level, opts) → { solved, tape, frames, states, capped, graph? }
//     opts.locked  {socketId: partId|null} — fix sockets, no installing (puzzle layer)
//     opts.explore true → keep exploring after the goal and return the graph
//                  (softlock layer needs every reachable state)
//     opts.maxStates (default 40000)
//
//   Tape = [[bits, count, act?], ...]  bits: l=1 r=2 u=4 d=8 j=16
//   replay(level, tape) → { won, frames, hash, deaths }
// ============================================================
import { compile, step, snapshot, restore, hashState, socketHere, NO_INPUT } from './World.js';
import { TILE } from './Rules.js';

const B = { l: 1, r: 2, u: 4, d: 8, j: 16 };
export const toInput = (bits, act = null) => ({
    l: !!(bits & B.l), r: !!(bits & B.r), u: !!(bits & B.u), d: !!(bits & B.d), j: !!(bits & B.j), act,
});
const dirBits = d => (d < 0 ? B.l : d > 0 ? B.r : 0);

const settled = w => (w.s.p.grounded && Math.abs(w.s.p.vx) < 0.05) || w.s.p.climb;
const landed = w => w.s.p.grounded || w.s.p.climb;

function nearLadder(w) {
    const { L, s } = w, p = s.p;
    const cx = Math.floor(p.x + 0.35);
    for (let ty = Math.floor(p.y) - 1; ty <= Math.floor(p.y + 0.9) + 1; ty++) {
        if (ty >= 0 && ty < L.H && cx >= 0 && cx < L.W && L.grid[ty][cx] === TILE.LADDER) return true;
    }
    return false;
}

/**
 * Macros available from this state. Every macro ends SETTLED (standing still,
 * or hanging on a ladder) so states are positions × device configs — momentum
 * moves are covered by run-up jumps instead.
 * Each: { name, input(f, w) → [bits, act], done(f, w) }
 */
function macrosFor(w, allowParts) {
    const m = [];
    const settle = (f, from, w) => f >= from && settled(w);
    for (const d of [-1, 1]) for (const n of [4, 10, 24]) {
        m.push({ name: `walk${d > 0 ? 'R' : 'L'}${n}`, input: f => [f < n ? dirBits(d) : 0], done: (f, w) => settle(f, n, w) || f >= n + 150 });
    }
    for (const hold of [6, 40]) for (const d of [-1, 0, 1]) for (const runup of d === 0 ? [0] : [0, 10]) for (const air of d === 0 ? [999] : [999, 10]) {
        // runup frames of running, then press jump; hold jump `hold` frames; steer `air` frames.
        m.push({
            name: `jump${hold}/${d}/${runup}/${air}`,
            input: f => {
                const jf = f - runup;
                const j = jf >= 0 && jf < hold ? B.j : 0;
                const steer = f < runup || (jf >= 0 && jf < air) ? dirBits(d) : 0;
                return [j | steer];
            },
            done: (f, w) => (f > runup + 2 && settled(w)) || f > runup + 200,
        });
    }
    m.push({ name: 'wait', input: () => [0], done: (f, w) => (f >= 30 && settled(w)) || f > 150 });
    if (nearLadder(w)) {
        for (const ud of [B.u, B.d]) m.push({ name: ud === B.u ? 'climbU' : 'climbD', input: f => [f < 12 ? ud : 0], done: (f, w) => f >= 12 && (settled(w) || f > 150) });
    }
    if (allowParts) {
        const so = socketHere(w);
        if (so && !so.fixed) {
            for (const pid of w.s.inv) {
                if (w.L.parts[pid].kind === so.accepts) m.push({ name: `install:${pid}`, input: f => [0, f === 0 ? { install: pid } : null], done: f => f >= 1 });
            }
            if (w.s.sockets[so.id]) m.push({ name: 'remove', input: f => [0, f === 0 ? { remove: true } : null], done: f => f >= 1 });
        }
    }
    return m;
}

function runMacro(w, mac) {
    const tape = [];
    let f = 0;
    for (;;) {
        const [bits, act] = mac.input(f, w);
        step(w, toInput(bits, act || null));
        const last = tape[tape.length - 1];
        if (!act && last && last[0] === bits && !last[2]) last[1]++;
        else tape.push(act ? [bits, 1, act] : [bits, 1]);
        f++;
        if (w.s.won || mac.done(f, w)) break;
    }
    return tape;
}

export function solve(level, opts = {}) {
    const maxStates = opts.maxStates ?? 40000;
    const w = compile(level);
    const allowParts = !opts.locked;
    if (opts.locked) {
        const s = w.s;
        for (const id in opts.locked) {
            if (!(id in s.sockets)) continue;
            if (s.sockets[id]) s.inv.push(s.sockets[id]);
            s.sockets[id] = opts.locked[id];
        }
        const used = new Set(Object.values(s.sockets).filter(Boolean));
        s.inv = Object.keys(w.L.parts).filter(id => !used.has(id)).sort();
    }
    // Settle the opening frame so the start state is canonical.
    step(w, NO_INPUT);
    const start = snapshot(w.s);
    const startHash = hashState(w);
    const nodes = [{ snap: start, parent: -1, tape: [[0, 1]] }];
    const index = new Map([[startHash, 0]]);
    const edges = opts.explore ? [] : null;
    const goals = [];
    let head = 0, capped = false;
    while (head < nodes.length) {
        const ni = head++;
        const node = nodes[ni];
        restore(w, node.snap);
        const macs = macrosFor(w, allowParts);
        for (const mac of macs) {
            restore(w, node.snap);
            const tape = runMacro(w, mac);
            const h = w.s.won ? 'WIN' : hashState(w);
            let ti = index.get(h);
            if (ti === undefined) {
                if (nodes.length >= maxStates) { capped = true; continue; }
                ti = nodes.length;
                index.set(h, ti);
                nodes.push({ snap: snapshot(w.s), parent: ni, tape, won: w.s.won });
                if (w.s.won) {
                    goals.push(ti);
                    if (!opts.explore) return finish(level, nodes, ti, capped, index);
                }
            }
            if (edges && ti !== ni) edges.push([ni, ti]);
        }
    }
    const res = goals.length ? finish(level, nodes, goals[0], capped, index) : { solved: false, states: nodes.length, capped };
    if (opts.explore) res.graph = { nodes, edges, goals };
    return res;
}

function finish(level, nodes, gi, capped, index) {
    const chain = [];
    for (let i = gi; i > 0; i = nodes[i].parent) chain.push(nodes[i].tape);
    chain.push(nodes[0].tape);
    chain.reverse();
    const tape = [];
    for (const t of chain) for (const seg of t) {
        const last = tape[tape.length - 1];
        if (!seg[2] && last && !last[2] && last[0] === seg[0]) last[1] += seg[1];
        else tape.push(seg.slice());
    }
    const frames = tape.reduce((a, s) => a + s[1], 0);
    return { solved: true, tape, frames, states: nodes.length, capped };
}

/** Replay a tape on a fresh world. Used by the ghost layer and the arcade bot. */
export function replay(level, tape, opts = {}) {
    const w = compile(level);
    let frames = 0;
    for (const [bits, n, act] of tape) {
        for (let i = 0; i < n; i++) {
            step(w, toInput(bits, i === 0 ? act || null : null));
            frames++;
            if (w.s.won) return { won: true, frames, hash: hashState(w), deaths: w.s.deaths, w };
            if (opts.maxFrames && frames > opts.maxFrames) break;
        }
    }
    return { won: w.s.won, frames, hash: hashState(w), deaths: w.s.deaths, w };
}
