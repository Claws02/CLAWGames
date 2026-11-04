// ============================================================
// CORAL MERGE — the screen. Physics and rules: CoralPhysics.js.
//
// Move your finger along the tank to aim, let go to drop. Creatures fall,
// roll and settle; two of a kind that touch merge into the next one up
// (🐚 → 🐌 → 🦐 → 🦀 → 🐙 → 🐠 → 🐢 → 🐬 → 🐳 → 💎). Merges close together are
// a combo. A 🫧 bubble pops soon after it lands and lifts the pile. Keep
// everything below the line.
//
// The juice: squash and stretch on landing, a springy pop for every new
// creature, a blink, a guide line and glowing rings on the ones you can merge
// with, particles, score pops, combo banners, screen shake that grows with
// the size of the merge, and a celebration for every new biggest creature.
// ============================================================
import { create, drop, step, bodies, clampX, canDrop, KINDS, NAMES, RADII, COLORS, TANK_W, TANK_H, LINE_Y, DROP_Y, BUBBLE, BUBBLE_R, TOP } from './CoralPhysics.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'coral', icon: '🐳', title: 'Coral Merge', blurb: 'Drop sea creatures into the tank. Two alike that touch merge into something bigger!' };
const BEST = 'coralDrop';
const TOP_VIEW = -0.25;                      // a little room above the drop point

let _el = null, _cv = null, _cx = null, _s = 1, _g = null, _raf = 0, _offs = [], _aim = TANK_W / 2, _last = 0;
let _vis = new Map(), _parts = [], _pops = [], _banner = null, _shake = 0, _paused = false, _fresh = null, _bursts = 0;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _buzz = p => { try { Audio.haptic(p); } catch (e) {} };

export function bestText() { const b = Solo.best(BEST); return b == null ? '' : `best ${b} pts${Solo.best('coralTop') != null ? ` · up to ${KINDS[Solo.best('coralTop')]}` : ''}`; }

export function mount(el) {
    _el = el;
    el.innerHTML = `
        <div class="cm-top"><span class="cm-score bfont" id="cm-score">0</span>
            <span class="cm-next">NEXT <b id="cm-next"></b><i id="cm-after"></i></span>
            <span class="cm-best" id="cm-best"></span></div>
        <div class="pd-wrap"><canvas class="cm-cv" id="cm-cv"></canvas>
            <div class="pd-over" id="cm-over" hidden><div class="pd-card">
                <div class="cs-done-h bfont">🌊 TANK FULL!</div>
                <div class="pd-t" id="cm-over-t"></div>
                <div class="cs-done-best" id="cm-over-best"></div>
                <button class="go-btn bfont" id="btn-cm-again">PLAY AGAIN</button>
            </div></div></div>
        <div class="cm-ladder" id="cm-ladder"></div>`;
    _cv = el.querySelector('#cm-cv'); _cx = _cv.getContext('2d');
    _size();
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
    let down = false;
    on(_cv, 'pointerdown', e => { e.preventDefault(); down = true; _aimAt(e); }, { passive: false });
    on(_cv, 'pointermove', e => _aimAt(e));
    on(window, 'pointerup', e => { if (!down) return; down = false; _aimAt(e); dropHere(); });
    on(window, 'keydown', e => {
        if (e.key === 'ArrowLeft') _aim = clampX(_g, _aim - 0.25);
        else if (e.key === 'ArrowRight') _aim = clampX(_g, _aim + 0.25);
        else if (e.key === ' ') { e.preventDefault(); dropHere(); }
    });
    on(window, 'resize', () => _size());
    on(document, 'visibilitychange', () => { _paused = document.hidden; _last = performance.now(); });
    el.querySelector('#btn-cm-again').addEventListener('click', () => start());
    start();
}

export function unmount() { cancelAnimationFrame(_raf); _raf = 0; _offs.splice(0).forEach(off => off()); _el = null; _g = null; }

function _size() {
    const w = Math.min(_el.clientWidth || 360, 480, ((window.innerHeight || 700) * 0.66) * TANK_W / (TANK_H - TOP_VIEW));
    const h = w * (TANK_H - TOP_VIEW) / TANK_W, dpr = Math.min(window.devicePixelRatio || 1, 2);
    _cv.width = Math.round(w * dpr); _cv.height = Math.round(h * dpr);
    _cv.style.width = `${w}px`; _cv.style.height = `${h}px`;
    _cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _s = w / TANK_W;
}

function _aimAt(e) {
    if (!_g) return;
    const r = _cv.getBoundingClientRect();
    _aim = clampX(_g, (e.clientX - r.left) / _s);
}

