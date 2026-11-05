// ============================================================
// MIRROR LAGOON — the puzzle: tracing the beams, a level's par, and how
// levels are made. No DOM (Mirror.js is the screen); the levels themselves
// are made once by scripts/mirror-levels.mjs into MirrorLevels.js (the par
// search is too slow to run on a phone), and qa/aimgames.mjs re-proves them.
//
// THE RULES. Lighthouses on the shore shine beams across the lagoon, one red
// and (later) one blue. A beam goes straight until it meets:
//   a mirror     tap it to turn it a step: ╱ → — → ╲ → │ → ╱. A slanted one
//                turns the beam; one lying along the beam lets it pass; one
//                square across it bounces the beam straight back
//   a bolted mirror   the same, but it can't be turned
//   a rock       stops every beam
//   glass        lets its own colour through and stops the other
// Light every lantern: a red one needs the red beam, a blue one the blue beam,
// a purple one both. Par is the fewest taps.
// ============================================================
export const ORDER = ['/', '-', '\\', '|'];        // a tap turns a mirror one step along this
export const DIRS = { r: [1, 0], l: [-1, 0], d: [0, 1], u: [0, -1] };
export const turns = (from, to) => (to - from + 4) % 4;   // taps to get from one to the other

/** What a mirror in state m does to a beam going (dx, dy). */
export function bounce(m, dx, dy) {
    switch (ORDER[m]) {
        case '/': return [-dy, -dx];
        case '\\': return [dy, dx];
        case '-': return dy ? [-dx, -dy] : [dx, dy];   // lying flat: across it bounces back, along it passes
        case '|': return dx ? [-dx, -dy] : [dx, dy];
    }
    return [dx, dy];
}

const _at = (list, k) => list.find(o => o.k === k);

/**
 * Follow the beams. get(k) gives a mirror's state, or -1 if it isn't decided
 * (the par search): then it returns { need: k } at the first such mirror.
 * Otherwise: { beams: [{ c, pts: [[x, y]…] (in squares, for drawing), cells }], lit: Set of lantern indexes, solved }.
 */
function _run(lv, get) {
    const { w, h } = lv, beams = [], seenBy = { r: new Set(), b: new Set() };
    for (const src of lv.sources) {
        let x = src.x, y = src.y, [dx, dy] = DIRS[src.d];
        const pts = [[x + 0.5, y + 0.5]], cells = [], seen = new Set();
        for (let n = 0; n < w * h * 8; n++) {
            x += dx; y += dy;
            if (x < 0 || y < 0 || x >= w || y >= h) { pts.push([x + 0.5 - dx * 0.5, y + 0.5 - dy * 0.5]); break; }
            const k = y * w + x, key = `${k}:${dx},${dy}`;
            if (seen.has(key)) { pts.push([x + 0.5, y + 0.5]); break; }
            seen.add(key); cells.push(k); seenBy[src.c].add(k);
            if (lv.rocks.includes(k)) { pts.push([x + 0.5 - dx * 0.45, y + 0.5 - dy * 0.45]); break; }
            const gl = _at(lv.glass, k);
            if (gl && gl.c !== src.c) { pts.push([x + 0.5 - dx * 0.45, y + 0.5 - dy * 0.45]); break; }
            const fixed = lv.fixed[k], m = fixed !== undefined ? fixed : k in lv.mirrors ? get(k) : null;
            if (m === -1) return { need: k };
            if (m !== null) {
                const [nx, ny] = bounce(m, dx, dy);
                if (nx !== dx || ny !== dy) pts.push([x + 0.5, y + 0.5]);
                [dx, dy] = [nx, ny];
            }
        }
        beams.push({ c: src.c, pts, cells });
    }
    const lit = new Set();
    lv.lanterns.forEach((l, i) => {
        const r = seenBy.r.has(l.k), b = seenBy.b.has(l.k);
        if (l.c === 'r' ? r : l.c === 'b' ? b : r && b) lit.add(i);
    });
    return { beams, lit, solved: lit.size === lv.lanterns.length };
}

/** Trace with the mirrors as they are: { beams, lit, solved }. */
export const trace = (lv, mirrors) => _run(lv, k => mirrors[k]);

/**
 * The fewest taps from `mirrors` to a setting that lights every lantern.
 * Only mirrors a beam meets matter, so it decides them as the beams reach
 * them, cheapest first, and drops anything already as dear as the best found.
 */
export function par(lv, mirrors, cap = 99) {
    let best = cap + 1;
    const go = (assign, cost) => {
        if (cost >= best) return;
        const r = _run(lv, k => (k in assign ? assign[k] : -1));
        if (r.need === undefined) { if (r.solved) best = cost; return; }
        const k = r.need, from = mirrors[k];
        for (const to of [0, 1, 2, 3].sort((a, b) => turns(from, a) - turns(from, b))) go({ ...assign, [k]: to }, cost + turns(from, to));
    };
    go({}, 0);
    return best > cap ? Infinity : best;
}

// ---- making levels (scripts/mirror-levels.mjs) ------------------------------------------
export const LEVEL_COUNT = 30;
export const WORLDS = ['🏮 Lantern Bay', '🌙 Moon Cove', '⭐ Star Reef'];
export const worldOf = i => Math.floor(i / 10);
export const stars = (taps, p) => (taps <= p ? 3 : taps <= p + 3 ? 2 : 1);

