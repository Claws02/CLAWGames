// ============================================================
// TINY PLANET — the rules. No DOM, no three.js: the screen (Planet.js) draws
// what this says, and the probes play it in Node.
//
// A crab on a very small planet, building a CITY OF CRABS. Every hut is a
// home (1 crab; upgraded, 2 then 3), and the number of crabs is the score.
// Reaching 5, 10, 20, 35 and 50 crabs makes the camp a VILLAGE, a TOWN, a
// CITY, a METROPOLIS and the CRAB CAPITAL: each step grows the planet and
// opens something new (TOWNS).
//
// By DAY: walk about picking up shells, plant palms (coconuts), build huts,
// bubble towers and markets. The ACTION button does whatever is to hand:
// shake a palm, mend a crack, make a home bigger, pick up a rock (then throw
// it at a falling star). A boardwalk COURSE appears each day: walk its planks,
// JUMP its gaps, and there's a chest at the end; fall off and nothing is lost.
// By NIGHT: shooting stars fall on the city. Stand where one lands and the
// crab catches it; be in the air (JUMP) as it lands for a PERFECT catch worth
// double. A tower's bubble soaks up a few; the rest flatten palms and crack
// homes. The city is lost when the last home goes.
//
// Everything lives on the unit sphere: a place is a unit vector, and a
// distance along the ground is the angle between two places times the
// planet's radius R. So when the planet grows, everything keeps its place
// and the walks between get longer.
//
//   create({ rnd, up })           a new island (up: upgrade levels, see UPGRADES)
//   step(s, dt, { x, y })         advance; the stick is screen-relative. → events
//   jump(s)                       hop
//   canBuild(s, kind) / build     'palm' | 'hut' | 'tower' | 'market', where the crab stands
//   context(s) / act(s)           what the action button would do here, and doing it
//   goal(s)                       the line the tracker shows
//   stardust(s)                   what a finished run pays into the workshop
//   save(s) / load(o, rnd)        a run as plain data, and back
//   autopilot(s)                  a sensible player: { x, y, build, act, jump }
// ============================================================

