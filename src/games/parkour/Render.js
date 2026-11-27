// ============================================================
// RENDER — the toy room on a canvas. Cosmetic only: it reads the world and
// keeps its own animation state in `view` (it may use Math.random and
// Math.sin; the engine never sees any of it).
//
//   const view = createView(heroImage)    draw(ctx, w, view, cssW, cssH, top, bottom, dt)
//   fx(view, events, w)                   particles and squashes for this frame's events
// ============================================================
import { P, TILE, SOLID_TILES, TOYS } from './core/Rules.js';
import { moverPos, ridePos, cannonAim, tileAt, tickOn } from './core/World.js';

// Each course has its own wallpaper and blocks; the hub is the inside of the toy box.
const THEMES = {
    bounce:  { wall: '#ffe9c7', stripe: '#ffdcaa', toy: '#f7cf95', inner: '#e9b77f', blocks: ['#ff5a5f', '#ff8c42', '#ffc928', '#3b9dff'] },
    slip:    { wall: '#e2f3ff', stripe: '#cbe8ff', toy: '#b9dcf5', inner: '#9fc3e6', blocks: ['#3b9dff', '#5cc8ff', '#7d8cff', '#ffffff'] },
    swing:   { wall: '#e4f8e6', stripe: '#cdeed2', toy: '#b6e2be', inner: '#9ccfa5', blocks: ['#2fd67b', '#ffc928', '#ff8c42', '#3b9dff'] },
    gravity: { wall: '#2c2556', stripe: '#342c66', toy: '#463c80', inner: '#4a3f86', blocks: ['#a970ff', '#ff6fb5', '#5cc8ff', '#ffc928'], night: true },
    pinball: { wall: '#2b1d52', stripe: '#33235f', toy: '#43307a', inner: '#3d2c70', blocks: ['#ff4d6d', '#ffd84a', '#3dffa2', '#5cc8ff'], night: true },
    bath:    { wall: '#e3f8fd', stripe: '#d0f1f9', toy: '#b8e3ee', inner: '#93cfdc', blocks: ['#5cc8ff', '#ff9ad5', '#7ee0c8', '#ffffff'] },
    train:   { wall: '#fff1dc', stripe: '#f6e2c2', toy: '#ead0a6', inner: '#c99c62', blocks: ['#2fd67b', '#ff5a5f', '#ffc928', '#3b9dff'] },
    clock:   { wall: '#1f2a44', stripe: '#26334f', toy: '#33415f', inner: '#3a4766', blocks: ['#ffc928', '#ff8c42', '#5cc8ff', '#a970ff'], night: true },
    shelf:   { wall: '#f6ead7', stripe: '#efdcc0', toy: '#e2c9a3', inner: '#b98a5a', blocks: ['#a0522d', '#cd853f', '#2fd67b', '#3b9dff'] },
    sky:     { wall: '#d6eeff', stripe: '#c6e5ff', toy: '#f4fbff', inner: '#9cc8ea', blocks: ['#ffffff', '#9fd8ff', '#ffd84a', '#ff9ad5'] },
    gym:     { wall: '#fff0f5', stripe: '#ffe0ec', toy: '#ffc9dd', inner: '#e59bb7', blocks: ['#ff5a9e', '#ffc928', '#2fd67b', '#5cc8ff'] },
    castle:  { wall: '#e8e4f5', stripe: '#dcd6ee', toy: '#c8c0e2', inner: '#8f87a8', blocks: ['#9aa3b5', '#7d8597', '#ffc928', '#ff5a5f'] },
    arcade:  { wall: '#231942', stripe: '#2b1f50', toy: '#3a2a66', inner: '#33245c', blocks: ['#ff4d8d', '#ffd84a', '#3dffa2', '#5cc8ff'], night: true },
    pond:    { wall: '#e8f7e4', stripe: '#d8f0d2', toy: '#bfe3b5', inner: '#8cc59a', blocks: ['#2fd67b', '#5cc8ff', '#ffd84a', '#ffffff'] },
    magic:   { wall: '#2e1f4f', stripe: '#38265e', toy: '#4a3478', inner: '#43306e', blocks: ['#a970ff', '#ff6fb5', '#ffd84a', '#5cc8ff'], night: true },
    finale:  { wall: '#fff3d6', stripe: '#ffe8b8', toy: '#f5d79a', inner: '#d9a95c', blocks: ['#ff5a5f', '#ffc928', '#3b9dff', '#2fd67b', '#a970ff'] },
    hub:     { wall: '#f1c78c', stripe: '#e7b874', toy: '#d9a560', inner: '#c98f50', blocks: ['#ff5a5f', '#3b9dff', '#2fd67b', '#ffc928', '#a970ff'] },
};
export const themeOf = level => THEMES[level.kind === 'hub' ? 'hub' : level.theme] || THEMES.bounce;

export function createView(hero = null) {
    return {
        camX: null, camY: null, tile: 32, t: 0, particles: [], squash: {}, face: 1, hero, sheet: null, landSquash: 0,
        doorInfo: null, portalState: null, portalStars: null, stars: [], input: null,
        hv: { runDist: 0, still: 0, landT: 0, stroke: 0, swimT: 0, spin: 0, spinDir: 1, rot: 0, last: null, wordAt: -9 },
        ghosts: [], words: [],
    };
}

const rnd = (a, b) => a + Math.random() * (b - a);
function puff(view, x, y, n, color, speed = 3, life = 0.6, size = 0.12, g = 0) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = rnd(0.3, 1) * speed;
        view.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: size * rnd(0.6, 1.4), g });
    }
}

const WORDS = { hand: ['THWIP!', '#ff4d8d'], warp: ['POOF!', '#a970ff'], click: ['CLICK!', '#2fd67b'], plane: ['WHOOSH!', '#3b9dff'], walljump: ['HUP!', '#ff9f43'], bump: ['BONK!', '#ff4d6d'], pop: ['POP!', '#d98cff'], bounce: ['BOING!', '#ff5a9e'], spring: ['BOING!', '#ff5a5f'], cannon_fire: ['WHEEE!', '#3b9dff'], splash: ['SPLOSH!', '#3b9dff'], flip: ['WHOA!', '#a970ff'], win: ['YAY!', '#2fd67b'], death: ['OOF!', '#8f95a3'] };

/** React to this frame's events: dust, sparkles, splashes, squashes, somersaults, comic words. */
export function fx(view, events, w) {
    const p = w.s.p, cx = p.x + P.W / 2, feet = p.g > 0 ? p.y + P.H : p.y;
    for (const e of events) {
        if (e.type === 'land' && e.v > 6) { puff(view, cx, feet, 6, '#ffffffcc', 2, 0.35, 0.1); view.landSquash = Math.min(0.35, e.v / 50); if (e.v > 9) view.hv.landT = 0.1; }
        if (e.type === 'swim') view.hv.stroke = 0.45;
        if ((e.type === 'bounce' && e.v >= 19) || e.type === 'spring') { view.hv.spin = 0.001; view.hv.spinDir = view.face; }
        const said = WORDS[e.type];
        if (said && (e.type !== 'bounce' || e.v >= 16) && view.t - view.hv.wordAt > 0.45) {
            view.hv.wordAt = view.t;
            const at = e.type === 'death' && view.hv.last ? view.hv.last : p;
            const text = e.type === 'death' && e.why === 'fish' ? 'SNAP!' : said[0];
            view.words.push({ text, color: said[1], x: at.x + P.W / 2 + rnd(-0.4, 0.4), y: at.y - 0.6 * at.g, t: 0, tilt: rnd(-0.2, 0.2) });
        }
        if (e.type === 'death' && view.hv.last) view.ghosts.push({ ...view.hv.last, face: view.face, t: 0 });
        if (e.type === 'jump') view.landSquash = -0.18;
        if (e.type === 'bounce') { puff(view, cx, feet, 8, '#ff9ad5', 4, 0.4, 0.12); view.squash['T' + Math.floor(cx) + ',' + Math.floor(feet + 0.01)] = 1; view.landSquash = -0.3; }
        if (e.type === 'spring') view.landSquash = -0.35;
        if (e.type === 'cannon_fire') puff(view, cx, p.y + P.H / 2, 14, '#ffffffdd', 4, 0.6, 0.18);
        if (e.type === 'coin') { const c = w.L.dev.coin[e.i]; puff(view, c.x + 0.5, c.y + 0.5, 16, '#ffd84a', 5, 0.7, 0.12); }
        if (e.type === 'flag') { const f = w.L.dev.flag[e.i]; puff(view, f.x + 0.5, f.y, 10, '#3dffa2', 3, 0.6, 0.1); }
        if (e.type === 'splash' || e.type === 'leap') puff(view, cx, p.y + P.H / 2, 10, '#bfe9ffcc', 3, 0.5, 0.12, 6);
        if (e.type === 'flip') puff(view, cx, p.y + P.H / 2, 12, '#c9a6ff', 3, 0.5, 0.12);
        if (e.type === 'bump') { const b = w.L.byId[e.id]; puff(view, b.x, b.y, 12, '#ffd84a', 5, 0.45, 0.1); }
        if (e.type === 'pop') puff(view, cx, p.y + P.H / 2 - 0.15, 14, '#e6f6ffdd', 4, 0.45, 0.09);
        if (e.type === 'warp') { const a = w.L.byId[e.from], b = w.L.byId[e.to]; puff(view, a.x + 0.5, a.y + 0.5, 12, '#d9b8ff', 3, 0.5, 0.1); puff(view, b.x + 0.5, b.y + 0.5, 14, '#d9b8ff', 4, 0.5, 0.11); }
        if (e.type === 'pogo') { puff(view, cx, feet, 4, '#ffffffbb', 1.5, 0.3, 0.08); view.landSquash = Math.min(0.3, 0.12 + e.v / 120); }
        if (e.type === 'walljump') puff(view, p.x + (e.side > 0 ? P.W : 0), p.y + P.H / 2, 6, '#ffd2a1', 2, 0.35, 0.09);
        if (e.type === 'unplane') puff(view, cx, feet, 8, '#ffffffcc', 2.5, 0.4, 0.1);
        if (e.type === 'death') puff(view, cx, p.y + P.H / 2, 10, '#ff6b5b', 3, 0.5, 0.12);
        if (e.type === 'win') for (let i = 0; i < 40; i++) view.particles.push({ x: cx + rnd(-1, 1), y: p.y, vx: rnd(-4, 4), vy: rnd(-9, -3), life: 1.6, max: 1.6, color: ['#ffd84a', '#ff5a5f', '#3b9dff', '#2fd67b'][i % 4], size: 0.14, g: 9 });
    }
}

