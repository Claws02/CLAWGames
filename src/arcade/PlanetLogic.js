// ============================================================
// TINY PLANET — the rules. No DOM, no three.js: the screen (Planet.js) draws
// what this says, and the probes play it in Node.
//
// A crab on a very small planet. By DAY: walk about picking up shells, plant
// palms (they drop coconuts), build huts (each houses a villager, who brings
// a shell every so often) and bubble towers. By NIGHT: shooting stars fall on
// the island. Stand where one will land and the crab CATCHES it (and keeps
// the pieces); a tower's bubble soaks up a few; the rest flatten palms and
// crack huts. Every third dawn the planet grows. The island is lost when the
// last hut goes. The score is the day you reached.
//
// Everything lives on the unit sphere: a place is a unit vector, and a
// distance along the ground is the angle between two places times the
// planet's radius R. So when the planet grows, everything keeps its place
// and the walks between get longer.
//
//   create({ rnd, up })           a new island (up: upgrade levels, see UPGRADES)
//   step(s, dt, { x, y })         advance; the stick is screen-relative. → events
//   canBuild(s, kind) / build     'palm' | 'hut' | 'tower', where the crab stands
//   repairable(s) / repair(s)     a cracked hut or tower next to the crab
//   stardust(s)                   what a finished run pays into the workshop
//   autopilot(s)                  a sensible player: { x, y, build, repair }
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
export const R0 = 5.5, R_MAX = 12, GROW = 1.13, GROW_EVERY = 3;
export const DAY_S = 30, NIGHT_S = 16;
export const SPEED = 4.2, COLLECT = 0.8, SPACE = 1.75, NEAR = 1.3;
// What the first of each costs; every one you already have adds STEP to the next.
export const COST = { palm: { shells: 4, nuts: 0 }, hut: { shells: 8, nuts: 3 }, tower: { shells: 10, nuts: 4 } };
export const STEP = { palm: { shells: 1, nuts: 0 }, hut: { shells: 3, nuts: 1 }, tower: { shells: 4, nuts: 1 } };
export const REPAIR = 3;
export const HP = { palm: 1, hut: 3, tower: 2 };
export const PALM_GROW_S = 16, NUT_S = 10, NUTS_OUT = 2, HUT_S = 18;
export const TOWER_R = 3.2, TOWER_CHARGES = 3;
export const STAR_R = 1.25, BIG_R = 2.1, CATCH_CD = 0.5, STAR_PAY = 2, GOLD = 5;
export const SPAWN_S = 1.7;

/** The workshop: what stardust buys, kept between runs. */
export const UPGRADES = [
    { id: 'speed',  icon: '🦀', name: 'Quick Claws',  max: 5, how: 'Walk 6% faster.' },
    { id: 'start',  icon: '🐚', name: 'Head Start',   max: 5, how: 'Begin with 3 more shells.' },
    { id: 'green',  icon: '🌴', name: 'Green Thumb',  max: 5, how: 'Palms grow and fruit 10% faster.' },
    { id: 'reach',  icon: '🌠', name: 'Long Reach',   max: 5, how: 'Catch stars from 8% further off.' },
    { id: 'sturdy', icon: '🛖', name: 'Sturdy Huts',  max: 3, how: 'Huts take one more hit.' },
    { id: 'lucky',  icon: '✨', name: 'Lucky Tides',  max: 5, how: 'More golden shells wash up.' },
];
export const upgradeCost = level => [10, 20, 35, 55, 80][level] ?? null;

const lv = (s, id) => (s.up && s.up[id]) || 0;
export const speedOf = s => SPEED * (1 + 0.06 * lv(s, 'speed'));
export const reachOf = s => 1 + 0.08 * lv(s, 'reach');
export const hutHp = s => HP.hut + lv(s, 'sturdy');
const greenOf = s => 1 + 0.1 * lv(s, 'green');
export const maxHp = (s, kind) => (kind === 'hut' ? hutHp(s) : HP[kind]);
/** Ground distance between two places on this planet. */
export const dist = (s, a, b) => angle(a, b) * s.R;

