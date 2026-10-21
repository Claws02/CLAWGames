// ============================================================
// ANIMAL ART: the cast of Animal Stack, drawn as natural-history
// illustrations.
//
// Each animal is drawn in its own body space (metres, y up), the same space
// its physics lives in. Its convex `parts` are the physics; the drawing is the
// animal's real silhouette, fitted to those parts (qa/animal-gallery.html?parts
// overlays one on the other).
//
// The look: true proportions and natural colours, light from above, a shaded
// underside, texture (bristles, hide creases, reticulated patches, feathers,
// fur), small lifelike eyes and a thin soft outline.
//
// That much detail is too heavy to redraw every frame, so the game paints each
// animal once into a sprite at the screen's scale (spriteOf) and draws that.
// ============================================================

// ── Geometry ────────────────────────────────────────────────────────────────
export function ell(rx, ry, cx = 0, cy = 0, n = 10) {
    return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
}
export const rect = (w, h, cx = 0, cy = 0) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];

// A seeded random, so every pig's skin is the same pig's skin.
function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ── Painting kit ────────────────────────────────────────────────────────────
const LW = 0.022;   // outline width, metres

// Paint a set of parts as ONE shape with a single outer outline. The parts are
// filled one by one onto a layer (so overlaps merge instead of cancelling out),
// outlined on the canvas underneath, and everything painted on the layer
// afterwards (light, shade, texture) lands only on the animal: the layer draws
// 'source-atop'. Call done() to put the layer down.
function body(ctx, shapes, c, { light = 0.28, shadow = 0.32, top = 0.9, bottom = -0.7 } = {}) {
    const one = s => { ctx.beginPath(); s(ctx); };
    ctx.lineWidth = LW * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = c.line;
    shapes.forEach(s => { one(s); ctx.stroke(); });
    const layer = document.createElement('canvas');
    layer.width = ctx.canvas.width; layer.height = ctx.canvas.height;
    const g = layer.getContext('2d');
    g.setTransform(ctx.getTransform());
    g.fillStyle = c.base;
    shapes.forEach(s => { g.beginPath(); s(g); g.fill(); });
    g.globalCompositeOperation = 'source-atop';
    const grad = g.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, `rgba(255,255,255,${light})`); grad.addColorStop(0.45, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0)'); grad.addColorStop(1, `rgba(0,0,0,${shadow})`);
    g.fillStyle = grad; g.fillRect(-3, -3, 6, 6);
    return { g, done: () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0); ctx.restore(); } };
}

// Short directional strokes: hair, fur, feathers, creases.
function strokes(ctx, rnd, box, n, { len = 0.04, ang = 0, jitter = 0.4, w = 0.008, col = 'rgba(0,0,0,.15)', curve = 0 } = {}) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
        const x = box[0] + rnd() * (box[2] - box[0]), y = box[1] + rnd() * (box[3] - box[1]);
        const a = (typeof ang === 'function' ? ang(x, y) : ang) + (rnd() - 0.5) * jitter, l = len * (0.6 + rnd() * 0.8);
        const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
        ctx.beginPath(); ctx.moveTo(x, y);
        if (curve) ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(a) * curve * l, (y + ey) / 2 + Math.cos(a) * curve * l, ex, ey); else ctx.lineTo(ex, ey);
        ctx.stroke();
    }
}

function spots(ctx, rnd, box, n, r, col) {
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
        const x = box[0] + rnd() * (box[2] - box[0]), y = box[1] + rnd() * (box[3] - box[1]), rr = r * (0.5 + rnd());
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); ctx.fill();
    }
}

function oval(ctx, x, y, rx, ry, fill, rot = 0, line = null, lw = LW) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) { ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke(); }
}

function line(ctx, w, col, fn) { ctx.beginPath(); fn(); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }

// A lifelike eye: dark, glossy, with a lid line. The one that fell shows
// the white of its eye.
function eye(ctx, x, y, r, hot, iris = '#2a1a12') {
    if (hot) oval(ctx, x, y, r * 1.35, r * 1.2, '#f4efe6', 0, '#1a1210', LW * 0.6);
    oval(ctx, x, y, r, r * 0.92, iris);
    oval(ctx, x + r * 0.1, y, r * 0.55, r * 0.55, '#050302');
    oval(ctx, x - r * 0.3, y + r * 0.35, r * 0.25, r * 0.22, 'rgba(255,255,255,.85)');
    line(ctx, LW * 0.6, 'rgba(0,0,0,.55)', () => ctx.arc(x, y - r * 0.1, r * 1.25, Math.PI * 0.15, Math.PI * 0.85));
}

