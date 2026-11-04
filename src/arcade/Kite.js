// ============================================================
// KITE WIND — one touch: every tap tugs the kite up; let it be and it sinks.
//
// The beach scrolls past faster and faster. Fly the kite through rings (each
// one in a row adds to the combo; miss one and it's back to ×1), keep away
// from the gulls, and don't let it touch the sand. Gusts of wind lift it or
// drag it down; the streaks show which way. Best score is kept.
// ============================================================
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'kite', icon: '🪁', title: 'Kite Wind', blurb: 'Tap to tug the kite up. Fly through rings for a combo, dodge gulls, ride the gusts.' };

export const T = {
    top: 0.06, ground: 0.9,
    tug: 0.62, gravity: 1.15, maxFall: 0.95,
    gust: 0.75,                         // strongest gust, as an acceleration (H/s²)
    speed: 0.3, speedUp: 50, maxMul: 2.2,
    gap: 1.0,                           // seconds between rings/gulls (at ×1)
    kiteR: 0.028, ringR: 0.075, gullR: 0.03,
};

let _el = null, _cv = null, _g = null, _W = 0, _H = 0, _raf = 0, _s = null, _offs = [];
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };

export function bestText() { const b = Solo.best('kite'); return b == null ? '' : `best ${b} pts`; }

export function mount(el) {
    _el = el;
    el.innerHTML = `<div class="pd-wrap"><canvas class="pd-cv kt-cv" id="kt-cv"></canvas>
        <div class="pd-over" id="kt-over"><div class="pd-card">
            <div class="cs-done-h bfont" id="kt-h">🪁 KITE WIND</div>
            <div class="pd-t" id="kt-t"><b>Tap</b> to tug the kite up; it sinks on its own.<br>Fly through <b>rings</b> for a combo, keep clear of <b>gulls</b> and the sand. Watch the wind!</div>
            <div class="cs-done-best" id="kt-best"></div>
            <button class="go-btn bfont" id="btn-kt-go">FLY</button>
        </div></div></div>`;
    _cv = el.querySelector('#kt-cv'); _g = _cv.getContext('2d');
    _size();
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(_cv, 'pointerdown', e => { e.preventDefault(); tug(); }, { passive: false });
    on(window, 'keydown', e => { if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); tug(); } });
    on(window, 'resize', () => { _size(); _draw(); });
    on(document, 'visibilitychange', () => { if (document.hidden && _s && !_s.over && !_s.paused) _pause(); });
    el.querySelector('#btn-kt-go').addEventListener('click', () => (_s && _s.paused && !_s.over ? _run() : start()));
    _s = _fresh(); _s.over = true;
    const b = Solo.best('kite'); el.querySelector('#kt-best').textContent = b == null ? '' : `Best: ${b} points`;
    _draw();
}
export function unmount() { cancelAnimationFrame(_raf); _raf = 0; _offs.splice(0).forEach(off => off()); _el = null; _s = null; }

function _size() {
    const w = Math.min(_el.clientWidth || 360, 520), h = Math.round(Math.min(w * 1.3, (window.innerHeight || 700) * 0.72));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    _cv.width = Math.round(w * dpr); _cv.height = Math.round(h * dpr);
    _cv.style.width = `${w}px`; _cv.style.height = `${h}px`;
    _g.setTransform(dpr, 0, 0, dpr, 0, 0);
    _W = w; _H = h;
}

const _fresh = () => ({ y: 0.4, vy: 0, t: 0, score: 0, rings: 0, combo: 1, bestCombo: 1, things: [], next: 0.6, wind: 0, windTo: 0, windT: 2, trail: [], streaks: [], over: false, paused: false, why: '' });

