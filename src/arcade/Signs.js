// ============================================================
// PICTURE SIGNS — the little looping pictures on the lair's signposts. No words: a ghost crab acts the rule out.
//
// drawSign(ctx, kind, t) paints one frame (t in seconds; each picture loops every LOOP s) onto a 256 x 192 canvas.
// The 3D post and board are LairScreen's; this is only the drawing, so it can be used (and looked at) anywhere.
//
// kinds: slide · push · crack · plate · ramp · lava · (World 1) pick · throw · bounce · vent · current · gull · bullseye · climb
// ============================================================

export const SIGN_W = 256, SIGN_H = 192, LOOP = 4;

const INK = '#2b1d33', PAPER = '#fff4dc', GLASS = '#3a2f4e', SEAM = '#ff8a2a', CRAB = '#ff5a4e', NUT = '#8a5a32', PLATE = '#ffc83a', GO = '#4ade80', LAVA = '#ff6a1f', SAND = '#f2d9a6', SEA = '#5fc7e8';
const ease = k => k * k * (3 - 2 * k), clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), seg = (t, a, b) => ease(clamp((t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;

function crab(g, x, y, s = 1, ghost = 1) {
    g.save(); g.globalAlpha = ghost; g.translate(x, y); g.scale(s, s);
    g.fillStyle = CRAB; g.strokeStyle = INK; g.lineWidth = 3;
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 15, -6, 6, 0, Math.PI * 2); g.fill(); g.stroke(); }       // claws
    g.beginPath(); g.ellipse(0, 2, 14, 10, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 5, -8, 3.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = INK; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 5, -8, 1.5, 0, Math.PI * 2); g.fill(); }
    g.restore();
}
function nut(g, x, y, r = 8) { g.fillStyle = NUT; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = INK; for (const a of [-0.6, 0, 0.6]) { g.beginPath(); g.arc(x + Math.sin(a) * r * 0.45, y - r * 0.35, 1.4, 0, Math.PI * 2); g.fill(); } }
function box(g, x, y, w, h, fill, line = INK, lw = 3) { g.fillStyle = fill; g.strokeStyle = line; g.lineWidth = lw; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 5) : g.rect(x, y, w, h); g.fill(); g.stroke(); }
function pillar(g, x, y) { box(g, x - 13, y - 16, 26, 32, '#241d30'); g.fillStyle = '#8a74c4'; g.fillRect(x + 4, y - 11, 3, 20); }
function block(g, x, y) { box(g, x - 14, y - 14, 28, 28, '#52446c'); g.fillStyle = SEAM; g.fillRect(x - 14, y - 2, 28, 4); }
function arrow(g, x0, y0, x1, y1, col = INK) { const a = Math.atan2(y1 - y0, x1 - x0); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.beginPath(); g.moveTo(x1 + Math.cos(a) * 8, y1 + Math.sin(a) * 8); g.lineTo(x1 + Math.cos(a + 2.4) * 9, y1 + Math.sin(a + 2.4) * 9); g.lineTo(x1 + Math.cos(a - 2.4) * 9, y1 + Math.sin(a - 2.4) * 9); g.fill(); }
function tick(g, x, y, ok) { g.lineWidth = 6; g.strokeStyle = ok ? GO : '#ff4d4d'; g.beginPath(); if (ok) { g.moveTo(x - 10, y); g.lineTo(x - 3, y + 8); g.lineTo(x + 12, y - 10); } else { g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.moveTo(x + 9, y - 9); g.lineTo(x - 9, y + 9); } g.stroke(); }
function noJump(g, x, y) { g.save(); crab(g, x, y + 6, 0.55); arrow(g, x, y - 4, x, y - 22); g.strokeStyle = '#ff4d4d'; g.lineWidth = 5; g.beginPath(); g.arc(x, y - 4, 22, 0, Math.PI * 2); g.moveTo(x - 15, y - 19); g.lineTo(x + 15, y + 11); g.stroke(); g.restore(); }
// a row of glass cells, top-down: cells at x = X0 + i * C
const C = 40, X0 = 28, Y0 = 108;
function glassRow(g, n, y = Y0, x0 = X0) { for (let i = 0; i < n; i++) { box(g, x0 + i * C - C / 2 + 1, y - C / 2 + 1, C - 2, C - 2, GLASS, SEAM, 2); } }
const cx = i => X0 + i * C;

