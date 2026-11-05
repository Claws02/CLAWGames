// ============================================================
// PEARL DIVER — one-touch: hold anywhere to swim down, let go to float up.
//
// A crab in a bubble helmet swims through a reef that scrolls past faster and
// faster. Grab pearls (deeper ones score more: 1, 2, 3), keep clear of the
// jellyfish, and come up to the surface before the air runs out: the meter
// drains underwater and fills back up at the top. One sting, or no air, and
// the dive is over. Best score is kept.
//
// The look: a dive boat bobbing on a sunset sea, light rays, a far reef and
// fish schools drifting by, kelp and coral scrolling along the sand, pearls
// glowing in open clams (brighter the deeper), pulsing jellyfish, and the crab
// paddling in a shiny helmet that trails bubbles and flashes red when air is low.
// ============================================================
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'pearl', icon: '🫧', title: 'Pearl Diver', blurb: 'Hold to dive, let go to float. Grab pearls, dodge jellyfish, and come up for air.' };

// Tuning, in fractions of the tank's height (H) and width (W) per second.
export const T = {
    surface: 0.11, floor: 0.93,        // where the water starts and the sand is
    dive: 2.1, float: 1.5, maxV: 0.75, // acceleration down when held, up when not; top speed
    airSecs: 9, refill: 0.8,           // a full tank lasts this long underwater; refill per s at the top
    speed: 0.32, speedUp: 45, maxMul: 2.3, // scroll speed (W/s), +100% every speedUp s, capped
    gap: 0.5,                          // seconds between things to grab or dodge
    r: 0.035, pearlR: 0.018, jellyR: 0.03,
};

let _el = null, _cv = null, _g = null, _W = 0, _H = 0, _raf = 0, _s = null, _hold = false, _offs = [];
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };

export function bestText() { const b = Solo.best('pearl'); return b == null ? '' : `best ${b} pts`; }

export function mount(el) {
    _el = el;
    el.innerHTML = `<div class="pd-wrap"><canvas class="pd-cv" id="pd-cv"></canvas>
        <div class="pd-over" id="pd-over"><div class="pd-card">
            <div class="cs-done-h bfont" id="pd-h">🫧 PEARL DIVER</div>
            <div class="pd-t" id="pd-t">Hold anywhere to <b>swim down</b>, let go to <b>float up</b>.<br>Pearls deeper down score more. Dodge the jellyfish, and surface before your air runs out.</div>
            <div class="cs-done-best" id="pd-best"></div>
            <button class="go-btn bfont" id="btn-pd-go">DIVE IN</button>
        </div></div></div>`;
    _cv = el.querySelector('#pd-cv'); _g = _cv.getContext('2d');
    _size();
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(_cv, 'pointerdown', e => { e.preventDefault(); _hold = true; }, { passive: false });
    on(window, 'pointerup', () => { _hold = false; });
    on(window, 'pointercancel', () => { _hold = false; });
    on(window, 'resize', () => { _size(); _draw(); });
    on(document, 'visibilitychange', () => { if (document.hidden && _s && !_s.over) _pause(); });
    // One button: carry on after a pause, otherwise a new dive.
    el.querySelector('#btn-pd-go').addEventListener('click', () => (_s && _s.paused && !_s.over ? _resume() : start()));
    _s = _fresh(); _s.over = true;
    _overlay('🫧 PEARL DIVER', null);
    _draw();
}

export function unmount() {
    cancelAnimationFrame(_raf); _raf = 0;
    _offs.splice(0).forEach(off => off());
    _el = null; _s = null; _hold = false;
}

function _size() {
    const w = Math.min(_el.clientWidth || 360, 520);
    const h = Math.round(Math.min(w * 1.35, (window.innerHeight || 700) * 0.72));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    _cv.width = Math.round(w * dpr); _cv.height = Math.round(h * dpr);
    _cv.style.width = `${w}px`; _cv.style.height = `${h}px`;
    _g.setTransform(dpr, 0, 0, dpr, 0, 0);
    _W = w; _H = h;
}

const _fresh = () => ({ y: (T.surface + 0.02), vy: 0, air: 1, t: 0, score: 0, pearls: 0, things: [], next: 1, over: false, paused: false, why: '' });

