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

// ── TORTOISE ────────────────────────────────────────────────────────────────
// A land tortoise, side on, facing right: a high domed shell of plates with
// growth rings, a scaly head and stumpy elephantine legs.
const TOR = { base: '#86825a', line: '#2f2a1a', dark: '#5f5c3e' };
const SHELL = { base: '#7b5a30', line: '#2a1d0e' };
const torShell = c => { c.moveTo(-0.66, -0.15); c.bezierCurveTo(-0.66, 0.2, -0.36, 0.46, 0.0, 0.46); c.bezierCurveTo(0.36, 0.46, 0.64, 0.2, 0.64, -0.15); c.closePath(); };
const torHead = c => { c.moveTo(0.5, -0.06); c.bezierCurveTo(0.58, 0.08, 0.74, 0.14, 0.86, 0.1); c.bezierCurveTo(0.96, 0.06, 0.97, -0.04, 0.9, -0.08); c.bezierCurveTo(0.8, -0.13, 0.62, -0.14, 0.52, -0.16); c.closePath(); };
const torLeg = x => c => { c.moveTo(x - 0.11, -0.1); c.lineTo(x - 0.12, -0.4); c.quadraticCurveTo(x, -0.46, x + 0.12, -0.4); c.lineTo(x + 0.11, -0.1); c.closePath(); };
const turtle = {
    key: 'turtle', name: 'TORTOISE', col: SHELL.base, dark: SHELL.line,
    parts: [
        [[-0.66, -0.15], [-0.58, 0.16], [-0.34, 0.38], [0.0, 0.46], [0.34, 0.38], [0.58, 0.16], [0.64, -0.15]],
        rect(0.24, 0.32, -0.4, -0.28),
        rect(0.24, 0.32, 0.34, -0.28),
        [[0.5, -0.06], [0.7, 0.13], [0.88, 0.1], [0.96, 0.0], [0.9, -0.09], [0.52, -0.16]],
    ],
    draw(ctx, hot) {
        const rnd = rng(83);
        for (const x of [-0.24, 0.48]) { const s = body(ctx, [torLeg(x)], { ...TOR, base: TOR.dark }, { light: 0, shadow: 0.3 }); s.done(); }
        const k = body(ctx, [torHead, torLeg(-0.4), torLeg(0.34)], TOR, { top: 0.15, bottom: -0.45 });
        spots(k.g, rnd, [-0.55, -0.45, 0.95, 0.14], 60, 0.022, 'rgba(40,36,20,.35)');
        spots(k.g, rnd, [-0.55, -0.45, 0.95, 0.14], 40, 0.018, 'rgba(255,250,220,.18)');
        for (const x of [-0.4, 0.34]) for (const d of [-0.07, 0, 0.07]) oval(k.g, x + d, -0.42, 0.022, 0.016, '#d8cfa8');
        k.done();
        // the shell: rim of marginal plates, then the big scutes with growth rings
        const s = body(ctx, [torShell], SHELL, { top: 0.46, bottom: -0.16, light: 0.3, shadow: 0.35 });
        const plate = (cx, cy, rx, ry, rot) => {
            s.g.beginPath();
            for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry; i ? s.g.lineTo(px, py) : s.g.moveTo(px, py); }
            s.g.closePath();
            const pg = s.g.createRadialGradient(cx, cy, 0.01, cx, cy, Math.max(rx, ry));
            pg.addColorStop(0, '#c99a52'); pg.addColorStop(0.55, '#9a6f38'); pg.addColorStop(1, '#5a3d1a');
            s.g.fillStyle = pg; s.g.fill(); s.g.lineWidth = 0.014; s.g.strokeStyle = '#2a1d0e'; s.g.stroke();
            for (const f of [0.75, 0.5]) { s.g.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; const px = cx + Math.cos(a) * rx * f, py = cy + Math.sin(a) * ry * f; i ? s.g.lineTo(px, py) : s.g.moveTo(px, py); } s.g.closePath(); s.g.lineWidth = 0.006; s.g.strokeStyle = 'rgba(40,25,10,.4)'; s.g.stroke(); }
        };
        for (let i = 0; i < 9; i++) { const a = Math.PI * (0.06 + i * 0.11); plate(Math.cos(a) * -0.6, -0.1 + Math.sin(a) * 0.5, 0.075, 0.06, a); }
        for (const [cx, cy] of [[-0.36, 0.06], [0.0, 0.1], [0.36, 0.06]]) plate(cx, cy, 0.17, 0.15, Math.PI / 6);
        for (const [cx, cy] of [[-0.18, 0.32], [0.18, 0.32]]) plate(cx, cy, 0.13, 0.1, Math.PI / 6);
        s.done();
        line(ctx, 0.012, '#2a1d0e', () => { ctx.moveTo(-0.66, -0.15); ctx.lineTo(0.64, -0.15); });
        // face: a hooked beak line, nostril, eye
        line(ctx, 0.01, TOR.line, () => { ctx.moveTo(0.94, -0.03); ctx.quadraticCurveTo(0.86, -0.06, 0.78, -0.04); });
        oval(ctx, 0.92, 0.04, 0.008, 0.008, '#1c1a10');
        eye(ctx, 0.8, 0.05, 0.022, hot, '#3a2a10');
    },
};

