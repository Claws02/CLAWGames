// ============================================================
// PROGRESS — what you've done in Playroom Parkour, kept between visits.
//
//   const pr = createProgress(store, { courses, unlockAll })
//     store: { load() → object|null, save(object) }   (the arcade's Store in the app, localStorage in the preview)
//   pr.isUnlocked(id) · pr.isDone(id) · pr.best(id) · pr.coins(id) → bitmask · pr.stars(id) → 0..3
//   pr.record(course, result) → { firstClear, newBest, newStars, unlocked: course|null, allDone }
//   pr.summary() → { done, total, stars, max }
//   pr.lastDoor / pr.setLastDoor(id)
//
// Stars per course: ★ finished · ★ best time under par · ★ every coin collected
// (coins count once you finish the run you grabbed them in; they add up across runs).
// Save schema v1: { v: 1, done: { [id]: { best, coins, runs } }, lastDoor }
// ============================================================

export function createProgress(store, { courses, unlockAll = false }) {
    let s = null;
    try { s = store.load(); } catch (e) { s = null; }
    if (!s || s.v !== 1 || typeof s.done !== 'object') s = { v: 1, done: {}, lastDoor: null };
    const save = () => { try { store.save(s); } catch (e) {} };
    const idx = id => courses.findIndex(c => c.id === id);
    const allCoins = c => (1 << (c.devices || []).filter(d => d.type === 'coin').length) - 1;

    const api = {
        isDone: id => !!s.done[id],
        best: id => s.done[id]?.best ?? null,
        coins: id => s.done[id]?.coins || 0,
        stars(id) {
            const c = courses[idx(id)], d = s.done[id];
            if (!c || !d) return 0;
            return 1 + (d.best <= c.par.seconds ? 1 : 0) + ((d.coins & allCoins(c)) === allCoins(c) ? 1 : 0);
        },
        isUnlocked(id) {
            const i = idx(id);
            if (i < 0) return false;
            return unlockAll || i === 0 || api.isDone(courses[i - 1].id);
        },
        record(course, result) {
            const before = api.stars(course.id);
            const prev = s.done[course.id];
            const firstClear = !prev;
            const newBest = !prev || result.seconds < prev.best;
            s.done[course.id] = { best: newBest ? result.seconds : prev.best, coins: (prev?.coins || 0) | (result.coins || 0), runs: (prev?.runs || 0) + 1 };
            s.lastDoor = course.id;
            save();
            const next = courses[idx(course.id) + 1] || null;
            return {
                firstClear, newBest, newStars: api.stars(course.id) - before,
                unlocked: firstClear && next && !unlockAll ? next : null,
                allDone: courses.every(c => s.done[c.id]),
            };
        },
        summary() {
            const done = courses.filter(c => s.done[c.id]).length;
            const stars = courses.reduce((a, c) => a + api.stars(c.id), 0);
            return { done, total: courses.length, stars, max: courses.length * 3 };
        },
        get lastDoor() { return s.lastDoor; },
        setLastDoor(id) { s.lastDoor = id; save(); },
    };
    return api;
}
