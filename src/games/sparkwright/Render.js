// ============================================================
// RENDER — draws a World onto a 2D canvas. Blueprint / instrument-panel look.
//
// Reads world state, never writes it. Cosmetic state (door slide, particles,
// camera) lives in `view`, so Math.random here can't touch the simulation.
//
//   createView()                         → view (camera, fx)
//   draw(ctx, w, view, cssW, cssH, top, bottom)   one frame; top/bottom = HUD/control insets
//   fx(view, events, w)                  spawn particles for step() events
// ============================================================
import { P, TILE } from './core/Rules.js';
import { evalCircuit, circuitSockets } from './core/World.js';

const C = {
    bg: '#0b1622', grid: 'rgba(80,150,210,0.08)', solid: '#16304a', solidHi: '#5cb8e6', solidHatch: 'rgba(92,184,230,0.10)',
    spike: '#ff8a3d', ladder: '#c9a46a', plank: '#7fa7c4', goal: '#3dffa2',
    socket: '#5cb8e6', wireOn: '#47e6ff', wireOff: 'rgba(120,150,180,0.35)', wireBad: '#ff4d4d',
    spring: '#ffb547', gear: '#b8c4d0', resistor: '#e0c38c', battery: '#7dff9a',
    door: '#3a4b5c', doorStripe: '#ffcf3d', bridge: '#47e6ff', lift: '#8fb3cc',
    hat: '#ffcf3d', suit: '#2f7fd8', skin: '#f2c49b', boots: '#1d2a36',
    text: '#d8ecff', dim: '#6f8fae',
};
export const KIND_COLOR = { spring: C.spring, gear: C.gear, resistor: C.resistor, battery: C.battery };

export function createView() {
    return { camX: null, camY: null, tile: 32, doors: {}, particles: [], squash: {}, flash: {}, t: 0 };
}

export function fx(view, events, w) {
    for (const e of events) {
        const p = w.s.p;
        const px = p.x + P.W / 2, py = p.y + P.H;
        if (e.type === 'land') burst(view, px, py, 6, '#9fc3dd', 2);
        if (e.type === 'spring') { burst(view, px, py, 12, C.spring, 4); view.squash[e.id] = 1; }
        if (e.type === 'death') burst(view, px, py - 0.5, 18, C.spike, 5);
        if (e.type === 'fuse') { const c = w.L.byId[e.id]; view.flash[e.id] = 1; const so = w.L.byId[circuitSockets(c)[0]]; if (so) burst(view, so.x + 0.5, so.y + 0.5, 24, '#fff27a', 6); }
        if (e.type === 'install') { const so = w.L.byId[e.id]; burst(view, so.x + 0.5, so.y + 0.5, 10, C.wireOn, 3); }
        if (e.type === 'win') burst(view, px, py - 0.5, 30, C.goal, 5);
    }
}

function burst(view, x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
        view.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, life: 0.4 + Math.random() * 0.4, color });
    }
}

export function draw(ctx, w, view, cssW, cssH, top = 0, bottom = 0, dt = 1 / 60) {
    const { L, s } = w;
    view.t += dt;
    const playH = cssH - top - bottom;
    const T = view.tile = Math.max(16, Math.floor(Math.min(playH / Math.min(L.H, 14), cssW / 9.5)));
    // Camera: follow the hero, clamp to the map.
    const px = s.p.x + P.W / 2, py = s.p.y + P.H / 2;
    const viewTW = cssW / T, viewTH = playH / T;
    // Narrow maps centre; short maps sit on the controls (bottom-anchored).
    const clamp = (v, lo, hi, short) => (hi < lo ? short : Math.max(lo, Math.min(hi, v)));
    const tx = clamp(px - viewTW / 2, 0, L.W - viewTW, (L.W - viewTW) / 2);
    const ty = clamp(py - viewTH / 2, 0, L.H - viewTH, L.H - viewTH);
    view.camX = view.camX == null ? tx : view.camX + (tx - view.camX) * Math.min(1, dt * 8);
    view.camY = view.camY == null ? ty : view.camY + (ty - view.camY) * Math.min(1, dt * 8);

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(0, top);
    ctx.beginPath(); ctx.rect(0, 0, cssW, playH); ctx.clip();
    ctx.translate(-view.camX * T, -view.camY * T);

    // Blueprint grid.
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= L.W; x++) { ctx.moveTo(x * T + 0.5, 0); ctx.lineTo(x * T + 0.5, L.H * T); }
    for (let y = 0; y <= L.H; y++) { ctx.moveTo(0, y * T + 0.5); ctx.lineTo(L.W * T, y * T + 0.5); }
    ctx.stroke();

    drawWires(ctx, w, view, T);
    drawTiles(ctx, L, T, view);
    drawDevices(ctx, w, view, T, dt);
    drawHero(ctx, s.p, T, view);
    drawParticles(ctx, view, T, dt);
    ctx.restore();
}

