// ============================================================
// LINT — every level proven before anybody plays it.
//
// Six layers. An ERROR means a player would hit it (a broken link, a jump
// nobody can make, a puzzle any part solves). A WARN is something to look
// at. A level ships with 0 errors and 0 warnings.
//
//   1 data       fields, types, ranges, unique ids, every reference resolves
//   2 layout     map shape, closed border, start/goal on ground, device
//                tiles clear and not shared, lift shafts open, sockets apart
//   3 puzzle     every socket assignment simulated: the intended one works,
//                installing nothing fails, at least one wrong answer fails
//   4 reach      the real solver (with part installs) finishes the level;
//                no reachable state the goal can't be reached from (softlock)
//   5 ghost      the solver's input tape replayed twice on fresh worlds:
//                both win, same frame count, same final state (determinism)
//   6 progress   concepts taught before they're required; every device's
//                concept is taught or required; par is achievable
//
//   lintLevel(level, opts) → { id, problems, stats, tape }
//   lintAll(levels, opts)  → { results, cross }     (+ cross-level checks)
// ============================================================
import { TILE, TILE_CHARS, PART_KINDS, SOCKET_ACCEPTS, CONCEPTS } from './Rules.js';
import { solve, replay } from './Solver.js';
import { compile } from './World.js';

