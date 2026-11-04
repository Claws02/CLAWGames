// ============================================================
// ROCK POOL PATHS — the puzzle: making one and checking a board.
// No DOM (Paths.js is the screen), so qa/icefloe.mjs runs it in Node.
//
// THE RULES. Pairs of critters sit in a rock pool. Join each pair with a path
// that goes up, down, left or right through the squares. Paths may not cross
// or share a square, and every square in the pool must be used.
//
// How a pool is made: one random path through every square (a serpentine,
// shuffled by "backbite" moves), cut into pieces. Each piece's two ends are a
// pair, so every pool has an answer. Any answer that keeps the rules counts.
// ============================================================
export const LEVELS = {
    easy:   { n: 5, pairs: [3, 5], label: 'EASY' },
    medium: { n: 6, pairs: [4, 6], label: 'MEDIUM' },
    hard:   { n: 7, pairs: [5, 7], label: 'HARD' },
};
export const CRITTERS = ['🦀', '🐙', '🐠', '🐚', '🦐', '🐢', '🦑'];
export const COLORS = ['#ef4444', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#14b8a6'];

const adj = (n, a, b) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs(a % n - b % n) === 1;
const nbrs = (n, k) => { const r = Math.floor(k / n), c = k % n, o = []; if (r) o.push(k - n); if (r < n - 1) o.push(k + n); if (c) o.push(k - 1); if (c < n - 1) o.push(k + 1); return o; };
export const dist = (n, a, b) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs(a % n - b % n);

/** A random path through every square of an n×n grid. */
export function hamiltonian(n, rnd = Math.random, moves = n * n * 40) {
    let path = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) path.push(r * n + (r % 2 ? n - 1 - c : c));
    for (let m = 0; m < moves; m++) {
        if (rnd() < 0.5) path.reverse();
        const end = path[path.length - 1], at = new Map(path.map((k, i) => [k, i]));
        const opts = nbrs(n, end).filter(k => at.get(k) !== path.length - 2);
        if (!opts.length) continue;
        const i = at.get(opts[Math.floor(rnd() * opts.length)]);
        // backbite: join the end to square i, reverse what came after i
        path = path.slice(0, i + 1).concat(path.slice(i + 1).reverse());
    }
    return path;
}

/** A new pool: { level, n, ends: [[a, b], …], solution: [[a, …, b], …] }. */
export function generate(level = 'easy', rnd = Math.random) {
    const L = LEVELS[level] || LEVELS.easy, n = L.n;
    for (let attempt = 0; attempt < 300; attempt++) {
        const path = hamiltonian(n, rnd);
        const k = L.pairs[0] + Math.floor(rnd() * (L.pairs[1] - L.pairs[0] + 1));
        // k pieces, each at least 3 long, each with its ends at least 2 apart
        for (let tryCut = 0; tryCut < 60; tryCut++) {
            const cuts = new Set();
            while (cuts.size < k - 1) cuts.add(1 + Math.floor(rnd() * (path.length - 1)));
            const at = [0, ...[...cuts].sort((a, b) => a - b), path.length];
            const pieces = at.slice(1).map((e, i) => path.slice(at[i], e));
            if (pieces.every(p => p.length >= 3 && dist(n, p[0], p[p.length - 1]) >= 2)) {
                return { level, n, ends: pieces.map(p => [p[0], p[p.length - 1]]), solution: pieces };
            }
        }
    }
    throw new Error('no rock pool after 300 tries');
}

/**
 * Check a board. paths[i] is pair i's path so far, starting at one of its ends.
 * Returns { solved, joined: [bool per pair], filled, used: Map(square → pair) }.
 */
export function check(n, ends, paths) {
    const used = new Map(), endOf = new Map();
    ends.forEach(([a, b], i) => { endOf.set(a, i); endOf.set(b, i); });
    let clash = false;
    const joined = ends.map(([a, b], i) => {
        const p = paths[i] || [];
        if (!p.length) return false;
        for (let j = 0; j < p.length; j++) {
            const k = p[j];
            if (used.has(k) || (endOf.has(k) && endOf.get(k) !== i)) clash = true;
            used.set(k, i);
            if (j && !adj(n, p[j - 1], k)) clash = true;
        }
        const s = p[0], e = p[p.length - 1];
        return p.length > 1 && ((s === a && e === b) || (s === b && e === a));
    });
    const filled = used.size === n * n;
    return { solved: !clash && filled && joined.every(Boolean), joined, filled, used, clash };
}
