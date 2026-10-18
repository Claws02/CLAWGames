// ============================================================
// PINBALL — a machine each, 90 seconds, highest score wins.
//
// A CLAWGames-only game (src/games/index.js wires it in). Face-off hold: the
// screen is split across the middle, P1's machine on the bottom half and P2's
// on the top, turned 180° so it reads the right way up from their end. Each
// half is split again down the middle: tap and hold the left side for the left
// flipper, the right side for the right one. That is four touch zones, and any
// number of fingers can be down in any of them at once (see _press/_release).
//
// Draining is never game over: a fresh ball is back in the shooter lane after a
// second. What a drain costs is that second and your multiplier, which you
// build by lighting the three drop targets on the left wall.
//
// Lighting all three also BLOCKS the other player: a bar drops across the front
// of their targets for 8 s, so they can't build multiplier back while it's up.
//
// Physics is a small 2D solver of its own (no cannon): one ball, circles and
// line segments, fixed 1/600 s substeps so a fast ball can't tunnel through a
// flipper. All speeds are per second (R1).
// ============================================================

import { state } from '../AppHost.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { registerMinigameCleanup } from '../claw-core/minigames/MinigameManager.js';

// ── Tunables ────────────────────────────────────────────────────────────────
const GAME_TIME   = 90;      // s, both machines on one clock
const TW = 300, TH = 400;    // table units; the lane is x 276–300
const R           = 8;       // ball radius
const GRAVITY     = 480;     // units/s² down the table
const E_WALL      = 0.45;    // restitution
const E_FLIP      = 0.2;
const VMAX        = 1000;
const STEP        = 1 / 600; // physics substep
const RESPAWN     = 1.0;     // s from drain to the next launch
const LAUNCH      = [640, 720];
const BLOCK_TIME  = 8;
const MAX_MULT    = 5;
const FLIP_LEN    = 48, FLIP_R = 6;
const FLIP_UP     = 22, FLIP_DOWN = 12;   // rad/s
const REST = 28 * Math.PI / 180, UP = -22 * Math.PI / 180;
const PTS = { bumper: 100, sling: 10, target: 250, lane: 50, lanes: 1000 };
const EDGE  = 46;            // clear of the #mg-neutral pill at each outer edge (R1b)
const HUD   = 40;            // score band along the centre line

// ── Table geometry ──────────────────────────────────────────────────────────
function _chain(pts, extra = {}) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], ...extra });
    return out;
}
const WALLS = [
    ..._chain([[0, 290], [0, 60], [4, 36], [14, 18], [30, 6], [50, 0], [250, 0], [270, 6], [286, 18], [296, 36], [300, 60], [300, 400], [276, 400], [276, 110]]),
    ..._chain([[0, 290], [82, 348]]),        // left inlane
    ..._chain([[276, 290], [194, 348]]),     // right inlane
    ..._chain([[81, 24], [81, 50]]), ..._chain([[119, 24], [119, 50]]),
    ..._chain([[157, 24], [157, 50]]), ..._chain([[195, 24], [195, 50]]),
];
// Slingshots: the face toward the middle kicks.
const SLINGS = [
    ..._chain([[36, 240], [36, 292], [68, 312]]), { a: [68, 312], b: [36, 240], kick: true },
    ..._chain([[240, 240], [240, 292], [208, 312]]), { a: [208, 312], b: [240, 240], kick: true },
];
const GATE    = { a: [276, 110], b: [300, 84] };           // shut once the ball is out of the lane
const BLOCKER = { a: [24, 136], b: [24, 234] };
const TARGETS = [150, 176, 202].map(y => ({ a: [5, y], b: [5, y + 18] }));
const BUMPERS = [[100, 118], [176, 118], [138, 172]].map(([x, y]) => ({ x, y, r: 16 }));
const LANES   = [100, 138, 176].map(x => ({ x, y: 40 }));
const FLIPPERS = [
    { side: 0, px: 82,  py: 350, rest: REST,           up: UP },
    { side: 1, px: 194, py: 350, rest: Math.PI - REST, up: Math.PI - UP },
];

