// ============================================================
// REEF LIB — the checks every Reef Drop reef must pass, shared by the generator
// (scripts/reef-levels.mjs) and the quiet check (scripts/reef-check.mjs):
//   won        a greedy player (best of 180 shots each drop) clears it
//   left       ... with at least MIN_LEFT pearls to spare (★★★ is 5)
//   rand       how often a random flinger wins: the difficulty
//   longest    the longest of 40 random drops (seconds): nothing gets stuck
//   lowest     nothing comes below CLEAR_Y (Shelly's shell)
// No DOM; plain Node.
// ============================================================
import * as D from '../src/arcade/ReefDropLogic.js';

export const MIN_LEFT = 5, MAX_DROP_S = 15;
export const BANDS = { easy: [0.25, 0.8], medium: [0.08, 0.4], hard: [0.02, 0.18] };
export const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
export const hashStr = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return (h % 2147483646) + 1; };

/** The greedy player: { won, left, drops }. */
export function greedy(lv) {
    const s = D.begin(lv);
    while (!D.cleared(s) && s.left > 0) {
        let best = null;
        for (let a = 0; a < 60; a++) for (const pw of [0.3, 0.6, 1]) {
            const c = D.copy(s), ang = 0.05 + (a / 60) * (Math.PI - 0.1);
            D.shot(lv, c, ang, pw); D.settle(lv, c);
            const sc = D.score(lv, c); if (!best || sc > best.sc) best = { sc, ang, pw };
        }
        D.shot(lv, s, best.ang, best.pw); D.settle(lv, s);
    }
    return { won: D.cleared(s), left: s.left, drops: s.used };
}

/** How often a random flinger (random aim, power and moment) wins, out of n. */
export function randomRate(lv, n = 60, seed = 1) {
    const r = seeded(seed); let wins = 0;
    for (let g = 0; g < n; g++) {
        const s = D.begin(lv);
        while (!D.cleared(s) && s.left > 0) { D.idle(lv, s, r() * 2); D.shot(lv, s, 0.05 + r() * (Math.PI - 0.1), r()); D.settle(lv, s); }
        wins += D.cleared(s);
    }
    return wins / n;
}

/** The longest of n random drops, in seconds (30 = stuck). */
export function longest(lv, n = 40, seed = 9) {
    const r = seeded(seed); let worst = 0;
    for (let k = 0; k < n; k++) {
        const s = D.begin(lv); D.idle(lv, s, r() * 6); D.shot(lv, s, 0.05 + r() * (Math.PI - 0.1), r());
        let steps = 0; while (s.flying && steps < 120 * 30) { D.step(lv, s); steps++; }
        worst = Math.max(worst, steps / 120);
    }
    return worst;
}

/** Everything about a reef: { ok, problems: [..], won, left, rand, longest, lowest }. band: 'easy' | 'medium' | 'hard' (optional). */
export function check(lv, band = null, fast = false) {
    const g = greedy(lv), low = D.lowest(lv), long = longest(lv, fast ? 20 : 40), rand = band || !fast ? randomRate(lv, fast ? 40 : 60) : null;
    const problems = [];
    if (!g.won) problems.push('the greedy player can\'t win it');
    else if (g.left < MIN_LEFT) problems.push(`won with only ${g.left} pearls left (needs ${MIN_LEFT})`);
    if (low > D.CLEAR_Y + 1e-9) problems.push(`a piece reaches ${low.toFixed(2)}, below Shelly's line ${D.CLEAR_Y}`);
    if (long >= MAX_DROP_S) problems.push(`a drop lasted ${long.toFixed(1)}s (stuck?)`);
    if (band && rand != null) { const [lo, hi] = BANDS[band]; if (rand < lo || rand > hi) problems.push(`a random flinger wins ${Math.round(rand * 100)}% (${band} wants ${lo * 100}–${hi * 100}%)`); }
    return { ok: !problems.length, problems, won: g.won, left: g.left, drops: g.drops, rand, longest: long, lowest: low };
}