// ── PIG ─────────────────────────────────────────────────────────────────────
// A domestic pig, side on, facing right: barrel body, short legs, a wedge
// head ending in a flat snout disc, a forward-flopping ear, a curl of tail.
const PIG = { base: '#efb7a6', line: '#6c3c33', dark: '#c98877', light: '#fad6ca' };
const pigBody = c => c.ellipse(-0.08, 0.03, 0.58, 0.31, -0.03, 0, Math.PI * 2);
const pigHead = c => {
    c.moveTo(0.34, 0.27); c.bezierCurveTo(0.54, 0.34, 0.72, 0.22, 0.84, 0.06);
    c.lineTo(0.9, 0.02); c.bezierCurveTo(0.94, -0.02, 0.94, -0.1, 0.9, -0.13);
    c.lineTo(0.78, -0.14); c.bezierCurveTo(0.64, -0.21, 0.48, -0.21, 0.34, -0.12); c.closePath();
};
const pigLeg = (x, near) => c => {
    c.moveTo(x - 0.08, -0.08); c.bezierCurveTo(x - 0.09, -0.3, x - 0.07, -0.42, x - 0.06, -0.5);
    c.lineTo(x + 0.06, -0.5); c.bezierCurveTo(x + 0.07, -0.42, x + 0.08, -0.3, x + 0.08, -0.08); c.closePath();
};
const pig = {
    key: 'pig', name: 'PIG', col: PIG.base, dark: PIG.line,
    parts: [
        ell(0.58, 0.31, -0.08, 0.03, 10),
        [[0.34, 0.27], [0.6, 0.27], [0.84, 0.07], [0.93, -0.01], [0.92, -0.12], [0.64, -0.2], [0.36, -0.13]],
        rect(0.16, 0.42, -0.44, -0.31),
        rect(0.16, 0.42, 0.3, -0.31),
    ],
    draw(ctx, hot) {
        const rnd = rng(11);
        // the tail, a tight curl
        line(ctx, 0.03, PIG.line, () => { ctx.moveTo(-0.64, 0.12); ctx.bezierCurveTo(-0.76, 0.2, -0.82, 0.08, -0.74, 0.04); ctx.bezierCurveTo(-0.68, 0.02, -0.7, 0.14, -0.78, 0.16); });
        line(ctx, 0.016, PIG.dark, () => { ctx.moveTo(-0.64, 0.12); ctx.bezierCurveTo(-0.76, 0.2, -0.82, 0.08, -0.74, 0.04); ctx.bezierCurveTo(-0.68, 0.02, -0.7, 0.14, -0.78, 0.16); });
        // far legs, in shadow
        for (const x of [-0.3, 0.42]) { const s = body(ctx, [pigLeg(x)], { ...PIG, base: PIG.dark }, { light: 0, shadow: 0.25 }); s.done(); }
        const s = body(ctx, [pigBody, pigHead, pigLeg(-0.44), pigLeg(0.3)], PIG, { top: 0.36, bottom: -0.5 });
        // skin: soft mottling, then fine pale bristles
        spots(s.g, rnd, [-0.6, -0.25, 0.8, 0.3], 26, 0.05, 'rgba(255,240,235,.18)');
        spots(s.g, rnd, [-0.6, -0.25, 0.6, 0.2], 14, 0.04, 'rgba(190,110,95,.12)');
        strokes(s.g, rnd, [-0.62, -0.25, 0.85, 0.32], 140, { len: 0.035, ang: -0.3, col: 'rgba(255,248,240,.35)', w: 0.006 });
        // neck creases and the belly line
        for (const k of [0, 1, 2]) line(s.g, 0.008, 'rgba(110,60,50,.35)', () => { s.g.moveTo(0.34 + k * 0.035, 0.18); s.g.quadraticCurveTo(0.3 + k * 0.035, 0.02, 0.36 + k * 0.035, -0.12); });
        line(s.g, 0.01, 'rgba(110,60,50,.25)', () => { s.g.moveTo(-0.5, -0.18); s.g.quadraticCurveTo(-0.1, -0.3, 0.3, -0.16); });
        // hooves
        for (const x of [-0.44, 0.3]) { oval(s.g, x, -0.48, 0.065, 0.035, '#4a3a36'); line(s.g, 0.008, '#2a201d', () => { s.g.moveTo(x, -0.45); s.g.lineTo(x, -0.52); }); }
        s.done();
        // the snout disc, nostrils, mouth
        oval(ctx, 0.915, -0.055, 0.03, 0.075, '#e59c8a', 0, PIG.line, LW * 0.7);
        oval(ctx, 0.92, -0.03, 0.009, 0.017, '#4a2620'); oval(ctx, 0.92, -0.085, 0.009, 0.017, '#4a2620');
        line(ctx, 0.01, PIG.line, () => { ctx.moveTo(0.86, -0.125); ctx.quadraticCurveTo(0.78, -0.13, 0.72, -0.11); });
        // the ear flops forward over the eye's brow
        ctx.beginPath(); ctx.moveTo(0.46, 0.26); ctx.bezierCurveTo(0.56, 0.42, 0.66, 0.4, 0.7, 0.2); ctx.quadraticCurveTo(0.6, 0.22, 0.46, 0.26); ctx.closePath();
        ctx.fillStyle = '#e6a796'; ctx.fill(); ctx.lineWidth = LW; ctx.strokeStyle = PIG.line; ctx.stroke();
        line(ctx, 0.008, 'rgba(110,60,50,.4)', () => { ctx.moveTo(0.5, 0.27); ctx.quadraticCurveTo(0.6, 0.34, 0.66, 0.24); });
        eye(ctx, 0.64, 0.12, 0.022, hot);
    },
};