const DEVICE_CONCEPT = { spring: 'spring', lift: 'torque', circuit: 'ohm' };
const isInt = v => Number.isInteger(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

export function lintLevel(level, opts = {}) {
    if (level.kind === 'hub') return lintHub(level, opts);
    const problems = [];
    const err = (layer, what) => problems.push({ level: 'error', layer, what });
    const warn = (layer, what) => problems.push({ level: 'warn', layer, what });
    const stats = {};

    // ── 1. data ─────────────────────────────────────────────────────────────
    for (const f of ['id', 'world', 'name', 'brief']) if (typeof level[f] !== 'string' || !level[f]) err(1, `missing string field "${f}"`);
    if (!isInt(level.order)) err(1, 'order must be an integer');
    for (const f of ['teaches', 'requires', 'map', 'parts', 'devices']) if (!Array.isArray(level[f])) err(1, `"${f}" must be an array`);
    if (typeof level.solution !== 'object' || !level.solution) err(1, '"solution" must be an object (socketId → partId)');
    if (problems.length) return { id: level.id, problems, stats };

    const ids = new Set();
    const parts = {}, devs = {};
    for (const p of level.parts) {
        if (ids.has(p.id)) err(1, `duplicate id "${p.id}"`);
        ids.add(p.id); parts[p.id] = p;
        const spec = PART_KINDS[p.kind];
        if (!spec) { err(1, `part ${p.id}: unknown kind "${p.kind}"`); continue; }
        for (const [k, [lo, hi]] of Object.entries(spec)) {
            if (!isNum(p[k]) || p[k] < lo || p[k] > hi) err(1, `part ${p.id}: ${k}=${p[k]} outside ${lo}–${hi}`);
        }
        if (typeof p.label !== 'string') err(1, `part ${p.id}: needs a label`);
    }
    for (const d of level.devices) {
        if (ids.has(d.id)) err(1, `duplicate id "${d.id}"`);
        ids.add(d.id); devs[d.id] = d;
    }
    const sockOf = (id, kind, who) => {
        const s = devs[id];
        if (!s || s.type !== 'socket') err(1, `${who}: socket "${id}" does not exist`);
        else if (s.accepts !== kind) err(1, `${who}: socket "${id}" accepts ${s.accepts}, needs ${kind}`);
    };
    for (const d of level.devices) {
        const who = `${d.type} ${d.id}`;
        const need = (...fs) => fs.forEach(f => { if (!isNum(d[f])) err(1, `${who}: "${f}" must be a number`); });
        switch (d.type) {
            case 'socket': need('x', 'y'); if (!SOCKET_ACCEPTS[d.accepts]) err(1, `${who}: accepts "${d.accepts}"?`);
                if (d.preset != null && (!parts[d.preset] || parts[d.preset].kind !== d.accepts)) err(1, `${who}: preset "${d.preset}" invalid`);
                break;
            case 'spring': need('x', 'y', 'compress'); sockOf(d.socket, 'spring', who);
                if (d.compress <= 0 || d.compress > 1) err(1, `${who}: compress ${d.compress} m out of range`);
                break;
            case 'lift': need('x', 'w', 'yTop', 'yBottom', 'drumR', 'massKg'); sockOf(d.socket, 'gear', who);
                if (!d.motor || !isNum(d.motor.torque) || !isNum(d.motor.rpm)) err(1, `${who}: motor {torque, rpm} required`);
                if (d.yTop >= d.yBottom) err(1, `${who}: yTop must be above yBottom`);
                break;
            case 'circuit': need('loadR', 'iMin', 'iMax');
                if (d.iMin >= d.iMax) err(1, `${who}: iMin must be < iMax`);
                if (d.volts == null && !d.battery) err(1, `${who}: needs volts or a battery socket`);
                if (d.battery) sockOf(d.battery, 'battery', who);
                for (const s of d.sockets || []) sockOf(s, 'resistor', who);
                if (!(d.drives || []).length) err(1, `${who}: drives nothing`);
                for (const t of d.drives || []) if (!devs[t] || !['door', 'bridge'].includes(devs[t].type)) err(1, `${who}: drives "${t}" — not a door/bridge`);
                break;
            case 'door': need('x', 'y', 'h'); break;
            case 'bridge': need('x', 'y', 'w'); break;
            default: err(1, `device ${d.id}: unknown type "${d.type}"`);
        }
    }
    const usedParts = new Set();
    for (const [sid, pid] of Object.entries(level.solution)) {
        const s = devs[sid];
        if (!s || s.type !== 'socket') { err(1, `solution: "${sid}" is not a socket`); continue; }
        if (pid == null) continue;
        if (!parts[pid]) err(1, `solution: part "${pid}" does not exist`);
        else if (parts[pid].kind !== s.accepts) err(1, `solution: ${pid} (${parts[pid].kind}) can't go in ${sid} (${s.accepts})`);
        if (usedParts.has(pid)) err(1, `solution: ${pid} used twice`);
        usedParts.add(pid);
    }
    const socketsAll = level.devices.filter(d => d.type === 'socket');
    for (const s of socketsAll) if (!s.fixed && !(s.id in level.solution)) err(1, `solution: socket ${s.id} has no intended part`);
    if (problems.some(p => p.level === 'error')) return { id: level.id, problems, stats };

    // ── 2. layout ───────────────────────────────────────────────────────────
    const map = level.map, H = map.length, W = map[0]?.length || 0;
    if (H < 4 || W < 4) err(2, 'map too small');
    map.forEach((row, y) => {
        if (row.length !== W) err(2, `row ${y} is ${row.length} wide, expected ${W}`);
        for (const c of row) if (!TILE_CHARS.has(c)) err(2, `row ${y}: unknown tile "${c}"`);
    });
    if (problems.some(p => p.level === 'error')) return { id: level.id, problems, stats };
    const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? map[y][x] : '#');
    for (let x = 0; x < W; x++) {
        if (map[0][x] !== '#') err(2, `top border open at (${x},0)`);
        if (!'#^'.includes(map[H - 1][x])) err(2, `bottom border open at (${x},${H - 1}) — use # or ^`);
    }
    for (let y = 0; y < H; y++) if (map[y][0] !== '#' || map[y][W - 1] !== '#') err(2, `side border open on row ${y}`);
    const find = c => { const r = []; map.forEach((row, y) => [...row].forEach((ch, x) => ch === c && r.push({ x, y }))); return r; };
    const S = find('S'), G = find('G');
    if (S.length !== 1) err(2, `need exactly one S, found ${S.length}`);
    if (!G.length) err(2, 'no goal G');
    for (const p of [...S, ...G]) {
        if (at(p.x, p.y + 1) !== '#') err(2, `${at(p.x, p.y)} at (${p.x},${p.y}) has no solid floor under it`);
        if (at(p.x, p.y - 1) === '#') err(2, `${at(p.x, p.y)} at (${p.x},${p.y}) has no headroom`);
    }
    const owner = new Map();
    const claim = (x, y, d) => {
        const k = `${x},${y}`;
        if (x < 0 || y < 0 || x >= W || y >= H) { err(2, `${d.type} ${d.id}: tile (${x},${y}) off the map`); return; }
        if (owner.has(k)) err(2, `${d.type} ${d.id} and ${owner.get(k)} share tile (${x},${y})`);
        owner.set(k, `${d.type} ${d.id}`);
        if (map[y][x] !== '.') err(2, `${d.type} ${d.id}: tile (${x},${y}) is "${map[y][x]}", must be "."`);
    };
    for (const d of level.devices) {
        if (d.type === 'spring') for (let i = 0; i < (d.w || 1); i++) claim(d.x + i, d.y, d);
        if (d.type === 'door') {
            for (let i = 0; i < d.h; i++) claim(d.x, d.y + i, d);
            if (at(d.x, d.y - 1) !== '#') warn(2, `door ${d.id}: no solid above — can it be jumped over?`);
            if (at(d.x, d.y + d.h) !== '#') warn(2, `door ${d.id}: no solid below`);
        }
        if (d.type === 'bridge') for (let i = 0; i < d.w; i++) claim(d.x + i, d.y, d);
        if (d.type === 'socket') claim(d.x, d.y, d);
        if (d.type === 'lift') {
            for (let x = d.x; x < d.x + d.w; x++) {
                for (let y = d.yTop - 1; y < d.yBottom; y++) claim(x, y, d);
                if (at(x, d.yBottom) !== '#') err(2, `lift ${d.id}: shaft floor (${x},${d.yBottom}) must be solid`);
            }
        }
    }
    for (let i = 0; i < socketsAll.length; i++) for (let j = i + 1; j < socketsAll.length; j++) {
        const a = socketsAll[i], b = socketsAll[j];
        if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < 2) err(2, `sockets ${a.id} and ${b.id} are touching — the hero would stand in both`);
    }
    if (problems.some(p => p.level === 'error')) return { id: level.id, problems, stats };

    // ── 3. puzzle ───────────────────────────────────────────────────────────
    const free = socketsAll.filter(s => !s.fixed);
    const teachesDevice = level.devices.some(d => DEVICE_CONCEPT[d.type]);
    if (free.length) {
        const assigns = enumerate(free, level.parts, opts.maxAssign ?? 200);
        const table = [];
        for (const a of assigns) {
            const r = solve(level, { locked: a, maxStates: opts.maxStates ?? 20000 });
            table.push({ a, solved: r.solved, capped: r.capped });
        }
        const key = a => free.map(s => `${s.id}=${a[s.id] || '∅'}`).join(' ');
        const sol = table.find(t => free.every(s => (t.a[s.id] || null) === (level.solution[s.id] || null)));
        if (!sol?.solved) err(3, `intended solution (${key(level.solution)}) does not finish the level`);
        const empty = table.find(t => free.every(s => !t.a[s.id]));
        if (teachesDevice && empty?.solved) err(3, 'level can be finished without installing anything — the device is optional');
        const wrong = table.filter(t => t !== sol && t !== empty);
        if (teachesDevice && wrong.length && wrong.every(t => t.solved)) err(3, 'every part choice works — there is no wrong answer to learn from');
        if (teachesDevice && !wrong.length) warn(3, 'only one part fits — there is no choice to make (add a wrong part)');
        const frac = table.filter(t => t.solved).length / table.length;
        if (teachesDevice && frac > 0.5) warn(3, `${Math.round(frac * 100)}% of part choices finish the level — puzzle may be too forgiving`);
        if (table.some(t => t.capped && !t.solved)) warn(3, 'solver hit its state cap on some assignment — result may be incomplete');
        stats.assignments = table.length;
        stats.solvable = table.filter(t => t.solved).map(t => key(t.a));
    }

    // ── 4. reach ────────────────────────────────────────────────────────────
    const full = solve(level, { explore: true, maxStates: level.check?.maxStates ?? opts.maxStates ?? 80000 });
    stats.states = full.graph.nodes.length;
    if (!full.solved) err(4, 'the solver cannot finish the level (with part installs)');
    if (full.capped) warn(4, `state cap hit (${stats.states}) — softlock check incomplete`);
    if (full.solved && !full.capped) {
        const { nodes, edges, goals } = full.graph;
        const rev = nodes.map(() => []);
        for (const [a, b] of edges) rev[b].push(a);
        const can = new Uint8Array(nodes.length);
        const q = [...goals];
        for (const g of goals) can[g] = 1;
        while (q.length) { const n = q.pop(); for (const m of rev[n]) if (!can[m]) { can[m] = 1; q.push(m); } }
        const stuck = [];
        nodes.forEach((n, i) => { if (!can[i]) stuck.push(n.snap.p); });
        if (stuck.length) {
            const tiles = [...new Set(stuck.map(p => `(${Math.floor(p.x + 0.35)},${Math.floor(p.y + 0.9)})`))].slice(0, 6);
            err(4, `softlock: ${stuck.length} reachable state(s) can never reach the goal, e.g. hero at ${tiles.join(' ')}`);
        }
    }

    // ── 5. ghost ────────────────────────────────────────────────────────────
    let tape = null;
    if (full.solved) {
        const fast = solve(level, { maxStates: opts.maxStates ?? 40000 });
        tape = fast.tape;
        const a = replay(level, tape), b = replay(level, tape);
        if (!a.won) err(5, 'replaying the solver tape does not win — engine is not deterministic or state leaks between runs');
        if (a.frames !== b.frames || a.hash !== b.hash) err(5, 'two replays of the same tape diverged — nondeterminism');
        stats.frames = a.frames;
        stats.seconds = +(a.frames / 60).toFixed(2);
        stats.deaths = a.deaths;
    }

    // ── 6. progress (per level; cross-level order is in lintAll) ────────────
    const known = new Set(CONCEPTS.map(c => c.id));
    if (!level.teaches.length) warn(6, 'teaches nothing');
    for (const c of [...level.teaches, ...level.requires]) if (!known.has(c)) err(6, `unknown concept "${c}"`);
    for (const d of level.devices) {
        const c = DEVICE_CONCEPT[d.type];
        if (c && !level.teaches.includes(c) && !level.requires.includes(c)) err(6, `has a ${d.type} but neither teaches nor requires "${c}"`);
    }
    if (level.devices.some(d => d.type === 'circuit') && !level.teaches.includes('fuse') && !level.requires.includes('fuse')) warn(6, 'has a fused circuit but fuses are not taught/required');
    if (level.par?.seconds && stats.seconds && level.par.seconds < stats.seconds * 0.6) warn(6, `par ${level.par.seconds}s looks unreachable (solver route ${stats.seconds}s)`);
    if (level.par?.seconds && stats.seconds && level.par.seconds > stats.seconds * 3) warn(6, `par ${level.par.seconds}s is very generous (solver route ${stats.seconds}s)`);
    if (!level.par?.seconds) warn(6, 'no par time');
    return { id: level.id, problems, stats, tape };
}

