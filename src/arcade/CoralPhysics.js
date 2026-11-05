// ============================================================
// CORAL MERGE — the physics and the rules. No DOM (Coral.js is the screen), so
// qa/coral.mjs runs it in Node. planck.js (vendor/planck-esm.js) does the
// physics; world units, y pointing down, fixed steps: the same drops make the
// same game.
//
// THE RULES. Drop a sea creature into the tank from anywhere along the top.
// It falls, rolls and settles. Two of the same kind that touch merge into the
// next kind up, right where they met:
//   🐚 → 🐌 → 🦐 → 🦀 → 🐙 → 🐠 → 🐢 → 🐬 → 🐳 → 💎
// Two 💎 make a treasure burst: both go, for a big bonus. Merges in quick
// succession are a combo, worth more each time.
// Now and then the next drop is a BUBBLE: soon after it lands it pops and
// lifts everything near it, loosening a jammed pile.
// The game ends when a creature stays above the line for two seconds.
// ============================================================
import * as planck from '../../vendor/planck-esm.js';

const { Vec2 } = planck;
export const TANK_W = 7, TANK_H = 10, LINE_Y = 1.8, DROP_Y = 0.85;
export const KINDS = ['🐚', '🐌', '🦐', '🦀', '🐙', '🐠', '🐢', '🐬', '🐳', '💎'];
export const NAMES = ['shell', 'snail', 'shrimp', 'crab', 'octopus', 'fish', 'turtle', 'dolphin', 'whale', 'treasure'];
export const RADII = [0.32, 0.42, 0.54, 0.68, 0.84, 1.02, 1.22, 1.44, 1.68, 1.95];
export const COLORS = ['#fde2e4', '#d9f99d', '#fda4af', '#fb923c', '#c084fc', '#38bdf8', '#4ade80', '#60a5fa', '#818cf8', '#facc15'];
export const TOP = KINDS.length - 1;
export const BUBBLE = -1, BUBBLE_R = 0.62;
export const STEP = 1 / 60;
const OVER_SECS = 2, GRACE_SECS = 1.3, COOLDOWN = 0.45, COMBO_SECS = 1.1, POP_DELAY = 0.35, POP_R = 2.7;

/** Points for making kind k (and the treasure burst). */
export const points = k => (k > TOP ? 2500 : (k * (k + 1)) / 2 * 10);

/** A new tank. rnd: the random for what drops next (seeded in probes). */
export function create(rnd = Math.random) {
    const world = new planck.World({ gravity: Vec2(0, 22) });
    const walls = world.createBody({ type: 'static' });
    const f = { friction: 0.4, restitution: 0.1 };
    walls.createFixture(new planck.Edge(Vec2(0, -6), Vec2(0, TANK_H)), f);
    walls.createFixture(new planck.Edge(Vec2(TANK_W, -6), Vec2(TANK_W, TANK_H)), f);
    walls.createFixture(new planck.Edge(Vec2(0, TANK_H), Vec2(TANK_W, TANK_H)), f);
    const g = { world, rnd, t: 0, acc: 0, score: 0, drops: 0, best: 0, combo: 0, lastMerge: -9, cooldown: 0, over: false,
        sinceBubble: 0, next: 0, after: 0, events: [], merges: 0, bigMerges: 0 };
    g.next = _spawn(g); g.after = _spawn(g);
    // Landing thumps (for squash and stretch) and bubbles touching down.
    // Only the first solve of a NEW contact is a landing: a creature resting in
    // the pile is solved every step (it carries the weight above it), and
    // treating that as a thump made the whole pile pulse.
    world.on('post-solve', (c, imp) => {
        if (!c.__fresh) return;
        c.__fresh = false;
        const n = imp.normalImpulses[0] || 0;
        if (n < 2.5) return;
        for (const b of [c.getFixtureA().getBody(), c.getFixtureB().getBody()]) {
            const d = b.getUserData();
            if (d && d.kind !== undefined && g.t - (d.thumpAt || -9) > 0.25) { d.thumpAt = g.t; d.thump = Math.min(1, n / 8); g.events.push({ type: 'land', id: d.id, power: d.thump }); }
        }
    });
    world.on('begin-contact', c => {
        c.__fresh = true;
        for (const b of [c.getFixtureA().getBody(), c.getFixtureB().getBody()]) {
            const d = b.getUserData();
            if (d && d.kind === BUBBLE && d.popAt == null) d.popAt = g.t + POP_DELAY;
        }
    });
    return g;
}

let _id = 0;
function _body(g, kind, x, y, vx = 0, vy = 0) {
    const r = kind === BUBBLE ? BUBBLE_R : RADII[kind];
    const b = g.world.createBody({ type: 'dynamic', position: Vec2(x, y), linearDamping: kind === BUBBLE ? 0.6 : 0.05, angularDamping: 0.4, bullet: true });
    b.createFixture(new planck.Circle(r), { density: kind === BUBBLE ? 0.25 : 1, friction: 0.35, restitution: kind === BUBBLE ? 0.3 : 0.12 });
    b.setLinearVelocity(Vec2(vx, vy));
    b.setUserData({ id: ++_id, kind, r, born: g.t, above: 0 });
    return b;
}