function drawTiles(ctx, L, T, view) {
    const solid = (x, y) => y >= 0 && y < L.H && x >= 0 && x < L.W && L.grid[y][x] === TILE.SOLID;
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
        const c = L.grid[y][x], X = x * T, Y = y * T;
        if (c === TILE.SOLID) {
            ctx.fillStyle = C.solid; ctx.fillRect(X, Y, T, T);
            ctx.strokeStyle = C.solidHatch; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(X, Y + T); ctx.lineTo(X + T, Y); ctx.stroke();
            ctx.fillStyle = C.solidHi;
            if (!solid(x, y - 1)) ctx.fillRect(X, Y, T, Math.max(2, T * 0.07));
            ctx.globalAlpha = 0.35;
            if (!solid(x - 1, y)) ctx.fillRect(X, Y, 1.5, T);
            if (!solid(x + 1, y)) ctx.fillRect(X + T - 1.5, Y, 1.5, T);
            if (!solid(x, y + 1)) ctx.fillRect(X, Y + T - 1.5, T, 1.5);
            ctx.globalAlpha = 1;
        } else if (c === TILE.SPIKES || c === TILE.SPIKES_DOWN) {
            const down = c === TILE.SPIKES_DOWN;
            ctx.fillStyle = C.spike;
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const a = X + T * (0.1 + i * 0.267), b = a + T * 0.267;
                if (down) { ctx.moveTo(a, Y); ctx.lineTo((a + b) / 2, Y + T * 0.5); ctx.lineTo(b, Y); }
                else { ctx.moveTo(a, Y + T); ctx.lineTo((a + b) / 2, Y + T * 0.5); ctx.lineTo(b, Y + T); }
            }
            ctx.fill();
        } else if (c === TILE.LADDER) {
            ctx.strokeStyle = C.ladder; ctx.lineWidth = Math.max(2, T * 0.07);
            ctx.beginPath();
            ctx.moveTo(X + T * 0.25, Y); ctx.lineTo(X + T * 0.25, Y + T);
            ctx.moveTo(X + T * 0.75, Y); ctx.lineTo(X + T * 0.75, Y + T);
            for (let i = 0; i < 3; i++) { ctx.moveTo(X + T * 0.25, Y + T * (0.2 + i * 0.33)); ctx.lineTo(X + T * 0.75, Y + T * (0.2 + i * 0.33)); }
            ctx.stroke();
        } else if (c === TILE.ONEWAY) {
            ctx.fillStyle = C.plank; ctx.fillRect(X, Y, T, T * 0.18);
        } else if (c === TILE.GOAL) {
            const pulse = 0.6 + 0.4 * Math.sin(view.t * 3);
            ctx.strokeStyle = C.goal; ctx.lineWidth = 2;
            ctx.globalAlpha = 0.25 * pulse; ctx.fillStyle = C.goal; ctx.fillRect(X + T * 0.15, Y + T * 0.05, T * 0.7, T * 0.95);
            ctx.globalAlpha = 1; ctx.strokeRect(X + T * 0.15, Y + T * 0.05, T * 0.7, T * 0.95);
            ctx.fillStyle = C.goal; ctx.font = `700 ${Math.round(T * 0.22)}px ui-monospace, Menlo, monospace`;
            ctx.textAlign = 'center'; ctx.fillText('EXIT', X + T / 2, Y - T * 0.08);
        }
    }
}