// ── ELEPHANT ────────────────────────────────────────────────────────────────
// An African elephant, side on, facing right: humped back, pillar legs, a vast
// veined ear, a ringed trunk curling at the tip, ivory, a tufted tail.
const ELE = { base: '#8f8a84', line: '#2e2b28', dark: '#69645f', light: '#b0aaa2' };
const eleBody = c => {
    c.moveTo(-0.76, 0.0); c.bezierCurveTo(-0.78, 0.3, -0.5, 0.48, -0.15, 0.46);
    c.bezierCurveTo(0.15, 0.46, 0.3, 0.42, 0.42, 0.3); c.lineTo(0.42, -0.2);
    c.bezierCurveTo(0.1, -0.32, -0.4, -0.32, -0.72, -0.2); c.closePath();
};
const eleHead = c => c.ellipse(0.52, 0.2, 0.28, 0.29, 0, 0, Math.PI * 2);
const eleTrunk = c => {
    c.moveTo(0.66, 0.14); c.bezierCurveTo(0.82, 0.06, 0.86, -0.2, 0.86, -0.42);
    c.quadraticCurveTo(0.88, -0.5, 0.95, -0.48); c.lineTo(0.94, -0.42);
    c.quadraticCurveTo(0.92, -0.44, 0.91, -0.4); c.bezierCurveTo(0.92, -0.14, 0.86, 0.12, 0.72, 0.26); c.closePath();
};
const eleLeg = x => c => {
    c.moveTo(x - 0.12, -0.05); c.lineTo(x - 0.12, -0.52); c.quadraticCurveTo(x, -0.58, x + 0.12, -0.52); c.lineTo(x + 0.12, -0.05); c.closePath();
};
const elephant = {
    key: 'elephant', name: 'ELEPHANT', col: ELE.base, dark: ELE.line,
    parts: [
        [[-0.76, 0.0], [-0.62, 0.36], [-0.15, 0.46], [0.42, 0.3], [0.42, -0.2], [-0.15, -0.3], [-0.72, -0.2]],
        ell(0.28, 0.29, 0.52, 0.2, 9),
        [[0.66, 0.16], [0.84, 0.0], [0.96, -0.48], [0.84, -0.48], [0.74, 0.24]],
        rect(0.24, 0.5, -0.5, -0.31),
        rect(0.24, 0.5, 0.12, -0.31),
    ],
    draw(ctx, hot) {
        const rnd = rng(23);
        // tail with its tuft
        line(ctx, 0.022, ELE.line, () => { ctx.moveTo(-0.74, 0.12); ctx.quadraticCurveTo(-0.86, 0.0, -0.84, -0.22); });
        strokes(ctx, rnd, [-0.88, -0.32, -0.8, -0.22], 14, { len: 0.06, ang: -1.6, col: '#1e1b19', w: 0.01, jitter: 0.6 });
        for (const x of [-0.36, 0.26]) { const s = body(ctx, [eleLeg(x)], { ...ELE, base: ELE.dark }, { light: 0, shadow: 0.3 }); s.done(); }
        const s = body(ctx, [eleBody, eleHead, eleTrunk, eleLeg(-0.5), eleLeg(0.12)], ELE, { top: 0.5, bottom: -0.55, shadow: 0.38 });
        // hide: blotches and a net of fine creases
        spots(s.g, rnd, [-0.75, -0.3, 0.8, 0.45], 30, 0.06, 'rgba(255,250,240,.07)');
        strokes(s.g, rnd, [-0.75, -0.3, 0.42, 0.44], 170, { len: 0.06, ang: 0.1, jitter: 1.6, col: 'rgba(40,35,30,.22)', w: 0.006, curve: 0.4 });
        // trunk rings and leg wrinkles
        for (let i = 0; i < 11; i++) { const t = i / 10, y = 0.08 - t * 0.5, x = 0.76 + t * 0.12 - t * t * 0.02; line(s.g, 0.007, 'rgba(35,30,28,.45)', () => { s.g.moveTo(x - 0.05, y + 0.01); s.g.quadraticCurveTo(x, y - 0.015, x + 0.06, y + 0.01); }); }
        for (const x of [-0.5, 0.12]) for (let i = 0; i < 6; i++) line(s.g, 0.006, 'rgba(35,30,28,.35)', () => { const y = -0.12 - i * 0.065; s.g.moveTo(x - 0.11, y); s.g.quadraticCurveTo(x, y - 0.02, x + 0.11, y); });
        // toenails
        for (const x of [-0.5, 0.12]) for (const d of [-0.07, 0, 0.07]) oval(s.g, x + d, -0.53, 0.028, 0.02, '#cfc6b6', 0, 'rgba(46,43,40,.6)', 0.006);
        s.done();
        // the ear: the shape of Africa, veined, with a darker rim
        const ear = c => { c.moveTo(0.32, 0.42); c.bezierCurveTo(0.12, 0.5, 0.0, 0.34, 0.06, 0.12); c.bezierCurveTo(0.1, -0.06, 0.2, -0.2, 0.3, -0.24); c.bezierCurveTo(0.38, -0.1, 0.4, 0.04, 0.44, 0.12); c.bezierCurveTo(0.46, 0.26, 0.42, 0.38, 0.32, 0.42); c.closePath(); };
        const e = body(ctx, [ear], { ...ELE, base: '#88837d' }, { top: 0.45, bottom: -0.25, light: 0.18, shadow: 0.3 });
        strokes(e.g, rnd, [0.1, -0.15, 0.38, 0.38], 26, { len: 0.12, ang: (x, y) => Math.atan2(y - 0.1, x - 0.44) + Math.PI, jitter: 0.5, col: 'rgba(60,40,40,.35)', w: 0.006, curve: 0.5 });
        line(e.g, 0.02, 'rgba(40,35,30,.25)', () => ear(e.g));
        e.done();
        // ivory
        ctx.beginPath(); ctx.moveTo(0.68, 0.0); ctx.bezierCurveTo(0.74, -0.14, 0.84, -0.22, 0.96, -0.2); ctx.bezierCurveTo(0.86, -0.15, 0.78, -0.08, 0.74, 0.04); ctx.closePath();
        const iv = ctx.createLinearGradient(0.68, 0, 0.96, -0.2); iv.addColorStop(0, '#d9ccb0'); iv.addColorStop(1, '#fbf6ea');
        ctx.fillStyle = iv; ctx.fill(); ctx.lineWidth = LW * 0.8; ctx.strokeStyle = ELE.line; ctx.stroke();
        // brow fold and eye
        line(ctx, 0.008, 'rgba(35,30,28,.5)', () => { ctx.moveTo(0.54, 0.3); ctx.quadraticCurveTo(0.62, 0.34, 0.7, 0.28); });
        eye(ctx, 0.62, 0.23, 0.022, hot, '#3a2414');
    },
};