// ── CROCODILE ───────────────────────────────────────────────────────────────
// A Nile crocodile lying flat, side on, facing right: armoured back with rows
// of ridged scutes, a serrated tail, a pale belly, a long toothy snout and a
// raised eye with a slit pupil.
const CRO = { base: '#5a6838', line: '#1c2210', dark: '#3e4826' };
const croBody = c => { c.moveTo(-1.12, -0.06); c.bezierCurveTo(-0.9, 0.0, -0.6, 0.1, -0.3, 0.14); c.bezierCurveTo(0.1, 0.18, 0.4, 0.16, 0.58, 0.1); c.lineTo(0.58, -0.14); c.bezierCurveTo(0.2, -0.2, -0.3, -0.18, -0.6, -0.12); c.bezierCurveTo(-0.85, -0.08, -1.0, -0.08, -1.12, -0.06); c.closePath(); };
const croHead = c => { c.moveTo(0.52, 0.11); c.bezierCurveTo(0.62, 0.15, 0.72, 0.16, 0.8, 0.12); c.bezierCurveTo(0.95, 0.07, 1.12, 0.06, 1.18, 0.02); c.bezierCurveTo(1.2, -0.04, 1.16, -0.08, 1.08, -0.09); c.bezierCurveTo(0.9, -0.11, 0.7, -0.14, 0.52, -0.14); c.closePath(); };
const croLeg = (x, back) => c => { c.moveTo(x - 0.07, -0.08); c.lineTo(x - (back ? 0.1 : 0.05), -0.28); c.lineTo(x + 0.1, -0.28); c.lineTo(x + 0.08, -0.08); c.closePath(); };
const croc = {
    key: 'croc', name: 'CROC', col: CRO.base, dark: CRO.line,
    parts: [
        [[-0.42, -0.17], [-0.42, 0.12], [0.3, 0.17], [0.58, 0.1], [0.58, -0.14], [0.3, -0.18]],
        [[-1.12, -0.07], [-1.0, -0.01], [-0.42, 0.12], [-0.42, -0.17], [-0.9, -0.09]],
        [[0.52, -0.14], [0.52, 0.11], [0.78, 0.15], [1.18, 0.03], [1.16, -0.08], [0.8, -0.13]],
        rect(0.18, 0.2, -0.28, -0.2),
        rect(0.18, 0.2, 0.34, -0.2),
    ],
    draw(ctx, hot) {
        const rnd = rng(97);
        for (const x of [-0.14, 0.46]) { const s = body(ctx, [croLeg(x, x < 0)], { ...CRO, base: CRO.dark }, { light: 0, shadow: 0.3 }); s.done(); }
        const s = body(ctx, [croBody, croHead, croLeg(-0.28, true), croLeg(0.34)], CRO, { top: 0.18, bottom: -0.28, light: 0.22, shadow: 0.2 });
        // pale belly scales underneath
        s.g.fillStyle = '#c4bd84'; s.g.beginPath(); s.g.moveTo(-1.0, -0.08); s.g.bezierCurveTo(-0.5, -0.06, 0.2, -0.08, 1.1, -0.06); s.g.lineTo(1.1, -0.2); s.g.lineTo(-1.0, -0.2); s.g.closePath(); s.g.fill();
        for (let x = -0.9; x < 1.0; x += 0.06) line(s.g, 0.005, 'rgba(60,60,30,.35)', () => { s.g.moveTo(x, -0.07); s.g.lineTo(x, -0.2); });
        // armour: a grid of scutes on the flank, bony bumps along the back
        for (let x = -0.95; x < 0.55; x += 0.07) for (let y = -0.04; y < 0.14; y += 0.06) {
            const top = y + 0.06 > 0.1 - Math.abs(x + 0.2) * 0.12;
            if (y > 0.12 - Math.abs(x + 0.1) * 0.15) continue;
            s.g.fillStyle = rnd() < 0.5 ? 'rgba(30,38,15,.35)' : 'rgba(120,130,70,.3)';
            s.g.beginPath(); s.g.rect(x + 0.006, y + 0.006, 0.058, 0.048); s.g.fill();
        }
        spots(s.g, rnd, [0.55, -0.1, 1.15, 0.12], 40, 0.012, 'rgba(25,30,10,.4)');
        s.g.fillStyle = 'rgba(25,30,12,.8)';
        s.done();
        // the serrated ridge down the back and tail
        ctx.fillStyle = CRO.dark; ctx.strokeStyle = CRO.line; ctx.lineWidth = 0.008;
        for (let x = -1.05; x < 0.45; x += 0.07) {
            const y = x < -0.3 ? -0.04 + (x + 1.12) * 0.22 : 0.15;
            const h = x < -0.3 ? 0.035 : 0.022;
            ctx.beginPath(); ctx.moveTo(x - 0.025, y - 0.005); ctx.lineTo(x, y + h); ctx.lineTo(x + 0.025, y - 0.005); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // jaw line with teeth, nostril, the raised eye
        line(ctx, 0.01, CRO.line, () => { ctx.moveTo(0.62, -0.06); ctx.bezierCurveTo(0.8, -0.05, 1.0, -0.03, 1.16, -0.02); });
        ctx.fillStyle = '#f2ecd6'; ctx.strokeStyle = 'rgba(28,34,16,.7)'; ctx.lineWidth = 0.004;
        for (let x = 0.7; x < 1.14; x += 0.05) { const y = -0.05 + (x - 0.62) * 0.06; ctx.beginPath(); ctx.moveTo(x - 0.012, y); ctx.lineTo(x, y - 0.035); ctx.lineTo(x + 0.012, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        oval(ctx, 1.12, 0.05, 0.016, 0.01, '#1c2210');
        oval(ctx, 0.78, 0.15, 0.06, 0.04, CRO.base, 0, CRO.line);
        oval(ctx, 0.79, 0.155, 0.035, 0.026, hot ? '#f4efe6' : '#d8b23a', 0, '#1c2210', 0.006);
        oval(ctx, 0.79, 0.155, 0.007, hot ? 0.01 : 0.022, '#0a0a04');
    },
};

// ── RABBIT ──────────────────────────────────────────────────────────────────
// A wild rabbit sitting up, side on, facing right: agouti fur, long upright
// ears with dark tips, a big dark eye, a white scut.
const RAB = { base: '#9c8264', line: '#3a2c1e' };
const rabBody = c => c.ellipse(-0.08, -0.08, 0.42, 0.32, 0.15, 0, Math.PI * 2);
const rabHead = c => { c.moveTo(0.14, 0.14); c.bezierCurveTo(0.16, 0.36, 0.42, 0.4, 0.52, 0.26); c.bezierCurveTo(0.58, 0.18, 0.56, 0.08, 0.48, 0.06); c.bezierCurveTo(0.36, 0.02, 0.2, 0.02, 0.14, 0.14); c.closePath(); };
const rabEar = (dx, lean) => c => { c.moveTo(0.18 + dx, 0.32); c.bezierCurveTo(0.12 + dx - lean, 0.56, 0.12 + dx - lean, 0.78, 0.18 + dx - lean, 0.8); c.bezierCurveTo(0.26 + dx - lean, 0.8, 0.3 + dx - lean * 0.6, 0.56, 0.3 + dx, 0.34); c.closePath(); };
const rabFeet = c => { c.moveTo(-0.44, -0.3); c.bezierCurveTo(-0.44, -0.42, -0.2, -0.43, 0.0, -0.42); c.lineTo(0.38, -0.42); c.bezierCurveTo(0.42, -0.4, 0.4, -0.34, 0.3, -0.32); c.lineTo(-0.3, -0.26); c.closePath(); };
const rabbit = {
    key: 'rabbit', name: 'BUNNY', col: RAB.base, dark: RAB.line,
    parts: [
        ell(0.42, 0.32, -0.08, -0.08, 10),
        [[0.14, 0.14], [0.22, 0.34], [0.46, 0.34], [0.57, 0.16], [0.48, 0.05], [0.2, 0.04]],
        [[0.18, 0.32], [0.3, 0.34], [0.24, 0.8], [0.12, 0.79]],
        [[-0.44, -0.43], [0.4, -0.43], [0.4, -0.32], [-0.44, -0.28]],
    ],
    draw(ctx, hot) {
        const rnd = rng(109);
        // far ear, in shadow, leaning back
        const f = body(ctx, [rabEar(-0.07, 0.08)], { ...RAB, base: '#85694e' }, { light: 0, shadow: 0.2, top: 0.8, bottom: 0.3 }); f.done();
        const s = body(ctx, [rabBody, rabHead, rabEar(0, 0.02), rabFeet], RAB, { top: 0.8, bottom: -0.44, light: 0.2, shadow: 0.3 });
        // agouti: dark and pale hairs, a cream chest and belly
        s.g.fillStyle = 'rgba(232,218,190,.85)'; s.g.beginPath(); s.g.ellipse(0.18, -0.12, 0.16, 0.2, -0.3, 0, Math.PI * 2); s.g.fill();
        strokes(s.g, rnd, [-0.5, -0.42, 0.56, 0.4], 260, { len: 0.035, ang: (x, y) => Math.PI + 0.4 + y * 0.6, col: 'rgba(40,28,18,.3)', w: 0.006 });
        strokes(s.g, rnd, [-0.5, -0.42, 0.56, 0.4], 200, { len: 0.03, ang: (x, y) => Math.PI + 0.4 + y * 0.6, col: 'rgba(235,220,190,.3)', w: 0.006 });
        // ear: pink-grey inside, black-edged tip
        s.g.fillStyle = 'rgba(214,170,160,.6)'; s.g.beginPath(); s.g.ellipse(0.22, 0.56, 0.035, 0.18, 0.05, 0, Math.PI * 2); s.g.fill();
        s.g.fillStyle = 'rgba(30,22,16,.85)'; s.g.beginPath(); s.g.ellipse(0.15, 0.78, 0.07, 0.05, 0, 0, Math.PI * 2); s.g.fill();
        s.done();
        // the white scut
        oval(ctx, -0.48, -0.06, 0.07, 0.065, '#f6f3ec', 0, 'rgba(58,44,30,.5)', 0.008);
        // face
        oval(ctx, 0.55, 0.15, 0.022, 0.016, '#b58478');
        line(ctx, 0.008, RAB.line, () => { ctx.moveTo(0.55, 0.135); ctx.quadraticCurveTo(0.52, 0.09, 0.48, 0.09); });
        line(ctx, 0.004, 'rgba(240,235,225,.8)', () => { for (const d of [0.02, -0.01, -0.04]) { ctx.moveTo(0.52, 0.12); ctx.lineTo(0.68, 0.12 + d); } });
        oval(ctx, 0.39, 0.25, 0.05, 0.045, 'rgba(225,205,170,.8)');
        eye(ctx, 0.39, 0.25, 0.034, hot, '#1e130c');
        // front paw
        oval(ctx, 0.3, -0.36, 0.07, 0.04, '#b29a7c', 0, RAB.line, 0.01);
    },
};

// ── CAT ─────────────────────────────────────────────────────────────────────
// An orange tabby sitting, three-quarter view facing right: striped coat, a
// cream chest and muzzle, green almond eyes, the tail curled round the paws.
const CAT = { base: '#d88a3e', line: '#3e2210' };
const catBody = c => { c.moveTo(-0.34, -0.42); c.bezierCurveTo(-0.4, -0.1, -0.3, 0.2, -0.06, 0.3); c.bezierCurveTo(0.12, 0.34, 0.26, 0.2, 0.28, 0.0); c.bezierCurveTo(0.3, -0.16, 0.3, -0.32, 0.3, -0.42); c.closePath(); };
const catHead = c => { c.moveTo(0.0, 0.42); c.bezierCurveTo(0.0, 0.3, 0.1, 0.24, 0.2, 0.24); c.bezierCurveTo(0.32, 0.24, 0.4, 0.32, 0.4, 0.42); c.bezierCurveTo(0.4, 0.5, 0.36, 0.54, 0.34, 0.56); c.lineTo(0.33, 0.72); c.lineTo(0.22, 0.6); c.bezierCurveTo(0.18, 0.61, 0.14, 0.6, 0.11, 0.59); c.lineTo(0.03, 0.7); c.lineTo(0.03, 0.54); c.bezierCurveTo(0.01, 0.5, 0.0, 0.46, 0.0, 0.42); c.closePath(); };
const cat = {
    key: 'cat', name: 'CAT', col: CAT.base, dark: CAT.line,
    parts: [
        [[-0.34, -0.42], [-0.38, -0.06], [-0.2, 0.24], [0.06, 0.32], [0.26, 0.12], [0.3, -0.42]],
        [[0.0, 0.42], [0.06, 0.28], [0.2, 0.24], [0.36, 0.3], [0.4, 0.44], [0.34, 0.58], [0.03, 0.58]],
        [[0.03, 0.54], [0.12, 0.59], [0.03, 0.7]],
        [[0.22, 0.6], [0.34, 0.56], [0.33, 0.72]],
    ],
    draw(ctx, hot) {
        const rnd = rng(127);
        const s = body(ctx, [catBody, catHead], CAT, { top: 0.72, bottom: -0.42, light: 0.25, shadow: 0.3 });
        // cream chest and muzzle
        s.g.fillStyle = '#f2dcb8';
        s.g.beginPath(); s.g.ellipse(0.16, -0.06, 0.12, 0.26, 0.1, 0, Math.PI * 2); s.g.fill();
        s.g.beginPath(); s.g.ellipse(0.27, 0.33, 0.1, 0.07, 0, 0, Math.PI * 2); s.g.fill();
        // tabby stripes: arcs round the body and the forehead "M"
        s.g.strokeStyle = 'rgba(140,72,22,.75)'; s.g.lineCap = 'round';
        for (let i = 0; i < 6; i++) { const y = 0.18 - i * 0.1; s.g.lineWidth = 0.035; s.g.beginPath(); s.g.moveTo(-0.38, y - 0.04); s.g.quadraticCurveTo(-0.2, y + 0.04, -0.04, y - 0.02 + rnd() * 0.04); s.g.stroke(); }
        for (const [x1, y1, x2, y2] of [[0.12, 0.56, 0.16, 0.46], [0.2, 0.58, 0.2, 0.48], [0.28, 0.56, 0.24, 0.46]]) { s.g.lineWidth = 0.022; s.g.beginPath(); s.g.moveTo(x1, y1); s.g.lineTo(x2, y2); s.g.stroke(); }
        s.g.lineWidth = 0.02; s.g.beginPath(); s.g.moveTo(0.04, 0.36); s.g.quadraticCurveTo(0.08, 0.32, 0.12, 0.34); s.g.stroke();
        strokes(s.g, rnd, [-0.4, -0.42, 0.4, 0.6], 200, { len: 0.03, ang: (x, y) => -1.6 + (x - 0.0) * 0.6, col: 'rgba(255,230,190,.22)', w: 0.006 });
        // ear insides
        s.g.fillStyle = 'rgba(230,160,150,.7)'; s.g.beginPath(); s.g.moveTo(0.06, 0.56); s.g.lineTo(0.05, 0.66); s.g.lineTo(0.1, 0.59); s.g.fill();
        s.g.beginPath(); s.g.moveTo(0.25, 0.59); s.g.lineTo(0.32, 0.68); s.g.lineTo(0.32, 0.57); s.g.fill();
        s.done();
        // the tail, curled round the front of the paws
        const tail = () => { ctx.moveTo(-0.32, -0.36); ctx.bezierCurveTo(-0.3, -0.5, 0.1, -0.5, 0.3, -0.42); };
        line(ctx, 0.11, CAT.line, tail); line(ctx, 0.07, CAT.base, tail);
        for (const x of [-0.18, 0.0, 0.16]) line(ctx, 0.03, 'rgba(140,72,22,.75)', () => { ctx.moveTo(x, -0.43); ctx.lineTo(x + 0.01, -0.48); });
        // front paws
        for (const x of [0.12, 0.24]) oval(ctx, x, -0.4, 0.06, 0.035, '#f2dcb8', 0, CAT.line, 0.01);
        // face
        for (const x of [0.14, 0.3]) {
            oval(ctx, x, 0.41, 0.04, 0.028, hot ? '#f4efe6' : '#8fb83a', 0, '#1e140a', 0.008);
            oval(ctx, x + 0.004, 0.41, hot ? 0.008 : 0.01, hot ? 0.012 : 0.026, '#050302');
            oval(ctx, x - 0.012, 0.42, 0.008, 0.007, 'rgba(255,255,255,.8)');
        }
        ctx.beginPath(); ctx.moveTo(0.33, 0.35); ctx.lineTo(0.37, 0.35); ctx.lineTo(0.35, 0.325); ctx.closePath(); ctx.fillStyle = '#d98a8a'; ctx.fill();
        line(ctx, 0.007, CAT.line, () => { ctx.moveTo(0.35, 0.325); ctx.lineTo(0.35, 0.3); ctx.quadraticCurveTo(0.32, 0.28, 0.3, 0.3); ctx.moveTo(0.35, 0.3); ctx.quadraticCurveTo(0.38, 0.28, 0.4, 0.3); });
        line(ctx, 0.003, 'rgba(255,250,240,.85)', () => { for (const d of [0.03, 0.0, -0.03]) { ctx.moveTo(0.38, 0.33); ctx.lineTo(0.54, 0.34 + d); ctx.moveTo(0.3, 0.33); ctx.lineTo(0.14, 0.34 + d); } });
    },
};

// ── HEDGEHOG ────────────────────────────────────────────────────────────────
// A European hedgehog walking, side on, facing right: a mound of banded
// spines with pale tips, a soft brown face tapering to a black nose.
const HED = { base: '#b9966e', line: '#2e2014' };
const SPN = { base: '#4b3624', line: '#1e140c' };
const hedSpines = c => { c.moveTo(-0.56, -0.2); c.bezierCurveTo(-0.58, 0.12, -0.3, 0.34, 0.02, 0.34); c.bezierCurveTo(0.3, 0.34, 0.46, 0.18, 0.42, -0.02); c.bezierCurveTo(0.3, -0.16, 0.0, -0.2, -0.56, -0.2); c.closePath(); };
const hedFace = c => { c.moveTo(0.26, 0.12); c.bezierCurveTo(0.4, 0.06, 0.56, -0.02, 0.66, -0.08); c.bezierCurveTo(0.7, -0.12, 0.66, -0.16, 0.6, -0.16); c.bezierCurveTo(0.46, -0.2, 0.32, -0.22, 0.2, -0.2); c.closePath(); };
const hedLeg = x => c => { c.moveTo(x - 0.05, -0.16); c.lineTo(x - 0.05, -0.32); c.lineTo(x + 0.07, -0.32); c.lineTo(x + 0.05, -0.16); c.closePath(); };
const hedgehog = {
    key: 'hedgehog', name: 'HEDGEHOG', col: SPN.base, dark: SPN.line,
    parts: [
        [[-0.56, -0.2], [-0.5, 0.12], [-0.26, 0.32], [0.04, 0.35], [0.32, 0.26], [0.44, 0.02], [0.3, -0.18]],
        [[0.22, 0.12], [0.5, 0.02], [0.68, -0.1], [0.62, -0.17], [0.2, -0.21]],
        rect(0.14, 0.14, -0.32, -0.26),
        rect(0.14, 0.14, 0.26, -0.26),
    ],
    draw(ctx, hot) {
        const rnd = rng(131);
        const k = body(ctx, [hedFace, hedLeg(-0.32), hedLeg(0.26)], HED, { top: 0.12, bottom: -0.32 });
        strokes(k.g, rnd, [0.2, -0.32, 0.66, 0.1], 80, { len: 0.025, ang: Math.PI - 0.3, col: 'rgba(60,40,20,.3)', w: 0.006 });
        k.done();
        // the spines: a dark mound, then banded quills fanning out with pale tips
        const s = body(ctx, [hedSpines], SPN, { top: 0.34, bottom: -0.2, light: 0.15, shadow: 0.2 });
        for (let i = 0; i < 420; i++) {
            const a = Math.PI * (0.02 + rnd() * 0.98), r = 0.12 + rnd() * 0.3;
            const x = -0.07 + Math.cos(a) * r * 1.4, y = -0.2 + Math.sin(a) * r * 1.05;
            const dx = Math.cos(a) * 0.08, dy = Math.sin(a) * 0.08;
            s.g.lineCap = 'round';
            s.g.strokeStyle = 'rgba(30,20,12,.8)'; s.g.lineWidth = 0.01; s.g.beginPath(); s.g.moveTo(x, y); s.g.lineTo(x + dx * 0.6, y + dy * 0.6); s.g.stroke();
            s.g.strokeStyle = 'rgba(236,222,196,.85)'; s.g.lineWidth = 0.008; s.g.beginPath(); s.g.moveTo(x + dx * 0.6, y + dy * 0.6); s.g.lineTo(x + dx, y + dy); s.g.stroke();
        }
        s.done();
        // the spiky outer fringe
        ctx.strokeStyle = 'rgba(236,222,196,.9)'; ctx.lineWidth = 0.008; ctx.lineCap = 'round';
        for (let i = 0; i <= 34; i++) { const t = i / 34, a = Math.PI * (0.04 + t * 0.9); const x = -0.07 + Math.cos(a) * 0.5, y = -0.2 + Math.sin(a) * 0.53; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05); ctx.stroke(); }
        // face: ear, nose, eye
        oval(ctx, 0.36, 0.08, 0.035, 0.03, '#8a6a4a', 0, HED.line, 0.008);
        oval(ctx, 0.66, -0.11, 0.03, 0.025, '#120c08');
        oval(ctx, 0.655, -0.1, 0.008, 0.006, 'rgba(255,255,255,.7)');
        line(ctx, 0.006, HED.line, () => { ctx.moveTo(0.63, -0.14); ctx.quadraticCurveTo(0.58, -0.16, 0.54, -0.15); });
        eye(ctx, 0.47, -0.02, 0.02, hot, '#0e0906');
        for (const x of [-0.32, 0.26]) for (const d of [-0.03, 0.0, 0.03]) line(ctx, 0.006, '#2e2014', () => { ctx.moveTo(x + 0.01 + d, -0.32); ctx.lineTo(x + 0.03 + d, -0.34); });
    },
};

// ── FROG ────────────────────────────────────────────────────────────────────
// A green frog sitting, side on, facing right: folded hind leg, dark blotches,
// a pale ridge along the back, a golden eye with a horizontal pupil and the
// round eardrum behind it.
const FRG = { base: '#5e9a3a', line: '#1c3010' };
const frgBody = c => { c.moveTo(-0.46, -0.18); c.bezierCurveTo(-0.46, 0.06, -0.3, 0.2, -0.02, 0.24); c.bezierCurveTo(0.2, 0.27, 0.38, 0.2, 0.5, 0.06); c.bezierCurveTo(0.54, -0.02, 0.5, -0.1, 0.4, -0.14); c.bezierCurveTo(0.2, -0.24, -0.2, -0.24, -0.46, -0.18); c.closePath(); };
const frgThigh = c => c.ellipse(-0.28, -0.14, 0.22, 0.13, 0.25, 0, Math.PI * 2);
const frgEye = c => c.ellipse(0.26, 0.25, 0.09, 0.075, 0, 0, Math.PI * 2);
const frgFoot = c => { c.moveTo(-0.56, -0.3); c.bezierCurveTo(-0.4, -0.34, 0.0, -0.34, 0.1, -0.3); c.lineTo(0.06, -0.22); c.lineTo(-0.5, -0.22); c.closePath(); };
const frog = {
    key: 'frog', name: 'FROG', col: FRG.base, dark: FRG.line,
    parts: [
        [[-0.46, -0.18], [-0.36, 0.1], [-0.02, 0.24], [0.3, 0.24], [0.52, 0.04], [0.42, -0.14], [0.0, -0.23]],
        ell(0.22, 0.14, -0.28, -0.14, 8),
        ell(0.09, 0.075, 0.26, 0.25, 6),
        [[-0.58, -0.32], [0.46, -0.32], [0.46, -0.22], [-0.56, -0.22]],
    ],
    draw(ctx, hot) {
        const rnd = rng(149);
        const s = body(ctx, [frgFoot, frgBody, frgThigh, frgEye], FRG, { top: 0.32, bottom: -0.32, light: 0.3, shadow: 0.3 });
        // pale yellow throat and belly
        s.g.fillStyle = 'rgba(236,226,150,.9)'; s.g.beginPath(); s.g.moveTo(0.48, -0.04); s.g.bezierCurveTo(0.3, -0.2, -0.1, -0.24, -0.3, -0.22); s.g.lineTo(0.5, -0.3); s.g.closePath(); s.g.fill();
        // dark blotches and the thigh's bars
        spots(s.g, rnd, [-0.44, -0.12, 0.3, 0.2], 14, 0.04, 'rgba(30,55,15,.55)');
        for (let i = 0; i < 4; i++) { s.g.save(); s.g.translate(-0.42 + i * 0.09, -0.14); s.g.rotate(0.8); s.g.fillStyle = 'rgba(30,55,15,.6)'; s.g.fillRect(-0.015, -0.08, 0.03, 0.16); s.g.restore(); }
        // the dorsolateral ridge, and a wet sheen
        line(s.g, 0.016, 'rgba(210,225,140,.7)', () => { s.g.moveTo(0.3, 0.17); s.g.bezierCurveTo(0.1, 0.2, -0.2, 0.16, -0.4, 0.0); });
        spots(s.g, rnd, [-0.4, 0.0, 0.45, 0.24], 12, 0.02, 'rgba(255,255,255,.25)');
        s.done();
        // eardrum, mouth, nostril
        oval(ctx, 0.12, 0.13, 0.05, 0.05, '#4a7a2c', 0, 'rgba(28,48,16,.8)', 0.008);
        line(ctx, 0.01, FRG.line, () => { ctx.moveTo(0.52, 0.05); ctx.quadraticCurveTo(0.4, 0.02, 0.2, 0.06); });
        oval(ctx, 0.48, 0.14, 0.01, 0.007, '#1c3010');
        // front leg with splayed toes
        line(ctx, 0.05, FRG.line, () => { ctx.moveTo(0.28, -0.08); ctx.lineTo(0.32, -0.26); });
        line(ctx, 0.03, FRG.base, () => { ctx.moveTo(0.28, -0.08); ctx.lineTo(0.32, -0.26); });
        for (const d of [-0.05, 0.0, 0.05]) line(ctx, 0.014, '#4f8430', () => { ctx.moveTo(0.32, -0.26); ctx.lineTo(0.32 + d + 0.03, -0.3); });
        // the golden eye with its horizontal pupil
        oval(ctx, 0.27, 0.26, 0.055, 0.05, hot ? '#f4efe6' : '#c99a2e', 0, '#1c1608', 0.008);
        oval(ctx, 0.275, 0.26, hot ? 0.012 : 0.034, hot ? 0.01 : 0.016, '#080604');
        oval(ctx, 0.255, 0.275, 0.012, 0.009, 'rgba(255,255,255,.85)');
    },
};

// ── COW ─────────────────────────────────────────────────────────────────────
// A Holstein cow, side on, facing right: white with big black patches, a pink
// muzzle and udder, short horns, a switch of a tail.
const COW = { base: '#f3f1eb', line: '#262222', dark: '#cfcbc2' };
const cowBody = c => { c.moveTo(-0.72, -0.1); c.bezierCurveTo(-0.74, 0.24, -0.62, 0.36, -0.4, 0.34); c.bezierCurveTo(-0.1, 0.32, 0.16, 0.38, 0.32, 0.34); c.bezierCurveTo(0.44, 0.3, 0.46, 0.0, 0.42, -0.14); c.bezierCurveTo(0.1, -0.2, -0.4, -0.2, -0.72, -0.1); c.closePath(); };
const cowHead = c => { c.moveTo(0.36, 0.32); c.bezierCurveTo(0.48, 0.4, 0.62, 0.36, 0.68, 0.24); c.bezierCurveTo(0.74, 0.12, 0.8, 0.02, 0.76, -0.04); c.bezierCurveTo(0.7, -0.08, 0.6, -0.04, 0.54, 0.04); c.bezierCurveTo(0.48, 0.1, 0.42, 0.14, 0.38, 0.12); c.closePath(); };
const cowLeg = x => c => { c.moveTo(x - 0.07, -0.08); c.bezierCurveTo(x - 0.08, -0.3, x - 0.05, -0.44, x - 0.055, -0.56); c.lineTo(x + 0.055, -0.56); c.bezierCurveTo(x + 0.05, -0.44, x + 0.08, -0.3, x + 0.07, -0.08); c.closePath(); };
const cow = {
    key: 'cow', name: 'COW', col: COW.base, dark: COW.line,
    parts: [
        [[-0.72, -0.12], [-0.72, 0.26], [-0.5, 0.36], [0.3, 0.36], [0.44, 0.2], [0.42, -0.15]],
        rect(0.15, 0.46, -0.56, -0.33),
        rect(0.15, 0.46, 0.28, -0.33),
        [[0.36, 0.32], [0.56, 0.38], [0.7, 0.22], [0.78, -0.04], [0.6, -0.04], [0.38, 0.12]],
    ],
    draw(ctx, hot) {
        const rnd = rng(211);
        line(ctx, 0.018, COW.line, () => { ctx.moveTo(-0.7, 0.22); ctx.quadraticCurveTo(-0.84, 0.0, -0.8, -0.3); });
        strokes(ctx, rnd, [-0.84, -0.42, -0.76, -0.3], 14, { len: 0.06, ang: -1.6, col: '#1a1616', w: 0.01 });
        for (const x of [-0.42, 0.4]) { const s = body(ctx, [cowLeg(x)], { ...COW, base: COW.dark }, { light: 0, shadow: 0.3 }); s.done(); }
        const s = body(ctx, [cowBody, cowHead, cowLeg(-0.56), cowLeg(0.28)], COW, { top: 0.4, bottom: -0.56, light: 0.2, shadow: 0.3 });
        // black patches: big irregular blobs
        s.g.fillStyle = '#1f1c1c';
        for (const [cx, cy, r] of [[-0.48, 0.16, 0.16], [-0.1, 0.22, 0.13], [0.2, 0.04, 0.12], [-0.3, -0.06, 0.1], [0.56, 0.28, 0.08], [-0.56, -0.36, 0.07]]) {
            s.g.beginPath();
            for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5); const px = cx + Math.cos(a) * rr * 1.2, py = cy + Math.sin(a) * rr; k ? s.g.quadraticCurveTo(cx + Math.cos(a - 0.35) * rr * 1.5, cy + Math.sin(a - 0.35) * rr * 1.2, px, py) : s.g.moveTo(px, py); }
            s.g.closePath(); s.g.fill();
        }
        strokes(s.g, rnd, [-0.72, -0.3, 0.78, 0.38], 140, { len: 0.03, ang: -1.9, col: 'rgba(140,130,120,.18)', w: 0.006 });
        // hooves
        for (const x of [-0.56, 0.28]) oval(s.g, x, -0.54, 0.06, 0.03, '#2a2422');
        s.done();
        // udder
        oval(ctx, -0.02, -0.17, 0.09, 0.05, '#f0b4b0', 0, COW.line, LW * 0.8);
        for (const d of [-0.05, 0.0, 0.05]) oval(ctx, -0.02 + d, -0.23, 0.012, 0.025, '#e89c98');
        // pink muzzle, nostril, horn, ear, eye
        oval(ctx, 0.73, 0.0, 0.07, 0.06, '#f2b8b0', 0.3, COW.line, LW * 0.7);
        oval(ctx, 0.76, 0.02, 0.012, 0.009, '#3a2020');
        line(ctx, 0.03, COW.line, () => { ctx.moveTo(0.5, 0.38); ctx.quadraticCurveTo(0.52, 0.46, 0.46, 0.5); });
        line(ctx, 0.018, '#e8dcc0', () => { ctx.moveTo(0.5, 0.38); ctx.quadraticCurveTo(0.52, 0.46, 0.46, 0.5); });
        oval(ctx, 0.42, 0.3, 0.09, 0.04, '#1f1c1c', 0.3, COW.line, LW * 0.6);
        eye(ctx, 0.6, 0.24, 0.024, hot);
    },
};