function drawWires(ctx, w, view, T) {
    const { L, s } = w;
    for (const c of L.dev.circuit) {
        const r = evalCircuit(w, c);
        const blown = s.fuse[c.id] > 0;
        const on = s.powered[c.id];
        ctx.strokeStyle = blown ? C.wireBad : on ? C.wireOn : C.wireOff;
        ctx.lineWidth = on ? 2.5 : 1.5;
        ctx.setLineDash(on ? [] : [4, 4]);
        const pts = circuitSockets(c).map(id => L.byId[id]).filter(Boolean).map(d => [d.x + 0.5, d.y + 0.85]);
        for (const id of c.drives) { const d = L.byId[id]; pts.push([d.x + (d.w || 1) / 2, d.type === 'door' ? d.y + d.h - 0.15 : d.y + 0.5]); }
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * T, y * T) : ctx.moveTo(x * T, y * T)));
        ctx.stroke();
        ctx.setLineDash([]);
        if (on) {   // current dots marching along the wire
            ctx.fillStyle = C.wireOn;
            const speed = Math.min(6, 1 + r.I * 4);
            for (let i = 0; i < pts.length - 1; i++) {
                const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
                const len = Math.hypot(bx - ax, by - ay);
                for (let d = (view.t * speed) % 0.8; d < len; d += 0.8) {
                    const u = d / len; ctx.fillRect((ax + (bx - ax) * u) * T - 1.5, (ay + (by - ay) * u) * T - 1.5, 3, 3);
                }
            }
        }
    }
}

