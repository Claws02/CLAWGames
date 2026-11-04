// ============================================================
// CORAL MERGE — the rules. No DOM (Coral.js is the screen), so
// qa/coral.mjs runs it in Node.
//
// A reef 5 columns wide and 7 deep. Drop the next creature into a column: it
// sinks to the bottom. Two of the same kind side by side (or one on the other)
// merge into the next kind up, where the dropped one landed, and the reef
// settles; a merge that lands next to another of its new kind merges again (a
// chain, worth more). Every 12 drops the tide pushes up a row of sand from the
// bottom; a merge washes away any sand touching it. A drop with nowhere to go,
// or sand pushing a creature off the top, ends the game.
// ============================================================
export const COLS = 5, ROWS = 7, TIDE_EVERY = 12;
export const KINDS = ['🐚', '🐌', '🦐', '🦀', '🐙', '🐠', '🐢', '🐬', '🐳', '💎'];
export const NAMES = ['shell', 'snail', 'shrimp', 'crab', 'octopus', 'fish', 'turtle', 'dolphin', 'whale', 'pearl palace'];
export const SAND = -1;
const TOP = KINDS.length - 1;

/** A new reef: grid[row][col], row 0 at the top; null is water. */
export function begin(rnd = Math.random) {
    const s = { grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)), score: 0, drops: 0, best: 0, over: false, rnd, next: 0, chainMax: 0 };
    s.next = _spawn(s); s.after = _spawn(s);
    return s;
}

// What comes next: small creatures, a little bigger as the reef grows up.
function _spawn(s) {
    const cap = Math.max(1, Math.min(3, s.best - 2));
    const x = s.rnd();
    return x < 0.5 ? 0 : x < 0.8 ? Math.min(1, cap) : x < 0.95 ? Math.min(2, cap) : cap;
}

const _fall = s => {
    for (let c = 0; c < COLS; c++) {
        const col = [];
        for (let r = ROWS - 1; r >= 0; r--) if (s.grid[r][c] !== null) col.push(s.grid[r][c]);
        for (let r = ROWS - 1, i = 0; r >= 0; r--, i++) s.grid[r][c] = i < col.length ? col[i] : null;
    }
};
const _rowOf = (s, c) => { for (let r = ROWS - 1; r >= 0; r--) if (s.grid[r][c] === null) return r; return -1; };
export const canDrop = (s, c) => !s.over && c >= 0 && c < COLS && s.grid[0][c] === null;

/**
 * Drop the next creature into column c. Returns what happened:
 * { ok, merges: [{ r, c, kind, chain }], washed, tide, over } (ok false: column full / game over).
 */
export function drop(s, c) {
    const out = { ok: false, merges: [], washed: 0, tide: false, over: false };
    if (!canDrop(s, c)) return out;
    out.ok = true;
    let r = _rowOf(s, c);
    s.grid[r][c] = s.next;
    s.next = s.after; s.after = _spawn(s);
    s.drops++;
    // Merge from where it landed, then keep following the merged creature.
    let chain = 0;
    for (;;) {
        const k = s.grid[r][c];
        const nb = [[r + 1, c], [r, c - 1], [r, c + 1], [r - 1, c]].find(([y, x]) => y >= 0 && y < ROWS && x >= 0 && x < COLS && s.grid[y][x] === k && k !== SAND);
        if (!nb) break;
        chain++;
        s.grid[nb[0]][nb[1]] = null;
        const up = k + 1;
        if (k === TOP) {                     // two pearl palaces: both go, a big bonus
            s.grid[r][c] = null;
            s.score += 5000 * chain;
            out.merges.push({ r, c, kind: TOP + 1, chain });
        } else {
            s.grid[r][c] = up;
            s.score += (up + 1) * (up + 1) * 5 * chain;
            s.best = Math.max(s.best, up);
            out.merges.push({ r, c, kind: up, chain });
        }
        const kind = s.grid[r][c];
        _fall(s);
        if (kind === null) break;
        // Where the merged creature settled: it fell straight down its own column.
        let nr = r;
        while (nr + 1 < ROWS && s.grid[nr][c] !== kind) nr++;
        if (s.grid[nr][c] !== kind) break;
        r = nr;
        // It washes away the sand it settled against, and the reef settles again.
        let washed = 0;
        for (const [y, x] of [[r + 1, c], [r, c - 1], [r, c + 1], [r - 1, c]]) {
            if (y >= 0 && y < ROWS && x >= 0 && x < COLS && s.grid[y][x] === SAND) { s.grid[y][x] = null; washed++; }
        }
        if (washed) {
            out.washed += washed;
            _fall(s);
            while (r + 1 < ROWS && s.grid[r + 1][c] === null) r++;   // it may drop into the washed-out gap
            if (s.grid[r][c] !== kind) { for (let y = ROWS - 1; y >= 0; y--) if (s.grid[y][c] === kind) { r = y; break; } }
        }
    }
    s.chainMax = Math.max(s.chainMax, chain);
    // The tide
    if (s.drops % TIDE_EVERY === 0) {
        out.tide = true;
        if (s.grid[0].some(v => v !== null)) { s.over = true; out.over = true; return out; }
        s.grid.shift();
        const gap = Math.floor(s.rnd() * COLS);
        s.grid.push(Array.from({ length: COLS }, (_, x) => (x === gap ? null : SAND)));
        _fall(s);
    }
    if (![...Array(COLS).keys()].some(x => s.grid[0][x] === null)) { s.over = true; out.over = true; }
    return out;
}
