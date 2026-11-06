// ============================================================
// REEF DROP — the screen (AimScreen does the shared parts). Physics and
// reefs: ReefDropLogic.js. Drop pearls into the reef: pop coral in chains,
// open and free every oyster, set off the eels, and land pearls in Shelly's
// shell to get them back.
//
// The look: light rays and rising bubbles, kelp swaying at the sides, a sandy
// floor. Shelly the hermit crab scuttles along it, eyes on the pearl; she
// jumps for joy when she catches one, sighs at a near miss and dances when
// the reef is clear. Pieces wobble, pop with a puff and a score; oysters open
// to show their pearl; eels wriggle; jellyfish pulse and squish.
// ============================================================
import * as L from './ReefDropLogic.js';
import { aimGame } from './AimScreen.js';

const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const BUBBLES = Array.from({ length: 26 }, (_, i) => ({ x: rnd(i, 1), sp: 0.05 + rnd(i, 2) * 0.08, r: 1.5 + rnd(i, 3) * 3, ph: rnd(i, 4) * 10 }));
let _starHit = new Map(), _bursts = [], _warps = [], _zaps = [], _pops = [], _banner = null, _crab = { mood: '', t: 0, x: 0.5, dir: 1 }, _squish = new Map(), _launch = 0;

const now = () => performance.now() / 1000;
const say = (text, color = '#fff', big = false) => { _banner = { text, color, big, t: now() }; };

