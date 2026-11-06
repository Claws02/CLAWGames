// ============================================================
// REEF LEVELS — writes src/arcade/ReefDropLevels.js: the hand-made reefs
// (scripts/reef-base.json) plus a reef for every recipe in
// scripts/reef-recipes.mjs. See docs/REEF_LEVELS.md.
//
// For each recipe it tries seeded layouts (a pattern of points, moving pieces,
// the extras, the kinds of piece) and keeps the first that passes every check
// in scripts/reef-lib.mjs, including the recipe's difficulty band. The same
// recipes always make the same reefs. A recipe nothing satisfies fails loudly.
//
// usage: node scripts/reef-levels.mjs            (all)
//        node scripts/reef-levels.mjs --dry      (check recipes, write nothing)
// ============================================================
import { readFileSync, writeFileSync } from 'fs';
import * as D from '../src/arcade/ReefDropLogic.js';
import * as B from '../src/arcade/ReefBuild.js';
import { RECIPES } from './reef-recipes.mjs';
import { check, seeded, hashStr, BANDS } from './reef-lib.mjs';

const TRIES = 40, DRY = process.argv.includes('--dry');
const base = JSON.parse(readFileSync(new URL('./reef-base.json', import.meta.url)));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const range = (r, a, b) => a + r() * (b - a);
const near = (p, q, d) => Math.hypot(p[0] - q[0], p[1] - q[1]) < d;

/** A layout of still points. */
function layout(kind, r) {
    switch (kind) {
        case 'grid': return B.grid(4 + Math.floor(r() * 3), 6 + Math.floor(r() * 3), range(r, 0.4, 0.5), range(r, 1.02, 1.16));
        case 'rings': { const two = r() < 0.5; return two ? [...B.ring(0.3, range(r, 0.65, 0.85), range(r, 0.13, 0.17), 8 + Math.floor(r() * 3)), ...B.ring(0.7, range(r, 0.65, 0.85), range(r, 0.13, 0.17), 8 + Math.floor(r() * 3), 0.3), ...B.grid(2, 7, 0.42, 0.54)]
            : [...B.ring(0.5, range(r, 0.72, 0.82), range(r, 0.26, 0.34), 12 + Math.floor(r() * 5)), ...B.ring(0.5, 0.78, 0.13, 6 + Math.floor(r() * 3), 0.4)]; }
        case 'waves': { const n = 3 + Math.floor(r() * 2), out = []; for (let k = 0; k < n; k++) out.push(...B.wave(0.45 + k * (0.68 / n), range(r, 0.04, 0.08), 8 + Math.floor(r() * 2), r() * 6)); return out; }
        case 'diamond': return B.diamond();
        case 'bands': return [...B.grid(2, 7, range(r, 0.4, 0.46), range(r, 0.52, 0.58)), ...B.grid(2, 7, range(r, 1.0, 1.04), range(r, 1.12, 1.17))];
        case 'spiral': { const n = 30 + Math.floor(r() * 8), cy = range(r, 0.74, 0.82); return Array.from({ length: n }, (_, i) => { const a = i * 0.55, rr = 0.06 + i * 0.0105; return [0.5 + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.15]; }); }
        default: return layout(pick(r, ['grid', 'rings', 'waves', 'diamond', 'bands', 'spiral']), r);
    }
}