export function start() {
    _s = _fresh();
    _el.querySelector('#kt-over').hidden = true;
    _run();
}
function _run() {
    _el.querySelector('#kt-over').hidden = true;
    _s.paused = false;
    cancelAnimationFrame(_raf);
    let last = performance.now();
    const tick = now => {
        if (!_s || _s.over || _s.paused) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        step(dt); _draw();
        if (!_s.over) _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}
function _pause() { _s.paused = true; cancelAnimationFrame(_raf); _overlay('⏸ PAUSED', 'resume'); }

/** A tug on the string. */
export function tug() {
    if (!_s || _s.over || _s.paused) return;
    _s.vy = Math.min(_s.vy, 0) - T.tug;
    _sfx('react_go');
}

/** One step (exported for probes). */
export function step(dt) {
    const s = _s;
    if (!s || s.over) return;
    s.t += dt;
    // The wind drifts toward a new gust every few seconds.
    s.windT -= dt;
    if (s.windT <= 0) { s.windTo = (Math.random() * 2 - 1) * T.gust * Math.min(1, 0.4 + s.t / 60); s.windT = 2 + Math.random() * 3; }
    s.wind += (s.windTo - s.wind) * Math.min(1, dt * 1.5);
    s.vy = Math.min(T.maxFall, s.vy + (T.gravity - s.wind) * dt);
    s.y += s.vy * dt;
    if (s.y < T.top) { s.y = T.top; s.vy = Math.max(0, s.vy); }
    if (s.y > T.ground - T.kiteR) return _end('Crashed into the sand!');
    const mul = Math.min(T.maxMul, 1 + s.t / T.speedUp), dx = T.speed * mul * dt * (_W / _H);
    s.next -= dt * mul;
    if (s.next <= 0) { _spawn(); s.next = T.gap * (0.75 + Math.random() * 0.5); }
    const x0 = 0.3 * _W / _H;
    for (const o of s.things) {
        o.x -= dx * (o.kind === 'gull' ? 1.35 : 1);
        if (o.kind === 'gull') o.y += Math.sin((s.t + o.ph) * 3) * 0.05 * dt;
        const d = Math.hypot(o.x - x0, o.y - s.y);
        if (o.kind === 'gull' && d < T.kiteR + T.gullR) return _end('Hit a gull!');
        if (o.kind === 'ring' && !o.done && d < T.ringR * 0.8) {
            o.done = true; s.rings++; s.score += 10 * s.combo; s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo - 1);
            _sfx(s.combo > 4 ? 'coin_gain' : 'land_good');
        }
        if (o.kind === 'ring' && !o.done && !o.missed && o.x < x0 - T.ringR) { o.missed = true; s.combo = 1; }
    }
    s.things = s.things.filter(o => o.x > -0.15);
    s.trail.unshift(s.y); if (s.trail.length > 14) s.trail.pop();
    // Streaks drifting with the wind
    if (Math.random() < dt * 14) s.streaks.push({ x: _W / _H + 0.02, y: T.top + Math.random() * (T.ground - T.top) });
    for (const st of s.streaks) { st.x -= dx * 1.8; st.y -= s.wind * dt * 0.25; }
    s.streaks = s.streaks.filter(st => st.x > -0.1);
}

function _spawn(kind) {
    const s = _s, x = _W / _H + 0.1;
    const gullOdds = Math.min(0.5, 0.2 + s.t / 100);
    if ((kind || (Math.random() < gullOdds ? 'gull' : 'ring')) === 'gull') s.things.push({ kind: 'gull', x, y: T.top + 0.05 + Math.random() * (T.ground - T.top - 0.15), ph: Math.random() * 6 });
    else s.things.push({ kind: 'ring', x, y: T.top + 0.08 + Math.random() * (T.ground - T.top - 0.2) });
}

function _end(why) {
    const s = _s;
    s.over = true; s.why = why;
    cancelAnimationFrame(_raf);
    Solo.bump('kiteFlights');
    if (s.bestCombo >= 10) Solo.bump('kiteCombo10');
    const isBest = Solo.record('kite', s.score, 'high');
    _sfx(isBest && s.score > 0 ? 'win' : 'mg_lose'); Solo.won();
    _draw();
    _overlay(why, isBest && s.score > 0 ? 'best' : 'again');
}

function _overlay(head, kind) {
    _el.querySelector('#kt-over').hidden = false;
    _el.querySelector('#kt-h').textContent = head;
    if (kind === 'resume') {
        _el.querySelector('#kt-t').textContent = 'Tap to carry on.';
        _el.querySelector('#kt-best').textContent = '';
        _el.querySelector('#btn-kt-go').textContent = 'CARRY ON';
        return;
    }
    _el.querySelector('#kt-t').innerHTML = `<b class="pd-score">${_s.score}</b> points · ${_s.rings} ring${_s.rings === 1 ? '' : 's'} · best combo ×${_s.bestCombo}`;
    _el.querySelector('#kt-best').textContent = kind === 'best' ? '🏅 NEW BEST!' : `Best: ${Solo.best('kite')} points`;
    _el.querySelector('#btn-kt-go').textContent = 'FLY AGAIN';
}

