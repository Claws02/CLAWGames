// ============================================================
// CRAB CANNON — the screen (AimScreen does the shared parts). Physics and
// levels: CannonLogic.js. Fire a crab from the cannon to ring every bell;
// mind the wind, bounce off the clouds.
// ============================================================
import * as L from './CannonLogic.js';
import { aimGame } from './AimScreen.js';

let _swing = new Map();

const game = aimGame({
    ...L,
    meta: { id: 'cannon', icon: '🦀', title: 'Crab Cannon', blurb: 'Fire a crab from the cannon to ring every bell. Ride the wind, bounce off the clouds.' },
    intro: 'Pull back and let go to fire the crab from the cannon. Ring <b>every bell</b>. Watch the wind!',
    hud: (lv, s) => `🔔 ${s.rung.filter(Boolean).length}/${lv.bells.length} · ${s.n} / par ${lv.par}`,
    react(ev, fx) {
        ev.rung.forEach(i => { fx.sfx('coin_gain'); fx.buzz(20); _swing.set(i, performance.now() / 1000); });
        if (ev.cloud) fx.sfx('boost');
        if (ev.landed) fx.sfx('dice_land');
        if (ev.bump) fx.sfx('land_bad');
    },
    draw(g, P, lv, s, now) {
        const w = P(L.W), h = P(L.H);
        const storm = lv.world === 1;
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, storm ? '#64748b' : '#7dd3fc'); sky.addColorStop(1, storm ? '#cbd5e1' : '#fef3c7');
        g.fillStyle = sky; g.fillRect(-10, -10, w + 20, h + 20);
        g.fillStyle = storm ? '#0e7490' : '#38bdf8'; g.fillRect(0, P(L.GROUND) - 10, w, 10);
        g.fillStyle = '#e7c98f'; g.fillRect(0, P(L.GROUND), w, h - P(L.GROUND));
        // wind sock
        if (lv.wind) {
            g.strokeStyle = '#2b1240'; g.lineWidth = 2; g.beginPath(); g.moveTo(w - 20, P(L.GROUND)); g.lineTo(w - 20, P(L.GROUND) - 40); g.stroke();
            const dir = Math.sign(lv.wind), len = 12 + Math.abs(lv.wind) * 22, flap = Math.sin(now * 8) * 3;
            g.fillStyle = '#ef4444'; g.beginPath(); g.moveTo(w - 20, P(L.GROUND) - 40); g.lineTo(w - 20 + dir * len, P(L.GROUND) - 36 + flap); g.lineTo(w - 20, P(L.GROUND) - 30); g.fill();
            g.fillStyle = '#2b1240'; g.font = '900 11px Nunito, sans-serif'; g.textAlign = 'right'; g.fillText(`wind ${lv.wind > 0 ? '→' : '←'}`, w - 30, P(L.GROUND) - 44);
        }
        for (const [x, y, iw, ih] of lv.islands) { g.fillStyle = '#16a34a'; g.fillRect(P(x), P(y), P(iw), P(ih)); g.fillStyle = '#a16207'; g.fillRect(P(x), P(y) + 4, P(iw), Math.max(0, P(ih) - 4)); g.strokeStyle = '#2b1240'; g.lineWidth = 2; g.strokeRect(P(x), P(y), P(iw), P(ih)); }
        for (const [x, y, r] of lv.clouds) {
            const puff = 1 + Math.sin(now * 2 + x * 7) * 0.03;
            g.fillStyle = '#fff'; g.strokeStyle = '#cbd5e1'; g.lineWidth = 2;
            for (const [ox, oy, k] of [[0, 0, 1], [-0.6, 0.2, 0.7], [0.6, 0.2, 0.7]]) { g.beginPath(); g.arc(P(x + ox * r), P(y + oy * r), P(r * k) * puff, 0, 7); g.fill(); }
        }
        // bells: swing when rung
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${Math.round(P(L.BELL_R) * 2)}px sans-serif`;
        lv.bells.forEach(([x, y], i) => {
            const t0 = _swing.get(i), sw = t0 ? Math.sin((now - t0) * 14) * Math.max(0, 1 - (now - t0)) * 0.6 : 0;
            g.save(); g.translate(P(x), P(y)); g.rotate(sw);
            if (s.rung[i]) { g.fillStyle = 'rgba(74,222,128,.5)'; g.beginPath(); g.arc(0, 0, P(L.BELL_R) * 1.4, 0, 7); g.fill(); }
            g.fillStyle = '#000'; g.fillText('🔔', 0, 1); g.restore();
        });
        // the cannon, pointing where the last shot went (or up-right)
        const [cx, cy] = L.CANNON, ang = s.flying || s.n ? Math.atan2(s.vy || -1, s.vx || 1) : -0.8;
        g.save(); g.translate(P(cx), P(cy)); g.rotate(s.flying ? Math.atan2(-1, 1) : ang);
        g.fillStyle = '#334155'; g.fillRect(0, -7, 26, 14); g.restore();
        g.fillStyle = '#7c2d12'; g.beginPath(); g.arc(P(cx), P(cy) + 4, 11, 0, 7); g.fill();
        // the crab in flight, spinning
        if (s.flying || s.n) {
            s.trail.unshift([s.x, s.y]); if (s.trail.length > 16 || !s.flying) s.trail.length = s.flying ? 16 : 0;
            s.trail.forEach(([x, y], k) => { g.globalAlpha = 0.35 * (1 - k / 16); g.fillStyle = '#fb923c'; g.beginPath(); g.arc(P(x), P(y), 4, 0, 7); g.fill(); });
            g.globalAlpha = 1;
            if (s.flying) { g.save(); g.translate(P(s.x), P(s.y)); g.rotate(now * 10); g.fillStyle = '#000'; g.font = `${Math.round(P(L.R) * 2.2)}px sans-serif`; g.fillText('🦀', 0, 1); g.restore(); }
        }
        g.textBaseline = 'alphabetic';
    },
});

export const { meta, bestText, mount, unmount, play, shoot, _debug } = game;
