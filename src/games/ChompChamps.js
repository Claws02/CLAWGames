// ============================================================
// CHOMP CHAMPS — gobble your colour, two players on one phone.
//
// A round tabletop arena with a gobbler at each end: each player's own
// character. Balls pour in and roll around. TAP your half and your gobbler
// lunges in and CHOMPS whatever's in reach:
//   your colour (P1 red, P2 blue)  +1
//   the other colour               −1
//   🌟 gold                         +3
//   💣 bomb                         stunned for 2 seconds
// A chomp takes a moment to recover, so timing beats mashing. 45 seconds;
// the higher score wins.
//
// One canvas, face-off hold (player 2 reads their end upside down), the
// claw-core minigame contract (R1–R7). Bot: chomps when what its jaws would
// catch is worth it; lower skill reacts slower and misjudges more.
// ============================================================
import { state } from '../AppHost.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { registerMinigameCleanup } from '../claw-core/minigames/MinigameManager.js';
import * as Pieces from './board/Pieces.js';

// ── Rules ───────────────────────────────────────────────────────────────────
export const GAME_TIME = 45, STUN = 2;
export const KINDS = ['red', 'blue', 'gold', 'bomb'];
const MIX = [0.44, 0.44, 0.05, 0.07];            // how often each kind rolls in
const EXTEND = 0.11, RETRACT = 0.22, RECOVER = 0.42;   // a chomp's beats (s)
const CAP = 24;                                  // balls on the table at most
/** What a ball is worth to player p (0 red's, 1 blue's): points, or 'stun'. */
export const worth = (kind, p) => (kind === 'gold' ? 3 : kind === 'bomb' ? 'stun' : (kind === (p ? 'blue' : 'red') ? 1 : -1));
/** A random kind, by MIX. */
export function rollKind(rnd = Math.random) {
    let r = rnd();
    for (let i = 0; i < KINDS.length; i++) { if (r < MIX[i]) return KINDS[i]; r -= MIX[i]; }
    return 'red';
}
/** How the bot rates a mouthful: the points, a bomb a heavy minus. */
export const value = (kinds, p) => kinds.reduce((s, k) => { const w = worth(k, p); return s + (w === 'stun' ? -2.5 : w); }, 0);

// ── Module state ─────────────────────────────────────────────────────────────
let _done = false, _over = false, _onWin = null, _isBot = false, _botSkill = 0.55;
let _overlay = null, _canvas = null, _ctx = null, _af = null, _last = 0;
let _w = 0, _h = 0, _cx = 0, _cy = 0, _R = 100, _dpr = 1;
let _balls = [], _g = [], _clock = GAME_TIME, _spawnT = 0, _floats = [], _faces = [];
const _timers = [], _cleanups = [];
const _after = (fn, ms) => { const id = setTimeout(() => { if (!_done) fn(); }, ms); _timers.push(id); return id; };

export function start(isBot, onWin, botSkill = 0.55) {
    if (!state.mgActive) return;
    _done = false; _over = false; _onWin = onWin; _isBot = isBot; _botSkill = botSkill;
    _balls = []; _floats = []; _clock = GAME_TIME; _spawnT = 0; _last = 0;
    _g = [0, 1].map(p => ({ p, score: 0, t: -1, ate: false, stun: 0, want: -1, open: 0 }));
    registerMinigameCleanup(_destroy);   // R3
    Pieces.prepare(2);
    _faces = [0, 1].map(p => { const url = Pieces.faceUrl(p); if (!url) return null; const im = new Image(); im.src = url; return im; });
    _build();
    const neu = document.getElementById('mg-neutral');
    if (neu) neu.textContent = 'TAP YOUR HALF TO CHOMP';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (_done) return;
        _resize();
        for (let i = 0; i < 10; i++) _spawn(i % 2 ? 1 : -1, true);   // an opening handful
        _af = requestAnimationFrame(_tick);
    }));
}

// ── DOM and input (R2, R5) ──────────────────────────────────────────────────
function _build() {
    const mg = document.getElementById('minigame-layer');
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none;background:#2a1b3d;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
    _canvas = document.createElement('canvas');
    _canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    _overlay.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');
    const on = (el, ev, fn) => { el.addEventListener(ev, fn); _cleanups.push(() => el.removeEventListener(ev, fn)); };
    on(_overlay, 'pointerdown', _press);
    on(_overlay, 'contextmenu', e => e.preventDefault());
    on(window, 'resize', _resize);
    mg.appendChild(_overlay);
}