// ── GIRAFFE ─────────────────────────────────────────────────────────────────
// A reticulated giraffe, side on, facing right: sloping back, long legs, the
// neck, a narrow head with ossicones, and a chestnut net-pattern coat.
const GIR = { base: '#f1dfb8', line: '#5a3a1c', dark: '#d8c294' };
const PATCH = ['#b5652b', '#a85a24', '#c06f33'];
const girBody = c => { c.moveTo(-0.62, 0.12); c.bezierCurveTo(-0.6, 0.24, -0.2, 0.26, 0.14, 0.3); c.bezierCurveTo(0.34, 0.3, 0.36, 0.0, 0.3, -0.16); c.bezierCurveTo(0.0, -0.24, -0.4, -0.24, -0.58, -0.14); c.closePath(); };
const girNeck = c => { c.moveTo(0.06, 0.18); c.bezierCurveTo(0.16, 0.5, 0.26, 0.74, 0.32, 0.92); c.lineTo(0.48, 0.88); c.bezierCurveTo(0.44, 0.6, 0.4, 0.3, 0.34, 0.0); c.closePath(); };
const girHead = c => { c.moveTo(0.3, 0.96); c.bezierCurveTo(0.38, 1.04, 0.54, 1.0, 0.66, 0.9); c.bezierCurveTo(0.72, 0.86, 0.72, 0.8, 0.64, 0.8); c.bezierCurveTo(0.54, 0.8, 0.42, 0.84, 0.32, 0.86); c.closePath(); };
const girLeg = x => c => { c.moveTo(x - 0.06, -0.08); c.bezierCurveTo(x - 0.07, -0.3, x - 0.04, -0.45, x - 0.05, -0.62); c.lineTo(x + 0.05, -0.62); c.bezierCurveTo(x + 0.04, -0.45, x + 0.07, -0.3, x + 0.06, -0.08); c.closePath(); };
const giraffe = {
    key: 'giraffe', name: 'GIRAFFE', col: '#c06f33', dark: GIR.line,
    parts: [
        [[-0.62, 0.12], [-0.4, 0.24], [0.14, 0.3], [0.34, 0.12], [0.3, -0.16], [-0.1, -0.23], [-0.58, -0.14]],
        rect(0.13, 0.6, -0.44, -0.36),
        rect(0.13, 0.6, 0.14, -0.36),
        [[0.06, 0.18], [0.34, 0.0], [0.48, 0.88], [0.32, 0.92]],
        [[0.3, 0.96], [0.5, 1.0], [0.68, 0.88], [0.64, 0.8], [0.32, 0.86]],
    ],
    draw(ctx, hot) {
        const rnd = rng(37);
        // tail with a black switch
        line(ctx, 0.016, GIR.line, () => { ctx.moveTo(-0.6, 0.1); ctx.quadraticCurveTo(-0.7, 0.0, -0.68, -0.22); });
        strokes(ctx, rnd, [-0.71, -0.34, -0.65, -0.24], 12, { len: 0.06, ang: -1.6, col: '#1b1410', w: 0.01 });
        for (const x of [-0.3, 0.26]) { const s = body(ctx, [girLeg(x)], { ...GIR, base: GIR.dark }, { light: 0, shadow: 0.3 }); s.done(); }
        // ossicones and ear behind the head
        for (const dx of [0.38, 0.45]) { line(ctx, 0.04, GIR.line, () => { ctx.moveTo(dx, 0.96); ctx.lineTo(dx - 0.03, 1.1); }); line(ctx, 0.024, '#e6cfa0', () => { ctx.moveTo(dx, 0.96); ctx.lineTo(dx - 0.03, 1.1); }); oval(ctx, dx - 0.03, 1.11, 0.025, 0.022, '#2a1c12'); }
        oval(ctx, 0.31, 0.98, 0.07, 0.03, '#e6cfa0', 0.5, GIR.line, LW * 0.8);
        const s = body(ctx, [girBody, girNeck, girHead, girLeg(-0.44), girLeg(0.14)], GIR, { top: 1.0, bottom: -0.6, light: 0.18, shadow: 0.3 });
        // reticulated coat: chestnut polygons on a cream net, down to the knees
        for (let gx = -0.62; gx < 0.5; gx += 0.12) for (let gy = -0.3; gy < 0.95; gy += 0.12) {
            if (gy > 0.32 && (gx < 0.0 || gx > 0.5)) continue;
            const cx = gx + (rnd() - 0.5) * 0.05 + ((Math.round(gy / 0.12) % 2) * 0.06), cy = gy + (rnd() - 0.5) * 0.05, r = 0.048 + rnd() * 0.012;
            s.g.beginPath();
            const n = 5 + Math.floor(rnd() * 2);
            for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rnd() * 0.5, rr = r * (0.8 + rnd() * 0.35); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; k ? s.g.lineTo(px, py) : s.g.moveTo(px, py); }
            s.g.closePath(); s.g.fillStyle = PATCH[Math.floor(rnd() * 3)]; s.g.fill();
        }
        // pale lower legs and dark hooves over the pattern
        for (const x of [-0.44, 0.14]) { s.g.fillStyle = 'rgba(241,223,184,.92)'; s.g.fillRect(x - 0.07, -0.62, 0.14, 0.32); oval(s.g, x, -0.6, 0.055, 0.03, '#2f2118'); }
        // the mane: a short dark brush down the back of the neck
        for (let i = 0; i <= 16; i++) { const t = i / 16, x = 0.08 + 0.24 * t, y = 0.2 + 0.72 * t; line(s.g, 0.012, '#6b3b18', () => { s.g.moveTo(x, y); s.g.lineTo(x - 0.05, y + 0.025); }); }
        // a fine sheen of hair on top
        strokes(s.g, rnd, [-0.6, -0.2, 0.5, 1.0], 90, { len: 0.03, ang: -0.6, col: 'rgba(255,250,235,.18)', w: 0.006 });
        s.done();
        // muzzle, nostril, eye
        oval(ctx, 0.64, 0.85, 0.05, 0.04, 'rgba(225,200,160,.9)');
        oval(ctx, 0.67, 0.86, 0.008, 0.012, '#2a1c12');
        line(ctx, 0.008, GIR.line, () => { ctx.moveTo(0.69, 0.82); ctx.quadraticCurveTo(0.64, 0.81, 0.6, 0.82); });
        eye(ctx, 0.47, 0.93, 0.022, hot);
    },
};

