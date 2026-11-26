// ============================================================
// PROGRESS — what the player has cleared, kept between visits.
//
//   const pr = createProgress(store, { levels, unlockAll })
//     store: { load() → object|null, save(object) }   (Store.js in the app, localStorage in the preview)
//   pr.isUnlocked(id) · pr.isDone(id) · pr.best(id) · pr.stars(id) (best review, 0–3) · pr.underPar(id)
//   pr.record(level, result) → { firstClear, newBest, unlocked: level|null, allDone }
//   pr.summary() → { done, total, stars, maxStars }      pr.learned() → Set of concept ids
//   pr.lastDoor / pr.setLastDoor(id)
//
// Save schema v1: { v: 1, done: { [levelId]: { best, runs, stars } }, lastDoor }   (stars added later; missing = 1)
// ============================================================

export function createProgress(store, { levels, unlockAll = false }) {
    let s = null;
    try { s = store.load(); } catch (e) { s = null; }
    if (!s || s.v !== 1 || typeof s.done !== 'object') s = { v: 1, done: {}, lastDoor: null };
    const save = () => { try { store.save(s); } catch (e) {} };
    const idx = id => levels.findIndex(l => l.id === id);

    const api = {
        isDone: id => !!s.done[id],
        best: id => s.done[id]?.best ?? null,
        stars: id => (s.done[id] ? s.done[id].stars ?? 1 : 0),
        underPar(id) {
            const l = levels[idx(id)], b = api.best(id);
            return !!(l && b != null && l.par && b <= l.par.seconds);
        },
        isUnlocked(id) {
            const i = idx(id);
            if (i < 0) return false;
            return unlockAll || i === 0 || api.isDone(levels[i - 1].id);
        },
        record(level, result) {
            const prev = s.done[level.id];
            const firstClear = !prev;
            const newBest = !prev || result.seconds < prev.best;
            const prevStars = prev ? prev.stars ?? 1 : 0, got = result.stars ?? 1;
            s.done[level.id] = { best: newBest ? result.seconds : prev.best, runs: (prev?.runs || 0) + 1, stars: Math.max(prevStars, got) };
            s.lastDoor = level.id;
            save();
            const next = levels[idx(level.id) + 1] || null;
            return {
                firstClear, newBest, moreStars: got > prevStars, stars: got,
                unlocked: firstClear && next && !unlockAll ? next : null,
                allDone: levels.every(l => s.done[l.id]),
            };
        },
        summary() {
            const done = levels.filter(l => s.done[l.id]).length;
            const stars = levels.reduce((a, l) => a + api.stars(l.id), 0);
            return { done, total: levels.length, stars, maxStars: levels.length * 3 };
        },
        learned() {
            const out = new Set();
            for (const l of levels) if (s.done[l.id]) for (const c of l.teaches || []) out.add(c);
            return out;
        },
        get lastDoor() { return s.lastDoor; },
        setLastDoor(id) { s.lastDoor = id; save(); },
    };
    return api;
}
