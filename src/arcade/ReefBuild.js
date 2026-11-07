// ============================================================
// REEF BUILD — the helpers that lay reefs out: patterns of points (grid, ring,
// wave, diamond), moving pieces (wheel, slider), marks for kinds, and build()
// which turns a description into a reef and squeezes it clear of Shelly.
// Used by scripts/reef-levels.mjs (the generator) and tests; the game itself
// loads finished reefs from ReefDropLevels.js and never this file.
// ============================================================
import * as L from './ReefDropLogic.js';

const TAU = Math.PI * 2;
const { CLEAR_Y, lowest } = L;
// ---- patterns: c coral, o oyster, e eel, r rock, p puffer, t chest, s starfish, g golden,
//      u urchin, d sponge, m mine, a anemone, b barnacle (key: n; oysters with lock: n) ----
export const grid = (rows, cols, y0, y1, x0 = 0.12, x1 = 0.88, off = true) => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([x0 + (c + (off && r % 2 ? 0.5 : 0)) * ((x1 - x0) / (cols - (off ? 0.5 : 1))), y0 + r * ((y1 - y0) / (rows - 1))]); return out.filter(([x]) => x <= x1 + 0.001); };
export const ring = (cx, cy, rad, n, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(a0 + (i / n) * TAU) * rad, cy + Math.sin(a0 + (i / n) * TAU) * rad * 1.1]);
export const wave = (y, amp, n, ph = 0) => Array.from({ length: n }, (_, i) => [0.1 + (i / (n - 1)) * 0.8, y + Math.sin(ph + (i / (n - 1)) * TAU) * amp]);
export const diamond = () => { const out = []; for (let r = 0; r < 7; r++) { const n = 8 - Math.abs(3 - r) * 2; for (let c = 0; c < n; c++) out.push([0.5 + (c - (n - 1) / 2) * 0.11, 0.42 + r * 0.12]); } return out; };
export const at = (list, kind) => Object.fromEntries(list.map(i => [i, kind]));
export const every = (n, k, kind, from = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => i).filter(i => i >= from && (i - from) % k === 0).map(i => [i, kind]));
// A turning wheel of n pieces round (cx, cy); speed in radians a second. Returns pieces (with orbit).
export const wheel = (cx, cy, rad, n, speed, a0 = 0) => Array.from({ length: n }, (_, i) => ({ orbit: [cx, cy, rad, a0 + (i / n) * TAU, speed] }));
// Pieces in a row that slide together.
export const slider = (y, n, dx, period, x0 = 0.18, x1 = 0.82, ph = 0) => Array.from({ length: n }, (_, i) => ({ x: x0 + (i / (n - 1)) * (x1 - x0), y, slide: [dx, period, ph] }));

/**
 * A reef: still pieces from points (marks pick their kind by index), plus
 * moving pieces (each { orbit | slide, kind? }), jellyfish [x, y, r, dx, period, ph?]
 * and how Shelly moves ({ a, period, ph }).
 */
export const build = (name, world, pts, marks, more = {}) => {
    const ghost = more.ghost || {};   // { index: [period, phase] } for still pieces
    const keys = more.keys || {}, locks = more.locks || {};   // { index: n }: barnacle n, and the pieces it locks
    const still = pts.map(([x, y], i) => ({ x: +x.toFixed(3), y: +y.toFixed(3), kind: marks[i] || 'c', ...(ghost[i] ? { blink: ghost[i] } : {}), ...(keys[i] != null ? { key: keys[i] } : {}), ...(locks[i] != null ? { lock: locks[i] } : {}) }));
    const moving = (more.movers || []).map(m => ({ x: m.x ?? 0, y: m.y ?? 0, kind: m.kind || 'c', ...(m.orbit ? { orbit: m.orbit } : {}), ...(m.slide ? { slide: m.slide } : {}), ...(m.blink ? { blink: m.blink } : {}) }));
    return _clear({ name, world, pegs: [...still, ...moving], jellies: more.jellies || [], whirls: more.whirls || [], lifts: more.lifts || [], anglers: more.anglers || [], currents: more.currents || [], clams: more.clams || [], ...(more.kelp ? { kelp: more.kelp } : {}), ...(more.magnets ? { magnets: more.magnets } : {}), ...(more.flips ? { flips: more.flips } : {}), crab: more.crab || {}, hint: more.hint });
};
// Squeeze a reef upwards (keeping its top where it is) so nothing comes down past CLEAR_Y.
export function _clear(lv) {
    const low = lowest(lv);
    if (low <= CLEAR_Y) return lv;
    let top = Infinity;
    for (const p of lv.pegs) top = Math.min(top, p.orbit ? p.orbit[1] - p.orbit[2] : p.y);
    const f = (CLEAR_Y - top) / (low - top), Y = y => +(top + (y - top) * f).toFixed(3);
    for (const p of lv.pegs) { if (p.orbit) { p.orbit = [p.orbit[0], Y(p.orbit[1]), +(p.orbit[2] * f).toFixed(3), p.orbit[3], p.orbit[4]]; } else p.y = Y(p.y); }
    lv.jellies = lv.jellies.map(j => [j[0], Y(j[1]), j[2], ...j.slice(3)]);
    lv.whirls = lv.whirls.map(w => [w[0], Y(w[1]), w[2], Y(w[3])]);
    lv.lifts = lv.lifts.map(l => [l[0], Y(l[1]), Y(l[2]), l[3]]);
    lv.anglers = (lv.anglers || []).map(a => [a[0], Y(a[1]), a[2], a[3]]);
    lv.currents = (lv.currents || []).map(c => [c[0], Y(c[1]), c[2], Y(c[3]), c[4]]);
    lv.clams = (lv.clams || []).map(c => [c[0], Y(c[1]), c[2], c[3]]);
    if (lv.kelp) lv.kelp = lv.kelp.map(k => [k[0], Y(k[1]), k[2], Y(k[3])]);
    if (lv.magnets) lv.magnets = lv.magnets.map(m => [m[0], Y(m[1]), m[2], m[3]]);
    if (lv.flips) lv.flips = lv.flips.map(f => [f[0], Y(f[1])]);
    if (lowest(lv) > CLEAR_Y + 1e-6) { const g = CLEAR_Y - lowest(lv); for (const j of lv.jellies) j[1] += g; }   // a jelly's tentacles
    return lv;
}
export const kinds = (list, marks) => list.map((m, i) => ({ ...m, kind: marks[i] || 'c' }));
