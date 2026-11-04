// ============================================================
// SEA SNOOKER — the screen (AimScreen does the shared parts). Physics and
// racks: SnookerLogic.js. Flick the white pearl to pot the clams in order.
// ============================================================
import * as L from './SnookerLogic.js';
import { aimGame } from './AimScreen.js';

const game = aimGame({
    ...L,
    meta: { id: 'snooker', icon: '🎱', title: 'Sea Snooker', blurb: 'Flick the white pearl to knock the numbered clams into the six pockets, in order.' },
    intro: 'Pull back and flick the white pearl. Pot the clams <b>in number order</b>; one out of turn comes back.',
    hud: (lv, s) => { const left = s.balls.filter(b => b.num && !b.in).length; return `🎱 ${left} left · ${L.shots(s)} / par ${lv.par}${s.fouls ? ` (${s.fouls} foul${s.fouls === 1 ? '' : 's'})` : ''}`; },
    react(ev, fx) {
        if (ev.clack) fx.sfx('dice_land');
        ev.potted.forEach(n => { fx.sfx(n ? 'coin_gain' : 'mg_lose'); fx.buzz(n ? 20 : [30, 30, 30]); if (!n) fx.shake(5); });
        if (ev.respot) fx.sfx('land_bad');
    },
    draw(g, P, lv, s, now) {
        const w = P(L.W), h = P(L.H);
        g.fillStyle = '#7c2d12'; g.fillRect(-10, -10, w + 20, h + 20);
        const felt = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, h * 0.8); felt.addColorStop(0, '#14b8a6'); felt.addColorStop(1, '#0f766e');
        g.fillStyle = felt; g.fillRect(6, 6, w - 12, h - 12);
        g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, P(1.2)); g.lineTo(w - 6, P(1.2)); g.stroke();
        for (const [x, y] of L.POCKETS) { g.fillStyle = '#0b1120'; g.beginPath(); g.arc(P(x), P(y), P(L.POCKET_R), 0, 7); g.fill(); }
        // spots where clams go back to
        for (const b of s.balls) if (b.num) { g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(P(b.sx), P(b.sy), 3, 0, 7); g.fill(); }
        // the next clam to pot glows
        const nxt = s.balls.filter(b => b.num && !b.in).sort((a, b) => a.num - b.num)[0];
        for (const b of s.balls) {
            if (b.in) continue;
            if (b === nxt && !L.moving(s)) { g.strokeStyle = `rgba(253,224,71,${0.5 + 0.4 * Math.sin(now * 6)})`; g.lineWidth = 3; g.beginPath(); g.arc(P(b.x), P(b.y), P(L.R) + 5, 0, 7); g.stroke(); }
            const gr = g.createRadialGradient(P(b.x - L.R * 0.35), P(b.y - L.R * 0.35), 1, P(b.x), P(b.y), P(L.R));
            gr.addColorStop(0, '#fff'); gr.addColorStop(1, L.COLORS[b.num]);
            g.fillStyle = gr; g.beginPath(); g.arc(P(b.x), P(b.y), P(L.R), 0, 7); g.fill();
            g.strokeStyle = '#1f2937'; g.lineWidth = 1.5; g.stroke();
            if (b.num) { g.fillStyle = '#fff'; g.beginPath(); g.arc(P(b.x), P(b.y), P(L.R) * 0.5, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = `900 ${Math.round(P(L.R) * 0.75)}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.num, P(b.x), P(b.y) + 1); g.textBaseline = 'alphabetic'; }
        }
        // a cue guide while still: a short line from the pearl
        const c = s.balls[0];
        if (!L.moving(s) && !L.cleared(s)) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.setLineDash([3, 5]); g.beginPath(); g.arc(P(c.x), P(c.y), P(L.R) * 2.2, 0, 7); g.stroke(); g.setLineDash([]); }
    },
});

export const { meta, bestText, mount, unmount, play, shoot, _debug } = game;