/** A new tank. rnd: the next-creature random (probes pass a seeded one). */
export function start(rnd = Math.random) {
    _g = create(rnd); _vis = new Map(); _parts = []; _pops = []; _banner = null; _shake = 0; _aim = TANK_W / 2; _fresh = null;
    _el.querySelector('#cm-over').hidden = true;
    _hud();
    cancelAnimationFrame(_raf);
    _last = performance.now();
    const tick = now => {
        if (!_g) return;
        const dt = Math.min(0.05, (now - _last) / 1000); _last = now;
        if (!_paused && !_g.over) { _events(step(_g, dt)); }
        _animate(dt);
        _draw();
        _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}

/** Drop the next creature where you're aiming. */
export function dropHere(x = _aim) {
    if (!_g || !canDrop(_g)) return null;
    const b = drop(_g, x);
    if (b) { _sfx(b.getUserData().kind === BUBBLE ? 'shield' : 'swap'); _buzz(8); _hud(); }
    return b;
}

// ---- what the physics reports, turned into juice ----------------------------------
function _events(evs) {
    for (const e of evs) {
        if (e.type === 'land') { const v = _v(e.id); v.sq = Math.max(v.sq, e.power * 0.32); v.sqv = 0; if (e.power > 0.5) _sfx('dice_land'); }
        else if (e.type === 'merge') {
            const v = _v(e.id); v.born = 0;     // springs in
            _burst(e.x, e.y, COLORS[e.kind], 10 + e.kind * 3, 1 + e.kind * 0.25);
            _pops.push({ x: e.x, y: e.y - RADII[e.kind], text: `+${e.points}`, t: 0, big: e.kind >= 5 });
            if (e.combo >= 2) _banner = { text: `COMBO ×${e.combo}!`, t: 0, color: '#fde047' };
            if (e.kind >= 4) _shake = Math.min(14, 3 + e.kind * 1.4);
            if (e.newBest && e.kind >= 3) {
                _banner = { text: `NEW: ${KINDS[e.kind]} ${NAMES[e.kind].toUpperCase()}!`, t: 0, color: '#fff', big: true };
                _confetti();
                _sfx('win'); _buzz([40, 30, 60, 30, 120]);
            } else { _sfx(e.combo >= 3 ? 'coin_gain' : 'land_good'); _buzz(e.kind >= 5 ? [30, 20, 60] : 15); }
            if (e.kind === 6) Solo.bump('coralTurtle');
            _hud();
        } else if (e.type === 'treasure') {
            _burst(e.x, e.y, '#facc15', 50, 3); _confetti(); _shake = 16;
            _pops.push({ x: e.x, y: e.y, text: `+${e.points}`, t: 0, big: true });
            _banner = { text: '💎💎 TREASURE BURST!', t: 0, color: '#fde047', big: true };
            _sfx('win'); _buzz([60, 40, 60, 40, 200]); _hud();
        } else if (e.type === 'pop') {
            _pops.push({ x: e.x, y: e.y, ring: true, t: 0 });
            _burst(e.x, e.y, 'rgba(224,242,254,.95)', 16, 1.6);
            _sfx('boost'); _buzz([20, 20, 20]);
        } else if (e.type === 'over') _end();
    }
}
function _v(id) { let v = _vis.get(id); if (!v) { v = { sq: 0, sqv: 0, born: 0, blink: 2 + Math.random() * 4, bt: 0, ph: Math.random() * 6 }; _vis.set(id, v); } return v; }

function _burst(x, y, color, n, speed) {
    _bursts++;
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (0.8 + Math.random() * 2.2) * speed;
        _parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 0.5 + Math.random() * 0.5, t: 0, color, r: 0.05 + Math.random() * 0.08 });
    }
}
function _confetti() {
    const cols = ['#f472b6', '#facc15', '#4ade80', '#60a5fa', '#fb923c', '#c084fc'];
    for (let i = 0; i < 60; i++) _parts.push({ x: Math.random() * TANK_W, y: TOP_VIEW, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 3, life: 1.6 + Math.random(), t: 0, color: cols[i % cols.length], r: 0.06, flat: true, spin: Math.random() * 6 });
}

function _animate(dt) {
    for (const v of _vis.values()) {
        // squash spring
        v.sqv += (-170 * v.sq - 12 * v.sqv) * dt; v.sq += v.sqv * dt;
        v.born = Math.min(1, v.born + dt * 4);
        v.blink -= dt; if (v.blink <= 0) { v.bt = 0.13; v.blink = 2.5 + Math.random() * 4; }
        v.bt = Math.max(0, v.bt - dt);
    }
    for (const p of _parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.flat ? 1.2 : 6) * dt; }
    _parts = _parts.filter(p => p.t < p.life);
    for (const p of _pops) p.t += dt;
    _pops = _pops.filter(p => p.t < (p.ring ? 0.5 : 1));
    if (_banner) { _banner.t += dt; if (_banner.t > 1.4) _banner = null; }
    _shake = Math.max(0, _shake - dt * 40);
}