// ── Vectors (plain arrays) ──────────────────────────────────────────────────
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix = (a, b, ka, kb) => [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
/** The angle between two places (radians). */
export const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
/** A tangent at p pointing as nearly along v as the ground allows. */
export const tangent = (p, v) => { const t = mix(v, p, 1, -dot(v, p)); return Math.hypot(t[0], t[1], t[2]) < 1e-6 ? norm(cross(p, [p[1], p[2], p[0] + 0.5])) : norm(t); };
/** The tangent at a that heads for b. */
export const toward = (a, b) => tangent(a, b);
/** Walk from p along tangent d by an angle. */
export const walk = (p, d, a) => norm(mix(p, d, Math.cos(a), Math.sin(a)));

// ── Tuning (seconds and world units) ────────────────────────────────────────
export const R0 = 5.5, R_MAX = 12, GROW = 1.16;
export const DAY_S = 30, NIGHT_S = 16;
export const SPEED = 4.2, COLLECT = 0.8, SPACE = 1.75, NEAR = 1.3;
/** The city's steps: the crabs it takes, and what each opens. */
export const TOWNS = [
    { pop: 1, name: 'CAMP', icon: '⛺', opens: '' },
    { pop: 5, name: 'VILLAGE', icon: '🏘️', opens: '🔮 BUBBLE TOWERS' },
    { pop: 10, name: 'TOWN', icon: '🏠', opens: '🏠 BIG HOMES (3 CRABS)' },
    { pop: 20, name: 'CITY', icon: '🏙️', opens: '🏪 MARKETS' },
    { pop: 35, name: 'METROPOLIS', icon: '🌆', opens: '🔮 STRONGER BUBBLES' },
    { pop: 50, name: 'CRAB CAPITAL', icon: '👑', opens: '' },
];
const NEEDS = { tower: 1, market: 3 };          // the town level a building waits for
// What the first of each costs; every one you already have adds STEP to the next.
export const COST = { palm: { shells: 4, nuts: 0 }, hut: { shells: 8, nuts: 3 }, tower: { shells: 10, nuts: 4 }, market: { shells: 20, nuts: 8 } };
export const STEP = { palm: { shells: 1, nuts: 0 }, hut: { shells: 3, nuts: 1 }, tower: { shells: 4, nuts: 1 }, market: { shells: 15, nuts: 5 } };
/** Making a home bigger: from 1 crab to 2, and (in a TOWN) from 2 to 3. */
export const BIGGER = [null, { shells: 6, nuts: 2 }, { shells: 12, nuts: 4 }];
export const BIGGER_STEP = { shells: 2, nuts: 1 };   // added for every home already that big
export const REPAIR = 3;
export const HP = { palm: 1, hut: 3, tower: 2, market: 2 };
export const PALM_GROW_S = 16, NUT_S = 10, NUTS_OUT = 2, HUT_S = 14, SHAKE_CD = 7, MARKET_S = 12, MARKET_PAY = 4;   // homes pay their size in shells every HUT_S; a market pays MARKET_PAY every MARKET_S
export const TOWER_R = 3.2, TOWER_CHARGES = 3;
export const STAR_R = 1.25, BIG_R = 2.1, CATCH_CD = 0.5, STAR_PAY = 2, GOLD = 5;
export const SPAWN_S = 1.7, ROCK_S = 8;
export const JUMP_S = 0.6, JUMP_CD = 0.12, THROW_R = 7.5;
export const COURSE_W = 0.62, COURSE_STEP = 1.6;
/** Boardwalk obstacles. A sweeper's bar is over its plank for `low`/`tall` of every `period`. */
export const SWEEP = { period: 2.3, low: 0.32, tall: 0.38 };
export const CRUMBLE_S = 0.55, CRUMBLE_BACK = 2.2, SPRING_AIR = 1.4, JUMP_BUFFER = 0.15;
/** How hard a boardwalk is, and what it pays on top of its shells. */
export const TIERS = [null, { name: 'EASY', icon: '🌶️', dust: 0 }, { name: 'TRICKY', icon: '🌶️🌶️', dust: 3 }, { name: 'FIENDISH', icon: '🌶️🌶️🌶️', dust: 8 }];
export const TOWER_SPACE = 0.95;                 // a tower fits right beside a building

/** The workshop: what stardust buys, kept between runs. */
export const UPGRADES = [
    { id: 'speed',  icon: '🦀', name: 'Quick Claws',  max: 5, how: 'Walk 6% faster.' },
    { id: 'start',  icon: '🐚', name: 'Head Start',   max: 5, how: 'Begin with 3 more shells.' },
    { id: 'green',  icon: '🌴', name: 'Green Thumb',  max: 5, how: 'Palms grow and fruit 10% faster.' },
    { id: 'reach',  icon: '🌠', name: 'Long Reach',   max: 5, how: 'Catch stars from 8% further off.' },
    { id: 'sturdy', icon: '🛖', name: 'Sturdy Homes', max: 3, how: 'Homes take one more hit.' },
    { id: 'lucky',  icon: '✨', name: 'Lucky Tides',  max: 5, how: 'More golden shells wash up.' },
];
export const upgradeCost = level => [10, 20, 35, 55, 80][level] ?? null;

const lv = (s, id) => (s.up && s.up[id]) || 0;
export const speedOf = s => SPEED * (1 + 0.06 * lv(s, 'speed'));
export const reachOf = s => 1 + 0.08 * lv(s, 'reach');
export const hutHp = s => HP.hut + lv(s, 'sturdy');
const greenOf = s => 1 + 0.1 * lv(s, 'green');
export const maxHp = (s, kind) => (kind === 'hut' ? hutHp(s) : HP[kind]);
export const chargesOf = s => TOWER_CHARGES + (s.town >= 4 ? 2 : 0);
/** Ground distance between two places on this planet. */
export const dist = (s, a, b) => angle(a, b) * s.R;

/** How many stars fall on a night, and how long each takes to land. */
export const starsFor = day => 1 + Math.floor(day * 1.2 + day * day * 0.07);
export const fallFor = day => Math.max(1.7, 3.2 - day * 0.06);
/** Every fifth night brings the big ones (they can't be caught): one, then two, ... */
export const bigFor = day => (day % 5 === 0 ? day / 5 : 0);
export const shellCap = s => Math.round(4 + s.R * 0.9);
export const rockCap = s => 2 + Math.min(3, s.town);

function _rndPlace(s) {
    const z = s.rnd() * 2 - 1, a = s.rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), z, r * Math.sin(a)];
}

export function create({ rnd = Math.random, up = {} } = {}) {
    const s = {
        rnd, up, t: 0, day: 1, phase: 'day', pt: 0, R: R0, town: 0, over: false, id: 1,
        crab: { p: [0, 1, 0], f: [0, 0, -1], face: [0, 0, -1], moving: false, cd: 0, air: 0, jcd: 0, jbuf: 0, carry: null },
        shells: 4 + 3 * ((up && up.start) || 0), nuts: 0,
        items: [], builds: [], stars: [], due: [], spawnT: 0.4, rockT: 3, course: null, trickArmed: true,
        stats: { caught: 0, perfect: 0, smashed: 0, built: 0, shells: 0, nuts: 0, peak: 1, lost: 0, walked: 0, palms: 0, huts: 0, courses: 0, dust: 0 },
    };
    // The first home, a few steps in front of the crab, and some shells to find.
    _add(s, 'hut', walk(s.crab.p, s.crab.f, 2.2 / s.R));
    // The Trick Hut is there from the start, behind the crab: walk in for the Coconut Trials.
    _add(s, 'trick', walk(s.crab.p, s.crab.f, -3.4 / s.R));
    for (let i = 0; i < 4; i++) _spawnShell(s);
    _newCourse(s);
    return s;
}

/** A run as plain data (for a save), and back again. */
export const save = s => { const { rnd, ...o } = s; return JSON.parse(JSON.stringify(o)); };
export function load(o, rnd = Math.random) {
    const s = { ...JSON.parse(JSON.stringify(o)), rnd };
    // (a city saved before the Trick Hut existed gets one, somewhere clear)
    if (!s.builds.some(b => b.kind === 'trick')) for (let k = 0; k < 40; k++) { const p = _rndPlace(s); if (_clear(s, p, SPACE) && dist(s, p, s.crab.p) > 3) { _add(s, 'trick', p); break; } }
    if (s.course && !s.course.segs) _newCourse(s);          // (and a boardwalk from before they had obstacles is re-laid)
    return s;
}

