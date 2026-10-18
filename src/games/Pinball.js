// ============================================================
// CLAW PINBALL — a claw-machine pinball table each, 120 seconds.
//
// A CLAWGames-only game (src/games/index.js wires it in). Face-off hold: the
// screen splits across the middle, P1's machine on the bottom half and P2's on
// the top, turned 180° so it reads the right way up from their end. Each half
// splits again down the middle: hold the left side for the left flipper, the
// right side for the right. Flick up anywhere in your half to NUDGE.
//
// What's on the table (the features phone pinball is built on):
//   skill shot      one shot (ramp, orbit or scoop) blinks as each ball
//                   launches: make it inside 8 s for 5,000
//   C-L-A-W lanes   light all four for +1 multiplier (x5 max). Flipping
//                   rotates the lit lanes.
//   pop bumpers, slingshots, a spinner in the left orbit
//   left orbit / CLAW ramp   loop shots; chain them inside 4 s for COMBOs
//   drop targets    clear all three to light LOCK and ATTACK the other player
//   the CLAW        with LOCK lit, the ramp feeds the claw, which carries the
//                   ball to the prize chute. Two locked = MULTIBALL, with the
//                   JACKPOT on the ramp; three jackpots light the SUPER at the
//                   scoop.
//   the scoop       starts a mission (Pop Frenzy, Ramp Rush, Target Hunt, Claw
//                   Catch). Three missions done = CLAW CRAZE, the wizard mode:
//                   a ball added, everything x3, and an attack.
//   kickback        lit at the start, and again every 25 spinner spins: it
//                   kicks a ball back out of the left outlane
//   ball saver      6 s after every fresh ball
//   nudge / tilt    a flick bumps the table; three in a burst TILTs (dead
//                   flippers for 3 s)
//
// Draining is never game over: a new ball is back in a second, but the
// multiplier resets. Attacks the other player can be sent: BLOCKER (a bar over
// their targets), FREEZE (dead flippers 2 s), HEAVY (gravity up 6 s), MIRROR
// (flippers swapped 4 s). Each is announced 0.8 s before it lands.
//
// Physics is a small 2D solver of its own: balls, circles and segments, fixed
// 1/600 s substeps so a fast ball can't tunnel through a flipper. Ramps and the
// orbit are "habitrails": the ball leaves the playfield and rides a path. All
// speeds are per second (R1).
// ============================================================

import { state } from '../AppHost.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { registerMinigameCleanup } from '../claw-core/minigames/MinigameManager.js';

// ── Tunables ────────────────────────────────────────────────────────────────
export const GAME_TIME = 120;
const TW = 300, TH = 400;      // table units; shooter lane x 276–300
const R          = 7;
const GRAVITY    = 480;
const E_WALL     = 0.45, E_FLIP = 0.2;
const VMAX       = 1000;
const STEP       = 1 / 600;
const RESPAWN    = 1.0;
const LAUNCH     = [640, 720];
const SAVE_TIME  = 6;
const MAX_MULT   = 5;
const FLIP_LEN   = 48, FLIP_R = 6;
const FLIP_UP    = 22, FLIP_DOWN = 12;
const REST = 28 * Math.PI / 180, UP = -22 * Math.PI / 180;
const COMBO_WINDOW = 4;
const MISSION_TIME = 25;
const WIZARD_TIME  = 20;
const SKILL_TIME   = 8;
const SKILL_SHOTS  = ['ramp', 'orbit', 'scoop'];
const SCOOP_COOL   = 0.6;   // s after a kick-out before the scoop can catch again
const NUDGE_PX = 34, NUDGE_MS = 280;
const TILT_AT = 2.5, TILT_TIME = 3, TILT_DECAY = 0.7;   // three flicks inside about a second
const ATTACK_WARN = 0.8;
const ATTACKS = {
    blocker: { name: 'BLOCKER', time: 8 },
    freeze:  { name: 'FREEZE',  time: 2 },
    heavy:   { name: 'HEAVY',   time: 6 },
    mirror:  { name: 'MIRROR',  time: 4 },
};
const PTS = {
    bumper: 100, sling: 10, target: 250, targets: 3000, lane: 100, claw: 2000, skill: 5000,
    spin: 100, orbit: 750, ramp: 1000, combo: 2500, scoop: 1500, lock: 5000,
    jackpot: 20000, superJackpot: 60000, mission: 15000, kickback: 500,
};
const MISSIONS = [
    { key: 'pops',    name: 'POP FRENZY',  need: 10, hint: 'HIT THE BUMPERS' },
    { key: 'shots',   name: 'RAMP RUSH',   need: 3,  hint: 'RAMP OR ORBIT' },
    { key: 'targets', name: 'TARGET HUNT', need: 4,   hint: 'HIT THE TARGETS' },
    { key: 'lanes',   name: 'CLAW CATCH',  need: 4,  hint: 'ROLL THE LANES' },
];
const EDGE = 46;                // clear of the #mg-neutral pill (R1b)
const HUD  = 50;                // the dot-matrix display along the centre line

// ── Table geometry ──────────────────────────────────────────────────────────
function _chain(pts, extra = {}) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], ...extra });
    return out;
}
const OUTER = _chain([[0, 400], [0, 60], [4, 36], [14, 18], [30, 6], [50, 0], [250, 0], [270, 6], [286, 18], [296, 36], [300, 60], [300, 400], [276, 400], [276, 110]]);
const GUIDES = [
    ..._chain([[20, 262], [20, 300], [82, 348]]),        // left outlane / inlane
    ..._chain([[256, 262], [256, 300], [194, 348]]),     // right
];
const LANE_X  = [92, 124, 156, 188];
const POSTS   = [76, 108, 140, 172, 204].map(x => ({ a: [x, 28], b: [x, 50] }));
const WALLS   = [...OUTER, ...GUIDES, ...POSTS];
const SLINGS = [
    ..._chain([[40, 250], [40, 296], [70, 314]]), { a: [70, 314], b: [40, 250], kick: 0 },
    ..._chain([[236, 250], [236, 296], [206, 314]]), { a: [206, 314], b: [236, 250], kick: 1 },
];
const GATE     = { a: [276, 110], b: [300, 84] };
const BLOCKER  = { a: [22, 140], b: [22, 232] };
const TARGETS  = [152, 178, 204].map(y => ({ a: [5, y], b: [5, y + 18] }));
const BUMPERS  = [[104, 108], [172, 108], [138, 156]].map(([x, y]) => ({ x, y, r: 15 }));
const SCOOP    = { x: 138, y: 214, r: 9 };
const RAMP_IN  = { x0: 226, x1: 256, y0: 150, y1: 182 };
const ORBIT_IN = { x0: 0, x1: 26, y0: 104, y1: 138 };
const RAMP_PATH  = [[241, 166], [252, 110], [254, 50], [232, 20], [150, 14], [70, 20], [36, 56], [26, 140], [26, 230], [34, 290]];
const LOCK_PATH  = [[241, 166], [252, 110], [254, 50], [236, 26]];
const ORBIT_PATH = [[13, 122], [9, 60], [22, 22], [70, 8], [200, 8], [258, 24]];
const CHUTE  = { x: 44, y: 66 };
const CLAW_HOME = { x: 150, y: 20 };
const FLIPPERS = [
    { side: 0, px: 82,  py: 350, rest: REST,           up: UP },
    { side: 1, px: 194, py: 350, rest: Math.PI - REST, up: Math.PI - UP },
];