// ── Module state ────────────────────────────────────────────────────────────
let _done = false, _over = false, _onWin = null, _isBot = false, _botSkill = 0.55;
let _overlay = null, _canvas = null, _ctx = null, _dpr = 1, _W = 0, _H = 0;
let _af = null, _last = 0, _clock = GAME_TIME;
let _tables = null;
const _ptrs = new Map();     // pointerId → { pid, side }
const _cleanups = [];
const _timers   = [];

function _after(fn, ms) {
    const id = setTimeout(() => { _timers.splice(_timers.indexOf(id), 1); if (!_done) fn(); }, ms);
    _timers.push(id);
    return id;
}

function _newTable(pid) {
    return {
        pid, score: 0, mult: 1,
        ball: null, respawn: 0.4,
        flips: FLIPPERS.map(f => ({ ...f, a: f.rest, w: 0 })),
        press: [0, 0],            // fingers down per side
        botHold: [false, false], botAt: [0, 0], botUntil: [0, 0], botCool: [0, 0],
        targets: [false, false, false], targetReset: 0,
        lanes: [false, false, false],
        blocked: 0, bumpFlash: [0, 0, 0], slingFlash: [0, 0],
        msg: '', msgT: 0, shake: 0, still: 0, t: 0,
        pops: [], drains: 0, escapes: 0,
    };
}

// For QA probes: the live tables and the clock.
export function _qa() { return { tables: _tables, clock: _clock, over: _over, ptrs: _ptrs.size }; }

// ── Lifecycle ───────────────────────────────────────────────────────────────
export function start(isBot, onWin, botSkill = 0.55) {
    if (!state.mgActive) return;
    _done = false; _over = false; _onWin = onWin; _isBot = isBot; _botSkill = botSkill;
    _clock = GAME_TIME; _last = 0;
    _tables = [_newTable(0), _newTable(1)];
    _ptrs.clear();
    registerMinigameCleanup(_destroy);   // R3
    _build();
    const neu = document.getElementById('mg-neutral');
    if (neu) neu.textContent = 'TAP LEFT · RIGHT TO FLIP';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (_done) return;
        _resize();
        _af = requestAnimationFrame(_tick);
    }));
}

// ── DOM and input (R2, R5) ──────────────────────────────────────────────────
function _build() {
    const mg = document.getElementById('minigame-layer');
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none;background:#0b0a1a;' +
        'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
    _canvas = document.createElement('canvas');
    _canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    _overlay.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');

    const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); _cleanups.push(() => el.removeEventListener(ev, fn, opts)); };
    on(_overlay, 'pointerdown', _press);
    // Releases are heard on the window: a finger that slides off the overlay,
    // or lifts after the browser re-targeted it, still lets its flipper go.
    on(window, 'pointerup', _release);
    on(window, 'pointercancel', _release);
    on(_overlay, 'contextmenu', e => e.preventDefault());
    on(window, 'blur', _releaseAll);
    on(document, 'visibilitychange', () => { if (document.hidden) _releaseAll(); });
    on(window, 'resize', _resize);
    mg.appendChild(_overlay);
}

// Every finger is tracked by its own pointerId and stays with the zone it
// landed in until it lifts. A flipper is up while ANY finger is down in its
// zone, so two fingers on one side, a finger sliding across the middle, or all
// four zones at once can't leave a flipper stuck or drop one early.
function _press(e) {
    if (_done) return;
    e.preventDefault();
    if (_ptrs.has(e.pointerId)) return;
    const r = _overlay.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const pid = y >= r.height / 2 ? 0 : 1;
    if (pid === 1 && _isBot) return;
    // P2 reads their half upside down, so their left is the screen's right.
    const left = pid === 0 ? x < r.width / 2 : x >= r.width / 2;
    const side = left ? 0 : 1;
    _ptrs.set(e.pointerId, { pid, side });
    const t = _tables[pid];
    if (t.press[side]++ === 0 && !_over) { sfx('swap'); if (pid === 0) haptic([6]); }
}