function _add(s, kind, p) {
    const b = { id: s.id++, kind, p, hp: maxHp(s, kind), lvl: 1, age: kind === 'palm' ? 0 : 99, t: kind === 'hut' ? HUT_S : NUT_S / greenOf(s), shake: 0, charges: chargesOf(s) };
    s.builds.push(b);
    return b;
}
/** The crabs in the city: every home counts its level. */
export const pop = s => s.builds.reduce((n, b) => n + (b.kind === 'hut' ? b.lvl : 0), 0);
export const grown = (s, b) => b.kind !== 'palm' || b.age >= PALM_GROW_S / greenOf(s);
export const unlocked = (s, kind) => s.town >= (NEEDS[kind] || 0);
/** How big a home can be made for now. */
export const maxLvl = s => (s.town >= 2 ? 3 : 2);
export const nextTown = s => TOWNS[s.town + 1] || null;
/** What it costs to make home b one bigger: { shells, nuts }. */
export function biggerCost(s, b) {
    const n = s.builds.filter(x => x.kind === 'hut' && x.lvl > b.lvl).length;
    return { shells: BIGGER[b.lvl].shells + BIGGER_STEP.shells * n, nuts: BIGGER[b.lvl].nuts + BIGGER_STEP.nuts * n };
}

function _clear(s, p, d) { return !s.builds.some(b => dist(s, b.p, p) < d) && !(s.course && s.course.pts.some(q => dist(s, q, p) < d)); }
function _spawnShell(s) {
    for (let k = 0; k < 8; k++) {
        const p = _rndPlace(s);
        if (!_clear(s, p, 1) || dist(s, s.crab.p, p) < 1.5) continue;
        const gold = s.rnd() < 0.04 + 0.025 * lv(s, 'lucky');
        s.items.push({ id: s.id++, kind: gold ? 'gold' : 'shell', p });
        return;
    }
}
function _spawnRock(s) {
    for (let k = 0; k < 8; k++) {
        const p = _rndPlace(s);
        if (!_clear(s, p, 1.2) || dist(s, s.crab.p, p) < 2) continue;
        s.items.push({ id: s.id++, kind: 'rock', p });
        return;
    }
}

// The city grows a step: the planet with it.
function _townCheck(s, ev) {
    const n = pop(s);
    s.stats.peak = Math.max(s.stats.peak, n);
    while (TOWNS[s.town + 1] && n >= TOWNS[s.town + 1].pop) {
        s.town++;
        s.R = Math.min(R_MAX, s.R * GROW);
        if (s.town === 4) s.builds.forEach(b => { if (b.kind === 'tower') b.charges = chargesOf(s); });
        if (s.course && s.course.k < 0) _newCourse(s, s.course.tier);      // re-laid for the bigger planet
        ev.push({ type: 'town', town: s.town, ...TOWNS[s.town], R: s.R });
    }
}

// ── Building ────────────────────────────────────────────────────────────────
/** What the next `kind` costs: { shells, nuts }. */
export function costOf(s, kind) {
    const n = s.builds.filter(b => b.kind === kind).length;
    return { shells: COST[kind].shells + STEP[kind].shells * n, nuts: COST[kind].nuts + STEP[kind].nuts * n };
}
/** { ok, why }: can `kind` go up where the crab stands? why: 'locked' | 'cost' | 'space'. */
export function canBuild(s, kind) {
    if (!COST[kind] || s.over) return { ok: false, why: '' };
    if (!unlocked(s, kind)) return { ok: false, why: 'locked' };
    const c = costOf(s, kind);
    if (s.shells < c.shells || s.nuts < c.nuts) return { ok: false, why: 'cost' };
    // (a tower fits snugly beside a building; everything else wants room)
    const room = b => (kind === 'tower' || b.kind === 'tower' ? TOWER_SPACE : SPACE);
    if (s.builds.some(b => dist(s, b.p, s.crab.p) < room(b)) || (s.course && s.course.pts.some(q => dist(s, q, s.crab.p) < 1.3)) || s.crab.air > 0) return { ok: false, why: 'space' };
    return { ok: true, why: '' };
}
/** Build it. `ev` (optional) collects what follows, such as the town growing. */
export function build(s, kind, ev = []) {
    if (!canBuild(s, kind).ok) return null;
    const c = costOf(s, kind);
    s.shells -= c.shells; s.nuts -= c.nuts;
    const b = _add(s, kind, s.crab.p.slice());
    s.stats.built++; if (kind === 'palm') s.stats.palms++; if (kind === 'hut') s.stats.huts++;
    _townCheck(s, ev);
    return b;
}
/** A cracked home, tower or market within reach, or null. */
export const repairable = s => s.builds.find(b => b.kind !== 'palm' && b.hp < maxHp(s, b.kind) && dist(s, b.p, s.crab.p) < NEAR + 0.6) || null;
export function repair(s) {
    const b = repairable(s);
    if (!b || s.shells < REPAIR || s.over) return null;
    s.shells -= REPAIR; b.hp = maxHp(s, b.kind);
    return b;
}