// What drops next: small creatures, a little bigger as the tank grows; now and then a bubble.
function _spawn(g) {
    g.sinceBubble++;
    if (g.drops >= 8 && g.sinceBubble >= 8 && g.rnd() < 0.12) { g.sinceBubble = 0; return BUBBLE; }
    const cap = Math.max(1, Math.min(4, g.best - 1));
    const w = [0.32, 0.27, 0.2, 0.13, 0.08].slice(0, cap + 1);
    let x = g.rnd() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < w.length; k++) { x -= w[k]; if (x <= 0) return k; }
    return 0;
}

/** Every creature (and bubble) in the tank. */
export function bodies(g) {
    const out = [];
    for (let b = g.world.getBodyList(); b; b = b.getNext()) if (b.getUserData()) out.push(b);
    return out;
}

/** Where a drop at x can go (it must fit between the walls). */
export const clampX = (g, x, kind = g.next) => { const r = kind === BUBBLE ? BUBBLE_R : RADII[kind]; return Math.max(r + 0.02, Math.min(TANK_W - r - 0.02, x)); };
export const canDrop = g => !g.over && g.cooldown <= 0;

/** Drop the next creature at x. Returns its body (null if it can't drop yet). */
export function drop(g, x) {
    if (!canDrop(g)) return null;
    const kind = g.next;
    const b = _body(g, kind, clampX(g, x, kind), DROP_Y, 0, 2);
    g.next = g.after; g.after = _spawn(g);
    g.drops++; g.cooldown = COOLDOWN;
    g.events.push({ type: 'drop', id: b.getUserData().id, kind });
    return b;
}

/** Advance real time dt (fixed steps inside). Returns the events since last time. */
export function step(g, dt) {
    if (g.over) return _flush(g);
    g.acc += Math.min(dt, 0.1);
    while (g.acc >= STEP && !g.over) { g.acc -= STEP; _tick(g); }
    return _flush(g);
}
function _flush(g) { const e = g.events; g.events = []; return e; }

function _tick(g) {
    g.t += STEP;
    g.cooldown -= STEP;
    g.world.step(STEP, 8, 3);
    _merge(g);
    _bubbles(g);
    _danger(g);
}

// Touching pairs of the same kind merge (one merge per creature per step).
function _merge(g) {
    const used = new Set(), pairs = [];
    for (let c = g.world.getContactList(); c; c = c.getNext()) {
        if (!c.isTouching()) continue;
        const a = c.getFixtureA().getBody(), b = c.getFixtureB().getBody();
        const da = a.getUserData(), db = b.getUserData();
        if (!da || !db || da.kind !== db.kind || da.kind === BUBBLE || used.has(a) || used.has(b)) continue;
        used.add(a); used.add(b); pairs.push([a, b]);
    }
    for (const [a, b] of pairs) {
        const k = a.getUserData().kind, pa = a.getPosition(), pb = b.getPosition();
        const x = (pa.x + pb.x) / 2, y = (pa.y + pb.y) / 2;
        const va = a.getLinearVelocity(), vb = b.getLinearVelocity();
        g.world.destroyBody(a); g.world.destroyBody(b);
        g.combo = g.t - g.lastMerge <= COMBO_SECS ? g.combo + 1 : 1;
        g.lastMerge = g.t;
        g.merges++;
        const up = k + 1, pts = points(up) * g.combo;
        g.score += pts;
        if (up > TOP) {   // two treasures: a burst, both gone
            g.bigMerges++;
            g.events.push({ type: 'treasure', x, y, points: pts, combo: g.combo });
            continue;
        }
        const nb = _body(g, up, Math.max(RADII[up], Math.min(TANK_W - RADII[up], x)), y, (va.x + vb.x) / 2, Math.min(0, (va.y + vb.y) / 2));
        nb.getUserData().born = g.t;
        const newBest = up > g.best;
        g.best = Math.max(g.best, up);
        if (up >= 5) g.bigMerges++;
        g.events.push({ type: 'merge', id: nb.getUserData().id, kind: up, x, y, points: pts, combo: g.combo, newBest });
    }
}

// A bubble that has touched down pops: everything nearby gets a lift, up and away from it.
function _bubbles(g) {
    for (const b of bodies(g)) {
        const d = b.getUserData();
        if (d.kind !== BUBBLE || d.popAt == null || g.t < d.popAt) continue;
        const p = b.getPosition();
        let lifted = 0;
        for (const o of bodies(g)) {
            if (o === b) continue;
            const q = o.getPosition(), dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy);
            if (dist > POP_R) continue;
            const s = (1 - dist / POP_R) * o.getMass() * 9;
            o.applyLinearImpulse(Vec2((dx / (dist || 1)) * s * 0.6, -s), q, true);
            lifted++;
        }
        g.world.destroyBody(b);
        g.events.push({ type: 'pop', x: p.x, y: p.y, lifted });
    }
}

// Over the line for two seconds (not counting fresh drops): game over.
function _danger(g) {
    let worst = 0;
    for (const b of bodies(g)) {
        const d = b.getUserData(), p = b.getPosition();
        if (d.kind === BUBBLE || g.t - d.born < GRACE_SECS) { d.above = 0; continue; }
        if (p.y - d.r < LINE_Y) d.above += STEP; else d.above = 0;
        worst = Math.max(worst, d.above);
    }
    g.danger = worst / OVER_SECS;
    if (worst >= OVER_SECS) { g.over = true; g.events.push({ type: 'over' }); }
}