// ── Module state ────────────────────────────────────────────────────────────
let _done = false, _over = false, _onWin = null, _isBot = false, _botSkill = 0.55;
let _overlay = null, _canvas = null, _ctx = null, _dpr = 1, _W = 0, _H = 0;
let _af = null, _last = 0, _clock = GAME_TIME;
let _tables = null;
const _ptrs = new Map();     // pointerId → { pid, side, sx, sy, st, nudged }
const _cleanups = [];
const _timers   = [];

function _after(fn, ms) {
    const id = setTimeout(() => { _timers.splice(_timers.indexOf(id), 1); if (!_done) fn(); }, ms);
    _timers.push(id);
    return id;
}

function _newTable(pid) {
    return {
        pid, t: 0, score: 0, mult: 1,
        balls: [], rides: [], held: null, claw: null, respawn: 0.5, saveUntil: SAVE_TIME + 0.5,
        flips: FLIPPERS.map(f => ({ ...f, a: f.rest, w: 0 })),
        press: [0, 0], was: [false, false],
        botHold: [false, false], botAt: [0, 0], botUntil: [0, 0], botCool: [0, 0], botAim: [null, null],
        targets: [false, false, false], targetReset: 0,
        lanes: [false, false, false, false], skill: null, scoopCool: 0,
        lockLit: false, locks: 0, multiball: false, jackpots: 0, superLit: false,
        mission: null, missionIdx: 0, missionsDone: 0, wizardUntil: 0,
        kickback: true, spins: 0, spinAngle: 0, spinV: 0,
        combo: 0, comboUntil: 0,
        tiltMeter: 0, tiltUntil: 0,
        attack: null,                // { key, warn, left }
        flash: 0, flashCol: '#fff', shake: 0, msg: '', msgT: 0,
        lightT: { bump: [0, 0, 0], sling: [0, 0], ramp: 0, orbit: 0, scoop: 0 },
        pops: [], sparks: [],
        drains: 0, escapes: 0, saves: 0,
    };
}

// For QA probes.
export function _qa() {
    return { tables: _tables, clock: _clock, over: _over, ptrs: _ptrs.size, serve: _serve, attack: _attack, nudge: _nudge,
             // the balance lab: run tables faster than real time
             lab: { fresh: _newTable, update: _update, bot: _bot, setSkill: k => { _botSkill = k; }, setTables: ts => { _tables = ts; } } };
}

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
    if (neu) neu.textContent = 'HOLD LEFT · RIGHT TO FLIP · FLICK UP TO NUDGE';
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
    _overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none;background:#07060f;' +
        'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
    _canvas = document.createElement('canvas');
    _canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    _overlay.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');

    const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); _cleanups.push(() => el.removeEventListener(ev, fn, opts)); };
    on(_overlay, 'pointerdown', _press);
    // Moves and releases are heard on the window: a finger that slides off
    // the overlay still nudges and still lets its flipper go.
    on(window, 'pointermove', _move);
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
// zone, so any mix of fingers in all four zones can't strand or drop one.
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
    _ptrs.set(e.pointerId, { pid, side, sy: e.clientY, st: performance.now(), nudged: false });
    _tables[pid].press[side]++;
}

// A quick flick toward the far end of the table (up for P1, down the screen
// for P2) is a nudge. Once per finger.
function _move(e) {
    const p = _ptrs.get(e.pointerId);
    if (!p || p.nudged || _over) return;
    const up = p.pid === 0 ? p.sy - e.clientY : e.clientY - p.sy;
    if (up > NUDGE_PX && performance.now() - p.st < NUDGE_MS) { p.nudged = true; _nudge(_tables[p.pid]); }
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
        if (_isBot) _bot(_tables[1]);
        _tables.forEach(t => _update(t, dt));
        if (_clock <= 0) _end();
    } else _tables.forEach(t => _fx(t, dt));
    _draw();
}

const _inPlay = t => t.balls.length + t.rides.length + (t.held ? 1 : 0) + (t.claw?.ball ? 1 : 0);
const _flippersDead = t => t.t < t.tiltUntil || (t.attack && t.attack.key === 'freeze' && t.attack.warn <= 0);
const _mirrored = t => t.attack && t.attack.key === 'mirror' && t.attack.warn <= 0;
const _gravity = t => GRAVITY * (t.attack && t.attack.key === 'heavy' && t.attack.warn <= 0 ? 1.6 : 1);
const _wizard = t => t.t < t.wizardUntil;

function _fx(t, dt) {
    t.t += dt;
    if (t.msgT > 0) t.msgT -= dt;
    if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 2.5);
    if (t.shake > 0) t.shake = Math.max(0, t.shake - dt * 3);
    const L = t.lightT;
    L.bump = L.bump.map(v => Math.max(0, v - dt)); L.sling = L.sling.map(v => Math.max(0, v - dt));
    L.ramp = Math.max(0, L.ramp - dt); L.orbit = Math.max(0, L.orbit - dt); L.scoop = Math.max(0, L.scoop - dt);
    t.pops = t.pops.filter(p => (p.t += dt) < 0.9);
    t.sparks = t.sparks.filter(s => { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt; return s.t < s.life; });
    t.spinAngle += t.spinV * dt; t.spinV *= Math.pow(0.15, dt);
}