/** How many stars fall on a night, and how long each takes to land. */
export const starsFor = day => 1 + Math.floor(day * 1.2 + day * day * 0.07);
export const fallFor = day => Math.max(1.7, 3.2 - day * 0.06);
/** Every fifth night brings the big ones (they can't be caught): one, then two, ... */
export const bigFor = day => (day % 5 === 0 ? day / 5 : 0);
export const shellCap = s => Math.round(4 + s.R * 0.9);

function _rndPlace(s) {
    const z = s.rnd() * 2 - 1, a = s.rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), z, r * Math.sin(a)];
}

export function create({ rnd = Math.random, up = {} } = {}) {
    const s = {
        rnd, up, t: 0, day: 1, phase: 'day', pt: 0, R: R0, over: false, id: 1,
        crab: { p: [0, 1, 0], f: [0, 0, -1], face: [0, 0, -1], moving: false, cd: 0 },
        shells: 4 + 3 * ((up && up.start) || 0), nuts: 0,
        items: [], builds: [], stars: [], due: [], spawnT: 0.4,
        stats: { caught: 0, built: 0, shells: 0, peak: 1, lost: 0 },
    };
    // The first hut, a few steps in front of the crab, and some shells to find.
    _add(s, 'hut', walk(s.crab.p, s.crab.f, 2.2 / s.R));
    for (let i = 0; i < 4; i++) _spawnShell(s);
    return s;
}

function _add(s, kind, p) {
    const b = { id: s.id++, kind, p, hp: maxHp(s, kind), age: kind === 'palm' ? 0 : 99, t: kind === 'hut' ? HUT_S : NUT_S / greenOf(s), charges: TOWER_CHARGES };
    s.builds.push(b);
    return b;
}
export const pop = s => s.builds.filter(b => b.kind === 'hut').length;
export const grown = (s, b) => b.kind !== 'palm' || b.age >= PALM_GROW_S / greenOf(s);

function _spawnShell(s) {
    for (let k = 0; k < 8; k++) {
        const p = _rndPlace(s);
        if (s.builds.some(b => dist(s, b.p, p) < 1) || dist(s, s.crab.p, p) < 1.5) continue;
        const gold = s.rnd() < 0.04 + 0.025 * lv(s, 'lucky');
        s.items.push({ id: s.id++, kind: gold ? 'gold' : 'shell', p });
        return;
    }
}

// ── Building ────────────────────────────────────────────────────────────────
/** What the next `kind` costs: { shells, nuts }. */
export function costOf(s, kind) {
    const n = s.builds.filter(b => b.kind === kind).length;
    return { shells: COST[kind].shells + STEP[kind].shells * n, nuts: COST[kind].nuts + STEP[kind].nuts * n };
}
/** { ok, why }: can `kind` go up where the crab stands? */
export function canBuild(s, kind) {
    if (!COST[kind] || s.over) return { ok: false, why: '' };
    const c = costOf(s, kind);
    if (s.shells < c.shells || s.nuts < c.nuts) return { ok: false, why: 'cost' };
    if (s.builds.some(b => dist(s, b.p, s.crab.p) < SPACE)) return { ok: false, why: 'space' };
    return { ok: true, why: '' };
}
export function build(s, kind) {
    if (!canBuild(s, kind).ok) return null;
    const c = costOf(s, kind);
    s.shells -= c.shells; s.nuts -= c.nuts;
    const b = _add(s, kind, s.crab.p.slice());
    s.stats.built++; s.stats.peak = Math.max(s.stats.peak, pop(s));
    return b;
}
/** A cracked hut or tower within reach, or null. */
export const repairable = s => s.builds.find(b => b.kind !== 'palm' && b.hp < maxHp(s, b.kind) && dist(s, b.p, s.crab.p) < NEAR + 0.6) || null;
export function repair(s) {
    const b = repairable(s);
    if (!b || s.shells < REPAIR || s.over) return null;
    s.shells -= REPAIR; b.hp = maxHp(s, b.kind);
    return b;
}

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
    if (s.builds.length && s.rnd() < 0.68) {
        const b = s.builds[Math.floor(s.rnd() * s.builds.length)];
        p = walk(b.p, tangent(b.p, _rndPlace(s)), (s.rnd() * 0.9) / s.R);
    } else p = _rndPlace(s);
    const st = { id: s.id++, p, t: 0, T: fallFor(s.day) + (d.big ? 1.6 : 0), r: d.big ? BIG_R : STAR_R, big: d.big };
    s.stars.push(st);
    ev.push({ type: 'star', star: st });
}

