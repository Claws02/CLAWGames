// ============================================================
// REEF DROP — the screen (AimScreen does the shared parts). Physics and
// reefs: ReefDropLogic.js. Drop pearls into the reef: pop coral in chains,
// open and free every oyster, set off the eels.
// ============================================================
import * as L from './ReefDropLogic.js';
import { aimGame } from './AimScreen.js';

let _zaps = [], _chainShow = null;

const game = aimGame({
    ...L,
    meta: { id: 'reefdrop', icon: '🪸', title: 'Reef Drop', blurb: 'Drop pearls into the reef. Pop coral in chains and free every sleepy oyster. 12 reefs.' },
    intro: 'Pull back to aim the launcher, let go to drop a pearl. Hit every <b>oyster twice</b> to free it. ⚡ Eels zap everything near them.',
    hud: (lv, s) => `🦪 ${s.pegs.filter(p => p.kind === 'o' && p.alive).length} · 🫧 ${s.left} · ${s.score}`,
    doneText: (lv, s) => `${s.score} points · ${s.left} pearl${s.left === 1 ? '' : 's'} left`,
    threeStars: () => '★★★ with 5 pearls left',
    react(ev, fx) {
        ev.popped.forEach(p => { fx.burst(p.x, p.y, p.kind === 'o' ? '#fde047' : p.kind === 'e' ? '#a78bfa' : '#fb7185', p.kind === 'o' ? 18 : 6, 0.4); });
        if (ev.popped.length) { fx.sfx(ev.popped.some(p => p.kind === 'o') ? 'coin_gain' : 'land_good'); fx.buzz(8); }
        ev.opened.forEach(p => { fx.burst(p.x, p.y, '#fef3c7', 8, 0.3); fx.sfx('gate_open'); });
        ev.zapped.forEach(p => { _zaps.push({ x: p.x, y: p.y, t: performance.now() / 1000 }); fx.sfx('boost'); fx.shake(6); fx.buzz([20, 20, 40]); });
        if (ev.pool >= 0) { fx.sfx(L.POOLS[ev.pool][2] > 1 ? 'win' : 'dice_land'); if (L.POOLS[ev.pool][2] > 1) fx.shake(4); }
        if (ev.bonus) { _chainShow = { text: '🫧 BIG CATCH! +1 PEARL', t: performance.now() / 1000 }; fx.buzz([40, 30, 80]); }
    },
    draw(g, P, lv, s, now) {
        const w = P(L.W), h = P(L.H);
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0e7490'); bg.addColorStop(1, '#083344');
        g.fillStyle = bg; g.fillRect(-10, -10, w + 20, h + 20);
        // pools
        L.POOLS.forEach(([a, b, k]) => {
            g.fillStyle = k > 1 ? 'rgba(253,224,71,.35)' : 'rgba(255,255,255,.08)'; g.fillRect(P(a), P(L.POOL_Y), P(b - a), h - P(L.POOL_Y));
            g.fillStyle = '#fff'; g.font = '900 13px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText(`×${k}`, P((a + b) / 2), P(L.POOL_Y) + 18);
        });
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(0, P(L.POOL_Y)); g.lineTo(w, P(L.POOL_Y)); g.stroke();
        // the launcher
        const [lx, ly] = L.LAUNCH;
        g.fillStyle = '#f472b6'; g.beginPath(); g.arc(P(lx), P(ly), 16, Math.PI, 0); g.fill(); g.strokeStyle = '#2b1240'; g.lineWidth = 3; g.stroke();
        // the reef
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const p of s.pegs) {
            if (!p.alive) continue;
            const x = P(p.x), y = P(p.y), r = P(L.PEG_R), bob = Math.sin(now * 2 + p.x * 9) * 1;
            if (p.kind === 'c') { g.fillStyle = '#fb7185'; g.beginPath(); g.arc(x, y + bob, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3 + bob, r * 0.3, 0, 7); g.fill(); }
            else if (p.kind === 'r') { g.fillStyle = '#78716c'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.strokeStyle = '#d6d3d1'; g.lineWidth = 2; g.stroke(); }
            else if (p.kind === 'e') { g.fillStyle = '#8b5cf6'; g.beginPath(); g.arc(x, y + bob, r * 1.05, 0, 7); g.fill(); g.fillStyle = '#000'; g.font = `${Math.round(r * 1.3)}px sans-serif`; g.fillText('⚡', x, y + 1 + bob); }
            else {
                g.fillStyle = p.hp === 2 ? '#fde68a' : '#fef9c3'; g.beginPath(); g.arc(x, y + bob, r * 1.15, 0, 7); g.fill(); g.strokeStyle = p.hp === 2 ? '#b45309' : '#facc15'; g.lineWidth = 3; g.stroke();
                g.fillStyle = '#000'; g.font = `${Math.round(r * 1.4)}px sans-serif`; g.fillText(p.hp === 2 ? '🦪' : '⚪', x, y + 1 + bob);
            }
        }
        // zaps: a quick crackle around each eel that went off
        _zaps = _zaps.filter(z => now - z.t < 0.35);
        for (const z of _zaps) {
            g.strokeStyle = `rgba(196,181,253,${1 - (now - z.t) / 0.35})`; g.lineWidth = 2;
            for (let k = 0; k < 6; k++) { const a = k + now * 30; g.beginPath(); g.moveTo(P(z.x), P(z.y)); g.lineTo(P(z.x + Math.cos(a) * L.ZAP_R * 0.5), P(z.y + Math.sin(a) * L.ZAP_R * 0.5)); g.lineTo(P(z.x + Math.cos(a + 0.4) * L.ZAP_R), P(z.y + Math.sin(a + 0.4) * L.ZAP_R)); g.stroke(); }
        }
        // the pearl
        if (s.flying) { g.fillStyle = '#fff7ed'; g.beginPath(); g.arc(P(s.x), P(s.y), P(L.R), 0, 7); g.fill(); g.strokeStyle = '#2b1240'; g.lineWidth = 2; g.stroke(); }
        // the chain, while it grows
        if (s.flying && s.chain > 1) { g.fillStyle = '#fde047'; g.strokeStyle = '#2b1240'; g.lineWidth = 4; g.font = '900 22px "Bebas Neue", Nunito, sans-serif'; g.strokeText(`CHAIN ×${s.chain}`, w / 2, P(0.2)); g.fillText(`CHAIN ×${s.chain}`, w / 2, P(0.2)); }
        if (_chainShow && now - _chainShow.t < 1.4) { g.fillStyle = '#fff'; g.strokeStyle = '#2b1240'; g.lineWidth = 5; g.font = '900 24px "Bebas Neue", Nunito, sans-serif'; g.strokeText(_chainShow.text, w / 2, P(0.3)); g.fillText(_chainShow.text, w / 2, P(0.3)); }
        g.textBaseline = 'alphabetic';
    },
});

export const { meta, bestText, mount, unmount, play, shoot, _debug } = game;