// ---- drawing ------------------------------------------------------------------------
const _ease = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };   // easeOutBack

function _draw() {
    const c = _cx, s = _s, W = TANK_W * s, H = (TANK_H - TOP_VIEW) * s;
    if (!c || !_g) return;
    const X = x => x * s, Y = y => (y - TOP_VIEW) * s;
    c.save();
    if (_shake) c.translate((Math.random() - 0.5) * _shake, (Math.random() - 0.5) * _shake);
    // water, light rays, sand, weed
    const sea = c.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#7dd3fc'); sea.addColorStop(1, '#1d4ed8');
    c.fillStyle = sea; c.fillRect(-20, -20, W + 40, H + 40);
    c.fillStyle = 'rgba(255,255,255,.07)';
    for (let i = 0; i < 4; i++) { const x = ((i * 0.27 + _g.t * 0.01) % 1) * W; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + W * 0.12, 0); c.lineTo(x - W * 0.1, H); c.lineTo(x - W * 0.22, H); c.fill(); }
    c.fillStyle = '#e7c98f'; c.fillRect(0, Y(TANK_H) - 2, W, 8);
    c.strokeStyle = 'rgba(34,197,94,.6)'; c.lineWidth = 4;
    for (const [x0, h] of [[0.4, 1.4], [6.5, 1.8], [5.9, 1.1]]) { c.beginPath(); c.moveTo(X(x0), Y(TANK_H)); c.quadraticCurveTo(X(x0 + Math.sin(_g.t * 1.5 + x0) * 0.25), Y(TANK_H - h / 2), X(x0 + Math.sin(_g.t * 1.2 + x0) * 0.3), Y(TANK_H - h)); c.stroke(); }
    // the line
    const warn = _g.danger || 0;
    c.setLineDash([10, 8]); c.lineWidth = 3;
    c.strokeStyle = warn > 0 ? `rgba(239,68,68,${0.6 + 0.4 * Math.sin(_g.t * 18)})` : 'rgba(255,255,255,.55)';
    c.beginPath(); c.moveTo(0, Y(LINE_Y)); c.lineTo(W, Y(LINE_Y)); c.stroke(); c.setLineDash([]);
    // aim: the guide line, matching rings, and the creature waiting to drop
    const next = _g.next, nr = next === BUBBLE ? BUBBLE_R : RADII[next], ax = clampX(_g, _aim);
    if (!_g.over) {
        let floor = TANK_H;
        for (const b of bodies(_g)) { const p = b.getPosition(), r = b.getUserData().r; if (Math.abs(p.x - ax) < r + nr) floor = Math.min(floor, p.y - Math.sqrt(Math.max(0, (r + nr) ** 2 - (p.x - ax) ** 2))); }
        c.setLineDash([4, 6]); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(X(ax), Y(DROP_Y + nr)); c.lineTo(X(ax), Y(floor)); c.stroke(); c.setLineDash([]);
    }
    // creatures
    for (const b of bodies(_g)) {
        const d = b.getUserData(), p = b.getPosition(), v = _v(d.id);
        if (d.kind === next && next !== BUBBLE && !_g.over) {   // a merge waiting to happen
            c.strokeStyle = `rgba(253,224,71,${0.5 + 0.4 * Math.sin(_g.t * 6)})`; c.lineWidth = 3;
            c.beginPath(); c.arc(X(p.x), Y(p.y), X(d.r) + 5, 0, 7); c.stroke();
        }
        _creature(c, X(p.x), Y(p.y), X(d.r), d.kind, b.getAngle(), v);
    }
    if (!_g.over && canDrop(_g)) _creature(c, X(ax), Y(DROP_Y), X(nr), next, 0, { sq: 0, born: 1, bt: 0, ph: 0, ghost: true });
    // particles, score pops, rings
    for (const p of _parts) {
        c.globalAlpha = Math.max(0, 1 - p.t / p.life); c.fillStyle = p.color;
        if (p.flat) { c.save(); c.translate(X(p.x), Y(p.y)); c.rotate(p.spin + p.t * 8); c.fillRect(-4, -2, 8, 4); c.restore(); }
        else { c.beginPath(); c.arc(X(p.x), Y(p.y), X(p.r), 0, 7); c.fill(); }
    }
    c.globalAlpha = 1;
    for (const p of _pops) {
        if (p.ring) { c.strokeStyle = `rgba(255,255,255,${1 - p.t * 2})`; c.lineWidth = 4; c.beginPath(); c.arc(X(p.x), Y(p.y), X(0.4 + p.t * 5.5), 0, 7); c.stroke(); continue; }
        c.globalAlpha = Math.max(0, 1 - p.t); c.fillStyle = '#fff'; c.strokeStyle = '#2b1240'; c.lineWidth = 4;
        c.font = `900 ${p.big ? 26 : 18}px Nunito, sans-serif`; c.textAlign = 'center';
        const y = Y(p.y) - p.t * 50; c.strokeText(p.text, X(p.x), y); c.fillText(p.text, X(p.x), y);
        c.globalAlpha = 1;
    }
    if (_banner) {
        const k = Math.min(1, _banner.t * 5), sc = _ease(k), a = _banner.t > 1 ? 1 - (_banner.t - 1) / 0.4 : 1;
        c.save(); c.globalAlpha = Math.max(0, a); c.translate(W / 2, H * 0.32); c.scale(sc, sc);
        c.font = `900 ${_banner.big ? 30 : 34}px "Bebas Neue", Nunito, sans-serif`; c.textAlign = 'center'; c.lineWidth = 7;
        c.strokeStyle = '#2b1240'; c.strokeText(_banner.text, 0, 0); c.fillStyle = _banner.color; c.fillText(_banner.text, 0, 0);
        c.restore();
    }
    c.restore();
}

