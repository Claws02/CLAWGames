// ============================================================
// KITE WIND — the flight rules, no drawing (Kite.js draws). Positions are in
// screen heights: y 0 is the top, T.ground the sand; x runs to `aspect`
// (width / height). The kite stays at x = 0.3 × aspect; the beach scrolls.
//
// Every ring is placed where the kite can get to: the climb (tapping four
// times a second into the strongest downdraft) or the drop (letting go in the
// strongest updraft) in the time before it arrives. A gull is never put at
// the height of a ring arriving at about the same moment.
// ============================================================
export const T = {
    top: 0.06, ground: 0.9,
    tug: 0.45, gravity: 1.15, maxFall: 0.95,
    gust: 0.75,                         // strongest downdraft, as an acceleration (H/s²)
    lift: 0.35,                         // strongest updraft: kept gentle so the kite can always sink to a ring
    speed: 0.3, speedUp: 50, maxMul: 2.2,
    gap: 1.0,                           // seconds between rings/gulls (at ×1)
    kiteR: 0.028, ringR: 0.075, gullR: 0.03,
    ringLo: 0.14, ringHi: 0.78,         // where rings may be
    gullClear: 0.17,                    // a gull keeps this far from a ring arriving with it
};
export const KITE_X = 0.3;

export const fresh = () => ({ y: 0.4, vy: 0, t: 0, score: 0, rings: 0, combo: 1, bestCombo: 1, things: [], next: 0.6,
    wind: 0, windTo: 0, windT: 2, trail: [], over: false, why: '', lastRing: { y: 0.4, t: 0 } });

export const mul = s => Math.min(T.maxMul, 1 + s.t / T.speedUp);
const ramp = t => Math.min(1, 0.4 + t / 60);
export const gustMax = t => T.gust * ramp(t);   // downdraft
export const liftMax = t => T.lift * ramp(t);   // updraft

/** A tug on the string. */
export function tug(s) { if (!s.over) s.vy = Math.min(s.vy, 0) - T.tug; }

/** How far the kite can surely climb and drop in tau seconds, at time t, whatever the wind. */
export function reach(tau, t) {
    const gust = gustMax(t), lift = liftMax(t), h = 1 / 120;
    // drop: let go after a moment, the strongest updraft
    let y = 0, vy = 0;
    for (let k = 0.1; k < tau; k += h) { vy = Math.min(T.maxFall, vy + (T.gravity - lift) * h); y += vy * h; }
    const down = Math.max(0, y);
    // climb: four taps a second, the strongest downdraft
    y = 0; vy = 0; let tap = 0.15;
    for (let k = 0; k < tau; k += h) { if (k >= tap) { vy = Math.min(vy, 0) - T.tug; tap += 0.25; } vy = Math.min(T.maxFall, vy + (T.gravity + gust) * h); y += vy * h; }
    return { up: Math.max(0, -y), down };
}

/** Where the next ring goes: within reach of the last one. */
export function ringY(s, rnd) {
    const tau = (s.t - s.lastRing.t) * 0.92;   // it arrives a touch sooner: the beach speeds up
    const { up, down } = reach(tau, s.t), slack = T.ringR * 0.5;
    const lo = Math.max(T.ringLo, s.lastRing.y - up - slack), hi = Math.min(T.ringHi, s.lastRing.y + down + slack);
    if (lo >= hi) return Math.min(T.ringHi, Math.max(T.ringLo, s.lastRing.y));
    // two tries, keep the one nearer mid-sky: rings don't creep to the top or the sand
    const a = lo + rnd() * (hi - lo), b = lo + rnd() * (hi - lo), mid = 0.45;
    return Math.abs(a - mid) < Math.abs(b - mid) ? a : b;
}

/** When something at x reaches the kite (seconds), at the speed it moves now. */
const arrive = (s, x, aspect, f) => (x - KITE_X * aspect) / (T.speed * mul(s) * f * aspect);

/** Put the next ring or gull at the right edge. */
export function spawn(s, aspect, rnd, kind, opts = {}) {
    const x = aspect + 0.1;
    const gullOdds = opts.noGulls ? 0 : Math.min(0.5, 0.2 + s.t / 100);
    kind = kind || (rnd() < gullOdds ? 'gull' : 'ring');
    if (kind === 'gull') {
        const when = arrive(s, x, aspect, 1.35);
        const near = s.things.filter(o => o.kind === 'ring' && !o.done && Math.abs(arrive(s, o.x, aspect, 1) - when) < 0.9);
        for (let k = 0; k < 10; k++) {
            const y = T.top + 0.05 + rnd() * (T.ground - T.top - 0.15);
            if (near.every(o => Math.abs(o.y - y) > T.gullClear + 0.01)) { s.things.push({ kind: 'gull', x, y, ph: rnd() * 6 }); return; }
        }
        kind = 'ring';      // nowhere safe for a gull: a ring instead
    }
    const y = ringY(s, rnd);
    s.things.push({ kind: 'ring', x, y });
    s.lastRing = { y, t: s.t };
}

/**
 * One step. Returns what happened: { ring, missed, end } (end is the reason
 * the flight is over).
 */
export function step(s, dt, aspect, rnd, opts = {}) {
    const ev = { ring: 0, missed: 0, end: '' };
    if (s.over) return ev;
    s.t += dt;
    // the wind drifts toward a new gust every few seconds
    s.windT -= dt;
    if (s.windT <= 0) { const u = rnd() * 2 - 1; s.windTo = u > 0 ? u * liftMax(s.t) : u * gustMax(s.t); s.windT = 2 + rnd() * 3; }
    s.wind += (s.windTo - s.wind) * Math.min(1, dt * 1.5);
    s.vy = Math.min(T.maxFall, s.vy + (T.gravity - s.wind) * dt);
    s.y += s.vy * dt;
    if (s.y < T.top) { s.y = T.top; s.vy = Math.max(0, s.vy); }
    if (s.y > T.ground - T.kiteR) return _over(s, ev, 'Crashed into the sand!');
    const m = mul(s), dx = T.speed * m * dt * aspect;
    s.next -= dt * m;
    if (s.next <= 0) { spawn(s, aspect, rnd, null, opts); s.next = T.gap * (0.75 + rnd() * 0.5); }
    const x0 = KITE_X * aspect;
    for (const o of s.things) {
        o.x -= dx * (o.kind === 'gull' ? 1.35 : 1);
        if (o.kind === 'gull') o.y += Math.sin((s.t + o.ph) * 3) * 0.05 * dt;
        const d = Math.hypot(o.x - x0, o.y - s.y);
        if (o.kind === 'gull' && d < T.kiteR + T.gullR) return _over(s, ev, 'Hit a gull!');
        if (o.kind === 'ring' && !o.done && d < T.ringR) {   // anywhere inside the hoop
            o.done = true; s.rings++; s.score += 10 * s.combo; s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo - 1); ev.ring++;
        }
        if (o.kind === 'ring' && !o.done && !o.missed && o.x < x0 - T.ringR) { o.missed = true; s.combo = 1; ev.missed++; }
    }
    s.things = s.things.filter(o => o.x > -0.15);
    s.trail.unshift(s.y); if (s.trail.length > 14) s.trail.pop();
    return ev;
}
function _over(s, ev, why) { s.over = true; s.why = why; ev.end = why; return ev; }
