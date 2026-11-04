// ============================================================
// ICE FLOE — the puzzle: sliding, the shortest route, making a level.
// No DOM (IceFloe.js is the screen), so qa/icefloe.mjs runs it in Node.
//
// THE RULES. A penguin on an ice floe slides in a straight line until it hits
// a rock or the edge, or lands on a patch of snow (snow stops it dead). Get it
// to STOP on the fish: sliding over the fish doesn't count. Par is the fewest
// slides there are.
// ============================================================
export const ICE = 0, ROCK = 1, SNOW = 2;
export const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
export const LEVELS = {
    easy:   { w: 7, h: 8,  rocks: 0.15, snow: 0.03, par: [3, 5],  label: 'EASY' },
    medium: { w: 8, h: 9,  rocks: 0.14, snow: 0.04, par: [5, 8],  label: 'MEDIUM' },
    hard:   { w: 9, h: 10, rocks: 0.13, snow: 0.04, par: [8, 13], label: 'HARD' },
};

/** Where a slide from k in direction dir ends (k itself if it can't move). */
export function slide(lv, grid, k, dir) {
    const [dr, dc] = DIRS[dir];
    let r = Math.floor(k / lv.w), c = k % lv.w;
    for (;;) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= lv.h || nc < 0 || nc >= lv.w || grid[nr * lv.w + nc] === ROCK) break;
        r = nr; c = nc;
        if (grid[r * lv.w + c] === SNOW) break;
    }
    return r * lv.w + c;
}

/** Fewest slides from every square the penguin can stop on: Map(square → slides). */
export function distances(lv, grid, start) {
    const dist = new Map([[start, 0]]), q = [start];
    while (q.length) {
        const k = q.shift();
        for (const d of Object.keys(DIRS)) {
            const e = slide(lv, grid, k, d);
            if (!dist.has(e)) { dist.set(e, dist.get(k) + 1); q.push(e); }
        }
    }
    return dist;
}

/** The fewest slides from start to the fish (null if it can't be done). */
export function par(lv, grid, start, fish) { const d = distances(lv, grid, start).get(fish); return d == null ? null : d; }

/** One shortest route, as directions (for hints and probes). */
export function route(lv, grid, start, fish) {
    const prev = new Map([[start, null]]), q = [start];
    while (q.length) {
        const k = q.shift();
        if (k === fish) break;
        for (const d of Object.keys(DIRS)) {
            const e = slide(lv, grid, k, d);
            if (!prev.has(e)) { prev.set(e, [k, d]); q.push(e); }
        }
    }
    if (!prev.has(fish)) return null;
    const out = [];
    for (let k = fish; prev.get(k); k = prev.get(k)[0]) out.unshift(prev.get(k)[1]);
    return out;
}

/**
 * A new floe: { level, w, h, grid, start, fish, par }. Rocks and snow at
 * random; the fish goes on a square whose fewest-slides count is in the
 * level's range (the hardest such square).
 */
export function generate(level = 'easy', rnd = Math.random) {
    const L = LEVELS[level] || LEVELS.easy, lv = { w: L.w, h: L.h }, n = L.w * L.h;
    for (let attempt = 0; attempt < 500; attempt++) {
        const grid = Array.from({ length: n }, () => { const x = rnd(); return x < L.rocks ? ROCK : x < L.rocks + L.snow ? SNOW : ICE; });
        const ice = [...grid.keys()].filter(k => grid[k] === ICE);
        if (!ice.length) continue;
        const start = ice[Math.floor(rnd() * ice.length)];
        const dist = distances(lv, grid, start);
        const ok = [...dist].filter(([k, d]) => d >= L.par[0] && d <= L.par[1] && k !== start && grid[k] !== ROCK);
        if (!ok.length) continue;
        const top = Math.max(...ok.map(([, d]) => d));
        const best = ok.filter(([, d]) => d === top);
        const fish = best[Math.floor(rnd() * best.length)][0];
        return { level, w: L.w, h: L.h, grid, start, fish, par: top };
    }
    throw new Error('no ice floe after 500 tries');
}

export const stars = (moves, p) => (moves <= p ? 3 : moves <= p + 2 ? 2 : 1);
