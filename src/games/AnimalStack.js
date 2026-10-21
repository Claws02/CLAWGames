// ============================================================
// ANIMAL STACK — one wobbly pile of cartoon animals, taken in turns.
//
// A CLAWGames-only game (src/games/index.js wires it in), our own take on the
// classic shared-stack game. The phone lies flat between two players and the
// picture turns round to face whoever's up (the TABLETOP hold). Against a bot
// it stays facing the human.
//
// Your turn: the CLAW crane holds an animal over the pile. DRAG anywhere above
// the buttons to slide it, ROTATE turns it 45°, DROP lets go. Then everything
// settles. If ANYTHING falls off the island, whoever dropped last loses. Take
// too long (20 s) and the claw drops it wherever it is.
//
// Physics is planck.js (a Box2D port, vendor/planck-esm.js): every animal is a
// real body built from a few convex shapes, so a giraffe's neck snags and a
// pig rolls. It is stepped at a fixed 60 Hz from the frame's dt (R1).
//
// Bot: for a set of positions and angles it simulates the drop in a copy of
// the world, spread over frames so the game never stalls, and drops where the
// pile moves least and nothing falls. Skill sets how many it tries and how
// far its hand wobbles when it lets go.
// ============================================================

import * as planck from '../../vendor/planck-esm.js';
import { state } from '../AppHost.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import * as MinigameManager from '../claw-core/minigames/MinigameManager.js';

const { Vec2 } = planck;

// ── Tunables (metres, seconds) ──────────────────────────────────────────────
const VIEW_W     = 6.0;     // metres across the screen
const ISLAND_W   = 4.6, ISLAND_TOP = 0.25;
const FALL_Y     = -1.4;    // a body below this has gone into the sea
const FALL_X     = 6;
const AIM_X      = 2.9;     // the claw can reach a little past the island's edge
const HOLD_GAP   = 1.9;     // how far above the pile's top the claw holds the animal
const TURN_TIME  = 20;
const SETTLE_V   = 0.08, SETTLE_W = 0.1, SETTLE_FOR = 0.6, SETTLE_MAX = 7;
const STEP       = 1 / 60;
const FLIP_MS    = 450;
const MAX_DROPS  = 60;      // a pile that never falls is called a draw
const ROT_STEP   = Math.PI / 4;
const BOT_BUDGET_MS = 7;    // simulation time the bot may spend per frame