// ── PENGUIN ─────────────────────────────────────────────────────────────────
// An emperor penguin, standing, three-quarter view facing right: black head
// and back with a blue-grey sheen, golden ear patches fading into a pale
// yellow chest, a long beak with an orange stripe.
const PEN = { base: '#1b1e25', line: '#0a0b0e' };
const penBody = c => { c.moveTo(-0.02, 0.62); c.bezierCurveTo(-0.24, 0.62, -0.26, 0.38, -0.26, 0.24); c.bezierCurveTo(-0.38, 0.0, -0.38, -0.4, -0.22, -0.56); c.lineTo(0.24, -0.56); c.bezierCurveTo(0.38, -0.36, 0.34, 0.0, 0.2, 0.26); c.bezierCurveTo(0.2, 0.46, 0.14, 0.62, -0.02, 0.62); c.closePath(); };
const penguin = {
    key: 'penguin', name: 'PENGUIN', col: '#f2f2ec', dark: PEN.line,
    parts: [
        [[-0.02, 0.62], [-0.24, 0.5], [-0.34, 0.0], [-0.24, -0.56], [0.26, -0.56], [0.34, -0.1], [0.2, 0.42]],
        [[-0.26, -0.62], [0.3, -0.62], [0.28, -0.52], [-0.24, -0.52]],
        [[0.12, 0.47], [0.44, 0.37], [0.12, 0.38]],
    ],
    draw(ctx, hot) {
        const rnd = rng(53);
        // feet
        for (const x of [-0.12, 0.12]) { ctx.beginPath(); ctx.moveTo(x - 0.1, -0.54); ctx.quadraticCurveTo(x + 0.02, -0.66, x + 0.16, -0.6); ctx.lineTo(x + 0.08, -0.53); ctx.closePath(); ctx.fillStyle = '#2c2a2a'; ctx.fill(); ctx.lineWidth = LW * 0.6; ctx.strokeStyle = '#000'; ctx.stroke(); }
        const s = body(ctx, [penBody], PEN, { top: 0.62, bottom: -0.56, light: 0.1, shadow: 0.2 });
        // blue-grey sheen on the back
        const sh = s.g.createLinearGradient(-0.35, 0, 0, 0); sh.addColorStop(0, 'rgba(110,130,160,.55)'); sh.addColorStop(1, 'rgba(110,130,160,0)');
        s.g.fillStyle = sh; s.g.fillRect(-0.4, -0.6, 0.4, 1.1);
        // the white front, warming to pale yellow at the chest
        s.g.beginPath(); s.g.moveTo(0.05, 0.3); s.g.bezierCurveTo(0.24, 0.24, 0.36, -0.1, 0.24, -0.56); s.g.lineTo(-0.16, -0.56); s.g.bezierCurveTo(-0.2, -0.2, -0.1, 0.16, 0.05, 0.3); s.g.closePath();
        const wg = s.g.createLinearGradient(0, 0.3, 0, -0.56); wg.addColorStop(0, '#f6e7a8'); wg.addColorStop(0.35, '#fbfaf4'); wg.addColorStop(1, '#e4e6e8');
        s.g.fillStyle = wg; s.g.fill();
        // golden ear patch
        const gp = s.g.createRadialGradient(0.06, 0.34, 0.01, 0.06, 0.34, 0.14); gp.addColorStop(0, 'rgba(250,190,60,1)'); gp.addColorStop(1, 'rgba(250,190,60,0)');
        s.g.fillStyle = gp; s.g.beginPath(); s.g.ellipse(0.06, 0.32, 0.1, 0.15, -0.4, 0, Math.PI * 2); s.g.fill();
        // feathers: fine short strokes
        strokes(s.g, rnd, [-0.15, -0.5, 0.3, 0.2], 90, { len: 0.03, ang: -1.5, col: 'rgba(120,120,110,.18)', w: 0.006 });
        strokes(s.g, rnd, [-0.35, -0.5, 0.0, 0.5], 60, { len: 0.03, ang: -1.5, col: 'rgba(160,180,210,.15)', w: 0.006 });
        s.done();
        // the flipper, hanging along the side
        ctx.beginPath(); ctx.moveTo(-0.12, 0.18); ctx.bezierCurveTo(-0.02, 0.1, 0.02, -0.18, -0.04, -0.34); ctx.quadraticCurveTo(-0.16, -0.2, -0.2, 0.08); ctx.closePath();
        ctx.fillStyle = '#20242c'; ctx.fill(); ctx.lineWidth = LW * 0.7; ctx.strokeStyle = 'rgba(150,170,200,.5)'; ctx.stroke();
        // beak: black, with the orange stripe on the lower mandible
        ctx.beginPath(); ctx.moveTo(0.12, 0.47); ctx.quadraticCurveTo(0.3, 0.45, 0.44, 0.38); ctx.quadraticCurveTo(0.3, 0.38, 0.12, 0.39); ctx.closePath();
        ctx.fillStyle = '#15161a'; ctx.fill(); ctx.lineWidth = LW * 0.6; ctx.strokeStyle = '#000'; ctx.stroke();
        line(ctx, 0.016, '#f08a24', () => { ctx.moveTo(0.14, 0.4); ctx.quadraticCurveTo(0.26, 0.395, 0.34, 0.39); });
        eye(ctx, 0.06, 0.48, 0.02, hot, '#140d0a');
    },
};