function _draw() {
    const g = _g, W = _W, H = _H, s = _s;
    if (!g || !s) return;
    const P = v => v * H;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#93c5fd'); sky.addColorStop(0.7, '#fde68a'); sky.addColorStop(1, '#fbbf24');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // sea and sand
    g.fillStyle = '#38bdf8'; g.fillRect(0, P(T.ground) - 14, W, 14);
    g.fillStyle = '#e7c98f'; g.fillRect(0, P(T.ground), W, H - P(T.ground));
    // wind streaks
    g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = 2;
    for (const st of s.streaks) { g.beginPath(); g.moveTo(P(st.x), P(st.y)); g.lineTo(P(st.x) + 18, P(st.y) + s.wind * 12); g.stroke(); }
    // rings and gulls
    for (const o of s.things) {
        if (o.kind === 'ring') {
            g.strokeStyle = o.done ? 'rgba(34,197,94,.5)' : '#f59e0b'; g.lineWidth = 6;
            g.beginPath(); g.ellipse(P(o.x), P(o.y), P(T.ringR) * 0.45, P(T.ringR), 0, 0, 7); g.stroke();
        } else {
            g.strokeStyle = '#334155'; g.lineWidth = 3; const x = P(o.x), y = P(o.y), w = P(T.gullR) * 1.4, flap = Math.sin(s.t * 12 + o.ph) * 5;
            g.beginPath(); g.moveTo(x - w, y - flap); g.quadraticCurveTo(x - w / 2, y - 8, x, y); g.quadraticCurveTo(x + w / 2, y - 8, x + w, y - flap); g.stroke();
        }
    }
    // the string, the tail and the kite
    const kx = 0.3 * W, ky = P(s.y);
    g.strokeStyle = 'rgba(43,18,64,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, P(T.ground) - 6); g.quadraticCurveTo(kx * 0.5, P(T.ground) - 20, kx, ky); g.stroke();
    g.strokeStyle = '#ec4899'; g.lineWidth = 3; g.beginPath();
    s.trail.forEach((ty, i) => { const x = kx - 6 - i * 7, y = P(ty) + 16 + Math.sin(s.t * 10 + i) * 3; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    const r = P(T.kiteR) * 1.3, tilt = Math.max(-0.5, Math.min(0.5, s.vy * 0.6));
    g.save(); g.translate(kx, ky); g.rotate(tilt);
    g.fillStyle = '#ef4444'; g.strokeStyle = '#2b1240'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -r * 1.3); g.lineTo(r, 0); g.lineTo(0, r * 1.3); g.lineTo(-r, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#facc15'; g.beginPath(); g.moveTo(0, -r * 1.3); g.lineTo(r, 0); g.lineTo(0, 0); g.closePath(); g.fill();
    g.restore();
    // score, combo, wind
    g.fillStyle = '#2b1240'; g.textAlign = 'right'; g.font = `bold ${Math.round(H * 0.045)}px Nunito, sans-serif`;
    g.fillText(`${s.score}`, W - 10, 34);
    if (s.combo > 1) { g.font = `bold ${Math.round(H * 0.028)}px Nunito, sans-serif`; g.fillText(`combo ×${s.combo}`, W - 10, 56); }
    g.textAlign = 'left'; g.font = `bold ${Math.round(H * 0.028)}px Nunito, sans-serif`;
    g.fillText(`wind ${s.wind > 0.1 ? '⬆' : s.wind < -0.1 ? '⬇' : '·'}`, 10, 30);
}

/** Probes: the flight, and a way to put something right in front of the kite. */
export const _debug = () => (_s ? { y: _s.y, vy: _s.vy, score: _s.score, combo: _s.combo, rings: _s.rings, over: _s.over, why: _s.why } : null);
export function _place(kind, dy = 0) { if (!_s) return; _s.things.push({ kind, x: 0.3 * _W / _H + 0.005, y: _s.y + dy, ph: 0 }); }
export function _calm() { if (_s) { _s.wind = 0; _s.windTo = 0; _s.windT = 99; } }
