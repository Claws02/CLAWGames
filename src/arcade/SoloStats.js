// ============================================================
// SOLO STATS — what the single-player games remember on this device:
// best scores, the daily puzzles and their streak, and a few counters the
// trophies read. No DOM, so the logic probes can use it in Node.
//
//   best('treasure')                → the best so far, or null
//   record('treasure', 9, 'low')    → true when 9 is a new best (fewest digs)
//   today()                         → '2026-11-04' (this device's date)
//   dailySeed('lighthouse')         → today's puzzle seed: the same for everyone
//   rng(seed)                       → a seeded random, 0 ≤ x < 1
//   solveDaily('lighthouse')        → marks today's as done; dailyDone(game)
//   streak()                        → days in a row with at least one daily solved
//   bump('lighthouseHard')          → a counter for trophies; count(name)
// ============================================================
import * as Store from './Store.js';

const KEY = 'solo';
let _s = null;
const _load = () => (_s ||= { best: {}, daily: {}, counts: {}, ...Store.load(KEY, {}) });
const _save = () => Store.save(KEY, _load());

export const best = game => (_load().best[game] ?? null);

/** Keep `value` if it beats the best (higher, or lower with dir 'low'). True when it does. */
export function record(game, value, dir = 'high') {
    const s = _load(), prev = s.best[game];
    const better = prev == null || (dir === 'low' ? value < prev : value > prev);
    if (better) { s.best[game] = value; _save(); }
    return better;
}

// A game just ended: whoever listens (SoloHub, to announce trophies) hears it.
// Kept here so the games never import the browser-only trophy code.
const _won = [];
export const onWon = fn => { _won.push(fn); };
export const won = () => _won.forEach(fn => { try { fn(); } catch (e) {} });

export function bump(name, by = 1) { const s = _load(); s.counts[name] = (s.counts[name] || 0) + by; _save(); return s.counts[name]; }
export const count = name => _load().counts[name] || 0;

// ---- the daily puzzle --------------------------------------------------------------
/** This device's date, YYYY-MM-DD (local time: a new puzzle at local midnight). */
export function today(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A number from a string: the same string, the same number, on every phone. */
export function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
export const dailySeed = (game, day = today()) => hash(`${day}:${game}`);

/** mulberry32: small, fast, good enough for laying out a puzzle. */
export function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const dailyDone = (game, day = today()) => !!(_load().daily[day] && _load().daily[day][game]);

/** Today's puzzle for `game` is solved. Returns true the first time. */
export function solveDaily(game, day = today()) {
    const s = _load();
    if (s.daily[day] && s.daily[day][game]) return false;
    (s.daily[day] ||= {})[game] = true;
    // Keep two months of history: enough for any streak worth showing.
    const keys = Object.keys(s.daily).sort();
    while (keys.length > 62) delete s.daily[keys.shift()];
    _save();
    return true;
}

/** Days in a row, ending today (or yesterday, if today's isn't done yet), with a daily solved. */
export function streak(now = new Date()) {
    const s = _load();
    const has = d => s.daily[today(d)] && Object.keys(s.daily[today(d)]).length > 0;
    const d = new Date(now);
    if (!has(d)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (has(d)) { n++; d.setDate(d.getDate() - 1); }
    return n;
}

/** Probes: forget everything. */
export function _reset() { _s = { best: {}, daily: {}, counts: {} }; _save(); }
