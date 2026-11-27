// ============================================================
// LINT — the checker every course passes before anyone plays it.
//
//   1 data     tiles, one start, a goal, devices with the fields they need,
//              3 coins, a par time, everything inside the map
//   2 reach    the solver runs from the start to the goal
//   3 coins    …and through all 3 coins to the goal (the ★★★ route)
//   4 flags    from every checkpoint, the goal is still reachable
//   5 ghost    both routes replay to the same frame twice; the goal route
//              and the ★★★ route both beat par (so ★★★ is always possible)
//   6 needs    take away each part the course lists in `needs` (a device id,
//              a device type, or a tile like 'T'): the goal must go out of reach,
//              so every mechanic actually matters
//   Big courses can list `route`: their flag and coin ids in the order a run
//   meets them. The searches then go waypoint to waypoint (reach: the flags;
//   coins: everything), which keeps each search small.
//
//   hub        every door reachable from the start, and the start from every door
//              (so every door from every other door);
//              every course has a door
//
//   lintCourse(level) → { errors[], warnings[], tapes: { goal, all }, info }
//   lintHub(hub, courses) → { errors[], warnings[] }
// ============================================================
import { compile, step } from './World.js';
import { TILE_CHARS, TILE, DEVICES, DT } from './Rules.js';
import { route, replay, goalTarget, coinTarget, flagTarget, portalTarget, toInput } from './Solver.js';

const fmt = b => (b ? `(${b.at.x.toFixed(1)}, ${b.at.y.toFixed(1)}), ${b.d.toFixed(1)} tiles away` : '?');

function dataLayer(level, errors, warnings, { hub = false } = {}) {
    const map = level.map;
    if (!Array.isArray(map) || !map.length) { errors.push('map: missing'); return false; }
    const W = map[0].length;
    map.forEach((row, y) => {
        if (row.length !== W) errors.push(`map row ${y}: ${row.length} wide, expected ${W}`);
        [...row].forEach((c, x) => { if (!TILE_CHARS.has(c)) errors.push(`map (${x},${y}): unknown tile '${c}'`); });
    });
    const count = c => map.join('').split(c).length - 1;
    if (count(TILE.START) !== 1) errors.push(`map: needs exactly one start 'S' (has ${count(TILE.START)})`);
    if (!hub && count(TILE.GOAL) < 1) errors.push("map: needs a goal 'G'");
    if (hub && count(TILE.GOAL)) errors.push("hub: no goal 'G' (doors only)");
    const ids = new Set();
    for (const d of level.devices || []) {
        const need = DEVICES[d.type];
        if (!need) { errors.push(`device ${d.id || d.type}: unknown type '${d.type}'`); continue; }
        for (const f of need) if (d[f] === undefined) errors.push(`device ${d.id || d.type}: missing '${f}'`);
        if (d.id) { if (ids.has(d.id)) errors.push(`device id '${d.id}' used twice`); ids.add(d.id); }
        const inside = (x, y) => x >= 0 && y >= 0 && x <= W && y <= map.length;
        if (d.type === 'train') {
            if (!Array.isArray(d.path) || d.path.length < 2) errors.push(`device ${d.id || 'train'}: path needs at least 2 points`);
            else for (const q of d.path) if (!inside(q[0], q[1])) errors.push(`device ${d.id || 'train'}: path point (${q}) is outside the map`);
            if (!(d.speed > 0)) errors.push(`device ${d.id || 'train'}: speed must be > 0`);
            continue;
        }
        if (!inside(d.x, d.y)) errors.push(`device ${d.id || d.type}: (${d.x},${d.y}) is outside the map`);
        if (d.type === 'mover' && !inside(d.to[0], d.to[1])) errors.push(`device ${d.id}: 'to' is outside the map`);
        if (d.type === 'cannon' && (!Array.isArray(d.aim) || !d.aim.length || d.aim.length > 2)) errors.push(`device ${d.id}: aim must be one or two [vx, vy]`);
        if (d.type === 'cannon' && d.aim.length > 1 && !d.period) errors.push(`device ${d.id}: a sweeping cannon needs a period`);
        if (d.type === 'flip' && d.dir !== 'up' && d.dir !== 'down') errors.push(`device ${d.id || 'flip'}: dir must be 'up' or 'down'`);
        if (d.type === 'portal' && !hub) errors.push(`device ${d.id}: doors belong in the hub`);
        if (d.type === 'plane' && d.dir !== 1 && d.dir !== -1) errors.push(`device ${d.id || 'plane'}: dir must be 1 or -1`);
        if (d.type === 'button' && !(level.devices || []).some(g => g.type === 'gate' && g.id === d.gate)) errors.push(`device ${d.id || 'button'}: no gate with id '${d.gate}'`);
        if (d.type === 'gate' && !d.id) errors.push('device gate: needs an id (its button names it)');
        if (d.type === 'warp' && !(level.devices || []).some(o => o.type === 'warp' && o.id === d.to)) errors.push(`device ${d.id || 'warp'}: no warp box with id '${d.to}' to come out of`);
    }
    if (!hub) {
        const coins = (level.devices || []).filter(d => d.type === 'coin').length;
        if (coins !== 3) errors.push(`course: needs exactly 3 coins (has ${coins})`);
        if (!level.par?.seconds) errors.push('course: needs a par time (par: { seconds })');
        if (!level.name || !level.id) errors.push('course: needs an id and a name');
    }
    return errors.length === 0;
}