function _update(t, dt) {
    _fx(t, dt);
    t.tiltMeter = Math.max(0, t.tiltMeter - TILT_DECAY * dt);
    if (t.targetReset > 0 && (t.targetReset -= dt) <= 0) t.targets = [false, false, false];
    if (t.comboUntil && t.t > t.comboUntil) { t.combo = 0; t.comboUntil = 0; }
    if (t.skill && t.t > t.skill.until) t.skill = null;

    // Attacks land after their warning and run out.
    if (t.attack) {
        if (t.attack.warn > 0) { if ((t.attack.warn -= dt) <= 0) { _say(t, `${ATTACKS[t.attack.key].name}!`); t.shake = 0.6; sfx('slam'); } }
        else if ((t.attack.left -= dt) <= 0) t.attack = null;
    }
    // A mission against its clock.
    if (t.mission && t.t > t.mission.until) { _say(t, 'MISSION FAILED'); t.mission = null; sfx('land_bad'); }
    if (t.wizardUntil && t.t > t.wizardUntil) { t.wizardUntil = 0; _say(t, 'CLAW CRAZE OVER'); }

    // Flipper presses: the rising edge rotates the lit lanes.
    const dead = _flippersDead(t);
    const held = [0, 1].map(s => !dead && (t.press[s] > 0 || t.botHold[s]));
    const phys = _mirrored(t) ? [held[1], held[0]] : held;
    [0, 1].forEach(s => {
        if (phys[s] && !t.was[s]) _flipEdge(t, s);
        t.was[s] = phys[s];
    });

    // Serving.
    if (!_inPlay(t) && (t.respawn -= dt) <= 0) _serve(t);

    // Rides along the habitrails.
    t.rides = t.rides.filter(r => {
        r.t += dt / r.dur;
        if (r.t < 1) return true;
        r.done(t, r);
        return false;
    });

    // The scoop hold.
    if (t.held && (t.held.t -= dt) <= 0) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        t.balls.push({ x: SCOOP.x + dir * 6, y: SCOOP.y + SCOOP.r + R + 2, vx: dir * (170 + Math.random() * 60), vy: 120, inPlay: true });
        t.held = null;
        t.scoopCool = t.t + SCOOP_COOL;
        sfx('boost');
    }
    _clawStep(t, dt);

    // Substeps: flippers and balls advance together.
    let left = dt;
    const g = _gravity(t);
    while (left > 1e-6) {
        const h = Math.min(STEP, left);
        left -= h;
        t.flips.forEach(f => {
            const up = phys[f.side];
            const target = up ? f.up : f.rest;
            const prev = f.a, d = target - f.a;
            f.a += Math.sign(d) * Math.min(Math.abs(d), (up ? FLIP_UP : FLIP_DOWN) * h);
            f.w = (f.a - prev) / h;
        });
        for (let i = t.balls.length - 1; i >= 0; i--) _step(t, t.balls[i], h, g);
        if (t.balls.length > 1) _ballPairs(t.balls);
    }

    // A ball at rest somewhere other than a held flipper gets a nudge, so a
    // dead spot can never eat the clock.
    t.balls.forEach(b => {
        const sp = Math.hypot(b.vx, b.vy);
        b.still = sp < 6 && !phys[0] && !phys[1] && b.inPlay ? (b.still || 0) + dt : 0;
        if (b.still > 2.5) { b.vx += (Math.random() - 0.5) * 200; b.vy -= 160; b.still = 0; }
    });
}

function _serve(t) {
    t.balls.push({ x: 288, y: TH - R - 1, vx: 0, vy: -(LAUNCH[0] + Math.random() * (LAUNCH[1] - LAUNCH[0])), inPlay: false });
    t.skill = { shot: SKILL_SHOTS[Math.floor(Math.random() * SKILL_SHOTS.length)], until: t.t + SKILL_TIME };
    sfx('boost');
}

function _flipEdge(t, side) {
    sfx('swap');
    if (t.pid === 0 || !_isBot) haptic([6]);
    // Lane change: the lit letters shift the way you flipped.
    if (t.lanes.some(Boolean) && !t.lanes.every(Boolean)) {
        const l = t.lanes;
        t.lanes = side ? [l[3], l[0], l[1], l[2]] : [l[1], l[2], l[3], l[0]];
    }
}

function _step(t, b, h, g) {
    b.vy += g * h;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
    b.x += b.vx * h; b.y += b.vy * h;
    if (!b.inPlay && b.x < 268) b.inPlay = true;

    for (const s of WALLS) _hitSeg(b, s, 0, E_WALL);
    if (b.inPlay) _hitSeg(b, GATE, 0, E_WALL);
    if (t.attack?.key === 'blocker' && t.attack.warn <= 0) _hitSeg(b, BLOCKER, 3, E_WALL);
    for (const s of SLINGS) {
        const vn = _hitSeg(b, s, 0, E_WALL);
        if (s.kick !== undefined && vn < -40) {
            b.vx += _lastN[0] * 320; b.vy += _lastN[1] * 320;
            t.lightT.sling[s.kick] = 0.15;
            _score(t, PTS.sling, b.x, b.y, false);
            sfx('slam');
        }
    }
    TARGETS.forEach((s, i) => {
        if (_hitSeg(b, s, 0, 0.3) < -20 && !t.targets[i] && t.targetReset <= 0) _target(t, i);
    });
    BUMPERS.forEach((u, i) => {
        const dx = b.x - u.x, dy = b.y - u.y, d = Math.hypot(dx, dy);
        if (d < R + u.r && d > 0) {
            const nx = dx / d, ny = dy / d;
            b.x = u.x + nx * (R + u.r); b.y = u.y + ny * (R + u.r);
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
            b.vx += nx * 260; b.vy += ny * 260;
            if (t.lightT.bump[i] < 0.05) _bumper(t, i, u);
            t.lightT.bump[i] = 0.15;
        }
    });
    LANE_X.forEach((x, i) => {
        if (Math.abs(b.x - x) < 11 && Math.abs(b.y - 40) < 9 && b.laneHit !== i) { b.laneHit = i; _lane(t, i); }
    });
    if (b.y > 60) b.laneHit = -1;
    t.flips.forEach(f => _hitFlipper(b, f));

    // Shots: the ball leaves the playfield onto a habitrail.
    const inBox = (q, vyMax) => b.x > q.x0 && b.x < q.x1 && b.y > q.y0 && b.y < q.y1 && b.vy < vyMax;
    if (b.inPlay && inBox(RAMP_IN, -180)) return _ramp(t, b);
    if (b.inPlay && inBox(ORBIT_IN, -200)) return _orbit(t, b, Math.hypot(b.vx, b.vy));
    if (!t.held && t.t > t.scoopCool && Math.hypot(b.x - SCOOP.x, b.y - SCOOP.y) < SCOOP.r && Math.hypot(b.vx, b.vy) < 650) return _scoop(t, b);

    // Kickback out of the left outlane.
    if (t.kickback && b.x < 20 && b.y > 350 && b.vy > 0) {
        b.vy = -880; b.vx = 25; t.kickback = false;
        _score(t, PTS.kickback, 12, 330);
        _say(t, 'KICKBACK!'); sfx('boost'); _burst(t, 12, 360, '#7dffb0');
    }
    if (b.y > TH + 3 * R) _lose(t, b);
    else if (b.x < -30 || b.x > TW + 30 || b.y < -40) { _remove(t, b); t.escapes++; }
}

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
    const rr = R + FLIP_R - 2 * u;    // tapers to the tip
    const dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy);
    if (d >= rr || d === 0) return;
    const nx = dx / d, ny = dy / d;
    b.x = qx + nx * rr; b.y = qy + ny * rr;
    const rx = qx - f.px, ry = qy - f.py;
    const svx = -f.w * ry, svy = f.w * rx;     // the flipper's surface velocity there
    const vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
    if (vn < 0) { b.vx -= (1 + E_FLIP) * vn * nx; b.vy -= (1 + E_FLIP) * vn * ny; }
}