// ── Jump, and the action button ─────────────────────────────────────────────
export function jump(s) {
    const c = s.crab;
    if (s.over) return false;
    // (pressed a moment early: remembered, and it jumps as soon as it lands)
    if (c.air > 0 || c.jcd > 0) { c.jbuf = JUMP_BUFFER; return false; }
    c.air = JUMP_S; c.jbuf = 0;
    return true;
}
/** The star a thrown rock would hit: the one landing soonest within range. */
export const throwTarget = s => s.stars.filter(st => dist(s, st.p, s.crab.p) < THROW_R).sort((a, b) => (a.T - a.t) - (b.T - b.t))[0] || null;

/**
 * What the action button does here, or null: { kind, icon, label, ok, cost?, b?, item? }.
 * kind: 'throw' | 'mend' | 'carry' | 'shake' | 'bigger'.
 */
export function context(s) {
    const c = s.crab;
    if (s.over) return null;
    if (c.carry) return { kind: 'throw', icon: '🪨', label: throwTarget(s) ? 'THROW!' : 'DROP', ok: true };
    const fix = repairable(s);
    if (fix) return { kind: 'mend', icon: '🔧', label: `MEND ${REPAIR}🐚`, ok: s.shells >= REPAIR, b: fix };
    const rock = s.items.find(i => i.kind === 'rock' && dist(s, i.p, c.p) < 1.15);
    if (rock) return { kind: 'carry', icon: '🪨', label: 'PICK UP', ok: true, item: rock };
    const near = (kind, d) => s.builds.filter(b => b.kind === kind && dist(s, b.p, c.p) < d).sort((a, b) => dist(s, a.p, c.p) - dist(s, b.p, c.p));
    const palm = near('palm', 1.5).find(b => grown(s, b) && b.shake <= 0);
    if (palm) return { kind: 'shake', icon: '🌴', label: 'SHAKE', ok: true, b: palm };
    const hut = near('hut', 1.9).find(b => b.lvl < maxLvl(s));
    if (hut) { const cost = biggerCost(s, hut); return { kind: 'bigger', icon: '🏠', label: `GROW ${cost.shells}🐚 ${cost.nuts}🥥`, ok: s.shells >= cost.shells && s.nuts >= cost.nuts, cost, b: hut }; }
    return null;
}
/** Press the action button. → the event it made (also pushed to `ev`), or null. */
export function act(s, ev = []) {
    const x = context(s), c = s.crab;
    if (!x || !x.ok) return null;
    let e = null;
    if (x.kind === 'throw') {
        const st = throwTarget(s);
        c.carry = null;
        if (st) {
            s.stars.splice(s.stars.indexOf(st), 1);
            const pay = st.big ? 3 : 1; s.shells += pay; s.stats.smashed++;
            e = { type: 'smash', star: st, p: st.p, big: st.big, pay };
        } else {
            const it = { id: s.id++, kind: 'rock', p: walk(c.p, c.face, 1.6 / s.R) };
            s.items.push(it); e = { type: 'drop', item: it };
        }
    } else if (x.kind === 'mend') { repair(s); e = { type: 'mend', b: x.b }; }
    else if (x.kind === 'carry') { s.items.splice(s.items.indexOf(x.item), 1); c.carry = 'rock'; e = { type: 'carry', item: x.item }; }
    else if (x.kind === 'shake') {
        x.b.shake = SHAKE_CD;
        const it = { id: s.id++, kind: 'nut', from: x.b.id, p: walk(x.b.p, toward(x.b.p, c.p), 0.7 / s.R) };
        s.items.push(it); e = { type: 'shake', b: x.b, item: it };
    } else if (x.kind === 'bigger') {
        s.shells -= x.cost.shells; s.nuts -= x.cost.nuts; x.b.lvl++; x.b.hp = maxHp(s, 'hut');
        e = { type: 'bigger', b: x.b, lvl: x.b.lvl };
    }
    if (e) ev.push(e);
    _townCheck(s, ev);
    return e;
}