// ── PANDA ───────────────────────────────────────────────────────────────────
// A giant panda sitting up, front on: cream fur, the black band over the
// shoulders down both arms, black legs with paw pads, round ears, slanted
// eye patches, a small black nose.
const PAN = { base: '#efece4', line: '#2a2826' };
const BLK = '#1c1b1f';
const panBody = c => c.ellipse(0, -0.16, 0.46, 0.4, 0, 0, Math.PI * 2);
const panHead = c => { c.moveTo(-0.34, 0.34); c.bezierCurveTo(-0.34, 0.6, 0.34, 0.6, 0.34, 0.34); c.bezierCurveTo(0.34, 0.12, 0.14, 0.06, 0, 0.06); c.bezierCurveTo(-0.14, 0.06, -0.34, 0.12, -0.34, 0.34); c.closePath(); };
const panda = {
    key: 'panda', name: 'PANDA', col: PAN.base, dark: PAN.line,
    parts: [
        ell(0.46, 0.4, 0, -0.16, 10),
        ell(0.34, 0.26, 0, 0.33, 10),
        ell(0.11, 0.11, -0.26, 0.56, 6),
        ell(0.11, 0.11, 0.26, 0.56, 6),
        [[-0.46, -0.58], [0.46, -0.58], [0.46, -0.34], [-0.46, -0.34]],
    ],
    draw(ctx, hot) {
        const rnd = rng(71);
        // ears
        for (const s of [-1, 1]) { oval(ctx, s * 0.26, 0.56, 0.11, 0.105, BLK, 0, PAN.line); strokes(ctx, rnd, [s * 0.26 - 0.08, 0.5, s * 0.26 + 0.08, 0.64], 12, { len: 0.03, ang: 1.4, col: 'rgba(255,255,255,.12)', w: 0.006 }); }
        // body first, with the black band over the shoulders and down the arms
        const s = body(ctx, [panBody], PAN, { top: 0.24, bottom: -0.56, light: 0.2, shadow: 0.3 });
        s.g.fillStyle = BLK;
        s.g.beginPath(); s.g.moveTo(-0.5, -0.1); s.g.bezierCurveTo(-0.46, 0.18, -0.2, 0.2, 0, 0.2); s.g.bezierCurveTo(0.2, 0.2, 0.46, 0.18, 0.5, -0.1);
        s.g.lineTo(0.3, -0.34); s.g.bezierCurveTo(0.24, -0.2, 0.2, -0.04, 0.12, 0.0); s.g.lineTo(-0.12, 0.0); s.g.bezierCurveTo(-0.2, -0.04, -0.24, -0.2, -0.3, -0.34); s.g.closePath(); s.g.fill();
        strokes(s.g, rnd, [-0.45, -0.55, 0.45, 0.2], 140, { len: 0.035, ang: (x, y) => -1.57 + x * 0.8, col: 'rgba(160,150,135,.24)', w: 0.007 });
        strokes(s.g, rnd, [-0.5, -0.34, 0.5, 0.2], 80, { len: 0.035, ang: -1.5, col: 'rgba(130,120,110,.3)', w: 0.007 });
        s.done();
        // then the head over it
        const h = body(ctx, [panHead], PAN, { top: 0.58, bottom: 0.05, light: 0.22, shadow: 0.18 });
        strokes(h.g, rnd, [-0.34, 0.06, 0.34, 0.56], 90, { len: 0.03, ang: (x, y) => Math.atan2(y - 0.3, x) , col: 'rgba(160,150,135,.22)', w: 0.006 });
        h.done();
        // hind legs out front with leathery pads
        for (const sd of [-1, 1]) {
            oval(ctx, sd * 0.27, -0.44, 0.18, 0.13, BLK, sd * 0.2, PAN.line);
            oval(ctx, sd * 0.29, -0.45, 0.07, 0.06, '#4a3f3c');
            for (const d of [-0.06, 0, 0.06]) oval(ctx, sd * 0.29 + d, -0.37, 0.022, 0.02, '#4a3f3c');
            strokes(ctx, rnd, [sd * 0.27 - 0.15, -0.52, sd * 0.27 + 0.15, -0.34], 20, { len: 0.03, ang: 1.2, col: 'rgba(255,255,255,.1)', w: 0.006 });
        }
        // eye patches: teardrops slanting down and out
        for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * 0.13, 0.31, 0.075, 0.115, sd * 0.75, 0, Math.PI * 2); ctx.fillStyle = BLK; ctx.fill(); }
        eye(ctx, -0.12, 0.33, 0.022, hot, '#120c08'); eye(ctx, 0.12, 0.33, 0.022, hot, '#120c08');
        // muzzle, nose and mouth
        oval(ctx, 0, 0.17, 0.11, 0.075, 'rgba(255,253,248,.7)');
        ctx.beginPath(); ctx.moveTo(-0.045, 0.21); ctx.quadraticCurveTo(0, 0.24, 0.045, 0.21); ctx.quadraticCurveTo(0.03, 0.17, 0, 0.165); ctx.quadraticCurveTo(-0.03, 0.17, -0.045, 0.21); ctx.fillStyle = BLK; ctx.fill();
        line(ctx, 0.01, BLK, () => { ctx.moveTo(0, 0.165); ctx.lineTo(0, 0.13); ctx.moveTo(-0.05, 0.12); ctx.quadraticCurveTo(0, 0.1, 0.05, 0.12); });
    },
};