/** One try at a reef from a recipe (or null if the pieces don't fit). */
function attempt(rc, world, r) {
    let pts = layout(rc.layout || 'any', r);
    const movers = [], more = {};
    const mv = rc.movers || 'none';
    if (mv === 'wheel' || mv === 'both') {
        const cx = range(r, 0.32, 0.68), cy = range(r, 0.66, 0.84), rad = range(r, 0.13, 0.22), n = 6 + Math.floor(r() * 6);
        pts = pts.filter(p => Math.abs(Math.hypot(p[0] - cx, (p[1] - cy) / 1.1) - rad) > 0.07 && Math.hypot(p[0] - cx, p[1] - cy) > 0.05);
        movers.push(...B.wheel(cx, cy, rad, n, (r() < 0.5 ? -1 : 1) * range(r, 0.6, 1.3)));
    }
    if (mv === 'slider' || mv === 'both') {
        const y = range(r, 0.6, 0.98);
        pts = pts.filter(p => Math.abs(p[1] - y) > 0.07);
        movers.push(...B.slider(y, 5 + Math.floor(r() * 2), range(r, 0.08, 0.14) * (r() < 0.5 ? -1 : 1), range(r, 1.9, 2.8)));
    }
    const x = rc.extras || {}, clear = (q, d) => { pts = pts.filter(p => !near(p, q, d)); };
    if (x.jellies) more.jellies = Array.from({ length: x.jellies }, () => { const j = [range(r, 0.3, 0.7), range(r, 0.6, 0.95), 0.04, range(r, 0.12, 0.3) * (r() < 0.5 ? -1 : 1), range(r, 2, 3.4)]; pts = pts.filter(p => Math.abs(p[1] - j[1]) > 0.08 || Math.abs(p[0] - j[0]) > Math.abs(j[3]) + 0.09); return j; });
    if (x.whirls) more.whirls = Array.from({ length: x.whirls }, (_, k) => { const w = [k % 2 ? 0.92 : 0.08, range(r, 0.35, 0.7), k % 2 ? range(r, 0.15, 0.5) : range(r, 0.5, 0.85), range(r, 0.85, 1.05)]; clear([w[0], w[1]], 0.09); clear([w[2], w[3]], 0.09); return w; });
    if (x.lifts) more.lifts = Array.from({ length: x.lifts }, (_, k) => { const lx = k % 2 ? 0.93 : 0.07; pts = pts.filter(p => Math.abs(p[0] - lx) > 0.08); return [lx, range(r, 0.3, 0.55), range(r, 1.0, 1.15), 0.08]; });
    if (x.anglers) more.anglers = Array.from({ length: x.anglers }, (_, k) => { const a = [x.anglers === 1 ? 0.5 : k ? 0.75 : 0.25, range(r, 0.7, 0.88), range(r, 0.24, 0.32), range(r, 3.2, 4.4)]; clear(a, 0.09); return a; });
    if (x.currents) more.currents = Array.from({ length: x.currents }, (_, k) => { const y0 = 0.6 + k * 0.22 + range(r, -0.03, 0.03), c = [0, y0, 1, y0 + 0.07, (k % 2 ? -1 : 1) * range(r, 1.8, 2.6)]; pts = pts.filter(p => p[1] < y0 - 0.04 || p[1] > y0 + 0.11); return c; });
    // the kinds: goals first, then the rest, on distinct still points (a wheel's own pieces count as still points here too)
    const all = [...pts.map(p => ({ p })), ...movers.map(m => ({ m }))], free = [...all.keys()];
    const take = n => { const out = []; for (let k = 0; k < n && free.length; k++) out.push(free.splice(Math.floor(r() * free.length), 1)[0]); return out; };
    const want = { o: rc.oysters || 0, g: rc.golden || 0, p: rc.puffers || 0, e: rc.eels || 0, r: rc.rocks || 0, t: rc.chests || 0, s: rc.starfish || 0 };
    if (want.o + want.g < 1) want.o = 3;
    const kindOf = {};
    for (const [k, n] of Object.entries(want)) for (const i of take(n)) kindOf[i] = k;
    if (Object.keys(kindOf).length < Object.values(want).reduce((a, b) => a + b, 0)) return null;
    if (x.clams) { more.clams = []; for (const i of Object.keys(kindOf).filter(i => (kindOf[i] === 'o' || kindOf[i] === 'g') && all[i].p).slice(0, x.clams)) { const q = all[i].p; more.clams.push([q[0], q[1], range(r, 2.4, 3.2), r() * 6]); } }
    if (x.ghosts) { more.ghost = {}; const stills = [...pts.keys()]; for (let k = 0; k < x.ghosts && stills.length; k++) { const i = stills.splice(Math.floor(r() * stills.length), 1)[0]; more.ghost[i] = [+range(r, 1.8, 2.6).toFixed(2), +(r() * 6).toFixed(2)]; } }
    const marks = {}; pts.forEach((_, i) => { if (kindOf[i]) marks[i] = kindOf[i]; });
    more.movers = movers.map((m, k) => ({ ...m, kind: kindOf[pts.length + k] || 'c' }));
    if (rc.crab) more.crab = rc.crab;
    if (rc.hint) more.hint = rc.hint;
    // (pieces near a clam are fine: a shut clam guards them all)
    return B.build(rc.name, world, pts, marks, more);
}

const levels = base.levels.slice(), worlds = base.worlds.slice();
let failed = 0;
for (const wr of RECIPES) {
    const w = worlds.length; worlds.push(wr.world);
    for (const rc of wr.reefs) {
        const r = seeded(hashStr(`${wr.world}/${rc.name}`));
        let got = null, bestTry = null;
        for (let k = 0; k < TRIES && !got; k++) {
            const lv = attempt(rc, w, r);
            if (!lv) continue;
            const c = check(lv, rc.band || 'medium', true);
            if (c.ok) got = { lv, c, k };
            else if (!bestTry || c.problems.length < bestTry.c.problems.length) bestTry = { lv, c };
        }
        if (got) { levels.push(got.lv); console.log(`ok   ${String(levels.length).padStart(2)}. ${rc.name.padEnd(18)} ${rc.band || 'medium'}: random wins ${Math.round(got.c.rand * 100)}%, ${got.c.left} left, try ${got.k + 1}`); }
        else { failed++; console.log(`FAIL     ${rc.name}: no try passed in ${TRIES}. Closest: ${bestTry ? bestTry.c.problems.join('; ') : 'pieces never fit'}`); }
    }
}
if (failed) { console.log(`${failed} recipe(s) failed: nothing written. Loosen them (fewer pieces, another band or layout) and run again.`); process.exit(1); }
if (DRY) { console.log(`dry run: ${levels.length} reefs would be written`); process.exit(0); }
writeFileSync(new URL('../src/arcade/ReefDropLevels.js', import.meta.url), `// ============================================================
// REEF DROP LEVELS — made by scripts/reef-levels.mjs from scripts/reef-base.json
// (the hand-made reefs) and scripts/reef-recipes.mjs (generated worlds). Don't
// edit by hand: see docs/REEF_LEVELS.md.
// ============================================================
export const WORLDS = ${JSON.stringify(worlds)};
export const LEVELS = ${JSON.stringify(levels)};
`);
console.log(`wrote ${levels.length} reefs in ${worlds.length} worlds`);