// ── The boardwalk course ────────────────────────────────────────────────────
// A bendy line of planks to a chest, one at a time, a new one each dawn once
// the last is done. Between each plank and the next is a stretch (`segs`):
//
//   plank    just a bridge
//   gap      nothing: JUMP it
//   low      a low bar sweeps across: JUMP it, or wait for it to pass
//   tall     a tall log swings across: it can't be jumped, so time your run
//   crumble  the bridge drops away a moment after you step on it: don't stop
//   spring   a bridge with a spring at its far end, and `void`s beyond it that
//            only the spring's long hop clears
//
// Built the way good courses are: each kind is met on its own first, with a
// plain plank to stand on before it, then they come closer together; a
// checkpoint flag follows every few obstacles. Falling to an obstacle puts
// you back at the last flag; stepping off the side just puts you on the
// ground, so a course can always be left.
const _COURSES = {
    1: [['plank', 'gap', 'plank', 'low', 'plank'], []],
    2: [['plank', 'gap', 'plank', 'low', 'plank', 'tall', 'plank', 'crumble', 'gap', 'plank'], [5]],
    3: [['plank', 'gap', 'plank', 'tall', 'plank', 'crumble', 'low', 'plank', 'spring', 'void', 'void', 'void', 'plank', 'tall', 'crumble', 'gap', 'plank'], [5, 13]],
};
/** Lay a course of this tier (default: by how big the city is). */
export function _newCourse(s, tier = null) {
    if (!tier) { const r = s.rnd(); tier = s.day <= 1 || s.town < 1 ? 1 : s.town < 2 ? (r < 0.5 ? 1 : 2) : r < 0.3 ? 1 : r < 0.7 ? 2 : 3; }
    const [kinds, checks] = _COURSES[tier], segs = kinds.slice(), n = segs.length + 1;
    // (the two opening obstacles come in either order)
    if (s.rnd() < 0.5) { const a = segs.indexOf('gap'), b = segs.indexOf(tier === 3 ? 'tall' : 'low'); [segs[a], segs[b]] = [segs[b], segs[a]]; }
    for (let k = 0; k < 60; k++) {
        let p = _rndPlace(s), d = tangent(p, _rndPlace(s));
        if (dist(s, p, s.crab.p) < 2.5) continue;
        const pts = [p], bend = n > 12 ? 0.5 : 0.9;
        for (let i = 1; i < n; i++) {
            const a = segs[i - 1] === 'void' || segs[i - 1] === 'spring' ? 0 : (s.rnd() - 0.5) * bend;   // the spring's hop is dead straight
            d = norm(mix(d, cross(p, d), Math.cos(a), Math.sin(a)));
            const q = walk(p, d, COURSE_STEP / s.R);
            d = tangent(q, d); p = q; pts.push(q);
        }
        if (pts.some(q => s.builds.some(b => dist(s, b.p, q) < SPACE))) continue;
        if (pts.some((q, i) => pts.some((r, j) => j > i + 1 && dist(s, q, r) < COURSE_STEP * 0.95))) continue;   // it mustn't cross itself
        s.course = { id: s.id++, tier, pts, segs, checks, off: segs.map((_, i) => (i * 0.37) % 1), k: -1, got: 0, cp: 0, t: 0, cr: {}, done: false,
            prize: 4 + 5 * tier + 2 * s.town, dust: TIERS[tier].dust };
        return s.course;
    }
    s.course = null;
    return null;
}
/** Is the sweeper on stretch i over its plank right now? (0..1: how far through its pass, else -1) */
export function sweeping(co, i) {
    const kind = co.segs[i]; if (kind !== 'low' && kind !== 'tall') return -1;
    const ph = (co.t / SWEEP.period + co.off[i]) % 1, f = SWEEP[kind];
    return ph < f ? ph / f : -1;
}
/** Has stretch i crumbled away? */
export const crumbled = (co, i) => co.cr[i] != null && co.cr[i] > CRUMBLE_S;
function _courseStep(s, ev, dt = 0) {
    const co = s.course, c = s.crab;
    if (!co || co.done) return;
    co.t += dt;
    for (const i of Object.keys(co.cr)) { co.cr[i] += dt; if (co.cr[i] > CRUMBLE_S + CRUMBLE_BACK) delete co.cr[i]; }
    if (co.k < 0) {
        // Step on at the start, or at the last flag reached.
        const at = [co.cp, 0].find(i => dist(s, c.p, co.pts[i]) < 0.6);
        if (at != null) { co.k = at; ev.push({ type: 'on', course: co, at }); }
        return;
    }
    const k = co.k, kind = co.segs[k], a = co.pts[k], b = co.pts[k + 1], ab = mix(b, a, 1, -1), ac = mix(c.p, a, 1, -1);
    const t = Math.max(0, Math.min(1, dot(ac, ab) / dot(ab, ab))), q = mix(a, ab, 1, t), off = Math.hypot(c.p[0] - q[0], c.p[1] - q[1], c.p[2] - q[2]) * s.R;
    // Off the side: down on the ground, free to walk away.
    if (off > COURSE_W) { co.k = -1; ev.push({ type: 'fell', course: co, why: 'side' }); return; }
    const mid = t > 0.27 && t < 0.73, air = c.air > 0;
    if (kind === 'crumble' && t > 0.08 && co.cr[k] == null) { co.cr[k] = 0; ev.push({ type: 'crack', course: co, i: k }); }
    const sw = sweeping(co, k);
    const why = (kind === 'gap' || kind === 'void') && mid && !air ? 'gap'
        : kind === 'crumble' && crumbled(co, k) && mid && !air ? 'crumble'
        : sw >= 0 && t > 0.2 && t < 0.8 && (kind === 'tall' || !air) ? 'sweep' : null;
    if (why) {
        // Back to the last flag (or the start), up on the planks again.
        c.p = co.pts[co.cp].slice(); c.f = tangent(c.p, c.f); c.face = tangent(c.p, toward(c.p, co.pts[co.cp + 1])); c.air = 0; c.jbuf = 0;
        co.k = co.cp; co.cr = {};
        ev.push({ type: 'fell', course: co, why, at: co.cp });
        return;
    }
    if (dist(s, c.p, b) < 0.5 || t >= 0.97) {
        co.k++;
        if (co.k > co.got) { co.got = co.k; s.shells++; s.stats.shells++; ev.push({ type: 'coin', p: b, course: co }); }
        if (kind === 'spring') { c.air = SPRING_AIR; c.jbuf = 0; ev.push({ type: 'spring', p: b }); }
        if (co.checks.includes(co.k) && co.k > co.cp) { co.cp = co.k; ev.push({ type: 'check', p: b, course: co }); }
        if (co.k === co.pts.length - 1) {
            co.done = true; co.k = -1;
            s.shells += co.prize; s.stats.shells += co.prize; s.stats.courses++; s.stats.dust = (s.stats.dust || 0) + co.dust;
            ev.push({ type: 'chest', p: b, prize: co.prize, dust: co.dust, course: co });
        }
    }
}
/** True while the crab is up on the planks. */
export const onCourse = s => !!(s.course && s.course.k >= 0);