function drawDevices(ctx, w, view, T, dt) {
    const { L, s } = w;
    for (const sp of L.dev.spring) {
        const sq = view.squash[sp.id] || 0;
        view.squash[sp.id] = Math.max(0, sq - dt * 4);
        const X = sp.x * T, Y = sp.y * T, filled = !!s.sockets[sp.socket];
        ctx.fillStyle = '#2a3b4c'; ctx.fillRect(X, Y + T * 0.75, T * (sp.w || 1), T * 0.25);
        ctx.strokeStyle = filled ? C.spring : C.dim; ctx.lineWidth = Math.max(2, T * 0.08);
        const top = Y + T * (0.15 + 0.35 * sq);
        ctx.beginPath();
        const n = 5;
        for (let i = 0; i <= n; i++) {
            const yy = top + ((Y + T * 0.75 - top) * i) / n, xx = X + T * (i % 2 ? 0.8 : 0.2);
            i ? ctx.lineTo(xx, yy) : ctx.moveTo(X + T * 0.5, yy);
        }
        ctx.stroke();
        ctx.fillStyle = filled ? C.spring : C.dim; ctx.fillRect(X + T * 0.05, top - T * 0.1, T * 0.9, T * 0.12);
    }
    for (const l of L.dev.lift) {
        const y = s.lifts[l.id];
        ctx.strokeStyle = 'rgba(184,196,208,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo((l.x + 0.3) * T, (l.yTop - 1.6) * T); ctx.lineTo((l.x + 0.3) * T, y * T);
        ctx.moveTo((l.x + l.w - 0.3) * T, (l.yTop - 1.6) * T); ctx.lineTo((l.x + l.w - 0.3) * T, y * T);
        ctx.stroke();
        // Gearbox at the head of the shaft.
        const g = s.sockets[l.socket] ? L.parts[s.sockets[l.socket]] : null;
        ctx.fillStyle = '#22384d'; ctx.fillRect(l.x * T, (l.yTop - 2) * T, l.w * T, T * 0.45);
        ctx.strokeStyle = g ? C.gear : C.dim; ctx.strokeRect(l.x * T + 0.5, (l.yTop - 2) * T + 0.5, l.w * T - 1, T * 0.45);
        ctx.fillStyle = g ? C.gear : C.dim; ctx.font = `700 ${Math.round(T * 0.22)}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center';
        ctx.fillText(g ? `${g.ratio}:1` : 'NO GEAR', (l.x + l.w / 2) * T, (l.yTop - 2) * T + T * 0.31);
        ctx.fillStyle = C.lift; ctx.fillRect(l.x * T, y * T, l.w * T, T * 0.28);
        ctx.fillStyle = C.doorStripe; ctx.fillRect(l.x * T, y * T, l.w * T, T * 0.06);
    }
    for (const d of L.dev.door) {
        const target = s.open[d.id] ? 1 : 0;
        const cur = view.doors[d.id] ?? target;
        view.doors[d.id] = cur + (target - cur) * Math.min(1, dt * 8);
        const h = d.h * T * (1 - view.doors[d.id]);
        const X = d.x * T + T * 0.1, Y = d.y * T;
        ctx.fillStyle = C.door; ctx.fillRect(X, Y, T * 0.8, h);
        ctx.save(); ctx.beginPath(); ctx.rect(X, Y, T * 0.8, h); ctx.clip();
        ctx.strokeStyle = C.doorStripe; ctx.lineWidth = T * 0.12;
        for (let k = -2; k < d.h * 2 + 2; k++) { ctx.beginPath(); ctx.moveTo(X - T, Y + k * T * 0.5 + T); ctx.lineTo(X + T * 1.8, Y + k * T * 0.5 - T * 0.4); ctx.stroke(); }
        ctx.restore();
        ctx.strokeStyle = '#5c7389'; ctx.lineWidth = 2; ctx.strokeRect(d.x * T + 1, Y, T - 2, d.h * T);
    }
    for (const b of L.dev.bridge) {
        const on = s.open[b.id];
        ctx.strokeStyle = C.bridge; ctx.fillStyle = C.bridge;
        if (on) {
            ctx.globalAlpha = 0.25 + 0.1 * Math.sin(view.t * 8); ctx.fillRect(b.x * T, b.y * T, b.w * T, T * 0.35);
            ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeRect(b.x * T, b.y * T, b.w * T, T * 0.35);
        } else {
            ctx.globalAlpha = 0.3; ctx.setLineDash([3, 5]); ctx.lineWidth = 1;
            ctx.strokeRect(b.x * T, b.y * T, b.w * T, T * 0.35); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
    }
    for (const so of L.dev.socket) {
        const X = so.x * T, Y = so.y * T, pid = s.sockets[so.id], part = pid ? L.parts[pid] : null;
        const col = KIND_COLOR[so.accepts];
        ctx.fillStyle = '#132638'; ctx.fillRect(X + T * 0.15, Y + T * 0.45, T * 0.7, T * 0.55);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(part ? [] : [3, 3]);
        ctx.strokeRect(X + T * 0.15, Y + T * 0.45, T * 0.7, T * 0.55); ctx.setLineDash([]);
        drawPartIcon(ctx, so.accepts, part, X + T * 0.5, Y + T * 0.72, T * 0.5, !!part);
        ctx.fillStyle = col; ctx.font = `700 ${Math.round(T * 0.2)}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center';
        ctx.fillText(part ? shortLabel(part) : so.accepts.toUpperCase(), X + T / 2, Y + T * 0.36);
    }
}

export function shortLabel(p) {
    if (p.kind === 'spring') return `${p.k / 1000}kN/m`;
    if (p.kind === 'gear') return `${p.ratio}:1`;
    if (p.kind === 'resistor') return `${p.ohms} Ω`;
    if (p.kind === 'battery') return `${p.volts} V`;
    return p.id;
}

