// ============================================================
// LAKE GRID — the rules of an obsidian lake, as a pure grid. No DOM, no three.js, no time.
//
// The lake is rows x cols cells (row 0 is the north edge, nearest the pearl). Each row has a height (`levels`), so a lake can
// step down in ledges toward the crater. On it a crab can't walk: it slides in one of four directions until something stops it.
//
//   pillar      stops a slide in the cell before it
//   block       stops a slide like a pillar; push it (choose its direction while stopped next to it) and it slides until stopped
//   ledge       sliding down to a lower row: you drop and keep sliding. Up to a higher row: a wall, unless that cell is a ramp
//   crack       stop on one and it cracks; stop on it again and it breaks into a hole (lava)
//   hole        lava: slide into one and you're burned
//   plate       a coconut resting on it holds `gate` open (the bridge off the north edge at `exit` needs it)
//   coconut     thrown onto the lake, it slides too (from 2 cells out, the way it was thrown) and rests where it stops
//
//   off the south edge: back onto the rim · off the north edge at the exit (gate open): win · anywhere else off an edge: lava
//
// State: { blocks: [[r, c]...], cracks: { 'r,c': 0 | 1 | 2 }, nuts: [[r, c]...] }   — `fresh(z)` makes it.
// ============================================================

const k = (r, c) => `${r},${c}`;
export const fresh = z => ({ blocks: (z.blocks || []).map(b => b.slice()), cracks: Object.fromEntries((z.cracks || []).map(([r, c]) => [k(r, c), 0])), nuts: [] });
export const clone = ls => ({ blocks: ls.blocks.map(b => b.slice()), cracks: { ...ls.cracks }, nuts: ls.nuts.map(n => n.slice()) });
const has = (list, r, c) => (list || []).some(([a, b]) => a === r && b === c);
export const pillarAt = (z, r, c) => has(z.pillars, r, c);
export const blockAt = (ls, r, c) => has(ls.blocks, r, c);
export const holeAt = (z, ls, r, c) => ls.cracks[k(r, c)] === 2;
export const rampAt = (z, r, c) => has(z.ramps, r, c);
export const plateAt = (z, r, c) => has(z.plates, r, c);
const lvl = (z, r) => (z.levels ? z.levels[r] : 0);
/** Is the gate held open (a coconut resting on a plate)? */
export const gateOpen = (z, ls) => !z.plates || !z.plates.length || ls.nuts.some(([r, c]) => plateAt(z, r, c));