function _resize() {
    if (!_canvas) return;
    _dpr = Math.min(2, window.devicePixelRatio || 1);
    _w = _overlay.clientWidth || window.innerWidth; _h = _overlay.clientHeight || window.innerHeight;
    _canvas.width = Math.round(_w * _dpr); _canvas.height = Math.round(_h * _dpr);
    _cx = _w / 2; _cy = _h / 2;
    _R = Math.min(_w * 0.46, _h * 0.36);
}

// Bottom half is player 1, top half player 2.
function _press(e) {
    if (_done || _over) return;
    e.preventDefault();
    const r = _overlay.getBoundingClientRect();
    const p = e.clientY - r.top >= r.height / 2 ? 0 : 1;
    if (p === 1 && _isBot) return;
    chomp(p);
}

/** Player p chomps (if they can). */
export function chomp(p) {
    const g = _g[p];
    if (!g || _over || g.stun > 0 || g.t >= 0) return false;
    g.t = 0; g.ate = false;
    sfx('tick'); haptic([8]);
    return true;
}

// ── The gobblers ────────────────────────────────────────────────────────────
// Where player p's head is now: at rest on the rim, lunging in, or coming back.
const _dir = p => (p === 0 ? -1 : 1);            // which way is "in" (screen y)
function _reach(g) {
    if (g.t < 0) return 0;
    if (g.t < EXTEND) return g.t / EXTEND;
    if (g.t < EXTEND + RETRACT) return 1 - (g.t - EXTEND) / RETRACT;
    return 0;
}
const _headR = () => _R * 0.2;
function _head(p, k = _reach(_g[p])) {
    const rest = _cy - _dir(p) * (_R + _R * 0.04), reach = _R * 0.4;
    return { x: _cx, y: rest + _dir(p) * reach * k };
}
/** Where player p's jaws would close if they chomped now: the full reach. */
export const jaws = p => _head(p, 1);

// ── Balls ───────────────────────────────────────────────────────────────────
const _br = () => _R * 0.065;
function _spawn(side = Math.random() < 0.5 ? -1 : 1, quiet = false) {
    if (_balls.length >= CAP) return;
    const a = (side < 0 ? Math.PI : 0) + (Math.random() - 0.5) * 0.5;
    const r = _R - _br() * 1.5;
    const speed = _R * (0.8 + Math.random() * 0.6);
    const toward = a + Math.PI + (Math.random() - 0.5) * 1.0;
    _balls.push({ kind: rollKind(), x: _cx + Math.cos(a) * r, y: _cy + Math.sin(a) * r, vx: Math.cos(toward) * speed, vy: Math.sin(toward) * speed, born: performance.now() });
    if (!quiet) sfx('coin_gain');
}

function _physics(dt) {
    const br = _br();
    for (const b of _balls) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        const f = 1 - 0.18 * dt;
        b.vx *= f; b.vy *= f;
        // Never let the table go still: a gentle nudge when a ball slows right down.
        const sp = Math.hypot(b.vx, b.vy);
        if (sp < _R * 0.22) { const a = Math.random() * Math.PI * 2; b.vx += Math.cos(a) * _R * 0.5 * dt * 4; b.vy += Math.sin(a) * _R * 0.5 * dt * 4; }
        // The rim.
        const dx = b.x - _cx, dy = b.y - _cy, d = Math.hypot(dx, dy), lim = _R - br;
        if (d > lim) {
            const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
            b.x = _cx + nx * lim; b.y = _cy + ny * lim;
            if (vn > 0) { b.vx -= 1.85 * vn * nx; b.vy -= 1.85 * vn * ny; }
        }
    }
    // Balls bump each other (equal masses).
    for (let i = 0; i < _balls.length; i++) for (let j = i + 1; j < _balls.length; j++) {
        const a = _balls[i], b = _balls[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = br * 2;
        if (d <= 0 || d >= min) continue;
        const nx = dx / d, ny = dy / d, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) { a.vx += rv * nx; a.vy += rv * ny; b.vx -= rv * nx; b.vy -= rv * ny; }
    }
}

