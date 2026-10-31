// ============================================================
// STOP THE CLOCK — five targets, one STOP button, and the clock goes dark.
//
// Each round names a time (3.0–9.9 s). The clock starts, counts up in plain
// sight for a second or so, then goes dark: tap STOP when you think the target
// has come round. Every 0.002 s off costs a point from 1000 a round, so 0.25 s
// off scores 875 and two seconds scores nothing.
//
// Online only (SoloArena): every phone gets the same five targets and the same
// moment the clock goes dark, from the round's seed.
// ============================================================
import * as Solo from '../claw-core/minigames/SoloArena.js';
import { registerMinigameCleanup } from '../claw-core/minigames/MinigameManager.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { mount, button, neutral, finishSolo, notSolo } from './PhoneGame.js';

const ROUNDS = 5;
const READY_MS = 1300, LATE_MS = 3000, RESULT_MS = 1600;

let _done = true, _ui = null, _raf = 0, _timers = [];
let _round = 0, _total = 0, _phase = '', _t0 = 0, _target = 0, _dark = 0;
let _clock = null, _big = null, _sub = null, _stop = null, _head = null;

/** What this phone has banked so far. */
export function soloScore() { return _total; }

export function start(isBot, onWin) {
    if (notSolo(onWin)) return;
    _done = false; _round = 0; _total = 0; _timers = [];
    registerMinigameCleanup(_destroy);
    _ui = mount('radial-gradient(circle at 50% 35%, #3a1d5c, #160a26)');
    const { el, root } = _ui;
    _head = el('font-size:16px;letter-spacing:2px;opacity:.85;');
    _big = el('font-size:30px;line-height:1.1;', root);
    _big.className = 'bfont';
    _clock = el('font-size:min(30vw,150px);line-height:1;font-variant-numeric:tabular-nums;color:#ffd23f;text-shadow:0 6px 0 #2b1240;', root);
    _clock.className = 'bfont';
    _sub = el('font-size:18px;min-height:2.6em;');
    _stop = button(root, 'STOP', '#ff5fa2', _press);
    _stop.style.minWidth = '220px'; _stop.style.fontSize = '44px';
    _next();
}

function _destroy() {
    _done = true;
    cancelAnimationFrame(_raf);
    _timers.forEach(clearTimeout); _timers = [];
    _ui?.root.remove(); _ui = null;
}
const _after = (fn, ms) => _timers.push(setTimeout(() => { if (!_done) fn(); }, ms));

function _next() {
    _round++;
    if (_round > ROUNDS) return _end();
    // From the shared seed: the target, and when the clock goes dark.
    _target = 3 + Math.floor(Solo.draw(_round * 10) * 70) / 10;
    _dark = 0.9 + Solo.draw(_round * 10 + 1) * 0.9;
    _phase = 'ready';
    _head.textContent = `ROUND ${_round} OF ${ROUNDS} · ${_total} PTS`;
    _big.textContent = `STOP AT ${_target.toFixed(1)}s`;
    _clock.textContent = '0.00';
    _sub.textContent = 'Get ready…';
    _stop.disabled = true; _stop.style.opacity = '.45';
    neutral(`STOP AT ${_target.toFixed(1)}s`);
    sfx('countdown');
    _after(() => {
        _phase = 'run'; _t0 = performance.now();
        _stop.disabled = false; _stop.style.opacity = '1';
        _sub.textContent = 'The clock goes dark soon. Keep counting!';
        sfx('go');
        _raf = requestAnimationFrame(_tick);
    }, READY_MS);
}

function _tick() {
    if (_done || _phase !== 'run') return;
    const t = (performance.now() - _t0) / 1000;
    _clock.textContent = t < _dark ? t.toFixed(2) : '?.??';
    if (t > _target + LATE_MS / 1000) return _press();     // asleep: scored as the latest
    _raf = requestAnimationFrame(_tick);
}

function _press() {
    if (_phase !== 'run') return;
    _phase = 'result';
    cancelAnimationFrame(_raf);
    const t = (performance.now() - _t0) / 1000;
    const off = Math.abs(t - _target);
    const pts = Math.max(0, 1000 - Math.round(off * 500));
    _total += pts;
    _stop.disabled = true; _stop.style.opacity = '.45';
    _clock.textContent = t.toFixed(2);
    _sub.innerHTML = `${off < 0.05 ? '🎯 BULLSEYE! ' : ''}Off by <b>${off.toFixed(2)}s</b> · <b style="color:#4ade80">+${pts}</b>`;
    _head.textContent = `ROUND ${_round} OF ${ROUNDS} · ${_total} PTS`;
    sfx(off < 0.25 ? 'land_good' : 'land_bad'); haptic([20]);
    _after(_next, RESULT_MS);
}

function _end() {
    _phase = 'over';
    _big.textContent = 'TIME!';
    _clock.textContent = String(_total);
    _sub.textContent = 'points';
    _stop.style.display = 'none';
    sfx('mg_win');
    finishSolo(_total, `${_total} POINTS`, _destroy);
}

export function _debugState() { return { round: _round, phase: _phase, target: _target, dark: _dark, total: _total }; }