// ── The night sky ───────────────────────────────────────────────────────────
function _nightfall(s, ev) {
    s.phase = 'night'; s.pt = 0;
    const n = starsFor(s.day), span = NIGHT_S - 4;
    s.due = [];
    for (let i = 0; i < n; i++) s.due.push({ at: 0.8 + (span * (i + s.rnd() * 0.6)) / n, big: false });
    const big = bigFor(s.day);
    for (let i = 0; i < big; i++) s.due.push({ at: span * (0.35 + (0.5 * (i + 0.5)) / big), big: true });
    s.due.sort((a, b) => a.at - b.at);
    ev.push({ type: 'night', stars: n, big });
}

function _launch(s, d, ev) {
    // Mostly at something you built; sometimes anywhere, so the sky feels wild.
    let p;
    const mine = s.builds.filter(b => b.kind !== 'trick');
    if (mine.length && s.rnd() < 0.68) {
        const b = mine[Math.floor(s.rnd() * mine.length)];
        p = walk(b.p, tangent(b.p, _rndPlace(s)), (s.rnd() * 0.9) / s.R);
    } else p = _rndPlace(s);
    const st = { id: s.id++, p, t: 0, T: fallFor(s.day) + (d.big ? 1.6 : 0), r: d.big ? BIG_R : STAR_R, big: d.big };
    s.stars.push(st);
    ev.push({ type: 'star', star: st });
}

function _land(s, st, ev) {
    // A tower's bubble takes it, if one covers the spot and has a charge left.
    const tw = s.builds.filter(b => b.kind === 'tower' && b.charges > 0 && dist(s, b.p, st.p) < TOWER_R).sort((a, b) => dist(s, a.p, st.p) - dist(s, b.p, st.p))[0];
    if (tw) { tw.charges = Math.max(0, tw.charges - (st.big ? 2 : 1)); ev.push({ type: 'shield', p: st.p, tower: tw, big: st.big }); return; }
    // The crab under an ordinary star catches it; in the air, it's a perfect catch.
    if (!st.big && s.crab.cd <= 0 && dist(s, s.crab.p, st.p) < st.r * reachOf(s)) {
        const perfect = s.crab.air > 0, pay = STAR_PAY * (perfect ? 2 : 1);
        s.crab.cd = CATCH_CD; s.shells += pay; s.stats.caught++; if (perfect) s.stats.perfect++;
        ev.push({ type: 'catch', p: st.p, pay, perfect });
        return;
    }
    const hit = [];
    for (const b of s.builds.slice()) {
        if (b.kind === 'trick' || dist(s, b.p, st.p) > st.r) continue;      // (the Trick Hut is star-proof)
        b.hp -= st.big ? 2 : 1;
        if (b.hp <= 0) { s.builds.splice(s.builds.indexOf(b), 1); s.stats.lost++; hit.push({ b, gone: true }); }
        else hit.push({ b, gone: false });
    }
    s.items = s.items.filter(i => i.kind === 'rock' || dist(s, i.p, st.p) > st.r);
    let ouch = 0;
    if (dist(s, s.crab.p, st.p) < st.r) { ouch = Math.min(3, s.shells); s.shells -= ouch; }
    ev.push({ type: 'impact', p: st.p, r: st.r, big: st.big, hit, ouch });
    if (!pop(s)) { s.over = true; ev.push({ type: 'over', day: s.day }); }
}

function _dawn(s, ev) {
    s.day++; s.phase = 'day'; s.pt = 0;
    s.builds.forEach(b => { if (b.kind === 'tower') b.charges = chargesOf(s); });
    const n = pop(s), market = s.builds.filter(b => b.kind === 'market').length * Math.floor(n / 3), gift = n + market;
    s.shells += gift;
    if (!s.course || s.course.done) _newCourse(s);
    ev.push({ type: 'dawn', day: s.day, gift, market });
}