// The moment of the snap: everything in the head's circle is swallowed.
function _snap(p) {
    const h = _head(p, 1), hr = _headR() * 1.05, g = _g[p];
    const eaten = _balls.filter(b => Math.hypot(b.x - h.x, b.y - h.y) < hr + _br() * 0.5);
    if (!eaten.length) return;
    _balls = _balls.filter(b => !eaten.includes(b));
    let pts = 0, stun = false;
    for (const b of eaten) { const w = worth(b.kind, p); if (w === 'stun') stun = true; else pts += w; }
    g.score += pts;
    if (pts) _float(p, (pts > 0 ? '+' : '') + pts, pts > 0 ? '#2fd67b' : '#ff5c5c');
    if (stun) { g.stun = STUN; _float(p, '💫 STUNNED', '#ffd200'); sfx('land_bad'); haptic([40, 30, 40]); }
    else if (pts > 0) { sfx('coin_gain'); haptic([12]); }
    else if (pts < 0) { sfx('land_bad'); haptic([25]); }
}
function _float(p, text, color) { const h = _head(p, 1); _floats.push({ p, text, color, x: h.x, y: h.y, t: 0 }); }

// ── The bot ─────────────────────────────────────────────────────────────────
function _bot(dt) {
    const g = _g[1];
    if (!_isBot || g.stun > 0 || g.t >= 0) return;
    const h = jaws(1), hr = _headR() * 1.05, lead = EXTEND;
    // What it would catch: where each ball will be when the jaws close.
    const inReach = _balls.filter(b => Math.hypot(b.x + b.vx * lead - h.x, b.y + b.vy * lead - h.y) < hr).map(b => b.kind);
    const v = value(inReach, 1);
    const sloppy = Math.random() < (1 - _botSkill) * 0.012;   // now and then, a chomp at nothing much
    if ((v >= 1 || sloppy) && g.want < 0) g.want = 0.08 + (1 - _botSkill) * 0.35 + Math.random() * 0.08;
    if (g.want >= 0) {
        g.want -= dt;
        if (g.want < 0) {
            // Still worth it after the reaction time? A sharp bot checks again; a sloppy one just goes.
            const again = _balls.filter(b => Math.hypot(b.x - h.x, b.y - h.y) < hr * 1.1).map(b => b.kind);
            if (value(again, 1) >= 1 || Math.random() > _botSkill) chomp(1);
            g.want = -1;
        }
    }
}

// ── The loop ─────────────────────────────────────────────────────────────────
function _tick(now) {
    if (_done) return;
    const dt = _last ? Math.min(0.033, (now - _last) / 1000) : 0;
    _last = now;
    if (!_over) {
        _clock -= dt;
        _spawnT -= dt;
        if (_spawnT <= 0) { _spawn(); _spawnT = 0.42 + Math.random() * 0.2; }
        _physics(dt);
        for (const g of _g) {
            if (g.stun > 0) g.stun = Math.max(0, g.stun - dt);
            if (g.t >= 0) {
                const was = g.t;
                g.t += dt;
                if (was < EXTEND && g.t >= EXTEND && !g.ate) { g.ate = true; _snap(g.p); }
                if (g.t >= RECOVER) g.t = -1;
            }
        }
        _bot(dt);
        if (_clock <= 0) _end();
    }
    _floats.forEach(f => { f.t += dt; });
    _floats = _floats.filter(f => f.t < 1.1);
    _draw();
    _af = requestAnimationFrame(_tick);
}

function _end() {
    _over = true; _clock = 0;
    const [a, b] = _g.map(g => g.score);
    const winner = a === b ? -1 : a > b ? 0 : 1;
    sfx(winner < 0 ? 'land_bad' : 'mg_win'); haptic('heavy');
    _after(() => _finish(winner, [a, b]), 2600);
}

function _finish(winner, standings) {
    if (_done) return;
    _done = true;
    state.mgActive = false;
    _destroy();
    _onWin(winner, undefined, standings);
}

// ── Drawing ─────────────────────────────────────────────────────────────────
const COLOR = { red: '#ff4d6d', blue: '#3b9dff', gold: '#ffd200', bomb: '#2b2b33' };
const _hex = p => state.players?.[p]?.hex || (p ? '#3b9dff' : '#ff4d6d');

