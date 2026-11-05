// ============================================================
// ORBIT PUTT — the screen (AimScreen does the shared parts). Physics and
// levels: OrbitLogic.js. Pull back and fling the ball past planets that bend
// its path; drop it slowly into the wormhole.
//
// The look: a nebula behind three layers of twinkling stars (and the odd
// shooting star); shaded planets with turning cloud bands, craters and rings;
// white dwarfs that pulse outwards; black holes with a swirling disk; a
// spinning wormhole whose catch zone glows; a comet-tailed ball that turns
// green when it's slow enough to drop in; and a dotted preview of the first
// moment of the shot while you aim.
// ============================================================
import * as L from './OrbitLogic.js';
import { aimGame } from './AimScreen.js';

const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };   // a fixed scatter
const STARS = Array.from({ length: 120 }, (_, i) => ({ x: rnd(i, 1), y: rnd(i, 2) * L.H, layer: i % 3, tw: 1 + rnd(i, 3) * 3, ph: rnd(i, 4) * 6 }));
const NEBULA = [[0.2, 0.35, 0.5, '124,58,237'], [0.85, 0.9, 0.45, '14,165,233'], [0.4, 1.35, 0.4, '219,39,119']];
const PALETTE = [['#fb923c', '#9a3412'], ['#38bdf8', '#075985'], ['#4ade80', '#166534'], ['#f472b6', '#9d174d'], ['#facc15', '#a16207']];
let _comet = null, _sparks = [];