// Equal-mass elastic contact between balls in multiball.
function _ballPairs(balls) {
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= 2 * R || d === 0) continue;
        const nx = dx / d, ny = dy / d, push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny; }
    }
}

// ── Table events ────────────────────────────────────────────────────────────
function _score(t, pts, x, y, pop = true) {
    const got = pts * t.mult * (_wizard(t) ? 3 : 1);
    t.score += got;
    if (pop) t.pops.push({ x, y, text: `+${got.toLocaleString()}`, t: 0 });
    return got;
}
function _say(t, msg, time = 1.8) { t.msg = msg; t.msgT = time; }
function _flashT(t, col, k = 1) { t.flash = k; t.flashCol = col; }
function _burst(t, x, y, col, n = 14) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
        t.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.5 + Math.random() * 0.4, col });
    }
}
function _progress(t, key, n = 1) {
    const m = t.mission;
    if (!m || m.key !== key) return;
    if ((m.have += n) < m.need) return;
    t.mission = null;
    t.missionsDone++;
    _score(t, PTS.mission, 138, 200);
    _say(t, `${m.name} COMPLETE!`); _flashT(t, '#7dffb0'); sfx('bell'); haptic('heavy');
    if (t.missionsDone % 3 === 0) _wizardStart(t);
}

function _bumper(t, i, u) {
    _score(t, PTS.bumper * (t.mission?.key === 'pops' ? 3 : 1), u.x, u.y - 22);
    _burst(t, u.x, u.y, '#ffd23f', 6);
    sfx('coin_gain');
    _progress(t, 'pops');
}

function _target(t, i) {
    t.targets[i] = true;
    _score(t, PTS.target, 22, TARGETS[i].a[1] + 9);
    sfx('land_good');
    _progress(t, 'targets');
    if (!t.targets.every(Boolean)) return;
    t.targetReset = 0.6;
    _score(t, PTS.targets, 40, 190);
    if (!t.multiball && !t.lockLit) t.lockLit = true;
    _say(t, t.lockLit && !t.multiball ? 'LOCK IS LIT!' : 'TARGETS!');
    _attack(1 - t.pid);
}

function _lane(t, i) {
    _progress(t, 'lanes');
    if (t.lanes[i]) { _score(t, PTS.lane, LANE_X[i], 62); return; }
    t.lanes[i] = true;
    _score(t, PTS.lane, LANE_X[i], 62);
    sfx('react_go');
    if (t.lanes.every(Boolean)) {
        t.lanes = [false, false, false, false];
        _score(t, PTS.claw, 140, 70);
        if (t.mult < MAX_MULT) t.mult++;
        _say(t, `C-L-A-W!  x${t.mult}`); _flashT(t, '#ff8a3d'); sfx('bell');
    }
}

function _comboStep(t, x, y) {
    t.combo = t.t < t.comboUntil ? t.combo + 1 : 1;
    t.comboUntil = t.t + COMBO_WINDOW;
    if (t.combo >= 2) { _score(t, PTS.combo * (t.combo - 1), x, y); _say(t, `${t.combo}x COMBO!`, 1.2); }
}

function _skillCheck(t, shot, x, y) {
    if (!t.skill || t.skill.shot !== shot) return;
    t.skill = null;
    _score(t, PTS.skill, x, y - 16);
    _say(t, 'SKILL SHOT!'); _flashT(t, '#ffd23f'); sfx('bell');
}

function _remove(t, b) { const i = t.balls.indexOf(b); if (i >= 0) t.balls.splice(i, 1); }

function _pathAt(path, u) {
    const segs = path.length - 1, f = Math.min(segs - 1e-6, Math.max(0, u * segs)), i = Math.floor(f), k = f - i;
    const [ax, ay] = path[i], [bx, by] = path[i + 1];
    return [ax + (bx - ax) * k, ay + (by - ay) * k];
}

function _ramp(t, b) {
    _remove(t, b);
    t.lightT.ramp = 0.4;
    sfx('boost');
    _skillCheck(t, 'ramp', 241, 140);
    _progress(t, 'shots');
    _comboStep(t, 241, 140);
    if (t.multiball || _wizard(t)) {
        t.jackpots++;
        _score(t, PTS.jackpot, 200, 120);
        _say(t, 'JACKPOT!'); _flashT(t, '#ffd23f'); sfx('mg_win'); haptic('heavy');
        _burst(t, 240, 140, '#ffd23f', 30);
        if (t.jackpots % 3 === 0) { t.superLit = true; _say(t, 'SUPER JACKPOT IS LIT!'); }
    } else _score(t, PTS.ramp, 241, 140);
    if (t.lockLit && !t.multiball && !t.claw) {
        // The claw takes it.
        t.rides.push({ path: LOCK_PATH, t: 0, dur: 0.45, done: (tt, r) => _clawGrab(tt) });
        return;
    }
    t.rides.push({ path: RAMP_PATH, t: 0, dur: 0.9, done: tt => tt.balls.push({ x: 34, y: 290, vx: 30, vy: 60, inPlay: true }) });
}

