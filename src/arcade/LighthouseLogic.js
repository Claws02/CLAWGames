// ============================================================
// LIGHTHOUSE BEAMS — the puzzle: making one, solving it, checking a board.
// No DOM (Lighthouse.js is the screen), so qa/lighthouse.mjs runs it in Node.
//
// THE RULES. A grid of sea, rocks and boats. Put lighthouses on sea squares.
// A lighthouse shines along its row and column, both ways, until a rock or the
// edge (beams pass over boats).
//   1. Every boat is lit by exactly ONE lighthouse.
//   2. No lighthouse shines on another lighthouse.
//   3. Every lighthouse lights at least one boat.
// Every puzzle made here has exactly one answer.
// ============================================================
export const SEA = 0, ROCK = 1, BOAT = 2;
export const LEVELS = {
    easy:   { n: 5, rocks: 0.20, lights: 3, label: 'EASY' },
    medium: { n: 6, rocks: 0.19, lights: 4, label: 'MEDIUM' },
    hard:   { n: 7, rocks: 0.18, lights: 6, label: 'HARD' },
};

/** The squares a lighthouse at k lights: along its row and column until a rock or the edge. */
export function rays(n, grid, k) {
    const out = [], r0 = Math.floor(k / n), c0 = k % n;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let r = r0 + dr, c = c0 + dc; r >= 0 && r < n && c >= 0 && c < n; r += dr, c += dc) {
            if (grid[r * n + c] === ROCK) break;
            out.push(r * n + c);
        }
    }
    return out;
}

/** How many ways to place lighthouses so the rules hold, counting no further than `limit`. */
export function countSolutions(n, grid, limit = 2) {
    const boats = [], ray = [];
    for (let k = 0; k < n * n; k++) { ray[k] = grid[k] === ROCK ? [] : rays(n, grid, k); if (grid[k] === BOAT) boats.push(k); }
    // Where a lighthouse could stand to light each boat (beams are symmetric: it lights me iff I'm in its rays).
    const opts = boats.map(b => ray[b].filter(c => grid[c] === SEA));
    const cover = new Map(boats.map(b => [b, 0]));
    const placed = new Set(), seen = new Uint8Array(n * n);
    let found = 0;
    const can = c => !placed.has(c) && !seen[c] && ray[c].every(k => grid[k] !== BOAT || cover.get(k) === 0);
    const put = (c, d) => {
        if (d > 0) placed.add(c); else placed.delete(c);
        for (const k of ray[c]) { seen[k] += d; if (grid[k] === BOAT) cover.set(k, cover.get(k) + d); }
    };
    const solve = () => {
        let best = -1, bestOpts = null;
        for (let i = 0; i < boats.length; i++) {
            if (cover.get(boats[i]) > 0) continue;
            const o = opts[i].filter(can);
            if (!o.length) return false;
            if (!bestOpts || o.length < bestOpts.length) { best = i; bestOpts = o; if (o.length === 1) break; }
        }
        if (best < 0) { found++; return found >= limit; }
        for (const c of bestOpts) {
            put(c, 1);
            const stop = solve();
            put(c, -1);
            if (stop) return true;
        }
        return false;
    };
    solve();
    return found;
}

/** The rules, checked on a board in play. lights: the squares with a lighthouse. */
export function check(n, grid, lights) {
    const set = new Set(lights), boatHits = {}, clash = new Set(), idle = new Set(), lit = new Set();
    for (const L of lights) {
        let hits = 0;
        for (const k of rays(n, grid, L)) {
            lit.add(k);
            if (grid[k] === BOAT) { boatHits[k] = (boatHits[k] || 0) + 1; hits++; }
            if (set.has(k)) { clash.add(L); clash.add(k); }
        }
        if (!hits) idle.add(L);
    }
    const boats = [...grid.keys()].filter(k => grid[k] === BOAT);
    const unlit = boats.filter(b => !boatHits[b]), twice = boats.filter(b => boatHits[b] > 1);
    return { lit, clash, idle, unlit, twice, boatHits, solved: lights.length > 0 && !unlit.length && !twice.length && !clash.size && !idle.size };
}

const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * A new puzzle: { level, n, grid, solution }. Rocks at random, lighthouses that
 * can't see each other, one boat for each lighthouse to light, then more boats
 * (only where exactly one lighthouse shines) until the answer is the only one.
 */
export function generate(level = 'easy', rnd = Math.random) {
    const L = LEVELS[level] || LEVELS.easy, n = L.n;
    for (let attempt = 0; attempt < 400; attempt++) {
        const grid = Array.from({ length: n * n }, () => (rnd() < L.rocks ? ROCK : SEA));
        const lights = [];
        const sees = (a, b) => rays(n, grid, a).includes(b);
        for (const c of shuffle([...grid.keys()].filter(k => grid[k] === SEA), rnd)) {
            if (lights.length >= L.lights) break;
            if (lights.every(l => !sees(l, c))) lights.push(c);
        }
        if (lights.length < L.lights) continue;
        // Squares lit by exactly one lighthouse: where a boat can go.
        const hits = new Map();
        lights.forEach(l => rays(n, grid, l).forEach(k => hits.set(k, (hits.get(k) || 0) + 1)));
        const once = l => rays(n, grid, l).filter(k => hits.get(k) === 1 && grid[k] === SEA && !lights.includes(k));
        let ok = true;
        for (const l of lights) {
            const spots = once(l);
            if (!spots.length) { ok = false; break; }
            grid[spots[Math.floor(rnd() * spots.length)]] = BOAT;
        }
        if (!ok) continue;
        const extra = shuffle([...hits.keys()].filter(k => hits.get(k) === 1 && grid[k] === SEA && !lights.includes(k)), rnd);
        while (countSolutions(n, grid, 2) > 1 && extra.length) grid[extra.pop()] = BOAT;
        if (countSolutions(n, grid, 2) !== 1) continue;
        return { level, n, grid, solution: lights.slice().sort((a, b) => a - b) };
    }
    throw new Error('no lighthouse puzzle after 400 tries');
}