// ── SHEEP ───────────────────────────────────────────────────────────────────
// A Suffolk sheep, side on, facing right: a cloud of cream wool in tight
// curls, a black face with sideways ears, black legs.
const SHP = { base: '#ece4d2', line: '#4a4236' };
const sheepWool = c => c.ellipse(-0.05, 0.06, 0.5, 0.34, 0, 0, Math.PI * 2);
const sheepHead = c => { c.moveTo(0.34, 0.24); c.bezierCurveTo(0.44, 0.32, 0.58, 0.28, 0.66, 0.14); c.bezierCurveTo(0.72, 0.04, 0.7, -0.06, 0.62, -0.07); c.bezierCurveTo(0.54, -0.08, 0.46, 0.0, 0.4, 0.06); c.closePath(); };
const sheepLeg = x => c => { c.moveTo(x - 0.045, -0.2); c.lineTo(x - 0.04, -0.58); c.lineTo(x + 0.05, -0.58); c.lineTo(x + 0.045, -0.2); c.closePath(); };
const sheep = {
    key: 'sheep', name: 'SHEEP', col: SHP.base, dark: SHP.line,
    parts: [
        ell(0.52, 0.36, -0.05, 0.06, 10),
        [[0.34, 0.24], [0.52, 0.31], [0.68, 0.12], [0.66, -0.07], [0.4, 0.05]],
        rect(0.11, 0.36, -0.36, -0.41),
        rect(0.11, 0.36, 0.22, -0.41),
    ],
    draw(ctx, hot) {
        const rnd = rng(223);
        for (const x of [-0.24, 0.32]) { const s = body(ctx, [sheepLeg(x)], { base: '#1c1a18', line: '#000' }, { light: 0, shadow: 0 }); s.done(); }
        const lg = body(ctx, [sheepLeg(-0.36), sheepLeg(0.22), sheepHead], { base: '#23201c', line: '#000' }, { top: 0.3, bottom: -0.6, light: 0.18, shadow: 0 });
        strokes(lg.g, rnd, [0.36, -0.06, 0.7, 0.3], 40, { len: 0.025, ang: Math.PI - 0.5, col: 'rgba(255,255,255,.12)', w: 0.006 });
        lg.done();
        // the fleece: a lumpy outline of curls, each lit from above
        const bumps = [];
        for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2; bumps.push([-0.05 + Math.cos(a) * 0.46, 0.06 + Math.sin(a) * 0.3]); }
        const w = body(ctx, [sheepWool, ...bumps.map(([x, y]) => c => c.arc(x, y, 0.075, 0, Math.PI * 2))], SHP, { top: 0.42, bottom: -0.3, light: 0.3, shadow: 0.3 });
        for (let i = 0; i < 70; i++) {
            const x = -0.5 + rnd() * 0.9, y = -0.22 + rnd() * 0.56, r = 0.045 + rnd() * 0.03;
            const g = w.g.createRadialGradient(x - r * 0.3, y + r * 0.3, r * 0.1, x, y, r);
            g.addColorStop(0, 'rgba(255,252,242,.9)'); g.addColorStop(0.7, 'rgba(225,215,195,.5)'); g.addColorStop(1, 'rgba(160,145,120,.45)');
            w.g.fillStyle = g; w.g.beginPath(); w.g.arc(x, y, r, 0, Math.PI * 2); w.g.fill();
        }
        strokes(w.g, rnd, [-0.55, -0.26, 0.45, 0.4], 120, { len: 0.03, ang: 0, jitter: 6, col: 'rgba(120,105,85,.25)', w: 0.006, curve: 1.2 });
        w.done();
        // sideways ear, nose, eye
        oval(ctx, 0.4, 0.22, 0.09, 0.035, '#23201c', -0.2, '#000', LW * 0.6);
        oval(ctx, 0.66, 0.0, 0.012, 0.008, '#000');
        eye(ctx, 0.52, 0.16, 0.022, hot, '#5a4220');
    },
};

