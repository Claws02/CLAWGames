// Coral Merge rules, no browser.
// usage: node qa/coral.mjs
import { begin, drop, canDrop, COLS, ROWS, TIDE_EVERY, SAND, KINDS } from '../src/arcade/CoralLogic.js';
import { rng } from '../src/arcade/SoloStats.js';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const fixed = seq => { let i = 0; return () => seq[i++ % seq.length]; };   // a random that returns these, in turn

// Two shells merge into a snail
let s = begin(fixed([0.1]));        // always a shell
drop(s, 2);
const r1 = drop(s, 2);
ok(r1.merges.length === 1 && s.grid[ROWS - 1][2] === 1 && s.grid[ROWS - 2][2] === null, 'a shell on a shell: one snail at the bottom');
ok(s.score > 0, `and it scores (${s.score})`);
// Side by side, and a chain: snail + (shell, shell) → snail + snail → shrimp
s = begin(fixed([0.1]));
drop(s, 0); drop(s, 0);              // a snail in column 0
drop(s, 1); const r2 = drop(s, 1);   // two shells in column 1: a snail beside the snail → a shrimp
ok(r2.merges.length === 2 && r2.merges[1].chain === 2 && s.grid.flat().filter(v => v === 2).length === 1, `side by side, a chain: shells → snail → shrimp (${r2.merges.map(m => KINDS[m.kind]).join(' → ')})`);
// A full column won't take more
s = begin(fixed([0.1, 0.6]));        // shell, snail, shell, snail…: no merges in one column
for (let i = 0; i < ROWS; i++) drop(s, 4);
ok(!canDrop(s, 4) && drop(s, 4).ok === false, 'a full column takes no more');
// The tide: a row of sand with one gap, every 12 drops
s = begin(fixed([0.1, 0.6]));
for (let i = 0; i < TIDE_EVERY; i++) drop(s, i % COLS);
const bottom = s.grid[ROWS - 1];
ok(bottom.filter(v => v === SAND).length === COLS - 1, `after ${TIDE_EVERY} drops the tide brings up sand, with one gap`);
// A merge next to sand washes it away
s = begin(fixed([0.1]));
s.grid[ROWS - 1] = [SAND, null, SAND, SAND, SAND];
drop(s, 1); const r3 = drop(s, 1);
ok(r3.washed >= 1, `a merge washes away the sand touching it (${r3.washed})`);
// Games end, and the same seed plays the same game
const play = seed => { const g = begin(rng(seed)); let n = 0; while (!g.over && n < 2000) { const cols = [...Array(COLS).keys()].filter(c => canDrop(g, c)); if (!cols.length) break; drop(g, cols[n % cols.length]); n++; } return { over: g.over, score: g.score, drops: g.drops }; };
const a = play(7), b = play(7);
ok(a.over && a.drops > TIDE_EVERY, `a game played to the end finishes (${a.drops} drops, ${a.score} points)`);
ok(JSON.stringify(a) === JSON.stringify(b), 'the same seed plays the same game');

if (fails) { console.log(`CORAL FAIL — ${fails}`); process.exit(1); }
console.log('CORAL PASS');