// ── The cast: convex parts (metres, y up) plus a face, all in body space ────
function ell(rx, ry, cx = 0, cy = 0, n = 8) {
    return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
}
function dome(rx, ry, cy = 0, n = 7) {   // flat-bottomed half ellipse
    return Array.from({ length: n }, (_, i) => { const a = (i / (n - 1)) * Math.PI; return [Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
}
const rect = (w, h, cx = 0, cy = 0) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
const tri  = (a, b, c) => [a, b, c];

export const CAST = [
    { key: 'pig', name: 'PIG', col: '#ff9ec4', dark: '#c45b84',
      parts: [ell(0.62, 0.45), tri([-0.42, 0.3], [-0.2, 0.42], [-0.38, 0.62]), tri([0.2, 0.42], [0.42, 0.3], [0.38, 0.62])],
      eyes: [[-0.2, 0.12], [0.2, 0.12]], snout: [0, -0.1, 0.2, 0.13] },
    { key: 'elephant', name: 'ELEPHANT', col: '#a7b3c6', dark: '#5f6b80',
      parts: [rect(1.3, 0.72, -0.15, 0), ell(0.34, 0.36, 0.62, 0.12), rect(0.18, 0.5, 0.86, -0.18)],
      eyes: [[0.62, 0.22]], ear: [0.38, 0.1, 0.2] },
    { key: 'giraffe', name: 'GIRAFFE', col: '#f7c948', dark: '#b07d12', spots: true,
      parts: [rect(1.0, 0.5, -0.1, -0.3), rect(0.22, 1.0, 0.33, 0.45), rect(0.44, 0.22, 0.45, 0.95)],
      eyes: [[0.52, 1.0]] },
    { key: 'penguin', name: 'PENGUIN', col: '#2f3542', dark: '#11141a', belly: '#f5f6fa',
      parts: [ell(0.36, 0.62)],
      eyes: [[-0.12, 0.3], [0.12, 0.3]], beak: [0, 0.18] },
    { key: 'turtle', name: 'TURTLE', col: '#5cbf6b', dark: '#2b7a3a',
      parts: [dome(0.7, 0.5, -0.2), ell(0.2, 0.17, 0.82, -0.05)],
      eyes: [[0.88, 0.0]], shell: true },
    { key: 'croc', name: 'CROC', col: '#3f9e5a', dark: '#1d5c30',
      parts: [rect(1.5, 0.36, -0.2, 0), [[0.55, -0.18], [1.15, -0.12], [1.15, 0.06], [0.55, 0.18]]],
      eyes: [[0.45, 0.24]], teeth: true },
    { key: 'panda', name: 'PANDA', col: '#f5f6fa', dark: '#2f3542',
      parts: [ell(0.45, 0.45, 0, 0, 8), ell(0.13, 0.13, -0.33, 0.38, 6), ell(0.13, 0.13, 0.33, 0.38, 6)],
      eyes: [[-0.16, 0.08], [0.16, 0.08]], patches: true },
    { key: 'rabbit', name: 'BUNNY', col: '#c9b6ff', dark: '#7e63c9',
      parts: [ell(0.45, 0.38), rect(0.13, 0.5, -0.15, 0.55), rect(0.13, 0.5, 0.15, 0.55)],
      eyes: [[-0.15, 0.08], [0.15, 0.08]], snout: [0, -0.1, 0.07, 0.05] },
    { key: 'cat', name: 'CAT', col: '#ffa94d', dark: '#c26a12',
      parts: [rect(0.8, 0.6), tri([-0.4, 0.3], [-0.08, 0.3], [-0.32, 0.6]), tri([0.08, 0.3], [0.4, 0.3], [0.32, 0.6])],
      eyes: [[-0.17, 0.08], [0.17, 0.08]], whiskers: true },
    { key: 'hedgehog', name: 'HEDGEHOG', col: '#b07a4f', dark: '#6b4527',
      parts: [dome(0.55, 0.45, -0.2)],
      eyes: [[0.3, 0.0]], spikes: true },
    { key: 'frog', name: 'FROG', col: '#7bd65a', dark: '#3c8a22',
      parts: [ell(0.55, 0.32), ell(0.15, 0.15, -0.28, 0.3, 6), ell(0.15, 0.15, 0.28, 0.3, 6)],
      eyes: [[-0.28, 0.32], [0.28, 0.32]], smile: true },
];

// Body-space bounds of each animal, for the hold height and the claw.
CAST.forEach(a => {
    const pts = a.parts.flat();
    a.r = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
});

// ── Module state ────────────────────────────────────────────────────────────
let _done = false, _onWin = null, _isBot = false, _botSkill = 0.55;
let _overlay = null, _frame = null, _canvas = null, _ctx = null, _dpr = 1, _W = 0, _H = 0;
let _af = null, _last = 0, _acc = 0;
let _world = null, _pile = [];          // [{ body, def }]
let _turn = 0, _facing = 0, _phase = 'aim', _drops = 0;
let _held = null;                       // { def, x, angle }
let _next = null, _deck = [];
let _turnLeft = TURN_TIME, _settle = 0, _settleT = 0, _lockUntil = 0;
let _camY = 0, _fallen = null, _loser = -1, _msg = '', _msgT = 0;
let _drag = null;                       // { id, x }
let _bot = null;                        // the bot's search in progress
let _el = {};
const _cleanups = [];
const _timers   = [];

function _after(fn, ms) {
    const id = setTimeout(() => { _timers.splice(_timers.indexOf(id), 1); if (!_done) fn(); }, ms);
    _timers.push(id);
    return id;
}

const _name = p => (state.players?.[p]?.name || (p ? 'P2' : 'P1')).toUpperCase();
const _hex  = p => state.players?.[p]?.hex || (p ? '#3b9dff' : '#ff4d6d');
const _isBotTurn = () => _isBot && _turn === 1;

// For QA probes.
export function _qa() {
    return { phase: _phase, turn: _turn, drops: _drops, pile: _pile.length, held: _held && { key: _held.def.key, x: _held.x, angle: _held.angle },
             facing: _facing, loser: _loser, done: _done, turnLeft: _turnLeft, top: _stackTop(), bot: !!_bot,
             setTurnLeft: v => { _turnLeft = v; },
             lab: { newWorld: _newWorld, addAnimal: _addAnimal, simulate: _simulate, pile: () => _pile, heldDef: () => _held && _held.def, CAST } };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
export function start(isBot, onWin, botSkill = 0.55) {
    if (!state.mgActive) return;
    _done = false; _onWin = onWin; _isBot = isBot; _botSkill = botSkill;
    _last = 0; _acc = 0; _drops = 0; _loser = -1; _fallen = null; _bot = null; _drag = null;
    _deck = []; _next = _draw();
    _world = _newWorld(); _pile = [];
    _camY = 0;
    _turn = Math.random() < 0.5 ? 0 : 1;
    _facing = _isBot ? 0 : _turn;
    MinigameManager.registerMinigameCleanup?.(_destroy);   // R3
    _build();
    _frame.classList.toggle('flip', _facing === 1);
    _newTurn();
    _af = requestAnimationFrame(_tick);
}

function _draw() {
    if (!_deck.length) _deck = CAST.map(a => a).sort(() => Math.random() - 0.5);
    return _deck.pop();
}

// ── The world ───────────────────────────────────────────────────────────────
function _newWorld() {
    const w = new planck.World({ gravity: Vec2(0, -10) });
    const island = w.createBody({ type: 'static', position: Vec2(0, 0) });
    island.createFixture(new planck.Box(ISLAND_W / 2, ISLAND_TOP), { friction: 0.9 });
    return w;
}

function _addAnimal(world, def, x, y, angle) {
    const body = world.createBody({ type: 'dynamic', position: Vec2(x, y), angle, angularDamping: 0.3, linearDamping: 0.05 });
    def.parts.forEach(p => body.createFixture(new planck.Polygon(p.map(([px, py]) => Vec2(px, py))), { density: 1, friction: 0.9, restitution: 0.02 }));
    return body;
}

function _stackTop(pile = _pile) {
    let top = ISLAND_TOP;
    pile.forEach(({ body }) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) {
            const aabb = f.getAABB(0);
            if (aabb.upperBound.y > top) top = aabb.upperBound.y;
        }
    });
    return top;
}

const _fell = b => { const p = b.getPosition(); return p.y < FALL_Y || Math.abs(p.x) > FALL_X; };

// ── DOM (R2) ────────────────────────────────────────────────────────────────
const CSS = `
.as{position:absolute;inset:0;overflow:hidden;touch-action:none;background:#7ec8f0;font-family:Nunito,system-ui,sans-serif;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.as-frame{position:absolute;inset:0;transition:transform ${FLIP_MS}ms cubic-bezier(.5,0,.3,1)}
.as-frame.flip{transform:rotate(180deg)}
.as canvas{position:absolute;inset:0;width:100%;height:100%}
.as-top{position:absolute;left:0;right:0;top:12px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.as-turn{font:24px 'Bebas Neue',Impact,sans-serif;letter-spacing:2px;color:#fff;padding:4px 18px;border-radius:999px;border:3px solid #2d3440}
.as-bar{width:58%;height:8px;border-radius:4px;background:rgba(45,52,64,.25);overflow:hidden}
.as-bar i{display:block;height:100%;background:#2d3440;border-radius:4px}
.as-hint{font-weight:800;font-size:13px;color:#2d3440;text-align:center;min-height:1.2em}
.as-info{position:absolute;right:12px;top:14px;text-align:right;font:800 12px Nunito,system-ui,sans-serif;color:#2d3440;pointer-events:none}
.as-info b{display:block;font:22px 'Bebas Neue',Impact,sans-serif}
.as-next{position:absolute;left:12px;top:14px;font:800 12px Nunito,system-ui,sans-serif;color:#2d3440;pointer-events:none}
.as-next canvas{position:static;display:block;width:54px;height:54px;margin-top:2px;background:rgba(255,255,255,.5);border-radius:10px}
.as-btns{position:absolute;left:12px;right:12px;bottom:14px;display:flex;gap:12px}
.as-btn{flex:1;height:64px;border:0;border-radius:16px;font:30px 'Bebas Neue',Impact,sans-serif;letter-spacing:2px;color:#fff;box-shadow:inset 0 -6px 0 rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;gap:8px}
.as-rot{background:#5f6bd8;flex:.8}
.as-drop{background:#2fae67;flex:1.2}
.as-btn.off{opacity:.4}
.as-end{position:absolute;inset:0;display:flex;flex-direction:column;background:rgba(20,30,50,.45);z-index:5}
.as-endhalf{flex:1;display:flex;align-items:center;justify-content:center}
.as-endhalf.top{transform:rotate(180deg)}
.as-endbox{background:#fff8ec;border:4px solid #2d3440;border-radius:18px;padding:12px 22px;text-align:center;color:#2d3440;font-weight:800}
.as-endbox h2{margin:0 0 4px;font:normal 36px 'Bebas Neue',Impact,sans-serif;letter-spacing:2px}
.as-endbox p{margin:2px 0;font-size:14px}
`;

function _build() {
    const mg = document.getElementById('minigame-layer');
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _overlay = document.createElement('div');
    _overlay.className = 'as';
    _overlay.innerHTML = `<style>${CSS}</style><div class="as-frame"><canvas></canvas>
        <div class="as-top"><div class="as-turn"></div><div class="as-bar"><i></i></div><div class="as-hint"></div></div>
        <div class="as-next">NEXT<canvas width="108" height="108"></canvas></div>
        <div class="as-info">STACK<b>0</b></div>
        <div class="as-btns"><button class="as-btn as-rot" data-act="rot">⟳ ROTATE</button><button class="as-btn as-drop" data-act="drop">DROP ▼</button></div>
      </div>`;
    _frame = _overlay.querySelector('.as-frame');
    _canvas = _frame.querySelector('canvas');
    _ctx = _canvas.getContext('2d');
    const q = s => _overlay.querySelector(s);
    _el = { turn: q('.as-turn'), bar: q('.as-bar i'), hint: q('.as-hint'), count: q('.as-info b'), rot: q('.as-rot'), drop: q('.as-drop'),
            next: q('.as-next canvas').getContext('2d') };

    const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); _cleanups.push(() => el.removeEventListener(ev, fn, o)); };
    on(_overlay, 'pointerdown', _down);
    on(window, 'pointermove', _move);
    on(window, 'pointerup', _up);
    on(window, 'pointercancel', _up);
    on(_overlay, 'contextmenu', e => e.preventDefault());
    on(window, 'resize', _resize);
    mg.appendChild(_overlay);
    _resize();
}