// ── One step ────────────────────────────────────────────────────────────────
/** Advance by dt. The stick: x right, y forward (up the screen), each −1..1. → events. */
export function step(s, dt, stick = { x: 0, y: 0 }) {
    const ev = [];
    if (s.over) return ev;
    s.t += dt; s.pt += dt;
    const c = s.crab;
    c.cd = Math.max(0, c.cd - dt); c.jcd = Math.max(0, c.jcd - dt);
    c.jbuf = Math.max(0, (c.jbuf || 0) - dt);
    if (c.air > 0) { c.air = Math.max(0, c.air - dt); if (c.air === 0) { ev.push({ type: 'landed' }); if (c.jbuf > 0) { c.air = JUMP_S; c.jbuf = 0; ev.push({ type: 'rejump' }); } else c.jcd = JUMP_CD; } }

    // The crab. The camera's forward (f) is carried along with it, so the
    // stick always means "that way on the screen".
    const m = Math.min(1, Math.hypot(stick.x, stick.y));
    c.moving = m > 0.12;
    if (c.moving) {
        const right = cross(c.f, c.p);
        const d = norm(mix(right, c.f, stick.x, stick.y)), a = (speedOf(s) * m * dt) / s.R;
        c.p = walk(c.p, d, a);
        c.f = tangent(c.p, c.f);
        c.face = tangent(c.p, d);
        s.stats.walked += a * s.R;
    }
    _courseStep(s, ev, dt);
    // Walking into the Trick Hut (once per visit: step well away to go in again).
    const th = s.builds.find(b => b.kind === 'trick');
    if (th) { const d = dist(s, th.p, c.p); if (!s.trickArmed) { if (d > 2.4) s.trickArmed = true; } else if (d < 1.05 && c.air <= 0) { s.trickArmed = false; ev.push({ type: 'trick', b: th }); } }

    // Pick up whatever it walks over (rocks wait for the action button).
    for (let i = s.items.length - 1; i >= 0; i--) {
        const it = s.items[i];
        if (it.kind === 'rock' || dist(s, it.p, c.p) > COLLECT) continue;
        s.items.splice(i, 1);
        if (it.kind === 'nut') { s.nuts++; s.stats.nuts++; }
        else { const n = it.kind === 'gold' ? GOLD : 1; s.shells += n; s.stats.shells += n; }
        ev.push({ type: 'pick', item: it });
    }

    // Shells and rocks turn up; palms grow and drop coconuts; the crabs at home bring shells.
    s.spawnT -= dt;
    if (s.spawnT <= 0) { s.spawnT = SPAWN_S; if (s.items.filter(i => i.kind === 'shell' || i.kind === 'gold').length < shellCap(s)) _spawnShell(s); }
    s.rockT -= dt;
    if (s.rockT <= 0) { s.rockT = ROCK_S; if (s.items.filter(i => i.kind === 'rock').length + (c.carry ? 1 : 0) < rockCap(s)) _spawnRock(s); }
    for (const b of s.builds) {
        if (b.kind === 'palm') {
            const was = grown(s, b);
            b.age += dt; b.shake = Math.max(0, b.shake - dt);
            if (!was && grown(s, b)) ev.push({ type: 'grown', b });
            if (!grown(s, b)) continue;
            b.t -= dt;
            if (b.t <= 0) {
                b.t = NUT_S / greenOf(s);
                if (s.items.filter(i => i.kind === 'nut' && i.from === b.id).length < NUTS_OUT) {
                    const it = { id: s.id++, kind: 'nut', from: b.id, p: walk(b.p, tangent(b.p, _rndPlace(s)), (0.75 + s.rnd() * 0.35) / s.R) };
                    s.items.push(it); ev.push({ type: 'nut', b, item: it });
                }
            }
        } else if (b.kind === 'hut') {
            b.t -= dt;
            if (b.t <= 0) { b.t = HUT_S; s.shells += b.lvl; ev.push({ type: 'gift', b, pay: b.lvl }); }       // (a bigger home brings more)
        } else if (b.kind === 'market') {
            b.t -= dt;
            if (b.t <= 0) { b.t = MARKET_S; s.shells += MARKET_PAY; ev.push({ type: 'gift', b, pay: MARKET_PAY }); }
        }
    }

    // Day into night, the stars, and night into day.
    if (s.phase === 'day') { if (s.pt >= DAY_S) _nightfall(s, ev); }
    else {
        while (s.due.length && s.due[0].at <= s.pt) _launch(s, s.due.shift(), ev);
        for (const st of s.stars.slice()) {
            st.t += dt;
            if (st.t < st.T) continue;
            s.stars.splice(s.stars.indexOf(st), 1);
            _land(s, st, ev);
            if (s.over) return ev;
        }
        if (s.pt >= NIGHT_S && !s.due.length && !s.stars.length) _dawn(s, ev);
    }
    return ev;
}

/** The tracker's line: the first steps one at a time, then the next size of city. */
export function goal(s) {
    const st = s.stats, n = pop(s), next = nextTown(s);
    if (st.walked < 3) return { tut: true, text: 'DRAG THE LEFT HALF TO WALK · THE RIGHT TO LOOK' };
    if (!st.palms && s.shells < costOf(s, 'palm').shells) return { tut: true, text: `PICK UP SHELLS 🐚 ${s.shells}/${costOf(s, 'palm').shells}` };
    if (!st.palms) return { tut: true, text: 'TAP 🌴 TO PLANT A PALM' };
    if (!st.huts && s.nuts < costOf(s, 'hut').nuts) return { tut: true, text: `COLLECT COCONUTS 🥥 ${s.nuts}/${costOf(s, 'hut').nuts} · ✋ SHAKES A PALM` };
    if (!st.huts && s.shells < costOf(s, 'hut').shells) return { tut: true, text: `SAVE SHELLS FOR A HOME 🐚 ${s.shells}/${costOf(s, 'hut').shells}` };
    if (!st.huts) return { tut: true, text: 'TAP 🛖 TO BUILD A HOME: +1 CRAB' };
    if (!st.caught && s.phase === 'night') return { tut: true, text: 'STAND IN A RING TO CATCH THE STAR · JUMP = DOUBLE' };
    if (!next) return { tut: false, text: `👑 CRAB CAPITAL · ${n} CRABS` };
    return { tut: false, text: `${next.icon} ${next.name}: ${n}/${next.pop} CRABS` };
}