// ── LION ────────────────────────────────────────────────────────────────────
// A male lion, side on, facing right: tawny coat, a dark shaggy mane, a pale
// muzzle, amber eye, and a black tuft on the tail.
const LIO = { base: '#c99a5a', line: '#3a2410', dark: '#a87c44' };
const lionBody = c => { c.moveTo(-0.66, -0.08); c.bezierCurveTo(-0.7, 0.2, -0.5, 0.3, -0.2, 0.28); c.bezierCurveTo(0.1, 0.28, 0.3, 0.32, 0.38, 0.12); c.bezierCurveTo(0.4, -0.04, 0.36, -0.16, 0.3, -0.18); c.bezierCurveTo(0.0, -0.22, -0.4, -0.22, -0.66, -0.08); c.closePath(); };
const lionLeg = x => c => { c.moveTo(x - 0.075, -0.06); c.lineTo(x - 0.07, -0.5); c.quadraticCurveTo(x, -0.56, x + 0.1, -0.52); c.lineTo(x + 0.075, -0.06); c.closePath(); };
const lionMane = c => c.ellipse(0.48, 0.24, 0.3, 0.33, 0.2, 0, Math.PI * 2);
const lionFace = c => { c.moveTo(0.5, 0.36); c.bezierCurveTo(0.62, 0.42, 0.78, 0.36, 0.82, 0.22); c.bezierCurveTo(0.84, 0.14, 0.8, 0.08, 0.72, 0.08); c.bezierCurveTo(0.62, 0.06, 0.54, 0.12, 0.5, 0.2); c.closePath(); };
const lion = {
    key: 'lion', name: 'LION', col: LIO.base, dark: LIO.line,
    parts: [
        [[-0.66, -0.1], [-0.6, 0.24], [-0.2, 0.29], [0.34, 0.24], [0.38, 0.0], [0.3, -0.19], [-0.5, -0.2]],
        rect(0.16, 0.46, -0.48, -0.31),
        rect(0.16, 0.46, 0.22, -0.31),
        ell(0.32, 0.33, 0.52, 0.24, 10),
    ],
    draw(ctx, hot) {
        const rnd = rng(227);
        line(ctx, 0.022, LIO.line, () => { ctx.moveTo(-0.64, 0.12); ctx.bezierCurveTo(-0.82, 0.1, -0.84, -0.1, -0.76, -0.24); });
        line(ctx, 0.012, LIO.base, () => { ctx.moveTo(-0.64, 0.12); ctx.bezierCurveTo(-0.82, 0.1, -0.84, -0.1, -0.76, -0.24); });
        oval(ctx, -0.75, -0.27, 0.035, 0.055, '#2a1a0c', 0.3, LIO.line, 0.008);
        for (const x of [-0.34, 0.34]) { const s = body(ctx, [lionLeg(x)], { ...LIO, base: LIO.dark }, { light: 0, shadow: 0.3 }); s.done(); }
        const s = body(ctx, [lionBody, lionLeg(-0.48), lionLeg(0.22)], LIO, { top: 0.3, bottom: -0.56, light: 0.25, shadow: 0.3 });
        strokes(s.g, rnd, [-0.66, -0.5, 0.38, 0.28], 160, { len: 0.035, ang: Math.PI + 0.2, col: 'rgba(120,80,30,.25)', w: 0.006 });
        s.g.fillStyle = 'rgba(240,220,180,.5)'; s.g.beginPath(); s.g.ellipse(-0.15, -0.16, 0.4, 0.06, 0, 0, Math.PI * 2); s.g.fill();
        s.done();
        // the mane: a dark shaggy halo of long strands
        const m = body(ctx, [lionMane], { base: '#7a4a1e', line: '#2a170a' }, { top: 0.58, bottom: -0.1, light: 0.25, shadow: 0.35 });
        strokes(m.g, rnd, [0.18, -0.1, 0.8, 0.58], 260, { len: 0.08, ang: (x, y) => Math.atan2(y - 0.24, x - 0.5), jitter: 0.5, col: 'rgba(40,20,6,.45)', w: 0.01, curve: 0.4 });
        strokes(m.g, rnd, [0.18, -0.1, 0.8, 0.58], 160, { len: 0.07, ang: (x, y) => Math.atan2(y - 0.24, x - 0.5), jitter: 0.5, col: 'rgba(214,150,70,.4)', w: 0.008, curve: 0.4 });
        m.done();
        const f = body(ctx, [lionFace], LIO, { top: 0.42, bottom: 0.06, light: 0.3, shadow: 0.2 });
        f.g.fillStyle = 'rgba(245,228,195,.85)'; f.g.beginPath(); f.g.ellipse(0.76, 0.14, 0.08, 0.06, 0, 0, Math.PI * 2); f.g.fill();
        f.done();
        // nose, mouth, whisker dots, eye
        ctx.beginPath(); ctx.moveTo(0.8, 0.22); ctx.lineTo(0.84, 0.2); ctx.lineTo(0.82, 0.16); ctx.closePath(); ctx.fillStyle = '#3a2218'; ctx.fill();
        line(ctx, 0.008, LIO.line, () => { ctx.moveTo(0.82, 0.16); ctx.quadraticCurveTo(0.78, 0.1, 0.7, 0.11); });
        for (const [x, y] of [[0.74, 0.15], [0.76, 0.13], [0.72, 0.13]]) oval(ctx, x, y, 0.005, 0.005, '#5a3a20');
        eye(ctx, 0.66, 0.28, 0.022, hot, '#b07818');
    },
};