function _resize() {
    if (!_canvas || !_overlay) return;
    _dpr = Math.min(window.devicePixelRatio || 1, 2);   // R4
    _W = _overlay.clientWidth || window.innerWidth; _H = _overlay.clientHeight || window.innerHeight;
    _canvas.width = Math.round(_W * _dpr); _canvas.height = Math.round(_H * _dpr);
    _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
}

// ── Input ───────────────────────────────────────────────────────────────────
function _canAct() { return !_done && _phase === 'aim' && !_isBotTurn() && performance.now() >= _lockUntil; }

function _down(e) {
    if (_done) return;
    const act = e.target.closest?.('[data-act]')?.dataset.act;
    if (act === 'end') { _finishNow(); return; }
    e.preventDefault();
    if (!_canAct()) return;
    if (act === 'rot') { _held.angle += ROT_STEP; sfx('swap'); haptic([8]); return; }
    if (act === 'drop') { _dropNow(); return; }
    if (!_drag) _drag = { id: e.pointerId, x: e.clientX };
}

function _move(e) {
    if (!_drag || e.pointerId !== _drag.id || !_canAct()) return;
    // The frame is turned 180° on P2's go, so a screen drag runs the other way.
    const dx = (e.clientX - _drag.x) * (_facing === 1 ? -1 : 1);
    _drag.x = e.clientX;
    _held.x = Math.max(-AIM_X, Math.min(AIM_X, _held.x + dx / _scale()));
}