function _orbit(t, b, speed) {
    _remove(t, b);
    t.lightT.orbit = 0.4;
    _skillCheck(t, 'orbit', 40, 120);
    const spins = Math.round(speed / 45);
    t.spinV = 40; t.spins += spins;
    _score(t, PTS.orbit + PTS.spin * spins, 40, 120);
    _progress(t, 'shots');
    _comboStep(t, 40, 100);
    if (t.spins >= 25 && !t.kickback) { t.spins = 0; t.kickback = true; _say(t, 'KICKBACK LIT'); }
    sfx('seq_lit');
    t.rides.push({ path: ORBIT_PATH, t: 0, dur: 0.6, done: tt => tt.balls.push({ x: 258, y: 28, vx: -170, vy: 40, inPlay: true }) });
}

function _scoop(t, b) {
    _remove(t, b);
    t.held = { t: 0.9 };
    t.lightT.scoop = 0.5;
    sfx('dice_land');
    _skillCheck(t, 'scoop', SCOOP.x, SCOOP.y);
    if (t.superLit) {
        t.superLit = false;
        _score(t, PTS.superJackpot, 138, 190);
        _say(t, 'SUPER JACKPOT!!'); _flashT(t, '#ffffff', 1.2); sfx('mg_win'); haptic('heavy');
        _burst(t, 138, 214, '#ffffff', 40);
        _attack(1 - t.pid);
        return;
    }
    if (!t.mission && !_wizard(t)) {
        const m = MISSIONS[t.missionIdx++ % MISSIONS.length];
        t.mission = { ...m, have: 0, until: t.t + MISSION_TIME };
        _say(t, `MISSION: ${m.name}`, 2.2);
        sfx('react_go');
        return;
    }
    _score(t, PTS.scoop, 138, 196);
}

// The claw: across the rail to the top of the ramp, down, grip, over to the
// prize chute, drop. The ball is out of play the whole way.
const CLAW_MOVES = [   // [x, y, seconds]: over, down, grip, across, down, home
    [236, 20, 0.35], [236, 30, 0.15], [236, 30, 0.15], [CHUTE.x, 20, 0.45], [CHUTE.x, 34, 0.2], [CLAW_HOME.x, CLAW_HOME.y, 0.4],
];
function _clawGrab(t) {
    t.claw = { phase: 0, t: 0, x: CLAW_HOME.x, y: CLAW_HOME.y, fx: CLAW_HOME.x, fy: CLAW_HOME.y, ball: true };
    sfx('swap');
}

function _clawStep(t, dt) {
    const c = t.claw;
    if (!c) return;
    c.t += dt;
    const [tx, ty, dur] = CLAW_MOVES[c.phase];
    const k = Math.min(1, c.t / dur), e = k * k * (3 - 2 * k);
    c.x = c.fx + (tx - c.fx) * e; c.y = c.fy + (ty - c.fy) * e;
    if (k < 1) return;
    c.t = 0; c.phase++; c.fx = c.x; c.fy = c.y;
    if (c.phase === 5) {
        c.ball = false;
        t.locks++;
        _score(t, PTS.lock, CHUTE.x, CHUTE.y + 30);
        sfx('dice_land');
        if (t.locks >= 2) _multiball(t);
        else { _say(t, `BALL ${t.locks} LOCKED`); t.lockLit = false; t.respawn = 0.3; }
    }
    if (c.phase >= CLAW_MOVES.length) t.claw = null;
}

function _multiball(t) {
    t.locks = 0; t.lockLit = false; t.multiball = true; t.jackpots = 0;
    t.saveUntil = t.t + 8;
    _say(t, 'MULTIBALL!', 2.2); _flashT(t, '#ff8a3d', 1.2); sfx('mg_win'); haptic('heavy');
    for (let i = 0; i < 2; i++) t.balls.push({ x: CHUTE.x + 6 * i, y: CHUTE.y + 10, vx: 90 + 40 * i, vy: 30, inPlay: true });
    t.balls.push({ x: 34, y: 290, vx: 30, vy: 60, inPlay: true });
}

function _wizardStart(t) {
    t.wizardUntil = t.t + WIZARD_TIME;
    t.mission = null;
    t.saveUntil = t.t + 8;
    _say(t, 'CLAW CRAZE!! x3', 2.4); _flashT(t, '#d07bff', 1.4); sfx('mg_win'); haptic('heavy');
    t.balls.push({ x: CLAW_HOME.x, y: 40, vx: 0, vy: 80, inPlay: true });
    _attack(1 - t.pid);
}

// A ball has gone down the middle or an outlane.
function _lose(t, b) {
    _remove(t, b);
    if (t.t < t.saveUntil) {
        t.saves++;
        _say(t, 'BALL SAVED!');
        sfx('shield');
        _serve(t);
        return;
    }
    if (_inPlay(t) > 0) {
        if (t.multiball && t.balls.length + t.rides.length <= 1 && !t.held) { t.multiball = false; _say(t, 'MULTIBALL OVER'); }
        return;
    }
    t.drains++;
    t.multiball = false; t.superLit = false;
    t.respawn = RESPAWN;
    t.saveUntil = t.t + RESPAWN + SAVE_TIME;
    t.shake = 1;
    _say(t, t.mult > 1 ? `DRAIN · x${t.mult} LOST` : 'DRAIN');
    t.mult = 1;
    t.targets = [false, false, false];
    sfx('land_bad');
    if (t.pid === 0 || !_isBot) haptic([30]);
}

function _nudge(t) {
    if (_over || t.t < t.tiltUntil) return;
    t.balls.forEach(b => { if (b.inPlay) { b.vy -= 170; b.vx += (Math.random() - 0.5) * 90; } });
    t.shake = 0.5;
    t.tiltMeter += 1;
    sfx('slam');
    if (t.pid === 0 || !_isBot) haptic([18]);
    if (t.tiltMeter >= TILT_AT) {
        t.tiltUntil = t.t + TILT_TIME; t.tiltMeter = 0;
        _say(t, 'TILT!', TILT_TIME); _flashT(t, '#ff3b3b'); sfx('land_bad');
    } else if (t.tiltMeter >= TILT_AT - 1) _say(t, 'DANGER!', 1);
}

// ── Attacks ─────────────────────────────────────────────────────────────────
function _attack(pid, key) {
    const t = _tables[pid];
    const keys = Object.keys(ATTACKS);
    key = key || keys[Math.floor(Math.random() * keys.length)];
    t.attack = { key, warn: ATTACK_WARN, left: ATTACKS[key].time };
    _say(t, `INCOMING: ${ATTACKS[key].name}`, ATTACK_WARN + 0.4);
    _say(_tables[1 - pid], `SENT ${ATTACKS[key].name}!`, 1.4);
    sfx('shield');
    if (pid === 0 || !_isBot) haptic([40, 40, 40]);
}