// ── ZEBRA ───────────────────────────────────────────────────────────────────
// A plains zebra, side on, facing right: a horse's build, bold black stripes
// that wrap the body and band the legs, an upright striped mane.
const ZEB = { base: '#f4f2ee', line: '#151313' };
const zebBody = c => c.ellipse(-0.1, 0.06, 0.54, 0.26, 0.04, 0, Math.PI * 2);
const zebNeck = c => { c.moveTo(0.2, 0.18); c.bezierCurveTo(0.28, 0.4, 0.36, 0.56, 0.44, 0.64); c.lineTo(0.6, 0.56); c.bezierCurveTo(0.54, 0.4, 0.5, 0.2, 0.42, 0.02); c.closePath(); };
const zebHead = c => { c.moveTo(0.44, 0.66); c.bezierCurveTo(0.56, 0.7, 0.76, 0.5, 0.86, 0.38); c.bezierCurveTo(0.9, 0.32, 0.86, 0.26, 0.8, 0.28); c.bezierCurveTo(0.7, 0.32, 0.6, 0.42, 0.54, 0.5); c.closePath(); };
const zebLeg = x => c => { c.moveTo(x - 0.06, -0.12); c.bezierCurveTo(x - 0.07, -0.34, x - 0.04, -0.5, x - 0.05, -0.62); c.lineTo(x + 0.05, -0.62); c.bezierCurveTo(x + 0.04, -0.5, x + 0.07, -0.34, x + 0.06, -0.12); c.closePath(); };
const zebra = {
    key: 'zebra', name: 'ZEBRA', col: ZEB.base, dark: ZEB.line,
    parts: [
        ell(0.54, 0.26, -0.1, 0.06, 10),
        rect(0.13, 0.52, -0.44, -0.36),
        rect(0.13, 0.52, 0.24, -0.36),
        [[0.2, 0.18], [0.44, 0.64], [0.6, 0.56], [0.42, 0.02]],
        [[0.44, 0.66], [0.6, 0.66], [0.88, 0.34], [0.8, 0.27], [0.54, 0.48]],
    ],
    draw(ctx, hot) {
        const rnd = rng(229);
        line(ctx, 0.016, ZEB.line, () => { ctx.moveTo(-0.62, 0.14); ctx.quadraticCurveTo(-0.72, 0.0, -0.7, -0.22); });
        strokes(ctx, rnd, [-0.73, -0.34, -0.67, -0.22], 12, { len: 0.06, ang: -1.6, col: '#111', w: 0.01 });
        for (const x of [-0.3, 0.36]) { const s = body(ctx, [zebLeg(x)], { ...ZEB, base: '#d8d6d0' }, { light: 0, shadow: 0.2 }); s.g.fillStyle = '#1c1a1a'; for (let y = -0.2; y > -0.6; y -= 0.07) s.g.fillRect(x - 0.08, y, 0.16, 0.03); s.done(); }
        // the mane stands up along the neck
        ctx.strokeStyle = ZEB.line; ctx.lineCap = 'round';
        for (let i = 0; i <= 12; i++) { const t = i / 12, x = 0.22 + 0.22 * t, y = 0.22 + 0.44 * t; ctx.lineWidth = 0.05; ctx.strokeStyle = i % 2 ? '#f4f2ee' : '#151313'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 0.06, y + 0.04); ctx.stroke(); }
        const s = body(ctx, [zebBody, zebNeck, zebHead, zebLeg(-0.44), zebLeg(0.24)], ZEB, { top: 0.7, bottom: -0.62, light: 0.15, shadow: 0.2 });
        // stripes: bands that bend round the barrel, chevrons on the rump, rings on the legs
        s.g.fillStyle = '#1a1818';
        for (let x = -0.5; x < 0.4; x += 0.085) { s.g.beginPath(); s.g.moveTo(x, 0.34); s.g.bezierCurveTo(x + 0.06, 0.1, x - 0.02, -0.06, x + 0.05, -0.22); s.g.lineTo(x + 0.085, -0.22); s.g.bezierCurveTo(x + 0.02, -0.06, x + 0.1, 0.1, x + 0.035, 0.34); s.g.closePath(); s.g.fill(); }
        for (let i = 0; i < 6; i++) { const t = i / 6; s.g.beginPath(); s.g.moveTo(0.22 + 0.24 * t, 0.2 + 0.46 * t); s.g.lineTo(0.48 + 0.12 * t, 0.06 + 0.5 * t); s.g.lineTo(0.5 + 0.12 * t, 0.1 + 0.5 * t); s.g.lineTo(0.25 + 0.24 * t, 0.25 + 0.46 * t); s.g.closePath(); s.g.fill(); }
        for (let i = 0; i < 5; i++) { s.g.beginPath(); s.g.moveTo(0.5 + i * 0.07, 0.66 - i * 0.05); s.g.lineTo(0.56 + i * 0.07, 0.6 - i * 0.07); s.g.lineTo(0.58 + i * 0.07, 0.62 - i * 0.07); s.g.lineTo(0.52 + i * 0.07, 0.68 - i * 0.05); s.g.closePath(); s.g.fill(); }
        for (const x of [-0.44, 0.24]) for (let y = -0.18; y > -0.6; y -= 0.07) s.g.fillRect(x - 0.08, y, 0.16, 0.03);
        s.g.beginPath(); s.g.ellipse(0.84, 0.32, 0.06, 0.05, 0.6, 0, Math.PI * 2); s.g.fill();
        s.done();
        oval(ctx, 0.46, 0.68, 0.05, 0.022, '#f4f2ee', 1.2, ZEB.line, LW * 0.6);
        oval(ctx, 0.86, 0.34, 0.01, 0.008, '#555');
        eye(ctx, 0.62, 0.52, 0.022, hot);
    },
};