function _release(e) {
    const p = _ptrs.get(e.pointerId);
    if (!p) return;
    _ptrs.delete(e.pointerId);
    const t = _tables && _tables[p.pid];
    if (t) t.press[p.side] = Math.max(0, t.press[p.side] - 1);
}

function _releaseAll() {
    _ptrs.clear();
    _tables?.forEach(t => { t.press[0] = 0; t.press[1] = 0; });
}

function _resize() {
    if (!_canvas || !_overlay) return;
    _dpr = Math.min(window.devicePixelRatio || 1, 2);   // R4
    _W = _overlay.clientWidth; _H = _overlay.clientHeight;
    _canvas.width = Math.round(_W * _dpr); _canvas.height = Math.round(_H * _dpr);
    _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
}

// ── Loop (R1) ───────────────────────────────────────────────────────────────
function _tick() {
    if (_done) return;
    _af = requestAnimationFrame(_tick);
    const now = performance.now();
    const dt = _last === 0 ? 1 / 60 : Math.min((now - _last) / 1000, 0.1);
    _last = now;
    if (!_over) {
        _clock = Math.max(0, _clock - dt);
        if (_isBot) _bot(_tables[1], dt);
        _tables.forEach(t => _update(t, dt));
        if (_clock <= 0) _end();
    }
    _draw();
}

function _update(t, dt) {
    t.t += dt;
    if (t.msgT > 0) t.msgT -= dt;
    if (t.shake > 0) t.shake = Math.max(0, t.shake - dt * 3);
    if (t.blocked > 0) t.blocked = Math.max(0, t.blocked - dt);
    t.bumpFlash = t.bumpFlash.map(v => Math.max(0, v - dt));
    t.slingFlash = t.slingFlash.map(v => Math.max(0, v - dt));
    t.pops = t.pops.filter(p => (p.t += dt) < 0.8);
    if (t.targetReset > 0 && (t.targetReset -= dt) <= 0) t.targets = [false, false, false];

    if (!t.ball) {
        if ((t.respawn -= dt) <= 0) {
            t.ball = { x: 288, y: 400 - R - 1, vx: 0, vy: -(LAUNCH[0] + Math.random() * (LAUNCH[1] - LAUNCH[0])), inPlay: false };
            sfx('boost');
        }
    }

    // Substeps: flippers and ball advance together, so a flipper swinging
    // into the ball meets it rather than jumping past it.
    let left = dt;
    while (left > 1e-6) {
        const h = Math.min(STEP, left);
        left -= h;
        t.flips.forEach(f => {
            const held = t.press[f.side] > 0 || t.botHold[f.side];
            const target = held ? f.up : f.rest;
            const speed = held ? FLIP_UP : FLIP_DOWN;
            const prev = f.a;
            const d = target - f.a;
            f.a += Math.sign(d) * Math.min(Math.abs(d), speed * h);
            f.w = (f.a - prev) / h;
        });
        if (t.ball) _step(t, h);
    }

    // A ball that has come to rest somewhere other than a held flipper gets a
    // nudge, so a dead spot on the table can never eat the clock.
    const b = t.ball;
    if (b) {
        const sp = Math.hypot(b.vx, b.vy);
        const holding = t.press[0] || t.press[1] || t.botHold[0] || t.botHold[1];
        t.still = sp < 6 && !holding && b.inPlay ? t.still + dt : 0;
        if (t.still > 2.5) { b.vx += (Math.random() - 0.5) * 200; b.vy -= 160; t.still = 0; }
    }
}