// what the next cell does to something sliding from (r, c) to (nr, nc): 'go' | 'stop' | 'lava' | 'rim' | 'win'
function _next(z, ls, r, c, nr, nc, who) {
    if (nr < 0) return who === 'crab' && nc === z.exit ? (gateOpen(z, ls) ? 'win' : 'stop') : 'lava';
    if (nr >= z.rows) return who === 'crab' ? 'rim' : 'lava';
    if (nc < 0 || nc >= z.cols) return 'lava';
    if (pillarAt(z, nr, nc) || blockAt(ls, nr, nc)) return 'stop';
    if (who !== 'crab' && ls.nuts.some(([a, b]) => a === nr && b === nc)) return 'stop';
    if (lvl(z, nr) > lvl(z, r) && !rampAt(z, nr, nc)) return 'stop';
    if (holeAt(z, ls, nr, nc)) return 'lava';
    return 'go';
}
/** Slide something from (r, c) in (dr, dc). → { end: [r, c] | null, out: 'stop' | 'lava' | 'rim' | 'win', path: [[r, c]...] } */
export function slide(z, ls, r, c, dr, dc, who = 'crab') {
    const path = [];
    for (let i = 0; i < 99; i++) {
        const nr = r + dr, nc = c + dc, w = _next(z, ls, r, c, nr, nc, who);
        if (w === 'go') { r = nr; c = nc; path.push([r, c]); continue; }
        if (w === 'stop') return { end: [r, c], out: 'stop', path };
        if (w === 'rim' || w === 'win') { path.push([nr, nc]); return { end: null, out: w, path }; }
        path.push([nr, nc]); return { end: null, out: 'lava', path };
    }
    return { end: [r, c], out: 'stop', path };
}
// The crab comes to rest on (r, c): a crack cracks (or breaks, under it: lava); a coconut lying there is picked up.
function _land(z, ls, s, canPick) {
    if (!s.end) return s;
    const key = k(...s.end);
    if (key in ls.cracks) { ls.cracks[key] += 1; if (ls.cracks[key] >= 2) return { ...s, end: null, out: 'lava', broke: s.end }; s = { ...s, cracked: s.end }; }
    const i = canPick ? ls.nuts.findIndex(([a, b]) => a === s.end[0] && b === s.end[1]) : -1;
    if (i >= 0) { ls.nuts.splice(i, 1); s = { ...s, picked: s.end }; }
    return s;
}
/** The crab, stopped at (r, c), chooses (dr, dc). Mutates ls. → { kind: 'slide' | 'push' | 'none', end, out, path, block?, cracked?, broke?, picked? } */
export function move(z, ls, r, c, dr, dc, canPick = true) {
    const br = r + dr, bc = c + dc;
    if (br >= 0 && br < z.rows && bc >= 0 && bc < z.cols && blockAt(ls, br, bc)) {          // push the block (if it can go at all)
        const s0 = slide(z, { ...ls, blocks: ls.blocks.filter(([a, b]) => !(a === br && b === bc)) }, br, bc, dr, dc, 'block');
        if (s0.end && s0.end[0] === br && s0.end[1] === bc) return { kind: 'none', end: [r, c], out: 'stop', path: [] };
        ls.blocks = ls.blocks.map(([a, b]) => (a === br && b === bc ? (s0.end || [-99, -99]) : [a, b]));      // (in place, so each block keeps its index; a lost one goes to -99)
        return { kind: 'push', end: [r, c], out: 'stop', path: [], block: { from: [br, bc], to: s0.end, path: s0.path, lost: !s0.end } };
    }
    const s = slide(z, ls, r, c, dr, dc, 'crab');
    if (s.end && s.end[0] === r && s.end[1] === c) return { kind: 'none', ...s };
    return { kind: 'slide', ..._land(z, ls, s, canPick) };
}
/** A coconut thrown from (r, c) in (dr, dc): it lands 2 cells out and slides on. Mutates ls. → { end, path, lost } */
export function throwNut(z, ls, r, c, dr, dc) {
    const lr = r + 2 * dr, lc = c + 2 * dc;
    if (lr < 0 || lr >= z.rows || lc < 0 || lc >= z.cols || holeAt(z, ls, lr, lc)) return { end: null, path: [], lost: true };
    if (pillarAt(z, lr, lc) || blockAt(ls, lr, lc)) return { end: null, path: [], lost: true, bounced: true };
    const s = slide(z, ls, lr, lc, dr, dc, 'nut');
    if (s.end) { ls.nuts.push(s.end); return { end: s.end, path: [[lr, lc], ...s.path], lost: false }; }
    return { end: null, path: [[lr, lc], ...s.path], lost: true };
}
/** Coming onto the lake from the rim at column c (sliding north into the south row). */
export const enter = (z, ls, c, canPick = true) => _land(z, ls, slide(z, ls, z.rows, c, -1, 0, 'crab'), canPick);
/** Landing on cell (r, c) from the air (a jump from the rim): you're off, sliding on the way you were going. */
export const drop = (z, ls, r, c, dr, dc, canPick = true) => _land(z, ls, slide(z, ls, r, c, dr, dc, 'crab'), canPick);

/** Breadth-first search for the shortest solution, with `nuts` coconuts to throw. → list of moves, or null. */
export function solve(z, nuts = 2, limit = 200000) {
    const D = [[-1, 0, 'N'], [1, 0, 'S'], [0, 1, 'E'], [0, -1, 'W']], key = (st) => `${st.r},${st.c},${st.n}|${st.ls.blocks.map(b => b.join(':')).sort().join(';')}|${Object.values(st.ls.cracks).join('')}|${st.ls.nuts.map(b => b.join(':')).sort().join(';')}`;
    const q = [], seen = new Set();
    for (let c = 0; c < z.cols; c++) { const ls = fresh(z), e = enter(z, ls, c); if (e.out === 'win') return [['enter', c]]; if (e.end && e.end[0] < z.rows) { const st = { r: e.end[0], c: e.end[1], n: nuts, ls, path: [['enter', c]] }; const kk = key(st); if (!seen.has(kk)) { seen.add(kk); q.push(st); } } }
    while (q.length && seen.size < limit) {
        const st = q.shift();
        for (const [dr, dc, nm] of D) {
            const ls = clone(st.ls), m = move(z, ls, st.r, st.c, dr, dc, st.n < 3);
            if (m.out === 'win') return [...st.path, nm];
            if (m.kind === 'none' || m.out === 'lava' || m.out === 'rim' || !m.end) continue;
            const nx = { r: m.end[0], c: m.end[1], n: st.n + (m.picked ? 1 : 0), ls, path: [...st.path, m.kind === 'push' ? 'push ' + nm : nm] }, kk = key(nx);
            if (!seen.has(kk)) { seen.add(kk); q.push(nx); }
        }
        if (st.n > 0) for (const [dr, dc, nm] of D) {
            const ls = clone(st.ls), t = throwNut(z, ls, st.r, st.c, dr, dc); if (t.lost) continue;
            const nx = { r: st.r, c: st.c, n: st.n - 1, ls, path: [...st.path, 'throw ' + nm] }, kk = key(nx);
            if (!seen.has(kk)) { seen.add(kk); q.push(nx); }
        }
    }
    return null;
}