export const ART = { pig, elephant, giraffe, penguin, panda };

// ── Sprites ─────────────────────────────────────────────────────────────────
// Paint an animal once at `ppm` pixels per metre and keep it. Returns the
// image and where its body origin sits inside it, in pixels.
const _sprites = new Map();
export function spriteOf(def, ppm, hot = false) {
    const k = `${def.key}|${Math.round(ppm)}|${hot ? 1 : 0}`;
    let s = _sprites.get(k);
    if (s) return s;
    const pts = def.parts.flat(), pad = 0.25;
    const x0 = Math.min(...pts.map(p => p[0])) - pad, x1 = Math.max(...pts.map(p => p[0])) + pad;
    const y0 = Math.min(...pts.map(p => p[1])) - pad, y1 = Math.max(...pts.map(p => p[1])) + pad;
    const c = document.createElement('canvas');
    c.width = Math.ceil((x1 - x0) * ppm); c.height = Math.ceil((y1 - y0) * ppm);
    const ctx = c.getContext('2d');
    ctx.setTransform(ppm, 0, 0, -ppm, -x0 * ppm, y1 * ppm);
    def.draw(ctx, hot);
    s = { img: c, ox: -x0 * ppm, oy: y1 * ppm };
    if (_sprites.size > 80) _sprites.clear();
    _sprites.set(k, s);
    return s;
}