function _step(t, h) {
    const b = t.ball;
    b.vy += GRAVITY * h;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
    b.x += b.vx * h; b.y += b.vy * h;
    if (!b.inPlay && b.x < 268) b.inPlay = true;

    for (const s of WALLS) _hitSeg(b, s, 0, E_WALL);
    if (b.inPlay) _hitSeg(b, GATE, 0, E_WALL);
    if (t.blocked > 0) _hitSeg(b, BLOCKER, 3, E_WALL);
    SLINGS.forEach(s => {
        const vn = _hitSeg(b, s, 0, E_WALL);
        if (s.kick && vn < -40) {
            const n = _lastN;
            b.vx += n[0] * 320; b.vy += n[1] * 320;
            t.slingFlash[s.a[0] < 138 ? 0 : 1] = 0.15;
            _score(t, PTS.sling, b.x, b.y, false);
            sfx('slam');
        }
    });
    TARGETS.forEach((s, i) => {
        if (_hitSeg(b, s, 0, 0.3) < -20 && !t.targets[i] && t.targetReset <= 0) {
            t.targets[i] = true;
            _score(t, PTS.target, 20, s.a[1] + 9);
            sfx('land_good');
            if (t.targets.every(Boolean)) _targetsDone(t);
        }
    });
    BUMPERS.forEach((u, i) => {
        const dx = b.x - u.x, dy = b.y - u.y, d = Math.hypot(dx, dy);
        if (d < R + u.r && d > 0) {
            const nx = dx / d, ny = dy / d;
            b.x = u.x + nx * (R + u.r); b.y = u.y + ny * (R + u.r);
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
            b.vx += nx * 260; b.vy += ny * 260;
            if (t.bumpFlash[i] < 0.05) { _score(t, PTS.bumper, u.x, u.y - 22); sfx('coin_gain'); }
            t.bumpFlash[i] = 0.15;
        }
    });
    LANES.forEach((l, i) => {
        if (!t.lanes[i] && Math.abs(b.x - l.x) < 12 && Math.abs(b.y - l.y) < 10) {
            t.lanes[i] = true;
            _score(t, PTS.lane, l.x, l.y + 18);
            if (t.lanes.every(Boolean)) {
                _score(t, PTS.lanes, 138, 70);
                _say(t, 'ALL LANES!');
                sfx('bell');
                t.lanes = [false, false, false];
            }
        }
    });
    t.flips.forEach(f => _hitFlipper(b, f));

    if (b.y > TH + 3 * R) _drain(t);
    else if (b.x < -30 || b.x > TW + 30 || b.y < -40) { t.ball = null; t.respawn = 0.3; t.escapes++; }   // escaped: no penalty
}

// Ball against a segment thickened by `thick`. Pushes the ball out, reflects
// it, and returns the approach speed along the normal (negative = was moving
// into it), 0 for no contact. The normal is left in _lastN.
let _lastN = [0, 0];
function _hitSeg(b, s, thick, e) {
    const [ax, ay] = s.a, [bx, by] = s.b;
    const ex = bx - ax, ey = by - ay;
    const len2 = ex * ex + ey * ey;
    let u = len2 ? ((b.x - ax) * ex + (b.y - ay) * ey) / len2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = ax + ex * u, qy = ay + ey * u;
    const dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy);
    const rr = R + thick;
    if (d >= rr || d === 0) return 0;
    const nx = dx / d, ny = dy / d;
    b.x = qx + nx * rr; b.y = qy + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
        b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
        b.vx *= 0.995; b.vy *= 0.995;
    }
    _lastN = [nx, ny];
    return Math.min(vn, -1e-3);
}

function _hitFlipper(b, f) {
    const tx = f.px + Math.cos(f.a) * FLIP_LEN, ty = f.py + Math.sin(f.a) * FLIP_LEN;
    const ex = tx - f.px, ey = ty - f.py;
    let u = ((b.x - f.px) * ex + (b.y - f.py) * ey) / (FLIP_LEN * FLIP_LEN);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = f.px + ex * u, qy = f.py + ey * u;
    // Tapers from the pivot to the tip.
    const rr = R + FLIP_R - 2 * u;
    const dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy);
    if (d >= rr || d === 0) return;
    const nx = dx / d, ny = dy / d;
    b.x = qx + nx * rr; b.y = qy + ny * rr;
    // The flipper's surface velocity where the ball touches it.
    const rx = qx - f.px, ry = qy - f.py;
    const svx = -f.w * ry, svy = f.w * rx;
    const vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
    if (vn < 0) { b.vx -= (1 + E_FLIP) * vn * nx; b.vy -= (1 + E_FLIP) * vn * ny; }
}