function planet(g, P, x, y, r, m, i, now) {
    const X = P(x), Y = P(y), R = P(r);
    if (m < 0) {   // a white dwarf: hot core and pulses going out
        for (let k = 0; k < 3; k++) {
            const f = (now * 0.6 + k / 3) % 1;
            g.strokeStyle = `rgba(226,232,240,${0.45 * (1 - f)})`; g.lineWidth = 2;
            g.beginPath(); g.arc(X, Y, R * (1.2 + f * 2.6), 0, 7); g.stroke();
        }
        const core = g.createRadialGradient(X, Y, 1, X, Y, R * 1.6);
        core.addColorStop(0, '#fff'); core.addColorStop(0.55, '#e0f2fe'); core.addColorStop(1, 'rgba(186,230,253,0)');
        g.fillStyle = core; g.beginPath(); g.arc(X, Y, R * 1.6, 0, 7); g.fill();
        return;
    }
    const [light, dark] = PALETTE[i % PALETTE.length], ringed = r > 0.06;
    // the pull: faint rings that drift inwards
    for (let k = 0; k < 3; k++) {
        const f = 1 - ((now * 0.25 + k / 3) % 1);
        g.strokeStyle = `rgba(196,181,253,${0.18 * (1 - f)})`; g.lineWidth = 1.5; g.setLineDash([3, 6]);
        g.beginPath(); g.arc(X, Y, R * (1.3 + f * (1.4 + m)), 0, 7); g.stroke();
    }
    g.setLineDash([]);
    const ring = (front) => {
        g.save(); g.translate(X, Y); g.rotate(-0.4);
        g.strokeStyle = 'rgba(253,230,138,.75)'; g.lineWidth = Math.max(2, R * 0.12);
        g.beginPath(); g.ellipse(0, 0, R * 1.75, R * 0.48, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(253,230,138,.35)'; g.lineWidth = Math.max(1, R * 0.06);
        g.beginPath(); g.ellipse(0, 0, R * 2.0, R * 0.56, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.stroke();
        g.restore();
    };
    if (ringed) ring(false);
    g.save(); g.beginPath(); g.arc(X, Y, R, 0, 7); g.clip();
    const body = g.createRadialGradient(X - R * 0.35, Y - R * 0.35, R * 0.1, X, Y, R);
    body.addColorStop(0, '#fff'); body.addColorStop(0.35, light); body.addColorStop(1, dark);
    g.fillStyle = body; g.fillRect(X - R, Y - R, R * 2, R * 2);
    if (ringed) {   // cloud bands drifting round
        for (let b = 0; b < 4; b++) {
            const yy = Y - R + (b + 0.5) * (R * 2 / 4), off = ((now * 12 * (b % 2 ? 1 : -0.7)) % (R * 2));
            g.fillStyle = `rgba(255,255,255,${b % 2 ? 0.14 : 0.08})`;
            g.fillRect(X - R * 2 + off, yy - R * 0.1, R * 4, R * 0.2);
        }
    } else {        // craters
        for (let c = 0; c < 4; c++) {
            const cx = X + (rnd(i, c) - 0.5) * R * 1.2, cy = Y + (rnd(i, c + 9) - 0.5) * R * 1.2, cr = R * (0.12 + rnd(i, c + 5) * 0.14);
            g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.fill();
            g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); g.arc(cx - 0.5, cy - 0.5, cr, Math.PI, Math.PI * 1.6); g.stroke();
        }
    }
    // the night side
    const night = g.createLinearGradient(X - R, Y - R, X + R, Y + R);
    night.addColorStop(0.45, 'rgba(2,6,23,0)'); night.addColorStop(1, 'rgba(2,6,23,.55)');
    g.fillStyle = night; g.fillRect(X - R, Y - R, R * 2, R * 2);
    g.restore();
    if (ringed) ring(true);
}

function blackHole(g, P, x, y, r, now) {
    const X = P(x), Y = P(y), R = P(r);
    const glow = g.createRadialGradient(X, Y, R * 0.6, X, Y, R * 2.4);
    glow.addColorStop(0, 'rgba(251,146,60,.55)'); glow.addColorStop(1, 'rgba(251,146,60,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(X, Y, R * 2.4, 0, 7); g.fill();
    g.save(); g.translate(X, Y); g.scale(1, 0.42);
    for (let k = 0; k < 14; k++) {   // the disk: arcs swirling in
        const a = now * (3 + k * 0.15) + k * 0.9, rr = R * (1.1 + (k % 5) * 0.22);
        g.strokeStyle = `hsla(${25 + (k % 4) * 10}, 95%, ${60 + (k % 3) * 8}%, .7)`; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, rr, a, a + 1.4); g.stroke();
    }
    g.restore();
    g.fillStyle = '#000'; g.beginPath(); g.arc(X, Y, R * 0.85, 0, 7); g.fill();
    g.strokeStyle = 'rgba(253,186,116,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(X, Y, R * 0.88, 0, 7); g.stroke();
}

function wormhole(g, P, x, y, now, near) {
    const X = P(x), Y = P(y), R = P(L.GOAL_R);
    // the catch zone (its lip): a soft glow that brightens as the ball comes near
    const lip = g.createRadialGradient(X, Y, R * 0.5, X, Y, P(L.LIP_R));
    lip.addColorStop(0, `rgba(192,132,252,${0.3 + near * 0.35})`); lip.addColorStop(1, 'rgba(192,132,252,0)');
    g.fillStyle = lip; g.beginPath(); g.arc(X, Y, P(L.LIP_R), 0, 7); g.fill();
    g.save(); g.translate(X, Y);
    for (let arm = 0; arm < 4; arm++) {   // spiral arms turning
        g.strokeStyle = `hsla(${270 + arm * 18}, 95%, 72%, .9)`; g.lineWidth = 2.5; g.beginPath();
        for (let k = 0; k <= 24; k++) {
            const f = k / 24, a = -now * 2.6 + arm * Math.PI / 2 + f * 4.2, rr = R * (1.25 - f * 1.05);
            k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.stroke();
    }
    const eye = g.createRadialGradient(0, 0, 1, 0, 0, R * 0.55);
    eye.addColorStop(0, '#fff'); eye.addColorStop(0.4, '#e9d5ff'); eye.addColorStop(1, 'rgba(168,85,247,0)');
    g.fillStyle = eye; g.beginPath(); g.arc(0, 0, R * 0.55, 0, 7); g.fill();
    g.restore();
}

function rock(g, P, x, y, w, h, i) {
    const X = P(x), Y = P(y), Wd = P(w), Ht = P(h), rad = Math.min(Wd, Ht) * 0.45;
    const fill = g.createLinearGradient(X, Y, X, Y + Ht);
    fill.addColorStop(0, '#78716c'); fill.addColorStop(1, '#44403c');
    g.fillStyle = fill; g.strokeStyle = '#a8a29e'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect ? g.roundRect(X, Y, Wd, Ht, rad) : g.rect(X, Y, Wd, Ht); g.fill(); g.stroke();
    const n = Math.max(2, Math.round(Math.max(Wd, Ht) / 22));
    for (let c = 0; c < n; c++) {   // pits along the rock
        const along = (c + 0.5) / n, cx = Wd > Ht ? X + along * Wd : X + Wd / 2 + (rnd(i, c) - 0.5) * Wd * 0.4, cy = Wd > Ht ? Y + Ht / 2 + (rnd(i, c) - 0.5) * Ht * 0.4 : Y + along * Ht;
        g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.arc(cx, cy, Math.min(Wd, Ht) * (0.18 + rnd(i, c + 3) * 0.12), 0, 7); g.fill();
    }
}

const game = aimGame({
    ...L,
    meta: { id: 'orbit', icon: '🪐', title: 'Orbit Putt', blurb: 'Fling a ball past planets whose gravity bends its path. Drop it gently into the wormhole.' },
    intro: 'Pull back and fling the ball. Planets pull it in, white dwarfs push it away. Drop it <b>slowly</b> into the wormhole: the ball turns <b style="color:#4ade80">green</b> when it\'s slow enough.',
    hud: (lv, s) => `🪐 ${s.n} / par ${lv.par}`,
    react(ev, fx, s) {
        if (ev.home) { fx.sfx('coin_gain'); fx.buzz([30, 30, 60]); if (s) { fx.burst(s.x, s.y, '#e9d5ff', 26, 0.7); fx.burst(s.x, s.y, '#c084fc', 16, 0.4); } }
        if (ev.lost) { fx.sfx('mg_lose'); fx.buzz([30, 30, 30]); fx.shake(6); }
        if (ev.bounced) { fx.sfx('dice_land'); if (s) fx.burst(s.x, s.y, '#fde68a', 6, 0.35); }
    },
    // the first moment of the shot, as dots, while you aim
    preview(lv, s, angle, power) {
        const t = L.copy(s); L.shot(lv, t, angle, power);
        const pts = [];
        for (let k = 1; k <= 84 && !t.rest; k++) { L.step(lv, t); if (k % 6 === 0) pts.push([t.x, t.y]); }
        return pts;
    },
    draw(g, P, lv, s, now) {
        const w = P(L.W), h = P(L.H);
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(0.6, '#0b1026'); bg.addColorStop(1, '#020617');
        g.fillStyle = bg; g.fillRect(-10, -10, w + 20, h + 20);
        for (const [x, y, r, rgb] of NEBULA) {
            const n = g.createRadialGradient(P(x), P(y), 1, P(x), P(y), P(r));
            n.addColorStop(0, `rgba(${rgb},.22)`); n.addColorStop(1, `rgba(${rgb},0)`);
            g.fillStyle = n; g.fillRect(-10, -10, w + 20, h + 20);
        }
        for (const st of STARS) {
            const drift = ((st.y + now * 0.004 * (st.layer + 1)) % L.H);
            g.globalAlpha = (0.25 + 0.2 * st.layer) + 0.3 * Math.sin(now * st.tw + st.ph);
            g.fillStyle = st.layer === 2 ? '#e0e7ff' : '#fff';
            const sz = 0.8 + st.layer * 0.7; g.fillRect(P(st.x), P(drift), sz, sz);
        }
        g.globalAlpha = 1;
        // now and then a shooting star
        if (!_comet && Math.random() < 0.004) _comet = { x: Math.random() * 0.6 + 0.3, y: Math.random() * 0.6, t: 0 };
        if (_comet) {
            _comet.t += 1 / 60; const cx = P(_comet.x - _comet.t * 0.9), cy = P(_comet.y + _comet.t * 0.45);
            const tail = g.createLinearGradient(cx, cy, cx + 40, cy - 20); tail.addColorStop(0, 'rgba(255,255,255,.9)'); tail.addColorStop(1, 'rgba(255,255,255,0)');
            g.strokeStyle = tail; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 40, cy - 20); g.stroke();
            if (_comet.t > 0.7) _comet = null;
        }
        // the force field at the edge
        g.strokeStyle = `rgba(165,180,252,${0.45 + 0.15 * Math.sin(now * 2)})`; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
        const [gx, gy] = lv.goal, dGoal = Math.hypot(s.x - gx, s.y - gy);
        wormhole(g, P, gx, gy, now, s.rest ? 0 : Math.max(0, 1 - dGoal / (L.LIP_R * 2)));
        lv.rocks.forEach((r, i) => rock(g, P, ...r, i));
        for (const [x, y, r] of lv.holes) blackHole(g, P, x, y, r, now);
        lv.planets.forEach(([x, y, r, m], i) => planet(g, P, x, y, r, m, i, now));
        // the ball: a comet tail, green when it's slow enough to drop in
        const speed = Math.hypot(s.vx, s.vy), slow = !s.rest && speed < L.CAPTURE_V;
        s.trail.unshift([s.x, s.y]); if (s.trail.length > 28 || s.rest) s.trail.length = s.rest ? 0 : Math.min(s.trail.length, 28);
        if (s.trail.length > 1) {
            for (let k = 1; k < s.trail.length; k++) {
                const f = 1 - k / s.trail.length;
                g.strokeStyle = slow ? `rgba(74,222,128,${0.6 * f})` : `rgba(196,181,253,${0.6 * f})`;
                g.lineWidth = P(L.R) * 1.7 * f; g.lineCap = 'round';
                g.beginPath(); g.moveTo(P(s.trail[k - 1][0]), P(s.trail[k - 1][1])); g.lineTo(P(s.trail[k][0]), P(s.trail[k][1])); g.stroke();
            }
        }
        if (!s.home) {
            const X = P(s.x), Y = P(s.y), R = P(L.R), col = slow ? '#4ade80' : '#a78bfa';
            const halo = g.createRadialGradient(X, Y, R * 0.5, X, Y, R * 2.6);
            halo.addColorStop(0, slow ? 'rgba(74,222,128,.55)' : 'rgba(167,139,250,.45)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = halo; g.beginPath(); g.arc(X, Y, R * 2.6, 0, 7); g.fill();
            const ball = g.createRadialGradient(X - R * 0.35, Y - R * 0.35, 1, X, Y, R);
            ball.addColorStop(0, '#fff'); ball.addColorStop(1, '#e0e7ff');
            g.fillStyle = ball; g.beginPath(); g.arc(X, Y, R, 0, 7); g.fill();
            g.strokeStyle = col; g.lineWidth = 2.5; g.stroke();
            if (s.rest) {   // waiting for a shot: a gentle beckoning ring
                const f = (now * 0.8) % 1;
                g.strokeStyle = `rgba(255,210,63,${0.7 * (1 - f)})`; g.lineWidth = 2; g.beginPath(); g.arc(X, Y, R * (1.4 + f * 1.6), 0, 7); g.stroke();
            }
        }
    },
});

export const { meta, bestText, mount, unmount, play, shoot, _debug } = game;