// ── HIPPO ───────────────────────────────────────────────────────────────────
// A hippopotamus, side on, facing right: a vast barrel on stubby legs, the
// huge square muzzle, little ears and eyes up top, pinkish skin underneath.
const HIP = { base: '#8a7a82', line: '#2c2228', dark: '#6c5c66' };
const hipBody = c => { c.moveTo(-0.74, -0.12); c.bezierCurveTo(-0.76, 0.24, -0.5, 0.4, -0.16, 0.4); c.bezierCurveTo(0.2, 0.4, 0.42, 0.34, 0.5, 0.16); c.lineTo(0.48, -0.2); c.bezierCurveTo(0.1, -0.3, -0.4, -0.3, -0.74, -0.12); c.closePath(); };
const hipHead = c => { c.moveTo(0.38, 0.3); c.bezierCurveTo(0.5, 0.36, 0.62, 0.34, 0.72, 0.26); c.bezierCurveTo(0.84, 0.22, 0.96, 0.16, 0.98, 0.02); c.bezierCurveTo(0.98, -0.12, 0.9, -0.18, 0.76, -0.18); c.bezierCurveTo(0.6, -0.2, 0.48, -0.16, 0.42, -0.1); c.closePath(); };
const hipLeg = x => c => { c.moveTo(x - 0.1, -0.12); c.lineTo(x - 0.11, -0.42); c.quadraticCurveTo(x, -0.47, x + 0.11, -0.42); c.lineTo(x + 0.1, -0.12); c.closePath(); };
const hippo = {
    key: 'hippo', name: 'HIPPO', col: HIP.base, dark: HIP.line,
    parts: [
        [[-0.74, -0.14], [-0.68, 0.24], [-0.36, 0.4], [0.2, 0.4], [0.5, 0.16], [0.48, -0.22], [-0.4, -0.27]],
        [[0.38, 0.3], [0.62, 0.34], [0.94, 0.16], [0.98, -0.1], [0.76, -0.18], [0.42, -0.12]],
        rect(0.22, 0.3, -0.5, -0.29),
        rect(0.22, 0.3, 0.24, -0.29),
    ],
    draw(ctx, hot) {
        const rnd = rng(233);
        line(ctx, 0.022, HIP.line, () => { ctx.moveTo(-0.72, 0.12); ctx.lineTo(-0.82, 0.04); });
        for (const x of [-0.34, 0.38]) { const s = body(ctx, [hipLeg(x)], { ...HIP, base: HIP.dark }, { light: 0, shadow: 0.3 }); s.done(); }
        const s = body(ctx, [hipBody, hipHead, hipLeg(-0.5), hipLeg(0.24)], HIP, { top: 0.42, bottom: -0.44, light: 0.35, shadow: 0.25 });
        // pink underside and muzzle, a wet sheen, sparse bristles
        const pg = s.g.createLinearGradient(0, 0.0, 0, -0.3); pg.addColorStop(0, 'rgba(214,150,150,0)'); pg.addColorStop(1, 'rgba(214,150,150,.75)');
        s.g.fillStyle = pg; s.g.fillRect(-0.8, -0.45, 1.8, 0.45);
        s.g.fillStyle = 'rgba(214,150,150,.5)'; s.g.beginPath(); s.g.ellipse(0.84, -0.04, 0.14, 0.12, 0, 0, Math.PI * 2); s.g.fill();
        s.g.fillStyle = 'rgba(255,255,255,.18)'; s.g.beginPath(); s.g.ellipse(-0.2, 0.3, 0.38, 0.05, -0.05, 0, Math.PI * 2); s.g.fill();
        spots(s.g, rnd, [-0.7, -0.25, 0.95, 0.38], 50, 0.03, 'rgba(60,40,50,.15)');
        for (const x of [-0.5, 0.24]) for (const d of [-0.06, 0.0, 0.06]) oval(s.g, x + d, -0.42, 0.024, 0.016, '#d8c8c0');
        s.done();
        // mouth line, nostril, ear, eye bump
        line(ctx, 0.01, HIP.line, () => { ctx.moveTo(0.97, -0.06); ctx.bezierCurveTo(0.86, -0.08, 0.7, -0.06, 0.6, -0.02); });
        oval(ctx, 0.92, 0.16, 0.022, 0.014, '#3a2a30', 0.4);
        oval(ctx, 0.46, 0.38, 0.04, 0.03, HIP.base, 0, HIP.line, LW * 0.7);
        oval(ctx, 0.62, 0.32, 0.05, 0.035, HIP.base, 0, HIP.line, LW * 0.7);
        eye(ctx, 0.63, 0.33, 0.018, hot, '#3a1c10');
    },
};

