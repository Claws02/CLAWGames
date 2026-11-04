// ============================================================
// MIRROR LAGOON — the puzzle: tracing the beam, making a level, its par.
// No DOM (Mirror.js is the screen), so qa/mirror.mjs runs it in Node.
//
// THE RULES. A lighthouse on the shore shines a beam across the lagoon. It
// goes straight until it meets a mirror, which turns it (a / or a \), or a
// rock, which stops it. Tap a mirror to flip it between / and \. Light every
// lantern 🏮 (the beam passes through them). Par is the fewest flips.
//
// How a level is made: a random beam path with turns (a mirror at each), the
// lanterns along it, decoy mirrors and rocks off it, then every mirror is set
// at random. Par: every setting of the mirrors is tried (2^k), and the
// fewest flips to any that lights them all is par.
// ============================================================
export const DIRS = { r: [1, 0], l: [-1, 0], d: [0, 1], u: [0, -1] };

/** Trace the beam: the squares it lights, in order, and the lanterns it reaches. */
export function trace(lv, mirrors) {
    const { w, h } = lv, path = [], seen = new Set(), lit = new Set();
    let [x, y] = lv.src, [dx, dy] = DIRS[lv.dir];
    for (let n = 0; n < w * h * 4; n++) {
        x += dx; y += dy;
        if (x < 0 || y < 0 || x >= w || y >= h) break;
        const k = y * w + x, key = `${k}:${dx},${dy}`;
        if (seen.has(key)) break;
        seen.add(key);
        path.push(k);
        if (lv.rocks.includes(k)) break;
        if (lv.lanterns.includes(k)) lit.add(k);
        const m = mirrors[k];
        if (m === '/') [dx, dy] = [-dy, -dx];
        else if (m === '\\') [dx, dy] = [dy, dx];
    }
    return { path, lit, solved: lv.lanterns.every(k => lit.has(k)) };
}

/** The fewest flips from `mirrors` to a setting that lights every lantern. */
export function par(lv, mirrors) {
    const keys = Object.keys(mirrors).map(Number), n = keys.length;
    let best = Infinity;
    for (let mask = 0; mask < 1 << n; mask++) {
        let flips = 0; for (let b = mask; b; b >>= 1) flips += b & 1;
        if (flips >= best) continue;
        const m = { ...mirrors };
        keys.forEach((k, i) => { if (mask & (1 << i)) m[k] = m[k] === '/' ? '\\' : '/'; });
        if (trace(lv, m).solved) best = flips;
    }
    return best;
}

export const SIZES = i => { const w = Math.min(8, 5 + Math.floor(i / 8)); return { w, h: w + 1, turns: Math.min(9, 2 + Math.floor(i / 3)), lanterns: Math.min(6, 2 + Math.floor(i / 5)), decoys: Math.min(4, Math.floor(i / 4)), rocks: Math.min(6, 1 + Math.floor(i / 4)) }; };

/** Level i, from a seeded random: { w, h, src, dir, mirrors (as set), solution, lanterns, rocks, par }. */
export function generate(i, rnd) {
    const S = SIZES(i);
    for (let attempt = 0; attempt < 500; attempt++) {
        const { w, h } = S;
        const sy = 1 + Math.floor(rnd() * (h - 2));
        const lv = { w, h, src: [-1, sy], dir: 'r', rocks: [], lanterns: [] };
        // walk the beam
        const used = new Set(), sol = {};
        let x = -1, y = sy, d = [1, 0], turns = 0, ok = true;
        const pathCells = [];
        for (let guard = 0; guard < 200; guard++) {
            const run = 1 + Math.floor(rnd() * 3);
            for (let s = 0; s < run; s++) {
                x += d[0]; y += d[1];
                if (x < 0 || y < 0 || x >= w || y >= h) { ok = turns >= S.turns; break; }
                const k = y * w + x;
                if (used.has(k)) { ok = false; break; }
                used.add(k); pathCells.push(k);
            }
            if (!ok || x < 0 || y < 0 || x >= w || y >= h) break;
            if (turns >= S.turns) continue;
            // turn here with a mirror
            const k = y * w + x, left = rnd() < 0.5;
            const nd = left ? [d[1], -d[0]] : [-d[1], d[0]];
            const m = (d[0] && nd[1] === -d[0]) || (d[1] && nd[0] === -d[1]) ? '/' : '\\';
            sol[k] = m; d = nd; turns++;
        }
        if (!ok || turns < S.turns) continue;
        // check the walk really is what the mirrors make
        const lanternSpots = pathCells.filter(k => !sol[k]);
        if (lanternSpots.length < S.lanterns) continue;
        for (let n = 0; n < S.lanterns; n++) lv.lanterns.push(lanternSpots.splice(Math.floor(rnd() * lanternSpots.length), 1)[0]);
        const free = [...Array(w * h).keys()].filter(k => !used.has(k));
        for (let n = 0; n < S.rocks && free.length; n++) lv.rocks.push(free.splice(Math.floor(rnd() * free.length), 1)[0]);
        const decoys = [];
        for (let n = 0; n < S.decoys && free.length; n++) decoys.push(free.splice(Math.floor(rnd() * free.length), 1)[0]);
        const solution = { ...sol }; decoys.forEach(k => { solution[k] = rnd() < 0.5 ? '/' : '\\'; });
        if (!trace(lv, solution).solved) continue;
        // scramble
        const mirrors = {}; Object.keys(solution).forEach(k => { mirrors[k] = rnd() < 0.5 ? '/' : '\\'; });
        if (trace(lv, mirrors).solved) continue;
        const p = par(lv, mirrors);
        if (!isFinite(p) || p < 1) continue;
        return { ...lv, mirrors, solution, par: p, index: i };
    }
    throw new Error(`no mirror level ${i}`);
}

export const LEVEL_COUNT = 30;
export const WORLDS = ['🏮 Lantern Bay', '🌙 Moon Cove', '⭐ Star Reef'];
export const worldOf = i => Math.floor(i / 10);
export const stars = (flips, p) => (flips <= p ? 3 : flips <= p + 3 ? 2 : 1);
