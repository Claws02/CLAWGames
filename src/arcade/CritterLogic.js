// ============================================================
// CRITTER SQUARE — the puzzle itself: making one, solving it, checking a grid.
// No DOM here (CritterSquare.js is the screen), so qa/critter.mjs runs it in Node.
//
// THE RULES. An n×n grid of critters, sized smallest to biggest. Every row and
// every column holds each critter exactly once. Some squares start filled in.
// A fence between two squares opens towards the bigger critter: the critter on
// its open side is bigger than the one at its point.
//
// A grid is an array of n*n numbers: a critter's size (0 = smallest) or -1 for
// empty. Every puzzle made here has exactly one solution.
// ============================================================

/** Smallest to biggest. A puzzle of size n uses the first n. */
export const CRITTERS = ['🐭', '🐱', '🐶', '🐷', '🐴', '🐘'];
export const NAMES = ['mouse', 'cat', 'dog', 'pig', 'horse', 'elephant'];

// How many squares stay filled in and how many fences there are, by level.
// keep: the fewest givens the remover stops at (as a share of the grid).
export const LEVELS = {
    easy:   { n: 4, keep: 0.50, fences: 0.25, label: 'EASY' },     // 8 of 16 given
    medium: { n: 5, keep: 0.40, fences: 0.30, label: 'MEDIUM' },   // 10 of 25
    hard:   { n: 6, keep: 0.31, fences: 0.32, label: 'HARD' },     // 11 of 36
};

const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** A random Latin square: each of 0..n-1 once per row and column. */
export function latinSquare(n, rnd = Math.random) {
    const g = new Array(n * n).fill(-1);
    const fill = k => {
        if (k === n * n) return true;
        const r = Math.floor(k / n), c = k % n;
        for (const v of shuffle([...Array(n).keys()], rnd)) {
            let ok = true;
            for (let i = 0; i < c && ok; i++) if (g[r * n + i] === v) ok = false;
            for (let i = 0; i < r && ok; i++) if (g[i * n + c] === v) ok = false;
            if (!ok) continue;
            g[k] = v;
            if (fill(k + 1)) return true;
        }
        g[k] = -1;
        return false;
    };
    fill(0);
    return g;
}

/** Every pair of side-by-side squares: [a, b] with b right of or below a. */
export function neighbours(n) {
    const out = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (c + 1 < n) out.push([r * n + c, r * n + c + 1]);
        if (r + 1 < n) out.push([r * n + c, (r + 1) * n + c]);
    }
    return out;
}

// For each square, the fences touching it: { other, bigger } (bigger: this square holds the bigger critter).
function fenceMap(n, fences) {
    const m = Array.from({ length: n * n }, () => []);
    for (const f of fences) {
        const big = f.big === 'a' ? f.a : f.b, small = f.big === 'a' ? f.b : f.a;
        m[big].push({ other: small, bigger: true });
        m[small].push({ other: big, bigger: false });
    }
    return m;
}

/** How many ways the puzzle can be finished, counting no further than `limit`. */
export function countSolutions(n, givens, fences, limit = 2) {
    const g = givens.slice();
    const fm = fenceMap(n, fences);
    const fits = (k, v) => {
        const r = Math.floor(k / n), c = k % n;
        for (let i = 0; i < n; i++) {
            if (i !== c && g[r * n + i] === v) return false;
            if (i !== r && g[i * n + c] === v) return false;
        }
        for (const f of fm[k]) {
            const o = g[f.other];
            if (o >= 0 && (f.bigger ? v <= o : v >= o)) return false;
        }
        return true;
    };
    // A given that breaks the rules has no solutions at all.
    for (let k = 0; k < n * n; k++) if (g[k] >= 0) { const v = g[k]; g[k] = -1; const ok = fits(k, v); g[k] = v; if (!ok) return 0; }
    let found = 0;
    const solve = () => {
        // The empty square with the fewest choices first.
        let best = -1, bestOpts = null;
        for (let k = 0; k < n * n; k++) {
            if (g[k] >= 0) continue;
            const opts = [];
            for (let v = 0; v < n; v++) if (fits(k, v)) opts.push(v);
            if (!opts.length) return false;
            if (!bestOpts || opts.length < bestOpts.length) { best = k; bestOpts = opts; if (opts.length === 1) break; }
        }
        if (best < 0) { found++; return found >= limit; }
        for (const v of bestOpts) {
            g[best] = v;
            if (solve()) { g[best] = -1; return true; }
        }
        g[best] = -1;
        return false;
    };
    solve();
    return found;
}

/**
 * A new puzzle: { level, n, solution, givens, fences: [{ a, b, big: 'a' | 'b' }] }.
 * Fences are drawn at random from the solution, then squares are emptied one at
 * a time, in random order, for as long as the answer stays the only one.
 */
export function generate(level = 'easy', rnd = Math.random) {
    const L = LEVELS[level] || LEVELS.easy, n = L.n;
    const solution = latinSquare(n, rnd);
    const fences = neighbours(n).filter(() => rnd() < L.fences)
        .map(([a, b]) => ({ a, b, big: solution[a] > solution[b] ? 'a' : 'b' }));
    const givens = solution.slice();
    const floor = Math.max(1, Math.round(L.keep * n * n));
    let left = n * n;
    for (const k of shuffle([...Array(n * n).keys()], rnd)) {
        if (left <= floor) break;
        const v = givens[k];
        givens[k] = -1;
        if (countSolutions(n, givens, fences, 2) === 1) left--;
        else givens[k] = v;
    }
    return { level, n, solution, givens, fences };
}

/** Squares that break a rule right now (a repeat in a row or column, or a fence the wrong way). */
export function conflicts(n, grid, fences) {
    const bad = new Set();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const k = r * n + c, v = grid[k];
        if (v < 0) continue;
        for (let i = c + 1; i < n; i++) if (grid[r * n + i] === v) { bad.add(k); bad.add(r * n + i); }
        for (let i = r + 1; i < n; i++) if (grid[i * n + c] === v) { bad.add(k); bad.add(i * n + c); }
    }
    for (const f of fences) {
        const big = f.big === 'a' ? f.a : f.b, small = f.big === 'a' ? f.b : f.a;
        if (grid[big] >= 0 && grid[small] >= 0 && grid[big] <= grid[small]) { bad.add(big); bad.add(small); }
    }
    return bad;
}

/** Every square filled and no rule broken (with one solution, that's the solution). */
export const solved = (n, grid, fences) => grid.every(v => v >= 0) && conflicts(n, grid, fences).size === 0;
