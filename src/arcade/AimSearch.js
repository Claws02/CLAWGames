// ============================================================
// AIM SEARCH — the par-prover for the aim-and-shoot games (Orbit Putt, Crab
// Reef Drop). No DOM. A game's logic module gives:
//   begin(lv) → state        copy(s) → state         shot(lv, s, angle, power)
//   settle(lv, s)            cleared(s) → bool       score(lv, s) → higher is closer
// and this finds the fewest shots that clear a level: a beam search over a
// grid of angles and powers (shot by shot, keeping the best few states).
// ============================================================
//
// robust: { da, dp } makes it a thumb's search: a shot only counts if it also
// works aimed da radians either side and dp power either side (a clearing shot
// must clear from all nine; a shot on the way is as good as its worst one).
export function solve(game, lv, { maxDepth = 4, angles = 96, powers = [0.35, 0.55, 0.75, 1], beam = 8, angleFrom = 0, angleTo = Math.PI * 2, spread = 0.06, robust = null } = {}) {
    let frontier = [{ s: game.begin(lv), path: [] }];
    for (let depth = 1; depth <= maxDepth; depth++) {
        const next = [];
        for (const node of frontier) {
            for (let a = 0; a < angles; a++) for (const p of powers) {
                const s = game.copy(node.s), ang = angleFrom + (a / angles) * (angleTo - angleFrom);
                game.shot(lv, s, ang, p); game.settle(lv, s);
                const path = [...node.path, [ang, p]];
                if (!robust) {
                    if (game.cleared(s)) return { shots: depth, path };
                    next.push({ s, path, n: game.score(lv, s) });
                    continue;
                }
                let all = game.cleared(s), worst = all ? Infinity : game.score(lv, s);
                for (const da of [-robust.da, 0, robust.da]) for (const dp of [-robust.dp, 0, robust.dp]) {
                    if (!da && !dp) continue;
                    const t = game.copy(node.s); game.shot(lv, t, ang + da, Math.max(0.05, Math.min(1, p + dp))); game.settle(lv, t);
                    if (!game.cleared(t)) { all = false; worst = Math.min(worst, game.score(lv, t)); }
                }
                if (all) return { shots: depth, path };
                next.push({ s, path, n: worst });
            }
        }
        next.sort((a, b) => b.n - a.n);
        frontier = [];
        for (const c of next) {
            if (frontier.length >= beam) break;
            const pos = game.where ? game.where(c.s) : [0, 0];
            if (frontier.every(f => Math.abs(f.n - c.n) > 1e-6 || Math.hypot(...(game.where ? game.where(f.s) : [0, 0]).map((v, i) => v - pos[i])) > spread)) frontier.push(c);
        }
    }
    return null;
}

/** Replay a solution and check it really clears the level. */
export function replay(game, lv, path) {
    const s = game.begin(lv);
    for (const [a, p] of path) { game.shot(lv, s, a, p); game.settle(lv, s); }
    return game.cleared(s);
}

export const stars = (shots, par) => (shots <= par ? 3 : shots <= par + 2 ? 2 : 1);