function _up(e) { if (_drag && e.pointerId === _drag.id) _drag = null; }

// ── Turn flow ───────────────────────────────────────────────────────────────
function _newTurn() {
    const def = _next;
    _next = _draw();
    _held = { def, x: (Math.random() - 0.5) * 2, angle: 0 };
    _phase = 'aim'; _turnLeft = TURN_TIME; _drag = null;
    MinigameManager.extendWatchdog?.(90000);   // no match clock; each turn pushes the net on
    const face = _isBot ? 0 : _turn;
    if (face !== _facing) {
        _facing = face;
        _frame.classList.toggle('flip', _facing === 1);
        _lockUntil = performance.now() + FLIP_MS;
    }
    if (_isBotTurn()) _bot = _botPlan();
    _paintNext();
}

function _holdY() { return _stackTop() + HOLD_GAP + _held.def.r * 0.4; }

function _dropNow() {
    if (_phase !== 'aim') return;
    const b = _addAnimal(_world, _held.def, _held.x, _holdY(), _held.angle);
    _pile.push({ body: b, def: _held.def, by: _turn });
    _held = null; _drag = null; _bot = null;
    _phase = 'settle'; _settle = 0; _settleT = 0; _drops++;
    sfx('dice_throw');
    if (_turn === 0 || !_isBot) haptic([12]);
}