/** A new dive. */
export function start() {
    _s = _fresh();
    _el.querySelector('#pd-over').hidden = true;
    _hold = false;
    cancelAnimationFrame(_raf);
    let last = performance.now();
    const tick = now => {
        if (!_s || _s.over || _s.paused) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        step(dt, _hold);
        _draw();
        if (!_s.over) _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}

function _pause() {
    _s.paused = true; cancelAnimationFrame(_raf);
    _overlay('⏸ PAUSED', 'resume');
}

/** One step of the dive (exported for probes: deterministic given the spawns). */
export function step(dt, hold) {
    const s = _s;
    if (!s || s.over) return;
    s.t += dt;
    // Swim
    s.vy += (hold ? T.dive : -T.float) * dt;
    s.vy = Math.max(-T.maxV, Math.min(T.maxV, s.vy)) * (1 - 1.2 * dt);
    s.y += s.vy * dt;
    if (s.y <= T.surface) { s.y = T.surface; if (s.vy < 0) s.vy = 0; }
    if (s.y >= T.floor - T.r) { s.y = T.floor - T.r; if (s.vy > 0) s.vy = 0; }
    // Air: at the top it fills, under water it drains
    const atTop = s.y <= T.surface + 0.012;
    s.air = Math.max(0, Math.min(1, s.air + (atTop ? T.refill : -1 / T.airSecs) * dt));
    if (s.air <= 0) return _end('Out of air!');
    // The reef scrolls past
    const mul = Math.min(T.maxMul, 1 + s.t / T.speedUp), dx = T.speed * mul * dt * (_W / _H);   // in H units
    _scroll += dx;
    s.next -= dt * mul;
    if (s.next <= 0) { _spawn(); s.next = T.gap * (0.7 + Math.random() * 0.6); }
    const x0 = 0.25 * _W / _H;   // the diver's x, in H units
    for (const o of s.things) {
        o.x -= dx;
        if (o.kind === 'jelly') o.y = o.y0 + Math.sin((s.t + o.ph) * o.w) * o.amp;
        const hit = Math.hypot(o.x - x0, o.y - s.y) < T.r + (o.kind === 'jelly' ? T.jellyR * 0.85 : T.pearlR * 1.6);
        if (hit && !o.gone) {
            if (o.kind === 'jelly') return _end('Zapped by a jellyfish!');
            o.gone = true; s.score += o.pts; s.pearls++; _pops.push({ x: o.x, y: o.y, pts: o.pts, t: performance.now() / 1000 });
            try { Audio.haptic(o.pts === 3 ? [15, 20, 15] : 10); } catch (e) {}
            _sfx(o.pts === 3 ? 'coin_gain' : 'land_good');
        }
    }
    s.things = s.things.filter(o => o.x > -0.1 && !o.gone);
}

// Something new on the right: pearls more often, jellyfish more as it speeds up.
function _spawn(kind) {
    const s = _s, x = _W / _H + 0.06;
    const jellyOdds = Math.min(0.55, 0.22 + s.t / 120);
    if ((kind || (Math.random() < jellyOdds ? 'jelly' : 'pearl')) === 'jelly') {
        const y0 = T.surface + 0.12 + Math.random() * (T.floor - T.surface - 0.2);
        s.things.push({ kind: 'jelly', x, y0, y: y0, amp: 0.03 + Math.random() * 0.06, w: 1.2 + Math.random() * 1.5, ph: Math.random() * 6 });
    } else {
        const depth = Math.random();   // 0 = just under the surface, 1 = the sand
        const y = T.surface + 0.05 + depth * (T.floor - T.surface - 0.1);
        s.things.push({ kind: 'pearl', x, y, pts: depth < 0.34 ? 1 : depth < 0.67 ? 2 : 3 });
    }
}

function _end(why) {
    const s = _s;
    s.over = true; s.why = why;
    cancelAnimationFrame(_raf);
    Solo.bump('pearlDives');
    const isBest = Solo.record('pearl', s.score, 'high');
    _sfx(isBest && s.score > 0 ? 'win' : 'mg_lose');
    Solo.won();
    _overlay(why, isBest && s.score > 0 ? 'best' : 'again');
}

function _overlay(head, kind) {
    const o = _el.querySelector('#pd-over');
    o.hidden = false;
    _el.querySelector('#pd-h').textContent = head;
    const b = Solo.best('pearl');
    if (kind === 'again' || kind === 'best') {
        _el.querySelector('#pd-t').innerHTML = `<b class="pd-score">${_s.score}</b> points · ${_s.pearls} pearl${_s.pearls === 1 ? '' : 's'} · ${Math.round(_s.t)} s down`;
        _el.querySelector('#pd-best').textContent = kind === 'best' ? '🏅 NEW BEST!' : `Best: ${b} points`;
        _el.querySelector('#btn-pd-go').textContent = 'DIVE AGAIN';
    } else if (kind === 'resume') {
        _el.querySelector('#pd-t').textContent = 'Tap to carry on.';
        _el.querySelector('#pd-best').textContent = '';
        _el.querySelector('#btn-pd-go').textContent = 'CARRY ON';
    } else {
        _el.querySelector('#pd-best').textContent = b == null ? '' : `Best: ${b} points`;
    }
}

function _resume() {
    _el.querySelector('#pd-over').hidden = true;
    _s.paused = false;
    let last = performance.now();
    const tick = now => {
        if (!_s || _s.over || _s.paused) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        step(dt, _hold); _draw();
        if (!_s.over) _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}

// ---- drawing ---------------------------------------------------------------------------
const _hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const REEF = Array.from({ length: 9 }, (_, i) => ({ x: i * 0.35 + _hash(i, 1) * 0.2, h: 0.08 + _hash(i, 2) * 0.12, w: 0.12 + _hash(i, 3) * 0.1 }));
const FLOOR = Array.from({ length: 10 }, (_, i) => ({ x: i * 0.3 + _hash(i, 5) * 0.15, kind: i % 3, h: 0.06 + _hash(i, 6) * 0.08 }));
let _scroll = 0, _pops = [], _bubbles = [], _splash = 0, _wasTop = true;

function _jelly(g, x, y, r, t, ph) {
    const pulse = 1 + Math.sin(t * 4 + ph) * 0.1;
    const glow = g.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2);
    glow.addColorStop(0, 'rgba(244,114,182,.35)'); glow.addColorStop(1, 'rgba(244,114,182,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(x, y, r * 2.2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(251,207,232,.9)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(x + i * r * 0.35, y + r * 0.15);
        for (let k = 1; k <= 5; k++) g.lineTo(x + i * r * 0.35 + Math.sin(t * 6 + k + i + ph) * r * 0.2, y + r * 0.15 + k * r * 0.3);
        g.stroke();
    }
    g.save(); g.translate(x, y); g.scale(1 / pulse, pulse);
    const bell = g.createRadialGradient(-r * 0.25, -r * 0.4, 1, 0, 0, r * 1.1);
    bell.addColorStop(0, 'rgba(255,255,255,.95)'); bell.addColorStop(0.5, 'rgba(249,168,212,.9)'); bell.addColorStop(1, 'rgba(219,39,119,.75)');
    g.fillStyle = bell; g.strokeStyle = 'rgba(131,24,67,.8)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, r * 0.15, r, Math.PI, 0); g.quadraticCurveTo(r * 0.5, r * 0.4, 0, r * 0.25); g.quadraticCurveTo(-r * 0.5, r * 0.4, -r, r * 0.15); g.fill(); g.stroke();
    g.fillStyle = '#831843'; for (const ex of [-0.3, 0.3]) { g.beginPath(); g.arc(ex * r, -r * 0.1, r * 0.1, 0, 7); g.fill(); }
    g.restore();
}

function _pearl(g, x, y, r, pts, t) {
    // an open clam, the pearl sitting in it, glowing more the deeper (and dearer) it is
    const glow = g.createRadialGradient(x, y, 1, x, y, r * (2.2 + pts * 0.4));
    glow.addColorStop(0, `rgba(255,255,255,${0.25 + pts * 0.12})`); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(x, y, r * (2.2 + pts * 0.4), 0, 7); g.fill();
    g.fillStyle = '#c4b5a0'; g.strokeStyle = '#57534e'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(x, y + r * 0.7, r * 1.7, r * 0.7, 0, 0, Math.PI); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(x, y - r * 0.2, r * 1.7, r * 1.1, 0, Math.PI * 1.05, Math.PI * 1.95); g.fill(); g.stroke();
    const p = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
    p.addColorStop(0, '#fff'); p.addColorStop(1, ['#fde7d2', '#fde68a', '#f9a8d4'][pts - 1]);
    g.fillStyle = p; g.beginPath(); g.arc(x, y + r * 0.2, r, 0, 7); g.fill();
    g.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 5 + x)})`; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.1, r * 0.25, 0, 7); g.fill();
}

function _draw() {
    const g = _g, W = _W, H = _H, s = _s;
    if (!g || !s) return;
    const Y = v => v * H, X = v => v * H, t = s.t, now = performance.now() / 1000;
    // sky, with a low sun, and the dive boat bobbing on the waves
    const sky = g.createLinearGradient(0, 0, 0, Y(T.surface)); sky.addColorStop(0, '#fca5a5'); sky.addColorStop(1, '#fde68a');
    g.fillStyle = sky; g.fillRect(0, 0, W, Y(T.surface));
    g.fillStyle = '#fff7ed'; g.beginPath(); g.arc(W * 0.78, Y(T.surface) * 0.55, Y(T.surface) * 0.28, 0, 7); g.fill();
    const boatX = W * 0.25 - ((_scroll * H * 0.5) % (W + 120)) + (s.t < 1 ? 0 : 0), bob = Math.sin(now * 2) * 2;
    if (boatX > -80) { g.font = `${Math.round(H * 0.06)}px sans-serif`; g.textAlign = 'center'; g.fillText('🛥️', boatX, Y(T.surface) + bob); }
    // the sea: deeper is darker; light rays from the top
    const sea = g.createLinearGradient(0, Y(T.surface), 0, H);
    sea.addColorStop(0, '#38bdf8'); sea.addColorStop(0.55, '#1d6fb8'); sea.addColorStop(1, '#0b2a5b');
    g.fillStyle = sea; g.fillRect(0, Y(T.surface), W, H - Y(T.surface));
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) {
        const x0 = ((k * 0.3 - _scroll * 0.15) % 1.6 + 1.6) % 1.6 * W - W * 0.2 + Math.sin(now * 0.4 + k) * 12;
        const ray = g.createLinearGradient(0, Y(T.surface), 0, Y(0.75)); ray.addColorStop(0, 'rgba(255,255,255,.12)'); ray.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = ray; g.beginPath(); g.moveTo(x0 - 10, Y(T.surface)); g.lineTo(x0 + 16, Y(T.surface)); g.lineTo(x0 + 70, Y(0.75)); g.lineTo(x0 + 10, Y(0.75)); g.closePath(); g.fill();
    }
    g.restore();
    // far reef silhouettes (slow), a school of fish now and then
    g.fillStyle = 'rgba(8,47,73,.45)';
    for (const r of REEF) {
        const span = W / H + 0.6, x = (((r.x - _scroll * 0.35) % span) + span) % span - 0.3;
        g.beginPath(); g.moveTo(X(x), Y(T.floor)); g.quadraticCurveTo(X(x + r.w * 0.2), Y(T.floor - r.h * 1.3), X(x + r.w * 0.5), Y(T.floor - r.h)); g.quadraticCurveTo(X(x + r.w * 0.8), Y(T.floor - r.h * 1.4), X(x + r.w), Y(T.floor)); g.fill();
    }
    const school = ((now * 0.05) % 1.4) * (W + 200) - 100;
    g.font = `${Math.round(H * 0.022)}px sans-serif`; g.globalAlpha = 0.5;
    for (let i = 0; i < 6; i++) g.fillText('🐟', W - school + (i % 3) * 16, Y(0.45) + Math.floor(i / 3) * 14 + Math.sin(now * 3 + i) * 3);
    g.globalAlpha = 1;
    // the sand, with kelp, coral and shells scrolling at the reef's speed
    const sand = g.createLinearGradient(0, Y(T.floor), 0, H); sand.addColorStop(0, '#f2d49b'); sand.addColorStop(1, '#c9a063');
    g.fillStyle = sand; g.beginPath(); g.moveTo(0, Y(T.floor));
    for (let x = 0; x <= W; x += 10) g.lineTo(x, Y(T.floor) + Math.sin((x / H + _scroll) * 9) * 2);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    for (const f of FLOOR) {
        const span = W / H + 0.4, x = (((f.x - _scroll) % span) + span) % span - 0.2;
        if (f.kind === 0) {   // kelp
            g.strokeStyle = '#15803d'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(x), Y(T.floor) + 3);
            for (let k = 1; k <= 6; k++) g.lineTo(X(x) + Math.sin(now * 1.6 + k * 0.6 + f.x * 5) * 5 * k / 6, Y(T.floor) - Y(f.h * 1.6) * k / 6);
            g.stroke();
        } else if (f.kind === 1) {   // coral
            g.strokeStyle = '#fb7185'; g.lineWidth = 4;
            for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(X(x), Y(T.floor) + 2); g.lineTo(X(x) + Math.sin(a) * Y(f.h), Y(T.floor) - Math.cos(a) * Y(f.h)); g.stroke(); }
        } else { g.font = `${Math.round(H * 0.025)}px sans-serif`; g.fillText(f.h > 0.1 ? '🐚' : '⭐', X(x), Y(T.floor) + H * 0.03); }
    }
    // the surface waves (over the boat's hull)
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x <= W; x += 6) g.lineTo(x, Y(T.surface) + Math.sin(x / 18 + now * 3) * 3);
    g.stroke();
    // depth bands: where the 1, 2 and 3-point pearls are
    g.fillStyle = 'rgba(255,255,255,.22)'; g.font = `900 ${Math.round(H * 0.022)}px Nunito, sans-serif`; g.textAlign = 'right';
    ['1 pt', '2 pts', '3 pts'].forEach((p, i) => g.fillText(p, W - 6, Y(T.surface + 0.05 + (i + 0.5) / 3 * (T.floor - T.surface - 0.1))));
    g.textAlign = 'center';
    // pearls and jellyfish
    for (const o of s.things) {
        const x = X(o.x), y = Y(o.y);
        if (o.kind === 'pearl') _pearl(g, x, y, X(T.pearlR) * (1 + (o.pts - 1) * 0.25), o.pts, now);
        else _jelly(g, x, y, X(T.jellyR), now, o.ph || 0);
    }
    // bubbles from the helmet
    const dx = 0.25 * W, dy = Y(s.y), r = X(T.r);
    if (!s.over && s.y > T.surface + 0.02 && Math.random() < 0.12) _bubbles.push({ x: dx + r * 0.6, y: dy - r, r: 2 + Math.random() * 3, t: now });
    _bubbles = _bubbles.filter(b => now - b.t < 1.6 && b.y > Y(T.surface));
    for (const b of _bubbles) { b.y -= 1.2; b.x += Math.sin((now - b.t) * 6) * 0.5 - (s.over ? 0 : 0.8); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.3; g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.stroke(); }
    // a splash when it surfaces for air
    const top = s.y <= T.surface + 0.012;
    if (top && !_wasTop) _splash = now;
    _wasTop = top;
    if (now - _splash < 0.5) { const k = (now - _splash) / 0.5; g.fillStyle = `rgba(255,255,255,${1 - k})`; for (let i = 0; i < 8; i++) { const a = Math.PI + (i / 7) * Math.PI; g.beginPath(); g.arc(dx + Math.cos(a) * r * (1 + k * 2.5), Y(T.surface) + Math.sin(a) * r * (0.5 + k * 2.2), 3, 0, 7); g.fill(); } }
    // the diver: a crab in a bubble helmet, tilting with its swim, legs paddling
    g.save(); g.translate(dx, dy); g.rotate(Math.max(-0.5, Math.min(0.5, s.vy * 0.9)));
    g.strokeStyle = '#b91c1c'; g.lineWidth = 2.5; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) for (const side of [-1, 1]) { const kick = Math.sin(now * 14 + i * 2) * 4; g.beginPath(); g.moveTo(side * r * 0.5, r * 0.4); g.lineTo(side * (r * 0.8 + i * 3), r * 0.9 + kick); g.stroke(); }
    g.font = `${Math.round(r * 1.6)}px sans-serif`; g.textBaseline = 'middle'; g.fillStyle = '#000';
    g.fillText('🦀', 0, 1);
    const low = s.air < 0.3 && !s.over, flash = low ? 0.5 + 0.5 * Math.sin(now * 12) : 0;
    const helm = g.createRadialGradient(-r * 0.4, -r * 0.5, 1, 0, 0, r * 1.3);
    helm.addColorStop(0, 'rgba(255,255,255,.55)'); helm.addColorStop(0.7, low ? `rgba(248,113,113,${0.2 + flash * 0.3})` : 'rgba(186,230,253,.2)'); helm.addColorStop(1, 'rgba(255,255,255,.45)');
    g.fillStyle = helm; g.strokeStyle = low ? `rgba(239,68,68,${0.6 + flash * 0.4})` : 'rgba(255,255,255,.95)'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(0, 0, r * 1.28, 0, 7); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(-r * 0.55, -r * 0.6, r * 0.3, r * 0.14, -0.6, 0, 7); g.fill();
    g.restore(); g.textBaseline = 'alphabetic';
    // pearl pickups: a sparkle and the points
    _pops = _pops.filter(p => now - p.t < 0.8);
    for (const p of _pops) {
        const k = (now - p.t) / 0.8, x = X(p.x), y = Y(p.y) - k * 30;
        for (let i = 0; i < 6; i++) { const a = i * 1.05, d = 6 + k * 20; g.fillStyle = `rgba(253,224,71,${1 - k})`; g.beginPath(); g.arc(X(p.x) + Math.cos(a) * d, Y(p.y) + Math.sin(a) * d, 2, 0, 7); g.fill(); }
        g.globalAlpha = 1 - k; g.fillStyle = p.pts === 3 ? '#f9a8d4' : '#fff'; g.strokeStyle = '#2b1240'; g.lineWidth = 4;
        g.font = `900 ${Math.round(H * (0.03 + p.pts * 0.005))}px Nunito, sans-serif`;
        g.strokeText(`+${p.pts}`, x, y); g.fillText(`+${p.pts}`, x, y); g.globalAlpha = 1;
    }
    // the air tank and the score
    const bw = W * 0.42, bx = 12, by = 10, bh = 16;
    g.fillStyle = '#334155'; g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, 8) : g.rect(bx, by, bw, bh); g.fill();
    g.fillStyle = '#64748b'; g.fillRect(bx + bw - 2, by + 4, 6, bh - 8);
    const airC = s.air > 0.3 ? '#7dd3fc' : `rgba(248,113,113,${0.75 + 0.25 * Math.sin(now * 12)})`;
    g.fillStyle = airC; g.beginPath(); g.roundRect ? g.roundRect(bx + 3, by + 3, Math.max(0, (bw - 6) * s.air), bh - 6, 5) : g.rect(bx + 3, by + 3, Math.max(0, (bw - 6) * s.air), bh - 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 3; i++) { const bxx = bx + 8 + ((now * 30 + i * 37) % Math.max(1, (bw - 16) * s.air)); g.beginPath(); g.arc(bxx, by + bh / 2, 1.5, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.strokeStyle = '#2b1240'; g.lineWidth = 3; g.font = `900 ${Math.round(H * 0.024)}px Nunito, sans-serif`; g.textAlign = 'left';
    g.strokeText(low ? 'AIR! ⬆' : 'AIR', bx + bw + 9, by + bh - 3); g.fillText(low ? 'AIR! ⬆' : 'AIR', bx + bw + 9, by + bh - 3);
    g.textAlign = 'right'; g.font = `900 ${Math.round(H * 0.045)}px Nunito, sans-serif`; g.lineWidth = 5;
    g.strokeText(`${s.score}`, W - 12, by + bh + 12); g.fillText(`${s.score}`, W - 12, by + bh + 12);
}

/** Probes: the dive, and a way to put something right in front of the diver. */
export const _debug = () => (_s ? { y: _s.y, vy: _s.vy, air: _s.air, score: _s.score, over: _s.over, why: _s.why, t: _s.t, things: _s.things.length } : null);
export function _place(kind, dyAhead = 0) {
    if (!_s) return;
    const x = 0.25 * _W / _H + 0.004;
    if (kind === 'jelly') _s.things.push({ kind, x, y0: _s.y + dyAhead, y: _s.y + dyAhead, amp: 0, w: 0, ph: 0 });
    else _s.things.push({ kind: 'pearl', x, y: _s.y + dyAhead, pts: 3 });
}