// One creature: a coloured glow, the creature itself, squashed on landing, springing in when new, blinking.
function _creature(c, x, y, r, kind, angle, v) {
    const born = _ease(Math.max(0.001, v.born));
    const sx = (1 + v.sq) * born, sy = (1 - v.sq) * born * (v.bt > 0 ? 0.82 : 1);
    c.save(); c.translate(x, y + r * v.sq * 0.6);
    c.globalAlpha = v.ghost ? 0.75 : 1;
    if (kind === BUBBLE) {
        c.scale(sx, sy);
        c.fillStyle = 'rgba(224,242,254,.45)'; c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(-r * 0.35, -r * 0.35, r * 0.22, 0, 7); c.fill();
        c.restore(); return;
    }
    c.scale(sx, sy);
    const glow = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
    glow.addColorStop(0, '#ffffff'); glow.addColorStop(1, COLORS[kind]);
    c.fillStyle = glow; c.strokeStyle = '#2b1240'; c.lineWidth = Math.max(2, r * 0.08);
    c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.stroke();
    c.rotate(angle + Math.sin((_g ? _g.t : 0) * 2 + v.ph) * 0.05);
    c.fillStyle = '#000';   // an emoji takes the fill's alpha: keep it opaque
    c.font = `${Math.round(r * 1.25)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(KINDS[kind], 0, r * 0.06);
    c.restore(); c.textBaseline = 'alphabetic';
}

function _hud() {
    if (!_el || !_g) return;
    _el.querySelector('#cm-score').textContent = _g.score;
    _el.querySelector('#cm-next').textContent = _g.next === BUBBLE ? '🫧' : KINDS[_g.next];
    _el.querySelector('#cm-after').textContent = _g.after === BUBBLE ? '🫧' : KINDS[_g.after];
    const b = Solo.best(BEST);
    _el.querySelector('#cm-best').textContent = b == null ? '' : `best ${b}`;
    _el.querySelector('#cm-ladder').innerHTML = KINDS.map((k, i) => `<span class="${i <= _g.best ? 'got' : ''}" title="${NAMES[i]}">${k}</span>`).join('<i>›</i>');
}

function _end() {
    Solo.bump('coralGames');
    const isBest = Solo.record(BEST, _g.score, 'high');
    Solo.record('coralTop', _g.best, 'high');
    _sfx(isBest && _g.score ? 'win' : 'mg_lose'); Solo.won();
    _el.querySelector('#cm-over').hidden = false;
    _el.querySelector('#cm-over-t').innerHTML = `<b class="pd-score">${_g.score}</b> points · biggest: ${KINDS[_g.best]} ${NAMES[_g.best]}`;
    _el.querySelector('#cm-over-best').textContent = isBest && _g.score ? '🏅 NEW BEST!' : `Best: ${Solo.best(BEST)} points`;
}

/** Probes: the tank, and the game itself (to choose what drops next). */
export const _debug = () => (_g ? { score: _g.score, drops: _g.drops, next: _g.next, over: _g.over, best: _g.best, kinds: bodies(_g).map(b => b.getUserData().kind), parts: _parts.length, bursts: _bursts, banner: _banner && _banner.text } : null);
export const _game = () => _g;