function _settled() {
    for (const { body } of _pile) {
        if (!body.isAwake()) continue;
        if (body.getLinearVelocity().length() > SETTLE_V || Math.abs(body.getAngularVelocity()) > SETTLE_W) return false;
    }
    return true;
}

function _endTurn() {
    sfx('land_good');
    if (_drops >= MAX_DROPS) { _loser = -2; _showEnd(); return; }
    _turn = 1 - _turn;
    _newTurn();
}

// ── Loop (R1) ───────────────────────────────────────────────────────────────
function _tick() {
    if (_done) return;
    _af = requestAnimationFrame(_tick);
    const now = performance.now();
    const dt = _last === 0 ? 1 / 60 : Math.min((now - _last) / 1000, 0.1);
    _last = now;

    _acc += dt;
    while (_acc >= STEP) { _world.step(STEP, 8, 3); _acc -= STEP; }
    if (_msgT > 0) _msgT -= dt;

    if (_phase === 'aim' && _loser === -1) {
        if (performance.now() >= _lockUntil) _turnLeft -= dt;
        if (_turnLeft <= 0) { _say('TIME! THE CLAW LETS GO'); _dropNow(); }
        else if (_isBotTurn()) _botStep(dt);
    } else if (_phase === 'settle') {
        _settleT += dt;
        const gone = _pile.find(p => _fell(p.body));
        if (gone) { _fallen = gone; _loser = _turn; _phase = 'over'; _onFall(); }
        else {
            _settle = _settled() ? _settle + dt : 0;
            if (_settle >= SETTLE_FOR || _settleT >= SETTLE_MAX) _endTurn();
        }
    }

    // The camera keeps the claw and the top of the pile in view.
    const want = Math.max(0, _stackTop() + HOLD_GAP + 1.6 - _viewH() * 0.72);
    _camY += (want - _camY) * Math.min(1, dt * 3);
    _render();
}

function _onFall() {
    sfx('land_bad'); haptic('heavy');
    _say(`SPLASH! THE ${_fallen.def.name} FELL`);
    _after(_showEnd, 1800);
}

function _say(m) { _msg = m; _msgT = 2; }

// ── Bot (§5) ────────────────────────────────────────────────────────────────
function _botPlan() {
    const nx = Math.round(5 + _botSkill * 8), na = _botSkill < 0.4 ? 2 : 4;
    const cands = [];
    for (let i = 0; i < nx; i++) for (let a = 0; a < na; a++)
        cands.push({ x: -2.1 + (4.2 * i) / (nx - 1), angle: a * ROT_STEP, score: null });
    cands.sort(() => Math.random() - 0.5);
    return { cands, i: 0, choice: null, wait: 0.6 + Math.random() * 0.6, think: 0 };
}

// Copy the pile into a fresh world, drop the candidate, run it for 2.5 s,
// and score how much the pile moved. A fall scores -Infinity.
function _simulate(pile, def, x, angle) {
    const w = _newWorld();
    const copy = pile.map(({ body, def: d }) => {
        const p = body.getPosition();
        return { b: _addAnimal(w, d, p.x, p.y, body.getAngle()), x: p.x, y: p.y, a: body.getAngle() };
    });
    const nb = _addAnimal(w, def, x, _stackTop(pile) + HOLD_GAP + def.r * 0.4, angle);
    for (let s = 0; s < 150; s++) w.step(STEP, 6, 2);
    let moved = 0;
    for (const c of copy) {
        const p = c.b.getPosition();
        if (p.y < FALL_Y || Math.abs(p.x) > FALL_X) return -Infinity;
        moved += Math.hypot(p.x - c.x, p.y - c.y) + Math.abs(c.b.getAngle() - c.a) * 0.3;
    }
    const np = nb.getPosition();
    if (np.y < FALL_Y || Math.abs(np.x) > FALL_X) return -Infinity;
    // Prefer a settled, low landing: still moving at the end means it's teetering.
    return -moved - nb.getLinearVelocity().length() * 2 - Math.abs(nb.getAngularVelocity()) - np.y * 0.05;
}