/** How level i is built: board, pieces and the par it should reach. */
export function recipe(i) {
    const w = worldOf(i), k = i % 10;
    if (w === 0) return { w: 5 + (k >= 4) + (k >= 8), h: 6 + (k >= 4) + (k >= 8), colors: ['r'], mirrors: 4 + Math.floor(k / 2), fixed: k >= 6 ? 1 : 0, rocks: 1 + Math.floor(k / 4), glass: 0, lanterns: 2 + Math.floor(k / 3), purple: 0, minPar: 2 + Math.floor(k / 3), maxPar: 4 + Math.floor(k / 3) };
    if (w === 1) return { w: 6 + (k >= 5), h: 7 + (k >= 5), colors: ['r', 'b'], mirrors: 7 + Math.floor(k / 3), fixed: 1 + Math.floor(k / 4), rocks: 2 + Math.floor(k / 4), glass: k >= 3 ? 1 + Math.floor(k / 5) : 0, lanterns: 4 + Math.floor(k / 4), purple: 0, minPar: 4 + Math.floor(k / 3), maxPar: 7 + Math.floor(k / 3) };
    return { w: 7 + (k >= 5), h: 8 + (k >= 5), colors: ['r', 'b'], mirrors: 9 + Math.floor(k / 3), fixed: 2 + Math.floor(k / 4), rocks: 3 + Math.floor(k / 4), glass: 2 + Math.floor(k / 5), lanterns: 5 + Math.floor(k / 4), purple: 1 + (k >= 5), minPar: 6 + Math.floor(k / 3), maxPar: 10 + Math.floor(k / 3) };
}

const _pick = (rnd, arr) => arr.splice(Math.floor(rnd() * arr.length), 1)[0];

/**
 * Try to make level i from a seeded random: a board with mirrors set to an
 * answer, the beams traced through it, lanterns (and glass) put on their
 * paths, then the turnable mirrors scrambled until par is in range.
 * Returns the level or null (the script tries again).
 */
export function make(i, rnd) {
    const R = recipe(i), { w, h } = R, n = w * h;
    const sources = [], taken = new Set();
    for (const c of R.colors) {   // lighthouses on different sides
        for (let tries = 0; tries < 20; tries++) {
            const side = Math.floor(rnd() * 4), along = side < 2 ? 1 + Math.floor(rnd() * (h - 2)) : 1 + Math.floor(rnd() * (w - 2));
            const s = side === 0 ? { x: -1, y: along, d: 'r' } : side === 1 ? { x: w, y: along, d: 'l' } : side === 2 ? { x: along, y: -1, d: 'd' } : { x: along, y: h, d: 'u' };
            const key = `${s.x},${s.y}`;
            if (taken.has(key) || sources.some(o => o.d === s.d)) continue;
            taken.add(key); sources.push({ ...s, c }); break;
        }
    }
    if (sources.length !== R.colors.length) return null;
    const free = [...Array(n).keys()], all = [];
    for (let m = 0; m < R.mirrors + R.fixed; m++) all.push(_pick(rnd, free));
    const solution = {}; all.forEach(k => { solution[k] = Math.floor(rnd() * 4); });
    const rocks = []; for (let r = 0; r < R.rocks; r++) rocks.push(_pick(rnd, free));
    const lv0 = { w, h, sources, rocks, glass: [], lanterns: [], fixed: {}, mirrors: solution };
    const t = trace(lv0, solution);
    // every beam should be worth following: long, and turned by several mirrors
    for (const b of t.beams) { const turnsOnIt = b.cells.filter(k => k in solution).length; if (turnsOnIt < Math.min(3, all.length) || b.cells.length < w + 2) return null; }
    const on = { r: new Set(), b: new Set() }; t.beams.forEach(b => b.cells.forEach(k => on[b.c].add(k)));
    const plain = k => !(k in solution) && !rocks.includes(k);
    const both = [...on.r].filter(k => on.b.has(k) && plain(k)), onlyR = [...on.r].filter(k => !on.b.has(k) && plain(k)), onlyB = [...on.b].filter(k => !on.r.has(k) && plain(k));
    const lanterns = [];
    for (let p = 0; p < R.purple; p++) { if (!both.length) return null; lanterns.push({ k: _pick(rnd, both), c: 'p' }); }
    for (let l = lanterns.length; l < R.lanterns; l++) {
        const c = R.colors.length === 1 ? 'r' : (l % 2 ? 'b' : 'r'), pool = c === 'r' ? onlyR : onlyB;
        if (!pool.length) return null;
        lanterns.push({ k: _pick(rnd, pool), c });
    }
    const glass = [];
    for (let g = 0; g < R.glass; g++) { const c = g % 2 ? 'b' : 'r', pool = c === 'r' ? onlyR : onlyB; if (!pool.length) return null; glass.push({ k: _pick(rnd, pool), c }); }
    // bolt some mirrors the beams use (they keep the answer's setting)
    const used = all.filter(k => on.r.has(k) || on.b.has(k)), fixed = {};
    for (let f = 0; f < R.fixed && used.length > 1; f++) { const k = _pick(rnd, used); fixed[k] = solution[k]; }
    const turnable = {}; all.forEach(k => { if (!(k in fixed)) turnable[k] = solution[k]; });
    const lv = { w, h, sources, rocks, glass, lanterns, fixed, mirrors: turnable };
    if (!trace(lv, turnable).solved) return null;
    for (let s = 0; s < 30; s++) {
        const start = {}; Object.keys(turnable).forEach(k => { start[k] = Math.floor(rnd() * 4); });
        if (trace(lv, start).solved) continue;
        const p = par(lv, start, R.maxPar);
        if (p >= R.minPar && p <= R.maxPar) return { ...lv, mirrors: start, solution: turnable, par: p, index: i };
    }
    return null;
}
