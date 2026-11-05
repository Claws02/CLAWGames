// ============================================================
// KITE WIND — one touch: every tap tugs the kite up; let it be and it sinks.
//
// The beach scrolls past faster and faster. Fly the kite through rings (each
// one in a row adds to the combo; miss one and it's back to ×1), keep away
// from the gulls, and don't let it touch the sand. Gusts of wind lift it or
// drag it down; the streaks show which way. Best score is kept.
// ============================================================
import * as Solo from './SoloStats.js';
import * as K from './KiteLogic.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'kite', icon: '🪁', title: 'Kite Wind', blurb: 'Tap to tug the kite up. Fly through rings for a combo, dodge gulls, ride the gusts.' };

export const T = K.T;
const KITE_X = K.KITE_X;
const CLOUDS = [{ x: 0.1, y: 0.12, k: 1.2, far: true }, { x: 0.6, y: 0.2, k: 0.9, far: true }, { x: 1.0, y: 0.08, k: 1, far: true }, { x: 0.3, y: 0.32, k: 1.4 }, { x: 0.9, y: 0.42, k: 1.1 }];
const _mix = (a, b, f) => { const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const [x, y] = [h(a), h(b)]; return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * f)).join(',')})`; };
let _pops = [], _endT = 0;

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

const _fresh = () => ({ ...K.fresh(), streaks: [], paused: false });

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
    K.tug(_s);
    _sfx('react_go');
}

/** One step (exported for probes). The rules are in KiteLogic.js. */
export function step(dt) {
    const s = _s;
    if (!s || s.over) return;
    const before = new Set(s.things.filter(o => o.kind === 'ring' && o.done));
    const ev = K.step(s, dt, _W / _H, Math.random);
    if (ev.ring) {
        _sfx(s.combo > 4 ? 'coin_gain' : 'land_good'); try { Audio.haptic(s.combo > 4 ? [15, 20, 15] : 12); } catch (e) {}
        for (const o of s.things) if (o.kind === 'ring' && o.done && !before.has(o)) _pops.push({ x: o.x, y: o.y, t: performance.now() / 1000, pts: 10 * (s.combo - 1), combo: s.combo });
    }
    if (ev.end) { s.over = false; return _end(ev.end); }
    // streaks drifting with the wind
    const dx = T.speed * K.mul(s) * dt * (_W / _H);
    if (Math.random() < dt * 14) s.streaks.push({ x: _W / _H + 0.02, y: T.top + Math.random() * (T.ground - T.top) });
    for (const st of s.streaks) { st.x -= dx * 1.8; st.y -= s.wind * dt * 0.25; }
    s.streaks = s.streaks.filter(st => st.x > -0.1);
}

function _end(why) {
    const s = _s;
    s.over = true; s.why = why;
    cancelAnimationFrame(_raf);
    Solo.bump('kiteFlights');
    if (s.bestCombo >= 10) Solo.bump('kiteCombo10');
    const isBest = Solo.record('kite', s.score, 'high');
    _sfx(isBest && s.score > 0 ? 'win' : 'mg_lose'); Solo.won();
    // the kite tumbles to the sand, then the card
    _endT = performance.now() / 1000;
    const fall = () => { if (!_s || _s !== s) return; _draw(); if (performance.now() / 1000 - _endT < 0.75) _raf = requestAnimationFrame(fall); else _overlay(why, isBest && s.score > 0 ? 'best' : 'again'); };
    _raf = requestAnimationFrame(fall);
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
    const P = v => v * H, t = s.t, now = performance.now() / 1000, A = W / H;
    // the sky turns slowly from morning to sunset as the flight goes on
    const dusk = Math.min(1, s.t / 120);
    const sky = g.createLinearGradient(0, 0, 0, P(T.ground));
    sky.addColorStop(0, _mix('#7dd3fc', '#6366f1', dusk)); sky.addColorStop(0.65, _mix('#bae6fd', '#f472b6', dusk)); sky.addColorStop(1, _mix('#fef3c7', '#fdba74', dusk));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // the sun, sinking as it gets late
    const sy = P(0.16 + dusk * 0.5), sx = W * 0.8;
    const sun = g.createRadialGradient(sx, sy, 4, sx, sy, P(0.12));
    sun.addColorStop(0, '#fffbeb'); sun.addColorStop(0.35, _mix('#fde047', '#fb923c', dusk)); sun.addColorStop(1, 'rgba(253,224,71,0)');
    g.fillStyle = sun; g.beginPath(); g.arc(sx, sy, P(0.12), 0, 7); g.fill();
    // clouds, two layers drifting at different speeds
    for (const [i, c] of CLOUDS.entries()) {
        const sp = c.far ? 0.012 : 0.03, x = ((c.x - (t * sp * K.mul(s)) % (A + 0.6) + A + 0.6) % (A + 0.6)) - 0.3;
        g.globalAlpha = c.far ? 0.55 : 0.85; g.fillStyle = '#fff';
        for (const [dx, dy, r] of [[0, 0, 0.05], [0.05, -0.02, 0.06], [0.11, 0, 0.045], [0.055, 0.015, 0.05]]) { g.beginPath(); g.arc(P(x + dx * c.k), P(c.y + dy * c.k), P(r * c.k), 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
    // the sea, with waves rolling, and the beach
    const seaTop = P(T.ground) - 22;
    const sea = g.createLinearGradient(0, seaTop, 0, P(T.ground)); sea.addColorStop(0, '#0ea5e9'); sea.addColorStop(1, '#38bdf8');
    g.fillStyle = sea; g.fillRect(0, seaTop, W, P(T.ground) - seaTop);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2;
    for (let row = 0; row < 2; row++) {
        g.beginPath();
        for (let x = 0; x <= W; x += 6) { const y = seaTop + 6 + row * 8 + Math.sin(x / 18 + now * 2 + row * 2) * 2; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
    }
    const sand = g.createLinearGradient(0, P(T.ground), 0, H); sand.addColorStop(0, '#fde68a'); sand.addColorStop(1, '#f59e0b');
    g.fillStyle = sand; g.fillRect(0, P(T.ground), W, H - P(T.ground));
    // things on the beach scrolling by: umbrellas and a sandcastle
    g.font = `${Math.round(H * 0.045)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (const [i, e] of ['⛱️', '🏰', '⛱️', '🐚', '⛱️'].entries()) {
        const span = A + 0.4, x = (((i * 0.37 - t * T.speed * K.mul(s) * 0.9) % span) + span) % span - 0.2;
        g.fillText(e, P(x), H - 6);
    }
    // gust streaks: longer and faster the stronger the wind
    for (const st of s.streaks) {
        const len = 14 + Math.abs(s.wind) * 26;
        g.strokeStyle = s.wind > 0.1 ? 'rgba(255,255,255,.75)' : s.wind < -0.1 ? 'rgba(30,41,59,.25)' : 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(P(st.x), P(st.y)); g.quadraticCurveTo(P(st.x) + len / 2, P(st.y) + s.wind * 6, P(st.x) + len, P(st.y) + s.wind * 14); g.stroke();
    }
    const kx = KITE_X * W, ky = P(s.y);
    // rings: the back half first, so the kite flies through them
    const ring = (o, front) => {
        const x = P(o.x), y = P(o.y), rx = P(T.ringR) * 0.42, ry = P(T.ringR);
        const glow = o.done ? 0 : 0.5 + 0.5 * Math.sin(now * 5 + o.x * 9);
        g.strokeStyle = o.done ? 'rgba(74,222,128,.0)' : o.missed ? 'rgba(148,163,184,.8)' : `rgba(245,158,11,1)`; g.lineWidth = 7;
        if (!o.done) { g.shadowColor = '#fde047'; g.shadowBlur = 8 * glow; }
        g.beginPath(); g.ellipse(x, y, rx, ry, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : Math.PI * 1.5); g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = o.missed ? 'rgba(203,213,225,.6)' : 'rgba(254,243,199,.9)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, y, rx, ry, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : Math.PI * 1.5); g.stroke();
    };
    for (const o of s.things) if (o.kind === 'ring' && !o.done) ring(o, false);
    // gulls, flapping
    for (const o of s.things) {
        if (o.kind !== 'gull') continue;
        const x = P(o.x), y = P(o.y), w = P(T.gullR) * 1.6, flap = Math.sin(now * 12 + o.ph);
        g.fillStyle = '#f8fafc'; g.strokeStyle = '#334155'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, y, w * 0.45, w * 0.22, 0, 0, 7); g.fill(); g.stroke();
        g.lineWidth = 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - w * 0.1, y); g.quadraticCurveTo(x - w * 0.6, y - w * 0.5 * flap - 4, x - w, y - w * 0.3 * flap); g.stroke();
        g.beginPath(); g.moveTo(x + w * 0.1, y); g.quadraticCurveTo(x + w * 0.6, y - w * 0.5 * flap - 4, x + w, y - w * 0.3 * flap); g.stroke();
        g.fillStyle = '#f59e0b'; g.beginPath(); g.moveTo(x - w * 0.45, y); g.lineTo(x - w * 0.62, y + 2); g.lineTo(x - w * 0.45, y + 4); g.fill();
        g.fillStyle = '#0f172a'; g.beginPath(); g.arc(x - w * 0.3, y - 2, 1.6, 0, 7); g.fill();
    }
    // the string from the flyer on the sand
    const tumble = s.over && s.why ? Math.min(1, (now - _endT) / 0.7) : 0, fall = tumble * tumble * (P(T.ground) - ky + 10);
    const kyy = ky + fall;
    g.font = `${Math.round(H * 0.05)}px sans-serif`; g.fillText('🧒', 22, P(T.ground) + H * 0.035);
    g.strokeStyle = 'rgba(43,18,64,.55)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(30, P(T.ground) - 4);
    g.quadraticCurveTo(kx * 0.45, P(T.ground) - 10 - Math.max(0, P(T.ground) - kyy) * 0.15, kx, kyy); g.stroke();
    // the tail: a rope with bows, swinging behind
    g.strokeStyle = '#ec4899'; g.lineWidth = 2.5; g.beginPath();
    const tail = [];
    s.trail.forEach((ty, i) => { const x = kx - 4 - i * 6, y = P(ty) + fall + 14 + Math.sin(now * 9 - i * 0.7) * (2 + i * 0.4); tail.push([x, y]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    tail.forEach(([x, y], i) => { if (i % 3 === 2) { g.fillStyle = ['#facc15', '#22d3ee', '#a3e635'][(i / 3 | 0) % 3]; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 5, y - 4); g.lineTo(x - 5, y + 4); g.closePath(); g.moveTo(x, y); g.lineTo(x + 5, y - 4); g.lineTo(x + 5, y + 4); g.closePath(); g.fill(); } });
    // the kite: a diamond with a cross spar, tilting with its climb (spinning as it falls)
    const r = P(T.kiteR) * 1.35, tilt = tumble ? tumble * 7 : Math.max(-0.5, Math.min(0.5, s.vy * 0.6)) + Math.sin(now * 3) * 0.05;
    g.save(); g.translate(kx, kyy); g.rotate(tilt);
    g.fillStyle = '#ef4444'; g.strokeStyle = '#2b1240'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -r * 1.35); g.lineTo(r, -r * 0.15); g.lineTo(0, r * 1.35); g.lineTo(-r, -r * 0.15); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#facc15'; g.beginPath(); g.moveTo(0, -r * 1.35); g.lineTo(r, -r * 0.15); g.lineTo(0, -r * 0.15); g.closePath(); g.fill();
    g.fillStyle = '#3b82f6'; g.beginPath(); g.moveTo(0, r * 1.35); g.lineTo(-r, -r * 0.15); g.lineTo(0, -r * 0.15); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(43,18,64,.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -r * 1.35); g.lineTo(0, r * 1.35); g.moveTo(-r, -r * 0.15); g.lineTo(r, -r * 0.15); g.stroke();
    if (!tumble) { g.fillStyle = "#2b1240"; for (const ex of [-0.32, 0.32]) { g.beginPath(); g.arc(ex * r, -r * 0.45, 2, 0, 7); g.fill(); } g.strokeStyle = '#2b1240'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, -r * 0.3, r * 0.22, 0.2, Math.PI - 0.2); g.stroke(); }
    g.restore();
    // ring fronts (over the kite), and the catches: a ring bursting outward, sparkles, the points
    for (const o of s.things) if (o.kind === 'ring' && !o.done) ring(o, true);
    _pops = _pops.filter(p => now - p.t < 0.9);
    for (const p of _pops) {
        const k = (now - p.t) / 0.9, x = P(p.x), y = P(p.y);
        g.strokeStyle = `rgba(253,224,71,${1 - k})`; g.lineWidth = 6 * (1 - k);
        g.beginPath(); g.ellipse(x, y, P(T.ringR) * (0.42 + k * 1.2), P(T.ringR) * (1 + k * 1.4), 0, 0, 7); g.stroke();
        for (let i = 0; i < 8; i++) { const a = i * 0.785 + p.t, d = P(T.ringR) * (0.6 + k * 2.2); g.fillStyle = `rgba(255,255,255,${1 - k})`; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.5 * (1 - k) + 1, 0, 7); g.fill(); }
        g.globalAlpha = 1 - k; g.fillStyle = p.combo > 4 ? '#fde047' : '#fff'; g.strokeStyle = '#2b1240'; g.lineWidth = 4;
        g.font = `900 ${Math.round(H * (p.combo > 4 ? 0.042 : 0.034))}px Nunito, sans-serif`; g.textAlign = 'center';
        g.strokeText(`+${p.pts}`, x, y - P(T.ringR) - k * 26); g.fillText(`+${p.pts}`, x, y - P(T.ringR) - k * 26);
        g.globalAlpha = 1;
    }
    // score, combo meter, wind sock
    g.textAlign = 'right'; g.fillStyle = '#fff'; g.strokeStyle = '#2b1240'; g.lineWidth = 5; g.font = `900 ${Math.round(H * 0.05)}px Nunito, sans-serif`;
    g.strokeText(`${s.score}`, W - 12, 38); g.fillText(`${s.score}`, W - 12, 38);
    if (s.combo > 1) {
        const pulse = 1 + 0.08 * Math.sin(now * 8);
        g.save(); g.translate(W - 12, 62); g.scale(pulse, pulse);
        g.font = `900 ${Math.round(H * 0.03)}px Nunito, sans-serif`; g.fillStyle = s.combo > 4 ? '#fde047' : '#fff'; g.lineWidth = 4;
        g.strokeText(`COMBO ×${s.combo}`, 0, 0); g.fillText(`COMBO ×${s.combo}`, 0, 0); g.restore();
    }
    // the wind sock: points the way the wind blows (up or down), fuller the stronger it is
    g.save(); g.translate(18, 22);
    g.strokeStyle = '#475569'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 22); g.stroke();
    const sock = Math.max(-1, Math.min(1, s.wind / T.gust)), ang = -sock * 0.9 + Math.sin(now * 6) * 0.08;
    g.rotate(ang);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#fff' : '#ef4444'; const l = 6 + Math.abs(sock) * 4; g.fillRect(i * l, -4 + i * 0.6, l, 8 - i * 1.2); }
    g.restore();
}

/** Probes: the flight, and a way to put something right in front of the kite. */
export const _debug = () => (_s ? { y: _s.y, vy: _s.vy, score: _s.score, combo: _s.combo, rings: _s.rings, over: _s.over, why: _s.why } : null);
export function _place(kind, dy = 0) { if (!_s) return; _s.things.push({ kind, x: 0.3 * _W / _H + 0.005, y: _s.y + dy, ph: 0 }); }
export function _calm() { if (_s) { _s.wind = 0; _s.windTo = 0; _s.windT = 99; } }