function _land(s, st, ev) {
    // A tower's bubble takes it, if one covers the spot and has a charge left.
    const tw = s.builds.filter(b => b.kind === 'tower' && b.charges > 0 && dist(s, b.p, st.p) < TOWER_R).sort((a, b) => dist(s, a.p, st.p) - dist(s, b.p, st.p))[0];
    if (tw) { tw.charges -= st.big ? 2 : 1; if (tw.charges < 0) tw.charges = 0; ev.push({ type: 'shield', p: st.p, tower: tw, big: st.big }); return; }
    // The crab under an ordinary star catches it.
    if (!st.big && s.crab.cd <= 0 && dist(s, s.crab.p, st.p) < st.r * reachOf(s)) {
        s.crab.cd = CATCH_CD; s.shells += STAR_PAY; s.stats.caught++;
        ev.push({ type: 'catch', p: st.p, pay: STAR_PAY });
        return;
    }
    const hit = [];
    for (const b of s.builds.slice()) {
        if (dist(s, b.p, st.p) > st.r) continue;
        b.hp -= st.big ? 2 : 1;
        if (b.hp <= 0) { s.builds.splice(s.builds.indexOf(b), 1); s.stats.lost++; hit.push({ b, gone: true }); }
        else hit.push({ b, gone: false });
    }
    s.items = s.items.filter(i => dist(s, i.p, st.p) > st.r);
    let ouch = 0;
    if (dist(s, s.crab.p, st.p) < st.r) { ouch = Math.min(3, s.shells); s.shells -= ouch; }
    ev.push({ type: 'impact', p: st.p, r: st.r, big: st.big, hit, ouch });
    if (!pop(s)) { s.over = true; ev.push({ type: 'over', day: s.day }); }
}

function _dawn(s, ev) {
    s.day++; s.phase = 'day'; s.pt = 0;
    s.builds.forEach(b => { if (b.kind === 'tower') b.charges = TOWER_CHARGES; });
    const gift = pop(s);
    s.shells += gift;
    let grew = false;
    if ((s.day - 1) % GROW_EVERY === 0 && s.R < R_MAX) { s.R = Math.min(R_MAX, s.R * GROW); grew = true; }
    ev.push({ type: 'dawn', day: s.day, gift, grew, R: s.R });
}