export function lintCourse(level, opts = {}) {
    const errors = [], warnings = [], info = {};
    if (!dataLayer(level, errors, warnings)) return { errors, warnings, tapes: null, info };
    const L = compile(level).L;
    const so = { maxStates: opts.maxStates ?? 150000 };
    // Waypoints: the course's `route` (flag and coin ids in run order), if it lists one.
    const way = (level.route || []).map(id => {
        const fi = L.dev.flag.findIndex(f => f.id === id), ci = L.dev.coin.findIndex(c => c.id === id);
        if (fi >= 0) return { kind: 'flag', i: fi, t: flagTarget(L, fi) };
        if (ci >= 0) return { kind: 'coin', i: ci, t: coinTarget(L, ci) };
        errors.push(`route: '${id}' isn't a flag or coin id`);
        return null;
    }).filter(Boolean);
    if (errors.length) return { errors, warnings, tapes: null, info };
    const flagWay = way.filter(x => x.kind === 'flag');
    info.waypoints = way.length;

    // 2. reach
    const g = route(level, [...flagWay.map(x => x.t), goalTarget(L)], so);
    if (!g.found) { errors.push(`reach: no route to the goal found (${g.states} states${g.capped ? ', capped' : ''}; got closest at ${fmt(g.best)})`); return { errors, warnings, tapes: null, info }; }
    info.goalSeconds = +(g.frames * DT).toFixed(2); info.goalStates = g.states;
    // What you carry at each flag on that route (a pogo stick): a fall puts you back there with it.
    const flagPogo = {};
    {
        const w = compile(level);
        let last = -1;
        outer: for (const [bits, n] of g.tape) for (let k = 0; k < n; k++) {
            step(w, toInput(bits));
            if (w.s.check !== last) { last = w.s.check; if (last >= 0 && !(last in flagPogo)) flagPogo[last] = w.s.checkPogo; }
            if (w.s.won) break outer;
        }
    }

    // 3. coins, in the order they're listed, then the goal
    const coinTs = way.length ? way.map(x => x.t) : L.dev.coin.map((_, i) => coinTarget(L, i));
    if (way.length && way.filter(x => x.kind === 'coin').length !== L.dev.coin.length) errors.push('route: list every coin once');
    const a = route(level, [...coinTs, goalTarget(L)], so);
    if (!a.found) errors.push(`coins: no route through ${a.failedAt} (${a.states} states${a.capped ? ', capped' : ''}; got closest at ${fmt(a.best)})`);
    else { info.allSeconds = +(a.frames * DT).toFixed(2); info.allStates = a.states; }

    // 4. flags: from each checkpoint (as if you'd just respawned there), the goal
    L.dev.flag.forEach((f, i) => {
        const w = compile(level);
        w.s.check = i; w.s.checkG = f.g || 1;
        w.s.p = { ...w.s.p, x: f.x + 0.15, y: (f.g || 1) > 0 ? f.y + 0.1 : f.y, vx: 0, vy: 0, g: f.g || 1, pogo: !!flagPogo[i] };
        w.s.checkPogo = !!flagPogo[i];
        const after = flagWay.filter(x => x.i > i).map(x => x.t);
        const r = route(level, [...after, goalTarget(L)], { ...so, from: w });
        if (!r.found) errors.push(`flags: no route to the goal from checkpoint ${i + 1} at (${f.x},${f.y}) (stuck before ${r.failedAt}; got closest at ${fmt(r.best)})`);
    });

    // 5. ghost + par
    const check = (name, tape, wantCoins) => {
        const r1 = replay(level, tape), r2 = replay(level, tape);
        if (!r1.won) errors.push(`ghost: the ${name} route doesn't finish on replay`);
        else if (r1.hash !== r2.hash || r1.frames !== r2.frames) errors.push(`ghost: the ${name} route replays differently`);
        if (wantCoins && r1.coins !== 7) errors.push(`ghost: the ${name} route takes coins ${r1.coins.toString(2)} on replay, not all 3`);
        if (r1.deaths) errors.push(`ghost: the ${name} route dies on replay`);
        return r1;
    };
    check('goal', g.tape, false);
    if (a.found) check('all-coins', a.tape, true);
    if (info.goalSeconds > level.par.seconds) errors.push(`par: ${level.par.seconds}s, but the checker's route takes ${info.goalSeconds}s: raise par or ease the course`);
    else if (level.par.seconds > info.goalSeconds * 2.5) warnings.push(`par: ${level.par.seconds}s is very easy (the checker runs it in ${info.goalSeconds}s)`);
    // ★★★ has to be one run: all the coins AND under par. The ★★★ route proves it can be done.
    if (info.allSeconds > level.par.seconds) errors.push(`par: ${level.par.seconds}s, but the ★★★ route (every coin) takes ${info.allSeconds}s: ★★★ would be impossible`);

    // 6. needs: take away each thing the course is built around; the goal must go out of reach.
    for (const need of level.needs || []) {
        const without = withoutPart(level, need);
        if (!without) { errors.push(`needs: '${need}' isn't a device id or tile in this course`); continue; }
        const LW = compile(without).L;
        const ways = flagWay.map(x => flagTarget(LW, LW.dev.flag.findIndex(f => f.id === L.dev.flag[x.i].id))).filter(t => t);
        const r = route(without, [...ways, goalTarget(LW)], { maxStates: opts.needStates ?? 6000 });
        if (r.found) warnings.push(`needs: the course can be finished without '${need}' (in ${(r.frames * DT).toFixed(1)}s)`);
    }

    return { errors, warnings, tapes: { goal: g.tape, all: a.found ? a.tape : null }, info };
}