export function draw(ctx, w, view, cssW, cssH, top = 0, bottom = 0, dt = 1 / 60) {
    const { L, s } = w;
    const th = themeOf(L.level);
    view.t += dt;
    const playH = Math.max(80, cssH - top - bottom);
    // Portrait: the whole course height (16 rows) in view. Landscape: closer in, 11 rows.
    const rows = cssW > cssH ? 11 : 16;
    const T = view.tile = Math.max(18, Math.floor(Math.min(playH / Math.min(L.H, rows), cssW / 9.5)));
    const p = s.p;
    if (p.vx > 0.3) view.face = 1; else if (p.vx < -0.3) view.face = -1;
    const px = p.x + P.W / 2, py = p.y + P.H / 2;
    const viewTW = cssW / T, viewTH = playH / T;
    const clamp = (v, lo, hi, short) => (hi < lo ? short : Math.max(lo, Math.min(hi, v)));
    const lead = Math.max(-2, Math.min(2, p.vx * 0.25));
    const tx = clamp(px + lead - viewTW / 2, 0, L.W - viewTW, (L.W - viewTW) / 2);
    const ty = clamp(py - viewTH / 2, 0, L.H - viewTH, L.H - viewTH);
    const k = Math.min(1, dt * 7);
    view.camX = view.camX == null ? tx : view.camX + (tx - view.camX) * k;
    view.camY = view.camY == null ? ty : view.camY + (ty - view.camY) * k;

    // Wallpaper (slow parallax), big soft toys, then the play area.
    ctx.fillStyle = th.wall;
    ctx.fillRect(0, 0, cssW, cssH);
    drawWallpaper(ctx, th, view, cssW, cssH, T);
    ctx.save();
    ctx.translate(0, top);
    ctx.beginPath(); ctx.rect(0, 0, cssW, playH); ctx.clip();
    ctx.translate(-view.camX * T, -view.camY * T);
    const x0 = Math.max(0, Math.floor(view.camX) - 1), x1 = Math.min(L.W - 1, Math.ceil(view.camX + viewTW) + 1);
    const y0 = Math.max(0, Math.floor(view.camY) - 1), y1 = Math.min(L.H - 1, Math.ceil(view.camY + viewTH) + 1);

    drawZones(ctx, w, view, T);
    drawTiles(ctx, w, view, T, th, x0, x1, y0, y1);
    drawDevices(ctx, w, view, T, th);
    drawPortals(ctx, w, view, T);
    drawSigns(ctx, L, T, th);
    drawGhosts(ctx, view, T, dt);
    drawHero(ctx, w, view, T, dt);
    drawWater(ctx, w, view, T, x0, x1, y0, y1);
    drawParticles(ctx, view, T, dt);
    drawWords(ctx, view, T, dt);
    ctx.restore();
}

// ── Background ──────────────────────────────────────────────────────────────
function drawWallpaper(ctx, th, view, W, H, T) {
    const off = -(view.camX || 0) * T * 0.25;
    const sw = T * 1.6;
    ctx.fillStyle = th.stripe;
    for (let x = ((off % (sw * 2)) - sw * 2); x < W; x += sw * 2) ctx.fillRect(x, 0, sw, H);
    if (th.night) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 40; i++) {
            const x = ((i * 137.5 + off * 0.6) % (W + 40) + W + 40) % (W + 40) - 20, y = (i * 61) % (H * 0.8);
            ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(view.t * 1.3 + i));
            ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
    }
    // Big soft toy shapes far behind: a teddy, a block tower, a rocket, a ball.
    const off2 = -(view.camX || 0) * T * 0.45;
    ctx.fillStyle = th.toy;
    for (let i = 0; i < 8; i++) {
        const bx = i * T * 14 + off2, by = H * 0.55;
        if (bx < -T * 8 || bx > W + T * 4) continue;
        const kind = i % 4;
        ctx.save(); ctx.translate(bx, by);
        if (kind === 0) {                      // teddy
            circle(ctx, 0, 0, T * 1.8); circle(ctx, 0, -T * 2.4, T * 1.2);
            circle(ctx, -T * 1, -T * 3.4, T * 0.5); circle(ctx, T * 1, -T * 3.4, T * 0.5);
        } else if (kind === 1) {               // block tower
            for (let j = 0; j < 4; j++) roundRect(ctx, -T * (1.2 - j * 0.1), -T * (j + 1) * 1.3, T * (2.4 - j * 0.2), T * 1.2, T * 0.2);
        } else if (kind === 2) {               // rocket
            roundRect(ctx, -T * 0.7, -T * 4, T * 1.4, T * 3.6, T * 0.7);
            ctx.beginPath(); ctx.moveTo(-T * 0.7, -T * 1); ctx.lineTo(-T * 1.5, 0); ctx.lineTo(-T * 0.7, -T * 0.2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(T * 0.7, -T * 1); ctx.lineTo(T * 1.5, 0); ctx.lineTo(T * 0.7, -T * 0.2); ctx.fill();
        } else {                               // a big ball
            circle(ctx, 0, -T * 1.4, T * 1.6);
        }
        ctx.restore();
    }
}

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function roundRect(ctx, x, y, w, h, r, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    stroke ? ctx.stroke() : ctx.fill();
}
const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