// ── FLAMINGO ────────────────────────────────────────────────────────────────
// A greater flamingo standing on one leg: pink plumage deepening on the wing,
// black flight feathers, an S-curved neck, the bent black-tipped bill.
const FLA = { base: '#f2a0a8', line: '#5c2430' };
const flaBody = c => c.ellipse(-0.06, 0.3, 0.34, 0.2, -0.12, 0, Math.PI * 2);
const flaNeck = c => { c.moveTo(0.16, 0.34); c.bezierCurveTo(0.34, 0.4, 0.36, 0.56, 0.26, 0.66); c.bezierCurveTo(0.18, 0.76, 0.22, 0.86, 0.3, 0.88); c.lineTo(0.36, 0.82); c.bezierCurveTo(0.3, 0.8, 0.3, 0.74, 0.36, 0.68); c.bezierCurveTo(0.48, 0.54, 0.42, 0.34, 0.26, 0.24); c.closePath(); };
const flaHead = c => c.ellipse(0.34, 0.86, 0.08, 0.06, 0, 0, Math.PI * 2);
const flamingo = {
    key: 'flamingo', name: 'FLAMINGO', col: FLA.base, dark: FLA.line,
    parts: [
        ell(0.34, 0.2, -0.06, 0.3, 10),
        [[0.16, 0.34], [0.36, 0.5], [0.36, 0.86], [0.26, 0.88], [0.24, 0.6], [0.26, 0.24]],
        [[0.28, 0.9], [0.42, 0.9], [0.56, 0.78], [0.52, 0.72], [0.3, 0.8]],
        rect(0.05, 0.62, 0.0, -0.14),
        [[-0.16, -0.48], [0.16, -0.48], [0.14, -0.42], [-0.14, -0.42]],
    ],
    draw(ctx, hot) {
        const rnd = rng(239);
        // the standing leg, knee bending backwards, and the folded one
        line(ctx, 0.04, '#7a2a36', () => { ctx.moveTo(0.0, 0.14); ctx.lineTo(0.02, -0.12); ctx.lineTo(0.0, -0.44); });
        line(ctx, 0.026, '#e08a92', () => { ctx.moveTo(0.0, 0.14); ctx.lineTo(0.02, -0.12); ctx.lineTo(0.0, -0.44); });
        oval(ctx, 0.02, -0.12, 0.022, 0.02, '#e08a92', 0, '#7a2a36', 0.008);
        line(ctx, 0.022, '#c87078', () => { ctx.moveTo(-0.04, 0.16); ctx.lineTo(-0.16, 0.0); ctx.lineTo(-0.02, -0.06); });
        ctx.beginPath(); ctx.moveTo(-0.15, -0.44); ctx.lineTo(0.15, -0.44); ctx.lineTo(0.0, -0.48); ctx.closePath(); ctx.fillStyle = '#d07880'; ctx.fill(); ctx.lineWidth = 0.008; ctx.strokeStyle = '#7a2a36'; ctx.stroke();
        const s = body(ctx, [flaBody, flaNeck, flaHead], FLA, { top: 0.92, bottom: 0.1, light: 0.25, shadow: 0.25 });
        // wing coverts: deeper pink scalloped rows; black primaries at the tail
        for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const x = -0.3 + i * 0.07 + r * 0.03, y = 0.36 - r * 0.07; oval(s.g, x, y, 0.045, 0.03, `rgba(226,${90 + r * 15},${105 + r * 10},.75)`, -0.2); }
        s.g.fillStyle = '#1a1416'; s.g.beginPath(); s.g.moveTo(-0.42, 0.34); s.g.bezierCurveTo(-0.3, 0.26, -0.2, 0.22, -0.1, 0.2); s.g.lineTo(-0.4, 0.22); s.g.closePath(); s.g.fill();
        strokes(s.g, rnd, [-0.38, 0.12, 0.4, 0.9], 120, { len: 0.025, ang: Math.PI + 0.2, col: 'rgba(255,230,232,.35)', w: 0.006 });
        s.done();
        // the bill: pale, bending down, black at the tip
        ctx.beginPath(); ctx.moveTo(0.38, 0.9); ctx.bezierCurveTo(0.48, 0.9, 0.54, 0.84, 0.56, 0.76); ctx.lineTo(0.5, 0.74); ctx.bezierCurveTo(0.48, 0.8, 0.44, 0.82, 0.38, 0.82); ctx.closePath();
        ctx.fillStyle = '#f6e2da'; ctx.fill(); ctx.lineWidth = LW * 0.7; ctx.strokeStyle = FLA.line; ctx.stroke();
        ctx.save(); ctx.clip(); ctx.fillStyle = '#1a1416'; ctx.fillRect(0.47, 0.7, 0.12, 0.13); ctx.restore();
        eye(ctx, 0.35, 0.87, 0.014, hot, '#d8a020');
    },
};