function _draw() {
    const c = _ctx;
    if (!c) return;
    c.setTransform(_dpr, 0, 0, _dpr, 0, 0);
    // The table and its two ends.
    const bg = c.createLinearGradient(0, 0, 0, _h);
    bg.addColorStop(0, '#20314f'); bg.addColorStop(0.5, '#3a2552'); bg.addColorStop(1, '#4a2238');
    c.fillStyle = bg; c.fillRect(0, 0, _w, _h);
    [0, 1].forEach(p => { c.fillStyle = _hex(p) + '22'; c.fillRect(0, p ? 0 : _h / 2, _w, _h / 2); });
    // The arena: a rim, a felt floor, a target ring.
    c.beginPath(); c.arc(_cx, _cy, _R + _R * 0.09, 0, Math.PI * 2); c.fillStyle = '#f2c14e'; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#3f2a18'; c.stroke();
    const fl = c.createRadialGradient(_cx, _cy - _R * 0.3, _R * 0.1, _cx, _cy, _R);
    fl.addColorStop(0, '#7ce0b0'); fl.addColorStop(1, '#2f9e7a');
    c.beginPath(); c.arc(_cx, _cy, _R, 0, Math.PI * 2); c.fillStyle = fl; c.fill();
    c.beginPath(); c.arc(_cx, _cy, _R * 0.35, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 3; c.setLineDash([8, 8]); c.stroke(); c.setLineDash([]);
    // Inlets at each side.
    [-1, 1].forEach(s => { c.beginPath(); c.arc(_cx + s * _R, _cy, _R * 0.1, 0, Math.PI * 2); c.fillStyle = '#3f2a18'; c.fill(); });
    // Balls.
    const br = _br();
    for (const b of _balls) {
        c.beginPath(); c.arc(b.x, b.y + br * 0.25, br, 0, Math.PI * 2); c.fillStyle = 'rgba(0,0,0,.25)'; c.fill();
        const gr = c.createRadialGradient(b.x - br * 0.35, b.y - br * 0.35, br * 0.1, b.x, b.y, br);
        gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, COLOR[b.kind]); gr.addColorStop(1, b.kind === 'bomb' ? '#000' : COLOR[b.kind]);
        c.beginPath(); c.arc(b.x, b.y, br, 0, Math.PI * 2); c.fillStyle = gr; c.fill();
        c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,.45)'; c.stroke();
        if (b.kind === 'gold' || b.kind === 'bomb') { c.font = `${br * 1.2}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.kind === 'gold' ? '🌟' : '💣', b.x, b.y + br * 0.05); }
    }
    // The gobblers.
    [0, 1].forEach(p => _drawGobbler(p));
    // Floating +1s.
    for (const f of _floats) {
        c.save(); c.translate(f.x, f.y + _dir(f.p) * f.t * _R * 0.25); if (f.p === 1) c.rotate(Math.PI);
        c.globalAlpha = Math.max(0, 1 - f.t / 1.1);
        c.font = `bold ${_R * 0.16}px 'Bebas Neue', Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 5; c.strokeStyle = '#1b1024'; c.strokeText(f.text, 0, 0); c.fillStyle = f.color; c.fillText(f.text, 0, 0);
        c.restore();
    }
    // Scores and the clock, at each end (player 2's upside down).
    [0, 1].forEach(p => {
        c.save();
        // Clear of the arena and of the manager's status pill at the very edge.
        const edge = Math.max(_cy + _R * 1.04 + _headR() * 1.2, _h * 0.8);
        c.translate(_cx, p ? _h - edge : edge); if (p === 1) c.rotate(Math.PI);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const big = Math.min(_w * 0.09, 40), small = Math.min(_w * 0.038, 17), fit = _w * 0.92;
        c.font = `bold ${big}px 'Bebas Neue', Impact, sans-serif`;
        const name = (state.players?.[p]?.name || (p ? 'P2' : 'P1')).toUpperCase();
        const txt = `${name} · ${_g[p].score}${_over ? '' : `   ⏱ ${Math.ceil(_clock)}`}`;
        c.lineWidth = 6; c.strokeStyle = '#1b1024'; c.strokeText(txt, 0, 0, fit); c.fillStyle = _hex(p); c.fillText(txt, 0, 0, fit);
        if (!_over) {
            c.font = `bold ${small}px Nunito, sans-serif`; c.fillStyle = '#fff';
            c.fillText(`${p ? 'BLUE' : 'RED'} +1 · ${p ? 'RED' : 'BLUE'} −1 · GOLD +3 · BOMB = STUN`, 0, big * 0.85, fit);
        }
        c.restore();
    });
    if (_over) {
        const [a, b] = _g.map(g => g.score), w = a === b ? -1 : a > b ? 0 : 1;
        [0, 1].forEach(p => {
            c.save(); c.translate(_cx, _cy + (p ? -_R * 0.25 : _R * 0.25)); if (p === 1) c.rotate(Math.PI);
            c.font = `bold ${_R * 0.26}px 'Bebas Neue', Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
            const t = w < 0 ? 'A DRAW!' : w === p ? 'YOU WIN!' : 'CHOMPED!';
            c.lineWidth = 8; c.strokeStyle = '#1b1024'; c.strokeText(t, 0, 0); c.fillStyle = w === p ? '#ffd200' : '#fff'; c.fillText(t, 0, 0);
            c.restore();
        });
    }
}

function _drawGobbler(p) {
    const c = _ctx, g = _g[p], h = _head(p), hr = _headR(), k = _reach(g);
    const inward = _dir(p);                       // the mouth faces the middle
    c.save();
    // A neck back to the rim.
    const rest = _head(p, 0);
    c.strokeStyle = _hex(p); c.lineWidth = hr * 0.9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(rest.x, rest.y - inward * hr * 0.4); c.lineTo(h.x, h.y); c.stroke();
    // The head: the player's character in their colour.
    c.beginPath(); c.arc(h.x, h.y, hr, 0, Math.PI * 2); c.fillStyle = _hex(p); c.fill();
    const im = _faces[p];
    if (im && im.complete && im.naturalWidth) {
        c.save(); c.beginPath(); c.arc(h.x, h.y, hr * 0.92, 0, Math.PI * 2); c.clip();
        if (p === 1) { c.translate(h.x, h.y); c.rotate(Math.PI); c.translate(-h.x, -h.y); }
        c.drawImage(im, h.x - hr * 0.92, h.y - hr * 0.92, hr * 1.84, hr * 1.84); c.restore();
    }
    c.lineWidth = 4; c.strokeStyle = '#1b1024'; c.stroke();
    // The jaws: open wide while lunging, shut at the snap.
    const open = g.t >= 0 && g.t < EXTEND ? 0.55 + 0.35 * k : 0.12;
    const mid = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
    c.beginPath(); c.moveTo(h.x, h.y); c.arc(h.x, h.y, hr * 1.02, mid - open, mid + open); c.closePath();
    c.fillStyle = '#1b1024'; c.fill();
    // Teeth.
    c.fillStyle = '#fff';
    for (const s of [-1, 1]) {
        const a = mid + s * open * 0.6;
        c.beginPath(); c.arc(h.x + Math.cos(a) * hr * 0.85, h.y + Math.sin(a) * hr * 0.85, hr * 0.1, 0, Math.PI * 2); c.fill();
    }
    if (g.stun > 0) {
        c.globalAlpha = 0.55; c.beginPath(); c.arc(h.x, h.y, hr, 0, Math.PI * 2); c.fillStyle = '#777'; c.fill(); c.globalAlpha = 1;
        c.font = `${hr * 0.8}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('💫', h.x, h.y - inward * hr * 0.9);
    }
    c.restore();
}

// ── Cleanup (R3) ────────────────────────────────────────────────────────────
function _destroy() {
    _done = true;
    _timers.forEach(clearTimeout); _timers.length = 0;
    _cleanups.forEach(f => { try { f(); } catch (e) {} }); _cleanups.length = 0;
    if (_af) { cancelAnimationFrame(_af); _af = null; }
    _ctx = null; _canvas = null;
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _last = 0;
}

/** Probes. */
export function _debugState() { return { over: _over, clock: +_clock.toFixed(2), scores: _g.map(g => g.score), stun: _g.map(g => g.stun), balls: _balls.map(b => b.kind) }; }
/** Probes: put a ball of `kind` right in player p's jaws. */
export function _debugFeed(p, kind) { const h = jaws(p); _balls.push({ kind, x: h.x, y: h.y, vx: 0, vy: 0, born: 0 }); }
/** Probes: an empty table (and no new balls for a moment). */
export function _debugClear() { _balls = []; _spawnT = 1.5; }