// ---- the pieces ----------------------------------------------------------------
function coral(g, x, y, r, wob) {
    g.save(); g.translate(x, y); g.rotate(wob * 0.08);
    g.fillStyle = '#fb7185'; g.strokeStyle = '#9f1239'; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.55; g.beginPath(); g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.42, 0, 7); g.fill(); }
    g.beginPath(); g.arc(0, r * 0.1, r * 0.72, 0, 7); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(-r * 0.28, -r * 0.2, r * 0.22, 0, 7); g.fill();
    g.restore();
}
function oyster(g, x, y, r, hp, t) {
    const open = hp === 1, gap = open ? 0.55 + Math.sin(t * 3) * 0.08 : 0.05 + Math.max(0, Math.sin(t * 1.3 + x)) * 0.06;
    g.save(); g.translate(x, y);
    g.fillStyle = '#d6c7a1'; g.strokeStyle = '#78350f'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, r * 0.25, r * 1.15, r * 0.6, 0, 0, Math.PI); g.fill(); g.stroke();   // bottom shell
    if (open) {   // the pearl inside, glinting
        const gl = g.createRadialGradient(-r * 0.15, -r * 0.05, 1, 0, 0, r * 0.5); gl.addColorStop(0, '#fff'); gl.addColorStop(1, '#fde68a');
        g.fillStyle = gl; g.beginPath(); g.arc(0, r * 0.05, r * 0.45, 0, 7); g.fill();
        g.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 6 + x)})`; g.beginPath(); g.arc(-r * 0.16, -r * 0.1, r * 0.12, 0, 7); g.fill();
    }
    g.save(); g.translate(-r * 1.1, r * 0.25); g.rotate(-gap); g.translate(r * 1.1, -r * 0.25);   // top shell, hinged on the left
    const top = g.createLinearGradient(0, -r, 0, r * 0.3); top.addColorStop(0, '#fef3c7'); top.addColorStop(1, '#d6b47a');
    g.fillStyle = top; g.beginPath(); g.ellipse(0, r * 0.25, r * 1.15, r * 0.85, 0, Math.PI, 0); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(120,53,15,.4)'; g.lineWidth = 1.2;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-r * 1.0, r * 0.2); g.quadraticCurveTo(k * r * 0.25, -r * 0.6, k * r * 0.45, r * 0.22); g.stroke(); }
    g.restore();
    if (!open) {   // sleepy eyes
        g.strokeStyle = '#78350f'; g.lineWidth = 1.6;
        for (const ex of [-0.35, 0.35]) { g.beginPath(); g.arc(ex * r, -r * 0.05, r * 0.14, 0.2, Math.PI - 0.2); g.stroke(); }
    }
    g.restore();
}
function eel(g, x, y, r, t) {
    g.save(); g.translate(x, y);
    g.strokeStyle = '#7c3aed'; g.lineWidth = r * 0.5; g.lineCap = 'round'; g.beginPath();   // the tail, wriggling
    for (let k = 0; k <= 8; k++) { const f = k / 8, xx = r * 0.4 + f * r * 1.5, yy = Math.sin(t * 8 - f * 5 + x * 9) * r * 0.35 * f; k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
    g.stroke();
    const body = g.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r * 1.05); body.addColorStop(0, '#c4b5fd'); body.addColorStop(1, '#6d28d9');
    g.fillStyle = body; g.strokeStyle = '#2e1065'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 1.02, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fde047'; g.font = `${Math.round(r * 1.15)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 10 + x * 20); g.fillText('⚡', 0, 1); g.globalAlpha = 1;
    g.restore();
}
function puffer(g, x, y, r, hp, t) {
    // a pufferfish: small and spiky, then swollen and twitchy after the first hit
    const big = hp === 1, R = r * (big ? 1.35 + Math.sin(t * 14) * 0.06 : 1);
    g.save(); g.translate(x, y);
    g.strokeStyle = '#a16207'; g.lineWidth = 2;
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85); g.lineTo(Math.cos(a) * R * 1.25, Math.sin(a) * R * 1.25); g.stroke(); }
    const body = g.createRadialGradient(-R * 0.3, -R * 0.35, 1, 0, 0, R);
    body.addColorStop(0, '#fef9c3'); body.addColorStop(1, big ? '#f97316' : '#facc15');
    g.fillStyle = body; g.strokeStyle = '#78350f'; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-R * 0.35, -R * 0.2, R * 0.28, 0, 7); g.arc(R * 0.35, -R * 0.2, R * 0.28, 0, 7); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(-R * 0.3, -R * 0.18, R * 0.13, 0, 7); g.arc(R * 0.3, -R * 0.18, R * 0.13, 0, 7); g.fill();
    g.strokeStyle = '#78350f'; g.lineWidth = 1.6; g.beginPath(); if (big) g.arc(0, R * 0.32, R * 0.16, 0, 7); else g.arc(0, R * 0.2, R * 0.18, 0.2, Math.PI - 0.2); g.stroke();
    g.restore();
}
function chest(g, x, y, r, t) {
    // a little treasure chest, glinting
    g.save(); g.translate(x, y);
    const gl = g.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2); gl.addColorStop(0, `rgba(253,224,71,${0.35 + 0.2 * Math.sin(t * 4 + x)})`); gl.addColorStop(1, 'rgba(253,224,71,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 2, 0, 7); g.fill();
    g.fillStyle = '#92400e'; g.strokeStyle = '#451a03'; g.lineWidth = 2;
    g.beginPath(); g.rect(-r, -r * 0.2, r * 2, r * 1.05); g.fill(); g.stroke();
    g.fillStyle = '#b45309'; g.beginPath(); g.moveTo(-r, -r * 0.2); g.quadraticCurveTo(0, -r * 1.1, r, -r * 0.2); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fbbf24'; g.fillRect(-r, -r * 0.28, r * 2, r * 0.18); g.fillRect(-r * 0.18, -r * 0.4, r * 0.36, r * 0.75);
    if (Math.sin(t * 3 + x * 9) > 0.9) { g.fillStyle = '#fff'; g.font = `${Math.round(r)}px sans-serif`; g.textAlign = 'center'; g.fillText('✦', r * 0.6, -r * 0.6); }
    g.restore();
}
function whirl(g, x, y, r, t, hue, dir) {
    // a whirlpool: a glowing spiral turning
    g.save(); g.translate(x, y);
    const gl = g.createRadialGradient(0, 0, 1, 0, 0, r * 1.6); gl.addColorStop(0, `hsla(${hue},90%,75%,.6)`); gl.addColorStop(1, `hsla(${hue},90%,60%,0)`);
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 1.6, 0, 7); g.fill();
    for (let arm = 0; arm < 3; arm++) {
        g.strokeStyle = `hsla(${hue},95%,${70 + arm * 8}%,.9)`; g.lineWidth = 2.5; g.beginPath();
        for (let k = 0; k <= 20; k++) { const f = k / 20, a = dir * t * 4 + arm * 2.094 + f * 4.5, rr = r * (1.2 - f); k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        g.stroke();
    }
    g.fillStyle = '#082f49'; g.beginPath(); g.arc(0, 0, r * 0.25, 0, 7); g.fill();
    g.restore();
}
function lift(g, P, lx, top, bottom, w, t) {
    // a bubble lift: a shimmering column and bubbles streaming up
    const x0 = P(lx - w / 2), wd = P(w), y0 = P(top), ht = P(bottom - top);
    const col = g.createLinearGradient(x0, 0, x0 + wd, 0); col.addColorStop(0, 'rgba(186,230,253,0)'); col.addColorStop(0.5, 'rgba(186,230,253,.22)'); col.addColorStop(1, 'rgba(186,230,253,0)');
    g.fillStyle = col; g.fillRect(x0, y0, wd, ht);
    for (let k = 0; k < 9; k++) {
        const f = ((t * 0.55 + k / 9) % 1), by = y0 + ht * (1 - f), bx = x0 + wd * (0.3 + 0.4 * ((k * 37) % 10) / 10) + Math.sin(t * 5 + k) * 3;
        g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - f * 0.6)})`; g.lineWidth = 1.5; g.beginPath(); g.arc(bx, by, 2 + (k % 3), 0, 7); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = `${Math.round(wd * 0.5)}px sans-serif`; g.textAlign = 'center'; g.fillText('⬆', x0 + wd / 2, P(bottom) - 4);
}
function angler(g, P, a, t, pull) {
    // an anglerfish: a dark round fish with teeth, a lure on a stalk glowing over it, and its reach as a soft ring
    const [x, y, reach] = a, X = P(x), Y = P(y), R = P(L.ANGLER_R);
    for (let k = 0; k < 3; k++) { const f = ((t * 0.5 + k / 3) % 1); g.strokeStyle = `rgba(253,224,71,${0.14 * (1 - f) + pull * 0.1})`; g.lineWidth = 2; g.beginPath(); g.arc(X, Y, P(reach) * (1 - f * 0.8), 0, 7); g.stroke(); }
    g.save(); g.translate(X, Y);
    const body = g.createRadialGradient(-R * 0.3, -R * 0.3, 1, 0, 0, R * 1.2); body.addColorStop(0, '#475569'); body.addColorStop(1, '#0f172a');
    g.fillStyle = body; g.strokeStyle = '#020617'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(R * 1.1, 0); g.lineTo(R * 1.7, -R * 0.6); g.lineTo(R * 1.7, R * 0.6); g.closePath(); g.fill();   // tail
    g.beginPath(); g.arc(0, 0, R * 1.1, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-R * 0.9 + k * R * 0.32, R * 0.35); g.lineTo(-R * 0.75 + k * R * 0.32, R * 0.62); g.lineTo(-R * 0.6 + k * R * 0.32, R * 0.35); g.fill(); }
    g.fillStyle = '#fde047'; g.beginPath(); g.arc(-R * 0.35, -R * 0.3, R * 0.2, 0, 7); g.fill();
    g.strokeStyle = '#64748b'; g.lineWidth = 2; const lx = -R * 0.2 + Math.sin(t * 2) * R * 0.3, ly = -R * 2.1 + Math.cos(t * 3) * R * 0.2;
    g.beginPath(); g.moveTo(0, -R); g.quadraticCurveTo(R * 0.6, -R * 2.2, lx, ly); g.stroke();
    const glow = g.createRadialGradient(lx, ly, 1, lx, ly, R * (0.9 + pull)); glow.addColorStop(0, 'rgba(254,249,195,1)'); glow.addColorStop(0.4, 'rgba(253,224,71,.8)'); glow.addColorStop(1, 'rgba(253,224,71,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(lx, ly, R * (0.9 + pull), 0, 7); g.fill();
    g.restore();
}
function starfish(g, x, y, r, t, hit) {
    // a starfish: five arms, spinning (faster just after it flings the pearl)
    g.save(); g.translate(x, y); g.rotate(t * (1.2 + hit * 8)); g.scale(1 + hit * 0.25, 1 + hit * 0.25);
    g.fillStyle = '#fb923c'; g.strokeStyle = '#9a3412'; g.lineWidth = 2; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.5 : r * 1.25; k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fed7aa'; for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.1, 0, 7); g.fill(); }
    g.restore();
}
function goldOyster(g, x, y, r, hp, t) {
    // a golden oyster: gilded, glowing, with pips for the hits it still needs
    const gl = g.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2); gl.addColorStop(0, `rgba(253,224,71,${0.45 + 0.2 * Math.sin(t * 5 + x)})`); gl.addColorStop(1, 'rgba(253,224,71,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 2.2, 0, 7); g.fill();
    g.save(); g.filter = 'sepia(1) saturate(3) brightness(1.15)'; oyster(g, x, y, r, hp >= 2 ? 2 : 1, t); g.restore();
    for (let k = 0; k < 3; k++) { g.fillStyle = k < hp ? '#fde047' : 'rgba(255,255,255,.3)'; g.strokeStyle = '#78350f'; g.lineWidth = 1; g.beginPath(); g.arc(x - r * 0.6 + k * r * 0.6, y + r * 1.15, r * 0.18, 0, 7); g.fill(); g.stroke(); }
}
function current(g, P, x0, y0, x1, y1, ax, t) {
    // a current: a band of flowing streaks and arrows the way it pushes
    const X0 = P(x0), Y0 = P(y0), Wd = P(x1 - x0), Ht = P(y1 - y0), dir = Math.sign(ax);
    g.fillStyle = 'rgba(125,211,252,.13)'; g.fillRect(X0, Y0, Wd, Ht);
    g.strokeStyle = 'rgba(224,242,254,.55)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
        const f = ((t * 0.6 * dir + k / 7) % 1 + 1) % 1, sx = X0 + Wd * f, sy = Y0 + Ht * (0.2 + 0.6 * ((k * 37) % 10) / 10);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - dir * 14, sy); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = `${Math.round(Ht * 0.8)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const f of [0.25, 0.75]) g.fillText(dir > 0 ? '➜' : '⬅', X0 + Wd * f, Y0 + Ht / 2);
    g.textBaseline = 'alphabetic';
}
function clam(g, P, c, t, layer) {
    // a giant clam: two big ridged shells swinging open and shut
    const [x, y] = c, X = P(x), Y = P(y), R = P(L.CLAM_R), open = Math.max(0, Math.min(1, (0.3 - Math.sin((2 * Math.PI * t) / c[2] + (c[3] || 0))) * 2.5));
    // open, it sits behind what's inside (so you see your target); shut, it covers it
    if ((layer === 'back') !== (open > 0.5)) return;
    g.save(); g.translate(X, Y);
    const half = (sgn) => {
        g.save(); g.rotate(sgn * open * 1.25);
        const sh = g.createLinearGradient(0, -R, 0, R); sh.addColorStop(0, '#e9d5ff'); sh.addColorStop(1, '#a855f7');
        g.fillStyle = sh; g.strokeStyle = '#581c87'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(-R, 0); g.quadraticCurveTo(-R, sgn * -R * 1.15, 0, sgn * -R * 1.05); g.quadraticCurveTo(R, sgn * -R * 1.15, R, 0); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = 'rgba(88,28,135,.45)'; g.lineWidth = 1.5;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * R * 0.15, 0); g.lineTo(k * R * 0.42, sgn * -R * 0.95); g.stroke(); }
        g.restore();
    };
    if (open > 0.05) { g.fillStyle = 'rgba(244,114,182,.35)'; g.beginPath(); g.arc(0, 0, R * 0.8, 0, 7); g.fill(); }
    half(1); half(-1);
    g.restore();
}
function rock(g, x, y, r, i) {
    g.save(); g.translate(x, y);
    const f = g.createLinearGradient(0, -r, 0, r); f.addColorStop(0, '#a8a29e'); f.addColorStop(1, '#57534e');
    g.fillStyle = f; g.strokeStyle = '#292524'; g.lineWidth = 2; g.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = r * (0.88 + rnd(i, k) * 0.24); k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke();
    g.restore();
}
function jelly(g, x, y, r, t, sq) {
    const pulse = 1 + Math.sin(t * 4 + x * 7) * 0.07 - sq * 0.35;
    g.save(); g.translate(x, y);
    g.strokeStyle = 'rgba(244,114,182,.75)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let k = -2; k <= 2; k++) {   // tentacles trailing
        g.beginPath(); g.moveTo(k * r * 0.32, r * 0.2);
        for (let s = 1; s <= 5; s++) g.lineTo(k * r * 0.32 + Math.sin(t * 5 + s + k) * r * 0.18, r * 0.2 + s * r * 0.3);
        g.stroke();
    }
    g.scale(1 / pulse, pulse);
    const bell = g.createRadialGradient(-r * 0.2, -r * 0.4, 1, 0, -r * 0.1, r * 1.1);
    bell.addColorStop(0, 'rgba(255,255,255,.95)'); bell.addColorStop(0.5, 'rgba(249,168,212,.85)'); bell.addColorStop(1, 'rgba(219,39,119,.6)');
    g.fillStyle = bell; g.strokeStyle = 'rgba(131,24,67,.7)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, r * 0.2, r, Math.PI, 0); g.quadraticCurveTo(r * 0.5, r * 0.45, 0, r * 0.3); g.quadraticCurveTo(-r * 0.5, r * 0.45, -r, r * 0.2); g.fill(); g.stroke();
    g.fillStyle = '#831843'; for (const ex of [-0.32, 0.32]) { g.beginPath(); g.arc(ex * r, -r * 0.1, r * 0.1, 0, 7); g.fill(); }
    g.restore();
}

