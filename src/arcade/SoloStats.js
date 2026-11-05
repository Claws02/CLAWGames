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
//   todaysDailies()                 → the three daily puzzles today (of five, by the date)
//   dailyLevel()                    → 'easy' Mon–Tue, 'medium' Wed–Fri, 'hard' Sat–Sun
//   tokens() / spendToken()         → claw-machine goes, one per daily solved
//   passes() / usePasses()          → tide passes: all of today's dailies earns one
//                                     (max 2); a missed day spends one to keep the streak
//   shelf() / addPrize(id, gain)    → the plush critters won at the claw machine (repeats: sparkles)
//   freeDropReady() / useFreeDrop() → one free claw drop a day; golds(), setsDone(), spendSparkles(n)
// ============================================================
import * as Store from './Store.js';

const KEY = 'solo';
let _s = null;
const _load = () => (_s ||= { best: {}, daily: {}, counts: {}, tokens: 0, passes: 0, passDays: {}, shelf: {}, sparkles: 0, ...Store.load(KEY, {}) });
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

// ---- which dailies, and how hard -------------------------------------------------------
/** Every game with a daily puzzle. Each day the date picks three of them. */
export const DAILY_POOL = ['critter', 'treasure', 'lighthouse', 'icefloe', 'paths', 'rebound'];
export function todaysDailies(day = today()) {
    const r = rng(hash(`${day}:pick`)), pool = DAILY_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3).sort((a, b) => DAILY_POOL.indexOf(a) - DAILY_POOL.indexOf(b));
}
const _dow = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
/** Gentle early in the week, tough at the weekend: Mon–Tue easy, Wed–Fri medium, Sat–Sun hard. */
export function dailyLevel(day = today()) {
    const w = _dow(day);
    return w === 1 || w === 2 ? 'easy' : w === 0 || w === 6 ? 'hard' : 'medium';
}

/**
 * Today's puzzle for `game` is solved. The first time it's worth a claw token,
 * and the last of today's three earns a tide pass (two at most). Returns false
 * when it was already solved, otherwise { token, pass, allDone }.
 */
export function solveDaily(game, day = today()) {
    const s = _load();
    if (s.daily[day] && s.daily[day][game]) return false;
    (s.daily[day] ||= {})[game] = true;
    s.tokens++;
    const allDone = todaysDailies(day).every(g => s.daily[day][g]);
    let pass = false;
    if (allDone && !s.passDays[day] && s.passes < 2) { s.passes++; s.passDays[day] = true; pass = true; }
    // Keep two months of history: enough for any streak worth showing.
    const keys = Object.keys(s.daily).sort();
    while (keys.length > 62) delete s.daily[keys.shift()];
    Object.keys(s.passDays).sort().slice(0, -62).forEach(k => delete s.passDays[k]);
    _save();
    return { token: true, pass, allDone };
}

/** The line a game shows after its daily: streak, the token, any tide pass. */
export function dailyLine(res, noun) {
    if (!res) return `📅 ${noun}: already solved today.`;
    return `📅 ${noun} solved! 🔥 ${streak()}-day streak · 🎟️ +1 claw token${res.pass ? ' · 🌊 tide pass earned' : res.allDone ? ' · all three done!' : ''}`;
}

const _has = (s, d) => s.daily[today(d)] && Object.keys(s.daily[today(d)]).length > 0;

/** Days in a row, ending today (or yesterday, if today's isn't done yet), with a daily solved or a tide pass spent. */
export function streak(now = new Date()) {
    const s = _load();
    const d = new Date(now);
    if (!_has(s, d)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (_has(s, d)) { n++; d.setDate(d.getDate() - 1); }
    return n;
}

// ---- tide passes ------------------------------------------------------------------------
export const passes = () => _load().passes;
/**
 * Missed a day or two? If there's a streak behind the gap and enough passes to
 * cover every missed day, spend them: those days count. Called when the hub opens.
 * Returns how many were spent.
 */
export function usePasses(now = new Date()) {
    const s = _load();
    if (!s.passes) return 0;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (_has(s, y)) return 0;
    const gap = [];
    const d = new Date(y);
    while (!_has(s, d) && gap.length <= s.passes) { gap.push(today(d)); d.setDate(d.getDate() - 1); }
    if (gap.length > s.passes || !_has(s, d)) return 0;   // no streak to save, or not enough passes
    gap.forEach(day => { s.daily[day] = { pass: true }; });
    s.passes -= gap.length;
    _save();
    return gap.length;
}

// ---- the claw machine and the shelf ------------------------------------------------------
export const tokens = () => _load().tokens;
export function spendToken() { const s = _load(); if (s.tokens < 1) return false; s.tokens--; _save(); return true; }
export const shelf = () => ({ ..._load().shelf });
export const sparkles = () => _load().sparkles;
/**
 * A prize won. A new one goes on the shelf (with today's date); a repeat is
 * worth `gain` sparkles for the shop. Also counts capsules since the last new one.
 */
export function addPrize(id, gain = 1) {
    const s = _load(), fresh = !s.shelf[id];
    s.shelf[id] = (s.shelf[id] || 0) + 1;
    s.found ||= {};
    if (fresh) { s.found[id] = today(); s.dry = 0; } else { s.sparkles += gain; s.dry = (s.dry || 0) + 1; }
    _save();
    return { fresh, sparkles: fresh ? 0 : gain };
}
export const foundOn = id => (_load().found || {})[id] || null;
export const prizeDry = () => _load().dry || 0;
export function spendSparkles(n) { const s = _load(); if (s.sparkles < n) return false; s.sparkles -= n; _save(); return true; }
/** One free claw drop a day. */
export const freeDropReady = (day = today()) => _load().freeDay !== day;
export function useFreeDrop(day = today()) { const s = _load(); if (s.freeDay === day) return false; s.freeDay = day; _save(); return true; }
/** Finished sets (rewarded once each). markSet returns true the first time. */
export const setsDone = () => (_load().sets || []).slice();
export function markSet(id) { const s = _load(); s.sets ||= []; if (s.sets.includes(id)) return false; s.sets.push(id); _save(); return true; }
/** Gold capsules in hand (set rewards, the shop): opened straight away, kept if you leave. */
export const golds = () => _load().golds || 0;
export function addGold(n = 1) { const s = _load(); s.golds = (s.golds || 0) + n; _save(); }
export function useGold() { const s = _load(); if (!s.golds) return false; s.golds--; _save(); return true; }
/** Probes and gifts: add claw tokens. */
export function giveTokens(n) { const s = _load(); s.tokens += n; _save(); }

/** Probes: forget everything. */
export function _reset() { _s = { best: {}, daily: {}, counts: {}, tokens: 0, passes: 0, passDays: {}, shelf: {}, sparkles: 0, found: {}, dry: 0, sets: [], golds: 0 }; _save(); }