/** What a finished run pays: the city at its biggest, the nights survived, the stars caught. */
export const stardust = s => s.stats.peak * 2 + s.town * 6 + (s.day - 1) * 2 + Math.floor(s.stats.caught / 2) + s.stats.perfect + s.stats.courses * 2 + (s.stats.dust || 0);

// ── A sensible player (the probes, and the clip on the game's card) ─────────
/** { x, y, build, act, jump }: where to push the stick, and what to press. */
export function autopilot(s) {
    const c = s.crab, out = { x: 0, y: 0, build: null, act: false, jump: false };
    const go = p => { const d = toward(c.p, p), right = cross(c.f, c.p); out.x = dot(d, right); out.y = dot(d, c.f); };
    const x = context(s);
    if (s.phase === 'night') {
        // The star that will hurt most and can still be reached in time.
        let best = null, bv = -1;
        for (const st of s.stars) {
            if (st.big) continue;
            const left = st.T - st.t, need = Math.max(0, dist(s, c.p, st.p) - st.r * reachOf(s) * 0.7) / speedOf(s);
            if (need > left) continue;
            if (s.builds.some(b => b.kind === 'tower' && b.charges > 0 && dist(s, b.p, st.p) < TOWER_R)) continue;
            const v = s.builds.reduce((a, b) => a + (dist(s, b.p, st.p) < st.r ? (b.kind === 'hut' ? 4 + b.lvl : b.kind === 'palm' ? 2 : 3) : 0), 0.5) + 1 / (1 + left);
            if (v > bv) { bv = v; best = st; }
        }
        if (best) {
            if (dist(s, c.p, best.p) > best.r * 0.35) go(best.p);
            else if (best.T - best.t < JUMP_S * 0.6) out.jump = true;
            return out;
        }
    }
    if (x && x.ok && (x.kind === 'mend' || x.kind === 'shake')) { out.act = true; return out; }
    if (s.phase === 'day') {
        // Something cracked, anywhere: go and mend it.
        const hurt = s.shells >= REPAIR && s.builds.filter(b => b.kind !== 'palm' && b.hp < maxHp(s, b.kind)).sort((a, b) => dist(s, a.p, c.p) - dist(s, b.p, c.p))[0];
        if (hurt) { go(hurt.p); return out; }
        // What to build next: palms first, then homes, a tower for every few homes.
        const n = k => s.builds.filter(b => b.kind === k).length;
        let want = n('palm') < 2 ? 'palm' : unlocked(s, 'tower') && n('tower') * 3 < n('hut') - 1 ? 'tower' : unlocked(s, 'market') && n('market') < 1 ? 'market' : n('palm') < n('hut') + 1 && n('palm') < 7 ? 'palm' : 'hut';
        // A bigger home is often cheaper than a new one.
        const small = s.builds.filter(b => b.kind === 'hut' && b.lvl < maxLvl(s)).sort((a, b) => a.lvl - b.lvl || dist(s, a.p, c.p) - dist(s, b.p, c.p))[0];
        if (want === 'hut' && small && biggerCost(s, small).shells <= costOf(s, 'hut').shells) {
            const cost = biggerCost(s, small);
            if (s.shells >= cost.shells && s.nuts >= cost.nuts) {
                if (x && x.kind === 'bigger' && x.b === small && x.ok) { out.act = true; return out; }
                go(small.p); return out;
            }
            want = null;
        }
        const cst = want && costOf(s, want);
        if (want && s.shells >= cst.shells && s.nuts >= cst.nuts) {
            if (canBuild(s, want).ok) { out.build = want; return out; }
            // Not here: step away from whatever is nearest.
            const nb = s.builds.slice().sort((a, b) => dist(s, a.p, c.p) - dist(s, b.p, c.p))[0];
            const away = toward(c.p, nb.p), right = cross(c.f, c.p);
            out.x = -dot(away, right); out.y = -dot(away, c.f);
            if (Math.hypot(out.x, out.y) < 0.1) out.y = 1;
            return out;
        }
    }
    // Otherwise the nearest thing worth picking up (coconuts and gold first).
    let near = null, nd = Infinity;
    for (const it of s.items) { if (it.kind === 'rock') continue; const d = dist(s, it.p, c.p) - (it.kind === 'shell' ? 0 : 2); if (d < nd) { nd = d; near = it; } }
    if (near) go(near.p);
    return out;
}

/** Turn the camera (and so what 'up the screen' means) round the crab by a radians. */
export function turnView(s, a) {
    const c = s.crab;
    c.f = tangent(c.p, mix(c.f, cross(c.p, c.f), Math.cos(a), Math.sin(a)));
}
