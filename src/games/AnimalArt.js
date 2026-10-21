// ============================================================
// ANIMAL ART — the sticker-cartoon cast of Animal Stack.
//
// Each animal is drawn in its own body space (metres, y up), the same space
// its physics lives in. Its convex `parts` are the physics, and the drawing's
// silhouette is those same point lists drawn as smooth curves (a curve through
// the edge midpoints, which stays just inside the polygon). So what you see is
// what stacks.
//
// The look: a thick dark outline, a base colour with a shaded underside and a
// soft highlight, big shiny eyes, rosy cheeks, little feet and tails.
// ============================================================

// ── Geometry ────────────────────────────────────────────────────────────────
export function ell(rx, ry, cx = 0, cy = 0, n = 10) {
    return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
}
export const rect = (w, h, cx = 0, cy = 0) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
const mirror = pts => pts.map(([x, y]) => [-x, y]).reverse();

// ── Drawing kit ─────────────────────────────────────────────────────────────
const LINE = 0.055;

// A closed smooth curve through the midpoints of the polygon's edges.
function smooth(ctx, pts) {
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(pts[n - 1], pts[0]);
    ctx.beginPath(); ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], m = mid(p, pts[(i + 1) % n]); ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
    ctx.closePath();
}

function bounds(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

// One sticker piece: fill, shade the underside, a highlight, then the outline.
function piece(ctx, pts, c, { shade = true, shine = true, line = c.line, path = smooth } = {}) {
    const b = bounds(pts);
    path(ctx, pts);
    ctx.fillStyle = c.base; ctx.fill();
    ctx.save(); path(ctx, pts); ctx.clip();
    if (shade) { ctx.fillStyle = c.shade; ctx.beginPath(); ctx.ellipse(b.cx + b.w * 0.12, b.y0 - b.h * 0.12, b.w * 0.75, b.h * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
    if (shine) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(b.cx - b.w * 0.2, b.y1 - b.h * 0.22, b.w * 0.16, b.h * 0.09, 0.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    path(ctx, pts);
    ctx.lineWidth = LINE; ctx.strokeStyle = line; ctx.lineJoin = 'round'; ctx.stroke();
}

function blob(ctx, x, y, rx, ry, fill, line, rot = 0) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    if (line) { ctx.lineWidth = LINE * 0.8; ctx.strokeStyle = line; ctx.stroke(); }
}

// Big shiny cartoon eyes. `hot`: the one that fell, pupils shrunk in panic.
function eye(ctx, x, y, r, hot, look = 0.15) {
    blob(ctx, x, y, r, r * 1.1, '#fff', '#1d1b26');
    blob(ctx, x + r * look, y - r * 0.05, r * (hot ? 0.3 : 0.62), r * (hot ? 0.3 : 0.7), '#1d1b26');
    blob(ctx, x + r * (look + 0.22), y + r * 0.25, r * 0.22, r * 0.22, '#fff');
    blob(ctx, x + r * (look - 0.2), y - r * 0.3, r * 0.1, r * 0.1, '#fff');
}

function cheek(ctx, x, y, r) { blob(ctx, x, y, r, r * 0.65, 'rgba(255,110,140,.45)'); }

function stroke(ctx, w, col, fn) {
    ctx.beginPath(); fn(); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}

// A small mouth: a smile, or an "O" when it's falling.
function mouth(ctx, x, y, w, hot) {
    if (hot) { blob(ctx, x, y - w * 0.2, w * 0.35, w * 0.45, '#4a1f2c', '#1d1b26'); return; }
    stroke(ctx, LINE * 0.8, '#1d1b26', () => { ctx.arc(x, y + w * 0.4, w * 0.6, Math.PI * 1.2, Math.PI * 1.8); });
}

// ── The cast ────────────────────────────────────────────────────────────────

// PIG: a round pink pig sitting up, ears pricked, curly tail.
const PIG = { base: '#ffb3cb', shade: '#f38db0', line: '#7a2848' };
const pig = {
    key: 'pig', name: 'PIG', col: PIG.base, dark: PIG.line,
    parts: [
        ell(0.6, 0.47, 0, 0, 10),
        [[-0.46, 0.24], [-0.17, 0.41], [-0.42, 0.64]],
        [[0.17, 0.41], [0.46, 0.24], [0.42, 0.64]],
        [[-0.42, -0.52], [0.42, -0.52], [0.48, -0.32], [-0.48, -0.32]],
    ],
    draw(ctx, hot) {
        // tail
        stroke(ctx, LINE * 1.3, PIG.line, () => { ctx.moveTo(0.52, -0.05); ctx.bezierCurveTo(0.72, -0.02, 0.74, 0.18, 0.62, 0.16); ctx.bezierCurveTo(0.52, 0.14, 0.58, 0.02, 0.68, 0.06); });
        stroke(ctx, LINE * 0.6, '#f38db0', () => { ctx.moveTo(0.52, -0.05); ctx.bezierCurveTo(0.72, -0.02, 0.74, 0.18, 0.62, 0.16); ctx.bezierCurveTo(0.52, 0.14, 0.58, 0.02, 0.68, 0.06); });
        // ears with pink insides
        for (const s of [-1, 1]) {
            const e = s < 0 ? this.parts[1] : this.parts[2];
            piece(ctx, e, PIG, { shade: false, shine: false, path: tri });
            ctx.beginPath(); ctx.moveTo(s * 0.4, 0.33); ctx.lineTo(s * 0.24, 0.42); ctx.lineTo(s * 0.39, 0.55); ctx.closePath(); ctx.fillStyle = '#ff7fa8'; ctx.fill();
        }
        // feet, then the body over them
        for (const s of [-1, 1]) { blob(ctx, s * 0.26, -0.44, 0.17, 0.11, '#f38db0', PIG.line); stroke(ctx, LINE * 0.6, PIG.line, () => { ctx.moveTo(s * 0.26, -0.4); ctx.lineTo(s * 0.26, -0.54); }); }
        piece(ctx, this.parts[0], PIG);
        // snout with nostrils
        blob(ctx, 0, -0.1, 0.2, 0.14, '#ffc9da', PIG.line);
        blob(ctx, -0.07, -0.1, 0.035, 0.05, '#7a2848'); blob(ctx, 0.07, -0.1, 0.035, 0.05, '#7a2848');
        eye(ctx, -0.21, 0.15, 0.1, hot); eye(ctx, 0.21, 0.15, 0.1, hot);
        cheek(ctx, -0.38, -0.05, 0.09); cheek(ctx, 0.38, -0.05, 0.09);
        mouth(ctx, 0, -0.3, 0.12, hot);
    },
};
function tri(ctx, pts) { ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.closePath(); }

// ELEPHANT: side on, facing right: a big floppy ear, a trunk, stubby legs.
const ELE = { base: '#b9c6d9', shade: '#8f9db6', line: '#353d52' };
const elephant = {
    key: 'elephant', name: 'ELEPHANT', col: ELE.base, dark: ELE.line,
    parts: [
        ell(0.6, 0.37, -0.15, 0.04, 10),
        ell(0.31, 0.3, 0.45, 0.17, 9),
        [[0.6, 0.12], [0.8, 0.07], [0.88, -0.38], [0.71, -0.42]],
        rect(0.22, 0.34, -0.5, -0.36),
        rect(0.22, 0.34, 0.1, -0.36),
    ],
    draw(ctx, hot) {
        // tail
        stroke(ctx, LINE * 1.1, ELE.line, () => { ctx.moveTo(-0.72, 0.05); ctx.quadraticCurveTo(-0.86, -0.05, -0.82, -0.2); });
        blob(ctx, -0.82, -0.22, 0.04, 0.05, ELE.line);
        // far legs a shade darker, peeking out
        piece(ctx, rect(0.2, 0.3, -0.36, -0.36), { ...ELE, base: ELE.shade }, { shade: false, shine: false });
        piece(ctx, rect(0.2, 0.3, 0.24, -0.36), { ...ELE, base: ELE.shade }, { shade: false, shine: false });
        piece(ctx, this.parts[3], ELE, { shine: false });
        piece(ctx, this.parts[4], ELE, { shine: false });
        for (const x of [-0.5, 0.1]) { blob(ctx, x - 0.06, -0.5, 0.03, 0.02, '#eef2f8'); blob(ctx, x + 0.04, -0.5, 0.03, 0.02, '#eef2f8'); }   // toenails
        piece(ctx, this.parts[0], ELE);
        // trunk, with wrinkles, under the head
        piece(ctx, this.parts[2], ELE, { shine: false });
        for (const y of [-0.05, -0.15, -0.25]) stroke(ctx, LINE * 0.5, ELE.line, () => { ctx.moveTo(0.72, y); ctx.lineTo(0.84, y - 0.02); });
        piece(ctx, this.parts[1], ELE);
        // the ear: a big flap with a pink inside
        const ear = [[0.1, 0.38], [0.32, 0.43], [0.4, 0.22], [0.34, -0.04], [0.16, -0.06], [0.04, 0.15]];
        piece(ctx, ear, { ...ELE, base: '#a9b6cb' });
        ctx.save(); smooth(ctx, ear); ctx.clip(); blob(ctx, 0.23, 0.17, 0.11, 0.17, 'rgba(242,170,190,.7)'); ctx.restore();
        // tusk
        ctx.beginPath(); ctx.moveTo(0.6, -0.02); ctx.quadraticCurveTo(0.66, -0.2, 0.78, -0.16); ctx.quadraticCurveTo(0.68, -0.1, 0.66, 0.0); ctx.closePath();
        ctx.fillStyle = '#fffbe9'; ctx.fill(); ctx.lineWidth = LINE * 0.7; ctx.strokeStyle = ELE.line; ctx.stroke();
        eye(ctx, 0.56, 0.25, 0.075, hot, 0.3);
        cheek(ctx, 0.62, 0.08, 0.07);
    },
};

// GIRAFFE: side on, facing right: long neck, ossicones, patches, thin legs.
const GIR = { base: '#ffd45e', shade: '#f1b532', line: '#6b4612' };
const SPOT = '#c97f2c';
const giraffe = {
    key: 'giraffe', name: 'GIRAFFE', col: GIR.base, dark: GIR.line,
    parts: [
        ell(0.5, 0.25, -0.15, -0.02, 10),
        rect(0.14, 0.5, -0.45, -0.42),
        rect(0.14, 0.5, 0.15, -0.42),
        [[0.06, 0.08], [0.3, 0.12], [0.45, 0.84], [0.25, 0.88]],
        ell(0.21, 0.12, 0.47, 0.92, 8),
    ],
    draw(ctx, hot) {
        // tail with a tuft
        stroke(ctx, LINE * 0.9, GIR.line, () => { ctx.moveTo(-0.62, 0.05); ctx.quadraticCurveTo(-0.74, -0.05, -0.72, -0.24); });
        blob(ctx, -0.72, -0.28, 0.05, 0.07, '#7a4a18', GIR.line);
        // far legs, then near legs with hooves
        piece(ctx, rect(0.12, 0.46, -0.32, -0.42), { ...GIR, base: GIR.shade }, { shade: false, shine: false });
        piece(ctx, rect(0.12, 0.46, 0.28, -0.42), { ...GIR, base: GIR.shade }, { shade: false, shine: false });
        piece(ctx, this.parts[1], GIR, { shine: false }); piece(ctx, this.parts[2], GIR, { shine: false });
        for (const x of [-0.45, 0.15]) blob(ctx, x, -0.64, 0.075, 0.04, '#5a3a14');
        // neck, with a mane down the back
        piece(ctx, this.parts[3], GIR);
        for (let i = 0; i < 6; i++) { const t = i / 5; const x = 0.08 + (0.27 - 0.08) * t, y = 0.12 + (0.86 - 0.12) * t; stroke(ctx, LINE * 1.4, '#a8641e', () => { ctx.moveTo(x, y); ctx.lineTo(x - 0.07, y + 0.03); }); }
        // body over the neck's base
        piece(ctx, this.parts[0], GIR);
        // patches, clipped to the body and the neck
        const spots = (pts, list) => { ctx.save(); smooth(ctx, pts); ctx.clip(); list.forEach(([x, y, r]) => blob(ctx, x, y, r, r * 0.8, SPOT, null, 0.4)); ctx.restore(); };
        spots(this.parts[0], [[-0.45, 0.05, 0.09], [-0.22, -0.1, 0.1], [0.02, 0.06, 0.08], [-0.05, -0.17, 0.07], [0.22, -0.08, 0.07], [-0.38, -0.17, 0.06]]);
        spots(this.parts[3], [[0.2, 0.25, 0.06], [0.27, 0.45, 0.06], [0.33, 0.65, 0.05]]);
        // head: ossicones, ear, muzzle
        for (const dx of [0.36, 0.46]) { stroke(ctx, LINE * 1.2, GIR.line, () => { ctx.moveTo(dx, 0.98); ctx.lineTo(dx - 0.02, 1.12); }); blob(ctx, dx - 0.02, 1.13, 0.04, 0.04, '#7a4a18', GIR.line); }
        blob(ctx, 0.3, 0.98, 0.08, 0.04, GIR.shade, GIR.line, 0.5);
        piece(ctx, this.parts[4], GIR);
        blob(ctx, 0.6, 0.89, 0.09, 0.07, '#ffe9a8', GIR.line);
        blob(ctx, 0.64, 0.9, 0.015, 0.02, GIR.line);
        eye(ctx, 0.45, 0.95, 0.06, hot, 0.3);
        cheek(ctx, 0.49, 0.86, 0.05);
    },
};

// PENGUIN: front on, waddling: white tummy, flippers out, orange feet.
const PEN = { base: '#33405c', shade: '#1f283c', line: '#0d111c' };
const penguin = {
    key: 'penguin', name: 'PENGUIN', col: PEN.base, dark: PEN.line,
    parts: [
        ell(0.36, 0.56, 0, 0.03, 10),
        [[-0.3, -0.62], [0.3, -0.62], [0.27, -0.48], [-0.27, -0.48]],
        [[-0.3, 0.12], [-0.5, -0.24], [-0.3, -0.2]],
        mirror([[-0.3, 0.12], [-0.5, -0.24], [-0.3, -0.2]]),
    ],
    draw(ctx, hot) {
        // feet
        for (const s of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(s * 0.04, -0.5); ctx.quadraticCurveTo(s * 0.34, -0.5, s * 0.3, -0.6); ctx.lineTo(s * 0.04, -0.6); ctx.closePath();
            ctx.fillStyle = '#ffa23a'; ctx.fill(); ctx.lineWidth = LINE * 0.8; ctx.strokeStyle = '#8a4a0c'; ctx.stroke();
        }
        // flippers, tilted out
        piece(ctx, this.parts[2], PEN, { shine: false }); piece(ctx, this.parts[3], PEN, { shine: false });
        piece(ctx, this.parts[0], PEN);
        // the white tummy and face
        ctx.save(); smooth(ctx, this.parts[0]); ctx.clip();
        blob(ctx, 0, -0.12, 0.27, 0.42, '#f7f8fc');
        blob(ctx, -0.11, 0.24, 0.13, 0.13, '#f7f8fc'); blob(ctx, 0.11, 0.24, 0.13, 0.13, '#f7f8fc');
        blob(ctx, 0.09, -0.3, 0.12, 0.2, 'rgba(180,190,215,.45)');
        ctx.restore();
        eye(ctx, -0.11, 0.27, 0.075, hot, 0.05); eye(ctx, 0.11, 0.27, 0.075, hot, -0.05);
        // beak
        ctx.beginPath(); ctx.moveTo(-0.08, 0.16); ctx.quadraticCurveTo(0, 0.2, 0.08, 0.16); ctx.lineTo(0, 0.05); ctx.closePath();
        ctx.fillStyle = hot ? '#ff7a3a' : '#ffa23a'; ctx.fill(); ctx.lineWidth = LINE * 0.7; ctx.strokeStyle = '#8a4a0c'; ctx.stroke();
        cheek(ctx, -0.21, 0.13, 0.06); cheek(ctx, 0.21, 0.13, 0.06);
    },
};

// PANDA: sitting front on: black ears, eye patches, arms and legs.
const PAN = { base: '#fbfbfd', shade: '#d6dbe6', line: '#22252e' };
const BLACK = { base: '#2c2f3a', shade: '#1b1d25', line: '#0f1015' };
const panda = {
    key: 'panda', name: 'PANDA', col: PAN.base, dark: PAN.line,
    parts: [
        ell(0.46, 0.38, 0, -0.17, 10),
        ell(0.34, 0.3, 0, 0.33, 10),
        ell(0.12, 0.12, -0.27, 0.58, 6),
        ell(0.12, 0.12, 0.27, 0.58, 6),
        [[-0.44, -0.56], [0.44, -0.56], [0.44, -0.32], [-0.44, -0.32]],
    ],
    draw(ctx, hot) {
        piece(ctx, this.parts[2], BLACK, { shade: false }); piece(ctx, this.parts[3], BLACK, { shade: false });
        piece(ctx, this.parts[0], PAN);
        // legs: black with pink paw pads, and arms hugging the tummy
        for (const s of [-1, 1]) {
            blob(ctx, s * 0.26, -0.42, 0.17, 0.13, BLACK.base, BLACK.line);
            blob(ctx, s * 0.27, -0.42, 0.07, 0.06, '#ff9fb5');
            for (const d of [-0.07, 0, 0.07]) blob(ctx, s * 0.27 + d, -0.33, 0.025, 0.025, '#ff9fb5');
            ctx.save(); smooth(ctx, this.parts[0]); ctx.clip();
            blob(ctx, s * 0.36, -0.08, 0.17, 0.24, BLACK.base, BLACK.line, s * -0.5);
            ctx.restore();
        }
        piece(ctx, this.parts[1], PAN);
        // eye patches, tilted
        blob(ctx, -0.13, 0.33, 0.1, 0.13, BLACK.base, null, 0.6); blob(ctx, 0.13, 0.33, 0.1, 0.13, BLACK.base, null, -0.6);
        eye(ctx, -0.12, 0.34, 0.06, hot, 0.1); eye(ctx, 0.12, 0.34, 0.06, hot, -0.1);
        blob(ctx, 0, 0.22, 0.05, 0.035, BLACK.base);
        mouth(ctx, 0, 0.13, 0.09, hot);
        cheek(ctx, -0.22, 0.2, 0.06); cheek(ctx, 0.22, 0.2, 0.06);
    },
};

export const ART = { pig, elephant, giraffe, penguin, panda };