// ── Scoring and the attack ──────────────────────────────────────────────────
function _score(t, pts, x, y, pop = true) {
    const got = pts * t.mult;
    t.score += got;
    if (pop) t.pops.push({ x, y, text: `+${got}`, t: 0 });
}

function _say(t, msg) { t.msg = msg; t.msgT = 1.6; }

function _targetsDone(t) {
    t.targetReset = 0.6;
    if (t.mult < MAX_MULT) t.mult++;
    _say(t, `x${t.mult} · BLOCKER SENT!`);
    const o = _tables[1 - t.pid];
    o.blocked = BLOCK_TIME;
    _say(o, 'BLOCKED!');
    sfx('shield'); haptic('heavy');
}

function _drain(t) {
    t.ball = null;
    t.drains++;
    t.respawn = RESPAWN;
    t.shake = 1;
    _say(t, t.mult > 1 ? `DRAIN · x${t.mult} LOST` : 'DRAIN');
    t.mult = 1;
    t.targets = [false, false, false];
    sfx('land_bad');
    if (t.pid === 0 || !_isBot) haptic([30]);
}

// ── Bot (§5) ────────────────────────────────────────────────────────────────
// Watches the ball come down onto each flipper and swings with a skill-scaled
// reaction and a skill-scaled chance of a whiff. It never sees the future.
function _bot(t, dt) {
    const b = t.ball;
    t.flips.forEach((f, i) => {
        if (t.botHold[i]) { if (t.t >= t.botUntil[i]) { t.botHold[i] = false; t.botCool[i] = t.t + 0.15; } return; }
        if (t.botAt[i]) { if (t.t >= t.botAt[i]) { t.botAt[i] = 0; t.botHold[i] = true; t.botUntil[i] = t.t + 0.18 + Math.random() * 0.12; } return; }
        if (!b || !b.inPlay || t.t < t.botCool[i] || b.vy < -40) return;
        const near = Math.hypot(b.x - (f.px + Math.cos(f.rest) * FLIP_LEN * 0.6), b.y - (f.py + Math.sin(f.rest) * FLIP_LEN * 0.6));
        if (near > 34) return;
        if (Math.random() < 0.3 - _botSkill * 0.26) { t.botCool[i] = t.t + 0.45; return; }   // whiff
        t.botAt[i] = t.t + (0.012 + (1 - _botSkill) * 0.07 + Math.random() * 0.03);
    });
}

// ── Draw ────────────────────────────────────────────────────────────────────
function _hex(p) { return state.players?.[p]?.hex || (p ? '#3b9dff' : '#ff4d6d'); }
function _name(p) { return (state.players?.[p]?.name || (p ? 'P2' : 'P1')).toUpperCase(); }

function _layout() {
    const half = _H / 2;
    const s = Math.min((_W - 16) / TW, (half - EDGE - HUD - 6) / TH);
    return { s, ox: (_W - TW * s) / 2, oy: _H - EDGE - TH * s, half };
}

function _draw() {
    const ctx = _ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, _W, _H);
    const L = _layout();
    [0, 1].forEach(pid => {
        ctx.save();
        if (pid === 1) { ctx.translate(_W, _H); ctx.rotate(Math.PI); }   // P2 reads from their end
        ctx.beginPath(); ctx.rect(0, L.half, _W, L.half); ctx.clip();
        _drawHalf(_tables[pid], L);
        ctx.restore();
    });
    // The centre line.
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(0, _H / 2 - 1, _W, 2);
}