// ---- Shelly ------------------------------------------------------------------------
function shelly(g, P, lv, s, t) {
    const x = L.crabX(lv, s.t), dx = x - _crab.x; _crab.x = x;
    if (Math.abs(dx) > 1e-4) _crab.dir = dx > 0 ? 1 : -1;
    const mood = _crab.mood && t - _crab.t < 1.6 ? _crab.mood : L.cleared(s) ? 'dance' : '';
    const X = P(x), base = P(L.CRAB_Y) + 2, Wd = P(L.CRAB_W);
    const hop = mood === 'yum' ? Math.abs(Math.sin((t - _crab.t) * 9)) * 14 * Math.max(0, 1 - (t - _crab.t) / 1.2) : mood === 'dance' ? Math.abs(Math.sin(t * 7)) * 8 : 0;
    const walk = Math.abs(dx) > 1e-4 ? t * 22 : 0;
    g.save(); g.translate(X, base - hop);
    if (mood === 'dance') g.rotate(Math.sin(t * 7) * 0.15);
    // legs
    g.strokeStyle = '#b91c1c'; g.lineWidth = 3; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) for (const side of [-1, 1]) {
        const lx = side * Wd * (0.18 + k * 0.1), kick = Math.sin(walk + k * 2 + (side > 0 ? 1 : 0)) * 4;
        g.beginPath(); g.moveTo(lx * 0.6, -Wd * 0.12); g.lineTo(lx + kick, -2); g.stroke();
    }
    // body
    g.fillStyle = '#ef4444'; g.strokeStyle = '#7f1d1d'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(_crab.dir * Wd * 0.18, -Wd * 0.2, Wd * 0.22, Wd * 0.14, 0, 0, 7); g.fill(); g.stroke();
    // claws: up in the air when happy, snapping now and then
    const up = mood === 'yum' || mood === 'dance', snap = Math.max(0, Math.sin(t * 2.3)) > 0.97 ? 0.5 : 0.15;
    for (const side of [-1, 1]) {
        const cx = _crab.dir * Wd * 0.18 + side * Wd * 0.26, cy = up ? -Wd * 0.62 : -Wd * 0.22;
        g.strokeStyle = '#b91c1c'; g.lineWidth = 3; g.beginPath(); g.moveTo(_crab.dir * Wd * 0.18 + side * Wd * 0.12, -Wd * 0.2); g.lineTo(cx, cy); g.stroke();
        g.fillStyle = '#f87171'; g.strokeStyle = '#7f1d1d'; g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, Wd * 0.09, -snap + (up ? -Math.PI / 2 : 0), Math.PI * 2 - snap * 2 + (up ? -Math.PI / 2 : 0)); g.lineTo(cx, cy); g.fill(); g.stroke();
    }
    // the shell: a spiral on her back, the mouth facing up to catch pearls
    const sx = -_crab.dir * Wd * 0.12, sy = -Wd * 0.38, sr = Wd * 0.36;
    const sh = g.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, 2, sx, sy, sr);
    sh.addColorStop(0, '#fef3c7'); sh.addColorStop(0.6, '#fbbf24'); sh.addColorStop(1, '#b45309');
    g.fillStyle = sh; g.strokeStyle = '#78350f'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(120,53,15,.65)'; g.lineWidth = 2; g.beginPath();
    for (let k = 0; k <= 40; k++) { const f = k / 40, a = f * Math.PI * 4.2 * -_crab.dir, rr = sr * (0.85 - f * 0.75); k ? g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr) : g.moveTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    g.stroke();
    g.fillStyle = '#451a03'; g.beginPath(); g.ellipse(sx, sy - sr * 0.78, sr * 0.55, sr * 0.2, 0, 0, 7); g.fill();   // the opening
    // eyes on stalks, looking at the pearl (or the launcher)
    const tx = s.flying ? P(s.x) : P(L.LAUNCH[0]), ty = s.flying ? P(s.y) : P(L.LAUNCH[1]);
    for (const side of [-1, 1]) {
        const ex = _crab.dir * Wd * 0.3 + side * Wd * 0.07, ey = -Wd * 0.48;
        g.strokeStyle = '#b91c1c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(ex, -Wd * 0.28); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = '#fff'; g.strokeStyle = '#1f2937'; g.lineWidth = 1.5; g.beginPath(); g.arc(ex, ey, Wd * 0.065, 0, 7); g.fill(); g.stroke();
        const a = Math.atan2(ty - (base - hop + ey), tx - (X + ex));
        g.fillStyle = '#111827'; g.beginPath(); g.arc(ex + Math.cos(a) * Wd * 0.03, ey + Math.sin(a) * Wd * 0.03, Wd * 0.032, 0, 7); g.fill();
    }
    if (mood === 'aww') { g.fillStyle = '#7dd3fc'; g.beginPath(); g.arc(_crab.dir * Wd * 0.42, -Wd * 0.62 + ((t - _crab.t) * 18 % 10), 3, 0, 7); g.fill(); }
    g.restore();
    if (mood === 'yum' || mood === 'aww') {   // a speech bubble
        const txt = mood === 'yum' ? 'YUM! +1 🫧' : 'aww…', a = Math.max(0, 1 - (t - _crab.t) / 1.6);
        g.globalAlpha = a; g.font = '900 13px Nunito, sans-serif'; g.textAlign = 'center';
        const w = g.measureText(txt).width + 14, by = base - P(L.CRAB_W) * 0.95 - hop;
        g.fillStyle = '#fff'; g.strokeStyle = '#2b1240'; g.lineWidth = 2;
        g.beginPath(); g.roundRect ? g.roundRect(X - w / 2, by - 20, w, 22, 9) : g.rect(X - w / 2, by - 20, w, 22); g.fill(); g.stroke();
        g.fillStyle = '#2b1240'; g.fillText(txt, X, by - 4); g.globalAlpha = 1;
    }
}