/**
 * Hub (Home Base) lint: data, layout, every door reachable from the start,
 * and no reachable spot from which you can't get back to a door. Doors lead to
 * campaign level ids, 'manual' (the field manual) or 'soon' (a locked bay).
 */
export function lintHub(level, opts = {}) {
    const problems = [];
    const err = (layer, what) => problems.push({ level: 'error', layer, what });
    const warn = (layer, what) => problems.push({ level: 'warn', layer, what });
    const stats = {};
    const ids = new Set(opts.campaignIds || []);
    const map = level.map, H = map.length, W = map[0]?.length || 0;
    map.forEach((row, y) => {
        if (row.length !== W) err(2, `row ${y} is ${row.length} wide, expected ${W}`);
        for (const c of row) if (!TILE_CHARS.has(c)) err(2, `row ${y}: unknown tile "${c}"`);
    });
    if (problems.length) return { id: level.id, problems, stats };
    const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? map[y][x] : '#');
    for (let x = 0; x < W; x++) if (map[0][x] !== '#' || !'#^'.includes(map[H - 1][x])) err(2, `border open at column ${x}`);
    for (let y = 0; y < H; y++) if (map[y][0] !== '#' || map[y][W - 1] !== '#') err(2, `side border open on row ${y}`);
    const S = []; map.forEach((r, y) => [...r].forEach((c, x) => c === 'S' && S.push({ x, y })));
    if (S.length !== 1) err(2, `need exactly one S, found ${S.length}`);
    if ((level.parts || []).length) warn(1, 'a hub has no parts');
    const portals = level.devices.filter(d => d.type === 'portal');
    const seen = new Set();
    for (const d of level.devices) {
        if (seen.has(d.id)) err(1, `duplicate id "${d.id}"`);
        seen.add(d.id);
        if (d.type === 'sign') { if (typeof d.text !== 'string' || !isNum(d.x) || !isNum(d.y)) err(1, `sign ${d.id}: needs x, y, text`); continue; }
        if (d.type !== 'portal') { err(1, `${d.type} ${d.id}: a hub only has portals and signs`); continue; }
        if (!isInt(d.x) || !isInt(d.y)) { err(1, `portal ${d.id}: x, y must be integers`); continue; }
        if (!(ids.has(d.to) || d.to === 'manual' || d.to === 'soon')) err(1, `portal ${d.id}: "${d.to}" is not a campaign level, "manual" or "soon"`);
        if (at(d.x, d.y) !== '.' || at(d.x, d.y - 1) !== '.') err(2, `portal ${d.id}: needs two clear tiles (door is 2 tall) at (${d.x},${d.y})`);
        if (at(d.x, d.y + 1) !== '#') err(2, `portal ${d.id}: no solid floor under the door`);
    }
    for (let i = 0; i < portals.length; i++) for (let j = i + 1; j < portals.length; j++) {
        const a = portals[i], b = portals[j];
        if (a.y === b.y && Math.abs(a.x - b.x) < 2) err(2, `doors ${a.id} and ${b.id} are touching`);
    }
    for (const id of ids) if (!portals.some(p => p.to === id)) err(1, `campaign level ${id} has no door in the hub`);
    if (problems.some(p => p.level === 'error')) return { id: level.id, problems, stats };

    // Reach: explore every state; a door counts as reached when the hero stands at it.
    const full = solve(level, { explore: true, maxStates: level.check?.maxStates ?? opts.maxStates ?? 80000 });
    const { nodes, edges } = full.graph;
    stats.states = nodes.length;
    if (full.capped) warn(4, `state cap hit (${nodes.length}) — reach check incomplete`);
    const atDoor = (p, d) => p.grounded && p.x < d.x + 0.8 && p.x + 0.7 > d.x + 0.2 && p.y < d.y + 1 && p.y + 0.9 > d.y;
    const goal = new Uint8Array(nodes.length);
    for (const d of portals) {
        let hit = false;
        nodes.forEach((n, i) => { if (atDoor(n.snap.p, d)) { goal[i] = 1; hit = true; } });
        if (!hit) err(4, `door ${d.id} (→ ${d.to}) can't be reached`);
    }
    if (!full.capped) {
        const rev = nodes.map(() => []);
        for (const [a, b] of edges) rev[b].push(a);
        const can = Uint8Array.from(goal), q = [];
        goal.forEach((g, i) => g && q.push(i));
        while (q.length) { const n = q.pop(); for (const m of rev[n]) if (!can[m]) { can[m] = 1; q.push(m); } }
        const stuck = nodes.filter((n, i) => !can[i]).map(n => `(${Math.floor(n.snap.p.x + 0.35)},${Math.floor(n.snap.p.y + 0.9)})`);
        if (stuck.length) err(4, `softlock: ${stuck.length} state(s) can't get back to any door, e.g. ${[...new Set(stuck)].slice(0, 5).join(' ')}`);
    }
    stats.doors = portals.length;
    return { id: level.id, problems, stats, tape: null };
}