function _drawHalf(t, L) {
    const ctx = _ctx, col = _hex(t.pid), { s, ox, oy, half } = L;

    // Flipper zones: a faint wash under whichever side is held.
    [0, 1].forEach(side => {
        if (t.press[side] || t.botHold[side]) {
            ctx.fillStyle = 'rgba(255,255,255,.06)';
            ctx.fillRect(side ? _W / 2 : 0, half, _W / 2, half);
        }
    });

    // HUD along the centre line.
    const hy = half + HUD / 2 + 2;
    ctx.textBaseline = 'middle';
    ctx.font = `bold 22px 'Bebas Neue', Impact, sans-serif`;
    ctx.fillStyle = col; ctx.textAlign = 'left';
    ctx.fillText(`${_name(t.pid)}  ${t.score.toLocaleString()}`, 12, hy);
    ctx.textAlign = 'center'; ctx.fillStyle = _clock <= 10 ? '#ffd23f' : '#fff';
    ctx.fillText(`${Math.ceil(_clock)}`, _W / 2, hy);
    ctx.textAlign = 'right'; ctx.fillStyle = t.mult > 1 ? '#ffd23f' : 'rgba(255,255,255,.6)';
    ctx.fillText(`x${t.mult}`, _W - 12, hy);

    ctx.save();
    const sh = t.shake > 0 ? (Math.random() - 0.5) * 6 * t.shake : 0;
    ctx.translate(ox + sh, oy);
    ctx.scale(s, s);

    // Table bed.
    ctx.fillStyle = '#141432';
    ctx.beginPath(); ctx.moveTo(0, 290); ctx.lineTo(0, 60);
    ctx.quadraticCurveTo(0, 0, 50, 0); ctx.lineTo(250, 0); ctx.quadraticCurveTo(300, 0, 300, 60);
    ctx.lineTo(300, 400); ctx.lineTo(0, 400); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.stroke(); ctx.shadowBlur = 0;

    const seg = (list, w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = 'round';
        list.forEach(q => { ctx.beginPath(); ctx.moveTo(q.a[0], q.a[1]); ctx.lineTo(q.b[0], q.b[1]); ctx.stroke(); }); };
    seg(WALLS.slice(11), 3, '#8a8ac0');   // the lane, inlanes and lane guides
    if (t.ball?.inPlay) seg([GATE], 3, '#8a8ac0');

    // Slingshots.
    [[SLINGS.slice(0, 3), 0], [SLINGS.slice(3), 1]].forEach(([tri, i]) => {
        ctx.beginPath(); ctx.moveTo(tri[0].a[0], tri[0].a[1]);
        tri.forEach(q => ctx.lineTo(q.b[0], q.b[1]));
        ctx.closePath();
        ctx.fillStyle = t.slingFlash[i] > 0 ? '#fff' : '#2c2c66'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    });

    // Bumpers: lit, with a ring, so they read without colour.
    BUMPERS.forEach((u, i) => {
        const lit = t.bumpFlash[i] > 0;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r + (lit ? 3 : 0), 0, Math.PI * 2);
        ctx.fillStyle = lit ? '#fff' : '#ffd23f'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#3a2a00'; ctx.stroke();
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#3a2a00'; ctx.fill();
    });

    // Rollover lanes.
    LANES.forEach((l, i) => {
        ctx.beginPath(); ctx.arc(l.x, l.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = t.lanes[i] ? '#7dffb0' : 'transparent'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#7dffb0'; ctx.stroke();
    });

    // Drop targets: down (dark) or lit (white with a tick).
    TARGETS.forEach((q, i) => {
        ctx.fillStyle = t.targets[i] ? '#fff' : '#ff8a3d';
        ctx.fillRect(0, q.a[1], 7, 18);
        if (t.targets[i]) { ctx.fillStyle = '#141432'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✓', 3.5, q.a[1] + 9); }
    });
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `bold 11px 'Bebas Neue', Impact, sans-serif`; ctx.textAlign = 'left';
    ctx.save(); ctx.translate(16, 192); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(`x${Math.min(t.mult + 1, MAX_MULT)}`, 0, 0); ctx.restore();

    // The blocker, striped, while it's up.
    if (t.blocked > 0) {
        const { a, b } = BLOCKER;
        ctx.fillStyle = '#ff3b3b'; ctx.fillRect(a[0] - 4, a[1], 8, b[1] - a[1]);
        ctx.fillStyle = '#fff';
        for (let y = a[1]; y < b[1]; y += 12) ctx.fillRect(a[0] - 4, y, 8, 5);
        ctx.save(); ctx.translate(a[0] + 14, (a[1] + b[1]) / 2); ctx.rotate(-Math.PI / 2);
        ctx.font = `bold 13px 'Bebas Neue', Impact, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff6b6b';
        ctx.fillText(`BLOCKED ${Math.ceil(t.blocked)}`, 0, 0); ctx.restore();
    }

    // Flippers.
    t.flips.forEach(f => {
        const tx = f.px + Math.cos(f.a) * FLIP_LEN, ty = f.py + Math.sin(f.a) * FLIP_LEN;
        ctx.lineCap = 'round';
        ctx.lineWidth = FLIP_R * 2; ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.lineWidth = FLIP_R; ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tx, ty); ctx.stroke();
    });

    // Ball.
    const b = t.ball;
    if (b) {
        const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, R);
        g.addColorStop(0, '#fff'); g.addColorStop(1, '#9aa4b8');
        ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    } else if (!_over) {
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `bold 14px 'Bebas Neue', Impact, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('NEW BALL…', 288 - 40, 380);
    }

    // Score pops.
    ctx.textAlign = 'center'; ctx.font = `bold 16px 'Bebas Neue', Impact, sans-serif`;
    t.pops.forEach(p => { ctx.globalAlpha = 1 - p.t / 0.8; ctx.fillStyle = '#fff'; ctx.fillText(p.text, p.x, p.y - p.t * 30); });
    ctx.globalAlpha = 1;
    ctx.restore();

    // Flipper hints at the outer corners.
    ctx.font = `bold 15px 'Bebas Neue', Impact, sans-serif`; ctx.textBaseline = 'middle';
    [0, 1].forEach(side => {
        const on = t.press[side] || t.botHold[side];
        ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,.35)';
        ctx.textAlign = side ? 'right' : 'left';
        ctx.fillText(side ? 'FLIP ▶' : '◀ FLIP', side ? _W - 10 : 10, _H - EDGE / 2);
    });

    // Message, mid-table.
    if (t.msgT > 0 || _over) {
        const text = _over ? _result(t.pid) : t.msg;
        ctx.globalAlpha = _over ? 1 : Math.min(1, t.msgT * 2);
        ctx.font = `bold ${_over ? 40 : 28}px 'Bebas Neue', Impact, sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#0b0a1a';
        const my = oy + TH * s * 0.45;
        ctx.strokeText(text, _W / 2, my); ctx.fillStyle = _over ? '#ffd23f' : '#fff'; ctx.fillText(text, _W / 2, my);
        ctx.globalAlpha = 1;
    }
}

function _result(pid) {
    const [a, b] = _tables.map(t => t.score);
    if (a === b) return 'DRAW!';
    const w = a > b ? 0 : 1;
    return w === pid ? 'YOU WIN!' : `${_name(w)} WINS`;
}

// ── End (R6) ────────────────────────────────────────────────────────────────
function _end() {
    if (_over) return;
    _over = true;
    _releaseAll();
    const [a, b] = _tables.map(t => t.score);
    const winner = a === b ? -1 : a > b ? 0 : 1;
    sfx(winner < 0 ? 'land_bad' : 'mg_win');
    haptic('heavy');
    _after(() => _finish(winner, [a, b]), 2600);
}

function _finish(winner, standings) {
    if (_done) return;
    _done = true;
    state.mgActive = false;
    _destroy();
    _onWin(winner, undefined, standings);
}

// ── Cleanup (R3) ────────────────────────────────────────────────────────────
function _destroy() {
    _done = true;
    _timers.forEach(clearTimeout); _timers.length = 0;
    _cleanups.forEach(f => { try { f(); } catch (e) {} }); _cleanups.length = 0;
    if (_af) { cancelAnimationFrame(_af); _af = null; }
    _ptrs.clear();
    _ctx = null; _canvas = null;
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _last = 0;
}