function _botStep(dt) {
    const B = _bot;
    if (!B || !_held) return;
    if (!B.choice) {
        // Search a few candidates per frame, inside a time budget.
        const t0 = performance.now();
        while (B.i < B.cands.length && performance.now() - t0 < BOT_BUDGET_MS) {
            const c = B.cands[B.i++];
            c.score = _simulate(_pile, _held.def, c.x, c.angle);
        }
        // Meanwhile the claw wanders, as if weighing it up.
        B.think += dt;
        _held.x += Math.sin(B.think * 2.3) * dt * 0.8;
        if (B.i < B.cands.length) return;
        const ranked = B.cands.filter(c => c.score > -Infinity).sort((a, b) => b.score - a.score);
        const pick = ranked.length ? ranked[Math.random() < 0.45 - _botSkill * 0.4 ? Math.min(ranked.length - 1, 1 + Math.floor(Math.random() * 3)) : 0]
                                   : B.cands[Math.floor(Math.random() * B.cands.length)];
        // A shaky hand: easy misses by more.
        B.choice = { x: pick.x + (Math.random() - 0.5) * (1 - _botSkill) * 0.7, angle: pick.angle };
        return;
    }
    // Rotate, then slide, then drop.
    if (_held.angle < B.choice.angle - 1e-6) { if ((B.wait -= dt) <= 0) { _held.angle += ROT_STEP; sfx('swap'); B.wait = 0.35; } return; }
    const d = B.choice.x - _held.x;
    if (Math.abs(d) > 0.02) { _held.x += Math.sign(d) * Math.min(Math.abs(d), dt * 3); return; }
    if ((B.wait -= dt) <= 0) _dropNow();
}

// ── Render ──────────────────────────────────────────────────────────────────
const _scale = () => _W / VIEW_W;
const _viewH = () => _H / _scale();
// World (metres, y up) to the frame's pixels. Ground sits 30% up from the bottom.
function _sx(x) { return _W / 2 + x * _scale(); }
function _sy(y) { return _H * 0.7 - (y - _camY) * _scale(); }