/** All socket assignments (each socket: empty or a compatible part; parts used once). */
export function enumerate(sockets, parts, cap) {
    const out = [];
    const rec = (i, cur, used) => {
        if (out.length >= cap) return;
        if (i === sockets.length) { out.push({ ...cur }); return; }
        const s = sockets[i];
        cur[s.id] = null; rec(i + 1, cur, used);
        for (const p of parts) if (p.kind === s.accepts && !used.has(p.id)) {
            used.add(p.id); cur[s.id] = p.id; rec(i + 1, cur, used); used.delete(p.id);
        }
        delete cur[s.id];
    };
    rec(0, {}, new Set());
    return out;
}

export function lintAll(levels, opts = {}) {
    return { results: levels.map(l => lintLevel(l, opts)), cross: crossCheck(opts.campaign || levels) };
}

/** Campaign-wide checks: unique ids/orders, concepts taught before required. */
export function crossCheck(levels) {
    const cross = [];
    const ids = new Set(), orders = new Set();
    for (const l of levels) {
        if (ids.has(l.id)) cross.push({ level: 'error', layer: 1, what: `duplicate level id ${l.id}` });
        if (orders.has(l.order)) cross.push({ level: 'error', layer: 6, what: `duplicate order ${l.order} (${l.id})` });
        ids.add(l.id); orders.add(l.order);
    }
    const sorted = [...levels].sort((a, b) => a.order - b.order);
    const taught = new Set();
    for (const l of sorted) {
        for (const c of l.requires) if (!taught.has(c)) cross.push({ level: 'error', layer: 6, what: `${l.id} requires "${c}" before any level teaches it` });
        for (const c of l.teaches) taught.add(c);
    }
    return cross;
}

export { compile };