/** The course with one part taken away: a device by id, or a tile kind (sponges become plain floor, belts plain floor…). */
function withoutPart(level, need) {
    if ((level.devices || []).some(d => d.id === need)) return { ...level, devices: level.devices.filter(d => d.id !== need) };
    const plain = { T: '#', '>': '#', '<': '#', I: '#', C: '#', '~': '.', R: '.', B: '.', W: '#' };
    if (plain[need] && level.map.some(r => r.includes(need))) return { ...level, map: level.map.map(r => r.split(need).join(plain[need])) };
    const byType = (level.devices || []).filter(d => d.type === need);
    if (byType.length) return { ...level, devices: level.devices.filter(d => d.type !== need) };
    return null;
}

export function lintHub(hub, courses, opts = {}) {
    const errors = [], warnings = [];
    if (!dataLayer(hub, errors, warnings, { hub: true })) return { errors, warnings };
    const L = compile(hub).L;
    const doors = L.dev.portal;
    const ids = new Set(courses.map(c => c.id));
    for (const c of courses) if (!doors.some(d => d.to === c.id)) errors.push(`hub: course ${c.id} has no door`);
    for (const d of doors) if (d.to !== 'soon' && !ids.has(d.to)) errors.push(`hub: door ${d.id} goes to '${d.to}', which isn't a course`);
    const so = { maxStates: opts.maxStates ?? 60000 };
    for (const d of doors) {
        const r = route(hub, [portalTarget(L, d)], so);
        if (!r.found) errors.push(`hub: door ${d.id} can't be reached from the start`);
    }
    // Coming back out of a course puts you at its door: every other door must be reachable from there.
    // From every door you can get back to the start, and from the start to every door: so door to door.
    const home = { at: { x: L.start.x + 0.5, y: L.start.y + 0.5 }, name: 'the start', reached: w => w.s.p.grounded && Math.abs(w.s.p.x + 0.35 - (L.start.x + 0.5)) < 1.2 && Math.abs(w.s.p.y + 0.45 - (L.start.y + 0.5)) < 1 };
    for (const from of doors) {
        const w = compile(hub);
        w.s.p = { ...w.s.p, x: from.x + 0.15, y: from.y + 0.1 };
        const r = route(hub, [home], { ...so, from: w });
        if (!r.found) errors.push(`hub: from door ${from.id} you can't get back to the start (so not to the other doors)`);
    }
    return { errors, warnings };
}