// ---- the scene -----------------------------------------------------------------------
function scene(g, P, t) {
    const w = P(L.W), h = P(L.H);
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#22d3ee'); bg.addColorStop(0.35, '#0e7490'); bg.addColorStop(1, '#083344');
    g.fillStyle = bg; g.fillRect(-10, -10, w + 20, h + 20);
    // light rays, drifting
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
        const x0 = w * (0.15 + k * 0.25) + Math.sin(t * 0.3 + k) * 20;
        const ray = g.createLinearGradient(0, 0, 0, h * 0.8); ray.addColorStop(0, 'rgba(255,255,255,.13)'); ray.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = ray; g.beginPath(); g.moveTo(x0 - 14, 0); g.lineTo(x0 + 14, 0); g.lineTo(x0 + 60, h * 0.8); g.lineTo(x0 - 10, h * 0.8); g.closePath(); g.fill();
    }
    g.restore();
    // kelp at the sides
    for (const [x0, ht, ph] of [[0.03, 0.55, 0], [0.08, 0.4, 1.3], [0.95, 0.6, 2.1], [0.9, 0.38, 3]]) {
        g.strokeStyle = 'rgba(21,128,61,.75)'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(P(x0), P(L.FLOOR_Y) + 6);
        for (let k = 1; k <= 8; k++) { const f = k / 8; g.lineTo(P(x0) + Math.sin(t * 1.2 + ph + f * 3) * 9 * f, P(L.FLOOR_Y) - P(ht) * f); }
        g.stroke();
    }
    // bubbles rising
    for (const b of BUBBLES) {
        const y = h - ((t * b.sp + b.ph) % 1.6) / 1.6 * (h + 20), x = P(b.x) + Math.sin(t * 2 + b.ph) * 6;
        g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, b.r, 0, 7); g.stroke();
    }
    // the sand, with ripples and a few shells
    const sand = g.createLinearGradient(0, P(L.FLOOR_Y), 0, h); sand.addColorStop(0, '#fde68a'); sand.addColorStop(1, '#d97706');
    g.fillStyle = sand; g.beginPath(); g.moveTo(0, P(L.FLOOR_Y) + 4);
    for (let k = 0; k <= 20; k++) g.lineTo((k / 20) * w, P(L.FLOOR_Y) + 4 + Math.sin(k * 1.7) * 2);
    g.lineTo(w, h + 10); g.lineTo(0, h + 10); g.closePath(); g.fill();
    g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [x, e] of [[0.12, '🐚'], [0.42, '⭐'], [0.78, '🐚']]) g.fillText(e, P(x), h - 8);
}

