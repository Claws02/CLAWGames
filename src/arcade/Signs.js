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

function bird(g, x, y, s = 1, loot = false, dizzy = false) {
    g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.arc(18, -10, 9, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ff9a1f'; g.beginPath(); g.moveTo(26, -11); g.lineTo(38, -8); g.lineTo(26, -5); g.fill(); g.stroke();
    g.fillStyle = '#9fb2d6'; g.beginPath(); g.ellipse(-4, -3, 13, 6, -0.3, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(20, -12, 1.8, 0, Math.PI * 2); g.fill();
    if (loot) nut(g, 40, -6, 6);
    if (dizzy) { g.fillStyle = '#ffd23a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(18 + Math.cos(i * 2.1) * 14, -26 + Math.sin(i * 2.1) * 4, 3, 0, Math.PI * 2); g.fill(); } }
    g.restore();
}
function octo(g, x, y, s = 1) { g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = '#7b3fe4'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(0, -8, 16, Math.PI, 0); g.lineTo(16, 6); for (let i = 0; i < 4; i++) g.quadraticCurveTo(12 - i * 9, 16, 8 - i * 9, 6); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; for (const sx of [-6, 6]) { g.beginPath(); g.arc(sx, -10, 4, 0, Math.PI * 2); g.fill(); } g.restore(); }
function pearl(g, x, y, r = 8) { g.fillStyle = '#fff1ff'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2); g.fill(); }
const DECK = '#c98f52';

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
    // note (Old Ink's, inky): he hands the gull the pearl, and it flies it up to its nest on the sea stack
    note(g, t) {
        g.fillStyle = '#e9e1ff'; g.fillRect(0, 0, 256, 192); g.fillStyle = 'rgba(123,63,228,0.25)'; for (const [x, y, r] of [[30, 160, 14], [220, 30, 10], [200, 170, 8]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
        box(g, 176, 70, 50, 110, '#8f86a8'); g.fillStyle = '#9a6534'; g.fillRect(170, 62, 62, 12);       // the sea stack and its nest
        octo(g, 46, 140); const k = seg(t, 0.5, 2.2), x = lerp(70, 200, k), y = lerp(126, 50, k) - Math.sin(Math.PI * k) * 40;
        bird(g, x, y, 0.8); pearl(g, t < 0.5 ? 64 : x + 28, t < 0.5 ? 128 : y + 10, 6);
        if (t > 2.4) { pearl(g, 201, 56, 7); tick(g, 120, 40, true); }
    },
    // stun: the gull won't dive with a coconut in its beak: hit it, and it drops it
    stun(g, t) {
        g.fillStyle = DECK; g.fillRect(120, 70, 136, 20); g.fillStyle = SAND; g.fillRect(0, 150, 256, 42);
        const hit = t > 1.3; bird(g, 190, 52, 0.9, !hit, hit && t < 3.2); crab(g, 40, 150);
        if (t > 0.4 && t < 1.3) { const k = seg(t, 0.4, 1.3); nut(g, lerp(52, 186, k), lerp(140, 54, k) - Math.sin(Math.PI * k) * 40); }
        if (hit) nut(g, 214, Math.min(64, lerp(48, 64, seg(t, 1.3, 1.8))));
    },
    // gullback: it dives where you stand: step aside, jump on its back as it lands, and it bounces you up high
    gullback(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 160, 256, 32); box(g, 170, 60, 86, 100, DECK);
        const k = seg(t, 0.2, 0.9); bird(g, 90, lerp(20, 146, k), 0.9);
        const cx2 = t < 0.6 ? 90 : lerp(90, 40, seg(t, 0.6, 0.9)), up = seg(t, 1.0, 1.4), boing = seg(t, 1.5, 2.4);
        const x = t < 1.0 ? cx2 : t < 1.4 ? lerp(40, 92, up) : lerp(92, 200, boing), y = t < 1.0 ? 156 : t < 1.4 ? 156 - Math.sin(Math.PI * up) * 40 - up * 20 : lerp(136, 52, boing) - Math.sin(Math.PI * boing) * 50;
        crab(g, x, y, 0.8); if (t > 2.4) tick(g, 212, 30, true);
    },
    // heavy: a crab is too light for the heavy plate; the gull is heavy enough: the drawbridge comes down
    heavy(g, t) {
        g.fillStyle = DECK; g.fillRect(0, 130, 160, 62); g.fillStyle = SEA; g.fillRect(160, 130, 96, 62);
        box(g, 40, 122, 70, 12, '#5a6074');
        if (t < 1.4) { crab(g, 75, 112, 0.8); g.fillStyle = INK; g.font = 'bold 18px sans-serif'; if (t > 0.6) tick(g, 120, 80, false); }
        else { const k = seg(t, 1.4, 2.0); bird(g, 75, lerp(20, 106, k), 0.8); crab(g, 22, 112, 0.7); }
        const down = seg(t, 2.1, 2.8), a = -Math.PI / 2 * (1 - down); g.save(); g.translate(160, 130); g.rotate(a); box(g, 0, -8, 96, 12, '#e0aa70'); g.restore();
        g.setLineDash([4, 6]); g.strokeStyle = '#ffc83a'; g.lineWidth = 3; g.beginPath(); g.moveTo(110, 128); g.lineTo(160, 128); g.stroke(); g.setLineDash([]);
    },
    // nest: a coconut on the nest's plate and its fence sinks: the pearl
    nest(g, t) {
        g.fillStyle = '#7fcf5c'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#9a6534'; g.beginPath(); g.ellipse(180, 110, 50, 22, 0, 0, Math.PI * 2); g.fill(); pearl(g, 180, 104, 10);
        const drop = seg(t, 1.5, 2.2) * 50; g.save(); g.beginPath(); g.rect(120, 40, 120, 80); g.clip(); for (let i = 0; i < 6; i++) box(g, 130 + i * 18, 50 + drop, 10, 50, '#ffc83a', INK, 2); g.restore();
        g.fillStyle = '#ffc83a'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.ellipse(60, 150, 22, 10, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        crab(g, 30, 110, 0.8); const k = seg(t, 0.3, 1.2); if (t > 0.3) nut(g, lerp(40, 60, k), lerp(100, 146, k) - Math.sin(Math.PI * k) * 30);
        if (t > 1.2) { g.strokeStyle = GO; g.lineWidth = 4; g.beginPath(); g.ellipse(60, 150, 26, 13, 0, 0, Math.PI * 2); g.stroke(); }
    },
    // story1 (World 1): Old Ink grabs the Tide Pearl from the island's shrine and runs into his sandcastle fort; the crab goes after him
    story1(g, t) {
        g.fillStyle = '#e9e1ff'; g.fillRect(0, 0, 256, 192); g.fillStyle = SAND; g.fillRect(0, 140, 256, 52);
        box(g, 20, 110, 40, 30, '#d9c3b0'); box(g, 176, 70, 70, 70, '#f2cf86'); for (let i = 0; i < 4; i++) box(g, 176 + i * 18, 58, 12, 14, '#f2cf86', INK, 2);       // the shrine, the fort
        const k = seg(t, 0.4, 2.0), ox = lerp(40, 200, k); octo(g, ox, 128 - Math.sin(Math.PI * k) * 20, 0.9); pearl(g, t < 0.4 ? 40 : ox + 14, t < 0.4 ? 104 : 118 - Math.sin(Math.PI * k) * 20, 7);
        if (t > 1.6) crab(g, lerp(10, 120, seg(t, 1.6, 3.4)), 160, 0.8);
    },
    // story2 (World 2): beaten, Old Ink slips down a sinkhole into the coral caves with the pearl; the crab after him
    story2(g, t) {
        g.fillStyle = '#bfe9f5'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#ffb3c6'; g.fillRect(0, 120, 256, 72);
        g.fillStyle = '#0e1a24'; g.beginPath(); g.ellipse(150, 124, 34, 10, 0, 0, Math.PI * 2); g.fill();
        const k = seg(t, 0.3, 1.6); if (k < 1) { octo(g, lerp(60, 150, k), 110 + seg(t, 1.2, 1.6) * 20, 0.9); pearl(g, lerp(74, 164, k), 102 + seg(t, 1.2, 1.6) * 20, 6); }
        if (t > 1.8) { crab(g, lerp(20, 150, seg(t, 1.8, 3.3)), 130, 0.8); arrow(g, 150, 70, 150, 100); }
        for (const [x, y] of [[40, 160], [210, 170], [90, 175]]) { g.fillStyle = '#ff7f9e'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
    },
    // story3 (World 3): beaten twice, Old Ink hands the pearl to his ally, the Hermit King, in his volcano
    story3(g, t) {
        g.fillStyle = '#3a1a26'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#5a4a5e'; g.beginPath(); g.moveTo(130, 190); g.lineTo(190, 60); g.lineTo(220, 60); g.lineTo(256, 190); g.fill();
        g.fillStyle = LAVA; g.fillRect(190, 52, 30, 10); for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#ffd23a' : SEAM; g.beginPath(); g.arc(205 + Math.sin(t * 2 + i) * 12, 40 - ((t * 30 + i * 12) % 40), 2.5, 0, Math.PI * 2); g.fill(); }
        // the Hermit King: a big crab in a spiky volcanic shell
        g.fillStyle = '#6b4a3a'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(150, 150); g.lineTo(168, 96); g.lineTo(186, 150); g.closePath(); g.fill(); g.stroke(); crab(g, 168, 156, 1.1);
        const k = seg(t, 0.4, 1.8); octo(g, lerp(40, 120, k), 150, 0.9); pearl(g, lerp(56, t > 1.9 ? 160 : 134, t > 1.9 ? 1 : k), t > 1.9 ? 134 : 140, 7);
        if (t > 2.2) { g.fillStyle = '#ffd23a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(140 + i * 14, 80 - i * 4, 3, 0, Math.PI * 2); g.fill(); } }
    },
    // crackwall: a cracked section of wall: two hits with coconuts and it breaks
    crackwall(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 150, 256, 42); crab(g, 40, 150);
        const hits = t > 2.0 ? 2 : t > 1.0 ? 1 : 0; if (hits < 2) { box(g, 170, 50, 50, 100, '#f2cf86'); g.strokeStyle = '#9aa1b6'; g.lineWidth = 3; g.beginPath(); g.moveTo(180, 70); g.lineTo(196, 95); g.lineTo(186, 120); if (hits) { g.moveTo(196, 95); g.lineTo(212, 110); } g.stroke(); }
        else { for (let i = 0; i < 6; i++) box(g, 168 + (i % 3) * 18, 136 - Math.floor(i / 3) * 12, 14, 12, '#f2cf86', INK, 2); tick(g, 196, 70, true); }
        for (const [a, b] of [[0.3, 1.0], [1.3, 2.0]]) if (t > a && t < b) { const k = seg(t, a, b); nut(g, lerp(52, 168, k), lerp(140, 90, k) - Math.sin(Math.PI * k) * 30); }
        g.fillStyle = INK; g.font = 'bold 22px sans-serif'; g.fillText(hits ? String(hits) : '', 120, 40);
    },
    // log: deep water carries you off: wait for a log, and jump on as it drifts by
    log(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 130, 60, 62); g.fillRect(196, 130, 60, 62); g.fillStyle = SEA; g.fillRect(60, 140, 136, 52);
        const lx = lerp(-40, 300, (t % LOOP) / LOOP); box(g, lx - 30, 138, 60, 14, '#9a6534');
        const onLog = t > 1.4 && t < 2.6, x = t < 1.0 ? 40 : t < 1.4 ? lerp(40, lx, seg(t, 1.0, 1.4)) : onLog ? lx : lerp(lx, 220, seg(t, 2.6, 3.0)), y = t < 1.0 ? 124 : onLog ? 128 : 124 - (t < 1.4 ? Math.sin(Math.PI * seg(t, 1.0, 1.4)) * 30 : Math.sin(Math.PI * seg(t, 2.6, 3.0)) * 30);
        crab(g, x, y, 0.8); if (t > 3.0) tick(g, 220, 80, true);
    },
    // pushsand: push the sand block up against the wall, jump on it, and jump again onto the wall
    pushsand(g, t) {
        g.fillStyle = SAND; g.fillRect(0, 150, 256, 42); box(g, 200, 70, 56, 80, '#f2cf86');
        const k = seg(t, 0.2, 1.2), bx = lerp(90, 172, k); box(g, bx - 14, 122, 28, 28, '#e8bf6e');
        const j1 = seg(t, 1.5, 1.9), j2 = seg(t, 2.1, 2.6); let x = lerp(60, 142, k), y = 140;
        if (t > 1.5) { x = lerp(142, 172, j1); y = lerp(140, 112, j1) - Math.sin(Math.PI * j1) * 20; } if (t > 2.1) { x = lerp(172, 222, j2); y = lerp(112, 62, j2) - Math.sin(Math.PI * j2) * 20; }
        crab(g, x, y, 0.8); if (t > 2.7) tick(g, 222, 30, true);
    },
    // gate: a coconut on the plate drops the crystal gate (while it rests there)
    gate(g, t) {
        g.fillStyle = '#8fd96a'; g.fillRect(0, 0, 256, 192); const drop = seg(t, 1.4, 2.0) * 60;
        g.save(); g.beginPath(); g.rect(150, 40, 100, 100); g.clip(); for (let i = 0; i < 5; i++) { g.fillStyle = '#ff5f5f'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(160 + i * 18, 130 + drop); g.lineTo(168 + i * 18, 60 + drop); g.lineTo(176 + i * 18, 130 + drop); g.fill(); g.stroke(); } g.restore();
        g.fillStyle = '#ff5f5f'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.ellipse(70, 150, 24, 10, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        g.setLineDash([4, 6]); g.strokeStyle = '#ff5f5f'; g.beginPath(); g.moveTo(94, 150); g.lineTo(190, 140); g.stroke(); g.setLineDash([]);
        crab(g, 30, 110, 0.8); const k = seg(t, 0.3, 1.2); if (t > 0.3) nut(g, lerp(40, 70, k), lerp(100, 146, k) - Math.sin(Math.PI * k) * 30);
    },
    // timed: a bullseye with a clock: its gate opens only for a few seconds, so be ready to run
    timed(g, t) {
        g.fillStyle = '#8fd96a'; g.fillRect(0, 0, 256, 192); const hit = t > 0.9, left = hit ? Math.max(0, 1 - (t - 0.9) / 2.6) : 1;
        for (const [r, col] of [[22, '#5f8bff'], [14, '#fff'], [6, '#5f8bff']]) { g.fillStyle = hit && col !== '#fff' ? GO : col; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(60, 60, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
        g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.arc(200, 50, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); g.stroke();
        if (t < 0.9) nut(g, lerp(30, 60, seg(t, 0.2, 0.9)), lerp(160, 60, seg(t, 0.2, 0.9)));
        const open = hit && left > 0; for (let i = 0; i < 4; i++) box(g, 150 + i * 16, 110 + (open ? 50 : 0), 10, 50, '#5f8bff', INK, 2);
        crab(g, hit ? lerp(40, 210, seg(t, 1.0, 3.0)) : 40, 170, 0.8);
    },
    // hole: a sinkhole goes right through the little planet: in here, out the far side, still going the same way
    hole(g, t) {
        g.fillStyle = '#bfe9f5'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#ffb3c6'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(128, 96, 70, 0, Math.PI * 2); g.fill(); g.stroke();
        g.setLineDash([5, 6]); g.strokeStyle = '#0e1a24'; g.beginPath(); g.moveTo(128, 26); g.lineTo(128, 166); g.stroke(); g.setLineDash([]);
        const k = seg(t, 0.4, 2.2), y = lerp(10, 186, k); nut(g, 128, y, 8); arrow(g, 160, 40, 160, 80); arrow(g, 160, 120, 160, 160);
        g.fillStyle = '#0e1a24'; for (const yy of [26, 166]) { g.beginPath(); g.ellipse(128, yy, 14, 5, 0, 0, Math.PI * 2); g.fill(); }
    },
    // launch: step on the launch pad and you fly to the moon (and back); what you carry comes too
    launch(g, t) {
        g.fillStyle = '#182a52'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#ffb3c6'; g.beginPath(); g.arc(60, 230, 110, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8e4ff'; g.beginPath(); g.arc(210, 50, 28, 0, Math.PI * 2); g.fill(); g.fillStyle = '#c9c2f0'; g.beginPath(); g.arc(200, 44, 6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#9be7ff'; g.lineWidth = 4; g.beginPath(); g.ellipse(70, 130, 22, 8, 0, 0, Math.PI * 2); g.stroke();
        const k = seg(t, 0.6, 2.4), x = lerp(70, 205, k), y = lerp(122, 26, k) - Math.sin(Math.PI * k) * 40; crab(g, t < 0.6 ? 70 : x, t < 0.6 ? 122 : y, 0.7);
    },
    // tide: the water comes in and goes out on a clock: what it covers it carries off; a raft rises with it
    tide(g, t) {
        g.fillStyle = '#fff4dc'; g.fillRect(0, 0, 256, 192); const w = (Math.sin((t / LOOP) * Math.PI * 2 - Math.PI / 2) + 1) / 2, wy = 170 - w * 70;
        g.fillStyle = SAND; g.fillRect(0, 170, 256, 22); g.fillStyle = 'rgba(95,199,232,0.85)'; g.fillRect(0, wy, 256, 192 - wy);
        box(g, 150, wy - 10, 60, 12, '#c98f52'); crab(g, 180, wy - 18, 0.8); g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.arc(50, 50, 22, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(50, 50); g.lineTo(50 + Math.sin(t * 1.6) * 16, 50 - Math.cos(t * 1.6) * 16); g.stroke();
    },
    // tiles: crumbling tiles: they crack when you step on them and drop away: don't stop
    tiles(g, t) {
        g.fillStyle = '#050a16'; g.fillRect(0, 100, 256, 92); g.fillStyle = '#d9c4d8'; g.fillRect(0, 100, 30, 92); g.fillRect(226, 100, 30, 92);
        const x = lerp(14, 240, seg(t, 0.3, 2.3)); for (let i = 0; i < 5; i++) { const tx = 52 + i * 38, passed = x > tx + 18, fall = passed ? Math.min(60, (x - tx - 18) * 0.8) : 0; if (fall < 60) box(g, tx - 16, 112 + fall, 32, 18, '#b9a6d6'); }
        crab(g, x, 104, 0.8); if (t > 2.4) tick(g, 230, 60, true);
    },
    // jets: a steam jet bubbles first (the warning), then roars: wait for the burst, then dash past
    jets(g, t) {
        g.fillStyle = '#d9c4d8'; g.fillRect(0, 150, 256, 42); box(g, 108, 142, 40, 12, '#7d72ab'); const ph = t % 2, warn = ph < 0.6, fire = ph >= 0.6 && ph < 1.4;
        if (warn) { g.strokeStyle = '#fff'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(120 + i * 8, 136 - ((t * 40 + i * 6) % 18), 3, 0, Math.PI * 2); g.stroke(); } }
        if (fire) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(112, 20, 32, 124); }
        const x = t < 1.4 ? 50 : lerp(50, 210, seg(t, 1.4, 2.0)); crab(g, x, 150, 0.8); if (t > 2.1) tick(g, 210, 100, true);
    },
    // boss: Old Ink slams an arm down where the red ring is: dodge it, and in the moment after, hit his head with a coconut
    boss(g, t) {
        g.fillStyle = '#d9c3b0'; g.fillRect(0, 150, 256, 42); octo(g, 190, 90, 2); const slam = seg(t, 0.4, 0.9);
        g.strokeStyle = '#ff3b3b'; g.lineWidth = 3; g.beginPath(); g.ellipse(80, 160, 24, 7, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#7b3fe4'; g.lineWidth = 12; g.beginPath(); g.moveTo(170, 100); g.quadraticCurveTo(120, 40 + slam * 60, 80, 70 + slam * 85); g.stroke();
        const x = t < 0.5 ? 80 : lerp(80, 40, seg(t, 0.5, 0.8)); crab(g, x, 156, 0.8);
        if (t > 1.1 && t < 1.8) { const k = seg(t, 1.1, 1.8); nut(g, lerp(52, 186, k), lerp(146, 64, k) - Math.sin(Math.PI * k) * 30); }
        if (t > 1.8) { g.fillStyle = '#ffd23a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(176 + i * 14, 40, 4, 0, Math.PI * 2); g.fill(); } tick(g, 120, 40, true); }
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