// ── Bot (§5) ────────────────────────────────────────────────────────────────
// Aims the way a player does: by WHEN it flips as the ball rolls along the
// flipper. Early (near the pivot) sends it up the middle to the scoop; late
// (toward the tip) sends it across the table, to the ramp off the left flipper
// and the orbit off the right. It picks the shot that's worth most right now,
// misjudges the moment by a skill-scaled amount, and sometimes whiffs. A ball
// about to go past the tip gets flipped at regardless. Under MIRROR it may
// press the wrong side.
const AIM = { scoop: 0.28, up: 0.5, cross: 0.74 };

function _botWant(t, side) {
    if ((t.lockLit || t.multiball || _wizard(t)) && side === 0) return 'cross';      // the ramp
    if (t.skill) return t.skill.shot === 'scoop' ? 'scoop' : (t.skill.shot === 'ramp') === (side === 0) ? 'cross' : 'up';
    if (!t.mission && !_wizard(t) && Math.random() < 0.35) return 'scoop';
    return Math.random() < 0.5 ? 'cross' : 'up';
}

function _bot(t) {
    t.flips.forEach((f, i) => {
        if (t.botHold[i]) { if (t.t >= t.botUntil[i]) { t.botHold[i] = false; t.botCool[i] = t.t + 0.2; t.botAim[i] = null; } return; }
        if (t.botAt[i]) {
            if (t.t >= t.botAt[i]) {
                t.botAt[i] = 0;
                const side = _mirrored(t) && Math.random() < _botSkill ? 1 - i : i;
                t.botHold[side] = true; t.botUntil[side] = t.t + 0.2 + Math.random() * 0.1;
            }
            return;
        }
        if (t.t < t.botCool[i]) return;
        // The ball on (or just above) this flipper, and how far along it is.
        const ex = Math.cos(f.rest), ey = Math.sin(f.rest);
        const b = t.balls.find(b => {
            if (!b.inPlay || b.vy < -60) return false;
            const u = ((b.x - f.px) * ex + (b.y - f.py) * ey) / FLIP_LEN;
            const off = Math.abs((b.x - f.px) * ey - (b.y - f.py) * ex);
            return u > -0.1 && u < 1.1 && off < R + FLIP_R + 10;
        });
        if (!b) { t.botAim[i] = null; return; }
        const u = ((b.x - f.px) * ex + (b.y - f.py) * ey) / FLIP_LEN;
        if (t.botAim[i] === null) {
            if (Math.random() < 0.36 - _botSkill * 0.33) { t.botCool[i] = t.t + 0.5; return; }   // whiff
            t.botAim[i] = AIM[_botWant(t, i)] + (1 - _botSkill) * 0.55 * (Math.random() - 0.5);
        }
        if (u >= t.botAim[i] || u > 0.9) t.botAt[i] = t.t + (1 - _botSkill) * 0.05 + Math.random() * 0.012;
    });
}

// ── Draw ────────────────────────────────────────────────────────────────────
function _hex(p) { return state.players?.[p]?.hex || (p ? '#3b9dff' : '#ff4d6d'); }
function _name(p) { return (state.players?.[p]?.name || (p ? 'P2' : 'P1')).toUpperCase(); }
const FONT = s => `bold ${s}px 'Bebas Neue', Impact, sans-serif`;
const DMD = '#ff8a2a';

function _layout() {
    const half = _H / 2;
    const s = Math.min((_W - 12) / TW, (half - EDGE - HUD - 4) / TH);
    return { s, ox: (_W - TW * s) / 2, oy: _H - EDGE - TH * s, half };
}

let _dots = null;
function _dotPattern() {
    if (_dots) return _dots;
    const c = document.createElement('canvas'); c.width = 3; c.height = 3;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(2, 0, 1, 3); g.fillRect(0, 2, 3, 1);
    return (_dots = _ctx.createPattern(c, 'repeat'));
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
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(0, _H / 2 - 1, _W, 2);
}

function _drawHalf(t, L) {
    const ctx = _ctx, col = _hex(t.pid), { s, ox, oy, half } = L;

    // Flipper zones: a faint wash under whichever side is held.
    [0, 1].forEach(side => {
        if (t.press[side] || t.botHold[side]) { ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(side ? _W / 2 : 0, half, _W / 2, half); }
    });
    if (t.flash > 0) { ctx.globalAlpha = t.flash * 0.25; ctx.fillStyle = t.flashCol; ctx.fillRect(0, half, _W, half); ctx.globalAlpha = 1; }

    _drawDMD(t, half);

    ctx.save();
    const sh = t.shake > 0 ? (Math.random() - 0.5) * 7 * t.shake : 0;
    ctx.translate(ox + sh, oy + (t.shake > 0 ? (Math.random() - 0.5) * 4 * t.shake : 0));
    ctx.scale(s, s);
    _drawTable(t, col);
    ctx.restore();

    // Flipper hints at the outer corners.
    ctx.font = FONT(15); ctx.textBaseline = 'middle';
    const dead = _flippersDead(t);
    [0, 1].forEach(side => {
        const on = t.press[side] || t.botHold[side];
        ctx.fillStyle = dead ? '#7fd8ff' : on ? '#fff' : 'rgba(255,255,255,.35)';
        ctx.textAlign = side ? 'right' : 'left';
        ctx.fillText(dead ? (t.t < t.tiltUntil ? 'TILT' : 'FROZEN') : side ? 'FLIP ▶' : '◀ FLIP', side ? _W - 10 : 10, _H - EDGE / 2);
    });

    // The big message, mid-table.
    if (t.msgT > 0 || _over) {
        const text = _over ? _result(t.pid) : t.msg;
        ctx.globalAlpha = _over ? 1 : Math.min(1, t.msgT * 2.5);
        const size = _over ? 40 : text.length > 16 ? 22 : 28;
        ctx.font = FONT(size); ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#07060f';
        const my = oy + TH * s * 0.47;
        ctx.strokeText(text, _W / 2, my); ctx.fillStyle = _over ? '#ffd23f' : '#fff'; ctx.fillText(text, _W / 2, my);
        ctx.globalAlpha = 1;
    }
}