const DRAW = {
    // slide: across the glass in one go, stop at the pillar; and no jumping
    slide(g, t) {
        glassRow(g, 5); pillar(g, cx(5), Y0);
        const k = seg(t, 0.4, 1.6), x = lerp(cx(0), cx(4), k);
        if (k > 0 && k < 1) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; for (let j = 1; j <= 3; j++) { g.beginPath(); g.moveTo(x - 14 - j * 9, Y0 - 8 + j * 4); g.lineTo(x - 22 - j * 9, Y0 - 8 + j * 4); g.stroke(); } }
        crab(g, x, Y0); if (t > 1.6) tick(g, cx(4), Y0 - 40, true);
        noJump(g, 214, 42);
    },
    // push: slide into the block (stop), push again: the block slides off to the pillar
    push(g, t) {
        glassRow(g, 6, Y0, X0 - 8); const c2 = i => X0 - 8 + i * C; pillar(g, c2(6), Y0);
        const k1 = seg(t, 0.3, 1.0), k2 = seg(t, 1.6, 2.6);
        crab(g, lerp(c2(0), c2(1), k1), Y0); block(g, lerp(c2(2), c2(5), k2), Y0);
        if (t > 1.2 && t < 1.8) arrow(g, c2(1) + 10, Y0 - 34, c2(2) + 14, Y0 - 34);
    },
    // crack: stop on it once, fine; stop on it again, it breaks into lava
    crack(g, t) {
        glassRow(g, 5); pillar(g, cx(5), Y0);
        const back = t > 2.0, k = back ? seg(t, 2.0, 2.8) : seg(t, 0.2, 1.0), x = back ? lerp(cx(0), cx(4), k) : lerp(cx(0), cx(4), k);
        const cracked = t > 1.0, broken = t > 2.8;
        if (cracked && !broken) { g.strokeStyle = SEAM; g.lineWidth = 3; g.beginPath(); g.moveTo(cx(4) - 14, Y0 - 10); g.lineTo(cx(4) - 2, Y0 + 2); g.lineTo(cx(4) + 12, Y0 - 6); g.moveTo(cx(4) - 2, Y0 + 2); g.lineTo(cx(4) + 4, Y0 + 15); g.stroke(); }
        if (broken) { g.fillStyle = LAVA; g.beginPath(); g.arc(cx(4), Y0, 17, 0, Math.PI * 2); g.fill(); }
        if (!(t > 1.3 && t < 2.0)) crab(g, broken ? cx(4) : x, Y0 - (broken ? (t - 2.8) * 30 : 0), 1, broken ? clamp(1 - (t - 2.8) * 1.5) : 1);
        g.fillStyle = INK; g.font = 'bold 22px sans-serif'; g.fillText('1', 186, 46); tick(g, 214, 40, true);
        if (t > 2.8) { g.fillText('2', 186, 80); tick(g, 214, 74, false); }
    },
    // plate: a coconut thrown on the glass lands two cells out, slides on to the plate (it stops on it at the pillar): the gate drops
    plate(g, t) {
        glassRow(g, 5); pillar(g, cx(5), Y0);
        g.fillStyle = PLATE; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.ellipse(cx(4), Y0, 15, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        crab(g, cx(0), Y0);
        const k = seg(t, 0.4, 1.0), k2 = seg(t, 1.0, 1.7), on = t > 1.7;
        if (t > 0.4) { const x = k < 1 ? lerp(cx(0), cx(2), k) : lerp(cx(2), cx(4), k2), y = k < 1 ? Y0 - Math.sin(Math.PI * k) * 40 : Y0; nut(g, x, y); }
        if (on) { g.strokeStyle = GO; g.lineWidth = 4; g.beginPath(); g.ellipse(cx(4), Y0, 19, 16, 0, 0, Math.PI * 2); g.stroke(); }
        // the gate, top right: yellow bars that sink once the plate is held
        const drop = seg(t, 1.8, 2.4) * 34; g.save(); g.beginPath(); g.rect(176, 14, 70, 52); g.clip();
        for (let i = 0; i < 5; i++) box(g, 184 + i * 12, 22 + drop, 7, 40, PLATE, INK, 2);
        g.restore(); g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(176, 66); g.lineTo(246, 66); g.stroke();
        g.setLineDash([4, 6]); g.strokeStyle = PLATE; g.lineWidth = 3; g.beginPath(); g.moveTo(cx(4) + 10, Y0 - 16); g.lineTo(210, 70); g.stroke(); g.setLineDash([]);
    },
    // ramp (side view): slide at a step and you stop at its wall; slide at the ramp and up you go
    ramp(g, t) {
        g.fillStyle = GLASS; g.strokeStyle = SEAM; g.lineWidth = 2;
        g.beginPath(); g.moveTo(10, 150); g.lineTo(120, 150); g.lineTo(150, 110); g.lineTo(246, 110); g.lineTo(246, 180); g.lineTo(10, 180); g.closePath(); g.fill(); g.stroke();
        const k = seg(t, 0.3, 1.8); let x = lerp(30, 200, k), y = x < 120 ? 140 : x < 150 ? 140 - (x - 120) * 40 / 30 : 100;
        crab(g, x, y, 0.8); if (t > 1.8) tick(g, 200, 70, true);
        arrow(g, 118, 166, 146, 128, SEAM);
    },
    // lava: off the edge into the lava: back to the flag, and the lake sets back as it was
    lava(g, t) {
        g.fillStyle = LAVA; g.fillRect(170, 70, 86, 80); glassRow(g, 4);
        const k = seg(t, 0.3, 1.3), x = lerp(cx(0), 200, k), gone = t > 1.3;
        if (!gone) crab(g, x, Y0); else { g.fillStyle = '#ffd23a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(200 + Math.cos(i) * 18 * (t - 1.2), Y0 - 10 - (t - 1.3) * 30 - i * 3, 3, 0, Math.PI * 2); g.fill(); } }
        if (t > 2.0) { crab(g, 40, 40, 0.7); g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(62, 26); g.lineTo(62, 56); g.stroke(); g.fillStyle = GO; g.beginPath(); g.moveTo(62, 26); g.lineTo(82, 33); g.lineTo(62, 40); g.fill(); arrow(g, 96, 40, 140, 40); block(g, 166, 40); }
    },
    // bank: the bullseye is behind glass, so throw at the rubber bumper: the coconut bounces off it, round the glass, into the bullseye
    bank(g, t) {
        g.fillStyle = '#8fd96a'; g.fillRect(0, 0, 256, 192);
        g.strokeStyle = '#9be7ff'; g.lineWidth = 7; g.beginPath(); g.moveTo(150, 120); g.lineTo(150, 185); g.stroke();          // the glass
        g.save(); g.translate(128, 34); g.rotate(0); box(g, -46, -10, 92, 20, '#ff5fa8'); g.restore();                            // the bumper
        const hit = t > 1.9; for (const [r, col] of [[20, '#ff4d4d'], [13, '#fff'], [6, '#ff4d4d']]) { g.fillStyle = hit && col !== '#fff' ? GO : col; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(214, 150, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
        crab(g, 42, 152, 0.9);
        g.setLineDash([4, 6]); g.lineWidth = 3; g.strokeStyle = PLATE; g.beginPath(); g.moveTo(52, 140); g.lineTo(128, 46); g.stroke(); g.strokeStyle = GO; g.beginPath(); g.moveTo(128, 46); g.lineTo(206, 140); g.stroke(); g.setLineDash([]);
        const k1 = seg(t, 0.3, 1.1), k2 = seg(t, 1.1, 1.9);
        if (t > 0.3) nut(g, k1 < 1 ? lerp(52, 128, k1) : lerp(128, 210, k2), k1 < 1 ? lerp(140, 48, k1) : lerp(48, 146, k2));
        if (t > 1.0 && t < 1.4) { g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const a = i * 1.05; g.beginPath(); g.arc(128 + Math.cos(a) * 16, 50 + Math.sin(a) * 10, 2.5, 0, Math.PI * 2); g.fill(); } }
        // a straight throw at the bullseye bonks off the glass
        if (t > 2.4) { const k = seg(t, 2.4, 3.2); nut(g, lerp(52, 146, Math.min(1, k * 1.2)) - (k > 0.83 ? (k - 0.83) * 100 : 0), lerp(150, 150, k)); if (t > 3.1) tick(g, 128, 108, false); }
    },
    // World 1: walk into a coconut to pick it up (up to three)
    pick(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 70, 256, 122); const k = seg(t, 0.3, 1.6), x = lerp(30, 200, k);
        [90, 140, 190].forEach((nx, i) => { if (x < nx - 6) nut(g, nx, 130); else nut(g, 196 + i * 18 - 36, 40, 7); });
        crab(g, x, 130);
    },
    // throw: hold, then let go: it flies in an arc
    throw(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 140, 256, 52); crab(g, 40, 150); const k = seg(t, 0.6, 1.8);
        g.setLineDash([3, 7]); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 20; i++) { const u = i / 20; g.lineTo(lerp(52, 214, u), 140 - Math.sin(Math.PI * u) * 90); } g.stroke(); g.setLineDash([]);
        if (t > 0.6) nut(g, lerp(52, 214, k), 140 - Math.sin(Math.PI * k) * 90); else nut(g, 40, 118);
    },
    // bounce: jump on a coconut and you go twice as high
    bounce(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 160, 256, 32); nut(g, 128, 150, 10);
        const ph = t % 2, y = ph < 1 ? 150 - 20 - Math.sin(Math.PI * ph) * 40 : 150 - 20 - Math.sin(Math.PI * (ph - 1)) * 110; crab(g, 128, y, 0.9);
    },
    // vent: plug one vent with a coconut and the other one blows (and lifts you)
    vent(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 150, 256, 42); const plug = t > 1.2;
        for (const [x, on] of [[70, !plug], [190, plug]]) { box(g, x - 22, 140, 44, 14, '#9aa7b8'); if (on) { g.strokeStyle = '#fff'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const yy = 130 - ((t * 60 + i * 25) % 100); g.beginPath(); g.arc(x + Math.sin(i + t * 3) * 6, yy, 5, 0, Math.PI * 2); g.stroke(); } } }
        if (t < 1.2) nut(g, 70, lerp(40, 134, seg(t, 0.3, 1.2))); else nut(g, 70, 134);
        if (plug) crab(g, 190, 130 - seg(t, 1.6, 2.6) * 80, 0.8);
    },
    // current: water carries a coconut along (and you, onto the urchins)
    current(g, t) {
        g.fillStyle = SEA; g.fillRect(0, 80, 256, 70); g.strokeStyle = '#fff'; g.lineWidth = 3; for (let i = 0; i < 5; i++) { const x = (i * 60 + t * 40) % 280 - 20; arrow(g, x, 115, x + 24, 115, '#ffffff'); }
        nut(g, lerp(20, 230, (t / LOOP)), 100);
    },
    // gull: it dives where you stand: step out of its shadow (or stomp it)
    gull(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 150, 256, 42); const k = seg(t, 0.4, 1.6), x = lerp(60, 160, seg(t, 1.0, 1.4));
        g.strokeStyle = '#ff4d4d'; g.lineWidth = 3; g.beginPath(); g.ellipse(60, 160, 26, 8, 0, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#fff'; g.strokeStyle = INK; g.beginPath(); g.ellipse(60, lerp(20, 140, k), 22, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        crab(g, x, 156, 0.8); if (t > 1.6) tick(g, 160, 110, true);
    },
    // bullseye: hit it with a coconut and its gate opens
    bullseye(g, t) {
        const hit = t > 1.4; for (const [r, col] of [[26, '#ff4d4d'], [17, '#fff'], [8, '#ff4d4d']]) { g.fillStyle = hit && col !== '#fff' ? GO : col; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(190, 80, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
        crab(g, 40, 150); nut(g, lerp(52, 190, seg(t, 0.4, 1.4)), lerp(140, 80, seg(t, 0.4, 1.4)) - Math.sin(Math.PI * seg(t, 0.4, 1.4)) * 30);
    },
    // climb: vines up a wall, with empty claws
    climb(g, t) {
        box(g, 140, 30, 60, 150, '#c9935a'); g.strokeStyle = '#3fae5a'; g.lineWidth = 5; g.beginPath(); for (let y = 30; y < 180; y += 10) g.lineTo(150 + Math.sin(y * 0.2) * 5, y); g.stroke();
        crab(g, 130, lerp(170, 30, seg(t, 0.3, 2.5)), 0.8);
    },
};

/** Paint one frame of sign `kind` at time t. */
export function drawSign(g, kind, t = 0) {
    g.fillStyle = PAPER; g.fillRect(0, 0, SIGN_W, SIGN_H);
    g.save(); (DRAW[kind] || DRAW.slide)(g, ((t % LOOP) + LOOP) % LOOP); g.restore();
    g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(3, 3, SIGN_W - 6, SIGN_H - 6);
}
export const SIGN_KINDS = Object.keys(DRAW);