// ── BARN OWL ────────────────────────────────────────────────────────────────
// A barn owl perched upright, front on: the white heart-shaped face, dark
// eyes, golden-buff wings mottled with grey, a speckled white front.
const OWL = { base: '#d8ab6c', line: '#4a3014' };
const owlBody = c => c.ellipse(0, -0.04, 0.32, 0.46, 0, 0, Math.PI * 2);
const owlHead = c => c.ellipse(0, 0.42, 0.3, 0.26, 0, 0, Math.PI * 2);
const owl = {
    key: 'owl', name: 'BARN OWL', col: OWL.base, dark: OWL.line,
    parts: [
        ell(0.32, 0.46, 0, -0.04, 10),
        ell(0.3, 0.26, 0, 0.42, 10),
        [[-0.2, -0.54], [0.2, -0.54], [0.2, -0.44], [-0.2, -0.44]],
    ],
    draw(ctx, hot) {
        const rnd = rng(241);
        // talons
        for (const x of [-0.1, 0.1]) for (const d of [-0.04, 0, 0.04]) line(ctx, 0.016, '#5a4a40', () => { ctx.moveTo(x, -0.44); ctx.lineTo(x + d, -0.53); });
        const s = body(ctx, [owlBody, owlHead], OWL, { top: 0.68, bottom: -0.5, light: 0.25, shadow: 0.3 });
        // grey mottling on the buff back and wings
        spots(s.g, rnd, [-0.32, -0.4, 0.32, 0.66], 60, 0.02, 'rgba(110,110,120,.35)');
        // white breast with fine dark specks
        s.g.fillStyle = '#f7f1e6'; s.g.beginPath(); s.g.ellipse(0, -0.08, 0.2, 0.36, 0, 0, Math.PI * 2); s.g.fill();
        spots(s.g, rnd, [-0.16, -0.38, 0.16, 0.22], 30, 0.008, 'rgba(60,40,20,.6)');
        // wing edges with feather rows
        for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) line(s.g, 0.008, 'rgba(90,60,30,.45)', () => { const y = 0.16 - i * 0.09; s.g.moveTo(sd * 0.32, y); s.g.quadraticCurveTo(sd * 0.22, y - 0.04, sd * 0.2, y - 0.08); });
        // the heart-shaped facial disc
        s.g.fillStyle = '#fbf7ef'; s.g.strokeStyle = '#c99a58'; s.g.lineWidth = 0.02;
        s.g.beginPath(); s.g.moveTo(0, 0.54); s.g.bezierCurveTo(-0.12, 0.66, -0.3, 0.6, -0.26, 0.42); s.g.bezierCurveTo(-0.24, 0.28, -0.08, 0.2, 0, 0.16); s.g.bezierCurveTo(0.08, 0.2, 0.24, 0.28, 0.26, 0.42); s.g.bezierCurveTo(0.3, 0.6, 0.12, 0.66, 0, 0.54); s.g.closePath(); s.g.fill(); s.g.stroke();
        strokes(s.g, rnd, [-0.24, 0.22, 0.24, 0.56], 60, { len: 0.04, ang: (x, y) => Math.atan2(y - 0.42, x - Math.sign(x) * 0.11), col: 'rgba(200,180,150,.35)', w: 0.005 });
        s.done();
        eye(ctx, -0.1, 0.43, 0.04, hot, '#120a06'); eye(ctx, 0.1, 0.43, 0.04, hot, '#120a06');
        ctx.beginPath(); ctx.moveTo(-0.025, 0.36); ctx.lineTo(0.025, 0.36); ctx.lineTo(0, 0.28); ctx.closePath(); ctx.fillStyle = '#e8d2b8'; ctx.fill(); ctx.lineWidth = 0.008; ctx.strokeStyle = OWL.line; ctx.stroke();
    },
};

// ── SEAL ────────────────────────────────────────────────────────────────────
// A harbour seal hauled out, side on, facing right: a long grey body freckled
// with dark spots, front flipper with claws, hind flippers, a whiskered
// muzzle and big dark eyes.
const SEL = { base: '#8e949a', line: '#262a2e' };
const sealBody = c => { c.moveTo(-0.84, -0.04); c.bezierCurveTo(-0.66, 0.06, -0.3, 0.2, 0.1, 0.22); c.bezierCurveTo(0.34, 0.24, 0.5, 0.2, 0.56, 0.1); c.bezierCurveTo(0.58, -0.06, 0.5, -0.18, 0.3, -0.2); c.bezierCurveTo(-0.1, -0.22, -0.5, -0.16, -0.84, -0.1); c.closePath(); };
const sealHead = c => { c.moveTo(0.44, 0.24); c.bezierCurveTo(0.52, 0.38, 0.7, 0.4, 0.8, 0.32); c.bezierCurveTo(0.88, 0.26, 0.88, 0.16, 0.82, 0.12); c.bezierCurveTo(0.74, 0.06, 0.6, 0.08, 0.5, 0.06); c.closePath(); };
const sealTail = c => { c.moveTo(-0.82, -0.02); c.bezierCurveTo(-0.92, 0.04, -1.0, 0.06, -1.02, 0.0); c.bezierCurveTo(-1.0, -0.08, -0.94, -0.12, -0.84, -0.1); c.closePath(); };
const seal = {
    key: 'seal', name: 'SEAL', col: SEL.base, dark: SEL.line,
    parts: [
        [[-0.84, -0.1], [-0.84, -0.03], [-0.3, 0.18], [0.1, 0.23], [0.5, 0.18], [0.57, 0.02], [0.3, -0.21], [-0.2, -0.2]],
        [[0.44, 0.24], [0.62, 0.38], [0.8, 0.33], [0.87, 0.18], [0.78, 0.07], [0.5, 0.06]],
        [[-1.02, 0.0], [-0.92, 0.05], [-0.82, -0.02], [-0.84, -0.11], [-0.96, -0.1]],
    ],
    draw(ctx, hot) {
        const rnd = rng(251);
        const s = body(ctx, [sealTail, sealBody, sealHead], SEL, { top: 0.4, bottom: -0.22, light: 0.4, shadow: 0.25 });
        // a paler belly, dark freckles, and a wet sheen along the back
        s.g.fillStyle = 'rgba(214,214,206,.6)'; s.g.beginPath(); s.g.moveTo(-0.7, -0.1); s.g.bezierCurveTo(-0.2, -0.12, 0.3, -0.14, 0.56, -0.02); s.g.lineTo(0.56, -0.25); s.g.lineTo(-0.7, -0.25); s.g.closePath(); s.g.fill();
        spots(s.g, rnd, [-0.84, -0.12, 0.86, 0.36], 70, 0.018, 'rgba(40,44,48,.55)');
        s.g.fillStyle = 'rgba(255,255,255,.3)'; s.g.beginPath(); s.g.ellipse(-0.1, 0.16, 0.36, 0.03, 0.08, 0, Math.PI * 2); s.g.fill();
        s.done();
        // front flipper with its claws
        ctx.beginPath(); ctx.moveTo(0.22, -0.02); ctx.bezierCurveTo(0.3, -0.1, 0.34, -0.18, 0.3, -0.22); ctx.lineTo(0.14, -0.2); ctx.bezierCurveTo(0.16, -0.12, 0.16, -0.06, 0.22, -0.02);
        ctx.fillStyle = '#7a8086'; ctx.fill(); ctx.lineWidth = LW * 0.8; ctx.strokeStyle = SEL.line; ctx.stroke();
        for (const d of [0.0, 0.05, 0.1]) line(ctx, 0.008, '#1c1e20', () => { ctx.moveTo(0.16 + d, -0.2); ctx.lineTo(0.15 + d, -0.23); });
        // muzzle: nose, whisker pads, whiskers
        oval(ctx, 0.86, 0.2, 0.018, 0.012, '#1c1e20');
        for (const [x, y] of [[0.8, 0.16], [0.82, 0.13], [0.78, 0.14]]) oval(ctx, x, y, 0.005, 0.005, '#3a3e42');
        line(ctx, 0.004, 'rgba(240,240,232,.85)', () => { for (const d of [0.04, 0.0, -0.04]) { ctx.moveTo(0.8, 0.15); ctx.lineTo(0.98, 0.16 + d); } });
        eye(ctx, 0.7, 0.28, 0.035, hot, '#0c0c0c');
    },
};

export const ART = { pig, elephant, giraffe, penguin, panda, turtle, croc, rabbit, cat, hedgehog, frog, cow, sheep, lion, zebra, hippo, flamingo, owl, seal };

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