function _render() {
    const ctx = _ctx;
    if (!ctx) return;
    const s = _scale();

    // Sky, clouds, sea.
    const g = ctx.createLinearGradient(0, 0, 0, _H);
    g.addColorStop(0, '#9fd8ff'); g.addColorStop(1, '#d9f1ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, _W, _H);
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    [[-2.6, 6, 1], [2.2, 9, 0.8], [-1, 12.5, 1.1], [2.8, 15, 0.9]].forEach(([x, y, k]) => {
        const cx = _sx(x), cy = _sy(y);
        [[0, 0, 0.6], [0.5, 0.1, 0.45], [-0.5, 0.1, 0.45]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(cx + dx * s * k, cy - dy * s * k, r * s * k, 0, Math.PI * 2); ctx.fill(); });
    });
    const sea = _sy(-0.9);
    ctx.fillStyle = '#3f8fd8'; ctx.fillRect(0, sea, _W, _H - sea);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 8; i++) { const x = ((i * 97 + performance.now() * 0.02) % (_W + 60)) - 30; ctx.fillRect(x, sea + 10 + (i % 3) * 18, 26, 4); }

    // The island: a CLAW crate on a rock.
    const iw = ISLAND_W * s, ix = _sx(-ISLAND_W / 2), iy = _sy(ISLAND_TOP);
    ctx.fillStyle = '#8a6a4a'; ctx.beginPath();
    ctx.moveTo(ix - 10, _sy(-0.9)); ctx.lineTo(ix + 14, _sy(-0.2)); ctx.lineTo(ix + iw - 14, _sy(-0.2)); ctx.lineTo(ix + iw + 10, _sy(-0.9)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0a458'; ctx.strokeStyle = '#7a4b1c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.rect(ix, iy, iw, ISLAND_TOP * 2 * s); ctx.fill(); ctx.stroke();
    ctx.font = `${Math.round(0.36 * s)}px 'Bebas Neue', Impact, sans-serif`; ctx.fillStyle = '#7a4b1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('C L A W', _sx(0), _sy(0));

    // The pile.
    _pile.forEach(({ body, def }) => { const p = body.getPosition(); _animal(ctx, def, p.x, p.y, body.getAngle(), _fallen && _fallen.body === body); });

    // The claw and what it holds (with a dotted drop line).
    if (_held) {
        const hy = _holdY();
        ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(45,52,64,.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(_sx(_held.x), _sy(hy)); ctx.lineTo(_sx(_held.x), _sy(_stackTop())); ctx.stroke(); ctx.setLineDash([]);
        _animal(ctx, _held.def, _held.x, hy, _held.angle, false);
        _claw(ctx, _held.x, hy + _held.def.r * 0.9, true);
    } else _claw(ctx, 0, _stackTop() + HOLD_GAP + 0.9, false);

    // Message.
    if (_msgT > 0) {
        ctx.globalAlpha = Math.min(1, _msgT * 2);
        ctx.font = `28px 'Bebas Neue', Impact, sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText(_msg, _W / 2, _H * 0.42);
        ctx.fillStyle = '#2d3440'; ctx.fillText(_msg, _W / 2, _H * 0.42);
        ctx.globalAlpha = 1;
    }

    // HUD.
    const p = _turn, bot = _isBotTurn();
    _el.turn.textContent = _loser >= 0 ? 'SPLASH!' : `${_name(p)}'S TURN`;
    _el.turn.style.background = _hex(p);
    _el.bar.style.width = `${Math.max(0, _turnLeft / TURN_TIME) * 100}%`;
    _el.bar.style.background = _turnLeft < 5 ? '#e8463c' : '#2d3440';
    _el.hint.textContent = _phase === 'settle' ? 'WAIT FOR IT…' : bot ? 'THINKING…' : _phase === 'aim' ? 'DRAG TO MOVE · ROTATE · DROP' : '';
    _el.count.textContent = _pile.length;
    const live = _phase === 'aim' && !bot;
    _el.rot.classList.toggle('off', !live); _el.drop.classList.toggle('off', !live);
}

function _claw(ctx, x, y, closed) {
    const cx = _sx(x), cy = _sy(y), s = _scale();
    ctx.strokeStyle = '#4a5160'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - 0.2 * s); ctx.stroke();
    ctx.fillStyle = '#4a5160'; ctx.fillRect(cx - 0.22 * s, cy - 0.28 * s, 0.44 * s, 0.16 * s);
    const sp = closed ? 0.18 : 0.32;
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    [-1, 1].forEach(d => { ctx.beginPath(); ctx.moveTo(cx + d * 0.15 * s, cy - 0.14 * s); ctx.lineTo(cx + d * sp * s, cy + 0.12 * s); ctx.lineTo(cx + d * (sp - 0.12) * s, cy + 0.26 * s); ctx.stroke(); });
}

// One animal: its parts filled and outlined, then its face, in body space.
function _animal(ctx, def, x, y, a, hot, scale = _scale(), ox = _sx(x), oy = _sy(y)) {
    ctx.save();
    ctx.translate(ox, oy); ctx.rotate(-a); ctx.scale(scale, -scale);
    ctx.lineJoin = 'round';
    const path = pts => { ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); };
    ctx.lineWidth = 0.09; ctx.strokeStyle = hot ? '#e8463c' : def.dark;
    def.parts.forEach(p => { path(p); ctx.stroke(); });
    ctx.fillStyle = def.col;
    def.parts.forEach(p => { path(p); ctx.fill(); });
    const dot = (px, py, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); };
    if (def.belly) { ctx.fillStyle = def.belly; ctx.beginPath(); ctx.ellipse(0, -0.1, 0.24, 0.42, 0, 0, Math.PI * 2); ctx.fill(); }
    if (def.spots) [[-0.35, -0.3], [0.05, -0.22], [-0.15, -0.4], [0.33, 0.3], [0.33, 0.6]].forEach(([px, py]) => dot(px, py, 0.07, def.dark));
    if (def.shell) { ctx.strokeStyle = def.dark; ctx.lineWidth = 0.05; [[-0.35, -0.2, -0.2, 0.15], [0, -0.2, 0, 0.28], [0.35, -0.2, 0.2, 0.15]].forEach(([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }); }
    if (def.spikes) { ctx.fillStyle = def.dark; for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7 * Math.PI, r = 0.5; ctx.beginPath(); ctx.moveTo(Math.cos(t) * r * 0.85, -0.2 + Math.sin(t) * 0.4); ctx.lineTo(Math.cos(t) * (r + 0.12), -0.2 + Math.sin(t) * 0.52); ctx.lineTo(Math.cos(t + 0.15) * r * 0.85, -0.2 + Math.sin(t + 0.15) * 0.4); ctx.fill(); } }
    if (def.patches) [[-0.16, 0.08], [0.16, 0.08]].forEach(([px, py]) => { ctx.fillStyle = def.dark; ctx.beginPath(); ctx.ellipse(px, py, 0.1, 0.13, 0, 0, Math.PI * 2); ctx.fill(); });
    if (def.ear) { ctx.fillStyle = def.dark; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(def.ear[0], def.ear[1], def.ear[2], def.ear[2] * 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (def.snout) { const [sx, sy, rx, ry] = def.snout; ctx.fillStyle = def.dark; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (def.beak) { ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(def.beak[0] - 0.08, def.beak[1]); ctx.lineTo(def.beak[0] + 0.08, def.beak[1]); ctx.lineTo(def.beak[0], def.beak[1] - 0.1); ctx.fill(); }
    if (def.teeth) { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const tx = 0.62 + i * 0.13; ctx.beginPath(); ctx.moveTo(tx, -0.1); ctx.lineTo(tx + 0.06, -0.1); ctx.lineTo(tx + 0.03, -0.02); ctx.fill(); } }
    if (def.whiskers) { ctx.strokeStyle = def.dark; ctx.lineWidth = 0.025; [[-1, 0.02], [-1, -0.06], [1, 0.02], [1, -0.06]].forEach(([d, wy]) => { ctx.beginPath(); ctx.moveTo(d * 0.08, -0.08); ctx.lineTo(d * 0.36, wy - 0.05); ctx.stroke(); }); }
    // Eyes: white, pupil, glint. Wide open on the one that fell.
    def.eyes.forEach(([ex, ey]) => {
        dot(ex, ey, hot ? 0.11 : 0.085, '#fff');
        dot(ex, ey - 0.01, hot ? 0.035 : 0.05, '#1b1b1f');
        dot(ex + 0.02, ey + 0.02, 0.015, '#fff');
    });
    if (def.smile || hot) { ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 0.035; ctx.beginPath(); const mx = def.eyes.reduce((s, e) => s + e[0], 0) / def.eyes.length, my = def.eyes[0][1] - 0.2;
        if (hot) ctx.arc(mx, my - 0.02, 0.06, 0, Math.PI * 2); else ctx.arc(mx, my + 0.08, 0.1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    ctx.restore();
}

function _paintNext() {
    const c = _el.next;
    if (!c) return;
    c.clearRect(0, 0, 108, 108);
    const k = 36 / Math.max(0.6, _next.r);
    _animal(c, _next, 0, 0, 0, false, k, 54, 56);
}

// ── End (R6) ────────────────────────────────────────────────────────────────
function _showEnd() {
    const winner = _loser === -2 ? -1 : 1 - _loser;
    sfx(winner < 0 ? 'land_bad' : 'mg_win');
    const head = winner < 0 ? 'THE PILE HELD! DRAW' : `${_name(winner)} WINS!`;
    const why = winner < 0 ? `${_pile.length} animals and nobody dropped one` : `${_name(_loser)}'s ${_fallen.def.name.toLowerCase()} knocked the pile into the sea`;
    const box = `<div class="as-endbox"><h2 style="color:${winner < 0 ? '#2d3440' : _hex(winner)}">${head}</h2><p>${why}</p><p>${_pile.length} animals stacked</p><p style="opacity:.6;font-size:12px">TAP TO FINISH</p></div>`;
    const end = document.createElement('div');
    end.className = 'as-end'; end.dataset.act = 'end';
    end.innerHTML = (_isBot ? '' : `<div class="as-endhalf top">${box}</div>`) + `<div class="as-endhalf">${box}</div>`;
    _overlay.appendChild(end);
    _after(_finishNow, 8000);
}

function _finishNow() {
    if (_done || _loser === -1) return;
    const winner = _loser === -2 ? -1 : 1 - _loser;
    _done = true;
    state.mgActive = false;
    _destroy();
    _onWin(winner);
}

// ── Cleanup (R3) ────────────────────────────────────────────────────────────
function _destroy() {
    _done = true;
    _timers.forEach(clearTimeout); _timers.length = 0;
    _cleanups.forEach(f => { try { f(); } catch (e) {} }); _cleanups.length = 0;
    if (_af) { cancelAnimationFrame(_af); _af = null; }
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _world = null; _pile = []; _held = null; _bot = null; _drag = null;
    _ctx = null; _canvas = null; _frame = null; _el = {}; _last = 0;
}