export function drawPartIcon(ctx, kind, part, cx, cy, size, on) {
    const col = on ? KIND_COLOR[kind] : C.dim;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.5, size * 0.1);
    const h = size / 2;
    ctx.beginPath();
    if (kind === 'spring') { for (let i = 0; i <= 6; i++) { const x = cx - h + (size * i) / 6, y = cy + (i % 2 ? -h * 0.5 : h * 0.5); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    else if (kind === 'gear') { ctx.arc(cx, cy, h * 0.6, 0, Math.PI * 2); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.fillRect(cx + Math.cos(a) * h * 0.75 - 1.5, cy + Math.sin(a) * h * 0.75 - 1.5, 3, 3); } }
    else if (kind === 'resistor') { ctx.moveTo(cx - h, cy); ctx.lineTo(cx - h * 0.6, cy); for (let i = 0; i < 6; i++) ctx.lineTo(cx - h * 0.6 + (h * 1.2 * (i + 0.5)) / 6, cy + (i % 2 ? h * 0.4 : -h * 0.4)); ctx.lineTo(cx + h * 0.6, cy); ctx.lineTo(cx + h, cy); ctx.stroke(); }
    else if (kind === 'battery') { ctx.strokeRect(cx - h * 0.8, cy - h * 0.45, h * 1.5, h * 0.9); ctx.fillRect(cx + h * 0.7, cy - h * 0.2, h * 0.2, h * 0.4); }
}

function drawHero(ctx, p, T, view) {
    const x = p.x * T, y = p.y * T, w = P.W * T, h = P.H * T;
    const face = p.vx < -0.1 ? -1 : p.vx > 0.1 ? 1 : (view.face || 1);
    view.face = face;
    const step = p.grounded && Math.abs(p.vx) > 0.5 ? Math.sin(view.t * 18) : 0;
    ctx.save();
    ctx.translate(x + w / 2, y);
    ctx.scale(face, 1);
    // legs
    ctx.fillStyle = C.boots;
    ctx.fillRect(-w * 0.32, h * 0.72 + step * h * 0.04, w * 0.26, h * 0.28 - step * h * 0.04);
    ctx.fillRect(w * 0.06, h * 0.72 - step * h * 0.04, w * 0.26, h * 0.28 + step * h * 0.04);
    // body (overalls)
    ctx.fillStyle = C.suit; ctx.fillRect(-w * 0.4, h * 0.36, w * 0.8, h * 0.4);
    ctx.fillStyle = '#ffcf3d'; ctx.fillRect(-w * 0.4, h * 0.52, w * 0.8, h * 0.05);   // hi-vis band
    // tool belt + wrench
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(-w * 0.4, h * 0.66, w * 0.8, h * 0.06);
    ctx.fillStyle = '#b8c4d0'; ctx.fillRect(w * 0.22, h * 0.6, w * 0.08, h * 0.18);
    // head
    ctx.fillStyle = C.skin; ctx.fillRect(-w * 0.26, h * 0.12, w * 0.52, h * 0.26);
    ctx.fillStyle = '#1d2a36'; ctx.fillRect(w * 0.08, h * 0.2, w * 0.08, h * 0.06);
    // hard hat
    ctx.fillStyle = C.hat;
    ctx.beginPath(); ctx.ellipse(0, h * 0.13, w * 0.33, h * 0.12, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(-w * 0.38, h * 0.11, w * 0.82, h * 0.04);
    if (p.climb) { ctx.fillStyle = C.skin; ctx.fillRect(-w * 0.5, h * 0.3 + step, w * 0.14, h * 0.12); ctx.fillRect(w * 0.36, h * 0.24 - step, w * 0.14, h * 0.12); }
    ctx.restore();
}

function drawParticles(ctx, view, T, dt) {
    const keep = [];
    for (const q of view.particles) {
        q.life -= dt; if (q.life <= 0) continue;
        q.vy += 20 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        ctx.globalAlpha = Math.min(1, q.life * 2.5); ctx.fillStyle = q.color;
        ctx.fillRect(q.x * T - 2, q.y * T - 2, 4, 4);
        keep.push(q);
    }
    ctx.globalAlpha = 1;
    view.particles = keep.length > 300 ? keep.slice(-300) : keep;
}
