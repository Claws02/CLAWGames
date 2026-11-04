// ============================================================
// ORBIT PUTT — the screen (AimScreen does the shared parts). Physics and
// levels: OrbitLogic.js. Pull back and fling the ball past planets that bend
// its path; drop it slowly into the wormhole.
// ============================================================
import * as L from './OrbitLogic.js';
import { aimGame } from './AimScreen.js';

const STARS = Array.from({ length: 70 }, (_, i) => [((i * 97) % 100) / 100, ((i * 61) % 150) / 100, (i % 3) + 1]);

const game = aimGame({
    ...L,
    meta: { id: 'orbit', icon: '🪐', title: 'Orbit Putt', blurb: 'Fling a ball past planets whose gravity bends its path. Drop it gently into the wormhole.' },
    intro: 'Pull back and fling the ball. Planets pull it in, white dwarfs push it away. Drop it <b>slowly</b> into the wormhole.',
    hud: (lv, s) => `🪐 ${s.n} / par ${lv.par}`,
    react(ev, fx) {
        if (ev.home) { fx.sfx('coin_gain'); fx.buzz([30, 30, 60]); }
        if (ev.lost) { fx.sfx('mg_lose'); fx.buzz([30, 30, 30]); fx.shake(6); }
        if (ev.bounced) fx.sfx('dice_land');
    },
    draw(g, P, lv, s, now) {
        const w = P(L.W), h = P(L.H);
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(1, '#020617');
        g.fillStyle = bg; g.fillRect(-10, -10, w + 20, h + 20);
        for (const [x, y, r] of STARS) { g.globalAlpha = 0.4 + 0.4 * Math.sin(now * r + x * 9); g.fillStyle = '#fff'; g.fillRect(P(x), P(y), r * 0.7, r * 0.7); }
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(165,180,252,.6)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
        // the wormhole
        const [gx, gy] = lv.goal;
        for (let k = 0; k < 4; k++) { g.strokeStyle = `hsla(${280 + k * 20}, 90%, 70%, ${0.9 - k * 0.2})`; g.lineWidth = 3; g.beginPath(); g.arc(P(gx), P(gy), P(L.GOAL_R) * (1 - k * 0.22), -now * 2 + k, -now * 2 + k + 4.5); g.stroke(); }
        // rocks, black holes, planets
        for (const [x, y, rw, rh] of lv.rocks) { g.fillStyle = '#57534e'; g.fillRect(P(x), P(y), P(rw), P(rh)); g.strokeStyle = '#a8a29e'; g.lineWidth = 2; g.strokeRect(P(x), P(y), P(rw), P(rh)); }
        for (const [x, y, r] of lv.holes) {
            const gr = g.createRadialGradient(P(x), P(y), 1, P(x), P(y), P(r) * 1.8); gr.addColorStop(0, '#000'); gr.addColorStop(0.5, '#000'); gr.addColorStop(1, 'rgba(249,115,22,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(P(x), P(y), P(r) * 1.8, 0, 7); g.fill();
            g.strokeStyle = 'rgba(251,146,60,.85)'; g.lineWidth = 2; g.beginPath(); g.arc(P(x), P(y), P(r), now * 4, now * 4 + 4); g.stroke();
        }
        lv.planets.forEach(([x, y, r, m], i) => {
            const push = m < 0, col = push ? '#f8fafc' : ['#fb923c', '#38bdf8', '#4ade80', '#f472b6', '#facc15'][i % 5];
            const halo = g.createRadialGradient(P(x), P(y), P(r), P(x), P(y), P(r) * (2 + Math.abs(m)));
            halo.addColorStop(0, push ? 'rgba(248,250,252,.25)' : 'rgba(167,139,250,.28)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = halo; g.beginPath(); g.arc(P(x), P(y), P(r) * (2 + Math.abs(m)), 0, 7); g.fill();
            const body = g.createRadialGradient(P(x - r * 0.3), P(y - r * 0.3), 1, P(x), P(y), P(r));
            body.addColorStop(0, '#fff'); body.addColorStop(1, col);
            g.fillStyle = body; g.beginPath(); g.arc(P(x), P(y), P(r), 0, 7); g.fill();
            if (!push && r > 0.06) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(P(x), P(y), P(r) * 1.6, P(r) * 0.45, -0.4, 0, 7); g.stroke(); }
        });
        // the ball and its trail
        s.trail.unshift([s.x, s.y]); if (s.trail.length > 24 || s.rest) s.trail.length = s.rest ? 0 : 24;
        s.trail.forEach(([x, y], k) => { g.globalAlpha = 0.5 * (1 - k / 24); g.fillStyle = '#c4b5fd'; g.beginPath(); g.arc(P(x), P(y), P(L.R) * (1 - k / 30), 0, 7); g.fill(); });
        g.globalAlpha = 1;
        if (!s.home) { g.fillStyle = '#fff'; g.beginPath(); g.arc(P(s.x), P(s.y), P(L.R), 0, 7); g.fill(); g.strokeStyle = '#a78bfa'; g.lineWidth = 2.5; g.stroke(); }
    },
});

export const { meta, bestText, mount, unmount, play, shoot, _debug } = game;