// The dot-matrix display: score, clock and multiplier on top; what's going on
// underneath.
function _drawDMD(t, half) {
    const ctx = _ctx, x = 6, y = half + 3, w = _W - 12, h = HUD - 6;
    ctx.fillStyle = '#140800'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3a1c00'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = DMD;
    ctx.font = FONT(22); ctx.textAlign = 'left';
    ctx.fillText(t.score.toLocaleString(), x + 8, y + 14);
    ctx.textAlign = 'center'; ctx.fillStyle = _clock <= 10 ? '#ffe35a' : DMD;
    ctx.fillText(`${Math.ceil(_clock)}`, _W / 2, y + 14);
    ctx.textAlign = 'right'; ctx.fillStyle = DMD;
    ctx.fillText(`${_wizard(t) ? '3×' : ''}x${t.mult}`, x + w - 8, y + 14);

    ctx.font = FONT(14); ctx.textAlign = 'left';
    let line = _name(t.pid);
    if (_wizard(t)) line = `CLAW CRAZE ${Math.ceil(t.wizardUntil - t.t)}s · EVERYTHING x3`;
    else if (t.skill) line = `SKILL SHOT · HIT THE ${t.skill.shot.toUpperCase()} · ${Math.ceil(t.skill.until - t.t)}s`;
    else if (t.mission) line = `${t.mission.name} ${t.mission.have}/${t.mission.need} · ${Math.ceil(t.mission.until - t.t)}s · ${t.mission.hint}`;
    else if (t.multiball) line = `MULTIBALL · JACKPOT ON THE RAMP${t.superLit ? ' · SUPER AT THE SCOOP' : ''}`;
    else if (t.lockLit) line = `LOCK LIT · SHOOT THE CLAW RAMP (${t.locks}/2)`;
    else if (t.combo >= 2) line = `${t.combo}x COMBO`;
    else if (t.attack) line = t.attack.warn > 0 ? `INCOMING ${ATTACKS[t.attack.key].name}` : `${ATTACKS[t.attack.key].name} ${Math.ceil(t.attack.left)}s`;
    ctx.fillText(line, x + 8, y + h - 10);
    ctx.textAlign = 'right';
    const tilt = t.t < t.tiltUntil ? 'TILT' : t.tiltMeter >= TILT_AT - 1.2 ? 'DANGER' : '';
    if (tilt) { ctx.fillStyle = '#ff5a3a'; ctx.fillText(tilt, x + w - 8, y + h - 10); }
    ctx.fillStyle = _dotPattern(); ctx.fillRect(x, y, w, h);
}