// ── Zones under everything: balloon zones, fans' wind, flip strips, magnet fields ──
function drawZones(ctx, w, view, T) {
    const { L } = w;
    for (const z of L.dev.lowg) {
        ctx.fillStyle = '#9fd8ff33';
        ctx.fillRect(z.x * T, z.y * T, z.w * T, z.h * T);
        // Balloons bobbing along the zone's top.
        for (let i = 0; i < Math.max(1, Math.floor(z.w / 2.5)); i++) {
            const bx = (z.x + 1 + i * 2.5) * T, by = (z.y + 1.2 + Math.sin(view.t * 1.4 + i) * 0.25) * T;
            ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(bx, by + T * 0.4); ctx.lineTo(bx + Math.sin(view.t + i) * 3, by + T * 1.2); ctx.stroke();
            ctx.fillStyle = ['#ff6fb5', '#ffc928', '#5cc8ff', '#2fd67b'][i % 4];
            ctx.beginPath(); ctx.ellipse(bx, by, T * 0.32, T * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        }
    }
    for (const f of L.dev.fan) {
        const ang = Math.atan2(f.ay, f.ax), n = 9;
        ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = Math.max(1, T * 0.05);
        for (let i = 0; i < n; i++) {
            const u = ((view.t * 0.9 + i / n) % 1);
            const along = Math.abs(f.ax) > Math.abs(f.ay);
            const x = along ? f.x + (f.ax > 0 ? u : 1 - u) * f.w : f.x + ((i * 0.37) % 1) * f.w;
            const y = along ? f.y + ((i * 0.53) % 1) * f.h : f.y + (f.ay > 0 ? u : 1 - u) * f.h;
            ctx.beginPath(); ctx.moveTo(x * T, y * T); ctx.lineTo(x * T + Math.cos(ang) * T * 0.7, y * T + Math.sin(ang) * T * 0.7); ctx.stroke();
        }
    }
    for (const fl of L.dev.flip) {
        const up = fl.dir === 'up';
        const g = ctx.createLinearGradient(0, fl.y * T, 0, (fl.y + fl.h) * T);
        g.addColorStop(0, up ? '#c9a6ffaa' : '#c9a6ff22'); g.addColorStop(1, up ? '#c9a6ff22' : '#c9a6ffaa');
        ctx.fillStyle = g;
        ctx.fillRect(fl.x * T, fl.y * T, fl.w * T, fl.h * T);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(T * 0.6)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const bob = Math.sin(view.t * 5) * T * 0.12 * (up ? -1 : 1);
        for (let i = 0; i < fl.h; i++) ctx.fillText(up ? '▲' : '▼', (fl.x + fl.w / 2) * T, (fl.y + i + 0.5) * T + bob);
    }
    for (const m of L.dev.magnet) {
        ctx.strokeStyle = '#ff5a5f44'; ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        for (let r = 1; r <= 3; r++) {
            const rr = ((view.t * 0.6 + r / 3) % 1) * m.r;
            ctx.beginPath(); ctx.arc(m.x * T, m.y * T, rr * T, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
    }
}

// ── Tiles ───────────────────────────────────────────────────────────────────
function drawTiles(ctx, w, view, T, th, x0, x1, y0, y1) {
    const { L, s } = w;
    const solid = (x, y) => SOLID_TILES.has(tileAt(L, x, y));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const c = L.grid[y][x], X = x * T, Y = y * T;
        if (c === TILE.SOLID) {
            const surface = !solid(x, y - 1);
            // Inside a wall: one calm colour, so the toy bricks on the edges stand out.
            if (!surface && solid(x - 1, y) && solid(x + 1, y) && solid(x, y + 1)) {
                ctx.fillStyle = th.inner; ctx.fillRect(X, Y, T, T);
                ctx.fillStyle = shade(th.inner, 0.9);
                ctx.fillRect(X, Y + T - 2, T, 2);
                if ((x + (y & 1)) % 2 === 0) ctx.fillRect(X, Y, 2, T);
                continue;
            }
            const col = th.blocks[((x >> 1) * 3 + y * 5 + (x & 1 && y & 1 ? 1 : 0)) % th.blocks.length];
            ctx.fillStyle = surface ? col : shade(col, 0.82);
            roundRect(ctx, X + 1, Y + 1, T - 2, T - 2, T * 0.14);
            ctx.fillStyle = shade(col, 0.68);
            ctx.fillRect(X + 2, Y + T - Math.max(3, T * 0.12), T - 4, Math.max(2, T * 0.1));
            if (surface) {
                ctx.fillStyle = shade(col, 1.12);
                for (const sx of [0.3, 0.7]) { ctx.beginPath(); ctx.ellipse(X + T * sx, Y + T * 0.04, T * 0.13, T * 0.09, 0, 0, Math.PI * 2); ctx.fill(); }
            }
        } else if (c === TILE.ICE) {
            ctx.fillStyle = '#bfefff'; roundRect(ctx, X, Y, T, T, T * 0.08);
            ctx.fillStyle = '#ffffffcc';
            ctx.beginPath(); ctx.moveTo(X + T * 0.15, Y + T * 0.75); ctx.lineTo(X + T * 0.45, Y + T * 0.2); ctx.lineTo(X + T * 0.58, Y + T * 0.2); ctx.lineTo(X + T * 0.28, Y + T * 0.75); ctx.fill();
            ctx.fillStyle = '#e8fbff'; ctx.fillRect(X, Y, T, Math.max(2, T * 0.1));
        } else if (c === TILE.BELT_L || c === TILE.BELT_R) {
            ctx.fillStyle = '#4a4f5c'; roundRect(ctx, X, Y + T * 0.05, T, T * 0.9, T * 0.3);
            ctx.fillStyle = '#ffc928';
            const dir = c === TILE.BELT_R ? 1 : -1;
            const off = ((view.t * 3.5 * dir) % 1 + 1) % 1;
            for (let i = -1; i < 2; i++) {
                const cx = X + (i + off) * T * 0.5 + T * 0.25;
                if (cx < X || cx > X + T) continue;
                ctx.beginPath(); ctx.moveTo(cx - dir * T * 0.1, Y + T * 0.12); ctx.lineTo(cx + dir * T * 0.08, Y + T * 0.2); ctx.lineTo(cx - dir * T * 0.1, Y + T * 0.28); ctx.fill();
            }
            ctx.fillStyle = '#2b2f38';
            for (const wx of [0.2, 0.5, 0.8]) circle(ctx, X + T * wx, Y + T * 0.62, T * 0.12);
        } else if (c === TILE.SPONGE) {
            const key = 'T' + x + ',' + y;
            const sq = view.squash[key] || 0;
            if (sq > 0) view.squash[key] = Math.max(0, sq - 0.06);
            const h = T * (1 - 0.35 * Math.sin(sq * Math.PI));
            ctx.fillStyle = '#ff9ad5'; roundRect(ctx, X + 1, Y + T - h, T - 2, h, T * 0.2);
            ctx.fillStyle = '#ffd0ec';
            ctx.fillRect(X + 3, Y + T - h + 2, T - 6, Math.max(2, T * 0.14));
            ctx.fillStyle = '#e46fb3';
            for (const [a, b] of [[0.25, 0.55], [0.6, 0.45], [0.45, 0.8], [0.8, 0.75]]) circle(ctx, X + T * a, Y + T - h * (1 - b), T * 0.06);
        } else if (c === TILE.CRUMBLE) {
            const st = s.crumble[y * L.W + x];
            if (st?.st === 2) continue;
            const shake = st?.st === 1 ? Math.sin(view.t * 60 + x) * T * 0.06 : 0;
            ctx.fillStyle = '#f0c27b'; roundRect(ctx, X + 1 + shake, Y + 1, T - 2, T - 2, T * 0.1);
            ctx.strokeStyle = '#b07a35'; ctx.lineWidth = Math.max(1, T * 0.06); roundRect(ctx, X + 3 + shake, Y + 3, T - 6, T - 6, T * 0.08, true);
            ctx.fillStyle = ['#ff5a5f', '#3b9dff', '#2fd67b'][x % 3];
            ctx.font = `900 ${Math.round(T * 0.6)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('ABC'[x % 3], X + T / 2 + shake, Y + T * 0.55);
        } else if (c === TILE.ONEWAY) {
            ctx.fillStyle = '#b97a3f'; ctx.fillRect(X, Y, T, T * 0.28);
            ctx.fillStyle = '#d9a062'; ctx.fillRect(X, Y, T, T * 0.08);
            if (tileAt(L, x - 1, y) !== TILE.ONEWAY || tileAt(L, x + 1, y) !== TILE.ONEWAY) { ctx.fillStyle = '#8d5a2b'; ctx.fillRect(X + T * 0.4, Y + T * 0.28, T * 0.2, T * 0.25); }
        } else if (c === TILE.SPIKES || c === TILE.SPIKES_DOWN) {
            const up = c === TILE.SPIKES;
            ctx.fillStyle = '#c9ced8'; ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = Math.max(1, T * 0.05);
            for (const sx of [0.18, 0.5, 0.82]) {
                ctx.beginPath();
                if (up) { ctx.moveTo(X + T * (sx - 0.16), Y + T); ctx.lineTo(X + T * sx, Y + T * 0.42); ctx.lineTo(X + T * (sx + 0.16), Y + T); }
                else { ctx.moveTo(X + T * (sx - 0.16), Y); ctx.lineTo(X + T * sx, Y + T * 0.58); ctx.lineTo(X + T * (sx + 0.16), Y); }
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        } else if (c === TILE.LADDER) {
            ctx.strokeStyle = '#b97a3f'; ctx.lineWidth = Math.max(2, T * 0.08);
            ctx.beginPath(); ctx.moveTo(X + T * 0.2, Y); ctx.lineTo(X + T * 0.2, Y + T); ctx.moveTo(X + T * 0.8, Y); ctx.lineTo(X + T * 0.8, Y + T);
            for (const ry of [0.25, 0.75]) { ctx.moveTo(X + T * 0.2, Y + T * ry); ctx.lineTo(X + T * 0.8, Y + T * ry); }
            ctx.stroke();
        } else if (c === TILE.FISH) {
            // The snappy-fish pond: dark water with fins circling.
            const top = tileAt(L, x, y - 1) !== TILE.FISH;
            ctx.fillStyle = '#2f7fb8'; ctx.fillRect(X, Y + (top ? T * 0.12 : 0), T, T - (top ? T * 0.12 : 0));
            if (top) { ctx.fillStyle = '#7fd0ff'; ctx.fillRect(X, Y + T * 0.08 + Math.sin(view.t * 3 + x) * T * 0.03, T, T * 0.08); }
            const fx = (((view.t * 1.3 + x * 0.37 + y * 0.61) % 3) + 3) % 3;
            if (fx < 1) {
                ctx.fillStyle = '#ffffffcc';
                const px = X + fx * T, py = Y + T * (top ? 0.3 : 0.5);
                ctx.beginPath(); ctx.moveTo(px - T * 0.15, py + T * 0.12); ctx.lineTo(px + T * 0.02, py - T * 0.14); ctx.lineTo(px + T * 0.15, py + T * 0.12); ctx.fill();
            }
        } else if (c === TILE.VELCRO) {
            // Velcro: a fuzzy orange strip with little hooks.
            ctx.fillStyle = '#ff9f43'; roundRect(ctx, X + 1, Y, T - 2, T, T * 0.1);
            ctx.fillStyle = '#e8822a';
            for (const [a, b] of [[0.25, 0.2], [0.65, 0.35], [0.35, 0.6], [0.75, 0.75], [0.2, 0.88], [0.55, 0.05]]) circle(ctx, X + T * a, Y + T * b, T * 0.07);
            ctx.strokeStyle = '#fff1d6'; ctx.lineWidth = Math.max(1, T * 0.04);
            for (const [a, b] of [[0.45, 0.25], [0.2, 0.45], [0.6, 0.6], [0.4, 0.85]]) { ctx.beginPath(); ctx.arc(X + T * a, Y + T * b, T * 0.07, Math.PI, 0); ctx.stroke(); }
        } else if (c === TILE.TICK_RED || c === TILE.TICK_BLUE) {
            drawTick(ctx, L, s, c, X, Y, T);
        } else if (c === TILE.GOAL) {
            drawChest(ctx, X, Y, T, view.t);
        }
    }
}

/** A tick-tock block: solid with a clock face on its half of the beat, a dotted outline on the other, blinking just before it goes. */
function drawTick(ctx, L, s, c, X, Y, T) {
    const red = c === TILE.TICK_RED, col = red ? '#ff4d6d' : '#3b7dff';
    const half = L.tick / 2, ph = s.t % L.tick;
    const on = tickOn(L, c, s.t);
    const left = on ? (red ? half - ph : L.tick - ph) : 99;              // frames until it goes
    const soon = !on ? (red ? L.tick - ph : half - ph) : 99;              // frames until it comes
    if (on && !(left < 24 && Math.floor(left / 4) % 2 === 0)) {
        ctx.fillStyle = col; roundRect(ctx, X + 1, Y + 1, T - 2, T - 2, T * 0.14);
        ctx.fillStyle = shade(col, 0.7); ctx.fillRect(X + 2, Y + T - Math.max(3, T * 0.12), T - 4, Math.max(2, T * 0.1));
        ctx.fillStyle = '#ffffff'; circle(ctx, X + T / 2, Y + T * 0.46, T * 0.27);
        const a = (ph / L.tick) * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, T * 0.07); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X + T / 2, Y + T * 0.46); ctx.lineTo(X + T / 2 + Math.cos(a) * T * 0.19, Y + T * 0.46 + Math.sin(a) * T * 0.19);
        ctx.moveTo(X + T / 2, Y + T * 0.46); ctx.lineTo(X + T / 2, Y + T * 0.3); ctx.stroke(); ctx.lineCap = 'butt';
    } else {
        ctx.fillStyle = col + (soon < 24 ? '55' : '22'); roundRect(ctx, X + 2, Y + 2, T - 4, T - 4, T * 0.14);
        ctx.strokeStyle = col + 'aa'; ctx.lineWidth = Math.max(1, T * 0.05); ctx.setLineDash([T * 0.12, T * 0.1]);
        roundRect(ctx, X + 2, Y + 2, T - 4, T - 4, T * 0.14, true); ctx.setLineDash([]);
    }
}

function drawChest(ctx, X, Y, T, t) {
    const glow = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.fillStyle = `rgba(255, 216, 74, ${0.18 + 0.15 * glow})`;
    circle(ctx, X + T / 2, Y + T * 0.55, T * 0.95);
    ctx.fillStyle = '#9b5a2a'; roundRect(ctx, X + T * 0.08, Y + T * 0.42, T * 0.84, T * 0.58, T * 0.08);
    ctx.fillStyle = '#c47a3c'; roundRect(ctx, X + T * 0.06, Y + T * 0.12, T * 0.88, T * 0.32, T * 0.14);
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(X + T * 0.08, Y + T * 0.42, T * 0.84, T * 0.07);
    roundRect(ctx, X + T * 0.42, Y + T * 0.36, T * 0.16, T * 0.2, T * 0.04);
    // Sparkles
    ctx.fillStyle = '#fff6c2';
    for (let i = 0; i < 3; i++) {
        const a = t * 2 + i * 2.1;
        const sx = X + T / 2 + Math.cos(a) * T * 0.55, sy = Y + T * 0.3 + Math.sin(a * 1.3) * T * 0.25;
        star(ctx, sx, sy, T * 0.07 * (0.6 + 0.4 * Math.sin(a * 3)));
    }
}
function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
}

function drawWater(ctx, w, view, T, x0, x1, y0, y1) {
    const { L } = w;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (L.grid[y][x] !== TILE.WATER) continue;
        const X = x * T, Y = y * T;
        const surface = tileAt(L, x, y - 1) !== TILE.WATER;
        ctx.fillStyle = '#3fa9f566';
        if (surface) {
            const wave = Math.sin(view.t * 2.5 + x * 0.9) * T * 0.06;
            ctx.fillRect(X, Y + T * 0.15 + wave, T, T * 0.85 - wave);
            ctx.fillStyle = '#dff6ff99'; ctx.fillRect(X, Y + T * 0.13 + wave, T, Math.max(2, T * 0.06));
        } else ctx.fillRect(X, Y, T, T);
        if (Math.random() < 0.004) view.particles.push({ x: x + Math.random(), y: y + 1, vx: 0, vy: -1.2, life: 1.2, max: 1.2, color: '#e6f7ffaa', size: 0.07, g: 0 });
    }
}

// ── Devices ─────────────────────────────────────────────────────────────────
function drawDevices(ctx, w, view, T, th) {
    const { L, s } = w;
    for (const tr of L.dev.train) drawTrain(ctx, tr, s, view, T, th);
    for (const g of L.dev.gate) {
        // A toy-castle gate: bars down when it's shut; up (and blinking before it shuts) when it's open.
        const left = s.gates[g.id] || 0, open = left > 0;
        const X = g.x * T, Y = g.y * T, Wd = g.w * T, Hd = g.h * T;
        const lift = open ? (left < 60 && Math.floor(left / 6) % 2 === 0 ? 0.55 : 0.85) : 0;
        ctx.fillStyle = '#6b4b2a'; ctx.fillRect(X - T * 0.08, Y - T * 0.15, Wd + T * 0.16, T * 0.2);
        ctx.save(); ctx.beginPath(); ctx.rect(X, Y, Wd, Hd); ctx.clip();
        ctx.translate(0, -Hd * lift);
        ctx.fillStyle = open ? '#9aa3b588' : '#7d8597';
        for (let bx = 0.2; bx < g.w; bx += 0.33) roundRect(ctx, X + bx * T - T * 0.06, Y, T * 0.12, Hd - T * 0.1, T * 0.05);
        ctx.fillStyle = open ? '#9aa3b588' : '#5c6372';
        for (let by = 0.6; by < g.h; by += 1.1) ctx.fillRect(X, Y + by * T, Wd, T * 0.1);
        for (let bx = 0.2; bx < g.w; bx += 0.33) { ctx.beginPath(); ctx.moveTo(X + bx * T - T * 0.08, Y + Hd - T * 0.1); ctx.lineTo(X + bx * T, Y + Hd + T * 0.08); ctx.lineTo(X + bx * T + T * 0.08, Y + Hd - T * 0.1); ctx.fill(); }
        ctx.restore();
    }
    for (const b of L.dev.button) {
        // A big floor button: red and up; green and pressed while its gate is open, with a ring for the time left.
        const left = s.gates[b.gate] || 0, on = left > 0;
        const X = (b.x + 0.5) * T, Y = (b.y + 1) * T;
        ctx.fillStyle = '#5c6372'; roundRect(ctx, X - T * 0.45, Y - T * 0.16, T * 0.9, T * 0.16, T * 0.05);
        ctx.fillStyle = on ? '#2fd67b' : '#ff4d6d';
        roundRect(ctx, X - T * 0.32, Y - T * (on ? 0.24 : 0.38), T * 0.64, T * (on ? 0.1 : 0.24), T * 0.1);
        if (on) {
            ctx.strokeStyle = '#2fd67b'; ctx.lineWidth = Math.max(2, T * 0.07);
            ctx.beginPath(); ctx.arc(X, Y - T * 0.9, T * 0.22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / (b.time || TOYS.GATE_TIME))); ctx.stroke();
        }
    }
    for (const pg of L.dev.pogo) {
        // A pogo stick waiting in its stand.
        const X = (pg.x + 0.5) * T, Y = (pg.y + 1) * T, bob = Math.sin(view.t * 3 + pg.x) * T * 0.04;
        ctx.fillStyle = '#b97a3f'; roundRect(ctx, X - T * 0.35, Y - T * 0.12, T * 0.7, T * 0.12, T * 0.04);
        ctx.strokeStyle = '#5c6372'; ctx.lineWidth = Math.max(2, T * 0.08);
        ctx.beginPath(); ctx.moveTo(X, Y - T * 1.25 + bob); ctx.lineTo(X, Y - T * 0.12); ctx.stroke();
        ctx.strokeStyle = '#ff5a5f'; ctx.lineWidth = Math.max(2, T * 0.06);
        ctx.beginPath(); ctx.moveTo(X - T * 0.22, Y - T * 1.25 + bob); ctx.lineTo(X + T * 0.22, Y - T * 1.25 + bob); ctx.moveTo(X - T * 0.2, Y - T * 0.6); ctx.lineTo(X + T * 0.2, Y - T * 0.6); ctx.stroke();
        ctx.strokeStyle = '#ffc928'; ctx.lineWidth = Math.max(1.5, T * 0.05);
        ctx.beginPath(); for (let k = 0; k <= 6; k++) ctx.lineTo(X + (k % 2 ? 0.1 : -0.1) * T, Y - T * (0.55 - (0.4 * k) / 6)); ctx.stroke();
    }
    for (const rk of L.dev.rack) {
        // The rack: where pogo sticks go back.
        const X = (rk.x + 0.5) * T, Y = (rk.y + 1) * T;
        ctx.fillStyle = '#b97a3f'; ctx.fillRect(X - T * 0.06, Y - T * 1.2, T * 0.12, T * 1.2);
        roundRect(ctx, X - T * 0.45, Y - T * 1.3, T * 0.9, T * 0.18, T * 0.05);
        ctx.fillStyle = '#ffffffdd'; roundRect(ctx, X - T * 0.42, Y - T * 1.0, T * 0.84, T * 0.32, T * 0.08);
        ctx.fillStyle = '#3a3f4d'; ctx.font = `900 ${Math.round(T * 0.2)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('POGO', X, Y - T * 0.84);
    }
    for (const pl of L.dev.plane) {
        // A paper plane on its peg (gone while it's flying, back a moment after).
        const X = pl.x * T, Y = pl.y * T;
        ctx.fillStyle = '#b97a3f'; ctx.fillRect(X - T * 0.05, Y + T * 0.15, T * 0.1, T * 0.85);
        if (s.planes[pl.id]) continue;
        ctx.save(); ctx.translate(X, Y + Math.sin(view.t * 2.5 + pl.x) * T * 0.05); ctx.scale(pl.dir, 1);
        drawPlane(ctx, 0, 0, T);
        ctx.restore();
    }
    for (const b of L.dev.bumper) {
        // A pinball bumper: red ring, yellow skirt, white cap with a star; it flashes and swells when it hits.
        const age = b.id in s.fired ? s.t - s.fired[b.id] : 99, hit = age < 12 ? 1 - age / 12 : 0;
        const X = b.x * T, Y = b.y * T, R = b.r * T * (1 + hit * 0.18);
        if (hit) { ctx.fillStyle = `rgba(255,255,255,${0.5 * hit})`; circle(ctx, X, Y, R * 1.45); }
        ctx.fillStyle = '#c2304f'; circle(ctx, X, Y + R * 0.12, R);
        ctx.fillStyle = hit ? '#ff9ab0' : '#ff4d6d'; circle(ctx, X, Y, R);
        ctx.fillStyle = '#ffd84a'; circle(ctx, X, Y, R * 0.72);
        ctx.fillStyle = '#ffffff'; circle(ctx, X, Y - R * 0.04, R * 0.52);
        ctx.fillStyle = hit ? '#ffc928' : '#ff4d6d'; star(ctx, X, Y - R * 0.04, R * 0.3);
    }
    for (const bb of L.dev.bubble) {
        // A bubble wand, and the bubble it's blown (or is blowing).
        const X = bb.x * T, Y = bb.y * T;
        ctx.strokeStyle = '#ff6fb5'; ctx.lineWidth = Math.max(2, T * 0.08);
        ctx.beginPath(); ctx.arc(X, Y + T * 0.95, T * 0.28, 0, Math.PI * 2); ctx.moveTo(X, Y + T * 1.23); ctx.lineTo(X, Y + T * 1.9); ctx.stroke();
        const left = s.blown[bb.id] || 0;
        const grow = left ? 1 - left / TOYS.BUBBLE_BACK : 1;
        if (grow > 0.05 && !(s.p.bubble === bb.id && left)) {
            const r = T * (0.25 + 0.4 * grow), wob = Math.sin(view.t * 3 + bb.x) * T * 0.04;
            const cy = left ? Y + T * 0.95 - (r - T * 0.25) : Y + wob;
            drawBubble(ctx, X, cy, r, view.t);
        }
    }
    for (const dk of L.dev.duck) drawDuck(ctx, w, dk, view, T);
    for (const h of L.dev.hook) {
        // A hook for the sticky hand: a knob on a plate (pull hooks are green, with an arrow).
        const X = h.x * T, Y = h.y * T, on = s.p.rope === h.id;
        ctx.fillStyle = '#5c6372'; roundRect(ctx, X - T * 0.3, Y - T * 0.55, T * 0.6, T * 0.24, T * 0.07);
        ctx.fillRect(X - T * 0.05, Y - T * 0.35, T * 0.1, T * 0.12);
        ctx.fillStyle = h.pull ? '#2fd67b' : '#ff9f43'; circle(ctx, X, Y, T * (on ? 0.32 : 0.28));
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, T * 0.07);
        ctx.beginPath(); ctx.arc(X, Y, T * 0.14, 0, Math.PI * 2); ctx.stroke();
        if (h.pull) { ctx.fillStyle = '#2fd67b'; ctx.beginPath(); ctx.moveTo(X, Y + T * 0.35); ctx.lineTo(X - T * 0.14, Y + T * 0.55); ctx.lineTo(X + T * 0.14, Y + T * 0.55); ctx.fill(); }
        if (!on) {
            // A faint ring when you're close enough to catch it.
            const p = s.p, dx = h.x - (p.x + P.W / 2), dy = h.y - (p.y + P.H / 2);
            if (dx * dx + dy * dy < TOYS.HAND_RANGE * TOYS.HAND_RANGE && dy * p.g <= 0.5) { ctx.strokeStyle = '#ff9f4366'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(X, Y, T * 0.45, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        }
    }
    for (const b of L.dev.warp) drawWarp(ctx, b, L, s, view, T);
    const hk = s.p.rope && L.byId[s.p.rope]?.type === 'hook' ? L.byId[s.p.rope] : null;
    if (hk) {
        // The sticky hand's stretchy arm, from your gloves to the hook, with the hand stuck on it.
        const p = s.p, mx = p.x + P.W / 2, my = p.y + P.H / 2, d = Math.hypot(mx - hk.x, my - hk.y) || 1, k = Math.max(0, d - 0.95) / d;
        const ax = hk.x + (mx - hk.x) * k, ay = hk.y + (my - hk.y) * k;
        ctx.strokeStyle = '#ff4d8d'; ctx.lineWidth = Math.max(2, T * 0.09); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ax * T, ay * T); ctx.quadraticCurveTo(((ax + hk.x) / 2) * T, ((ay + hk.y) / 2 + 0.25) * T, hk.x * T, hk.y * T); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = '#ff4d8d'; circle(ctx, hk.x * T, hk.y * T, T * 0.22);
        for (const a of [-0.9, -0.3, 0.3, 0.9]) circle(ctx, hk.x * T + Math.sin(a) * T * 0.24, hk.y * T - Math.cos(a) * T * 0.24, T * 0.08);
    }
    for (const m of L.dev.mover) {
        if (m.path || m.type === 'duck') continue;
        const mp = moverPos(m, s.t), X = mp.x * T, Y = mp.y * T;
        const vertical = Math.abs(m.to[1] - m.y) > Math.abs(m.to[0] - m.x);
        if (vertical) {
            ctx.strokeStyle = '#8d5a2b'; ctx.lineWidth = Math.max(1, T * 0.05);
            const topY = Math.min(m.y, m.to[1]) * T - T * 2;
            ctx.beginPath(); ctx.moveTo(X + T * 0.3, Y); ctx.lineTo(X + T * 0.3, topY); ctx.moveTo(X + m.w * T - T * 0.3, Y); ctx.lineTo(X + m.w * T - T * 0.3, topY); ctx.stroke();
            ctx.fillStyle = '#d9a062'; roundRect(ctx, X, Y, m.w * T, T * 0.4, T * 0.1);
            ctx.fillStyle = '#b97a3f'; ctx.fillRect(X + 2, Y + T * 0.28, m.w * T - 4, T * 0.1);
        } else {
            // A toy car: body, windows, wheels that turn as it goes.
            ctx.fillStyle = th.blocks[0]; roundRect(ctx, X, Y, m.w * T, T * 0.55, T * 0.2);
            ctx.fillStyle = shade(th.blocks[0], 0.8); roundRect(ctx, X + T * 0.4, Y - T * 0.02, m.w * T - T * 0.8, T * 0.12, T * 0.05);
            ctx.fillStyle = '#cdeeff';
            for (let i = 0; i < m.w - 1; i++) roundRect(ctx, X + T * (0.55 + i), Y + T * 0.12, T * 0.55, T * 0.22, T * 0.06);
            const roll = moverPos(m, s.t).x * 2.5;
            for (const wx of [0.45, m.w - 0.45]) {
                ctx.fillStyle = '#2b2f38'; circle(ctx, X + wx * T, Y + T * 0.6, T * 0.22);
                ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = Math.max(1, T * 0.04);
                ctx.beginPath(); ctx.moveTo(X + wx * T, Y + T * 0.6); ctx.lineTo(X + wx * T + Math.cos(roll) * T * 0.18, Y + T * 0.6 + Math.sin(roll) * T * 0.18); ctx.stroke();
            }
        }
    }
    for (const sw of L.dev.seesaw) {
        const st = s.seesaw[sw.id];
        // The eraser pivot, then the ruler on top of it.
        ctx.fillStyle = '#ff8fb1';
        ctx.beginPath(); ctx.moveTo(sw.x * T, sw.y * T + 2); ctx.lineTo((sw.x - 0.6) * T, (sw.y + 1.2) * T); ctx.lineTo((sw.x + 0.6) * T, (sw.y + 1.2) * T); ctx.fill();
        ctx.save();
        ctx.translate(sw.x * T, sw.y * T);
        ctx.rotate(Math.atan(st.m));
        const len = sw.half * T * Math.sqrt(1 + st.m * st.m);
        ctx.fillStyle = '#ffd84a'; roundRect(ctx, -len, -T * 0.05, len * 2, T * 0.3, T * 0.06);
        ctx.strokeStyle = '#9a7a10'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = -sw.half * 2; i <= sw.half * 2; i++) { const xx = (i / (sw.half * 2)) * len; ctx.moveTo(xx, -T * 0.05); ctx.lineTo(xx, i % 2 ? T * 0.05 : T * 0.12); }
        ctx.stroke();
        if (sw.tilt) { ctx.fillStyle = '#6b6f7d'; roundRect(ctx, (sw.tilt < 0 ? -len : len - T * 0.7), -T * 0.6, T * 0.7, T * 0.55, T * 0.1); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(T * 0.3)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('1kg', sw.tilt < 0 ? -len + T * 0.35 : len - T * 0.35, -T * 0.25); }
        ctx.restore();
    }
    for (const sp of L.dev.spring) {
        const X = sp.x * T, Y = sp.y * T;
        const age = sp.id in s.fired ? s.t - s.fired[sp.id] : 999;
        const pop = age < 40 ? Math.sin(Math.min(1, age / 8) * Math.PI / 2) * (1 - Math.max(0, age - 20) / 20) : 0;
        if (pop > 0.02) {
            // The jack springs out: coils, then a grinning head.
            const up = T * 1.6 * pop;
            ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = Math.max(2, T * 0.07);
            ctx.beginPath();
            for (let i = 0; i <= 8; i++) ctx.lineTo(X + T * (i % 2 ? 0.3 : 0.7), Y - (up * i) / 8);
            ctx.stroke();
            ctx.fillStyle = '#ffe0bd'; circle(ctx, X + T / 2, Y - up - T * 0.2, T * 0.32);
            ctx.fillStyle = '#ff5a5f'; circle(ctx, X + T / 2, Y - up - T * 0.12, T * 0.07);
        }
        ctx.fillStyle = '#ff5a5f'; roundRect(ctx, X + 1, Y + 1, T - 2, T - 2, T * 0.12);
        ctx.fillStyle = '#ffc928';
        ctx.font = `900 ${Math.round(T * 0.55)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sp.dx > 0 ? '➚' : sp.dx < 0 ? '➘' : '?', X + T / 2, Y + T * 0.55);
        ctx.fillStyle = '#ffffff66'; ctx.fillRect(X + 2, Y + 2, T - 4, Math.max(2, T * 0.08));
    }
    for (const c of L.dev.cannon) {
        // A toy cannon: a fat barrel on a wooden carriage, pointing where it'll fire you.
        const X = (c.x + 0.5) * T, Y = (c.y + 0.55) * T;
        const a = cannonAim(c, s.t), ang = Math.atan2(a.y, a.x);
        const loaded = s.p.cannon === c.id;
        if (loaded) { ctx.strokeStyle = '#ffc928'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + a.x * T * 3.5, Y + a.y * T * 3.5); ctx.stroke(); ctx.setLineDash([]); }
        ctx.save(); ctx.translate(X, Y); ctx.rotate(ang);
        ctx.fillStyle = loaded ? '#2f3542' : '#3d4452';
        roundRect(ctx, -T * 0.45, -T * 0.4, T * 1.45, T * 0.8, T * 0.32);
        ctx.fillStyle = '#ffc928'; ctx.fillRect(T * 0.72, -T * 0.43, T * 0.16, T * 0.86);
        ctx.fillStyle = '#ffffff33'; ctx.fillRect(-T * 0.3, -T * 0.3, T * 0.95, T * 0.12);
        ctx.restore();
        ctx.fillStyle = '#b97a3f'; roundRect(ctx, X - T * 0.55, Y + T * 0.1, T * 1.1, T * 0.35, T * 0.1);
        for (const wx of [-0.32, 0.32]) { ctx.fillStyle = '#8d5a2b'; circle(ctx, X + wx * T, Y + T * 0.42, T * 0.18); ctx.fillStyle = '#d9a062'; circle(ctx, X + wx * T, Y + T * 0.42, T * 0.07); }
        if (loaded && s.p.cf >= 12 && Math.floor(view.t * 4) % 2) { ctx.fillStyle = '#ffc928'; ctx.font = `900 ${Math.round(T * 0.42)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('JUMP!', X, Y - T * 0.9); }
    }
    for (const f of L.dev.fan) {
        // A desk fan at the zone's source edge, facing along the push.
        const up = Math.abs(f.ay) > Math.abs(f.ax);
        const X = up ? (f.x + f.w / 2) * T : (f.ax > 0 ? f.x : f.x + f.w) * T, Y = up ? (f.ay < 0 ? f.y + f.h : f.y) * T : (f.y + f.h / 2) * T;
        ctx.save(); ctx.translate(X, Y);
        ctx.rotate(up ? (f.ay < 0 ? 0 : Math.PI) : (f.ax > 0 ? Math.PI / 2 : -Math.PI / 2));
        ctx.fillStyle = '#9aa3b5'; roundRect(ctx, -T * 0.7, -T * 0.25, T * 1.4, T * 0.25, T * 0.08);
        ctx.strokeStyle = '#5c6372'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, -T * 0.4, T * 0.7, T * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#5cc8ff';
        for (let i = 0; i < 3; i++) { const a = view.t * 25 + (i * Math.PI * 2) / 3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * T * 0.35, -T * 0.4, T * 0.28 * Math.abs(Math.cos(a)) + 2, T * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
    }
    for (const m of L.dev.magnet) {
        const X = m.x * T, Y = m.y * T;
        ctx.save(); ctx.translate(X, Y);
        ctx.lineWidth = T * 0.28; ctx.strokeStyle = '#ff4d6d';
        ctx.beginPath(); ctx.arc(0, -T * 0.1, T * 0.42, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#e6e9ef';
        ctx.fillRect(-T * 0.56, -T * 0.12, T * 0.28, T * 0.3); ctx.fillRect(T * 0.28, -T * 0.12, T * 0.28, T * 0.3);
        ctx.restore();
    }
    for (const R of L.dev.rope) {
        const p = s.p;
        const on = p.rope === R.id;
        let hx = R.x + Math.sin(view.t * 1.2 + R.x) * 0.15, hy = R.y + R.len;
        if (on) {
            // To the gloves: just short of the hero's middle, toward the yo-yo.
            const mx = p.x + P.W / 2, my = p.y + P.H / 2, d = Math.hypot(mx - R.x, my - R.y) || 1, k = Math.max(0, d - 0.95) / d;
            hx = R.x + (mx - R.x) * k; hy = R.y + (my - R.y) * k;
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, T * 0.05);
        ctx.beginPath(); ctx.moveTo(R.x * T, R.y * T); ctx.lineTo(hx * T, hy * T); ctx.stroke();
        ctx.strokeStyle = '#b0b8c8'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(R.x * T, R.y * T); ctx.lineTo(hx * T, hy * T); ctx.stroke();
        // The yo-yo itself at the anchor, and a ring to grab.
        ctx.fillStyle = '#ff5a5f'; circle(ctx, R.x * T, R.y * T, T * 0.36);
        ctx.fillStyle = '#ffc928'; circle(ctx, R.x * T, R.y * T, T * 0.14);
        if (!on) { ctx.strokeStyle = '#ffc928'; ctx.lineWidth = Math.max(2, T * 0.08); ctx.beginPath(); ctx.arc(hx * T, hy * T, T * 0.2, 0, Math.PI * 2); ctx.stroke(); }
    }
    L.dev.coin.forEach((c, i) => {
        if (s.coins & (1 << i)) return;
        const X = (c.x + 0.5) * T, Y = (c.y + 0.5 + Math.sin(view.t * 3 + i) * 0.08) * T;
        const sx = Math.abs(Math.cos(view.t * 3 + i)) * 0.85 + 0.15;
        ctx.save(); ctx.translate(X, Y); ctx.scale(sx, 1);
        ctx.fillStyle = '#e0a800'; circle(ctx, 0, 0, T * 0.32);
        ctx.fillStyle = '#ffd84a'; circle(ctx, 0, 0, T * 0.26);
        ctx.fillStyle = '#fff3b0'; star(ctx, 0, 0, T * 0.14);
        ctx.restore();
    });
    L.dev.flag.forEach((f, i) => {
        const X = (f.x + 0.5) * T, Y = (f.y + 1) * T, on = s.check === i;
        ctx.strokeStyle = '#6b6f7d'; ctx.lineWidth = Math.max(2, T * 0.07);
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y - T * 1.1); ctx.stroke();
        ctx.fillStyle = on ? '#2fd67b' : '#c9ced8';
        const wave = on ? Math.sin(view.t * 6) * T * 0.06 : 0;
        ctx.beginPath(); ctx.moveTo(X, Y - T * 1.1); ctx.lineTo(X + T * 0.55, Y - T * 0.95 + wave); ctx.lineTo(X, Y - T * 0.75); ctx.fill();
    });
}

/** A rubber duck boat: a yellow body w tiles long, a head at the front, rocking on the waves. */
function drawDuck(ctx, w, dk, view, T) {
    const q = ridePos(w, dk, w.s.t), X = q.x * T, Y = q.y * T, Wd = dk.w * T;
    const back = moverPos(dk, w.s.t - 2), dir = q.x >= back.x ? 1 : -1;
    const tilt = Math.sin(view.t * 2.2 + dk.x) * 0.05;
    ctx.save(); ctx.translate(X + Wd / 2, Y); ctx.rotate(tilt);
    ctx.fillStyle = dk.sink ? '#ffd15c' : '#ffd84a';
    ctx.beginPath(); ctx.ellipse(0, T * 0.32, Wd / 2, T * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe98f'; ctx.fillRect(-Wd / 2 + T * 0.1, -T * 0.02, Wd - T * 0.2, T * 0.08);
    ctx.fillStyle = '#ffd84a'; circle(ctx, dir * (Wd / 2 - T * 0.15), -T * 0.25, T * 0.36);
    ctx.fillStyle = '#ff8c42';
    ctx.beginPath(); ctx.moveTo(dir * (Wd / 2 + T * 0.1), -T * 0.3); ctx.lineTo(dir * (Wd / 2 + T * 0.42), -T * 0.18); ctx.lineTo(dir * (Wd / 2 + T * 0.1), -T * 0.08); ctx.fill();
    ctx.fillStyle = '#2b2f38'; circle(ctx, dir * (Wd / 2 - T * 0.05), -T * 0.36, T * 0.06);
    ctx.fillStyle = '#e8b826';
    ctx.beginPath(); ctx.ellipse(-dir * Wd * 0.15, T * 0.25, Wd * 0.22, T * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    if (dk.sink) { ctx.fillStyle = '#ff5a5f'; ctx.font = `900 ${Math.round(T * 0.3)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', -dir * Wd * 0.15, T * 0.26); }
    ctx.restore();
}

/** A warp toy box: a box with a swirl, its twin in the same colour (and upside down on the ceiling). */
function drawWarp(ctx, b, L, s, view, T) {
    const pair = [b.id, b.to].sort().join('|');
    let hsh = 0; for (const ch of pair) hsh = (hsh * 31 + ch.charCodeAt(0)) % 997;
    const col = ['#a970ff', '#ff6fb5', '#2fd67b', '#3b9dff', '#ff8c42'][hsh % 5];
    const X = b.x * T, Y = b.y * T;
    ctx.save(); ctx.translate(X + T / 2, Y + T / 2); if ((b.g || 1) < 0) ctx.scale(1, -1);
    ctx.fillStyle = col; roundRect(ctx, -T * 0.48, -T * 0.4, T * 0.96, T * 0.88, T * 0.12);
    ctx.fillStyle = shade(col, 0.75); roundRect(ctx, -T * 0.52, -T * 0.5, T * 1.04, T * 0.2, T * 0.06);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, T * 0.06);
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) { const a = k * 0.55 + view.t * 4, r = T * 0.03 + k * T * 0.012; ctx.lineTo(Math.cos(a) * r, T * 0.06 + Math.sin(a) * r); }
    ctx.stroke();
    ctx.restore();
}

/** A paper plane, nose to the right (flip with scale), its top at y. */
function drawPlane(ctx, x, y, T) {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = Math.max(1, T * 0.03);
    ctx.beginPath(); ctx.moveTo(x + T * 1.0, y + T * 0.05); ctx.lineTo(x - T * 0.9, y - T * 0.05); ctx.lineTo(x - T * 0.55, y + T * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e3e8f2';
    ctx.beginPath(); ctx.moveTo(x + T * 1.0, y + T * 0.05); ctx.lineTo(x - T * 0.55, y + T * 0.22); ctx.lineTo(x - T * 0.75, y + T * 0.38); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3b9dff'; ctx.lineWidth = Math.max(1, T * 0.04);
    ctx.beginPath(); ctx.moveTo(x - T * 0.4, y + T * 0.02); ctx.lineTo(x + T * 0.5, y + T * 0.05); ctx.stroke();
}

function drawBubble(ctx, X, Y, r, t) {
    const g = ctx.createRadialGradient(X - r * 0.3, Y - r * 0.3, r * 0.1, X, Y, r);
    g.addColorStop(0, '#ffffff22'); g.addColorStop(0.75, '#bfe9ff33'); g.addColorStop(1, '#d9b8ffaa');
    ctx.fillStyle = g; circle(ctx, X, Y, r);
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffffffee'; ctx.lineWidth = Math.max(2, r * 0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(X, Y, r * 0.72, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke(); ctx.lineCap = 'butt';
}

/** A toy train: wooden rails along its loop, and the engine (its flat roof is what you ride). */
function drawTrain(ctx, tr, s, view, T, th) {
    const pts = tr.path.map(q => [(q[0] + tr.w / 2) * T, (q[1] + 0.85) * T]);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#c98f5088'; ctx.lineWidth = T * 0.34; ctx.setLineDash([T * 0.12, T * 0.22]);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#8d5a2b99'; ctx.lineWidth = Math.max(2, T * 0.08);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    const a = moverPos(tr, s.t), b = moverPos(tr, s.t + 2);
    if (Math.abs(b.x - a.x) > 1e-4) tr._dir = Math.sign(b.x - a.x);
    const dir = tr._dir || 1, X = a.x * T, Y = a.y * T, Wd = tr.w * T;
    const body = th.blocks[2 % th.blocks.length];
    ctx.fillStyle = body; roundRect(ctx, X, Y + T * 0.12, Wd, T * 0.62, T * 0.14);
    ctx.fillStyle = '#2b2f38'; roundRect(ctx, X - T * 0.06, Y, Wd + T * 0.12, T * 0.2, T * 0.06);
    // The cab at the back, the boiler and headlamp at the front.
    const back = dir > 0 ? X : X + Wd - T * 0.9;
    ctx.fillStyle = '#cdeeff'; roundRect(ctx, back + T * 0.18, Y + T * 0.26, T * 0.55, T * 0.24, T * 0.06);
    ctx.fillStyle = shade(body, 0.8);
    for (let i = 1; i < tr.w - 1; i++) ctx.fillRect(X + i * T + (dir > 0 ? T * 0.3 : -T * 0.3) + T * 0.35, Y + T * 0.2, T * 0.08, T * 0.5);
    const front = dir > 0 ? X + Wd : X;
    ctx.fillStyle = '#ffd84a'; circle(ctx, front - dir * T * 0.12, Y + T * 0.42, T * 0.12);
    ctx.fillStyle = '#ff5a5f';
    ctx.beginPath(); ctx.moveTo(front, Y + T * 0.55); ctx.lineTo(front + dir * T * 0.28, Y + T * 0.78); ctx.lineTo(front, Y + T * 0.78); ctx.fill();
    const roll = (a.x + a.y) * 2.5;
    for (let i = 0; i < tr.w; i++) {
        const wx = X + (i + 0.5) * T;
        ctx.fillStyle = '#2b2f38'; circle(ctx, wx, Y + T * 0.78, T * 0.2);
        ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = Math.max(1, T * 0.05);
        ctx.beginPath(); ctx.moveTo(wx, Y + T * 0.78); ctx.lineTo(wx + Math.cos(roll) * T * 0.16, Y + T * 0.78 + Math.sin(roll) * T * 0.16); ctx.stroke();
    }
}

// ── Hub doors ───────────────────────────────────────────────────────────────
function drawPortals(ctx, w, view, T) {
    const { L } = w;
    for (const pt of L.dev.portal) {
        const st = view.portalState ? view.portalState(pt) : 'open';
        const X = pt.x * T, Y = pt.y * T;
        const locked = st === 'locked' || st === 'soon';
        // An arched toy-box door.
        ctx.fillStyle = locked ? '#8f95a3' : st === 'star' ? '#ffc928' : st === 'done' ? '#2fd67b' : '#3b9dff';
        ctx.beginPath();
        ctx.moveTo(X - T * 0.2, Y + T); ctx.lineTo(X - T * 0.2, Y - T * 0.6); ctx.arc(X + T * 0.5, Y - T * 0.6, T * 0.7, Math.PI, 0); ctx.lineTo(X + T * 1.2, Y + T); ctx.closePath(); ctx.fill();
        ctx.fillStyle = locked ? '#5c6170' : '#1b2a44';
        ctx.beginPath();
        ctx.moveTo(X, Y + T); ctx.lineTo(X, Y - T * 0.5); ctx.arc(X + T * 0.5, Y - T * 0.5, T * 0.5, Math.PI, 0); ctx.lineTo(X + T, Y + T); ctx.closePath(); ctx.fill();
        const info = view.portalInfo ? view.portalInfo(pt) : null;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(T * 0.62)}px system-ui, sans-serif`;
        ctx.fillText(locked ? '🔒' : info?.icon || '▶', X + T * 0.5, Y - T * 0.15);
        if (info?.label) {
            ctx.font = `800 ${Math.round(T * 0.26)}px system-ui, sans-serif`;
            ctx.fillStyle = '#3a2a14';
            ctx.fillText(info.label, X + T * 0.5, Y - T * 1.55);
        }
        if (info?.stars != null) {
            ctx.font = `${Math.round(T * 0.3)}px system-ui, sans-serif`;
            ctx.fillStyle = '#ffd84a';
            ctx.fillText('★'.repeat(info.stars) + '☆'.repeat(3 - info.stars), X + T * 0.5, Y + T * 0.55);
        }
    }
}

function drawSigns(ctx, L, T, th) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const sg of L.dev.sign) {
        const big = !!sg.big;
        ctx.font = `800 ${Math.round(T * (big ? 0.62 : 0.3))}px system-ui, sans-serif`;
        const wpx = ctx.measureText(sg.text).width + T * 0.5;
        const X = sg.x * T, Y = sg.y * T;
        ctx.fillStyle = big ? '#ffffffdd' : th.night ? '#ffffffcc' : '#ffffffd9';
        roundRect(ctx, X - wpx / 2, Y - T * (big ? 0.45 : 0.28), wpx, T * (big ? 0.9 : 0.56), T * 0.15);
        ctx.fillStyle = big ? '#ff5a5f' : '#3a3f4d';
        ctx.fillText(sg.text, X, Y + 1);
    }
}

// ── The hero ────────────────────────────────────────────────────────────────
// Your character, posed from the sprite sheet (HeroSprites.js): a run cycle
// paced by the ground covered, a crouch on hard landings, stretched on the way
// up, arms out at the top, flailing on the way down, a tuck-and-somersault off
// big bounces and jack-in-the-boxes, superhero out of cannons, both gloves on
// a yo-yo string, climbing with its back to you, doggy-paddling, skidding on
// ice, a wave when you stand still, and a cheer at the toy chest. Without a
// sheet (no WebGL) it falls back to the portrait, then the emoji.
const HERO_H = 1.35;     // the figure's height on screen, tiles (its box is P.H)
const TAU = Math.PI * 2;

function heroPose(p, view, won) {
    const hv = view.hv;
    if (won) return ['cheer', view.t * 7];
    if (p.rope) return ['hang', Math.abs(p.vx) > 2.5 ? 1 : 0];
    if (p.climb) return ['climb', Math.floor(p.y * 2.5)];
    if (p.bubble) return ['apex', 0];
    if (p.plane) return ['pilot', view.input?.j ? 1 : 0];
    if (p.wet && !p.grounded) return ['swim', hv.swimT * 8];
    if (p.pogo) return ['pogo', -p.vy * p.g > 0 ? 0 : 1];
    if (p.wall && p.vy * p.g > 0) return ['cling', view.t * 5];
    if (hv.spin > 0) return ['tuck', 0];
    if (p.grounded) {
        if (hv.landT > 0) return ['crouch', 0];
        const sp = Math.abs(p.vx), inp = view.input || {};
        const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        if (sp > 1.5 && ((p.gtile === TILE.ICE && dir === 0) || dir === -Math.sign(p.vx))) return ['skid', 0];
        if (sp > 0.5) return ['run', hv.runDist * 2.6];
        if (hv.still > 2.5 && (hv.still - 2.5) % 6 < 1.4) return ['wave', hv.still * 5];
        if (view.t % 3.7 < 0.13) return ['blink', 0];
        return ['idle', view.t * 3];
    }
    const up = -p.vy * p.g;                     // speed against gravity
    if (up > 15) return ['launch', 0];
    if (up > 4) return ['rise', 0];
    if (up > -4) return ['apex', 0];
    return ['fall', view.t * 8];
}

function drawFigure(ctx, view, T, name, i) {
    const sheet = view.sheet;
    if (sheet) {
        const D = T * HERO_H * sheet.span, f = sheet.at(name, i);
        ctx.drawImage(sheet.canvas, f.sx, f.sy, sheet.size, sheet.size, -D / 2, -D * sheet.feet, D, D);
    } else if (view.hero && view.hero.complete && view.hero.naturalWidth) {
        ctx.drawImage(view.hero, -T * 0.65, -T * 1.45, T * 1.3, T * 1.45);
    } else {
        ctx.fillStyle = '#ff5a5f'; roundRect(ctx, -T * 0.35, -T * 0.9, T * 0.7, T * 0.9, T * 0.3);
        ctx.font = `${Math.round(T * 0.7)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(view.heroEmoji || '🦀', 0, -T * 0.5);
    }
}

function drawHero(ctx, w, view, T, dt) {
    const p = w.s.p, hv = view.hv, won = w.s.won;
    // Cosmetic clocks.
    hv.landT = Math.max(0, hv.landT - dt);
    hv.stroke = Math.max(0, hv.stroke - dt);
    if (p.grounded && Math.abs(p.vx) > 0.5) {
        const before = Math.floor(hv.runDist / 0.7);
        hv.runDist += Math.abs(p.vx) * dt;
        if (Math.floor(hv.runDist / 0.7) !== before) puff(view, p.x + P.W / 2 - Math.sign(p.vx) * 0.3, p.g > 0 ? p.y + P.H : p.y, 2, '#ffffffaa', 1.2, 0.35, 0.07);
    }
    hv.still = p.grounded && Math.abs(p.vx) < 0.3 && !won ? hv.still + dt : 0;
    if (p.wet) hv.swimT += dt * (hv.stroke > 0 ? 2.4 : 0.7);
    if (hv.spin > 0) { hv.spin += dt / 0.55; if (hv.spin >= 1 || p.grounded || p.rope || p.wet || p.cannon || p.climb) hv.spin = 0; }
    hv.rot += ((p.g < 0 ? Math.PI : 0) - hv.rot) * Math.min(1, dt * 12);
    hv.last = { x: p.x, y: p.y, g: p.g };
    view.landSquash *= Math.pow(0.0006, dt);
    if (p.cannon) { hv.pose = 'cannon'; return; }          // inside the barrel

    const [name, i] = heroPose(p, view, won);
    hv.pose = name;
    const cx = (p.x + P.W / 2) * T, cy = (p.y + P.H / 2) * T;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(hv.rot);                                    // gravity flips: a half turn, not a snap
    if (p.rope) {
        // Hang along the string, gloves toward the yo-yo.
        const R = w.L.byId[p.rope];
        const dx = p.x + P.W / 2 - R.x, dy = p.y + P.H / 2 - R.y;
        ctx.rotate(Math.atan2(-dx, dy) - hv.rot);
    }
    if (hv.spin > 0) ctx.rotate(hv.spin * TAU * hv.spinDir);
    ctx.translate(0, (P.H / 2) * T);                       // the feet
    if (p.grounded) { ctx.fillStyle = '#00000022'; ctx.beginPath(); ctx.ellipse(0, 0, T * 0.4, T * 0.09, 0, 0, Math.PI * 2); ctx.fill(); }
    const sq = view.landSquash;
    const look = name === 'cling' ? p.wall : name === 'pilot' ? w.L.byId[p.plane].dir : view.face;
    const face = name === 'climb' ? 1 : look * (Math.cos(hv.rot) < 0 ? -1 : 1);
    if (p.plane) {
        // The paper plane under you, nose up as you pull up, down as you dive.
        ctx.save(); ctx.scale(face, 1); ctx.rotate(Math.atan2(p.vy * p.g, Math.abs(p.vx) + 1) * 0.8);
        drawPlane(ctx, 0, T * 0.12, T);
        ctx.restore();
    }
    if (p.pogo) {
        // The pogo stick: handles at your middle, a spring and a foot below your feet.
        const comp = Math.max(0, view.landSquash) * T * 0.6;
        ctx.strokeStyle = '#5c6372'; ctx.lineWidth = Math.max(2, T * 0.08);
        ctx.beginPath(); ctx.moveTo(0, -T * 0.55); ctx.lineTo(0, T * 0.62 - comp); ctx.stroke();
        ctx.strokeStyle = '#ff5a5f'; ctx.lineWidth = Math.max(2, T * 0.06);
        ctx.beginPath(); ctx.moveTo(-T * 0.22, -T * 0.55); ctx.lineTo(T * 0.22, -T * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-T * 0.2, T * 0.02); ctx.lineTo(T * 0.2, T * 0.02); ctx.stroke();
        ctx.strokeStyle = '#ffc928'; ctx.lineWidth = Math.max(1.5, T * 0.05);
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) ctx.lineTo((k % 2 ? 0.1 : -0.1) * T, T * (0.1 + (0.4 * k) / 6) - comp * (k / 6));
        ctx.stroke();
        ctx.fillStyle = '#2b2f38'; roundRect(ctx, -T * 0.1, T * 0.58 - comp, T * 0.2, T * 0.1, T * 0.04);
        ctx.translate(0, -T * 0.08);
    }
    ctx.scale(face * (1 + sq * 0.5), 1 - sq);
    drawFigure(ctx, view, T, name, i);
    ctx.restore();
    if (p.bubble) {
        // Inside the bubble: it wobbles more as it's about to pop.
        const late = Math.max(0, (p.bt - (TOYS.BUBBLE_LIFE - 70)) / 70);
        const wob = Math.sin(view.t * (8 + late * 20)) * T * (0.03 + late * 0.07);
        drawBubble(ctx, cx, cy - T * 0.15, T * 0.95 + wob, view.t);
    }
}

/** A puff of "OOF" where you fell (the engine has already put you back at the flag). */
function drawGhosts(ctx, view, T, dt) {
    view.ghosts = view.ghosts.filter(g => (g.t += dt) < 0.8);
    for (const g of view.ghosts) {
        const k = g.t / 0.8;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.translate((g.x + P.W / 2) * T, (g.y + P.H / 2 - k * 1.2 * g.g) * T);
        if (g.g < 0) ctx.rotate(Math.PI);
        ctx.rotate(k * 1.5);
        ctx.translate(0, (P.H / 2) * T);
        ctx.scale(g.face, 1);
        drawFigure(ctx, view, T, 'hurt', 0);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

/** Comic words: BOING! WHEEE! SPLOSH! */
function drawWords(ctx, view, T, dt) {
    view.words = view.words.filter(q => (q.t += dt) < 0.9);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const q of view.words) {
        const k = q.t / 0.9, pop = Math.min(1, q.t / 0.12);
        ctx.save();
        ctx.translate(q.x * T, (q.y - k * 0.8) * T);
        ctx.rotate(q.tilt);
        ctx.scale(0.6 + pop * 0.5, 0.6 + pop * 0.5);
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = `900 ${Math.round(T * 0.62)}px system-ui, sans-serif`;
        ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, T * 0.16); ctx.strokeStyle = q.color;
        ctx.strokeText(q.text, 0, 0);
        ctx.fillStyle = '#ffffff'; ctx.fillText(q.text, 0, 0);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function drawParticles(ctx, view, T, dt) {
    const keep = [];
    for (const q of view.particles) {
        q.life -= dt;
        if (q.life <= 0) continue;
        q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        ctx.globalAlpha = Math.max(0, q.life / q.max);
        ctx.fillStyle = q.color;
        circle(ctx, q.x * T, q.y * T, q.size * T);
        keep.push(q);
    }
    ctx.globalAlpha = 1;
    view.particles = keep.length > 400 ? keep.slice(-400) : keep;
}

