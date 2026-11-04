// ============================================================
// PEARL DIVER — one-touch: hold anywhere to swim down, let go to float up.
//
// A crab in a bubble helmet swims through a reef that scrolls past faster and
// faster. Grab pearls (deeper ones score more: 1, 2, 3), keep clear of the
// jellyfish, and come up to the surface before the air runs out: the meter
// drains underwater and fills back up at the top. One sting, or no air, and
// the dive is over. Best score is kept.
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
    s.next -= dt * mul;
    if (s.next <= 0) { _spawn(); s.next = T.gap * (0.7 + Math.random() * 0.6); }
    const x0 = 0.25 * _W / _H;   // the diver's x, in H units
    for (const o of s.things) {
        o.x -= dx;
        if (o.kind === 'jelly') o.y = o.y0 + Math.sin((s.t + o.ph) * o.w) * o.amp;
        const hit = Math.hypot(o.x - x0, o.y - s.y) < T.r + (o.kind === 'jelly' ? T.jellyR * 0.85 : T.pearlR * 1.6);
        if (hit && !o.gone) {
            if (o.kind === 'jelly') return _end('Zapped by a jellyfish!');
            o.gone = true; s.score += o.pts; s.pearls++;
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
function _draw() {
    const g = _g, W = _W, H = _H, s = _s;
    if (!g || !s) return;
    const Y = v => v * H, X = v => v * H;   // world units are fractions of H
    // sky, sea, sand
    g.fillStyle = '#ffd9a8'; g.fillRect(0, 0, W, Y(T.surface));
    const sea = g.createLinearGradient(0, Y(T.surface), 0, H);
    sea.addColorStop(0, '#38bdf8'); sea.addColorStop(0.6, '#1e6fb8'); sea.addColorStop(1, '#123a73');
    g.fillStyle = sea; g.fillRect(0, Y(T.surface), W, H - Y(T.surface));
    g.fillStyle = '#e7c98f'; g.fillRect(0, Y(T.floor), W, H - Y(T.floor));
    // waves on top
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x <= W; x += 6) g.lineTo(x, Y(T.surface) + Math.sin(x / 18 + s.t * 3) * 3);
    g.stroke();
    // depth bands: where the 1, 2 and 3-point pearls are
    g.fillStyle = 'rgba(255,255,255,.18)'; g.font = `bold ${Math.round(H * 0.022)}px Nunito, sans-serif`; g.textAlign = 'right';
    ['1', '2', '3'].forEach((p, i) => g.fillText(`${p} pt`, W - 6, Y(T.surface + 0.05 + (i + 0.5) / 3 * (T.floor - T.surface - 0.1))));
    // things
    for (const o of s.things) {
        const x = X(o.x), y = Y(o.y);
        if (o.kind === 'pearl') {
            const r = X(T.pearlR) * (1 + (o.pts - 1) * 0.25);
            g.fillStyle = ['#fff7ed', '#fde68a', '#f9a8d4'][o.pts - 1];
            g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
            g.strokeStyle = '#2b1240'; g.lineWidth = 2; g.stroke();
            g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, 7); g.fill();
        } else {
            const r = X(T.jellyR);
            g.fillStyle = 'rgba(244,114,182,.9)'; g.strokeStyle = '#2b1240'; g.lineWidth = 2;
            g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.lineTo(x + r, y + r * 0.2); g.lineTo(x - r, y + r * 0.2); g.closePath(); g.fill(); g.stroke();
            g.strokeStyle = 'rgba(244,114,182,.95)'; g.lineWidth = 2.5;
            for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * r * 0.4, y + r * 0.2); g.quadraticCurveTo(x + i * r * 0.4 + Math.sin(s.t * 6 + i) * 4, y + r * 0.9, x + i * r * 0.4, y + r * 1.5); g.stroke(); }
        }
    }
    // the diver: a crab in a bubble helmet
    const dx = 0.25 * W, dy = Y(s.y), r = X(T.r);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
    g.beginPath(); g.arc(dx, dy, r * 1.25, 0, 7); g.fill(); g.stroke();
    g.font = `${Math.round(r * 1.6)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#000';   // an emoji takes the fill's alpha: keep it opaque
    g.fillText('🦀', dx, dy + 1);
    g.textBaseline = 'alphabetic';
    // air meter and score
    const bw = W * 0.42, bx = 10, by = 10, bh = 14;
    g.fillStyle = 'rgba(43,18,64,.6)'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = s.air > 0.3 ? '#7dd3fc' : '#f87171'; g.fillRect(bx + 2, by + 2, (bw - 4) * s.air, bh - 4);
    g.fillStyle = '#2b1240'; g.font = `bold ${Math.round(H * 0.026)}px Nunito, sans-serif`; g.textAlign = 'left';
    g.fillText('AIR', bx + bw + 6, by + bh - 2);
    g.textAlign = 'right'; g.font = `bold ${Math.round(H * 0.04)}px Nunito, sans-serif`;
    g.fillText(`${s.score}`, W - 10, by + bh + 6);
}

/** Probes: the dive, and a way to put something right in front of the diver. */
export const _debug = () => (_s ? { y: _s.y, vy: _s.vy, air: _s.air, score: _s.score, over: _s.over, why: _s.why, t: _s.t, things: _s.things.length } : null);
export function _place(kind, dyAhead = 0) {
    if (!_s) return;
    const x = 0.25 * _W / _H + 0.004;
    if (kind === 'jelly') _s.things.push({ kind, x, y0: _s.y + dyAhead, y: _s.y + dyAhead, amp: 0, w: 0, ph: 0 });
    else _s.things.push({ kind: 'pearl', x, y: _s.y + dyAhead, pts: 3 });
}