function _drawTable(t, col) {
    const ctx = _ctx, now = t.t;
    const blink = on => on && Math.floor(now * 4) % 2 === 0;

    // Bed, with a grid of art-deco lines.
    ctx.fillStyle = '#12112e';
    ctx.beginPath(); ctx.moveTo(0, 400); ctx.lineTo(0, 60);
    ctx.quadraticCurveTo(0, 0, 50, 0); ctx.lineTo(250, 0); ctx.quadraticCurveTo(300, 0, 300, 60);
    ctx.lineTo(300, 400); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
    for (let i = -400; i < 400; i += 22) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 400, 400); ctx.stroke(); }
    // The CLAW logo, printed on the playfield.
    ctx.font = FONT(46); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillText('CLAW', 138, 272);
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(0, 400); ctx.lineTo(0, 60);
    ctx.quadraticCurveTo(0, 0, 50, 0); ctx.lineTo(250, 0); ctx.quadraticCurveTo(300, 0, 300, 60); ctx.lineTo(300, 400);
    ctx.stroke(); ctx.shadowBlur = 0;

    const seg = (list, w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = 'round';
        list.forEach(q => { ctx.beginPath(); ctx.moveTo(q.a[0], q.a[1]); ctx.lineTo(q.b[0], q.b[1]); ctx.stroke(); }); };
    seg(OUTER.slice(-3), 3, '#8a8ac0');
    seg(GUIDES, 3, '#8a8ac0');
    seg(POSTS, 4, '#b8b8e0');
    if (t.balls.some(b => b.inPlay)) seg([GATE], 3, '#8a8ac0');

    // Habitrails: the orbit and the CLAW ramp, as glass tubes.
    const tube = (path, c, lit) => {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = lit ? c : 'rgba(255,255,255,.10)'; ctx.lineWidth = 15;
        ctx.beginPath(); path.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5; ctx.stroke();
    };
    tube(ORBIT_PATH, 'rgba(125,255,176,.35)', t.lightT.orbit > 0);
    tube(RAMP_PATH, 'rgba(255,138,61,.35)', t.lightT.ramp > 0);

    // Ramp mouth, with its insert arrow and what it's worth right now.
    const rampHot = t.multiball || _wizard(t) || t.lockLit || t.skill?.shot === 'ramp';
    ctx.fillStyle = '#2a1840'; ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(RAMP_IN.x0, RAMP_IN.y0, RAMP_IN.x1 - RAMP_IN.x0, RAMP_IN.y1 - RAMP_IN.y0); ctx.fill(); ctx.stroke();
    _arrow(241, 196, blink(rampHot) || t.lightT.ramp > 0 ? '#ff8a3d' : 'rgba(255,138,61,.3)');
    ctx.font = FONT(9); ctx.fillStyle = '#ffc89a'; ctx.textAlign = 'center';
    ctx.fillText(t.multiball || _wizard(t) ? 'JACKPOT' : t.lockLit ? 'LOCK' : 'CLAW', 241, 210);
    // Orbit mouth and the spinner.
    _arrow(13, 154, blink((t.combo >= 1 && t.t < t.comboUntil) || t.skill?.shot === 'orbit') || t.lightT.orbit > 0 ? '#7dffb0' : 'rgba(125,255,176,.3)');
    const sw = Math.abs(Math.cos(t.spinAngle)) * 9;
    ctx.fillStyle = '#ddd'; ctx.fillRect(13 - sw, 118, sw * 2, 4);

    // The prize chute with its locked balls.
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(CHUTE.x - 14, CHUTE.y - 16, 28, 32);
    ctx.font = FONT(8); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText('PRIZES', CHUTE.x, CHUTE.y - 21);
    for (let i = 0; i < t.locks; i++) _ball(CHUTE.x - 5 + i * 10, CHUTE.y + 8);

    // Slingshots.
    [[SLINGS.slice(0, 3), 0], [SLINGS.slice(3, 6), 1]].forEach(([tri, i]) => {
        ctx.beginPath(); ctx.moveTo(tri[0].a[0], tri[0].a[1]);
        tri.forEach(q => ctx.lineTo(q.b[0], q.b[1]));
        ctx.closePath();
        ctx.fillStyle = t.lightT.sling[i] > 0 ? '#fff' : '#2c2c66'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    });

    // Pop bumpers.
    BUMPERS.forEach((u, i) => {
        const lit = t.lightT.bump[i] > 0, frenzy = t.mission?.key === 'pops';
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r + (lit ? 3 : 0), 0, Math.PI * 2);
        ctx.fillStyle = lit ? '#fff' : frenzy && blink(true) ? '#ff8a3d' : '#ffd23f'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#3a2a00'; ctx.stroke();
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#3a2a00'; ctx.fill();
    });

    // C-L-A-W lanes.
    'CLAW'.split('').forEach((ch, i) => {
        const x = LANE_X[i], lit = t.lanes[i];
        ctx.beginPath(); ctx.arc(x, 40, 8, 0, Math.PI * 2);
        ctx.fillStyle = lit ? '#ff8a3d' : 'rgba(255,138,61,.12)'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#ff8a3d'; ctx.stroke();
        ctx.font = FONT(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = lit ? '#1a0a00' : '#ff8a3d'; ctx.fillText(ch, x, 41);
    });

    // Drop targets: orange, or white with a tick.
    TARGETS.forEach((q, i) => {
        ctx.fillStyle = t.targets[i] ? '#fff' : '#ff8a3d';
        ctx.fillRect(0, q.a[1], 7, 18);
        if (t.targets[i]) { ctx.fillStyle = '#12112e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✓', 3.5, q.a[1] + 9); }
    });
    ctx.save(); ctx.translate(16, 190); ctx.rotate(-Math.PI / 2);
    ctx.font = FONT(10); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText(t.multiball ? 'ATTACK' : 'LOCK + ATTACK', 0, 0); ctx.restore();

    // The scoop and its mission lights.
    ctx.beginPath(); ctx.arc(SCOOP.x, SCOOP.y, SCOOP.r + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#05040c'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = (t.superLit || t.skill?.shot === 'scoop') && blink(true) ? '#fff' : t.lightT.scoop > 0 ? '#7dffb0' : '#d07bff'; ctx.stroke();
    for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(SCOOP.x - 14 + i * 14, SCOOP.y + 20, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = i < t.missionsDone % 3 ? '#d07bff' : 'rgba(208,123,255,.2)'; ctx.fill();
    }
    ctx.font = FONT(9); ctx.fillStyle = '#d07bff'; ctx.textAlign = 'center';
    ctx.fillText(t.superLit ? 'SUPER' : t.mission ? t.mission.name : 'MISSION', SCOOP.x, SCOOP.y - 17);

    // The blocker, striped, while it's up.
    if (t.attack?.key === 'blocker' && t.attack.warn <= 0) {
        const { a, b } = BLOCKER;
        ctx.fillStyle = '#ff3b3b'; ctx.fillRect(a[0] - 4, a[1], 8, b[1] - a[1]);
        ctx.fillStyle = '#fff';
        for (let y = a[1]; y < b[1]; y += 12) ctx.fillRect(a[0] - 4, y, 8, 5);
    }

    // Kickback and ball-save lights.
    ctx.font = FONT(9); ctx.textAlign = 'center';
    ctx.fillStyle = t.kickback ? '#7dffb0' : 'rgba(125,255,176,.2)'; ctx.fillText('KICK', 10, 342);
    const saving = t.t < t.saveUntil;
    ctx.fillStyle = saving && (t.saveUntil - t.t > 2 || blink(true)) ? '#7fd8ff' : 'rgba(127,216,255,.15)';
    ctx.font = FONT(11); ctx.fillText('SHOOT AGAIN', 138, 392);

    // Flippers (iced while frozen).
    const dead = _flippersDead(t);
    t.flips.forEach(f => {
        const tx = f.px + Math.cos(f.a) * FLIP_LEN, ty = f.py + Math.sin(f.a) * FLIP_LEN;
        ctx.lineCap = 'round';
        ctx.lineWidth = FLIP_R * 2; ctx.strokeStyle = dead ? '#7fd8ff' : col;
        ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.lineWidth = FLIP_R; ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tx, ty); ctx.stroke();
    });
    if (_mirrored(t)) { ctx.font = FONT(12); ctx.fillStyle = '#ff9bf0'; ctx.fillText('⇄ MIRROR ⇄', 138, 378); }

    // Balls on the playfield, then riding the rails (bigger: they're up high).
    t.balls.forEach(b => _ball(b.x, b.y));
    t.rides.forEach(r => { const [x, y] = _pathAt(r.path, r.t); _ball(x, y, 1.25); });
    if (t.held) _ball(SCOOP.x, SCOOP.y, 0.9);
    if (!_inPlay(t) && !_over) {
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = FONT(13); ctx.textAlign = 'center';
        ctx.fillText('NEW BALL…', 238, 380);
    }

    // The claw, on its rail across the top.
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, 12); ctx.lineTo(250, 12); ctx.stroke();
    const c = t.claw || { x: CLAW_HOME.x, y: CLAW_HOME.y, phase: -1, ball: false };
    const open = c.phase < 2 || c.phase >= 5;
    ctx.strokeStyle = '#c9c9d9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x, 12); ctx.lineTo(c.x, c.y - 4); ctx.stroke();
    ctx.fillStyle = '#c9c9d9'; ctx.fillRect(c.x - 6, 9, 12, 5);
    const spread = open ? 7 : 4;
    ctx.lineWidth = 2.5;
    [-1, 1].forEach(d => { ctx.beginPath(); ctx.moveTo(c.x, c.y - 4); ctx.lineTo(c.x + d * spread, c.y + 3); ctx.lineTo(c.x + d * (spread - 3), c.y + 8); ctx.stroke(); });
    if (c.ball) _ball(c.x, c.y + 5);

    // Sparks and score pops.
    t.sparks.forEach(p => { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.col; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.font = FONT(14);
    t.pops.forEach(p => { ctx.globalAlpha = 1 - p.t / 0.9; ctx.fillStyle = '#fff'; ctx.fillText(p.text, p.x, p.y - p.t * 30); });
    ctx.globalAlpha = 1;
}

function _arrow(x, y, c) {
    const ctx = _ctx;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y + 4); ctx.lineTo(x - 7, y + 4); ctx.closePath(); ctx.fill();
}

function _ball(x, y, k = 1) {
    const ctx = _ctx, r = R * k;
    if (k > 1) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2); ctx.fill(); }
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, '#fff'); g.addColorStop(1, '#8e98ad');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
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
    _after(() => _finish(winner, [a, b]), 2800);
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
    _ctx = null; _canvas = null; _dots = null;
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _last = 0;
}