const game = aimGame({
    ...L,
    meta: { id: 'reefdrop', icon: '🪸', title: 'Reef Drop', blurb: `Drop pearls into a moving reef. Free every sleepy oyster, and land pearls in Shelly the hermit crab\'s shell to get them back. ${L.LEVELS.length} reefs.` },
    intro: 'Pull back to aim, let go to drop a pearl. Hit every <b>oyster twice</b> to free it. ⚡ Eels zap what\'s near them. 🦀 Land a pearl in <b>Shelly\'s shell</b> and you get it back!',
    hud: (lv, s) => `🦪 ${s.pegs.filter(p => (p.kind === 'o' || p.kind === 'g') && p.alive).length} · 🫧 ${s.left} · ${s.score}`,
    doneText: (lv, s) => `${s.score} points · ${s.left} pearl${s.left === 1 ? '' : 's'} left${s.caught ? ` · Shelly caught ${s.caught}` : ''}`,
    threeStars: () => '★★★ with 5 pearls left',
    react(ev, fx, s) {
        const t = now();
        ev.popped.forEach((p, k) => {
            const [x, y] = L.pegAt(p, s.t);
            _pops.push({ x, y, kind: p.kind, pts: ev.points[k], t });
            fx.burst(x, y, p.kind === 'o' ? '#fde047' : p.kind === 'e' ? '#a78bfa' : '#fb7185', p.kind === 'o' ? 20 : 7, p.kind === 'o' ? 0.55 : 0.35);
        });
        if (ev.popped.length) { fx.sfx(ev.popped.some(p => p.kind === 'o') ? 'coin_gain' : 'land_good'); fx.buzz(8); }
        ev.opened.forEach(p => { const [x, y] = L.pegAt(p, s.t); fx.burst(x, y, '#fef3c7', 8, 0.3); fx.sfx('gate_open'); });
        ev.zapped.forEach(p => { const [x, y] = L.pegAt(p, s.t); _zaps.push({ x, y, t }); fx.sfx('boost'); fx.shake(6); fx.buzz([20, 20, 40]); });
        if (ev.jelly) { fx.sfx('dice_land'); _jellyHit = { x: s.x, y: s.y, rt: s.t, t }; }
        if (ev.landed === 'crab') { _crab = { ..._crab, mood: 'yum', t }; fx.sfx('win'); fx.buzz([30, 30, 60]); fx.burst(s.x, L.FLOOR_Y - 0.03, '#fde047', 24, 0.6); say(`🦀 CAUGHT! ×${L.CATCH_X}`, '#fde047', true); }
        else if (ev.landed === 'sand') { fx.sfx('dice_land'); if (Math.abs(s.x - _crab.x) < 0.22) _crab = { ..._crab, mood: 'aww', t }; }
        if (ev.bonus) { say('🫧 BIG CHAIN! +1 PEARL', '#fff', true); fx.buzz([40, 30, 80]); }
        ev.star.forEach(p => { _starHit.set(p, t); fx.sfx('dice_land'); fx.buzz(10); });
        ev.golden.forEach(p => { const [x, y] = L.pegAt(p, s.t); fx.burst(x, y, '#fde047', 34, 0.8); fx.sfx('win'); fx.buzz([40, 30, 80]); say('🟡 GOLDEN PEARL! +1 🫧', '#fde047', true); });
        if (ev.clam) fx.sfx('gate_close');
        ev.puffed.forEach(p => { const [x, y] = L.pegAt(p, s.t); fx.burst(x, y, '#fde047', 6, 0.25); fx.sfx('boost'); fx.buzz(15); });
        ev.burst.forEach(p => { const [x, y] = L.pegAt(p, s.t); _bursts.push({ x, y, t }); fx.burst(x, y, '#fb923c', 26, 0.8); fx.shake(9); fx.sfx('win'); fx.buzz([30, 20, 60]); });
        if (ev.burst.length) say(ev.burst.length > 1 ? `🐡 CHAIN BURST ×${ev.burst.length}!` : '🐡 KABOOM!', '#fb923c', true);
        if (ev.chest.length) { const [x, y] = L.pegAt(ev.chest[0], s.t); fx.burst(x, y, '#fbbf24', 28, 0.7); fx.sfx('coin_gain'); say('💰 TREASURE! THIS SHOT ×2', '#fde047', true); }
        if (ev.warped) { _warps.push({ x: s.x, y: s.y, t }); fx.sfx('gate_open'); }
    },
    draw(g, P, lv, s, t) {
        if (lv.name !== _name) { _name = lv.name; _pops = []; _zaps = []; _bursts = []; _warps = []; _banner = null; _crab = { mood: '', t: 0, x: L.crabX(lv, s.t), dir: 1 }; _squish = new Map(); }
        if (s.flying && !_wasFlying) _launch = t;
        _wasFlying = s.flying;
        const w = P(L.W);
        scene(g, P, t);
        // the launcher: a clam that snaps open as it fires
        const [lx, ly] = L.LAUNCH, open = Math.max(0, 1 - (t - _launch) * 3);
        g.save(); g.translate(P(lx), P(ly));
        g.fillStyle = '#f472b6'; g.strokeStyle = '#2b1240'; g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, 17, 0, Math.PI); g.fill(); g.stroke();
        g.save(); g.rotate(-open * 0.6); g.beginPath(); g.arc(0, 0, 17, Math.PI, 0); g.fillStyle = '#f9a8d4'; g.fill(); g.stroke(); g.restore();
        if (!s.flying && !L.failed(lv, s) && !L.cleared(s)) { g.fillStyle = '#fff7ed'; g.beginPath(); g.arc(0, 4, P(L.R), 0, 7); g.fill(); g.strokeStyle = '#2b1240'; g.lineWidth = 2; g.stroke(); }
        g.restore();
        // bubble lifts and whirlpools (each pair shares a colour)
        for (const [lx, top, bottom, w] of lv.lifts || []) lift(g, P, lx, top, bottom, w, t);
        (lv.whirls || []).forEach(([ax, ay, bx, by], k) => { const hue = [190, 280, 140][k % 3]; whirl(g, P(ax), P(ay), P(L.WHIRL_R), t, hue, 1); whirl(g, P(bx), P(by), P(L.WHIRL_R), t, hue, -1); });
        // jellyfish
        for (const j of lv.jellies || []) {
            const [jx, jy, jr] = L.jellyAt(j, s.t);
            if (_jellyHit) { const [hx, hy] = L.jellyAt(j, _jellyHit.rt); if (Math.hypot(hx - _jellyHit.x, hy - _jellyHit.y) < jr + L.R + 0.02) _squish.set(j, _jellyHit.t); }
            jelly(g, P(jx), P(jy), P(jr), t, Math.max(0, 1 - (t - (_squish.get(j) || -9)) * 4));
        }
        _jellyHit = null;
        for (const c of lv.currents || []) current(g, P, ...c, t);
        for (const c of lv.clams || []) clam(g, P, c, s.t, 'back');
        // anglerfish (the lure glows brighter as the pearl comes near)
        for (const a of lv.anglers || []) { const d = s.flying ? Math.hypot(s.x - a[0], s.y - a[1]) : 9; angler(g, P, a, t, Math.max(0, 1 - d / a[2]) * 0.8); }
        // wheel hubs (so a turning wheel reads as one)
        const hubs = new Map();
        for (const p of s.pegs) if (p.orbit) hubs.set(`${p.orbit[0]},${p.orbit[1]},${p.orbit[2]}`, p.orbit);
        for (const [cx, cy, r] of hubs.values()) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.setLineDash([4, 6]); g.beginPath(); g.arc(P(cx), P(cy), P(r), 0, 7); g.stroke(); g.setLineDash([]); }
        // the reef
        s.pegs.forEach((p, i) => {
            if (!p.alive) return;
            const [px, py] = L.pegAt(p, s.t), x = P(px), y = P(py), r = P(L.PEG_R) * 1.25, wob = Math.sin(t * 2 + i);
            const on = L.solid(p, s.t);
            if (p.blink) {
                const ph = Math.sin((2 * Math.PI * s.t) / p.blink[0] + (p.blink[1] || 0)), edge = Math.abs(ph + 0.15) < 0.18;
                g.globalAlpha = on ? (edge ? 0.55 + 0.45 * Math.sin(t * 40) : 1) : 0.18;
                if (!on) { g.strokeStyle = 'rgba(224,242,254,.8)'; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, r * 1.05, 0, 7); g.stroke(); g.setLineDash([]); }
            }
            if (p.kind === 'c') coral(g, x, y + wob, r, wob);
            else if (p.kind === 'o') oyster(g, x, y + wob * 0.6, r, p.hp, t);
            else if (p.kind === 'g') goldOyster(g, x, y + wob * 0.6, r, p.hp, t);
            else if (p.kind === 's') starfish(g, x, y, r, t, Math.max(0, 1 - (t - (_starHit.get(p) || -9)) * 3));
            else if (p.kind === 'e') eel(g, x, y + wob, r, t);
            else if (p.kind === 'p') puffer(g, x, y + wob, r, p.hp, t);
            else if (p.kind === 't') chest(g, x, y + wob * 0.5, r, t);
            else rock(g, x, y, r, i);
            g.globalAlpha = 1;
        });
        for (const c of lv.clams || []) clam(g, P, c, s.t, 'front');
        // pops: a puff and the points, floating up
        _pops = _pops.filter(p => t - p.t < 0.9);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const p of _pops) {
            const k = (t - p.t) / 0.9;
            if (k < 0.35) { g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k / 0.35)})`; g.lineWidth = 3; g.beginPath(); g.arc(P(p.x), P(p.y), P(L.PEG_R) * (1 + k * 4), 0, 7); g.stroke(); }
            g.globalAlpha = 1 - k; g.fillStyle = p.kind === 'o' ? '#fde047' : '#fff'; g.strokeStyle = '#2b1240'; g.lineWidth = 3;
            g.font = `900 ${p.kind === 'o' ? 17 : 12}px Nunito, sans-serif`;
            g.strokeText(`+${p.pts}`, P(p.x), P(p.y) - k * 30); g.fillText(`+${p.pts}`, P(p.x), P(p.y) - k * 30);
            g.globalAlpha = 1;
        }
        // zaps: a crackle round each eel that went off
        _bursts = _bursts.filter(b => t - b.t < 0.5);
        for (const b of _bursts) { const k = (t - b.t) / 0.5; g.strokeStyle = `rgba(251,146,60,${1 - k})`; g.lineWidth = 6 * (1 - k) + 1; g.beginPath(); g.arc(P(b.x), P(b.y), P(L.BOMB_R) * (0.3 + k * 0.8), 0, 7); g.stroke(); g.fillStyle = `rgba(254,240,138,${0.35 * (1 - k)})`; g.fill(); }
        _warps = _warps.filter(w => t - w.t < 0.4);
        for (const w of _warps) { const k = (t - w.t) / 0.4; g.strokeStyle = `rgba(165,243,252,${1 - k})`; g.lineWidth = 3; g.beginPath(); g.arc(P(w.x), P(w.y), P(L.WHIRL_R) * (1 + k * 2), 0, 7); g.stroke(); }
        _zaps = _zaps.filter(z => t - z.t < 0.4);
        for (const z of _zaps) {
            g.strokeStyle = `rgba(253,224,71,${1 - (t - z.t) / 0.4})`; g.lineWidth = 2.5;
            for (let k = 0; k < 7; k++) {
                const a = k * 0.9 + t * 30; g.beginPath(); g.moveTo(P(z.x), P(z.y));
                for (let s2 = 1; s2 <= 3; s2++) g.lineTo(P(z.x + Math.cos(a + (s2 % 2 ? 0.3 : -0.3)) * L.ZAP_R * s2 / 3), P(z.y + Math.sin(a + (s2 % 2 ? 0.3 : -0.3)) * L.ZAP_R * s2 / 3));
                g.stroke();
            }
        }
        shelly(g, P, lv, s, t);
        // the pearl, with a shimmering trail
        if (s.flying) {
            _trail.unshift([s.x, s.y]); if (_trail.length > 14) _trail.pop();
            _trail.forEach(([x, y], k) => { g.globalAlpha = 0.35 * (1 - k / 14); g.fillStyle = '#fff'; g.beginPath(); g.arc(P(x), P(y), P(L.R) * (1 - k / 18), 0, 7); g.fill(); });
            g.globalAlpha = 1;
            const pg = g.createRadialGradient(P(s.x) - 3, P(s.y) - 3, 1, P(s.x), P(s.y), P(L.R)); pg.addColorStop(0, '#fff'); pg.addColorStop(1, '#fbcfe8');
            g.fillStyle = pg; g.beginPath(); g.arc(P(s.x), P(s.y), P(L.R), 0, 7); g.fill(); g.strokeStyle = '#2b1240'; g.lineWidth = 2; g.stroke();
        } else _trail = [];
        if (s.flying && s.double) { g.font = '900 16px "Bebas Neue", Nunito, sans-serif'; g.fillStyle = '#fde047'; g.strokeStyle = '#2b1240'; g.lineWidth = 3; g.textAlign = 'center'; g.strokeText('×2', P(s.x) + 16, P(s.y) - 12); g.fillText('×2', P(s.x) + 16, P(s.y) - 12); }
        // the chain while it grows, and banners
        if (s.flying && s.chain > 1) {
            const sc = 1 + Math.min(0.6, s.chain * 0.03);
            g.save(); g.translate(w / 2, P(0.2)); g.scale(sc, sc);
            g.fillStyle = s.chain >= L.BIG_CHAIN ? '#4ade80' : '#fde047'; g.strokeStyle = '#2b1240'; g.lineWidth = 4; g.font = '900 22px "Bebas Neue", Nunito, sans-serif';
            g.strokeText(`CHAIN ×${s.chain}`, 0, 0); g.fillText(`CHAIN ×${s.chain}`, 0, 0); g.restore();
        }
        if (_banner && t - _banner.t < 1.4) {
            const k = Math.min(1, (t - _banner.t) * 6), a = t - _banner.t > 1 ? 1 - (t - _banner.t - 1) / 0.4 : 1;
            g.save(); g.globalAlpha = a; g.translate(w / 2, P(0.32)); g.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
            g.fillStyle = _banner.color; g.strokeStyle = '#2b1240'; g.lineWidth = 5; g.font = `900 ${_banner.big ? 26 : 20}px "Bebas Neue", Nunito, sans-serif`;
            g.strokeText(_banner.text, 0, 0); g.fillText(_banner.text, 0, 0); g.restore();
        }
        g.textBaseline = 'alphabetic';
    },
});
let _name = "", _wasFlying = false, _trail = [], _jellyHit = null;

export const { meta, bestText, mount, unmount, play, shoot, _debug } = game;