// ── One step ────────────────────────────────────────────────────────────────
/** Advance by dt. The stick: x right, y forward (up the screen), each −1..1. → events. */
export function step(s, dt, stick = { x: 0, y: 0 }) {
    const ev = [];
    if (s.over) return ev;
    s.t += dt; s.pt += dt;
    const c = s.crab;
    c.cd = Math.max(0, c.cd - dt);

    // The crab. The camera's forward (f) is carried along with it, so the
    // stick always means "that way on the screen".
    const m = Math.min(1, Math.hypot(stick.x, stick.y));
    c.moving = m > 0.12;
    if (c.moving) {
        const right = cross(c.f, c.p);
        const d = norm(mix(right, c.f, stick.x, stick.y));
        c.p = walk(c.p, d, (speedOf(s) * m * dt) / s.R);
        c.f = tangent(c.p, c.f);
        c.face = tangent(c.p, d);
    }

    // Pick up whatever it walks over.
    for (let i = s.items.length - 1; i >= 0; i--) {
        const it = s.items[i];
        if (dist(s, it.p, c.p) > COLLECT) continue;
        s.items.splice(i, 1);
        if (it.kind === 'nut') s.nuts++;
        else { const n = it.kind === 'gold' ? GOLD : 1; s.shells += n; s.stats.shells += n; }
        ev.push({ type: 'pick', item: it });
    }

    // Shells wash up; palms grow and drop coconuts; villagers bring shells.
    s.spawnT -= dt;
    if (s.spawnT <= 0) { s.spawnT = SPAWN_S; if (s.items.filter(i => i.kind !== 'nut').length < shellCap(s)) _spawnShell(s); }
    for (const b of s.builds) {
        if (b.kind === 'palm') {
            const was = grown(s, b);
            b.age += dt;
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
            if (b.t <= 0) { b.t = HUT_S; s.shells++; ev.push({ type: 'gift', b }); }
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

/** What a finished run pays: the nights survived, the stars caught, the village at its biggest. */
export const stardust = s => (s.day - 1) * 3 + Math.floor(s.stats.caught / 2) + s.stats.peak;

// ── A sensible player (the probes, and the clip on the game's card) ─────────
/** { x, y, build, repair }: where to push the stick, and what to press. */
export function autopilot(s) {
    const c = s.crab, out = { x: 0, y: 0, build: null, repair: false };
    const go = p => { const d = toward(c.p, p), right = cross(c.f, c.p); out.x = dot(d, right); out.y = dot(d, c.f); };
    if (s.phase === 'night') {
        // The star that will hurt most and can still be reached in time.
        let best = null, bv = -1;
        for (const st of s.stars) {
            if (st.big) continue;
            const left = st.T - st.t, need = Math.max(0, dist(s, c.p, st.p) - st.r * reachOf(s) * 0.7) / speedOf(s);
            if (need > left) continue;
            if (s.builds.some(b => b.kind === 'tower' && b.charges > 0 && dist(s, b.p, st.p) < TOWER_R)) continue;
            const v = s.builds.reduce((a, b) => a + (dist(s, b.p, st.p) < st.r ? (b.kind === 'hut' ? 5 : b.kind === 'tower' ? 3 : 2) : 0), 0.5) + 1 / (1 + left);
            if (v > bv) { bv = v; best = st; }
        }
        if (best) { if (dist(s, c.p, best.p) > best.r * 0.35) go(best.p); return out; }
    }
    if (repairable(s) && s.shells >= REPAIR) { out.repair = true; return out; }
    // What to build next: palms first, then huts, a tower for every three huts.
    const n = k => s.builds.filter(b => b.kind === k).length;
    const want = n('palm') < 2 ? 'palm' : n('tower') * 3 < n('hut') - 1 ? 'tower' : n('palm') < n('hut') + 1 && n('palm') < 6 ? 'palm' : 'hut';
    const cst = costOf(s, want);
    if (s.phase === 'day' && s.shells >= cst.shells && s.nuts >= cst.nuts) {
        if (canBuild(s, want).ok) { out.build = want; return out; }
        // Not here: step away from whatever is nearest.
        const nb = s.builds.slice().sort((a, b) => dist(s, a.p, c.p) - dist(s, b.p, c.p))[0];
        const away = toward(c.p, nb.p), right = cross(c.f, c.p);
        out.x = -dot(away, right); out.y = -dot(away, c.f);
        if (Math.hypot(out.x, out.y) < 0.1) out.y = 1;
        return out;
    }
    // Otherwise the nearest thing worth picking up (coconuts and gold first).
    let near = null, nd = Infinity;
    for (const it of s.items) { const d = dist(s, it.p, c.p) - (it.kind === 'shell' ? 0 : 2); if (d < nd) { nd = d; near = it; } }
    if (near) go(near.p);
    return out;
}
